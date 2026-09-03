/* 星慾姬絆 活動日誌
   內容是公開的：任何人打開都看得到輪替表，資料就是 data/cycles.json。
   編輯功能藏在管理員密碼後面 —— 但要講清楚，這道門只擋 UI：
   站上真正的內容由 repo 裡的 cycles.json 決定，所以實際的修改權限
   等於 git push 權限。管理員在自己瀏覽器改完後匯出 JSON、commit，才會影響別人。

   資料模型（v2）：活動不是「每週固定星期幾」，而是一個 N 週輪替 ——
   每一輪的第幾週開哪些活動。要換算成實際日期需要 rotation.anchorDate
   （某次 Week 1 的第一天）。 */

const DATA_URL = 'data/cycles.json';
const LS_KEY = 'roe-cycles-draft-v2';   // 管理員尚未匯出的草稿
const LS_ADMIN = 'roe-cycles-admin-v1'; // 這台瀏覽器已通過管理員驗證
const PBKDF2_ITER = 250000;
const ADMIN_SALT = 'roe-cycles-admin';  // 固定 salt，只為了讓暴力破解變貴

// 管理員密碼的 PBKDF2-SHA256 雜湊（hex）。空字串＝尚未設定，編輯功能停用。
const ADMIN_HASH = 'cc06ce05dc09f374f90620b8f1d465b035082768c0034e0ff7aeeaf8a151a768';

// giscus 留言板：留言存在 GitHub Discussions，訪客需有 GitHub 帳號。
// CATEGORY_ID 要等 repo 開啟 Discussions 後才拿得到；留空則不載入留言板。
const GISCUS_REPO = 'pinpin12040720-hub/roe';
const GISCUS_REPO_ID = 'R_kgDOTJWkkA';
const GISCUS_CATEGORY = 'General';
const GISCUS_CATEGORY_ID = '';

const WD = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];
const DAY = 86400000;

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
    name: '', aka: '', category: '', weeks: [], startDay: null, openTime: '',
    verified: false, todo: '',
    durationDays: null, durationHours: null, lastSeen: '',
    note: '', raw: '', archived: false, comments: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

const DEFAULT_ROTATION = { totalWeeks: 7, anchorDate: '', anchorNote: '', rules: [], openNote: '' };

// 補齊缺欄位，容忍手改過的 JSON
function migrate(data) {
  const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
  const r = data.rotation || {};
  const total = Number(r.totalWeeks) || 7;

  const out = {
    schema: 'cycles-v2',
    title: data.title || '活動日誌',
    source: data.source || '',
    updatedAt: data.updatedAt || '',
    rotation: {
      ...DEFAULT_ROTATION,
      ...r,
      totalWeeks: total,
      anchorDate: String(r.anchorDate || ''),
      rules: Array.isArray(r.rules) ? r.rules.map(String) : [],
    },
    weeks: [],
    entries: [],
  };

  // 週次表：補滿 1..total，缺的用空的
  const given = Array.isArray(data.weeks) ? data.weeks : [];
  for (let n = 1; n <= total; n++) {
    const w = given.find(x => Number(x.n) === n) || {};
    out.weeks.push({
      n,
      label: String(w.label || ''),
      startsOn: String(w.startsOn || ''),
      activities: (Array.isArray(w.activities) ? w.activities : []).map(String),
    });
  }

  const list = Array.isArray(data.entries) ? data.entries : [];
  out.entries = list.map(e => {
    const b = blankEntry();
    return {
      ...b, ...e,
      id: e.id || b.id,
      name: String(e.name || ''),
      aka: String(e.aka || ''),
      // 舊資料沒有 verified 就當已確認，免得整批被標成待確認
      verified: e.verified === undefined ? true : !!e.verified,
      todo: String(e.todo || ''),
      category: String(e.category || ''),
      // v1 的 weekdays（每週星期幾）在新模型下沒有意義，直接捨棄
      weeks: (Array.isArray(e.weeks) ? e.weeks : [])
        .map(Number).filter(n => n >= 1 && n <= total),
      startDay: (n => (n >= 1 && n <= 7 ? n : null))(Number(e.startDay)),
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

/* ---------- 輪替推算 ---------- */

function isoDay(d) { return ((d.getDay() + 6) % 7) + 1; }   // 1=週一 … 7=週日

// 目前落在輪替的第幾週。沒有 anchorDate 就算不出來。
function rotationOf(ts = Date.now()) {
  const r = db && db.rotation;
  if (!r || !r.anchorDate) return null;
  const anchor = new Date(r.anchorDate + 'T00:00:00').getTime();
  if (Number.isNaN(anchor)) return null;
  const total = r.totalWeeks;
  const n = Math.floor((ts - anchor) / (7 * DAY));
  return {
    week: ((n % total) + total) % total + 1,
    start: anchor + n * 7 * DAY,
    index: n,
    total,
  };
}

function weekDef(n) {
  return (db.weeks || []).find(w => w.n === n) || { n, activities: [], startsOn: '', label: '' };
}

// 「週四」「週一、週二」→ 該週第幾天開（0 = 週一）
function startOffset(startsOn) {
  const first = String(startsOn || '').split(/[、,／/\s]/)[0].trim();
  const i = WD.indexOf(first);
  return i > 0 ? i - 1 : 0;
}

// 活動在所屬那一週的第幾天開。同一週的兩個活動常是一個週一、一個週二，
// 所以優先看活動自己的 startDay，沒填才退回該週的規則。
function entryOffset(e, week) {
  if (e.startDay >= 1 && e.startDay <= 7) return e.startDay - 1;
  return startOffset(weekDef(week).startsOn);
}

// 某活動的狀態：live（開放中）/ upcoming（還沒到）/ unknown
function activityState(e, ts = Date.now()) {
  const cur = rotationOf(ts);
  const weeks = e.weeks || [];
  if (!cur || !weeks.length) return { status: 'unknown' };

  // 從本週往後掃一整輪，找出第一個還沒結束的場次
  for (let i = 0; i <= cur.total; i++) {
    const w = ((cur.week - 1 + i) % cur.total) + 1;
    if (!weeks.includes(w)) continue;
    const weekStart = cur.start + i * 7 * DAY;
    const start = weekStart + entryOffset(e, w) * DAY;
    const span = (e.durationDays || 0) * DAY + (e.durationHours || 0) * 3600e3;
    // 沒填持續時間就當它開滿整週
    const end = span > 0 ? start + span : weekStart + 7 * DAY;
    if (ts >= start && ts < end) return { status: 'live', week: w, start, end };
    if (ts < start) return { status: 'upcoming', week: w, start, end };
  }
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

function fmtDate(ts) {
  const t = new Date(ts);
  return `${t.getMonth() + 1}/${t.getDate()}（${WD[isoDay(t)]}）`;
}

function nextHtml(e) {
  const s = activityState(e);
  if (s.status === 'unknown') {
    return !(e.weeks || []).length
      ? `<span class="lbl">開放週次</span>尚未設定`
      : `<span class="lbl">開放週次</span>需要先校準輪替（缺 anchorDate）`;
  }
  if (s.status === 'live') {
    return `<span class="lbl">開放中 · Week ${s.week}</span>`
      + `剩 ${fmtDur(s.end - Date.now())}　·　${fmtDate(s.end)} 結束`;
  }
  return `<span class="lbl">下次 · Week ${s.week}</span>`
    + `${fmtDate(s.start)} 開　·　還有 ${fmtDur(s.start - Date.now())}`;
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
    const hay = [e.name, e.aka, e.category, e.note, e.todo, e.raw, ...e.comments.map(c => c.text)]
      .join(' ').toLowerCase();
    return hay.includes(q);
  });
}

const RANK = { live: 0, upcoming: 1, unknown: 2 };

function render() {
  renderRotation();

  const list = visible().sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    const sa = activityState(a), sb = activityState(b);
    if (RANK[sa.status] !== RANK[sb.status]) return RANK[sa.status] - RANK[sb.status];
    if (sa.start && sb.start) return sa.start - sb.start;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });

  $('#list').innerHTML = list.map(cardHtml).join('');
  $('#empty').hidden = list.length > 0;
  refreshCats();
  showDraftBadge();
}

// 輪替總表：官方活動日誌的內容，目前這一週會被標出來
function renderRotation() {
  const cur = rotationOf();
  const r = db.rotation;

  $('#rot-now').innerHTML = cur
    ? `目前是 <b>Week ${cur.week}</b>　·　${fmtDate(cur.start)} ~ ${fmtDate(cur.start + 6 * DAY)}`
    : '<b>尚未校準</b> —— 設定 Week 1 的起始日後才能推算目前週次與倒數。';

  $('#rot-body').innerHTML = db.weeks.map(w => {
    const on = cur && cur.week === w.n;
    const when = w.label || (w.startsOn ? w.startsOn + '開始' : '—');
    const dates = cur
      ? fmtDate(cur.start + ((w.n - cur.week + cur.total) % cur.total) * 7 * DAY)
      : '';
    return `<tr class="${on ? 'now' : ''}">
      <td class="wk">Week ${w.n}${on ? ' <span class="badge">本週</span>' : ''}</td>
      <td class="when">${esc(when)}</td>
      <td class="acts">${w.activities.map(a => `<span class="chip">${esc(a)}</span>`).join('') || '—'}</td>
      <td class="dt">${dates ? dates + ' 起' : ''}</td>
    </tr>`;
  }).join('');

  const rules = (r.rules || []).map(x => `<li>${esc(x)}</li>`).join('');
  $('#rot-rules').innerHTML = rules ? `<ul>${rules}</ul>` : '';
  // openNote 是給所有人看的（哪裡還沒確認）；anchorNote 是推導過程，只給管理員
  $('#rot-note').textContent = isAdmin
    ? [r.openNote, r.anchorNote].filter(Boolean).join('　')
    : (r.openNote || '');
  $('#rot-note').hidden = !$('#rot-note').textContent;
}

function cardHtml(e) {
  const s = activityState(e);
  const weeks = (e.weeks || []).length
    ? e.weeks.slice().sort((a, b) => a - b).map(n => `W${n}`).join('、') : '—';
  const dur = (e.durationDays || e.durationHours)
    ? fmtDur((e.durationDays || 0) * DAY + (e.durationHours || 0) * 3600e3) : '—';
  const open = openComments.has(e.id);

  return `<article class="card ${s.status === 'live' ? 'live' : ''} ${e.archived ? 'archived' : ''}" data-id="${e.id}">
    <div class="top">
      <div class="nm">${esc(e.name) || '（未命名）'}${
        e.aka ? `<span class="aka">${esc(e.aka)}</span>` : ''}</div>
      ${!e.verified ? '<span class="cat todo-tag">待確認</span>' : ''}
      ${e.category ? `<span class="cat">${esc(e.category)}</span>` : ''}
    </div>
    <div class="when">
      <span>開放週次：<b>${esc(weeks)}</b>${e.startDay ? ' ' + WD[e.startDay] + '開' : ''}</span>
      <span>持續：<b>${dur}</b></span>
      ${e.lastSeen ? `<span>最近：<b>${esc(e.lastSeen)}</b></span>` : ''}
    </div>
    <div class="next ${s.status}">${nextHtml(e)}</div>
    ${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}
    ${e.todo ? `<div class="todo">待確認：${esc(e.todo)}</div>` : ''}
    ${e.raw ? `<div class="raw">手寫筆記：${esc(e.raw)}</div>` : ''}
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
    const s = activityState(e);
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
  note._t = setTimeout(() => { el.hidden = true; }, 6000);
}

/* ---------- 編輯 ---------- */

function buildWeekBoxes() {
  const total = (db && db.rotation.totalWeeks) || 7;
  $('#f-weeks').innerHTML = Array.from({ length: total }, (_, i) => i + 1).map(n =>
    `<label><input type="checkbox" value="${n}">W${n}</label>`).join('');
}

function openEdit(id) {
  editingId = id;
  const e = id ? entry(id) : blankEntry();
  $('#dlg-title').textContent = id ? '編輯項目' : '新增項目';
  $('#f-name').value = e.name;
  $('#f-aka').value = e.aka;
  $('#f-category').value = e.category;
  $('#f-verified').checked = !e.verified;
  $('#f-todo').value = e.todo;
  $('#f-startDay').value = e.startDay ?? '';
  $('#f-openTime').value = e.openTime;
  $('#f-durationDays').value = e.durationDays ?? '';
  $('#f-durationHours').value = e.durationHours ?? '';
  $('#f-lastSeen').value = e.lastSeen;
  $('#f-archived').checked = e.archived;
  $('#f-note').value = e.note;
  $('#f-raw').value = e.raw;
  $$('#f-weeks input').forEach(cb => { cb.checked = e.weeks.includes(Number(cb.value)); });
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
    aka: $('#f-aka').value.trim(),
    category: $('#f-category').value.trim(),
    verified: !$('#f-verified').checked,
    todo: $('#f-todo').value.trim(),
    startDay: numOrNull('#f-startDay'),
    openTime: $('#f-openTime').value,
    durationDays: numOrNull('#f-durationDays'),
    durationHours: numOrNull('#f-durationHours'),
    lastSeen: $('#f-lastSeen').value,
    archived: $('#f-archived').checked,
    note: $('#f-note').value.trim(),
    raw: $('#f-raw').value.trim(),
    weeks: $$('#f-weeks input:checked').map(cb => Number(cb.value)).sort((a, b) => a - b),
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

// 校準：告訴系統「遊戲裡現在是第幾週」，反推 anchorDate
function calibrate() {
  const cur = rotationOf();
  const total = db.rotation.totalWeeks;
  const ans = prompt(
    `遊戲內現在是輪替的第幾週？（1–${total}）\n\n`
    + `目前推算為 Week ${cur ? cur.week : '？'}。填入正確的週次，`
    + `系統會反推 Week 1 的起始日。`,
    cur ? String(cur.week) : '');
  if (ans === null) return;
  const want = Number(ans);
  if (!(want >= 1 && want <= total)) return note(`要填 1 到 ${total} 之間的數字。`);

  // 本週的週一當基準，往回推 (want-1) 週就是 Week 1 的起始日
  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (isoDay(monday) - 1));
  const anchor = new Date(monday.getTime() - (want - 1) * 7 * DAY);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  db.rotation.anchorDate = iso(anchor);
  db.rotation.anchorNote = `由管理員於 ${iso(new Date())} 校準為 Week ${want}。`;
  save();
  render();
  note(`已校準：本週為 Week ${want}，Week 1 起始日設為 ${iso(anchor)}。記得匯出 JSON 並 commit。`);
}

/* ---------- JSON 匯出／匯入 ---------- */

function jsonText() {
  return JSON.stringify({ ...db, schema: 'cycles-v2' }, null, 2) + '\n';
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
      buildWeekBoxes();
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
    if (act === 'calibrate') calibrate();
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
      buildWeekBoxes();
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
  const a = JSON.stringify({ e: db.entries, w: db.weeks, r: db.rotation });
  const p = migrate(published);
  const b = JSON.stringify({ e: p.entries, w: p.weeks, r: p.rotation });
  el.hidden = a === b;
  if (a !== b) {
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

// 留言板由 giscus 提供；設定不全就不載入，免得留一塊壞掉的 iframe
function mountGiscus() {
  if (!GISCUS_CATEGORY_ID) {
    // 還沒接好就整塊收起來，別讓訪客看到半成品；設定說明只給管理員
    document.querySelector('.board').hidden = !isAdmin;
    const off = $('#giscus-off');
    off.hidden = !isAdmin;
    off.textContent = '留言板尚未啟用：repo 需要先開啟 Discussions、安裝 giscus app，'
      + '再把 category id 填進 app.js 的 GISCUS_CATEGORY_ID。';
    return;
  }
  const sc = document.createElement('script');
  sc.src = 'https://giscus.app/client.js';
  sc.async = true;
  sc.crossOrigin = 'anonymous';
  Object.entries({
    repo: GISCUS_REPO, repoId: GISCUS_REPO_ID,
    category: GISCUS_CATEGORY, categoryId: GISCUS_CATEGORY_ID,
    mapping: 'pathname', strict: '0', reactionsEnabled: '1',
    emitMetadata: '0', inputPosition: 'bottom',
    theme: 'transparent_dark', lang: 'zh-TW', loading: 'lazy',
  }).forEach(([k, v]) => sc.setAttribute('data-' + k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), v));
  $('#giscus').appendChild(sc);
}

async function init() {
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

  buildWeekBoxes();
  applyRole();
  render();
  mountGiscus();
}

init();
