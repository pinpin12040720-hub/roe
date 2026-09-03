/* 星慾姬絆 週期登錄表
   內容是公開的：任何人打開都看得到週期與留言，資料就是 data/cycles.json。
   編輯功能藏在管理員密碼後面 —— 但要講清楚，這道門只擋 UI：
   站上真正的內容由 repo 裡的 cycles.json 決定，所以實際的修改權限
   等於 git push 權限。管理員在自己瀏覽器改完後匯出 JSON、commit，才會影響別人。 */

const DATA_URL = 'data/cycles.json';
const LS_KEY = 'roe-cycles-draft-v1';   // 管理員尚未匯出的草稿
const LS_ADMIN = 'roe-cycles-admin-v1'; // 這台瀏覽器已通過管理員驗證
const PBKDF2_ITER = 250000;
const ADMIN_SALT = 'roe-cycles-admin';  // 固定 salt，只為了讓暴力破解變貴

// 管理員密碼的 PBKDF2-SHA256 雜湊（hex）。空字串＝尚未設定，編輯功能停用。
const ADMIN_HASH = '';

const WD = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];

let db = null;            // 目前資料
let published = null;     // 站上那份（data/cycles.json），用來判斷草稿有沒有差異
let isAdmin = false;
let editingId = null;     // 正在編輯的項目 id；null = 新增
const openComments = new Set();   // 展開留言的項目 id

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- 管理員密碼驗證 ---------- */

// PBKDF2-SHA256 導出 32 bytes，輸出 hex。刻意用高迭代數讓暴力破解變貴，
// 但這終究是前端驗證：擋得住手滑，擋不住決心。真正的權限是 git push。
async function hashPassword(password) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(ADMIN_SALT),
      iterations: PBKDF2_ITER, hash: 'SHA-256' },
    base, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkPassword(password) {
  if (!ADMIN_HASH) return false;
  return await hashPassword(password) === ADMIN_HASH;
}

/* ---------- 資料層 ---------- */

function blankEntry() {
  return {
    id: 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: '', category: '', weekdays: [], openTime: '',
    durationDays: null, durationHours: null, lastSeen: '',
    note: '', raw: '', archived: false, comments: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

// 補齊缺欄位，容忍手改過的 JSON
function migrate(data) {
  const out = {
    schema: 'cycles-v1',
    title: data.title || '週期登錄表',
    note: data.note || '',
    updatedAt: data.updatedAt || '',
    entries: [],
  };
  const list = Array.isArray(data.entries) ? data.entries : [];
  out.entries = list.map(e => {
    const b = blankEntry();
    const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
    return {
      ...b, ...e,
      id: e.id || b.id,
      name: String(e.name || ''),
      category: String(e.category || ''),
      weekdays: (Array.isArray(e.weekdays) ? e.weekdays : []).map(Number).filter(n => n >= 1 && n <= 7),
      openTime: String(e.openTime || ''),
      durationDays: num(e.durationDays),
      durationHours: num(e.durationHours),
      lastSeen: String(e.lastSeen || ''),
      note: String(e.note || ''),
      raw: String(e.raw || ''),
      archived: !!e.archived,
      comments: (Array.isArray(e.comments) ? e.comments : []).map(c => ({
        id: c.id || 'm-' + Math.random().toString(36).slice(2, 8),
        text: String(c.text || ''),
        at: c.at || new Date().toISOString(),
      })),
    };
  });
  return out;
}

// 只有管理員會產生草稿；訪客不寫入任何東西
function save() {
  if (!isAdmin) return;
  db.updatedAt = new Date().toISOString().slice(0, 10);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
  } catch (err) {
    note('草稿存檔失敗（瀏覽器儲存空間可能已滿）：' + err.message);
  }
}

function entry(id) { return db.entries.find(e => e.id === id); }

/* ---------- 週期推算 ---------- */

function isoDay(d) { return ((d.getDay() + 6) % 7) + 1; }   // 1=週一 … 7=週日

function durMs(e) {
  return ((e.durationDays || 0) * 24 + (e.durationHours || 0)) * 3600e3;
}

// 回傳 {status:'live'|'upcoming'|'unknown', start, end}
function schedule(e, now = Date.now()) {
  const wds = e.weekdays || [];
  if (!wds.length) return { status: 'unknown' };
  const [hh, mm] = (e.openTime || '00:00').split(':').map(n => Number(n) || 0);
  const span = durMs(e);
  let live = null, next = null;

  for (let d = -8; d <= 15; d++) {
    const t = new Date(now);
    t.setDate(t.getDate() + d);
    t.setHours(hh, mm, 0, 0);
    if (!wds.includes(isoDay(t))) continue;
    const start = t.getTime();
    const end = start + span;
    // 持續時間長到跨過下一個開放日時，場次會重疊；取最近開始的那場，
    // 它的結束時間才是實際還剩多久（所以這裡不 break，讓後面的覆蓋前面的）
    if (span > 0 && start <= now && now < end) live = { start, end };
    if (!next && start > now) next = { start, end };
  }
  if (live) return { status: 'live', ...live };
  if (next) return { status: 'upcoming', ...next };
  return { status: 'unknown' };
}

function fmtDur(ms) {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} 天 ${h} 小時`;
  if (h > 0) return `${h} 小時 ${m} 分`;
  return `${m} 分`;
}

function fmtWhen(ts) {
  const t = new Date(ts);
  const hm = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
  return `${t.getMonth() + 1}/${t.getDate()}（${WD[isoDay(t)]}）${hm}`;
}

function nextHtml(e) {
  const s = schedule(e);
  if (s.status === 'unknown') {
    return `<span class="lbl">下次開放</span>尚未設定開放星期`;
  }
  if (s.status === 'live') {
    return `<span class="lbl">進行中</span>剩 ${fmtDur(s.end - Date.now())}　·　${fmtWhen(s.end)} 結束`;
  }
  const left = s.start - Date.now();
  return `<span class="lbl">下次開放</span>${fmtWhen(s.start)}　·　還有 ${fmtDur(left)}`;
}

/* ---------- 畫面 ---------- */

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function visible() {
  const q = $('#q').value.trim().toLowerCase();
  const cat = $('#filter-cat').value;
  const arch = $('#show-archived').checked;
  return db.entries.filter(e => {
    if (!arch && e.archived) return false;
    if (cat && e.category !== cat) return false;
    if (!q) return true;
    const hay = [e.name, e.category, e.note, e.raw, ...e.comments.map(c => c.text)]
      .join(' ').toLowerCase();
    return hay.includes(q);
  });
}

const RANK = { live: 0, upcoming: 1, unknown: 2 };

function render() {
  const list = visible().sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    const sa = schedule(a), sb = schedule(b);
    if (RANK[sa.status] !== RANK[sb.status]) return RANK[sa.status] - RANK[sb.status];
    if (sa.start && sb.start) return sa.start - sb.start;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });

  $('#list').innerHTML = list.map(cardHtml).join('');
  $('#empty').hidden = list.length > 0;
  refreshCats();
  showDraftBadge();
}

function cardHtml(e) {
  const s = schedule(e);
  const wd = e.weekdays.length ? e.weekdays.slice().sort().map(n => WD[n]).join('、') : '—';
  const dur = durMs(e) > 0 ? fmtDur(durMs(e)) : '—';
  const open = openComments.has(e.id);

  return `<article class="card ${s.status === 'live' ? 'live' : ''} ${e.archived ? 'archived' : ''}" data-id="${e.id}">
    <div class="top">
      <div class="nm">${esc(e.name) || '（未命名）'}</div>
      ${e.category ? `<span class="cat">${esc(e.category)}</span>` : ''}
    </div>
    <div class="when">
      <span>開放：<b>${esc(wd)}</b>${e.openTime ? ' ' + esc(e.openTime) : ''}</span>
      <span>持續：<b>${dur}</b></span>
      ${e.lastSeen ? `<span>最近：<b>${esc(e.lastSeen)}</b></span>` : ''}
    </div>
    <div class="next ${s.status}">${nextHtml(e)}</div>
    ${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}
    ${e.raw ? `<div class="raw">原始筆記：${esc(e.raw)}</div>` : ''}
    <div class="acts">
      ${isAdmin ? `<button class="btn small" data-act="edit">編輯</button>
      <button class="btn small" data-act="dup">複製</button>` : ''}
      <button class="btn small" data-act="toggle-cm">留言 ${e.comments.length ? `(${e.comments.length})` : ''}</button>
      ${isAdmin ? `<button class="btn small danger" data-act="del">刪除</button>` : ''}
    </div>
    ${open ? commentsHtml(e) : ''}
  </article>`;
}

function commentsHtml(e) {
  const items = e.comments.length
    ? e.comments.map(c => `<div class="cm-item" data-cid="${c.id}">
        <div class="meta"><span>${esc(new Date(c.at).toLocaleString('zh-TW', { hour12: false }))}</span>
        ${isAdmin ? `<button class="del" data-act="del-cm" title="刪除這則留言">刪除</button>` : ''}</div>
        <div class="txt">${esc(c.text)}</div>
      </div>`).join('')
    : `<div class="cm-none">還沒有留言。</div>`;

  const form = isAdmin ? `<div class="cm-form">
      <textarea rows="1" placeholder="記下這期的觀察…（Ctrl+Enter 送出）" data-role="cm-input"></textarea>
      <button class="btn small primary" data-act="add-cm">送出</button>
    </div>` : '';

  return `<div class="cm">
    <div class="cm-list">${items}</div>
    ${form}
  </div>`;
}

// 只更新倒數，避免蓋掉正在輸入的留言
function tick() {
  $$('.card').forEach(card => {
    const e = entry(card.dataset.id);
    if (!e) return;
    const box = $('.next', card);
    const s = schedule(e);
    box.className = 'next ' + s.status;
    box.innerHTML = nextHtml(e);
    card.classList.toggle('live', s.status === 'live');
  });
}

function refreshCats() {
  const cats = [...new Set(db.entries.map(e => e.category).filter(Boolean))].sort();
  const sel = $('#filter-cat'), cur = sel.value;
  sel.innerHTML = '<option value="">全部分類</option>' +
    cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  sel.value = cats.includes(cur) ? cur : '';
  $('#cat-list').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
}

function note(msg) {
  const el = $('#status');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(note._t);
  note._t = setTimeout(() => { el.hidden = true; }, 5000);
}

/* ---------- 編輯 ---------- */

function buildWeekdayBoxes() {
  $('#f-weekdays').innerHTML = [1, 2, 3, 4, 5, 6, 7].map(n =>
    `<label><input type="checkbox" value="${n}">${WD[n]}</label>`).join('');
}

function openEdit(id) {
  editingId = id;
  const e = id ? entry(id) : blankEntry();
  $('#dlg-title').textContent = id ? '編輯項目' : '新增項目';
  $('#f-name').value = e.name;
  $('#f-category').value = e.category;
  $('#f-openTime').value = e.openTime;
  $('#f-durationDays').value = e.durationDays ?? '';
  $('#f-durationHours').value = e.durationHours ?? '';
  $('#f-lastSeen').value = e.lastSeen;
  $('#f-archived').checked = e.archived;
  $('#f-note').value = e.note;
  $('#f-raw').value = e.raw;
  $$('#f-weekdays input').forEach(cb => { cb.checked = e.weekdays.includes(Number(cb.value)); });
  if (!id) openEdit._draft = e;
  $('#dlg').showModal();
  $('#f-name').focus();
}

function commitEdit() {
  const name = $('#f-name').value.trim();
  if (!name) return;
  const numOrNull = sel => {
    const v = $(sel).value.trim();
    return v === '' ? null : Number(v);
  };
  const patch = {
    name,
    category: $('#f-category').value.trim(),
    openTime: $('#f-openTime').value,
    durationDays: numOrNull('#f-durationDays'),
    durationHours: numOrNull('#f-durationHours'),
    lastSeen: $('#f-lastSeen').value,
    archived: $('#f-archived').checked,
    note: $('#f-note').value.trim(),
    raw: $('#f-raw').value.trim(),
    weekdays: $$('#f-weekdays input:checked').map(cb => Number(cb.value)).sort(),
    updatedAt: new Date().toISOString(),
  };
  if (editingId) {
    Object.assign(entry(editingId), patch);
  } else {
    db.entries.push({ ...openEdit._draft, ...patch });
  }
  save();
  render();
}

/* ---------- JSON 匯出／匯入 ---------- */

function jsonText() {
  return JSON.stringify({ ...db, schema: 'cycles-v1' }, null, 2) + '\n';
}

function download(text, filename) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function doExport() {
  download(jsonText(), 'cycles.json');
  note('已匯出 cycles.json；覆蓋 web/cycles/data/cycles.json 再 commit，站上內容才會更新。');
}

async function doCopy() {
  try {
    await navigator.clipboard.writeText(jsonText());
    note('JSON 已複製到剪貼簿。');
  } catch (err) {
    note('複製失敗（瀏覽器擋下剪貼簿權限），請改用「匯出 JSON 檔」。');
  }
}

function doImport(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const parsed = JSON.parse(fr.result);
      if (!Array.isArray(parsed.entries)) throw new Error('JSON 裡找不到 entries 陣列');
      if (!confirm(`匯入 ${parsed.entries.length} 筆資料，將覆蓋目前內容。確定嗎？`)) return;
      db = migrate(parsed);
      save();
      render();
      note(`已匯入 ${db.entries.length} 筆。`);
    } catch (err) {
      note('匯入失敗：' + err.message);
    }
  };
  fr.readAsText(file);
}

/* ---------- 事件 ---------- */

function bind() {
  $('#q').addEventListener('input', render);
  $('#filter-cat').addEventListener('change', render);
  $('#show-archived').addEventListener('change', render);
  $('#btn-new').addEventListener('click', () => openEdit(null));

  $('#dlg').addEventListener('close', () => {
    if ($('#dlg').returnValue === 'save') commitEdit();
  });

  // 資料選單
  const menu = $('#more-menu');
  $('#btn-more').addEventListener('click', ev => {
    ev.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', () => { menu.hidden = true; });
  menu.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    menu.hidden = true;
    if (act === 'export') doExport();
    if (act === 'copy') doCopy();
    if (act === 'import') $('#file-input').click();
    if (act === 'logout') {
      isAdmin = false;
      try { localStorage.removeItem(LS_ADMIN); } catch (err) { /* ignore */ }
      applyRole();
      render();
      note('已登出管理員。草稿仍留在這台瀏覽器，再次登入就會看到。');
    }
    if (act === 'reload') {
      if (!confirm('捨棄尚未匯出的草稿，改用站上版本？')) return;
      try { localStorage.removeItem(LS_KEY); } catch (err) { /* ignore */ }
      db = migrate(structuredClone(published));
      render();
      note('已改用站上版本。');
    }
  });
  $('#file-input').addEventListener('change', ev => {
    if (ev.target.files[0]) doImport(ev.target.files[0]);
    ev.target.value = '';
  });

  // 卡片操作（事件委派）
  $('#list').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    const id = card.dataset.id;
    const e = entry(id);
    if (!e) return;

    // 訪客只能展開留言；其餘動作即使被人手動塞回 DOM 也不執行
    const act = btn.dataset.act;
    if (act !== 'toggle-cm' && !isAdmin) return;

    switch (act) {
      case 'edit':
        openEdit(id);
        break;
      case 'dup': {
        // 沿用原項目所有欄位，只換掉 id／名稱／時間戳，留言不跟著複製
        const fresh = blankEntry();
        db.entries.push({
          ...structuredClone(e),
          id: fresh.id,
          name: e.name + '（複本）',
          comments: [],
          createdAt: fresh.createdAt,
          updatedAt: fresh.updatedAt,
        });
        save();
        render();
        break;
      }
      case 'del':
        if (!confirm(`刪除「${e.name}」？連同 ${e.comments.length} 則留言一起移除，無法復原。`)) return;
        db.entries = db.entries.filter(x => x.id !== id);
        openComments.delete(id);
        save();
        render();
        break;
      case 'toggle-cm':
        openComments.has(id) ? openComments.delete(id) : openComments.add(id);
        render();
        break;
      case 'add-cm': {
        const ta = $('[data-role="cm-input"]', card);
        const text = ta.value.trim();
        if (!text) return;
        e.comments.push({
          id: 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          text, at: new Date().toISOString(),
        });
        e.updatedAt = new Date().toISOString();
        save();
        render();
        break;
      }
      case 'del-cm': {
        const cid = btn.closest('.cm-item').dataset.cid;
        if (!confirm('刪除這則留言？')) return;
        e.comments = e.comments.filter(c => c.id !== cid);
        save();
        render();
        break;
      }
    }
  });

  // Ctrl+Enter 送出留言
  $('#list').addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) &&
        ev.target.dataset.role === 'cm-input') {
      ev.preventDefault();
      $('[data-act="add-cm"]', ev.target.closest('.card')).click();
    }
  });
}

/* ---------- 啟動 ---------- */

/* ---------- 管理員模式 ---------- */

// 依身分切換 UI；訪客看到的頁面沒有任何編輯入口
function applyRole() {
  $('#btn-new').hidden = !isAdmin;
  $('#admin-wrap').hidden = !isAdmin;
  $('#btn-login').hidden = isAdmin;
  document.body.classList.toggle('is-admin', isAdmin);
  showDraftBadge();
}

// 草稿與站上版本不同時提醒：改了不匯出＝別人看不到
function showDraftBadge() {
  const el = $('#draft');
  if (!isAdmin || !published || !db) return void (el.hidden = true);
  const dirty = JSON.stringify(db.entries) !== JSON.stringify(migrate(published).entries);
  el.hidden = !dirty;
  if (dirty) {
    el.textContent = '這台瀏覽器有尚未匯出的草稿 —— 站上看到的還是舊版。'
      + '要讓別人看到，請「資料 → 匯出 cycles.json」覆蓋 data/cycles.json 再 commit。';
  }
}

function bindLogin() {
  const dlg = $('#login');
  const err = m => {
    $('#login-err').textContent = m;
    $('#login-err').hidden = false;
  };

  $('#btn-login').addEventListener('click', () => {
    $('#login-pw').value = '';
    $('#login-err').hidden = true;
    if (!ADMIN_HASH) {
      $('#login-msg').textContent =
        '尚未設定管理員密碼（app.js 的 ADMIN_HASH 是空的），編輯功能停用中。';
      $('#login-pw').disabled = true;
      $('#login-btn').disabled = true;
    }
    dlg.showModal();
    if (ADMIN_HASH) $('#login-pw').focus();
  });

  $('#login-cancel').addEventListener('click', () => dlg.close());

  $('#login-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    $('#login-err').hidden = true;
    if (!crypto.subtle) return err('這個環境沒有 WebCrypto，請用 https 或 localhost 開啟。');
    $('#login-btn').disabled = true;
    const ok = await checkPassword($('#login-pw').value);
    $('#login-btn').disabled = false;
    if (!ok) return err('密碼不對。');

    isAdmin = true;
    try { localStorage.setItem(LS_ADMIN, '1'); } catch (e) { /* ignore */ }
    loadDraft();
    dlg.close();
    applyRole();
    render();
    note('已進入管理員模式。改完記得匯出 JSON 並 commit，站上內容才會更新。');
  });
}

// 管理員在這台瀏覽器尚未匯出的修改
function loadDraft() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) db = migrate(JSON.parse(raw));
  } catch (err) { /* 損毀就沿用站上版本 */ }
}

async function init() {
  buildWeekdayBoxes();
  bind();
  bindLogin();
  setInterval(tick, 60000);

  // 公開資料：任何人打開都看得到
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    published = await res.json();
    db = migrate(structuredClone(published));
  } catch (err) {
    published = { entries: [] };
    db = migrate({ entries: [] });
    note('讀不到 data/cycles.json（用 file:// 直接開啟會被瀏覽器擋下，請改用 http server）。');
  }

  try { isAdmin = localStorage.getItem(LS_ADMIN) === '1' && !!ADMIN_HASH; } catch (e) { /* ignore */ }
  if (isAdmin) loadDraft();

  applyRole();
  render();
}

init();
