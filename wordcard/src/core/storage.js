/* ============================================================
 * storage.js —— localStorage 读写
 * - config:  排版参数，长期保存
 * - work:    导入页的工作稿（含编辑、筛选、来源）
 * - handoff: 导入页 → 制作页的数据交接
 * - ui:      中线宽度、缩放等界面偏好
 * ============================================================ */
import { normalizeConfig } from './config.js';
import { normalizeCards, serializeCards } from './cards.js';

const PREFIX = 'wordcard.v3.';
export const KEYS = {
  config: PREFIX + 'config',
  work: PREFIX + 'work',
  handoff: PREFIX + 'handoff',
  ui: PREFIX + 'ui',
};

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('[wordcard] 本地存储写入失败', err);
    return false;
  }
}

/* ---------------- 配置 ---------------- */

export function loadConfig() {
  return normalizeConfig(readJSON(KEYS.config));
}

export function saveConfig(config) {
  return writeJSON(KEYS.config, config);
}

/* ---------------- 导入页工作稿 ---------------- */

export function loadWork() {
  const raw = readJSON(KEYS.work);
  if (!raw || !Array.isArray(raw.items)) return null;
  return {
    source: raw.source && typeof raw.source === 'object'
      ? { type: String(raw.source.type || 'custom'), id: raw.source.id ?? null, name: String(raw.source.name || '') }
      : null,
    items: raw.items.map((item) => ({
      _id: String(item._id ?? Math.random().toString(36).slice(2)),
      front: String(item.front ?? ''),
      back: String(item.back ?? ''),
      content: String(item.content ?? ''),
      i: Number.isFinite(Number(item.i)) && item.i !== null && item.i !== '' ? Number(item.i) : null,
    })),
    range: raw.range && Number.isFinite(Number(raw.range.min)) && Number.isFinite(Number(raw.range.max))
      ? { min: Number(raw.range.min), max: Number(raw.range.max) }
      : null,
    savedAt: raw.savedAt || null,
  };
}

export function saveWork(work) {
  return writeJSON(KEYS.work, { ...work, savedAt: new Date().toISOString() });
}

export function clearWork() {
  try { localStorage.removeItem(KEYS.work); } catch { /* ignore */ }
}

/* ---------------- 导入页 → 制作页 ---------------- */

export function saveHandoff(cards, meta = {}) {
  return writeJSON(KEYS.handoff, {
    cards: serializeCards(cards),
    meta: {
      name: String(meta.name || ''),
      range: meta.range || null,
      count: cards.length,
    },
    savedAt: new Date().toISOString(),
  });
}

export function clearHandoff() {
  try { localStorage.removeItem(KEYS.handoff); } catch { /* ignore */ }
}

export function loadHandoff() {
  const raw = readJSON(KEYS.handoff);
  if (!raw || !Array.isArray(raw.cards)) return null;
  return {
    cards: normalizeCards(raw.cards),
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : { name: '', count: raw.cards.length },
    savedAt: raw.savedAt || null,
  };
}

/* ---------------- 界面偏好 ---------------- */

export function loadUI() {
  const raw = readJSON(KEYS.ui);
  return raw && typeof raw === 'object' ? raw : {};
}

export function patchUI(patch) {
  return writeJSON(KEYS.ui, { ...loadUI(), ...patch });
}
