/* 星慾姬絆繁中 Wiki — 本地離線版前端
 * 資料來源：window.WIKI_PAGES（由 scripts/build-site.mjs 產生）
 * 純前端 hash 路由，可直接以 file:// 開啟，無需伺服器。
 */
(function () {
  'use strict'

  var PAGES = window.WIKI_PAGES || []
  var BY_SLUG = {}
  PAGES.forEach(function (p) {
    BY_SLUG[p.slug] = p
  })

  /* ---------------- 分類定義 ---------------- */
  var SECTIONS = [
    { key: 'guides', title: '攻略指南', icon: '📖', desc: '從入門到進階的完整玩法教學' },
    { key: 'characters', title: '角色', icon: '👤', desc: '角色一覽、強度榜與抽取優先度' },
    { key: 'builds', title: '養成配置', icon: '⚙️', desc: '隊伍搭配、零課路線與養成規劃' },
    { key: 'items', title: '道具資源', icon: '💎', desc: '貨幣、神器與名詞解釋' },
    { key: 'events', title: '活動', icon: '🎉', desc: '當期活動、上線獎勵與更新日誌' },
    { key: 'codes', title: '兌換碼', icon: '🎁', desc: '可用兌換碼與使用方式' },
    { key: 'tools', title: '實用工具', icon: '🧮', desc: '檢查清單與規劃器' },
    { key: 'review', title: '遊戲評測', icon: '⭐', desc: '整體評價與值不值得玩' },
  ]

  function sectionOf(slug) {
    var root = slug.split('__')[0]
    return SECTIONS.find(function (s) {
      return s.key === root
    })
  }

  /* ---------------- 工具函式 ---------------- */
  /* 以 file:// 開啟時，部分瀏覽器視其為 opaque origin 而禁用 localStorage
     並直接拋出 SecurityError。包起來讓主題記憶失效即可，不能讓整站初始化中斷。 */
  var storage = {
    get: function (k) {
      try {
        return window.localStorage.getItem(k)
      } catch (e) {
        return null
      }
    },
    set: function (k, v) {
      try {
        window.localStorage.setItem(k, v)
      } catch (e) {
        /* 忽略：主題偏好無法保存不影響瀏覽 */
      }
    },
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /** 將輕量標記（**粗體**、`程式碼`、[文字](目標)）轉為安全 HTML */
  function inline(text) {
    var out = esc(text)
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, target) {
      if (/^#/.test(target)) {
        return '<a href="' + esc(target) + '">' + label + '</a>'
      }
      if (/^https?:\/\//i.test(target)) {
        return (
          '<a href="' +
          esc(target) +
          '" target="_blank" rel="noopener noreferrer nofollow">' +
          label +
          ' ↗</a>'
        )
      }
      return label
    })
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
    return out
  }

  function slugifyHeading(text, i) {
    var base = String(text)
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
    return 'h-' + (base || 'sec') + '-' + i
  }

  /* ---------------- 區塊渲染 ---------------- */
  function renderBlocks(blocks, headingIds) {
    var html = ''
    blocks.forEach(function (b, i) {
      switch (b.type) {
        case 'heading': {
          var lvl = Math.min(Math.max(b.level || 2, 2), 4)
          var id = slugifyHeading(b.text, i)
          if (headingIds && lvl <= 3) headingIds.push({ id: id, text: b.text, level: lvl })
          html += '<h' + lvl + ' id="' + id + '">' + inline(b.text) + '</h' + lvl + '>'
          break
        }
        case 'paragraph':
          html += '<p>' + inline(b.text) + '</p>'
          break
        case 'list': {
          var tag = b.ordered ? 'ol' : 'ul'
          html += '<' + tag + '>'
          b.items.forEach(function (it) {
            html += '<li>' + inline(it) + '</li>'
          })
          html += '</' + tag + '>'
          break
        }
        case 'table': {
          html += '<div class="table-wrap"><table>'
          if (b.headers && b.headers.length) {
            html += '<thead><tr>'
            b.headers.forEach(function (h) {
              html += '<th>' + inline(h) + '</th>'
            })
            html += '</tr></thead>'
          }
          html += '<tbody>'
          b.rows.forEach(function (row) {
            html += '<tr>'
            row.forEach(function (c) {
              html += '<td>' + inline(c) + '</td>'
            })
            html += '</tr>'
          })
          html += '</tbody></table></div>'
          break
        }
        case 'callout':
          html += '<div class="callout">' + inline(b.text) + '</div>'
          break
        case 'faq':
          html +=
            '<details class="faq"><summary>' +
            inline(b.question) +
            '</summary><div class="faq-body">' +
            renderBlocks(b.answer || [], null) +
            '</div></details>'
          break
      }
    })
    return html
  }

  /* ---------------- 側邊導覽 ---------------- */
  function renderSidebar(activeSlug) {
    var html = ''
    html +=
      '<div class="nav-group"><a class="nav-link' +
      (activeSlug === 'index' ? ' active' : '') +
      '" href="#index">🏠 首頁</a></div>'

    SECTIONS.forEach(function (sec) {
      var pages = PAGES.filter(function (p) {
        return p.slug === sec.key || p.slug.indexOf(sec.key + '__') === 0
      })
      if (!pages.length) return
      html += '<div class="nav-group"><div class="nav-group-title">' + sec.icon + ' ' + sec.title + '</div>'
      pages.forEach(function (p) {
        html +=
          '<a class="nav-link' +
          (p.slug === activeSlug ? ' active' : '') +
          '" href="#' +
          p.slug +
          '">' +
          esc(p.navTitle || p.title) +
          '</a>'
      })
      html += '</div>'
    })
    document.getElementById('sidebar').innerHTML = html
  }

  /* ---------------- 首頁 ---------------- */
  function renderHome() {
    var total = PAGES.length
    var html =
      '<div class="hero">' +
      '<h1>星慾姬絆 繁體中文 Wiki</h1>' +
      '<p>Stellar Affinity 完整攻略資料庫，共 ' +
      total +
      ' 篇。全部內容已翻譯為繁體中文，並移除原站的廣告與跳轉腳本，可完全離線閱讀。</p>' +
      '</div>'

    html +=
      '<div class="notice">' +
      '<strong>關於這份離線版：</strong>內容譯自 stellaraffinity.wiki 的公開頁面，僅供個人閱讀。' +
      '原站嵌入的廣告聯播網腳本（會造成強制跳轉與假防毒推播）已在建置階段完全剝除，站內不含任何第三方腳本、追蹤碼或 iframe。' +
      '遊戲數值可能隨版本改動，實際請以遊戲內為準。' +
      '</div>'

    html += '<div class="card-grid">'
    SECTIONS.forEach(function (sec) {
      var pages = PAGES.filter(function (p) {
        return p.slug === sec.key || p.slug.indexOf(sec.key + '__') === 0
      })
      if (!pages.length) return
      var landing = BY_SLUG[sec.key] || pages[0]
      html +=
        '<a class="card" href="#' +
        landing.slug +
        '">' +
        '<div class="card-icon">' +
        sec.icon +
        '</div>' +
        '<div class="card-title">' +
        sec.title +
        '</div>' +
        '<div class="card-desc">' +
        esc(sec.desc) +
        '</div>' +
        '<div class="card-count">' +
        pages.length +
        ' 篇</div>' +
        '</a>'
    })
    html += '</div>'

    html += '<h2>新手從這裡開始</h2><div class="card-grid">'
    ;[
      ['guides__how-to-play', '🎮', '這款遊戲怎麼玩'],
      ['guides__beginner-week', '📅', '新手第一週規劃'],
      ['guides__reroll', '🔄', '洗初始帳號'],
      ['characters__tier-list', '🏆', '角色強度榜'],
      ['codes__active', '🎁', '目前可用兌換碼'],
      ['builds__f2p-plan', '💰', '零課玩家路線'],
    ].forEach(function (row) {
      var p = BY_SLUG[row[0]]
      if (!p) return
      html +=
        '<a class="card" href="#' +
        p.slug +
        '">' +
        '<div class="card-icon">' +
        row[1] +
        '</div>' +
        '<div class="card-title">' +
        row[2] +
        '</div>' +
        '<div class="card-desc">' +
        esc((p.description || '').slice(0, 70)) +
        '</div></a>'
    })
    html += '</div>'

    document.getElementById('content').innerHTML = html
    document.getElementById('toc').innerHTML = ''
    document.title = '星慾姬絆 繁中 Wiki — 本地離線版'
  }

  /* ---------------- 內容頁 ---------------- */
  function renderPage(slug) {
    var page = BY_SLUG[slug]
    if (!page) return renderHome()

    var sec = sectionOf(slug)
    var headingIds = []
    var body = renderBlocks(page.blocks, headingIds)

    var html = ''
    html +=
      '<div class="crumbs"><a href="#index">首頁</a>' +
      (sec ? ' / <a href="#' + sec.key + '">' + sec.title + '</a>' : '') +
      ' / ' +
      esc(page.navTitle || page.title) +
      '</div>'
    html += '<h1 class="page-title">' + esc(page.title) + '</h1>'
    if (page.description) html += '<p class="page-desc">' + esc(page.description) + '</p>'

    html += '<div class="page-meta">'
    if (sec) html += '<span class="chip">' + sec.icon + ' ' + sec.title + '</span>'
    if (page.updated) html += '<span class="chip">更新：' + esc(page.updated) + '</span>'
    html += '<span class="chip">✅ 無廣告・已離線</span>'
    html += '</div>'

    html += body

    // 上一頁／下一頁
    var idx = PAGES.indexOf(page)
    var prev = PAGES[idx - 1]
    var next = PAGES[idx + 1]
    html += '<div class="page-footer"><div class="prev-next">'
    html += prev
      ? '<a href="#' + prev.slug + '"><span class="label">← 上一篇</span><span class="name">' +
        esc(prev.navTitle || prev.title) + '</span></a>'
      : '<span></span>'
    html += next
      ? '<a class="nav-next" href="#' + next.slug + '"><span class="label">下一篇 →</span><span class="name">' +
        esc(next.navTitle || next.title) + '</span></a>'
      : '<span></span>'
    html += '</div>'
    html +=
      '<p>本頁譯自原站 <code>' +
      esc(page.path) +
      '</code>，僅供個人離線閱讀；廣告與追蹤腳本已移除。</p>'
    html += '</div>'

    document.getElementById('content').innerHTML = html
    document.title = page.title + ' — 星慾姬絆繁中 Wiki'

    // 本頁目錄
    var toc = document.getElementById('toc')
    if (headingIds.length > 1) {
      var t = '<div class="toc-title">本頁目錄</div>'
      headingIds.forEach(function (h) {
        t +=
          '<a href="#' + slug + '" data-target="' + h.id + '" class="lvl-' + h.level + '">' +
          esc(h.text) + '</a>'
      })
      toc.innerHTML = t
      toc.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault()
          var el = document.getElementById(a.dataset.target)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      })
      setupScrollSpy(headingIds)
    } else {
      toc.innerHTML = ''
    }
  }

  /* ---------------- 目錄捲動高亮 ---------------- */
  var spyObserver = null
  function setupScrollSpy(headings) {
    if (spyObserver) spyObserver.disconnect()
    var links = {}
    document.querySelectorAll('.toc a').forEach(function (a) {
      links[a.dataset.target] = a
    })
    spyObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            Object.keys(links).forEach(function (k) {
              links[k].classList.remove('active')
            })
            if (links[entry.target.id]) links[entry.target.id].classList.add('active')
          }
        })
      },
      { rootMargin: '-76px 0px -70% 0px', threshold: 0 }
    )
    headings.forEach(function (h) {
      var el = document.getElementById(h.id)
      if (el) spyObserver.observe(el)
    })
  }

  /* ---------------- 搜尋 ---------------- */
  var INDEX = PAGES.map(function (p) {
    var parts = [p.title, p.description]
    ;(function walk(blocks) {
      blocks.forEach(function (b) {
        if (b.text) parts.push(b.text)
        if (b.question) parts.push(b.question)
        if (b.items) parts.push(b.items.join(' '))
        if (b.headers) parts.push(b.headers.join(' '))
        if (b.rows) b.rows.forEach(function (r) { parts.push(r.join(' ')) })
        if (b.answer) walk(b.answer)
      })
    })(p.blocks)
    var text = parts.join(' ').replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    return { page: p, text: text, lower: text.toLowerCase() }
  })

  function search(q) {
    var query = q.trim().toLowerCase()
    if (query.length < 1) return []
    return INDEX.map(function (entry) {
        var pos = entry.lower.indexOf(query)
        if (pos < 0) return null
        var titleHit = entry.page.title.toLowerCase().indexOf(query) >= 0
        var start = Math.max(0, pos - 30)
        var snippet = entry.text.slice(start, start + 110)
        return {
          page: entry.page,
          score: (titleHit ? 1000 : 0) - pos,
          snippet: (start > 0 ? '…' : '') + snippet + '…',
          pos: pos - start + (start > 0 ? 1 : 0),
          len: query.length,
        }
      })
      .filter(Boolean)
      .sort(function (a, b) { return b.score - a.score })
      .slice(0, 12)
  }

  function renderResults(q) {
    var box = document.getElementById('results')
    if (!q.trim()) {
      box.classList.remove('open')
      box.innerHTML = ''
      return
    }
    var hits = search(q)
    if (!hits.length) {
      box.innerHTML = '<div class="result-empty">找不到「' + esc(q) + '」的相關內容</div>'
      box.classList.add('open')
      return
    }
    box.innerHTML = hits
      .map(function (h) {
        var s = h.snippet
        var marked =
          esc(s.slice(0, h.pos)) +
          '<mark>' + esc(s.slice(h.pos, h.pos + h.len)) + '</mark>' +
          esc(s.slice(h.pos + h.len))
        return (
          '<a class="result-item" href="#' + h.page.slug + '">' +
          '<div class="result-title">' + esc(h.page.title) + '</div>' +
          '<div class="result-snippet">' + marked + '</div></a>'
        )
      })
      .join('')
    box.classList.add('open')
  }

  /* ---------------- 路由與事件 ---------------- */
  function route() {
    var slug = (location.hash || '#index').slice(1)
    if (slug === 'index' || !BY_SLUG[slug]) {
      if (slug !== 'index' && BY_SLUG[slug] === undefined && slug !== '') {
        // 未知 slug 一律回首頁
      }
      renderSidebar('index')
      renderHome()
    } else {
      renderSidebar(slug)
      renderPage(slug)
    }
    window.scrollTo({ top: 0 })
    document.getElementById('sidebar').classList.remove('open')
    document.getElementById('scrim').classList.remove('open')
    document.getElementById('results').classList.remove('open')
  }

  window.addEventListener('hashchange', route)

  document.addEventListener('DOMContentLoaded', function () {
    // 主題
    var saved = storage.get('sa-theme')
    if (saved) document.documentElement.setAttribute('data-theme', saved)
    document.getElementById('themeBtn').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', cur)
      storage.set('sa-theme', cur)
    })

    // 先渲染內容，再綁定互動：任一監聽器出錯都不該讓頁面空白
    route()

    // 搜尋
    var input = document.getElementById('search')
    input.addEventListener('input', function () { renderResults(input.value) })
    input.addEventListener('focus', function () { if (input.value) renderResults(input.value) })
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search-wrap')) {
        document.getElementById('results').classList.remove('open')
      }
    })
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        input.focus()
        input.select()
      }
      if (e.key === 'Escape') {
        document.getElementById('results').classList.remove('open')
        input.blur()
      }
    })

    // 行動版選單
    var sidebar = document.getElementById('sidebar')
    var scrim = document.getElementById('scrim')
    document.getElementById('menuBtn').addEventListener('click', function () {
      sidebar.classList.toggle('open')
      scrim.classList.toggle('open')
    })
    scrim.addEventListener('click', function () {
      sidebar.classList.remove('open')
      scrim.classList.remove('open')
    })
  })
})()
