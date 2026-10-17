/* ============================================================
 * render.js —— 把分页结果变成真实 DOM
 * 没有 canvas、没有图片，文字始终是矢量文本。
 * 所有尺寸最终都写进 CSS 变量；样式表只认变量。
 * ============================================================ */
import { FONT_STACKS } from './constants.js';
import {
  cardGeometry, gridDims, pageSize, sheetSafe, sheetLayout, mirrorAxes,
  V_ALIGN, H_ALIGN,
} from './geometry.js';
import { paginate } from './paginate.js';

function borderValue(card) {
  return card.border === 'none' ? 'none' : `1px ${card.border} ${card.borderColor}`;
}

/** 只写真正变化的 CSS 变量，避免无谓的全页样式重算。 */
function setVar(style, name, value) {
  const next = String(value);
  if (style.getPropertyValue(name) !== next) style.setProperty(name, next);
}

/** 把配置写到 :root，作为所有纸张的兜底变量。 */
export function applyPageVars(config) {
  const s = document.documentElement.style;
  const size = pageSize(config);
  const dims = gridDims(config);
  setVar(s, '--page-w', size.w + 'mm');
  // 少 0.1mm：高度刚好等于纸张时，Chrome 容易多吐一张空白页
  setVar(s, '--page-h', (size.h - 0.1) + 'mm');
  setVar(s, '--page-pad', Math.max(0, config.page.padding) + 'mm');
  setVar(s, '--cols', dims.cols);
  setVar(s, '--rows', dims.rows);
  setVar(s, '--grid-gap', Math.max(0, config.grid.gap) + 'mm');
  setVar(s, '--cell-bg', config.card.background);
  setVar(s, '--cell-border', borderValue(config.card));

  applyNoteVars(document.documentElement, config.note);
  applySheetVars(document.documentElement, 'front', config);
}

/** 一面纸实际生效的变量：安全区、文字样式、整块位置、序号角。 */
export function applySheetVars(el, side, config) {
  const s = el.style;
  const safe = sheetSafe(config, side);
  setVar(s, '--cell-safe-t', safe.top + 'mm');
  setVar(s, '--cell-safe-r', safe.right + 'mm');
  setVar(s, '--cell-safe-b', safe.bottom + 'mm');
  setVar(s, '--cell-safe-l', safe.left + 'mm');

  const text = config[side];
  const layout = sheetLayout(config, side, text);
  setVar(s, '--main-font', FONT_STACKS[text.font] || FONT_STACKS.sans);
  setVar(s, '--main-size', text.size + 'pt');
  setVar(s, '--main-weight', text.weight);
  setVar(s, '--main-lh', text.lineHeight);
  setVar(s, '--main-color', text.color);
  setVar(s, '--main-align', layout.align);
  setVar(s, '--body-valign', V_ALIGN[layout.valign] || 'center');
  setVar(s, '--body-halign', H_ALIGN[layout.blockAlign] || 'center');
  setVar(s, '--note-order', layout.noteOnTop ? '-1' : '0');
  setVar(s, '--note-align', layout.noteAlign);

  // 卡片序号：正面右下，背面翻到同一个物理角
  const back = side === 'back';
  const axes = mirrorAxes(config.duplex.mirror);
  const toLeft = back && axes.x;
  const toTop = back && axes.y;
  setVar(s, '--num-left', toLeft ? 'calc(var(--cell-safe-l) + 0.5mm)' : 'auto');
  setVar(s, '--num-right', toLeft ? 'auto' : 'calc(var(--cell-safe-r) + 0.5mm)');
  setVar(s, '--num-top', toTop ? 'calc(var(--cell-safe-t) + 0.5mm)' : 'auto');
  setVar(s, '--num-bottom', toTop ? 'auto' : 'calc(var(--cell-safe-b) + 0.5mm)');
}

export function applyNoteVars(el, note) {
  const s = el.style;
  setVar(s, '--note-gap', note.spacing + 'mm');
  setVar(s, '--note-font', FONT_STACKS[note.font] || FONT_STACKS.sans);
  setVar(s, '--note-size', note.size + 'pt');
  setVar(s, '--note-weight', note.weight);
  setVar(s, '--note-lh', note.lineHeight);
  setVar(s, '--note-color', note.color);
  setVar(s, '--note-align', note.align);
}

/** 动态 @page 纸张方向。 */
export function applyPageRule(config) {
  const style = document.getElementById('page-rule');
  if (!style) return;
  const rule = `@page { size: A4 ${config.page.orientation}; margin: 0; }`;
  if (style.textContent.trim() !== rule) style.textContent = rule;
}

/** 安全区参考线：只在真正设置了宽度的边画线，避免和裁切边框重叠。 */
export function applySafeGuideClasses(sheetEl, safe, enabled) {
  if (!enabled) return;
  sheetEl.classList.add('show-guide');
  const map = { top: 't', right: 'r', bottom: 'b', left: 'l' };
  for (const [side, suffix] of Object.entries(map)) {
    if (safe[side] > 0) sheetEl.classList.add('guide-' + suffix);
  }
}

/* ---------------- DOM ---------------- */

export function createSheet(sheet, config, index, total) {
  const el = document.createElement('div');
  el.className = `sheet sheet--${sheet.side}`;
  el.dataset.side = sheet.side;
  el.dataset.page = String(sheet.pageNo);
  applySheetVars(el, sheet.side, config);
  applySafeGuideClasses(el, sheetSafe(config, sheet.side), config.extras.safeGuide);

  for (const cell of sheet.cells) el.appendChild(createCell(cell, config));

  if (config.extras.pageNum) {
    const num = document.createElement('div');
    num.className = 'sheet__num';
    num.textContent = `第 ${sheet.pageNo} 页`;
    el.appendChild(num);
  }

  // 屏幕辅助标记（打印时隐藏）
  const tag = document.createElement('div');
  tag.className = 'sheet__tag';
  const sideText = sheet.side === 'front' ? '正面' : '反面';
  tag.textContent = `${sideText} · ${index + 1}/${total}` + (sheet.mirrored ? ' · 已镜像' : '');
  el.appendChild(tag);

  return el;
}

function createCell(cell, config) {
  const el = document.createElement('div');
  el.className = 'cell';
  if (!cell) {
    el.classList.add('cell--empty');
    return el;
  }

  const body = document.createElement('div');
  body.className = 'body';

  const main = document.createElement('div');
  main.className = 'main';
  main.textContent = cell.main || '';
  main.dataset.baseSize = String(config[cell.field].size);
  body.appendChild(main);

  if (cell.showNote) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = cell.note || '';
    body.appendChild(note);
  }
  el.appendChild(body);

  if (cell.num) {
    const num = document.createElement('div');
    num.className = 'num';
    num.textContent = cell.num;
    el.appendChild(num);
  }
  return el;
}

/** 分页 + 生成 DOM，返回分页结果供统计使用。 */
export function renderSheets(container, cards, config) {
  const sheets = paginate(cards, config);
  const frag = document.createDocumentFragment();
  sheets.forEach((sheet, i) => frag.appendChild(createSheet(sheet, config, i, sheets.length)));
  container.replaceChildren(frag);
  return sheets;
}

/* ---------------- 超长内容自动缩字号 ---------------- */

/**
 * 逐格检查是否溢出；溢出就二分搜索一个装得下的字号。
 * 只有真的溢出才需要多次测量，大多数格子只量一次。
 */
export function autoFitCell(cell, minPt = 6) {
  if (!cell) return null;
  const body = cell.querySelector('.body');
  const main = body?.querySelector('.main');
  if (!body || !main) return null;

  const note = body.querySelector('.note');
  const baseMain = parseFloat(main.dataset.baseSize) || 12;
  const min = Math.min(baseMain, Math.max(1, Number(minPt) || 6));

  main.style.fontSize = '';
  if (note) note.style.fontSize = '';

  const cs = getComputedStyle(cell);
  const availH = cell.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const availW = cell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  if (availH <= 1 || availW <= 1) return null;

  const baseNotePt = note ? parseFloat(getComputedStyle(note).fontSize) * 72 / 96 : 0;

  const fits = () => {
    const rect = body.getBoundingClientRect();
    return rect.height <= availH + 0.6 && body.scrollWidth <= availW + 0.6;
  };
  const setSize = (pt) => {
    main.style.fontSize = pt.toFixed(2) + 'pt';
    if (note && baseMain > 0) {
      note.style.fontSize = (baseNotePt * pt / baseMain).toFixed(2) + 'pt';
    }
  };

  if (fits()) return baseMain;

  let lo = min;
  let hi = baseMain;
  let best = min;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    setSize(mid);
    if (fits()) { best = mid; hi = mid; } else { lo = mid; }
  }
  setSize(best);
  return best;
}

export function autoFitAll(root, minPt = 6) {
  let changed = 0;
  for (const cell of root.querySelectorAll('.cell')) {
    const result = autoFitCell(cell, minPt);
    if (result !== null && result < parseFloat(cell.querySelector('.main')?.dataset.baseSize || '0')) changed++;
  }
  return changed;
}

/** 供界面显示：卡片尺寸、每页张数、总页数等。 */
export function layoutSummary(cards, config) {
  const g = cardGeometry(config);
  const sheetCount = Math.ceil(cards.length / g.perPage) * 2;
  return {
    ...g,
    cardCount: cards.length,
    sheetCount,
    groupCount: sheetCount / 2,
  };
}
