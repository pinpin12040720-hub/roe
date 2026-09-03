/* 星慾姬絆 週期登錄表
   資料以 JSON 管理，但站上是公開的 GitHub Pages，所以內容一律加密後才落地：
   - 站上版本  data/cycles.enc   AES-GCM 密文（密碼經 PBKDF2 導出金鑰）
   - 本機修改  localStorage      同樣是密文，明文只存在記憶體
   改完按「匯出加密檔」覆蓋 data/cycles.enc 再 commit，即可更新站上內容。 */

const LS_KEY = 'roe-cycles-box-v1';    // localStorage：加密後的資料
const SS_KEY = 'roe-cycles-key-v1';    // sessionStorage：本分頁記住的金鑰
const ENC_URL = 'data/cycles.enc';
const SEED_URL = 'data/cycles.json';   // 明文種子，只在本機首次建立時用得到
const PBKDF2_ITER = 250000;
const WD = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];

let db = null;            // 明文資料（僅存在記憶體）
let cryptoKey = null;     // 解鎖後的 AES-GCM 金鑰
let salt = null;          // 目前這份資料的 KDF salt
let editingId = null;     // 正在編輯的項目 id；null = 新增
let seedData = null;      // 明文種子（只有首次建立時會用到）
let pendingBox = null;    // 等待解鎖的密文
let gateMode = 'unlock';  // unlock | setup | change
const openComments = new Set();   // 展開留言的項目 id

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- 加密層（WebCrypto，AES-GCM 256 + PBKDF2-SHA256） ---------- */

const TE = new TextEncoder(), TD = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(password, saltBytes) {
  const base = await crypto.subtle.importKey(
    'raw', TE.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

// 明文物件 -> 可存檔的密文信封
async function seal(obj, key, saltBytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, TE.encode(JSON.stringify(obj)));
  return {
    format: 'cycles-enc-v1',
    kdf: 'PBKDF2-SHA256', iter: PBKDF2_ITER,
    salt: b64(saltBytes), iv: b64(iv), ct: b64(ct),
    sealedAt: new Date().toISOString(),
  };
}

// 密文信封 -> 明文物件（密碼錯會丟出例外）
async function unseal(box, key) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(TD.decode(pt));
}

// 讓同一分頁重整免再輸密碼；分頁關掉就沒了
async function rememberKey(key) {
  try {
    const raw = await crypto.subtle.exportKey('raw', key);
    sessionStorage.setItem(SS_KEY, JSON.stringify({ k: b64(raw), s: b64(salt) }));
  } catch (err) { /* sessionStorage 被關掉就算了 */ }
}

async function recallKey() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null');
    if (!saved) return null;
    const key = await crypto.subtle.importKey(
      'raw', unb64(saved.k), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    return { key, salt: unb64(saved.s) };
  } catch (err) { return null; }
}

function forgetKey() {
  try { sessionStorage.removeItem(SS_KEY); } catch (err) { /* ignore */ }
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

// 加密是非同步的，但呼叫端都是同步流程；用一條 promise 鏈串起來，
// 避免連續操作時後寫的先落地
let saveChain = Promise.resolve();

function save() {
  db.updatedAt = new Date().toISOString().slice(0, 10);
  if (!cryptoKey) return;
  const snapshot = structuredClone(db);
  saveChain = saveChain
    .then(() => seal(snapshot, cryptoKey, salt))
    .then(box => localStorage.setItem(LS_KEY, JSON.stringify(box)))
    .catch(err => note('存檔失敗：' + err.message));
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
      <button class="btn small" data-act="edit">編輯</button>
      <button class="btn small" data-act="dup">複製</button>
      <button class="btn small" data-act="toggle-cm">留言 ${e.comments.length ? `(${e.comments.length})` : ''}</button>
      <button class="btn small danger" data-act="del">刪除</button>
    </div>
    ${open ? commentsHtml(e) : ''}
  </article>`;
}

function commentsHtml(e) {
  const items = e.comments.length
    ? e.comments.map(c => `<div class="cm-item" data-cid="${c.id}">
        <div class="meta"><span>${esc(new Date(c.at).toLocaleString('zh-TW', { hour12: false }))}</span>
        <button class="del" data-act="del-cm" title="刪除這則留言">刪除</button></div>
        <div class="txt">${esc(c.text)}</div>
      </div>`).join('')
    : `<div class="cm-none">還沒有留言。</div>`;

  return `<div class="cm">
    <div class="cm-list">${items}</div>
    <div class="cm-form">
      <textarea rows="1" placeholder="記下這期的觀察…（Ctrl+Enter 送出）" data-role="cm-input"></textarea>
      <button class="btn small primary" data-act="add-cm">送出</button>
    </div>
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

// 要放上站的就是這個檔
async function doSeal() {
  try {
    const box = await seal(db, cryptoKey, salt);
    download(JSON.stringify(box, null, 2) + '\n', 'cycles.enc');
    note('已匯出 cycles.enc；覆蓋 web/cycles/data/cycles.enc 再 commit 即可更新站上內容。');
  } catch (err) {
    note('加密失敗：' + err.message);
  }
}

function doExport() {
  download(jsonText(), 'cycles.json');
  note('已匯出明文 cycles.json —— 這份沒有加密，只當本機備份，不要 commit 進 repo。');
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
    if (act === 'seal') doSeal();
    if (act === 'export') doExport();
    if (act === 'copy') doCopy();
    if (act === 'import') $('#file-input').click();
    if (act === 'passwd') showGate('change');
    if (act === 'lock') lock();
    if (act === 'reload') {
      if (!confirm('捨棄本機所有修改，重新讀取站上版本？之後要重新輸入密碼。')) return;
      localStorage.removeItem(LS_KEY);
      lock();
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

    switch (btn.dataset.act) {
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

const GATE_MSG = {
  unlock: '內容已加密，請輸入密碼解鎖。',
  setup: '第一次使用：設定一組密碼。資料會用它加密，忘記就沒有辦法救回來。',
  change: '設定新密碼。變更後記得「匯出加密檔」並 commit，站上版本才會跟著換密碼。',
};

function showGate(mode) {
  gateMode = mode;
  const isNew = mode !== 'unlock';
  $('#gate-msg').textContent = GATE_MSG[mode];
  $('#gate-f2').hidden = !isNew;
  $('#gate-pw2').required = isNew;
  $('#gate-pw').value = '';
  $('#gate-pw2').value = '';
  $('#gate-pw').autocomplete = isNew ? 'new-password' : 'current-password';
  $('#gate-btn').textContent = isNew ? '設定密碼' : '解鎖';
  $('#gate-cancel').hidden = mode !== 'change';
  $('#gate-err').hidden = true;
  $('#gate-hint').textContent = '';
  $('#gate').hidden = false;
  $('#gate-pw').focus();
}

function enterApp() {
  $('#gate').hidden = true;
  $('#app').hidden = false;
  render();
}

function lock() {
  cryptoKey = null;
  db = null;
  salt = null;
  forgetKey();
  location.reload();   // 重載才能把記憶體裡的明文一起丟掉
}

function bindGate() {
  const err = m => {
    $('#gate-err').textContent = m;
    $('#gate-err').hidden = false;
  };

  $('#gate-cancel').addEventListener('click', () => { $('#gate').hidden = true; });

  $('#gate-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    $('#gate-err').hidden = true;
    const pw = $('#gate-pw').value;
    const remember = $('#gate-remember').checked;

    if (gateMode === 'unlock') {
      const s = unb64(pendingBox.salt);
      try {
        const key = await deriveKey(pw, s);
        const data = await unseal(pendingBox, key);
        cryptoKey = key;
        salt = s;
        db = migrate(data);
      } catch (e) {
        return err('密碼不對，或這份資料已損毀。');
      }
      if (remember) await rememberKey(cryptoKey);
      enterApp();
      return;
    }

    // setup / change
    if (pw.length < 8) return err('密碼至少 8 個字。');
    if (pw !== $('#gate-pw2').value) return err('兩次輸入不一致。');

    salt = crypto.getRandomValues(new Uint8Array(16));
    cryptoKey = await deriveKey(pw, salt);
    if (remember) await rememberKey(cryptoKey);
    if (gateMode === 'setup') db = seedData || migrate({ entries: [] });
    save();
    enterApp();
    note(gateMode === 'change'
      ? '密碼已變更。記得「匯出加密檔 cycles.enc」放進 data/ 再 commit。'
      : '密碼已設定。改完資料後用「匯出加密檔」產生 cycles.enc 放進 data/ 再 commit。');
  });
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch (err) {
    return null;   // file:// 直接開會被擋，用本機 http server 即可
  }
}

async function init() {
  buildWeekdayBoxes();
  bind();
  bindGate();

  // WebCrypto 只在安全來源可用（https 或 localhost）
  if (!crypto.subtle) {
    $('#gate-msg').textContent =
      '這個環境沒有 WebCrypto，無法解密。請用 https 或 localhost 開啟本頁。';
    $('#gate-form').querySelectorAll('input,button').forEach(el => { el.disabled = true; });
    return;
  }

  setInterval(tick, 60000);

  // 本機有未匯出的修改就用它，否則抓站上的加密檔
  let box = null, fromLocal = false;
  try {
    box = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    fromLocal = !!box;
  } catch (err) { /* 損毀就當沒有 */ }
  if (!box) box = await fetchJson(ENC_URL);

  if (box && box.ct) {
    pendingBox = box;
    const saved = await recallKey();      // 同分頁重整免再輸密碼
    if (saved) {
      try {
        db = migrate(await unseal(box, saved.key));
        cryptoKey = saved.key;
        salt = unb64(box.salt);
        return enterApp();
      } catch (err) {
        forgetKey();                      // 記住的金鑰對不上這份資料
      }
    }
    showGate('unlock');
    if (fromLocal) $('#gate-hint').textContent = '（這是你本機還沒匯出的修改）';
    return;
  }

  // 站上還沒有加密檔 —— 首次建立，拿明文種子起頭
  const seedJson = await fetchJson(SEED_URL);
  if (seedJson) seedData = migrate(seedJson);
  showGate('setup');
  $('#gate-hint').textContent = seedData
    ? `會以 data/cycles.json 現有的 ${seedData.entries.length} 筆資料起頭。`
    : '目前沒有任何資料，設定密碼後從空白開始。';
}

init();
