let allData = {};
let enemies = {};
let stages = {};
let collections = {};
let spriteMap = null;
let selectedEnemies = []; // array of ID strings, max 6
let currentLang = localStorage.getItem("enemyfinder-lang") || "zh";
let trackingData = JSON.parse(localStorage.getItem("enemyfinder-tracking") || '{"trackedCollections":[],"acquired":[]}');
let collectMode = true;
let recMode = localStorage.getItem("enemyfinder-rec-mode") || "tracked";
let recFilters = JSON.parse(localStorage.getItem("enemyfinder-rec-filters") || 'null') || {
  chapterMin: null, chapterMax: null, statType: null,
  statValueMin: null, broobiesMin: null, stageLimit: 5,
};
let filterPanelOpen = false;

function saveRecFilters() {
  localStorage.setItem("enemyfinder-rec-filters", JSON.stringify(recFilters));
}

function countActiveFilters() {
  let c = 0;
  if (recFilters.chapterMin != null) c++;
  if (recFilters.chapterMax != null) c++;
  if (recFilters.statType) c++;
  if (recFilters.statValueMin != null) c++;
  if (recFilters.broobiesMin != null) c++;
  if (recFilters.stageLimit !== 5) c++;
  return c;
}

// --- i18n ---
const translations = {
  en: {
    title: "Enemy Finder",
    tabSearch: "Search",
    tabCollections: "Collections",
    tabStages: "All Stages",
    searchPlaceholder: "Search by name or #id...",
    appearsInStages: "Appears in stages:",
    back: "← Back",
    noMatch: "No enemies match your search",
    noStages: "No stages loaded.",
    chapter: "Chapter",
    noSharedStages: "No shared stages",
    notInAnyStages: "Not in any stages",
    source: "Source",
    clearAll: "Clear All",
    track: "Track",
    untrack: "Untrack",
    modeFinder: "Find",
    modeCollect: "Collect",
    bestStages: "Best Stages",
    recommendedStages: "Recommended Stages",
    recTracked: "Tracked",
    recAll: "All",
    recCompletesTpl: "Completes {name}",
    recMissingFromTpl: "{count} missing from {name}",
    recMissingAcrossTpl: "{count} missing across {cols}",
    recCollectionsTpl: "{count} collections",
    recTotalTpl: "{count}x total",
    recValue: "Value:",
    recTrackPrompt: "Track collections to get recommendations",
    recNoMissing: "No missing enemies found",
    statATK: "ATK",
    statDEF: "DEF",
    statHP: "HP",
    statCRI: "CRIT RATE",
    statCRI_DMG: "CRIT DMG",
    statSPD: "SPD",
    statDDG: "EVA",
    statACC: "ACC",
    broobies: "Broobies",
    filterAnyStat: "Any stat",
    filterAnyValue: "Any value",
    filterAnyBroobies: "Any",
    filterShow: "Show",
    filterStages: "stages",
    filterFilters: "Filters",
    filterReward: "Require",
  },
  zh: {
    title: "敵人查詢器",
    tabSearch: "搜尋",
    tabCollections: "圖鑑",
    tabStages: "所有關卡",
    searchPlaceholder: "按名稱或 #ID 搜尋…",
    appearsInStages: "出現在以下關卡：",
    back: "← 返回",
    noMatch: "沒有匹配的敵人",
    noStages: "沒有關卡資料",
    chapter: "章節",
    noSharedStages: "沒有共同關卡",
    notInAnyStages: "不在任何關卡中",
    source: "來源",
    clearAll: "清除全部",
    track: "追蹤",
    untrack: "取消追蹤",
    modeFinder: "查詢",
    modeCollect: "收集",
    bestStages: "最佳關卡",
    recommendedStages: "推薦關卡",
    recTracked: "已追蹤",
    recAll: "全部",
    recCompletesTpl: "完成 {name}",
    recMissingFromTpl: "{name} 中缺少 {count} 個",
    recMissingAcrossTpl: "{cols}中缺少 {count} 個",
    recCollectionsTpl: "{count} 個圖鑑",
    recTotalTpl: "共 {count} 次",
    recValue: "評分:",
    recTrackPrompt: "追蹤圖鑑以獲取推薦",
    recNoMissing: "沒有缺少的敵人",
    statATK: "攻擊",
    statDEF: "防禦",
    statHP: "生命",
    statCRI: "暴擊",
    statCRI_DMG: "暴傷",
    statSPD: "速度",
    statDDG: "閃避",
    statACC: "命中",
    broobies: "Broobies",
    filterAnyStat: "任意屬性",
    filterAnyValue: "任意數值",
    filterAnyBroobies: "任意",
    filterShow: "顯示",
    filterStages: "關卡",
    filterFilters: "篩選",
    filterReward: "要求",
  },
  ko: {
    title: "적 찾기",
    tabSearch: "검색",
    tabCollections: "컬렉션",
    tabStages: "모든 스테이지",
    searchPlaceholder: "이름 또는 #ID로 검색…",
    appearsInStages: "등장 스테이지:",
    back: "← 뒤로",
    noMatch: "일치하는 적이 없습니다",
    noStages: "스테이지 데이터가 없습니다",
    chapter: "챕터",
    noSharedStages: "공통 스테이지 없음",
    notInAnyStages: "스테이지에 없음",
    source: "출처",
    clearAll: "전체 해제",
    track: "추적",
    untrack: "추적 해제",
    modeFinder: "찾기",
    modeCollect: "수집",
    bestStages: "최적 스테이지",
    recommendedStages: "추천 스테이지",
    recTracked: "추적 중",
    recAll: "전체",
    recCompletesTpl: "{name} 완료",
    recMissingFromTpl: "{name}에서 {count}개 부족",
    recMissingAcrossTpl: "{cols}에서 {count}개 부족",
    recCollectionsTpl: "{count}개 컬렉션",
    recTotalTpl: "총 {count}회",
    recValue: "점수:",
    recTrackPrompt: "추천을 받으려면 컬렉션을 추적하세요",
    recNoMissing: "부족한 적이 없습니다",
    statATK: "공격",
    statDEF: "방어",
    statHP: "HP",
    statCRI: "크리",
    statCRI_DMG: "크리피",
    statSPD: "스피드",
    statDDG: "회피",
    statACC: "명중",
    broobies: "Broobies",
    filterAnyStat: "모든 스탯",
    filterAnyValue: "모든 수치",
    filterAnyBroobies: "모두",
    filterShow: "표시",
    filterStages: "스테이지",
    filterFilters: "필터",
    filterReward: "요구",
  },
};

// Collection name translations
const collectionNames = {
  zh: {"Sporty Girls":"運動系女孩","Their Body is Ready":"蓄勢待發的身軀","Flirty Residents":"風騷住民","Swiftly Sadistic":"迅捷虐待狂","Masochist Mascots":"受虐吉祥物","Civil Servants of the Sexual Kind":"情色公務員","Dance all night Galz":"徹夜狂舞辣妹","Sex Troopers":"情慾部隊","Milk Tank Tops":"爆乳背心軍團","The AV Empire":"AV帝國","Cocaine Fueled Corporate Whoors":"嗑藥企業蕩婦","Physically Fit to Hit":"健美好上手","Fantasy Panty-See":"奇幻內褲春光","Isekai Vending Machine":"異世界販賣機","Masters of the Art of War and Sex":"戰爭與情慾大師","Mystery Origins":"神秘起源","Isekai Adventurers":"異世界冒險者","SF Girls from the Future":"來自未來的科幻女孩","Beat yo ass Warriors":"痛揍你的戰士","Robber Throbbers":"悸動盜賊團","Fallout Survival of the Fittest":"廢土適者生存","Residents of the Northern Mountains":"北境山區住民","Casino":"賭場","Dwarf Kingdom":"矮人王國","Problem Solver":"問題解決者"},
  ko: {
    "Sporty Girls": "스포츠 소녀",
    "Their Body is Ready": "준비된 몸",
    "Flirty Residents": "아양떨는 주민",
    "Swiftly Sadistic": "빠르고 잔인한",
    "Masochist Mascots": "마조히스트 마스코트",
    "Civil Servants of the Sexual Kind": "섹시 공무원",
    "Dance all night Galz": "밤새 춤추는 소녀",
    "Sex Troopers": "섹시 병사",
    "Milk Tank Tops": "밀크 탱탑",
    "The AV Empire": "AV 제국",
    "Cocaine Fueled Corporate Whoors": "폭주하는 회사원",
    "Physically Fit to Hit": "체력 만점",
    "Fantasy Panty-See": "판타지 속옷",
    "Isekai Vending Machine": "이세계 자판기",
    "Masters of the Art of War and Sex": "전투와 유혹의 달인",
    "Mystery Origins": "미스터리 기원",
    "Isekai Adventurers": "이세계 모험가",
    "SF Girls from the Future": "미래에서 온 SF 소녀",
    "Beat yo ass Warriors": "팔빠지는 전사",
    "Robber Throbbers": "심장이 뛰는 도적",
    "Fallout Survival of the Fittest": "폴아웃 적자생존",
    "Residents of the Northern Mountains": "세기말의 강자들",
    "Casino": "카지노",
    "Dwarf Kingdom": "드워프 왕국",
    "Problem Solver": "해결사",
  },
};

// Source label translations
const sourceNames = {
  zh: {"Elemental Trials":"元素試煉","Overlord":"霸主","Vending Basher":"販賣機破壞者"},
  ko: {
    "Vending Basher": "자판기 파괴자",
    "Elemental Trials": "원소 시련",
    "Overlord": "오버로드",
  },
};

function t(key) {
  return translations[currentLang]?.[key] || translations.en[key] || key;
}

function tpl(key, vars) {
  let str = t(key);
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

function tplHighlight(key, vars, highlightKey) {
  let str = t(key);
  for (const [k, v] of Object.entries(vars)) {
    if (k !== highlightKey) str = str.replace(`{${k}}`, v);
  }
  const parts = str.split(`{${highlightKey}}`);
  const result = [];
  if (parts[0]) result.push({ text: parts[0] });
  result.push({ text: String(vars[highlightKey]), highlight: true });
  if (parts[1]) result.push({ text: parts[1] });
  return result;
}

function enemyName(enemy) {
  if (currentLang === "zh" && enemy.name_zh) return enemy.name_zh;
  if (currentLang === "ko" && enemy.name_ko) return enemy.name_ko;
  return enemy.name;
}

function collectionName(name) {
  return collectionNames[currentLang]?.[name] || name;
}

function sourceName(name) {
  return sourceNames[currentLang]?.[name] || name;
}

function statName(key) {
  return t('stat' + key) || key;
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("enemyfinder-lang", lang);
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });
  document.documentElement.lang = lang;
  applyI18n();
  // Re-render dynamic content
  const activeTab = document.querySelector(".tab.active");
  if (activeTab) {
    const tab = activeTab.dataset.tab;
    if (tab === "search") renderEnemyGrid(document.getElementById("enemy-search").value);
    if (tab === "collections") renderCollections();
    if (tab === "stages") loadStages();
  }
  renderSelectionBar();
}

// --- Utilities ---
function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === "string") e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}

function spriteEl(imageFilename, className) {
  const div = document.createElement("div");
  div.className = "sprite" + (className ? " " + className : "");
  const info = spriteMap.sprites[imageFilename];
  if (!info) return div;
  const { cols, rows } = spriteMap;
  div.style.backgroundImage = "url(data/spritesheet.webp)";
  div.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
  div.style.backgroundPosition = `${info.col * 100 / (cols - 1)}% ${info.row * 100 / (rows - 1)}%`;
  return div;
}

// --- Collection Tracking ---
function saveTracking() {
  localStorage.setItem("enemyfinder-tracking", JSON.stringify(trackingData));
}

function isCollectionTracked(colId) {
  return trackingData.trackedCollections.includes(colId);
}

function isEnemyAcquired(enemyId) {
  return trackingData.acquired.includes(String(enemyId));
}

function toggleCollectionTracking(colId) {
  const idx = trackingData.trackedCollections.indexOf(colId);
  if (idx !== -1) {
    trackingData.trackedCollections.splice(idx, 1);
  } else {
    trackingData.trackedCollections.push(colId);
  }
  saveTracking();
  renderCollections();
}

function toggleEnemyAcquired(enemyId) {
  const id = String(enemyId);
  const idx = trackingData.acquired.indexOf(id);
  const nowAcquired = idx === -1;
  if (nowAcquired) {
    trackingData.acquired.push(id);
    // Auto-deselect from finder — no need to find an acquired enemy
    const selIdx = selectedEnemies.indexOf(id);
    if (selIdx !== -1) {
      selectedEnemies.splice(selIdx, 1);
      renderSelectionBar();
      updateSearchGridSelection();
    }
    // Auto-untrack any collection that is now complete
    for (const [colId, col] of Object.entries(collections)) {
      if (isCollectionTracked(colId) && col.enemies.every(eid => trackingData.acquired.includes(String(eid)))) {
        const tIdx = trackingData.trackedCollections.indexOf(colId);
        if (tIdx !== -1) trackingData.trackedCollections.splice(tIdx, 1);
      }
    }
  } else {
    trackingData.acquired.splice(idx, 1);
  }
  saveTracking();
  renderCollections();
  updateSearchGridAcquired();
}

function getCollectionProgress(colId) {
  const col = collections[colId];
  if (!col) return { acquired: 0, total: 0 };
  const total = col.enemies.length;
  const acquired = col.enemies.filter(id => trackingData.acquired.includes(String(id))).length;
  return { acquired, total };
}

function computeCollectionStages(colId) {
  const col = collections[colId];
  if (!col) return [];
  const missing = col.enemies
    .map(id => String(id))
    .filter(id => !trackingData.acquired.includes(id));
  if (missing.length === 0) return [];
  const missingSet = new Set(missing);
  const results = [];
  for (const [stageId, entries] of Object.entries(stages)) {
    let unique = 0;
    let total = 0;
    for (const entry of entries) {
      if (missingSet.has(String(entry.enemy_id))) {
        unique++;
        total += entry.count;
      }
    }
    if (unique > 0) {
      results.push({ stage: stageId, unique, total });
    }
  }
  results.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.unique !== a.unique) return b.unique - a.unique;
    const [ac, as_] = a.stage.split("-").map(Number);
    const [bc, bs] = b.stage.split("-").map(Number);
    return (bc - ac) || (bs - as_);
  });
  return results.slice(0, 8);
}

// --- Recommendation Engine ---
function recommendStages() {
  const missingByCol = new Map();
  for (const [colId, col] of Object.entries(collections)) {
    if (recMode === 'tracked' && !isCollectionTracked(colId)) continue;
    // Collection-level filters
    if (recFilters.statType && (!col.reward || col.reward.stat !== recFilters.statType)) continue;
    if (recFilters.statValueMin != null && (!col.reward || col.reward.statValue < recFilters.statValueMin)) continue;
    if (recFilters.broobiesMin != null && (!col.reward || col.reward.broobies < recFilters.broobiesMin)) continue;
    const missing = col.enemies
      .map(id => String(id))
      .filter(id => !trackingData.acquired.includes(id));
    if (missing.length > 0) {
      missingByCol.set(colId, new Set(missing));
    }
  }
  if (missingByCol.size === 0) return [];

  // Map each missing enemy to its collections
  const enemyToCols = new Map();
  for (const [colId, missing] of missingByCol) {
    for (const eid of missing) {
      if (!enemyToCols.has(eid)) enemyToCols.set(eid, new Set());
      enemyToCols.get(eid).add(colId);
    }
  }

  const scored = [];
  for (const [stageId, entries] of Object.entries(stages)) {
    // Stage-level filters
    const [ch] = stageId.split("-").map(Number);
    if (recFilters.chapterMin != null && ch < recFilters.chapterMin) continue;
    if (recFilters.chapterMax != null && ch > recFilters.chapterMax) continue;

    let score = 0;
    let totalTargets = 0;
    const colHits = new Map();
    const completesArr = [];

    for (const entry of entries) {
      const eid = String(entry.enemy_id);
      const cols = enemyToCols.get(eid);
      if (!cols) continue;

      // +1 per encounter (volume = variety in value)
      score += entry.count;
      totalTargets += entry.count;

      for (const colId of cols) {
        colHits.set(colId, (colHits.get(colId) || 0) + 1);
        // Tracked collection bonus in "all" mode
        if (recMode === 'all' && isCollectionTracked(colId)) {
          score += 0.5;
        }
      }
    }

    if (score === 0) continue;

    // Collection proximity bonus (scaled by progress)
    for (const [colId, hitCount] of colHits) {
      const col = collections[colId];
      const totalSize = col.enemies.length;
      const missingSize = missingByCol.get(colId).size;
      // Only award completion bonus if player has already acquired at least 1
      if (hitCount >= missingSize && missingSize < totalSize) {
        const progress = (totalSize - missingSize) / totalSize;
        score += 3 * progress;
        completesArr.push(colId);
      } else if (missingSize - hitCount === 1) {
        score += 1;
      }
    }

    // Stage efficiency bonus
    const missingInStage = entries.filter(e => enemyToCols.has(String(e.enemy_id))).length;
    score += (missingInStage / entries.length) * 0.3;

    // Generate reason as structured parts for DOM rendering
    let reasonParts;
    const completes = completesArr.length > 0;
    if (completes) {
      const name = collectionName(collections[completesArr[0]].name);
      reasonParts = tplHighlight('recCompletesTpl', { name }, 'name');
      if (completesArr.length > 1) {
        reasonParts.push({ text: ` +${completesArr.length - 1}` });
      }
    } else {
      let maxCol = null, maxHits = 0, totalHits = 0;
      for (const [colId, hits] of colHits) {
        totalHits += hits;
        if (hits > maxHits) { maxHits = hits; maxCol = colId; }
      }
      if (colHits.size === 1 || maxHits >= totalHits * 0.6) {
        const name = collectionName(collections[maxCol].name);
        reasonParts = tplHighlight('recMissingFromTpl', { count: maxHits, name }, 'name');
      } else {
        const colsLabel = tpl('recCollectionsTpl', { count: colHits.size });
        reasonParts = tplHighlight('recMissingAcrossTpl', { count: totalHits, cols: colsLabel }, 'cols');
      }
    }
    reasonParts.push({ text: `, ${tpl('recTotalTpl', { count: totalTargets })}` });

    scored.push({ stageId, score: Math.round(score * 10) / 10, reasonParts, completes, totalTargets });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.totalTargets !== a.totalTargets) return b.totalTargets - a.totalTargets;
    const [ac, as_] = a.stageId.split("-").map(Number);
    const [bc, bs] = b.stageId.split("-").map(Number);
    return (bc - ac) || (bs - as_);
  });

  return scored.slice(0, Math.max(1, Math.min(20, recFilters.stageLimit || 5)));
}

// --- Filter UI ---
function buildFilterPanel() {
  const panel = el("div", { className: "rec-filter-panel" });

  // Chapter range row
  const chapterRow = el("div", { className: "rec-filter-row" });
  chapterRow.appendChild(el("label", { className: "rec-filter-label" }, [t("chapter")]));
  const chMinInput = el("input", {
    type: "number", className: "rec-filter-input", placeholder: "1",
    min: "1", max: "99",
  });
  if (recFilters.chapterMin != null) chMinInput.value = recFilters.chapterMin;
  chMinInput.addEventListener("change", (e) => {
    recFilters.chapterMin = e.target.value ? Number(e.target.value) : null;
    saveRecFilters(); renderCollections();
  });
  const chMaxInput = el("input", {
    type: "number", className: "rec-filter-input", placeholder: "99",
    min: "1", max: "99",
  });
  if (recFilters.chapterMax != null) chMaxInput.value = recFilters.chapterMax;
  chMaxInput.addEventListener("change", (e) => {
    recFilters.chapterMax = e.target.value ? Number(e.target.value) : null;
    saveRecFilters(); renderCollections();
  });
  chapterRow.appendChild(chMinInput);
  chapterRow.appendChild(el("span", { className: "rec-filter-sep" }, ["—"]));
  chapterRow.appendChild(chMaxInput);
  panel.appendChild(chapterRow);

  // Reward filters row
  const rewardRow = el("div", { className: "rec-filter-row" });
  rewardRow.appendChild(el("label", { className: "rec-filter-label" }, [t("filterReward")]));

  const statSelect = document.createElement("select");
  statSelect.className = "rec-filter-select";
  statSelect.appendChild(el("option", { value: "" }, [t("filterAnyStat")]));
  for (const st of ["ATK", "DEF", "HP", "CRI", "CRI_DMG", "SPD", "DDG", "ACC"]) {
    const opt = el("option", { value: st }, [statName(st)]);
    if (recFilters.statType === st) opt.selected = true;
    statSelect.appendChild(opt);
  }
  statSelect.addEventListener("change", (e) => {
    recFilters.statType = e.target.value || null;
    saveRecFilters(); renderCollections();
  });
  rewardRow.appendChild(statSelect);

  const valSelect = document.createElement("select");
  valSelect.className = "rec-filter-select";
  valSelect.appendChild(el("option", { value: "" }, [t("filterAnyValue")]));
  for (const v of [0.2, 0.5, 1.0]) {
    const opt = el("option", { value: String(v) }, [`≥${v}%`]);
    if (recFilters.statValueMin === v) opt.selected = true;
    valSelect.appendChild(opt);
  }
  valSelect.addEventListener("change", (e) => {
    recFilters.statValueMin = e.target.value ? Number(e.target.value) : null;
    saveRecFilters(); renderCollections();
  });
  rewardRow.appendChild(valSelect);

  const brooSelect = document.createElement("select");
  brooSelect.className = "rec-filter-select";
  brooSelect.appendChild(el("option", { value: "" }, [t("filterAnyBroobies")]));
  for (const b of [169, 690, 1690]) {
    const opt = el("option", { value: String(b) }, [`≥${b} ${t('broobies')}`]);
    if (recFilters.broobiesMin === b) opt.selected = true;
    brooSelect.appendChild(opt);
  }
  brooSelect.addEventListener("change", (e) => {
    recFilters.broobiesMin = e.target.value ? Number(e.target.value) : null;
    saveRecFilters(); renderCollections();
  });
  rewardRow.appendChild(brooSelect);
  panel.appendChild(rewardRow);

  // Stage limit row
  const limitRow = el("div", { className: "rec-filter-row" });
  limitRow.appendChild(el("label", { className: "rec-filter-label" }, [t("filterShow")]));
  const limitSelect = document.createElement("select");
  limitSelect.className = "rec-filter-select";
  for (const n of [3, 5, 8, 10]) {
    const opt = el("option", { value: String(n) }, [`${n} ${t('filterStages')}`]);
    if ((recFilters.stageLimit || 5) === n) opt.selected = true;
    limitSelect.appendChild(opt);
  }
  limitSelect.addEventListener("change", (e) => {
    recFilters.stageLimit = Number(e.target.value);
    saveRecFilters(); renderCollections();
  });
  limitRow.appendChild(limitSelect);
  panel.appendChild(limitRow);

  return panel;
}

function buildFilterChips() {
  const chips = el("div", { className: "rec-filter-chips" });

  function addChip(label, onDismiss) {
    const chip = el("div", { className: "rec-filter-chip" }, [
      el("span", {}, [label]),
      el("button", {
        className: "rec-filter-chip-dismiss",
        onClick: (e) => { e.stopPropagation(); onDismiss(); },
      }, ["×"]),
    ]);
    chips.appendChild(chip);
  }

  if (recFilters.chapterMin != null || recFilters.chapterMax != null) {
    addChip(`Ch. ${recFilters.chapterMin ?? 1}–${recFilters.chapterMax ?? '99'}`, () => {
      recFilters.chapterMin = null; recFilters.chapterMax = null;
      saveRecFilters(); renderCollections();
    });
  }
  if (recFilters.statType) {
    addChip(statName(recFilters.statType), () => {
      recFilters.statType = null; saveRecFilters(); renderCollections();
    });
  }
  if (recFilters.statValueMin != null) {
    addChip(`≥${recFilters.statValueMin}%`, () => {
      recFilters.statValueMin = null; saveRecFilters(); renderCollections();
    });
  }
  if (recFilters.broobiesMin != null) {
    addChip(`≥${recFilters.broobiesMin} ${t('broobies')}`, () => {
      recFilters.broobiesMin = null; saveRecFilters(); renderCollections();
    });
  }
  if (recFilters.stageLimit !== 5) {
    addChip(`${recFilters.stageLimit} ${t('filterStages')}`, () => {
      recFilters.stageLimit = 5; saveRecFilters(); renderCollections();
    });
  }

  return chips;
}

function updateSearchGridAcquired() {
  document.querySelectorAll("#enemy-grid .enemy-card").forEach((card) => {
    const id = card.dataset.enemyId;
    if (!id) return;
    const acquired = isEnemyAcquired(id);
    card.classList.toggle("acquired", acquired);
    const existing = card.querySelector(".acquired-badge");
    if (acquired && !existing) {
      card.appendChild(el("div", { className: "acquired-badge" }, ["✓"]));
    } else if (!acquired && existing) {
      existing.remove();
    }
  });
}

// --- Init ---
async function init() {
  const [enemiesData, mapData] = await Promise.all([
    fetch("data/enemies.json?v=2").then((r) => r.json()),
    fetch("data/sprite-map.json?v=2").then((r) => r.json()),
  ]);
  allData = enemiesData;
  enemies = allData.enemies;
  stages = allData.stages;
  collections = allData.collections;
  spriteMap = mapData;
  setupLanguageToggle();
  setupModeToggle();
  setLanguage(currentLang);
  renderCollections();
  setupTabs();
}

function setupModeToggle() {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectMode = btn.dataset.mode === "collect";
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderCollections();
    });
  });
}

function setupLanguageToggle() {
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => setLanguage(btn.dataset.lang));
  });
}

// --- Tabs ---
function setupTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "search") updateSearchGridSelection();
      if (btn.dataset.tab === "collections") renderCollections();
      if (btn.dataset.tab === "stages") loadStages();
      updateModeToggleVisibility(btn.dataset.tab);
    });
  });
}

function updateModeToggleVisibility(tab) {
  document.getElementById("mode-toggle").classList.toggle("hidden", tab !== "collections");
}

function updateModeTogglePosition() {
  const toggle = document.getElementById("mode-toggle");
  const bar = document.getElementById("selection-bar");
  if (bar.classList.contains("hidden")) {
    toggle.style.bottom = "20px";
  } else {
    toggle.style.bottom = (bar.offsetHeight + 12) + "px";
  }
}

// --- Multi-select ---
function toggleEnemy(id) {
  const idx = selectedEnemies.indexOf(id);
  if (idx !== -1) {
    selectedEnemies.splice(idx, 1);
  } else {
    if (selectedEnemies.length >= 6) return;
    selectedEnemies.push(id);
  }
  renderSelectionBar();
  updateSearchGridSelection();
  updateCollectionsSelection();
}

function updateSearchGridSelection() {
  document.querySelectorAll("#enemy-grid .enemy-card").forEach((card) => {
    const id = card.dataset.enemyId;
    if (id) card.classList.toggle("selected", selectedEnemies.includes(id));
  });
}

function updateCollectionsSelection() {
  document.querySelectorAll(".collection-enemy-thumb").forEach((thumb) => {
    const id = thumb.dataset.enemyId;
    if (id) thumb.classList.toggle("selected", selectedEnemies.includes(id));
  });
}

function renderSelectionBar() {
  const bar = document.getElementById("selection-bar");
  const thumbsContainer = document.getElementById("selection-thumbs");
  const countEl = document.getElementById("selection-count");
  const stagesContainer = document.getElementById("selection-stages");

  if (selectedEnemies.length === 0) {
    bar.classList.add("hidden");
    document.body.classList.remove("has-selection");
    updateModeTogglePosition();
    return;
  }

  bar.classList.remove("hidden");
  document.body.classList.add("has-selection");

  // Render selected enemy thumbnails
  thumbsContainer.replaceChildren();
  for (const id of selectedEnemies) {
    const enemy = enemies[id];
    if (!enemy) continue;
    const thumb = el("div", { className: "selection-thumb" });
    if (enemy.image) {
      thumb.appendChild(spriteEl(enemy.image, "selection-sprite"));
    } else {
      thumb.appendChild(el("div", { className: "no-image-tiny" }, ["?"]));
    }
    thumb.appendChild(el("span", { className: "sel-name" }, [enemyName(enemy)]));
    const deselectBtn = el("button", {
      className: "deselect-btn",
      onClick: (e) => { e.stopPropagation(); toggleEnemy(id); },
    }, ["×"]);
    thumb.appendChild(deselectBtn);
    thumbsContainer.appendChild(thumb);
  }
  countEl.textContent = `${selectedEnemies.length}/6`;

  // Render stage results
  stagesContainer.replaceChildren();

  // Source tag for single-select non-story enemies
  if (selectedEnemies.length === 1) {
    const enemy = enemies[selectedEnemies[0]];
    if (enemy && enemy.source) {
      stagesContainer.appendChild(el("div", { className: "bar-source" }, [`${t("source")}: ${sourceName(enemy.source)}`]));
    }
  }

  const results = computeStageResults();
  if (results.length === 0) {
    const msg = selectedEnemies.length > 1 ? t("noSharedStages") : t("notInAnyStages");
    stagesContainer.appendChild(el("div", { className: "bar-empty" }, [msg]));
  } else {
    for (const r of results) {
      const tier = r.total >= 3 ? "tier3" : r.total === 2 ? "tier2" : "tier1";
      const chip = el("div", { className: `bar-stage-chip ${tier}` }, [
        el("span", { className: "count" }, [`${r.total}x`]),
        ` ${r.stage}`,
      ]);
      stagesContainer.appendChild(chip);
    }
  }
  updateModeTogglePosition();
}

function computeStageResults() {
  if (selectedEnemies.length === 1) {
    const id = selectedEnemies[0];
    const results = [];
    for (const [stageId, entries] of Object.entries(stages)) {
      for (const entry of entries) {
        if (String(entry.enemy_id) === id) {
          results.push({ stage: stageId, total: entry.count });
        }
      }
    }
    // Sort by count desc, then stage desc
    results.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      const [ac, as_] = a.stage.split("-").map(Number);
      const [bc, bs] = b.stage.split("-").map(Number);
      return (bc - ac) || (bs - as_);
    });
    return results;
  }

  // Multi-select: shared stages with total count
  const selectedSet = new Set(selectedEnemies);
  const results = [];
  for (const [stageId, entries] of Object.entries(stages)) {
    const stageEnemyIds = new Set(entries.map((e) => String(e.enemy_id)));
    if ([...selectedSet].every((id) => stageEnemyIds.has(id))) {
      let total = 0;
      for (const entry of entries) {
        if (selectedSet.has(String(entry.enemy_id))) {
          total += entry.count;
        }
      }
      results.push({ stage: stageId, total });
    }
  }
  // Sort by total desc, then stage desc
  results.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const [ac, as_] = a.stage.split("-").map(Number);
    const [bc, bs] = b.stage.split("-").map(Number);
    return (bc - ac) || (bs - as_);
  });
  return results;
}

function clearSelection() {
  selectedEnemies = [];
  renderSelectionBar();
  updateSearchGridSelection();
  updateCollectionsSelection();
}

// --- Search Tab ---
function renderEnemyGrid(filter = "") {
  const grid = document.getElementById("enemy-grid");
  grid.replaceChildren();
  const lowerFilter = filter.toLowerCase();

  const sorted = Object.entries(enemies).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  let count = 0;

  for (const [id, enemy] of sorted) {
    const name = enemyName(enemy);
    if (filter && !name.toLowerCase().includes(lowerFilter) && !enemy.name.toLowerCase().includes(lowerFilter) && !`#${id}`.includes(lowerFilter)) {
      continue;
    }
    const isSelected = selectedEnemies.includes(id);
    const card = el("div", {
      className: `enemy-card${isSelected ? " selected" : ""}`,
      onClick: () => toggleEnemy(id),
    });
    card.dataset.enemyId = id;
    if (enemy.image) {
      card.appendChild(spriteEl(enemy.image, "card-sprite"));
    } else {
      card.appendChild(el("div", { className: "no-image-thumb" }, ["?"]));
    }
    card.appendChild(el("div", { className: "card-label", title: name }, [name]));
    if (isEnemyAcquired(id)) {
      card.classList.add("acquired");
      card.appendChild(el("div", { className: "acquired-badge" }, ["✓"]));
    }
    grid.appendChild(card);
    count++;
  }

  if (!count) {
    grid.appendChild(el("div", { className: "empty-state" }, [t("noMatch")]));
  }
}

document.getElementById("enemy-search").addEventListener("input", (e) => {
  renderEnemyGrid(e.target.value);
});

// --- Collections Tab ---
function renderCollections() {
  const container = document.getElementById("collections-list");
  container.replaceChildren();
  container.classList.toggle("collect-mode", collectMode);

  // Collection completion counter
  const totalCollections = Object.keys(collections).length;
  let completedCollections = 0;
  for (const [colId, col] of Object.entries(collections)) {
    const p = getCollectionProgress(colId);
    if (p.total > 0 && p.acquired === p.total) completedCollections++;
  }
  const counter = el("div", { className: "collections-counter" },
    [`${completedCollections}/${totalCollections} collected`]);
  container.appendChild(counter);

  // Recommendation card
  const recCard = el("div", { className: "collection-card recommended-card" });
  const recHeader = el("div", { className: "collection-header" });
  recHeader.appendChild(el("div", { className: "collection-name" }, [t("recommendedStages")]));
  const recToggle = el("div", { className: "rec-mode-toggle" });
  recToggle.appendChild(el("button", {
    className: `rec-mode-btn${recMode === 'tracked' ? ' active' : ''}`,
    onClick: () => { recMode = 'tracked'; localStorage.setItem("enemyfinder-rec-mode", "tracked"); renderCollections(); },
  }, [t("recTracked")]));
  recToggle.appendChild(el("button", {
    className: `rec-mode-btn${recMode === 'all' ? ' active' : ''}`,
    onClick: () => { recMode = 'all'; localStorage.setItem("enemyfinder-rec-mode", "all"); renderCollections(); },
  }, [t("recAll")]));
  recHeader.appendChild(recToggle);
  const activeFilterCount = countActiveFilters();
  const filterBtn = el("button", {
    className: `rec-filter-btn${activeFilterCount > 0 ? ' has-filters' : ''}${filterPanelOpen ? ' active' : ''}`,
    onClick: () => { filterPanelOpen = !filterPanelOpen; renderCollections(); },
  }, [t("filterFilters")]);
  if (activeFilterCount > 0) {
    filterBtn.appendChild(el("span", { className: "rec-filter-badge" }, [String(activeFilterCount)]));
  }
  recHeader.appendChild(filterBtn);
  recCard.appendChild(recHeader);

  // Filter chips (always visible when filters are active)
  if (activeFilterCount > 0) {
    recCard.appendChild(buildFilterChips());
  }

  // Collapsible filter panel
  if (filterPanelOpen) {
    recCard.appendChild(buildFilterPanel());
  }

  if (recMode === 'tracked' && trackingData.trackedCollections.length === 0) {
    recCard.appendChild(el("div", { className: "rec-empty" }, [t("recTrackPrompt")]));
  } else {
    const recResults = recommendStages();
    if (recResults.length === 0) {
      recCard.appendChild(el("div", { className: "rec-empty" }, [t("recNoMissing")]));
    } else {
      const recList = el("div", { className: "rec-stages-list" });
      // Tier coloring: top score = gold, second = blue, same score = same tier
      const distinctScores = [...new Set(recResults.map(r => r.score))].sort((a, b) => b - a);
      const tier3Score = distinctScores[0];
      const tier2Score = distinctScores.length > 1 ? distinctScores[1] : null;
      for (const r of recResults) {
        let tierClass = '';
        if (r.score === tier3Score) tierClass = ' rec-tier3';
        else if (tier2Score !== null && r.score === tier2Score) tierClass = ' rec-tier2';
        const row = el("div", { className: `rec-stage-row${tierClass}` });
        row.appendChild(el("span", { className: "rec-stage-id" }, [r.stageId]));
        const reasonEl = el("span", {
          className: `rec-reason${r.completes ? ' rec-completes' : ''}`,
        });
        for (const part of r.reasonParts) {
          if (part.highlight) {
            reasonEl.appendChild(el("span", { className: "rec-highlight" }, [part.text]));
          } else {
            reasonEl.appendChild(document.createTextNode(part.text));
          }
        }
        row.appendChild(reasonEl);
        row.appendChild(el("span", { className: "rec-score" }, [`${t('recValue')} ${r.score.toFixed(1)}`]));
        recList.appendChild(row);
      }
      recCard.appendChild(recList);
    }
  }
  container.appendChild(recCard);

  for (const [colId, col] of Object.entries(collections)) {
    const tracked = isCollectionTracked(colId);
    const progress = getCollectionProgress(colId);
    const complete = progress.total > 0 && progress.acquired === progress.total;

    const card = el("div", {
      className: `collection-card${tracked ? " tracked" : ""}${complete ? " completed" : ""}`,
    });

    // Header with name and tracking controls
    const header = el("div", { className: "collection-header" });

    const nameBlock = el("div", { className: "collection-name-block" });
    const nameDiv = el("div", { className: "collection-name" });
    if (complete) {
      nameDiv.appendChild(el("span", { className: "complete-check" }, ["✓"]));
    }
    nameDiv.appendChild(document.createTextNode(collectionName(col.name)));
    nameBlock.appendChild(nameDiv);

    if (col.reward) {
      const r = col.reward;
      const pct = r.statValue % 1 === 0 ? r.statValue.toFixed(0) : r.statValue.toFixed(1);
      const rewardDiv = el("div", { className: "collection-reward" }, [
        el("span", { className: "reward-stat" }, [`+${pct}% ${statName(r.stat)}`]),
        el("span", { className: "reward-sep" }, ["·"]),
        el("span", { className: "reward-broobies" }, [`${r.broobies} ${t('broobies')}`]),
      ]);
      nameBlock.appendChild(rewardDiv);
    }
    header.appendChild(nameBlock);

    const controls = el("div", { className: "collection-controls" });
    if (tracked) {
      const progressEl = el("span", {
        className: `collection-progress${complete ? " complete" : ""}`,
      }, [`${progress.acquired}/${progress.total}`]);
      controls.appendChild(progressEl);
    }
    const trackBtn = el("button", {
      className: `track-btn${tracked ? " active" : ""}`,
      onClick: (e) => { e.stopPropagation(); toggleCollectionTracking(colId); },
    }, [tracked ? t("untrack") : t("track")]);
    controls.appendChild(trackBtn);

    header.appendChild(controls);
    card.appendChild(header);

    // Enemy grid
    const grid = el("div", { className: "collection-enemies" });
    for (const enemyId of col.enemies) {
      const id = String(enemyId);
      const enemy = enemies[id];
      if (!enemy) continue;

      const isSelected = selectedEnemies.includes(id);
      const acquired = isEnemyAcquired(id);
      const name = enemyName(enemy);
      const thumb = el("div", {
        className: `collection-enemy-thumb${isSelected ? " selected" : ""}${acquired ? " acquired" : ""}`,
        title: name,
        onClick: () => {
          if (collectMode) {
            if (isSelected) toggleEnemy(id);
            toggleEnemyAcquired(id);
          } else {
            toggleEnemy(id);
          }
        },
      });
      thumb.dataset.enemyId = id;

      if (enemy.image) {
        thumb.appendChild(spriteEl(enemy.image, "collection-sprite"));
      } else {
        thumb.appendChild(el("div", { className: "no-image-thumb" }, ["?"]));
      }
      thumb.appendChild(el("div", { className: "thumb-label" }, [name]));
      if (acquired) {
        thumb.appendChild(el("div", { className: "acquired-badge" }, ["✓"]));
      }
      grid.appendChild(thumb);
    }

    card.appendChild(grid);

    // Best stages for tracked collections with missing enemies
    if (tracked && !complete) {
      const bestStages = computeCollectionStages(colId);
      if (bestStages.length > 0) {
        const stagesSection = el("div", { className: "collection-stages" });
        stagesSection.appendChild(el("div", { className: "collection-stages-label" }, [t("bestStages")]));
        const chipsWrap = el("div", { className: "collection-stages-chips" });
        for (const r of bestStages) {
          const tier = r.total >= 3 ? "tier3" : r.total === 2 ? "tier2" : "tier1";
          const chip = el("div", { className: `bar-stage-chip ${tier}` }, [
            el("span", { className: "count" }, [`${r.total}x`]),
            ` ${r.stage}`,
          ]);
          chipsWrap.appendChild(chip);
        }
        stagesSection.appendChild(chipsWrap);
        card.appendChild(stagesSection);
      }
    }

    container.appendChild(card);
  }
}

// --- Stages Tab ---
function loadStages() {
  const container = document.getElementById("stages-list");
  container.replaceChildren();

  const entries = Object.entries(stages).sort((a, b) => {
    const [ac, as_] = a[0].split("-").map(Number);
    const [bc, bs] = b[0].split("-").map(Number);
    return ac - bc || as_ - bs;
  });

  if (!entries.length) {
    container.appendChild(
      el("div", { className: "empty-state" }, [t("noStages")])
    );
    return;
  }

  let currentChapter = null;

  for (const [stageId, stageEnemies] of entries) {
    const chapter = stageId.split("-")[0];
    if (chapter !== currentChapter) {
      currentChapter = chapter;
      container.appendChild(el("div", { className: "chapter-header" }, [`${t("chapter")} ${chapter}`]));
    }

    const idSpan = el("span", { className: "stage-id" }, [stageId]);

    const enemiesDiv = el("div", { className: "stage-enemies" });
    for (const e of stageEnemies) {
      const enemy = enemies[String(e.enemy_id)];
      if (!enemy) continue;
      const thumbChildren = [];
      if (enemy.image) {
        thumbChildren.push(spriteEl(enemy.image, "stage-sprite"));
      } else {
        thumbChildren.push(el("div", { className: "no-image-tiny" }, ["?"]));
      }
      if (e.count > 1) {
        thumbChildren.push(el("span", { className: "badge" }, [String(e.count)]));
      }
      const thumb = el("div", { className: `stage-enemy-thumb${isEnemyAcquired(String(e.enemy_id)) ? " acquired" : ""}`, title: `${enemyName(enemy)} (${e.count}x)` }, thumbChildren);
      enemiesDiv.appendChild(thumb);
    }

    container.appendChild(el("div", { className: "stage-row" }, [idSpan, enemiesDiv]));
  }
}

// --- Drag-to-scroll for selection thumbs (desktop + touch) ---
function setupDragScroll(container) {
  let isDown = false;
  let hasDragged = false;
  let startX;
  let scrollLeft;

  container.addEventListener("mousedown", (e) => {
    if (e.target.closest(".deselect-btn")) return;
    isDown = true;
    hasDragged = false;
    container.style.cursor = "grabbing";
    startX = e.pageX;
    scrollLeft = container.scrollLeft;
    e.preventDefault();
  });

  document.addEventListener("mouseup", () => {
    if (!isDown) return;
    isDown = false;
    container.style.cursor = "";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    const dx = e.pageX - startX;
    if (Math.abs(dx) > 3) hasDragged = true;
    container.scrollLeft = scrollLeft - dx;
  });
}

// --- Start ---
init();
setupDragScroll(document.getElementById("selection-thumbs"));
