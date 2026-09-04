/* 全站「回報問題」表單 —— 不走 GitHub。
 * 送出的內容是一筆 JSON，POST 到 ENDPOINT（Google Apps Script 網頁應用程式，寫進 Google Sheet）。
 * ENDPOINT 留空、離線或送失敗時，先存進這台瀏覽器的 localStorage 佇列，下次開站自動重送；
 * 訪客也可在表單裡匯出／複製自己的回報 JSON 貼給站長。
 *
 * 用法：任何頁面 </body> 前加 <script src="…/assets/report.js" defer></script> 即可出現浮動按鈕。
 * 其他腳本可呼叫 window.RoeReport.open({ type, message, subject }) 帶入預填內容。
 * 設定端點：改下面的 ENDPOINT，或在載入前設 window.ROE_REPORT_ENDPOINT。
 */
(function () {
  'use strict';
  if (window.RoeReport) return;

  var ENDPOINT = window.ROE_REPORT_ENDPOINT || '';
  var ME = document.currentScript; // defer 載入時 boot 才跑，那時 currentScript 已是 null，先記下來
  var LS_HISTORY = 'roe-report-history';   // 這台瀏覽器送過的回報（含狀態）
  var LS_LAST = 'roe-report-last';
  var MAX_HISTORY = 100;
  var MIN_INTERVAL = 20000;               // 兩次送出至少間隔 20 秒
  var TIMEOUT = 12000;
  var MAX_ATTEMPTS = 5;

  var TYPES = [
    ['typo', '錯字／排版'],
    ['data', '數值或資料錯誤'],
    ['term', '名詞與遊戲內不一致'],
    ['schedule', '活動時程不對'],
    ['bug', '網頁功能問題'],
    ['idea', '建議新增內容'],
    ['other', '其他'],
  ];

  /* ---------- 小工具 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  // 目前在哪個遊戲：從各頁切換列的「目前所在」抓，抓不到就用 <title>
  function gameName() {
    var el = $('.ed-games .cur') || $('.game-switch .gs.active') || $('.back-to-roe.cur-game');
    var t = el ? el.textContent.trim() : '';
    return t || (document.title.split(/[—｜|\-]/)[0] || '').trim();
  }
  function pageInfo() {
    return {
      game: gameName(),
      page: document.title,
      url: location.href.split('#')[0],
      hash: location.hash || '',
    };
  }

  /* ---------- 歷史／佇列 ---------- */
  function history() { var h = lsGet(LS_HISTORY, []); return Array.isArray(h) ? h : []; }
  function saveHistory(h) { lsSet(LS_HISTORY, h.slice(-MAX_HISTORY)); }
  function upsert(rec) {
    var h = history(), i = -1;
    for (var k = 0; k < h.length; k++) if (h[k].id === rec.id) { i = k; break; }
    if (i >= 0) h[i] = rec; else h.push(rec);
    saveHistory(h);
  }
  function pending() { return history().filter(function (r) { return r.status === 'queued'; }); }

  /* ---------- 送出 ---------- */
  function post(payload) {
    if (!ENDPOINT) return Promise.reject(new Error('no-endpoint'));
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, TIMEOUT);
    // Content-Type 用 text/plain 才不會觸發 preflight；Apps Script 端用 JSON.parse(e.postData.contents)
    return fetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      redirect: 'follow',
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('http-' + res.status);
      return res.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) { /* 非 JSON 也當成功 */ }
        if (j && j.ok === false) throw new Error(j.error || 'server-rejected');
        return j || { ok: true };
      });
    }, function (err) { if (timer) clearTimeout(timer); throw err; });
  }

  function send(rec) {
    rec.attempts = (rec.attempts || 0) + 1;
    return post(rec.payload).then(function () {
      rec.status = 'sent'; rec.sentAt = new Date().toISOString(); upsert(rec); return rec;
    }, function (err) {
      rec.status = (ENDPOINT && rec.attempts < MAX_ATTEMPTS) ? 'queued' : (ENDPOINT ? 'failed' : 'local');
      rec.error = String(err && err.message || err); upsert(rec); throw err;
    });
  }

  // 開站時把上次沒送出去的補送
  function flushQueue() {
    if (!ENDPOINT || !navigator.onLine) return;
    var q = pending();
    (function next(i) {
      if (i >= q.length) return;
      send(q[i]).then(function () { next(i + 1); }, function () { next(i + 1); });
    })(0);
  }

  /* ---------- UI ---------- */
  var CSS = '\
.rr-fab{position:fixed;right:16px;bottom:var(--rr-fab-bottom,18px);z-index:990;display:inline-flex;align-items:center;gap:6px;\
 padding:9px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:linear-gradient(120deg,#c23b8a,#7a4ec2);\
 color:#fff;font:700 13px/1 "Outfit",system-ui,"Microsoft JhengHei",sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.45);transition:.15s}\
.rr-fab:hover{transform:translateY(-1px);box-shadow:0 10px 28px rgba(0,0,0,.55)}\
.rr-fab svg{width:14px;height:14px}\
@media (max-width:560px){.rr-fab{padding:10px 12px}.rr-fab span{display:none}}\
.rr-dlg{color-scheme:dark;background:#1d1329;color:#eee6f2;border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:0;\
 width:min(540px,calc(100% - 24px));max-height:calc(100dvh - 24px);box-shadow:0 20px 60px rgba(0,0,0,.6);\
 font:14px/1.55 "Outfit","DM Sans",system-ui,"Microsoft JhengHei",sans-serif}\
.rr-dlg::backdrop{background:rgba(10,6,16,.72);backdrop-filter:blur(2px)}\
.rr-dlg[open]{display:flex;flex-direction:column}\
.rr-head{display:flex;align-items:center;gap:10px;padding:14px 18px 10px;border-bottom:1px solid rgba(255,255,255,.1)}\
.rr-head h2{margin:0;font-size:17px;font-weight:800;flex:1}\
.rr-x{background:none;border:0;color:#b6a7c6;font-size:20px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:8px}\
.rr-x:hover{background:rgba(255,255,255,.08);color:#fff}\
.rr-body{padding:12px 18px 6px;overflow:auto}\
.rr-ctx{font-size:12.5px;color:#b6a7c6;background:#140c1c;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 11px;margin-bottom:12px;word-break:break-all}\
.rr-ctx b{color:#e79cc9;font-weight:700}\
.rr-f{display:block;margin-bottom:11px}\
.rr-f>span{display:block;font-size:12.5px;color:#cdb4e0;font-weight:700;margin-bottom:4px}\
.rr-f select,.rr-f textarea,.rr-f input{width:100%;background:#140c1c;border:1px solid rgba(255,255,255,.16);color:#eee6f2;border-radius:9px;padding:8px 11px;font:inherit}\
.rr-f textarea{min-height:110px;resize:vertical}\
.rr-f select:focus,.rr-f textarea:focus,.rr-f input:focus{outline:none;border-color:#e79cc9}\
.rr-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}\
.rr-msg{font-size:13px;padding:8px 11px;border-radius:9px;margin:0 0 10px;display:none}\
.rr-msg.ok{display:block;background:rgba(122,220,170,.12);border:1px solid rgba(122,220,170,.45);color:#b9f0d2}\
.rr-msg.warn{display:block;background:rgba(255,179,122,.12);border:1px solid rgba(255,179,122,.5);color:#ffd2b0}\
.rr-msg.err{display:block;background:rgba(255,122,122,.12);border:1px solid rgba(255,122,122,.5);color:#ffc2c2}\
.rr-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 18px 14px;border-top:1px solid rgba(255,255,255,.1)}\
.rr-btn{background:#241634;border:1px solid rgba(255,255,255,.16);color:#eee6f2;border-radius:9px;padding:8px 14px;font:700 13.5px "Outfit",system-ui,sans-serif;cursor:pointer;transition:.15s}\
.rr-btn:hover{border-color:#e79cc9;color:#fff}\
.rr-btn.pri{background:linear-gradient(120deg,#c23b8a,#7a4ec2);border-color:transparent;color:#fff}\
.rr-btn[disabled]{opacity:.5;cursor:default}\
.rr-link{margin-left:auto;background:none;border:0;color:#b6a7c6;font:12.5px "Outfit",system-ui,sans-serif;cursor:pointer;text-decoration:underline dotted}\
.rr-link:hover{color:#e79cc9}\
.rr-hist{padding:0 18px 12px;font-size:12.5px;color:#b6a7c6}\
.rr-hist ul{list-style:none;margin:6px 0;padding:0;max-height:160px;overflow:auto}\
.rr-hist li{padding:5px 0;border-bottom:1px dashed rgba(255,255,255,.12);display:flex;gap:8px;align-items:baseline}\
.rr-hist li .t{color:#eee6f2;flex:1;word-break:break-word}\
.rr-st{font-size:11px;border-radius:999px;padding:1px 8px;border:1px solid rgba(255,255,255,.18);white-space:nowrap}\
.rr-st.sent{color:#9be8c4;border-color:rgba(122,220,170,.5)}.rr-st.queued,.rr-st.local{color:#ffd2b0;border-color:rgba(255,179,122,.5)}.rr-st.failed{color:#ffc2c2;border-color:rgba(255,122,122,.5)}\
.rr-hist .acts{display:flex;gap:6px;flex-wrap:wrap}\
.rr-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1001;background:#1d1329;color:#eee6f2;border:1px solid rgba(231,156,201,.5);border-radius:10px;padding:9px 14px;font:13.5px "Outfit",system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);opacity:0;transition:.25s;pointer-events:none;max-width:calc(100% - 32px)}\
.rr-toast.show{opacity:1}\
';

  var dlg, fab, toastEl, lastSubmit = 0, prefill = null;

  function injectCss() {
    var st = document.createElement('style'); st.id = 'rr-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  function buildFab() {
    fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'rr-fab'; fab.setAttribute('aria-label', '回報問題');
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span>回報問題</span>';
    var b = ME && ME.getAttribute('data-fab-bottom');
    if (b) fab.style.setProperty('--rr-fab-bottom', b);
    fab.addEventListener('click', function () { open(); });
    document.body.appendChild(fab);
  }

  function buildDialog() {
    dlg = document.createElement('dialog');
    dlg.className = 'rr-dlg';
    dlg.innerHTML =
      '<form method="dialog" class="rr-form" novalidate>' +
      '<div class="rr-head"><h2>回報問題</h2><button type="button" class="rr-x" aria-label="關閉">×</button></div>' +
      '<div class="rr-body">' +
      '<div class="rr-ctx" id="rr-ctx"></div>' +
      '<p class="rr-msg" id="rr-msg"></p>' +
      '<label class="rr-f"><span>問題類型</span><select id="rr-type">' +
      TYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="rr-f"><span>哪裡不對、正確應該是什麼</span><textarea id="rr-msg-in" maxlength="2000" placeholder="例：第 3 段寫辛子 4 星開被動，遊戲內是 3 星。&#10;請盡量寫出頁面上的原文與遊戲內實際寫法。" required></textarea></label>' +
      '<label class="rr-f"><span>聯絡方式（選填，方便追問，例如 Discord 名稱）</span><input id="rr-contact" maxlength="120" autocomplete="off"></label>' +
      '<label class="rr-hp" aria-hidden="true">網站<input id="rr-web" tabindex="-1" autocomplete="off"></label>' +
      '</div>' +
      '<div class="rr-foot">' +
      '<button type="submit" class="rr-btn pri" id="rr-send">送出回報</button>' +
      '<button type="button" class="rr-btn" id="rr-cancel">取消</button>' +
      '<button type="button" class="rr-link" id="rr-hist-btn">我的回報紀錄</button>' +
      '</div>' +
      '<div class="rr-hist" id="rr-hist" hidden></div>' +
      '</form>';
    document.body.appendChild(dlg);

    $('.rr-x', dlg).addEventListener('click', close);
    $('#rr-cancel', dlg).addEventListener('click', close);
    $('#rr-hist-btn', dlg).addEventListener('click', toggleHistory);
    $('.rr-form', dlg).addEventListener('submit', function (ev) { ev.preventDefault(); submit(); });
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) close(); }); // 點背景關閉
    dlg.addEventListener('cancel', function (ev) { ev.preventDefault(); close(); });
  }

  function setMsg(kind, text) {
    var m = $('#rr-msg', dlg); m.className = 'rr-msg' + (kind ? ' ' + kind : ''); m.textContent = text || '';
  }

  function toast(text) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'rr-toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = text; toastEl.classList.add('show');
    clearTimeout(toastEl._t); toastEl._t = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }

  function open(opts) {
    prefill = opts || null;
    var info = pageInfo();
    $('#rr-ctx', dlg).innerHTML =
      '<b>' + esc(info.game) + '</b>　' + esc(prefill && prefill.subject ? prefill.subject : info.page) +
      '<br><span style="opacity:.75">' + esc(info.url + info.hash) + '</span>';
    if (prefill && prefill.type) $('#rr-type', dlg).value = prefill.type;
    var ta = $('#rr-msg-in', dlg);
    if (prefill && prefill.message) ta.value = prefill.message;
    $('#rr-contact', dlg).value = lsGet(LS_LAST, {}).contact || '';
    $('#rr-hist', dlg).hidden = true;
    setMsg('', '');
    if (!ENDPOINT) setMsg('warn', '收件端點尚未設定：送出後會先存在你的瀏覽器，可用「我的回報紀錄」匯出 JSON 貼給站長。');
    $('#rr-send', dlg).disabled = false;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(function () { ta.focus(); if (prefill && prefill.message) ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
  }
  function close() { if (dlg.open) dlg.close(); else dlg.removeAttribute('open'); }

  function submit() {
    var ta = $('#rr-msg-in', dlg), msg = ta.value.trim();
    if ($('#rr-web', dlg).value) { close(); return; } // 蜜罐：機器人填了就靜靜丟掉
    if (msg.length < 5) { setMsg('err', '請至少描述一下哪裡不對（5 個字以上）。'); ta.focus(); return; }
    var now = Date.now();
    if (now - lastSubmit < MIN_INTERVAL) { setMsg('warn', '剛剛才送過一筆，請稍等 ' + Math.ceil((MIN_INTERVAL - (now - lastSubmit)) / 1000) + ' 秒。'); return; }

    var info = pageInfo();
    var contact = $('#rr-contact', dlg).value.trim();
    var rec = {
      id: uid(), status: 'queued', attempts: 0,
      payload: {
        v: 1, id: null, at: new Date().toISOString(),
        game: info.game, page: info.page, url: info.url, hash: info.hash,
        subject: prefill && prefill.subject ? prefill.subject : '',
        type: $('#rr-type', dlg).value, message: msg, contact: contact,
        ua: navigator.userAgent, viewport: window.innerWidth + 'x' + window.innerHeight, lang: navigator.language,
      },
    };
    rec.payload.id = rec.id;
    lsSet(LS_LAST, { contact: contact });
    upsert(rec);
    lastSubmit = now;

    var btn = $('#rr-send', dlg); btn.disabled = true; btn.textContent = '送出中…';
    send(rec).then(function () {
      btn.textContent = '送出回報';
      ta.value = ''; close(); toast('已收到回報，感謝！');
    }, function () {
      btn.disabled = false; btn.textContent = '送出回報';
      if (!ENDPOINT) {
        ta.value = ''; renderHistory(); $('#rr-hist', dlg).hidden = false;
        setMsg('warn', '已存在你的瀏覽器（站長尚未設定收件端點）。可在下方紀錄「複製 JSON」貼到 Discord 給站長。');
      } else {
        renderHistory(); $('#rr-hist', dlg).hidden = false;
        setMsg('warn', '目前送不出去，已先存在你的瀏覽器，下次開站會自動重送。也可以先「複製 JSON」貼給站長。');
      }
    });
  }

  /* ---------- 紀錄面板 ---------- */
  var ST_LABEL = { sent: '已送出', queued: '待重送', local: '僅存本機', failed: '送出失敗' };
  function renderHistory() {
    var box = $('#rr-hist', dlg), h = history().slice().reverse();
    if (!h.length) { box.innerHTML = '這台瀏覽器還沒送過回報。'; return; }
    box.innerHTML =
      '<div class="acts"><button type="button" class="rr-btn" data-rr="copy">複製全部 JSON</button>' +
      '<button type="button" class="rr-btn" data-rr="dl">下載 JSON</button>' +
      (pending().length && ENDPOINT ? '<button type="button" class="rr-btn" data-rr="retry">立即重送</button>' : '') +
      '<button type="button" class="rr-btn" data-rr="clear">清除紀錄</button></div>' +
      '<ul>' + h.map(function (r) {
        var p = r.payload || {};
        return '<li><span class="t">' + esc((p.at || '').slice(0, 16).replace('T', ' ')) + '　' + esc(p.game) + '／' + esc(labelOf(p.type)) + '：' + esc((p.message || '').slice(0, 60)) + '</span>' +
          '<span class="rr-st ' + esc(r.status) + '">' + (ST_LABEL[r.status] || r.status) + '</span></li>';
      }).join('') + '</ul>';
    box.onclick = function (ev) {
      var b = ev.target.closest('[data-rr]'); if (!b) return;
      var act = b.getAttribute('data-rr');
      var json = JSON.stringify(history().map(function (r) { return Object.assign({ status: r.status }, r.payload); }), null, 2);
      if (act === 'copy') {
        (navigator.clipboard ? navigator.clipboard.writeText(json) : Promise.reject()).then(function () { toast('已複製 JSON'); }, function () {
          window.prompt('複製下面的 JSON：', json);
        });
      } else if (act === 'dl') {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = 'roe-report-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      } else if (act === 'retry') {
        flushQueue(); toast('重送中…'); setTimeout(renderHistory, 1500);
      } else if (act === 'clear') {
        if (window.confirm('清除這台瀏覽器的回報紀錄？（已送出的不受影響）')) { saveHistory([]); renderHistory(); }
      }
    };
  }
  function labelOf(t) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i][0] === t) return TYPES[i][1]; return t || ''; }
  function toggleHistory() { var box = $('#rr-hist', dlg); if (box.hidden) renderHistory(); box.hidden = !box.hidden; }

  /* ---------- 啟動 ---------- */
  function boot() {
    injectCss(); buildFab(); buildDialog();
    flushQueue();
    window.addEventListener('online', flushQueue);
    // 其他腳本可用 data-report 屬性直接開表單：<a href="#" data-report data-report-subject="…" data-report-type="…" data-report-message="…">
    document.addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-report]'); if (!a) return;
      ev.preventDefault();
      open({ subject: a.getAttribute('data-report-subject') || '', type: a.getAttribute('data-report-type') || '', message: a.getAttribute('data-report-message') || '' });
    });
  }

  window.RoeReport = {
    open: function (opts) { if (!dlg) return; open(opts); },
    history: history,
    pending: pending,
    flush: flushQueue,
    endpoint: function () { return ENDPOINT; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
