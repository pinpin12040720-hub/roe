// ─── State ──────────────────────────────────────────────────────────

let characters = [];
let strings = {};

const DEFAULT_ROW_LABELS = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
const STORAGE_KEY = 'tierlist-state';

// 3-anchor color gradient (top → middle → bottom), interpolated by row position.
const DEFAULT_COLORS = { top: '#c53030', mid: '#6b46c1', bot: '#319795' };
let colors = { ...DEFAULT_COLORS };

// Preset palette offered when the user clicks a color anchor.
const PRESET_COLORS = [
  '#c53030', '#dd6b20', '#b7791f', '#d69e2e',
  '#2f855a', '#319795', '#2b6cb0', '#4c51bf',
  '#6b46c1', '#b83280', '#4a5568', '#1a202c',
];

let rowIdCounter = 0;
function newRowId() { return 'r' + (++rowIdCounter); }

function makeDefaultRows() {
  return DEFAULT_ROW_LABELS.map(label => ({ id: newRowId(), label, defaultLabel: label }));
}

let rows = makeDefaultRows();
let tierState = {};                     // rowId -> [portraitId, ...]
rows.forEach(r => tierState[r.id] = []);

let selectedPortrait = null;
let draggedEl = null;
let wasDragging = false;

// ─── Data Loading ───────────────────────────────────────────────────

async function loadData() {
  const [charsData, stringsData] = await Promise.all([
    fetch('../data/characters.json?v=2').then(r => r.json()),
    fetch('../data/strings.json?v=2').then(r => r.json()),
  ]);

  characters = charsData;
  strings = stringsData;

  loadState();
  initPool();
  buildColorControls();
  buildTierList();
  renderPool();
}

function getName(c) {
  return strings[c.nameIndex] || ('Char #' + c.id);
}

// ─── Persistence ────────────────────────────────────────────────────

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows, tiers: tierState, colors }));
}

function loadState() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); }
  catch (e) { return; }
  if (!saved) return;

  const validIds = new Set(characters.map(c => c.id));

  if (saved.colors) {
    colors = {
      top: saved.colors.top || DEFAULT_COLORS.top,
      mid: saved.colors.mid || DEFAULT_COLORS.mid,
      bot: saved.colors.bot || DEFAULT_COLORS.bot,
    };
  }

  // New shape: { rows: [{id,label,defaultLabel}, ...], tiers: { rowId: [charId,...] } }
  if (Array.isArray(saved.rows) && saved.tiers) {
    rows = saved.rows.map(r => {
      const label = String(r.label ?? '');
      return {
        id: r.id || newRowId(),
        label,
        defaultLabel: String(r.defaultLabel ?? label ?? ''),
      };
    });
    // Keep rowIdCounter ahead of any numeric ids we just adopted.
    rows.forEach(r => {
      const n = parseInt(String(r.id).replace(/^r/, ''), 10);
      if (Number.isFinite(n) && n > rowIdCounter) rowIdCounter = n;
    });
    tierState = {};
    rows.forEach(r => {
      const list = Array.isArray(saved.tiers[r.id]) ? saved.tiers[r.id] : [];
      tierState[r.id] = list.filter(id => validIds.has(id));
    });
    return;
  }

  // Legacy shape: { S: [...], A: [...], ... } — migrate to rows[] keyed by id.
  rows = [];
  tierState = {};
  DEFAULT_ROW_LABELS.forEach(label => {
    const id = newRowId();
    rows.push({ id, label, defaultLabel: label });
    const list = Array.isArray(saved[label]) ? saved[label] : [];
    tierState[id] = list.filter(charId => validIds.has(charId));
  });
}

// ─── Color interpolation ────────────────────────────────────────────

function lerpChannel(a, b, t) { return Math.round(a + (b - a) * t); }
function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}
function lerpHex(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a), [br, bg, bb] = hexToRgb(b);
  return rgbToHex(lerpChannel(ar, br, t), lerpChannel(ag, bg, t), lerpChannel(ab, bb, t));
}
function rowColor(idx, total) {
  if (total <= 1) return colors.mid;
  const f = idx / (total - 1);
  if (f <= 0.5) return lerpHex(colors.top, colors.mid, f * 2);
  return lerpHex(colors.mid, colors.bot, (f - 0.5) * 2);
}

// ─── Build UI ───────────────────────────────────────────────────────

function buildTierList() {
  const container = document.getElementById('tierlist-capture');
  container.replaceChildren();

  rows.forEach((row, idx) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'tier-row';
    rowEl.dataset.rowId = row.id;

    const label = document.createElement('div');
    label.className = 'tier-label';
    label.dataset.rowId = row.id;
    label.style.background = rowColor(idx, rows.length);
    label.textContent = row.label;
    label.contentEditable = 'plaintext-only';
    label.spellcheck = false;
    setupLabelEditing(label, row);
    rowEl.appendChild(label);

    const drop = document.createElement('div');
    drop.className = 'tier-drop';
    drop.dataset.rowId = row.id;
    setupDropZone(drop);
    rowEl.appendChild(drop);

    // Per-row delete button (visible on hover)
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'row-remove-btn';
    removeBtn.title = 'Remove row (portraits return to pool)';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      removeRow(row.id);
    });
    rowEl.appendChild(removeBtn);

    // Click anywhere on the row (except the editable label / remove btn) to place selected portrait
    rowEl.addEventListener('click', e => {
      if (e.target.closest('.portrait')) return;
      if (e.target.closest('.row-remove-btn')) return;
      if (e.target === label) return;       // editing the label, not placing
      if (!selectedPortrait) return;
      drop.appendChild(selectedPortrait);
      clearSelection();
      syncStateFromDOM();
      saveState();
      renderPool();
    });

    container.appendChild(rowEl);

    // Render saved portraits into this row
    tierState[row.id].forEach(id => {
      const c = characters.find(ch => ch.id === id);
      if (c) drop.appendChild(createPortrait(c));
    });
  });

  syncLabelWidths();
}

// All label cells grow to the width of the widest one so the rows align
// vertically even when one custom label is much longer than the others.
// Sizing strategy for the widest single word across all labels:
//   <= soft cap        → box at natural width, base font
//   soft cap..hard cap → box grows to fit the word, base font kept
//   > hard cap         → box stays at hard cap, all fonts shrink to fit
const LABEL_SOFT_CAP = 160;
const LABEL_HARD_CAP = 260;
const LABEL_FONT_BASE = 22;
const LABEL_FONT_MIN = 11;

function syncLabelWidths() {
  const labels = [...document.querySelectorAll('.tier-label')];
  if (!labels.length) return;

  labels.forEach(l => {
    l.style.width = '';
    l.style.maxWidth = '';
    l.style.fontSize = '';
  });

  // Predict the widest single word at a given font size using a shared
  // canvas (flexbox makes scrollWidth comparisons unreliable). Multi-word
  // content wraps cleanly at spaces inside max-width and is unaffected.
  const ctx = (syncLabelWidths._canvas ||= document.createElement('canvas')).getContext('2d');
  const cs = getComputedStyle(labels[0]);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const fontFamily = cs.fontFamily;
  const fontWeight = cs.fontWeight;

  const widestWordWidth = (fontPx) => {
    ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
    let max = 0;
    labels.forEach(l => {
      (l.textContent || '').split(/\s+/).filter(Boolean).forEach(w => {
        const m = ctx.measureText(w).width + padX;
        if (m > max) max = m;
      });
    });
    return max;
  };

  // Decide an effective max-width: grow past the soft cap up to the hard
  // cap before shrinking font. This keeps base font readable for moderately
  // long words and only invokes font shrink for genuine edge cases.
  const baseWidest = widestWordWidth(LABEL_FONT_BASE);
  let effectiveMax = LABEL_SOFT_CAP;
  if (baseWidest > LABEL_SOFT_CAP) {
    effectiveMax = Math.min(LABEL_HARD_CAP, Math.ceil(baseWidest));
  }
  labels.forEach(l => l.style.maxWidth = effectiveMax + 'px');

  if (baseWidest > LABEL_HARD_CAP) {
    const scale = LABEL_HARD_CAP / baseWidest;
    const size = Math.max(LABEL_FONT_MIN, Math.round(LABEL_FONT_BASE * scale));
    labels.forEach(l => l.style.fontSize = size + 'px');
  }

  let max = 0;
  labels.forEach(l => { if (l.offsetWidth > max) max = l.offsetWidth; });
  labels.forEach(l => l.style.width = max + 'px');
}

function setupLabelEditing(label, row) {
  label.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); label.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); label.textContent = row.label; label.blur(); }
  });
  // Selecting text inside the label should not also select the portrait.
  label.addEventListener('click', e => e.stopPropagation());
  // Resize while typing so the cell grows with the text instead of wrapping
  // first and snapping wide only on blur.
  label.addEventListener('input', syncLabelWidths);
  label.addEventListener('blur', () => {
    let next = label.textContent.replace(/\s+/g, ' ').trim();
    if (next === '') next = row.defaultLabel;        // never let a row go unlabelled
    if (label.textContent !== next) label.textContent = next;
    syncLabelWidths();                                // text changed → re-align row widths
    if (next === row.label) return;
    row.label = next;
    saveState();
  });
}

function nextRowLabel() {
  const last = rows[rows.length - 1]?.label || '';
  if (/^[A-Y]$/.test(last)) return String.fromCharCode(last.charCodeAt(0) + 1);
  return 'New';
}

function addRow() {
  const id = newRowId();
  const label = nextRowLabel();
  rows.push({ id, label, defaultLabel: label });
  tierState[id] = [];
  saveState();
  buildTierList();
}

function removeRow(rowId) {
  if (rows.length <= 1) return;             // keep at least one row
  const idx = rows.findIndex(r => r.id === rowId);
  if (idx === -1) return;
  rows.splice(idx, 1);
  delete tierState[rowId];                  // portraits drop back to pool via renderPool
  saveState();
  buildTierList();
  renderPool();
}

function initPool() {
  const pool = document.getElementById('pool');
  setupDropZone(pool);

  // Click empty area of pool to send selected portrait back
  pool.addEventListener('click', e => {
    if (e.target.closest('.portrait')) return;
    if (!selectedPortrait) return;
    selectedPortrait.remove();
    clearSelection();
    syncStateFromDOM();
    saveState();
    renderPool();
  });
}

function renderPool() {
  const pool = document.getElementById('pool');
  const placed = new Set();
  rows.forEach(r => (tierState[r.id] || []).forEach(id => placed.add(id)));

  const search = (document.getElementById('pool-search').value || '').trim().toLowerCase();
  const rarity = document.getElementById('filter-rarity').value;
  const element = document.getElementById('filter-element').value;
  const cls = document.getElementById('filter-class').value;

  const poolChars = characters
    .filter(c => !placed.has(c.id))
    .filter(c => !search || getName(c).toLowerCase().includes(search))
    .filter(c => rarity === 'all' || c.boneStar === parseInt(rarity))
    .filter(c => element === 'all' || c.element === element)
    .filter(c => cls === 'all' || c.class === cls);

  poolChars.sort((a, b) => b.boneStar - a.boneStar || getName(a).localeCompare(getName(b)));

  pool.replaceChildren();
  const frag = document.createDocumentFragment();
  poolChars.forEach(c => frag.appendChild(createPortrait(c)));
  pool.appendChild(frag);
}

function createPortrait(c) {
  const div = document.createElement('div');
  div.className = 'portrait';
  div.draggable = true;
  div.dataset.id = c.id;
  div.title = getName(c);

  const img = document.createElement('img');
  img.src = '../data/portraits/char_tex_' + c.id + '.png';
  img.alt = getName(c);
  img.loading = 'lazy';
  div.appendChild(img);

  div.addEventListener('dragstart', onDragStart);
  div.addEventListener('dragend', onDragEnd);
  div.addEventListener('click', onPortraitClick);
  div.addEventListener('dblclick', onPortraitDblClick);

  return div;
}

// ─── Drag & Drop ────────────────────────────────────────────────────

function onDragStart(e) {
  wasDragging = true;
  draggedEl = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
  clearSelection();
}

function onDragEnd() {
  this.classList.remove('dragging');
  draggedEl = null;
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  setTimeout(() => { wasDragging = false; }, 0);
}

function setupDropZone(zone) {
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', e => {
    if (!zone.contains(e.relatedTarget)) {
      zone.classList.remove('drag-over');
    }
  });

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (!draggedEl) return;

    if (zone.classList.contains('tier-drop')) {
      // Insert at the correct position within the tier
      const insertBefore = findInsertionPoint(zone, e.clientX, e.clientY);
      if (insertBefore) {
        zone.insertBefore(draggedEl, insertBefore);
      } else {
        zone.appendChild(draggedEl);
      }
    } else {
      // Pool: remove from tier, let renderPool recreate
      draggedEl.remove();
    }

    syncStateFromDOM();
    saveState();
    renderPool();
  });
}

function findInsertionPoint(zone, x, y) {
  const portraits = [...zone.querySelectorAll('.portrait:not(.dragging)')];
  for (const p of portraits) {
    const rect = p.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;
    // Portrait is on a row below the drop point
    if (midY > y + rect.height * 0.4) return p;
    // Portrait is on the same row but to the right
    if (midY > y - rect.height * 0.4 && midX > x) return p;
  }
  return null;
}

// ─── Selection (tap-to-place) ───────────────────────────────────────

function onPortraitClick() {
  if (wasDragging) return;

  // Tapping a portrait that lives inside a tier while another is selected
  // places the selected one next to it. Without this, a tier whose portraits
  // fill the row width has no empty area for a tap-to-place to land on
  // (the row-level handler bails on portrait targets).
  if (selectedPortrait && selectedPortrait !== this) {
    const tierDrop = this.closest('.tier-drop');
    if (tierDrop) {
      tierDrop.insertBefore(selectedPortrait, this);
      clearSelection();
      syncStateFromDOM();
      saveState();
      renderPool();
      return;
    }
  }

  if (selectedPortrait === this) {
    clearSelection();
    return;
  }

  clearSelection();
  selectedPortrait = this;
  this.classList.add('selected');
}

function clearSelection() {
  if (selectedPortrait) {
    selectedPortrait.classList.remove('selected');
    selectedPortrait = null;
  }
}

function onPortraitDblClick() {
  clearSelection();
  // Only move back if currently in a tier (not the pool)
  if (this.closest('.tier-drop')) {
    this.remove();
    syncStateFromDOM();
    saveState();
    renderPool();
  }
}

// ─── State Sync ─────────────────────────────────────────────────────

function syncStateFromDOM() {
  rows.forEach(row => {
    const drop = document.querySelector(`.tier-drop[data-row-id="${row.id}"]`);
    if (!drop) return;
    tierState[row.id] = [...drop.querySelectorAll('.portrait')].map(p => parseInt(p.dataset.id));
  });
}

// ─── Reset ──────────────────────────────────────────────────────────

document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm('Reset all tiers (labels, rows, and colors too)?')) return;
  rows = makeDefaultRows();
  tierState = {};
  rows.forEach(r => tierState[r.id] = []);
  colors = { ...DEFAULT_COLORS };
  saveState();
  buildColorControls();
  buildTierList();
  renderPool();
});

document.getElementById('add-row-btn').addEventListener('click', addRow);

// ─── Color anchor controls ─────────────────────────────────────────

const COLOR_ANCHORS = [
  { key: 'top', label: 'Top' },
  { key: 'mid', label: 'Middle' },
  { key: 'bot', label: 'Bottom' },
];

let openColorPopover = null;

function buildColorControls() {
  const host = document.getElementById('color-controls');
  host.replaceChildren();
  COLOR_ANCHORS.forEach(anchor => {
    const wrap = document.createElement('div');
    wrap.className = 'color-anchor';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-anchor-btn';
    btn.title = anchor.label + ' color';
    const swatch = document.createElement('span');
    swatch.className = 'color-swatch';
    swatch.style.background = colors[anchor.key];
    btn.appendChild(swatch);
    btn.appendChild(document.createTextNode(anchor.label));

    btn.addEventListener('click', e => {
      e.stopPropagation();
      openPicker(wrap, anchor.key, swatch);
    });

    wrap.appendChild(btn);
    host.appendChild(wrap);
  });
}

function openPicker(wrap, key, swatchEl) {
  closeColorPopover();
  const pop = document.createElement('div');
  pop.className = 'color-popover';
  PRESET_COLORS.forEach(hex => {
    const s = document.createElement('button');
    s.type = 'button';
    s.className = 'color-preset';
    s.style.background = hex;
    if (hex === colors[key]) s.classList.add('selected');
    s.title = hex;
    s.addEventListener('click', e => {
      e.stopPropagation();
      colors[key] = hex;
      swatchEl.style.background = hex;
      saveState();
      // Recolor all row labels in place — no need to rebuild rows.
      document.querySelectorAll('.tier-label').forEach((el, idx, list) => {
        el.style.background = rowColor(idx, list.length);
      });
      closeColorPopover();
    });
    pop.appendChild(s);
  });
  wrap.appendChild(pop);
  openColorPopover = pop;
}

function closeColorPopover() {
  if (openColorPopover) {
    openColorPopover.remove();
    openColorPopover = null;
  }
}

document.addEventListener('click', closeColorPopover);

// ─── PNG export ─────────────────────────────────────────────────────

document.getElementById('export-btn').addEventListener('click', () => {
  exportPNG().catch(err => {
    console.error(err);
    alert('Export failed: ' + (err && err.message ? err.message : err));
  });
});

const EXPORT_SCALE = 2;             // 2× pixel density for crisp output
const EXPORT_PORTRAITS_PER_ROW = 10;
const EXPORT_BG = '#181c28';        // drop area background (matches --surface-up)
const EXPORT_BORDER = '#1f2436';    // row divider (matches --border)
const EXPORT_FONT_FAMILY = "Outfit, 'DM Sans', sans-serif";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + src));
    img.src = src;
  });
}

async function exportPNG() {
  // Wait for the display font to be available so canvas measureText is accurate.
  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  const S = EXPORT_SCALE;
  const PORTRAIT = 80 * S;
  const GAP = 4 * S;
  const PAD = 6 * S;
  const CORNER = 12 * S;
  const PORTRAIT_RADIUS = 6 * S;
  const FONT_BASE = LABEL_FONT_BASE * S;
  const FONT_MIN = LABEL_FONT_MIN * S;
  const SOFT_CAP = LABEL_SOFT_CAP * S;
  const HARD_CAP = LABEL_HARD_CAP * S;
  const LABEL_MIN_W = 64 * S;
  const LABEL_PAD_X = 8 * S;

  // ── Determine label font size and column width (matches syncLabelWidths) ──
  const measure = document.createElement('canvas').getContext('2d');
  const widestWordWidth = (fontPx) => {
    measure.font = `800 ${fontPx}px ${EXPORT_FONT_FAMILY}`;
    let max = 0;
    rows.forEach(r => {
      (r.label || '').split(/\s+/).filter(Boolean).forEach(w => {
        const m = measure.measureText(w).width + LABEL_PAD_X * 2;
        if (m > max) max = m;
      });
    });
    return max;
  };

  const baseWidest = widestWordWidth(FONT_BASE);
  let labelFontPx = FONT_BASE;
  let labelMaxW = SOFT_CAP;
  if (baseWidest > SOFT_CAP) labelMaxW = Math.min(HARD_CAP, Math.ceil(baseWidest));
  if (baseWidest > HARD_CAP) {
    labelFontPx = Math.max(FONT_MIN, Math.round(FONT_BASE * HARD_CAP / baseWidest));
  }

  // Wrap each label's text to fit inside the label column, then compute its
  // natural rendered width so the column is exactly as wide as the longest one.
  measure.font = `800 ${labelFontPx}px ${EXPORT_FONT_FAMILY}`;
  const labelLines = rows.map(r => wrapText(measure, r.label, labelMaxW - LABEL_PAD_X * 2));
  let labelColW = LABEL_MIN_W;
  labelLines.forEach(lines => {
    lines.forEach(line => {
      const w = measure.measureText(line).width + LABEL_PAD_X * 2;
      if (w > labelColW) labelColW = w;
    });
  });
  labelColW = Math.min(labelMaxW, Math.max(LABEL_MIN_W, labelColW));

  // ── Row heights ──
  const dropW = EXPORT_PORTRAITS_PER_ROW * PORTRAIT + (EXPORT_PORTRAITS_PER_ROW + 1) * GAP;
  const lineHeight = Math.round(labelFontPx * 1.15);
  const rowHeights = rows.map((r, i) => {
    const portraitCount = (tierState[r.id] || []).length;
    const portraitRows = Math.max(1, Math.ceil(portraitCount / EXPORT_PORTRAITS_PER_ROW));
    const portraitH = portraitRows * PORTRAIT + (portraitRows + 1) * GAP;
    const textH = labelLines[i].length * lineHeight + PAD * 2;
    return Math.max(textH, portraitH);
  });

  const totalW = labelColW + dropW;
  const totalH = rowHeights.reduce((a, b) => a + b, 0);

  // ── Load all portrait images in parallel ──
  const portraitIds = new Set();
  rows.forEach(r => (tierState[r.id] || []).forEach(id => portraitIds.add(id)));
  const imgs = {};
  await Promise.all([...portraitIds].map(id =>
    loadImage('../data/portraits/char_tex_' + id + '.png').then(img => { imgs[id] = img; })
  ));

  // ── Draw ──
  // Safety guard: iOS Safari caps canvases around 4096×4096, and toBlob can
  // fail on older mobile devices well before that. If the canvas at the
  // requested scale would exceed the safety budget, allocate a smaller
  // backing buffer and scale all drawing into it. Invisible for the typical
  // 6-row case (≈1900×1020); only kicks in for very tall lists or 4K bumps.
  const MAX_EXPORT_DIM = 3500;
  const requestedMax = Math.max(totalW, totalH);
  const downscale = requestedMax > MAX_EXPORT_DIM ? MAX_EXPORT_DIM / requestedMax : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(totalW * downscale);
  canvas.height = Math.round(totalH * downscale);
  const ctx = canvas.getContext('2d');
  if (downscale !== 1) ctx.scale(downscale, downscale);

  // Rounded-corner clip so the whole card has transparent corners.
  ctx.save();
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(0, 0, totalW, totalH, CORNER);
    ctx.clip();
  }

  let y = 0;
  rows.forEach((row, i) => {
    const h = rowHeights[i];

    // Label column
    ctx.fillStyle = rowColor(i, rows.length);
    ctx.fillRect(0, y, labelColW, h);

    // Drop column
    ctx.fillStyle = EXPORT_BG;
    ctx.fillRect(labelColW, y, dropW, h);

    // Row divider
    if (i < rows.length - 1) {
      ctx.fillStyle = EXPORT_BORDER;
      ctx.fillRect(0, y + h - 1, totalW, 1);
    }

    // Label text (multi-line, vertically centered)
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${labelFontPx}px ${EXPORT_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 3 * S;
    ctx.shadowOffsetY = 1 * S;
    const lines = labelLines[i];
    const blockH = lines.length * lineHeight;
    const startY = y + (h - blockH) / 2 + lineHeight / 2;
    lines.forEach((line, li) => {
      ctx.fillText(line, labelColW / 2, startY + li * lineHeight);
    });
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Portraits
    const portraits = tierState[row.id] || [];
    portraits.forEach((charId, p) => {
      const col = p % EXPORT_PORTRAITS_PER_ROW;
      const rr  = Math.floor(p / EXPORT_PORTRAITS_PER_ROW);
      const px = labelColW + GAP + col * (PORTRAIT + GAP);
      const py = y + GAP + rr * (PORTRAIT + GAP);
      const img = imgs[charId];
      if (!img) return;
      ctx.save();
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(px, py, PORTRAIT, PORTRAIT, PORTRAIT_RADIUS);
        ctx.clip();
      }
      // Match CSS object-fit: cover, object-position: top
      const aspect = img.naturalWidth / img.naturalHeight;
      let sw, sh, sx, sy;
      if (aspect > 1) {                 // wider than tall → crop sides
        sh = img.naturalHeight; sw = sh; sx = (img.naturalWidth - sw) / 2; sy = 0;
      } else {                          // taller than wide → crop bottom (object-position: top)
        sw = img.naturalWidth; sh = sw; sx = 0; sy = 0;
      }
      ctx.drawImage(img, sx, sy, sw, sh, px, py, PORTRAIT, PORTRAIT);
      ctx.restore();
    });

    y += h;
  });

  ctx.restore();

  canvas.toBlob(blob => {
    if (!blob) { alert('Export failed: could not encode PNG.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tierlist.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

// Greedy word-wrap that mirrors the on-screen behavior: wraps at spaces,
// keeps single long words on their own line (font-shrink already made them fit).
function wrapText(ctx, text, maxWidth) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = cur + ' ' + words[i];
    if (ctx.measureText(test).width <= maxWidth) cur = test;
    else { lines.push(cur); cur = words[i]; }
  }
  lines.push(cur);
  return lines;
}

// ─── Search ─────────────────────────────────────────────────────────

document.getElementById('pool-search').addEventListener('input', renderPool);
document.getElementById('filter-rarity').addEventListener('change', renderPool);
document.getElementById('filter-element').addEventListener('change', renderPool);
document.getElementById('filter-class').addEventListener('change', renderPool);

// ─── Init ───────────────────────────────────────────────────────────

loadData();
