/* ============================================================
 * config.js —— 默认配置、预设、配置规范化
 * 配置是唯一排版参数来源；页面上的控件都直接读写它。
 * ============================================================ */
import { MAX_GRID } from './constants.js';

/** 四个实测预设：只改纸张方向、长/短边张数和安全区，排版样式沿用原来的。 */
export const PRESETS = [
  {
    id: 'p1',
    name: '竖版 · 长条',
    tag: '16 × 3',
    orientation: 'portrait',
    long: 16,
    short: 3,
    safe: { top: 0, right: 0, bottom: 0, left: 15 },
  },
  {
    id: 'p2',
    name: '竖版 · 宽条',
    tag: '16 × 2',
    orientation: 'portrait',
    long: 16,
    short: 2,
    safe: { top: 0, right: 0, bottom: 0, left: 15 },
  },
  {
    id: 'p3',
    name: '竖版 · 标准',
    tag: '8 × 4',
    orientation: 'portrait',
    long: 8,
    short: 4,
    safe: { top: 0, right: 0, bottom: 0, left: 15 },
  },
  {
    id: 'p4',
    name: '横版 · 大卡',
    tag: '4 × 4',
    orientation: 'landscape',
    long: 4,
    short: 4,
    safe: { top: 0, right: 0, bottom: 0, left: 15 },
  },
];

export const DEFAULT_PRESET_ID = 'p1';
export const DEFAULT_SAFE = { top: 0, right: 0, bottom: 0, left: 15 };

/** 基础配置 = 原来 demo 的样式 + 四个预设指定的布局。 */
export function defaultConfig(presetId = DEFAULT_PRESET_ID) {
  const config = {
    page: { orientation: 'portrait', padding: 0 },
    grid: { long: 16, short: 3, gap: 0 },
    card: {
      border: 'dashed',
      borderColor: '#d8dde5',
      background: '#ffffff',
      safe: { ...DEFAULT_SAFE },
    },
    front: {
      font: 'sans', size: 16, weight: '700', lineHeight: 1.2,
      color: '#111111', align: 'center', valign: 'center', blockAlign: 'center',
    },
    back: {
      font: 'serif', size: 13, weight: '400', lineHeight: 1.25,
      color: '#111111', align: 'center', valign: 'center', blockAlign: 'center',
    },
    note: {
      show: true, position: 'back', spacing: 1.5,
      font: 'sans', size: 8, weight: '400', lineHeight: 1.3,
      color: '#8a8f99', align: 'center',
    },
    extras: {
      cardNum: true, pageNum: true,
      autoFit: true, autoFitMin: 6, safeGuide: true,
    },
    duplex: { mirror: 'flipX', mirrorLayout: true },
  };
  return applyPreset(config, presetId);
}

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || null;
}

/** 应用预设：布局和安全区回到该预设，文字样式保持用户当前设置。 */
export function applyPreset(config, presetId) {
  const preset = getPreset(presetId);
  if (!preset) return config;
  config.page.orientation = preset.orientation;
  config.page.padding = 0;
  config.grid.long = preset.long;
  config.grid.short = preset.short;
  config.grid.gap = 0;
  config.card.safe = { ...preset.safe };
  return config;
}

/** 当前布局命中哪个预设（只看方向和张数）。 */
export function detectPreset(config) {
  const hit = PRESETS.find((p) =>
    p.orientation === config.page.orientation &&
    p.long === config.grid.long &&
    p.short === config.grid.short);
  return hit ? hit.id : null;
}

/* ---------------- 配置规范化 ---------------- */

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

function mergeKnown(target, source) {
  if (!isObject(source)) return target;
  for (const key of Object.keys(target)) {
    const next = source[key];
    if (next === undefined || next === null) continue;
    if (isObject(target[key])) mergeKnown(target[key], next);
    else if (typeof next === typeof target[key] || key === 'weight') target[key] = next;
  }
  return target;
}

function num(v, fallback, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function int(v, fallback, min, max) {
  return Math.round(num(v, fallback, min, max));
}

/** 把 localStorage / 旧版本配置变成一份安全的新配置。 */
export function normalizeConfig(raw) {
  const config = defaultConfig();
  if (!isObject(raw)) return config;

  // 旧版：每行张数 / 每列张数 → 长边 / 短边
  const legacy = isObject(raw.grid) ? { ...raw.grid } : null;
  if (legacy && legacy.long === undefined && legacy.cols !== undefined) {
    const orientation = raw.page?.orientation === 'landscape' ? 'landscape' : 'portrait';
    const cols = Number(legacy.cols);
    const rows = Number(legacy.rows);
    legacy.long = orientation === 'landscape' ? cols : rows;
    legacy.short = orientation === 'landscape' ? rows : cols;
    delete legacy.cols;
    delete legacy.rows;
  }
  // 旧版：四边统一的安全区
  if (isObject(raw.card) && raw.card.safe === undefined && raw.card.safeArea !== undefined) {
    const v = Number(raw.card.safeArea);
    raw = {
      ...raw,
      card: { ...raw.card, safe: { top: v, right: v, bottom: v, left: v } },
    };
  }

  const merged = mergeKnown(config, raw);
  if (legacy) merged.grid.long = legacy.long ?? merged.grid.long;
  if (legacy) merged.grid.short = legacy.short ?? merged.grid.short;

  // 数值收口，避免坏配置把版面算成 0 或负数
  merged.page.orientation = merged.page.orientation === 'landscape' ? 'landscape' : 'portrait';
  merged.page.padding = num(merged.page.padding, 0, 0, 30);
  merged.grid.long = int(merged.grid.long, 16, 1, MAX_GRID.long);
  merged.grid.short = int(merged.grid.short, 3, 1, MAX_GRID.short);
  merged.grid.gap = num(merged.grid.gap, 0, 0, 20);
  for (const side of ['top', 'right', 'bottom', 'left']) {
    merged.card.safe[side] = num(merged.card.safe[side], 0, 0, 50);
  }
  for (const block of ['front', 'back', 'note']) {
    merged[block].size = num(merged[block].size, 12, 4, 96);
    merged[block].lineHeight = num(merged[block].lineHeight, 1.2, 0.8, 3);
    merged[block].weight = String(merged[block].weight);
  }
  merged.note.spacing = num(merged.note.spacing, 1.5, 0, 20);
  merged.extras.autoFitMin = num(merged.extras.autoFitMin, 6, 3, 20);
  if (!['back', 'front', 'both'].includes(merged.note.position)) merged.note.position = 'back';
  if (!['flipX', 'flipY', 'rot180', 'none'].includes(merged.duplex.mirror)) merged.duplex.mirror = 'flipX';
  return merged;
}

export function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}
