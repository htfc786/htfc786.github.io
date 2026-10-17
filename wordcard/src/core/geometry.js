/* ============================================================
 * geometry.js —— 纸张 / 网格 / 安全区 / 背面镜像的纯计算
 * 输入配置，输出 mm；不碰 DOM，可单测。
 * ============================================================ */
import { PAGE_SIZES } from './constants.js';

export const mm2px = (mm) => mm * 96 / 25.4;

export function pageSize(config) {
  return PAGE_SIZES[config.page.orientation] || PAGE_SIZES.portrait;
}

/**
 * 「长边 / 短边张数」→ CSS 网格的列数 / 行数。
 * 竖向时宽边是短边；横向时宽边是长边。
 */
export function gridDims(config) {
  const landscape = config.page.orientation === 'landscape';
  const long = Math.max(1, config.grid.long | 0);
  const short = Math.max(1, config.grid.short | 0);
  return landscape
    ? { cols: long, rows: short, long, short }
    : { cols: short, rows: long, long, short };
}

/** 安全区四边独立；兼容老的单个 safeArea。 */
export function cardSafe(card) {
  const s = card?.safe;
  if (!s) {
    const v = Math.max(0, Number(card?.safeArea) || 0);
    return { top: v, right: v, bottom: v, left: v };
  }
  return {
    top: Math.max(0, Number(s.top) || 0),
    right: Math.max(0, Number(s.right) || 0),
    bottom: Math.max(0, Number(s.bottom) || 0),
    left: Math.max(0, Number(s.left) || 0),
  };
}

/**
 * 卡片尺寸不需要用户填写：由「纸张 − 留白 − 间距」÷ 张数算出来。
 * 同时给出扣掉安全区之后真正可写的内容区域。
 */
export function cardGeometry(config) {
  const page = pageSize(config);
  const safe = cardSafe(config.card);
  const { cols, rows, long, short } = gridDims(config);
  const gap = Math.max(0, Number(config.grid.gap) || 0);
  const pad = Math.max(0, Number(config.page.padding) || 0);
  const w = Math.max(0, (page.w - pad * 2 - gap * (cols - 1)) / cols);
  const h = Math.max(0, (page.h - pad * 2 - gap * (rows - 1)) / rows);
  return {
    page,
    cols,
    rows,
    long,
    short,
    perPage: cols * rows,
    w,
    h,
    safe,
    textW: Math.max(0, w - safe.left - safe.right),
    textH: Math.max(0, h - safe.top - safe.bottom),
  };
}

/* ---------------- 背面镜像 ---------------- */

export function mirrorAxes(mode) {
  return {
    x: mode === 'flipX' || mode === 'rot180',
    y: mode === 'flipY' || mode === 'rot180',
  };
}

/** 网格里第 i 个格子在背面应该落到哪一格。 */
export function mirrorIndex(i, cols, rows, mode) {
  const r = Math.floor(i / cols);
  const c = i % cols;
  switch (mode) {
    case 'flipX': return r * cols + (cols - 1 - c);
    case 'flipY': return (rows - 1 - r) * cols + c;
    case 'rot180': return (rows - 1 - r) * cols + (cols - 1 - c);
    default: return i;
  }
}

const ALIGN_FLIP = { left: 'right', right: 'left', center: 'center', justify: 'justify' };
const BLOCK_FLIP = { left: 'right', right: 'left', center: 'center' };
const VALIGN_FLIP = { top: 'bottom', bottom: 'top', center: 'center' };

export function isBackMirrored(config, side) {
  return side === 'back' && config.duplex.mirrorLayout !== false;
}

/** 这一面实际用的安全区：背面按镜像方式翻到对应的物理边。 */
export function sheetSafe(config, side) {
  const s = cardSafe(config.card);
  if (side !== 'back') return s;
  const a = mirrorAxes(config.duplex.mirror);
  return {
    top: a.y ? s.bottom : s.top,
    right: a.x ? s.left : s.right,
    bottom: a.y ? s.top : s.bottom,
    left: a.x ? s.right : s.left,
  };
}

/** 这一面实际用的内容布局（文字本身不镜像，镜像的是摆放几何）。 */
export function sheetLayout(config, side, textStyle) {
  const a = isBackMirrored(config, side) ? mirrorAxes(config.duplex.mirror) : { x: false, y: false };
  return {
    align: a.x ? (ALIGN_FLIP[textStyle.align] || textStyle.align) : textStyle.align,
    blockAlign: a.x ? (BLOCK_FLIP[textStyle.blockAlign] || textStyle.blockAlign) : textStyle.blockAlign,
    valign: a.y ? (VALIGN_FLIP[textStyle.valign] || textStyle.valign) : textStyle.valign,
    noteOnTop: a.y,
    noteAlign: a.x ? (ALIGN_FLIP[config.note.align] || config.note.align) : config.note.align,
    flipX: a.x,
    flipY: a.y,
  };
}

export const V_ALIGN = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
export const H_ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end' };
