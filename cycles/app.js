/* 星慾姬絆 活動日誌
   內容是公開的：任何人打開都看得到輪替表，資料就是 data/cycles.json。
   編輯功能藏在管理員密碼後面 —— 但要講清楚，這道門只擋 UI：
   站上真正的內容由 repo 裡的 cycles.json 決定，所以實際的修改權限
   等於 git push 權限。管理員在自己瀏覽器改完後匯出 JSON、commit，才會影響別人。

   資料模型（v3）：巡獵時程跟著「開服第幾天」走，每個伺服器開服日不同，
   所以日期一律由 開服日 + 天數 推算，不綁星期幾。
   - rotation.serverOpenDate：本站基準服的開服日（Day 1）
   - rotation.cycleDays：一輪幾天（官方活動日誌畫到 Week 7 = 49 天）
   - entry.days：該活動在一輪裡的第幾天開（1-based），與 entry.weeks（官方週次標籤）逐一對應
   訪客可以填自己伺服器的開服日，只存在自己瀏覽器，不影響站上資料。 */

const DATA_URL = 'data/cycles.json';
const LS_KEY = 'roe-cycles-draft-v3';   // 管理員尚未匯出的草稿
const LS_ADMIN = 'roe-cycles-admin-v1'; // 這台瀏覽器已通過管理員驗證
const LS_OPEN = 'roe-cycles-open-v1';   // 訪客自己伺服器的開服日
const PBKDF2_ITER = 250000;
const ADMIN_SALT = 'roe-cycles-admin';  // 固定 salt，只為了讓暴力破解變貴

// 管理員密碼的 PBKDF2-SHA256 雜湊（hex）。空字串＝尚未設定，編輯功能停用。
const ADMIN_HASH = 'cc06ce05dc09f374f90620b8f1d465b035082768c0034e0ff7aeeaf8a151a768';

// 回報管道
// giscus 留言板：留言存在 GitHub Discussions，訪客需有 GitHub 帳號。
// CATEGORY_ID 要等 repo 開啟 Discussions 後才拿得到；留空則改顯示 GitHub Issue 回報連結。
const GISCUS_REPO = 'pinpin12040720-hub/roe';
const GISCUS_REPO_ID = 'R_kgDOTJWkkA';
const GISCUS_CATEGORY = 'General';
const GISCUS_CATEGORY_ID = '';
const ISSUE_URL = 'https://github.com/pinpin12040720-hub/roe/issues/new';

const WD = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];
const DAY = 86400000;

let db = null;            // 目前資料
let published = null;     // 站上那份（data/cycles.json），用來判斷草稿有沒有差異
let isAdmin = false;
let editingId = null;     // 正在編輯的項目 id；null = 新增
let visitorOpen = '';     // 訪客自己填的開服日（YYYY-MM-DD），空＝用基準服
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
    name: '', aka: '', category: '', weeks: [], days: [], openTime: '',
    verified: false, todo: '',
    durationDays: null, durationHours: null, lastSeen: '',
    note: '', raw: '', archived: false, comments: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

const DEFAULT_ROTATION = {
  cycleDays: 49, serverOpenDate: '', serverLabel: '本站基準服',
  rules: [], openNote: '', adminNote: '',
};
const DEFAULT_STATUS = { level: 'unverified', basis: '', note: '' };

const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const validIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00').getTime());

// 補齊缺欄位，容忍手改過的 JSON；v2（週一對齊的七週輪替）會自動換算成天數
function migrate(data) {
  const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
  const r = data.rotation || {};
  const isV2 = !r.cycleDays && r.anchorDate;   // 舊模型：anchorDate（某次 Week 1 的週一）+ totalWeeks
  const totalWeeks = Number(r.totalWeeks) || 7;
  const cycleDays = Number(r.cycleDays) || totalWeeks * 7;

  // v2 → v3：基準服 07-29 開服、舊錨點 07-27，Day = (week-1)*7 + startDay - 2
  let serverOpen = String(r.serverOpenDate || '');
  let v2Shift = 0;
  if (isV2 && !serverOpen) {
    serverOpen = data.serverOpenDate || '2026-07-29';
    const a = new Date(r.anchorDate + 'T00:00:00'), o = new Date(serverOpen + 'T00:00:00');
    v2Shift = Math.round((o - a) / DAY);   // 開服日比錨點晚幾天
  }

  const out = {
    schema: 'cycles-v3',
    title: data.title || '活動日誌',
    source: data.source || '',
    updatedAt: data.updatedAt || '',
    status: {
      ...DEFAULT_STATUS,
      ...(data.status || {}),
      level: (data.status && data.status.level) || 'unverified',
    },
    rotation: {
      ...DEFAULT_ROTATION,
      serverLabel: String(r.serverLabel || DEFAULT_ROTATION.serverLabel),
      cycleDays,
      serverOpenDate: validIso(serverOpen) ? serverOpen : '',
      rules: Array.isArray(r.rules) ? r.rules.map(String) : [],
      openNote: String(r.openNote || ''),
      adminNote: String(r.adminNote || r.anchorNote || ''),
    },
    weeks: [],
    entries: [],
  };

  // 週次表（官方活動日誌的標籤）：補滿 1..N，缺的用空的
  const totalLabels = Math.max(1, Math.round(cycleDays / 7));
  const given = Array.isArray(data.weeks) ? data.weeks : [];
  for (let n = 1; n <= totalLabels; n++) {
    const w = given.find(x => Number(x.n) === n) || {};
    out.weeks.push({
      n,
      label: String(w.label || ''),
      activities: (Array.isArray(w.activities) ? w.activities : []).map(String),
    });
  }

  const list = Array.isArray(data.entries) ? data.entries : [];
  out.entries = list.map(e => {
    const b = blankEntry();
    const weeks = (Array.isArray(e.weeks) ? e.weeks : [])
      .map(Number).filter(n => n >= 1 && n <= totalLabels).sort((a, c) => a - c);
    let days = (Array.isArray(e.days) ? e.days : [])
      .map(Number).filter(n => n >= 1 && n <= cycleDays).sort((a, c) => a - c);
    if (!days.length && isV2 && weeks.length) {
      // 舊資料只有 weeks + startDay：Week 1–3 官方本來就寫 Day 1–21（從開服日起算），
      // Week 4 起才對齊週一，換算時要扣掉開服日與錨點的差
      const sd = Number(e.startDay) >= 1 ? Number(e.startDay) : 1;
      days = weeks.map(w => (w <= 3 ? (w - 1) * 7 + sd : (w - 1) * 7 + sd - v2Shift))
        .filter(n => n >= 1 && n <= cycleDays);
    }
    return {
      ...b, ...e,
      id: e.id || b.id,
      name: String(e.name || ''),
      aka: String(e.aka || ''),
      // 舊資料沒有 verified 就當已確認，免得整批被標成待確認
      verified: e.verified === undefined ? true : !!e.verified,
      todo: String(e.todo || ''),
      category: String(e.category || ''),
      weeks,
      days,
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
  }).map(e => { delete e.startDay; return e; });
  return out;
}

// 只有管理員會產生草稿；訪客不寫入任何東西（訪客的開服日另存，見 setVisitorOpen）
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

/* ---------- 開服日推算 ---------- */

function isoDay(d) { return ((d.getDay() + 6) % 7) + 1; }   // 1=週一 … 7=週日

// 目前用哪個開服日：訪客自己填的優先，否則基準服
function openDate() {
  const s = visitorOpen || (db && db.rotation.serverOpenDate) || '';
  if (!validIso(s)) return null;
  return new Date(s + 'T00:00:00').getTime();
}

// 開服第幾天（Day 1 = 開服當天）。沒有開服日就算不出來。
function serverDay(ts = Date.now()) {
  const open = openDate();
  if (open === null) return null;
  return Math.floor((ts - open) / DAY) + 1;
}

// 目前落在第幾輪的第幾天
function cyclePos(ts = Date.now()) {
  const day = serverDay(ts);
  if (day === null) return null;
  const total = db.rotation.cycleDays;
  const idx = Math.floor((day - 1) / total);          // 第 0 輪 = 開服後第一輪
  const pos = ((((day - 1) % total) + total) % total) + 1;
  return { day, cycle: idx, pos, total, cycleStart: openDate() + idx * total * DAY };
}

// 某週次列在一輪裡的起始天（該列活動裡最早的 Day），沒資料回 null
function weekStartDay(w) {
  const days = w.activities.map(nm => {
    const e = db.entries.find(x => x.name === nm && !x.archived) || db.entries.find(x => x.name === nm);
    if (!e) return null;
    const i = e.weeks.indexOf(w.n);
    return i >= 0 && e.days[i] ? e.days[i] : (e.days[0] || null);
  }).filter(d => d !== null);
  return days.length ? Math.min(...days) : null;
}

// 目前對應官方哪一個 Week：最後一個「起始天 <= 目前 Day」的列
function currentWeekLabel(pos) {
  let cur = null;
  db.weeks.forEach(w => {
    const s = weekStartDay(w);
    if (s !== null && s <= pos && (cur === null || s >= weekStartDay(cur))) cur = w;
  });
  return cur;
}

// 活動每一場的開始時刻：開服日 + (輪數*一輪天數 + Day - 1) 天 + 開放時刻
function occurrenceStart(e, cycle, day) {
  const open = openDate();
  let t = open + (cycle * db.rotation.cycleDays + day - 1) * DAY;
  const m = /^(\d{2}):(\d{2})$/.exec(e.openTime || '');
  if (m) t += (Number(m[1]) * 60 + Number(m[2])) * 60000;
  return t;
}

// 某活動的狀態：live（開放中）/ upcoming（還沒到）/ unknown
function activityState(e, ts = Date.now()) {
  const cur = cyclePos(ts);
  const days = e.days || [];
  if (!cur || !days.length) return { status: 'unknown' };
  const span = (e.durationDays || 0) * DAY + (e.durationHours || 0) * 3600e3;

  // 從上一輪掃到下一輪，找第一個還沒結束的場次
  for (let c = cur.cycle - 1; c <= cur.cycle + 1; c++) {
    for (const d of days) {
      const start = occurrenceStart(e, c, d);
      // 沒填持續時間就當它開 7 天
      const end = start + (span > 0 ? span : 7 * DAY);
      if (ts >= start && ts < end) return { status: 'live', day: d, cycle: c, start, end };
      if (ts < start) return { status: 'upcoming', day: d, cycle: c, start, end };
    }
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
    return !(e.days || []).length
      ? `<span class="lbl">開放日</span>尚未設定`
      : `<span class="lbl">開放日</span>需要先填開服日才能推算`;
  }
  const dayLbl = `Day ${s.day}${s.cycle > 0 ? ` · 第 ${s.cycle + 1} 輪` : ''}`;
  if (s.status === 'live') {
    return `<span class="lbl">開放中 · ${dayLbl}</span>`
      + `剩 ${fmtDur(s.end - Date.now())}　·　${fmtDate(s.end)} 結束`;
  }
  return `<span class="lbl">下次 · ${dayLbl}</span>`
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
  renderStatus();
  renderServer();
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

// 資料狀態標籤：整頁層級的「這些能不能盡信」
function renderStatus() {
  const st = db.status;
  const unverified = db.entries.filter(e => !e.archived && !e.verified).length;
  const total = db.entries.filter(e => !e.archived).length;
  const lvl = st.level === 'verified' ? '已確認' : st.level === 'partial' ? '部分確認' : '待確認';
  $('#stat-level').textContent = lvl;
  $('#stat-level').className = 'stat-tag ' + (st.level === 'verified' ? 'ok' : 'todo');
  $('#stat-basis').textContent = st.basis || '';
  $('#stat-meta').textContent = [
    db.updatedAt ? `最後更新 ${db.updatedAt}` : '',
    total ? `${total} 個活動中 ${unverified} 個待確認` : '',
  ].filter(Boolean).join('　·　');
  $('#stat-note').textContent = st.note || '';
  $('#stat-note').hidden = !st.note;
  $('#stat-report').href = issueUrl(null);
}

// 伺服器列：目前用哪個開服日在算
function renderServer() {
  const base = db.rotation.serverOpenDate;
  const using = visitorOpen || base;
  const day = serverDay();
  $('#srv-open').value = visitorOpen || '';
  $('#srv-open').placeholder = base || 'YYYY-MM-DD';
  $('#srv-reset').hidden = !visitorOpen;
  $('#srv-now').innerHTML = using
    ? `${visitorOpen ? '你的伺服器' : esc(db.rotation.serverLabel)} <b>${esc(using)}</b> 開服`
      + (day !== null ? `　·　今天是開服第 <b>${day}</b> 天` : '')
    : '<b>尚未設定開服日</b> —— 填了才能推算日期。';
}

// 輪替總表：官方活動日誌的內容，目前這一列會被標出來
function renderRotation() {
  const cur = cyclePos();
  const r = db.rotation;
  const curW = cur ? currentWeekLabel(cur.pos) : null;

  $('#rot-now').innerHTML = cur
    ? `目前是第 <b>${cur.cycle + 1}</b> 輪 <b>Day ${cur.pos}</b>`
      + (curW ? `　·　對應官方 <b>Week ${curW.n}</b>` : '')
    : '<b>尚未設定開服日</b> —— 填了才能推算目前進度與倒數。';

  $('#rot-body').innerHTML = db.weeks.map(w => {
    const on = curW && curW.n === w.n;
    const startDay = weekStartDay(w);
    let dates = '';
    if (cur && startDay !== null) {
      // 這一列在目前這一輪的日期；已經過了就顯示下一輪的
      let c = cur.cycle;
      if (startDay < cur.pos && !on) c += 1;
      const ts = openDate() + (c * cur.total + startDay - 1) * DAY;
      dates = fmtDate(ts) + (c !== cur.cycle ? '（下一輪）' : '');
    }
    const chips = w.activities.map(nm => {
      const e = db.entries.find(x => x.name === nm);
      const i = e ? e.weeks.indexOf(w.n) : -1;
      const d = e && i >= 0 && e.days[i] ? e.days[i] : null;
      const unv = e && !e.verified;
      return `<span class="chip${unv ? ' unv' : ''}" title="${unv ? '待確認' : ''}">${esc(nm)}${
        d ? `<small>Day ${d}</small>` : ''}</span>`;
    }).join('');
    return `<tr class="${on ? 'now' : ''}">
      <td class="wk">Week ${w.n}${on ? ' <span class="badge">目前</span>' : ''}</td>
      <td class="when">${esc(w.label || '—')}</td>
      <td class="acts">${chips || '—'}</td>
      <td class="dt">${dates ? dates + ' 起' : ''}</td>
    </tr>`;
  }).join('');

  const rules = (r.rules || []).map(x => `<li>${esc(x)}</li>`).join('');
  $('#rot-rules').innerHTML = rules ? `<ul>${rules}</ul>` : '';
  // openNote 是給所有人看的（哪裡還沒確認）；adminNote 是推導過程，只給管理員
  $('#rot-note').textContent = isAdmin
    ? [r.openNote, r.adminNote].filter(Boolean).join('　')
    : (r.openNote || '');
  $('#rot-note').hidden = !$('#rot-note').textContent;
}

function cardHtml(e) {
  const s = activityState(e);
  const days = (e.days || []).length
    ? e.days.map((d, i) => `Day ${d}${e.weeks[i] ? `<small>W${e.weeks[i]}</small>` : ''}`).join('、') : '—';
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
      <span>開放日：<b>${days}</b>${e.openTime ? ' ' + esc(e.openTime) : ''}</span>
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
      <button class="btn small" data-act="toggle-cm">${isAdmin ? '筆記' : '觀察紀錄'} ${e.comments.length ? `(${e.comments.length})` : ''}</button>
      <a class="btn small" href="${issueUrl(e)}" target="_blank" rel="noopener">回報修正</a>
      ${isAdmin ? `<button class="btn small danger" data-act="del">刪除</button>` : ''}
    </div>
    ${open ? commentsHtml(e) : ''}
  </article>`;
}

// 開一則 GitHub Issue 的連結，標題與內文先帶好，回報的人只要補觀察到的日期
function issueUrl(e) {
  const u = new URL(ISSUE_URL);
  const srv = visitorOpen ? `我的伺服器開服日：${visitorOpen}` : `伺服器：${db.rotation.serverLabel}（${db.rotation.serverOpenDate} 開服）`;
  if (e) {
    u.searchParams.set('title', `[週期表] ${e.name} 時程修正`);
    u.searchParams.set('body',
      `活動：${e.name}\n目前站上寫的開放日：${(e.days || []).map(d => 'Day ' + d).join('、') || '未填'}\n${srv}\n\n`
      + `實際觀察到的開放日期／時刻：\n\n持續多久：\n\n其他補充：\n`);
  } else {
    u.searchParams.set('title', '[週期表] 修正建議');
    u.searchParams.set('body', `${srv}\n\n要修正的地方：\n\n實際觀察：\n`);
  }
  return u.toString();
}

function commentsHtml(e) {
  const items = e.comments.length
    ? e.comments.map(c => `<div class="cm-item" data-cid="${c.id}">
        <div class="meta"><span>${esc(new Date(c.at).toLocaleString('zh-TW', { hour12: false }))}</span>
        ${isAdmin ? `<button class="del" data-act="del-cm" title="刪除這則筆記">刪除</button>` : ''}</div>
        <div class="txt">${esc(c.text)}</div>
      </div>`).join('')
    : `<div class="cm-none">還沒有觀察紀錄。</div>`;

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

function buildWeekBoxes() {
  const total = (db && db.weeks.length) || 7;
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
  $('#f-days').value = (e.days || []).join(', ');
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

// 「1, 27」→ [1, 27]；超出一輪天數的丟掉
function parseDays(text) {
  const total = db.rotation.cycleDays;
  return [...new Set(String(text).split(/[、,，/\s]+/).map(Number)
    .filter(n => Number.isInteger(n) && n >= 1 && n <= total))].sort((a, b) => a - b);
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
    days: parseDays($('#f-days').value),
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

// 管理員：設定基準服的開服日（直接填日期，或填「今天是開服第幾天」反推）
function calibrate() {
  const cur = cyclePos();
  const ans = prompt(
    `基準服的開服日（YYYY-MM-DD），或直接填「今天是開服第幾天」的數字。\n\n`
    + `目前：${db.rotation.serverOpenDate || '未設定'}${cur ? `（今天是開服第 ${cur.day} 天）` : ''}`,
    db.rotation.serverOpenDate || '');
  if (ans === null) return;
  const s = ans.trim();
  let iso = '';
  if (/^\d+$/.test(s) && Number(s) >= 1) iso = openFromDayCount(Number(s));
  else if (validIso(s)) iso = s;
  if (!iso) return note('要填 YYYY-MM-DD 或開服第幾天的數字。');

  db.rotation.serverOpenDate = iso;
  db.rotation.adminNote = `${db.rotation.adminNote ? db.rotation.adminNote + '　' : ''}由管理員於 ${isoDate(new Date())} 將基準服開服日設為 ${iso}。`;
  save();
  render();
  note(`已設定基準服開服日 ${iso}。記得匯出 JSON 並 commit。`);
}

/* ---------- JSON 匯出／匯入 ---------- */

function jsonText() {
  return JSON.stringify({ ...db, schema: 'cycles-v3' }, null, 2) + '\n';
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

    // 訪客只能展開觀察紀錄；其餘動作即使被人手動塞回 DOM 也不執行
    const act = btn.dataset.act;
    if (act !== 'toggle-cm' && !isAdmin) return;

    switch (act) {
      case 'edit':
        openEdit(id);
        break;
      case 'dup': {
        // 沿用原項目所有欄位，只換掉 id／名稱／時間戳，筆記不跟著複製
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
        if (!confirm(`刪除「${e.name}」？連同 ${e.comments.length} 則筆記一起移除，無法復原。`)) return;
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
        if (!confirm('刪除這則筆記？')) return;
        e.comments = e.comments.filter(c => c.id !== cid);
        save();
        render();
        break;
      }
    }
  });

  // Ctrl+Enter 送出筆記
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
  const a = JSON.stringify({ e: db.entries, w: db.weeks, r: db.rotation, s: db.status });
  const p = migrate(published);
  const b = JSON.stringify({ e: p.entries, w: p.weeks, r: p.rotation, s: p.status });
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

// 留言板：giscus 接好就載入；沒接好就給 GitHub Issue 連結，訪客一樣有地方回報
function mountGiscus() {
  const off = $('#giscus-off');
  if (!GISCUS_CATEGORY_ID) {
    off.hidden = false;
    off.innerHTML = `討論區（GitHub Discussions）尚未啟用，回報請先開一則 GitHub Issue：`
      + `<a class="btn small" href="${issueUrl(null)}" target="_blank" rel="noopener">回報修正 ↗</a>`
      + (isAdmin ? `<br><small>管理員：repo 要先開啟 Discussions、安裝 giscus app，再把 category id 填進 app.js 的 GISCUS_CATEGORY_ID。</small>` : '');
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

  buildWeekBoxes();
  applyRole();
  render();
  mountGiscus();
}

init();
