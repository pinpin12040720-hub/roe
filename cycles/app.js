/* 星慾姬絆 活動日誌
   內容是公開的：任何人打開都看得到，資料就是 data/cycles.json。
   編輯功能藏在管理員密碼後面 —— 但要講清楚，這道門只擋 UI：
   站上真正的內容由 repo 裡的 cycles.json 決定，所以實際的修改權限
   等於 git push 權限。管理員在自己瀏覽器改完後匯出 JSON、commit，才會影響別人。

   資料模型（v4，雙軌）：實測發現巡獵走兩條獨立軌道 ——
   - 主巡獵：每週一開一個，持續 7 天，前一個結束隔天下一個就開，中間不留空窗
   - 短巡獵：每週二開一個，持續 3～4 天，結束後空到下週二
   每條軌道有一個 sequence（依實際觀察累積的順序），週復一週輪替。
   **循環長度尚未確定**：兩軌都只完整走過一輪，還沒看到第二輪重複，
   所以預測愈遠愈不可靠，要靠每週補一筆觀察長期校正。

   軌道起點由開服日推得，跨伺服器通用：
     新手期 Day 1–21 跟著開服天數走 → Day 22 起第一個週四是第一次豐收
     → 那之後的下一個週一，主軌從 sequence[0] 開始；短軌晚一週（+8 天）從週二開始。
   每筆 sighting（實際觀察）都會跟預測比對，不符就在頁面上標出來，提醒該修 sequence。 */

const DATA_URL = 'data/cycles.json';
const LS_KEY = 'roe-cycles-draft-v4';   // 管理員尚未匯出的草稿
const LS_ADMIN = 'roe-cycles-admin-v1'; // 這台瀏覽器已通過管理員驗證
const LS_OPEN = 'roe-cycles-open-v1';   // 訪客自己伺服器的開服日
const PBKDF2_ITER = 250000;
const ADMIN_SALT = 'roe-cycles-admin';  // 固定 salt，只為了讓暴力破解變貴

// 管理員密碼的 PBKDF2-SHA256 雜湊（hex）。空字串＝尚未設定，編輯功能停用。
const ADMIN_HASH = 'cc06ce05dc09f374f90620b8f1d465b035082768c0034e0ff7aeeaf8a151a768';

const WD = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];
const DAY = 86400000;
const TIMELINE_BACK = 3;    // 時間軸往回顯示幾週
const TIMELINE_FWD = 5;     // 往後顯示幾週

let db = null;            // 目前資料
let published = null;     // 站上那份（data/cycles.json），用來判斷草稿有沒有差異
let isAdmin = false;
let editingId = null;     // 正在編輯的項目 id；null = 新增
let visitorOpen = '';     // 訪客自己填的開服日（YYYY-MM-DD），空＝用基準服
const openCards = new Set();   // 展開觀察紀錄的項目 id

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

/* ---------- 小工具 ---------- */

const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const validIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00').getTime());
const tsOf = s => new Date(s + 'T00:00:00').getTime();
const isoDay = d => ((d.getDay() + 6) % 7) + 1;   // 1=週一 … 7=週日
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDate(ts) {
  const t = new Date(ts);
  return `${t.getMonth() + 1}/${t.getDate()}（${WD[isoDay(t)]}）`;
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

/* ---------- 資料層 ---------- */

function blankEntry() {
  return {
    id: 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: '', aka: '', category: '', track: '',
    durationDays: null, durationHours: null, openTime: '',
    sightings: [], verified: false, todo: '',
    note: '', raw: '', archived: false, comments: [],
  };
}

const DEFAULT_STATUS = { level: 'unverified', basis: '', note: '' };

// 補齊缺欄位，容忍手改過的 JSON。v3（一輪 49 天＋days）的舊資料只保留基本欄位，
// 軌道與觀察紀錄無法自動推得（v3 的 days 是推算值不是觀察值），留給管理員重填。
function migrate(data) {
  const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
  const srv = data.server || {};
  const legacyOpen = (data.rotation && data.rotation.serverOpenDate) || '';
  const open = String(srv.openDate || legacyOpen || '');

  const out = {
    schema: 'cycles-v4',
    title: data.title || '活動日誌',
    source: data.source || '',
    updatedAt: data.updatedAt || '',
    status: { ...DEFAULT_STATUS, ...(data.status || {}) },
    server: {
      openDate: validIso(open) ? open : '',
      label: String(srv.label || (data.rotation && data.rotation.serverLabel) || '本站基準服'),
    },
    tracks: (Array.isArray(data.tracks) ? data.tracks : []).map(t => ({
      id: String(t.id || ''),
      label: String(t.label || ''),
      weekday: Number(t.weekday) >= 1 && Number(t.weekday) <= 7 ? Number(t.weekday) : 1,
      durationDays: num(t.durationDays),
      // 相對主軌起點的天數位移：主軌 0、短軌 8（晚一週的週二）
      startOffsetDays: Number.isFinite(Number(t.startOffsetDays)) ? Number(t.startOffsetDays)
        : (String(t.id) === 'short' ? 8 : 0),
      sequence: (Array.isArray(t.sequence) ? t.sequence : []).map(String),
      note: String(t.note || ''),
    })),
    launch: {
      label: String((data.launch && data.launch.label) || '開服新手期'),
      note: String((data.launch && data.launch.note) || ''),
      events: ((data.launch && Array.isArray(data.launch.events)) ? data.launch.events : [])
        .map(e => ({ day: Number(e.day) || 0, name: String(e.name || '') }))
        .filter(e => e.day > 0).sort((a, b) => a.day - b.day),
      firstHarvest: (data.launch && data.launch.firstHarvest) ? {
        date: String(data.launch.firstHarvest.date || ''),
        name: String(data.launch.firstHarvest.name || ''),
        durationDays: num(data.launch.firstHarvest.durationDays),
        note: String(data.launch.firstHarvest.note || ''),
      } : null,
    },
    entries: [],
  };

  const list = Array.isArray(data.entries) ? data.entries : [];
  out.entries = list.map(e => {
    const b = blankEntry();
    return {
      ...b, ...e,
      id: e.id || b.id,
      name: String(e.name || ''),
      aka: String(e.aka || ''),
      category: String(e.category || ''),
      track: String(e.track || ''),
      durationDays: num(e.durationDays),
      durationHours: num(e.durationHours),
      openTime: String(e.openTime || ''),
      sightings: (Array.isArray(e.sightings) ? e.sightings : [])
        .map(s => ({
          date: String(s.date || ''),
          source: s.source === 'other' ? 'other' : s.source === 'inferred' ? 'inferred' : 'self',
          note: String(s.note || ''),
        }))
        .filter(s => validIso(s.date))
        .sort((a, c) => a.date.localeCompare(c.date)),
      // 舊資料沒有 verified 就當已確認，免得整批被標成待確認
      verified: e.verified === undefined ? true : !!e.verified,
      todo: String(e.todo || ''),
      note: String(e.note || ''),
      raw: String(e.raw || ''),
      archived: !!e.archived,
      comments: (Array.isArray(e.comments) ? e.comments : []).map(c => ({
        id: c.id || 'm-' + Math.random().toString(36).slice(2, 8),
        text: String(c.text || ''),
        at: c.at || new Date().toISOString(),
      })),
    };
  }).map(e => {
    // v3 殘留欄位在新模型下沒有意義
    delete e.days; delete e.weeks; delete e.startDay; delete e.lastSeen;
    return e;
  });
  return out;
}

// 只有管理員會產生草稿；訪客不寫入任何東西（訪客的開服日另存，見 setVisitorOpen）
function save() {
  if (!isAdmin) return;
  db.updatedAt = isoDate(new Date());
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
  } catch (err) {
    note('草稿存檔失敗（瀏覽器儲存空間可能已滿）：' + err.message);
  }
}

function entry(id) { return db.entries.find(e => e.id === id); }
function trackOf(e) { return db.tracks.find(t => t.id === e.track) || null; }
function entryName(id) { const e = entry(id); return e ? e.name : id; }

/* ---------- 軌道推算 ---------- */

// 目前用哪個開服日：訪客自己填的優先，否則基準服
function openTs() {
  const s = visitorOpen || (db && db.server.openDate) || '';
  return validIso(s) ? tsOf(s) : null;
}

// 開服第幾天（Day 1 = 開服當天）
function serverDay(ts = Date.now()) {
  const o = openTs();
  return o === null ? null : Math.floor((ts - o) / DAY) + 1;
}

// 新手期結束後的第一次豐收：Day 22 起（含）第一個週四
function firstHarvestTs() {
  const o = openTs();
  if (o === null) return null;
  const d22 = o + 21 * DAY;
  return d22 + ((4 - isoDay(new Date(d22)) + 7) % 7) * DAY;
}

// 主軌起點：第一次豐收之後的下一個週一
function mainStartTs() {
  const h = firstHarvestTs();
  return h === null ? null : h + 4 * DAY;
}

// 某軌道第 k 週（0-based）的開始時刻
function trackWeekTs(track, k) {
  const m = mainStartTs();
  return m === null ? null : m + track.startOffsetDays * DAY + k * 7 * DAY;
}

// 某軌道第 k 週開哪個活動
function trackEntryAt(track, k) {
  const L = track.sequence.length;
  if (!L) return null;
  return track.sequence[((k % L) + L) % L];
}

// 某活動在某軌道的位置；-1 = 不在這條軌道上
function seqIndex(e) {
  const t = trackOf(e);
  return t ? t.sequence.indexOf(e.id) : -1;
}

function spanOf(e) {
  const t = trackOf(e);
  const days = e.durationDays !== null ? e.durationDays : (t && t.durationDays !== null ? t.durationDays : null);
  const hours = e.durationHours || 0;
  const ms = (days || 0) * DAY + hours * 3600e3;
  return ms > 0 ? ms : 7 * DAY;   // 沒填就當開滿一週
}

function startOf(e, k) {
  const t = trackOf(e);
  let ts = trackWeekTs(t, k);
  if (ts === null) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(e.openTime || '');
  if (m) ts += (Number(m[1]) * 60 + Number(m[2])) * 60000;
  return ts;
}

// 某活動的狀態：live（開放中）/ upcoming（還沒到）/ unknown（沒軌道或算不出來）
function activityState(e, ts = Date.now()) {
  const t = trackOf(e);
  const idx = seqIndex(e);
  const m = mainStartTs();
  if (!t || idx < 0 || m === null) return { status: 'unknown' };
  const L = t.sequence.length;
  const span = spanOf(e);

  // 這個活動出現在第 idx、idx+L、idx+2L… 週；往回找一次、往前找到第一個沒結束的
  let k = idx;
  while (startOf(e, k) + span <= ts) k += L;
  while (k - L >= 0 && startOf(e, k - L) + span > ts) k -= L;
  const start = startOf(e, k);
  const end = start + span;
  if (ts >= start && ts < end) return { status: 'live', k, start, end };
  return { status: 'upcoming', k, start, end };
}

// 把每一筆觀察拿去跟模型對答案 —— 長期校正就靠這個
function checkSighting(e, s) {
  const t = trackOf(e);
  const m = mainStartTs();
  const idx = seqIndex(e);
  const ts = tsOf(s.date);
  if (!t || idx < 0 || m === null) return { ok: null, msg: '' };
  const base = m + t.startOffsetDays * DAY;
  if (ts < base) return { ok: null, msg: '在軌道起點之前（新手期）' };
  const week = Math.round((ts - base) / (7 * DAY));
  const expectId = trackEntryAt(t, week);
  const expectTs = base + week * 7 * DAY;
  if (expectTs !== ts) {
    return { ok: false, msg: `模型預測這一輪的${t.label}在 ${fmtDate(expectTs)} 開，與觀察差 ${Math.round((ts - expectTs) / DAY)} 天` };
  }
  if (expectId !== e.id) {
    return { ok: false, msg: `模型預測 ${fmtDate(ts)} 開的是「${entryName(expectId)}」，順序需要修正` };
  }
  return { ok: true, msg: '與模型一致' };
}

// 全部觀察的命中統計：連續命中愈多，循環長度愈可信
function sightingStats() {
  let hit = 0, miss = 0, skip = 0;
  db.entries.forEach(e => e.sightings.forEach(s => {
    const r = checkSighting(e, s);
    if (r.ok === true) hit++; else if (r.ok === false) miss++; else skip++;
  }));
  return { hit, miss, skip, total: hit + miss + skip };
}

/* ---------- 畫面 ---------- */

function visible() {
  const q = $('#q').value.trim().toLowerCase();
  const cat = $('#filter-cat').value;
  const arch = $('#show-archived').checked;
  return db.entries.filter(e => {
    if (!arch && e.archived) return false;
    if (cat && e.category !== cat) return false;
    if (!q) return true;
    const hay = [e.name, e.aka, e.category, e.note, e.todo, e.raw,
      ...e.sightings.map(s => s.date + ' ' + s.note), ...e.comments.map(c => c.text)]
      .join(' ').toLowerCase();
    return hay.includes(q);
  });
}

const RANK = { live: 0, upcoming: 1, unknown: 2 };

function render() {
  renderStatus();
  renderServer();
  renderTimeline();
  renderLaunch();

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

// 資料狀態標籤：整頁層級的「這些能不能盡信」
function renderStatus() {
  const st = db.status;
  const stats = sightingStats();
  const lvl = st.level === 'verified' ? '已確認' : st.level === 'partial' ? '部分確認' : '待確認';
  $('#stat-level').textContent = lvl;
  $('#stat-level').className = 'stat-tag ' + (st.level === 'verified' ? 'ok' : 'todo');
  $('#stat-basis').textContent = st.basis || '';
  $('#stat-meta').textContent = [
    db.updatedAt ? `最後更新 ${db.updatedAt}` : '',
    stats.total ? `${stats.total} 筆實際觀察，${stats.hit} 筆與模型相符${stats.miss ? `，${stats.miss} 筆不符` : ''}` : '尚無觀察紀錄',
  ].filter(Boolean).join('　·　');
  $('#stat-note').textContent = st.note || '';
  $('#stat-note').hidden = !st.note;
  $('#stat-warn').hidden = !stats.miss;
  if (stats.miss) {
    $('#stat-warn').textContent = `有 ${stats.miss} 筆觀察與目前的軌道順序對不上 —— 下方卡片會標出是哪幾筆，順序可能要改。`;
  }
}

// 伺服器列：目前用哪個開服日在算
function renderServer() {
  const base = db.server.openDate;
  const using = visitorOpen || base;
  const day = serverDay();
  const m = mainStartTs();
  $('#srv-open').value = visitorOpen || '';
  $('#srv-open').placeholder = base || 'YYYY-MM-DD';
  $('#srv-reset').hidden = !visitorOpen;
  $('#srv-now').innerHTML = using
    ? `${visitorOpen ? '你的伺服器' : esc(db.server.label)} <b>${esc(using)}</b> 開服`
      + (day !== null ? `　·　今天是開服第 <b>${day}</b> 天` : '')
      + (m !== null ? `　·　雙軌循環自 <b>${fmtDate(m)}</b> 起` : '')
    : '<b>尚未設定開服日</b> —— 填了才能推算日期。';
}

// 雙軌時間軸：每一列是一週，兩條軌道並排
function renderTimeline() {
  const m = mainStartTs();
  const box = $('#tl');
  if (m === null) {
    box.innerHTML = '<p class="tl-empty">設定開服日後才能推算軌道。</p>';
    return;
  }
  const now = Date.now();
  const curWeek = Math.floor((now - m) / (7 * DAY));
  const from = Math.max(0, curWeek - TIMELINE_BACK);
  const to = curWeek + TIMELINE_FWD;

  const head = `<div class="tl-row tl-head"><div class="tl-wk">週</div>` +
    db.tracks.map(t => `<div class="tl-cell">${esc(t.label)}<small>${WD[t.weekday]}開${
      t.durationDays ? ` · ${t.durationDays} 天` : ''}</small></div>`).join('') + '</div>';

  const rows = [];
  for (let k = from; k <= to; k++) {
    const cells = db.tracks.map(t => {
      const kk = k - Math.round(t.startOffsetDays / 7);   // 短軌晚一週起算
      if (kk < 0) return '<div class="tl-cell tl-none">—</div>';
      const id = trackEntryAt(t, kk);
      const e = id ? entry(id) : null;
      if (!e) return '<div class="tl-cell tl-none">—</div>';
      const st = trackWeekTs(t, kk);
      const span = spanOf(e);
      const live = now >= st && now < st + span;
      const past = now >= st + span;
      const seen = e.sightings.some(s => tsOf(s.date) === st);
      return `<div class="tl-cell${live ? ' live' : ''}${past ? ' past' : ''}">
        <b>${esc(e.name)}</b>
        <small>${fmtDate(st)}${seen ? ' <span class="tl-seen" title="這一次有實際觀察紀錄">實測</span>' : ''}</small>
      </div>`;
    }).join('');
    const weekTs = m + k * 7 * DAY;
    const isNow = k === curWeek;
    rows.push(`<div class="tl-row${isNow ? ' now' : ''}">
      <div class="tl-wk">${fmtDate(weekTs).split('（')[0]}${isNow ? '<span class="badge">本週</span>' : ''}</div>
      ${cells}</div>`);
  }
  box.innerHTML = head + rows.join('');

  $('#tl-notes').innerHTML = db.tracks.map(t =>
    `<li><b>${esc(t.label)}</b>：${esc(t.note)}<br><small>目前順序：${
      t.sequence.map(id => esc(entryName(id))).join(' → ')} →（循環）</small></li>`).join('');
}

// 新手期：只發生一次，收在摺疊區
function renderLaunch() {
  const L = db.launch;
  const o = openTs();
  const box = $('#launch-body');
  if (!L.events.length && !L.firstHarvest) { $('#launch').hidden = true; return; }
  $('#launch').hidden = false;
  $('#launch-note').textContent = L.note || '';
  const rows = L.events.map(ev => `<tr><td>Day ${ev.day}</td><td>${esc(ev.name)}</td>
    <td>${o !== null ? fmtDate(o + (ev.day - 1) * DAY) : ''}</td></tr>`).join('');
  const fh = L.firstHarvest;
  const h = firstHarvestTs();
  const fhRow = fh ? `<tr class="fh"><td>Day 22 起<br>第一個週四</td><td>${esc(fh.name)}${
    fh.durationDays ? `<small>${fh.durationDays} 天</small>` : ''}</td>
    <td>${h !== null ? fmtDate(h) : ''}</td></tr>` : '';
  box.innerHTML = `<table class="lc-table"><thead><tr><th>開服第幾天</th><th>活動</th><th>日期</th></tr></thead>
    <tbody>${rows}${fhRow}</tbody></table>` + (fh && fh.note ? `<p class="lc-note">${esc(fh.note)}</p>` : '');
}

function nextHtml(e) {
  const s = activityState(e);
  if (s.status === 'unknown') {
    return !e.track
      ? '<span class="lbl">軌道</span>尚未歸類，無法推算'
      : '<span class="lbl">軌道</span>需要先設定開服日';
  }
  const t = trackOf(e);
  if (s.status === 'live') {
    return `<span class="lbl">開放中 · ${esc(t.label)}</span>`
      + `剩 ${fmtDur(s.end - Date.now())}　·　${fmtDate(s.end)} 結束`;
  }
  return `<span class="lbl">下次 · ${esc(t.label)}</span>`
    + `${fmtDate(s.start)} 開　·　還有 ${fmtDur(s.start - Date.now())}`;
}

function cardHtml(e) {
  const s = activityState(e);
  const t = trackOf(e);
  const span = e.durationDays || e.durationHours
    ? fmtDur((e.durationDays || 0) * DAY + (e.durationHours || 0) * 3600e3) : '—';
  const open = openCards.has(e.id);
  const bad = e.sightings.map(x => checkSighting(e, x)).filter(r => r.ok === false).length;

  return `<article class="card ${s.status === 'live' ? 'live' : ''} ${e.archived ? 'archived' : ''}" data-id="${e.id}">
    <div class="top">
      <div class="nm">${esc(e.name) || '（未命名）'}${
        e.aka ? `<span class="aka">${esc(e.aka)}</span>` : ''}</div>
      ${bad ? '<span class="cat bad-tag" title="有觀察與模型對不上">對不上</span>' : ''}
      ${!e.verified ? '<span class="cat todo-tag">待確認</span>' : ''}
      ${t ? `<span class="cat">${esc(t.label)}</span>` : '<span class="cat">未歸類</span>'}
    </div>
    <div class="when">
      <span>軌道：<b>${t ? `${esc(t.label)}・${WD[t.weekday]}開` : '—'}</b></span>
      <span>持續：<b>${span}</b>${e.openTime ? ' ' + esc(e.openTime) + ' 開' : ''}</span>
      <span>觀察：<b>${e.sightings.length}</b> 次</span>
    </div>
    <div class="next ${s.status}">${nextHtml(e)}</div>
    ${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}
    ${e.todo ? `<div class="todo">待確認：${esc(e.todo)}</div>` : ''}
    ${e.raw ? `<div class="raw">手寫筆記：${esc(e.raw)}</div>` : ''}
    <div class="acts">
      ${isAdmin ? `<button class="btn small" data-act="edit">編輯</button>
      <button class="btn small primary" data-act="add-sight">記一次觀察</button>` : ''}
      <button class="btn small" data-act="toggle">觀察紀錄 ${e.sightings.length ? `(${e.sightings.length})` : ''}</button>
      ${isAdmin ? `<button class="btn small danger" data-act="del">刪除</button>` : ''}
    </div>
    ${open ? sightingsHtml(e) : ''}
  </article>`;
}

const SRC_LABEL = { self: '本服實測', other: '他服回報', inferred: '推算' };

function sightingsHtml(e) {
  const items = e.sightings.length
    ? e.sightings.map(s => {
      const r = checkSighting(e, s);
      const cls = r.ok === true ? 'ok' : r.ok === false ? 'bad' : '';
      return `<div class="sg-item ${cls}" data-date="${s.date}">
        <div class="meta"><span><b>${fmtDate(tsOf(s.date))}</b>　${SRC_LABEL[s.source]}</span>
        ${isAdmin ? '<button class="del" data-act="del-sight" title="刪除這筆觀察">刪除</button>' : ''}</div>
        ${s.note ? `<div class="txt">${esc(s.note)}</div>` : ''}
        ${r.msg ? `<div class="chk">${r.ok === false ? '⚠ ' : ''}${esc(r.msg)}</div>` : ''}
      </div>`;
    }).join('')
    : '<div class="sg-none">還沒有觀察紀錄。看到這個活動開了，請用頁面右下的回報鈕告訴我們日期。</div>';
  return `<div class="sg"><div class="sg-list">${items}</div></div>`;
}

// 只更新倒數，避免整頁重畫
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
  note._t = setTimeout(() => { el.hidden = true; }, 7000);
}

/* ---------- 訪客：自己伺服器的開服日 ---------- */

function loadVisitorOpen() {
  try {
    const s = localStorage.getItem(LS_OPEN) || '';
    visitorOpen = validIso(s) ? s : '';
  } catch (err) { visitorOpen = ''; }
}

function setVisitorOpen(iso) {
  visitorOpen = validIso(iso) ? iso : '';
  try {
    if (visitorOpen) localStorage.setItem(LS_OPEN, visitorOpen);
    else localStorage.removeItem(LS_OPEN);
  } catch (err) { /* 存不了就只在這次生效 */ }
  render();
}

// 「今天是開服第 N 天」→ 反推開服日
function openFromDayCount(n, ts = Date.now()) {
  const today = new Date(ts);
  today.setHours(0, 0, 0, 0);
  return isoDate(new Date(today.getTime() - (n - 1) * DAY));
}

/* ---------- 編輯 ---------- */

function buildTrackOptions(sel) {
  sel.innerHTML = '<option value="">未歸類</option>' +
    db.tracks.map(t => `<option value="${esc(t.id)}">${esc(t.label)}（${WD[t.weekday]}開）</option>`).join('');
}

function openEdit(id) {
  editingId = id;
  const e = id ? entry(id) : blankEntry();
  $('#dlg-title').textContent = id ? '編輯項目' : '新增項目';
  $('#f-name').value = e.name;
  $('#f-aka').value = e.aka;
  $('#f-category').value = e.category;
  buildTrackOptions($('#f-track'));
  $('#f-track').value = e.track;
  $('#f-verified').checked = !e.verified;
  $('#f-todo').value = e.todo;
  $('#f-openTime').value = e.openTime;
  $('#f-durationDays').value = e.durationDays ?? '';
  $('#f-durationHours').value = e.durationHours ?? '';
  $('#f-archived').checked = e.archived;
  $('#f-note').value = e.note;
  $('#f-raw').value = e.raw;
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
    track: $('#f-track').value,
    verified: !$('#f-verified').checked,
    todo: $('#f-todo').value.trim(),
    openTime: $('#f-openTime').value,
    durationDays: numOrNull('#f-durationDays'),
    durationHours: numOrNull('#f-durationHours'),
    archived: $('#f-archived').checked,
    note: $('#f-note').value.trim(),
    raw: $('#f-raw').value.trim(),
  };
  if (editingId) {
    Object.assign(entry(editingId), patch);
  } else {
    db.entries.push({ ...openEdit._draft, ...patch });
  }
  save();
  render();
}

// 記一次觀察：這才是長期校正的入口
function addSighting(e) {
  const def = isoDate(new Date());
  const ans = prompt(`「${e.name}」是哪一天開的？（YYYY-MM-DD）\n\n填了之後系統會自動跟軌道順序對答案。`, def);
  if (ans === null) return;
  const d = ans.trim();
  if (!validIso(d)) return note('日期格式要是 YYYY-MM-DD。');
  if (e.sightings.some(s => s.date === d)) return note('這一天已經記過了。');
  const memo = prompt('備註（可留空）：例如遊戲內顯示剩多久、持續幾天', '') || '';
  e.sightings.push({ date: d, source: 'self', note: memo.trim() });
  e.sightings.sort((a, b) => a.date.localeCompare(b.date));
  openCards.add(e.id);
  save();
  render();
  const r = checkSighting(e, { date: d });
  note(r.ok === false ? `已記錄，但與模型對不上：${r.msg}` : `已記錄 ${d}。${r.msg || ''}記得匯出 JSON 並 commit。`);
}

// 管理員：設定基準服開服日
function calibrate() {
  const day = serverDay();
  const ans = prompt(
    '基準服的開服日（YYYY-MM-DD），或直接填「今天是開服第幾天」的數字。\n\n'
    + `目前：${db.server.openDate || '未設定'}${day !== null ? `（今天是開服第 ${day} 天）` : ''}`,
    db.server.openDate || '');
  if (ans === null) return;
  const s = ans.trim();
  let iso = '';
  if (/^\d+$/.test(s) && Number(s) >= 1) iso = openFromDayCount(Number(s));
  else if (validIso(s)) iso = s;
  if (!iso) return note('要填 YYYY-MM-DD 或開服第幾天的數字。');
  db.server.openDate = iso;
  save();
  render();
  note(`已設定基準服開服日 ${iso}。記得匯出 JSON 並 commit。`);
}

// 管理員：調整某條軌道的順序
function editSequence(trackId) {
  const t = db.tracks.find(x => x.id === trackId);
  if (!t) return;
  const cur = t.sequence.map(id => entryName(id)).join('、');
  const ans = prompt(
    `「${t.label}」的輪替順序（用、或逗號分隔活動名稱）：\n\n`
    + '改完後所有觀察紀錄會重新對答案。', cur);
  if (ans === null) return;
  const names = ans.split(/[、,，/\s]+/).map(x => x.trim()).filter(Boolean);
  const ids = [];
  for (const n of names) {
    const e = db.entries.find(x => x.name === n);
    if (!e) return note(`找不到叫「${n}」的活動。`);
    ids.push(e.id);
    e.track = t.id;
  }
  t.sequence = ids;
  save();
  render();
  const st = sightingStats();
  note(`順序已更新。${st.total} 筆觀察中 ${st.hit} 筆相符${st.miss ? `、${st.miss} 筆仍對不上` : '，全部吻合'}。`);
}

/* ---------- JSON 匯出／匯入 ---------- */

function jsonText() {
  return JSON.stringify({ ...db, schema: 'cycles-v4' }, null, 2) + '\n';
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

  // 訪客的伺服器開服日
  $('#srv-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const iso = $('#srv-open').value;
    if (!validIso(iso)) return note('請選一個日期。');
    setVisitorOpen(iso);
    note(`已改用 ${iso} 開服推算，只存在你這台瀏覽器。`);
  });
  $('#srv-by-day').addEventListener('click', () => {
    const ans = prompt('遊戲內今天是開服第幾天？（開服當天算第 1 天）');
    if (ans === null) return;
    const n = Number(ans.trim());
    if (!(Number.isInteger(n) && n >= 1)) return note('要填 1 以上的整數。');
    const iso = openFromDayCount(n);
    setVisitorOpen(iso);
    note(`反推開服日為 ${iso}，已套用（只存在你這台瀏覽器）。`);
  });
  $('#srv-reset').addEventListener('click', () => {
    setVisitorOpen('');
    note('已還原為基準服的開服日。');
  });

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
    if (act === 'seq-main') editSequence('main');
    if (act === 'seq-short') editSequence('short');
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
    const act = btn.dataset.act;
    // 訪客只能展開觀察紀錄；其餘動作即使被人手動塞回 DOM 也不執行
    if (act !== 'toggle' && !isAdmin) return;

    switch (act) {
      case 'edit':
        openEdit(id);
        break;
      case 'add-sight':
        addSighting(e);
        break;
      case 'del':
        if (!confirm(`刪除「${e.name}」？連同 ${e.sightings.length} 筆觀察紀錄一起移除，無法復原。`)) return;
        db.entries = db.entries.filter(x => x.id !== id);
        db.tracks.forEach(t => { t.sequence = t.sequence.filter(x => x !== id); });
        openCards.delete(id);
        save();
        render();
        break;
      case 'toggle':
        openCards.has(id) ? openCards.delete(id) : openCards.add(id);
        render();
        break;
      case 'del-sight': {
        const d = btn.closest('.sg-item').dataset.date;
        if (!confirm(`刪除 ${d} 這筆觀察？`)) return;
        e.sightings = e.sightings.filter(s => s.date !== d);
        save();
        render();
        break;
      }
    }
  });

  // 時間軸下方的軌道順序，管理員點了可以改
  $('#tl-notes').addEventListener('click', ev => {
    if (!isAdmin) return;
    const li = ev.target.closest('li');
    if (!li) return;
    editSequence(db.tracks[[...li.parentNode.children].indexOf(li)].id);
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
  const pick = x => JSON.stringify({ e: x.entries, t: x.tracks, s: x.status, v: x.server, l: x.launch });
  el.hidden = pick(db) === pick(migrate(published));
  if (!el.hidden) {
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
  loadVisitorOpen();
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
