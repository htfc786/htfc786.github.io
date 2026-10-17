/* ============================================================
 * json.js —— JSON → 行列数据
 * ------------------------------------------------------------
 * 兼容：
 *   [{ front, back, content, i }]        （zzti-web 卡片格式）
 *   [{ q, ans, con }]                    （zzti-web 题库格式）
 *   { data: [...] } / { cards: [...] }   （常见包装）
 *   多层嵌套的分组，例如 { "必修一": [...], "必修二": [...] }
 * 最终都摊平成一张表，再交给用户映射列。
 * ============================================================ */
import { CARD_ALIASES } from '../../core/cards.js';

const CARD_KEYS = new Set(
  Object.values(CARD_ALIASES).flat().map((key) => key.toLowerCase())
);

function hasCardKey(obj) {
  return Object.keys(obj).some((key) => CARD_KEYS.has(key.trim().toLowerCase()));
}

function collectCardArrays(value, out, depth = 0) {
  if (!value || depth > 8) return;
  if (Array.isArray(value)) {
    if (!value.length) return;
    const cardLike = value.some((item) =>
      item && typeof item === 'object' && !Array.isArray(item) && hasCardKey(item));
    if (cardLike) {
      out.push(value);
      return;
    }
    for (const item of value) collectCardArrays(item, out, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectCardArrays(item, out, depth + 1);
  }
}

function findLongestArray(value, depth = 0) {
  if (!value || depth > 8) return null;
  if (Array.isArray(value)) {
    let best = value;
    for (const item of value) {
      const found = findLongestArray(item, depth + 1);
      if (found && found.length > best.length) best = found;
    }
    return best;
  }
  if (typeof value === 'object') {
    let best = null;
    for (const item of Object.values(value)) {
      const found = findLongestArray(item, depth + 1);
      if (found && (!best || found.length > best.length)) best = found;
    }
    return best;
  }
  return null;
}

function stringifyCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function recordsToTable(items) {
  if (!items.length) {
    return { source: 'json', fixedHeaders: [], rawRows: [], defaultHasHeader: true };
  }

  if (items.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
    const headers = [];
    const seen = new Set();
    for (const item of items) {
      for (const key of Object.keys(item)) {
        if (!seen.has(key)) { seen.add(key); headers.push(key); }
      }
    }
    return {
      source: 'json',
      fixedHeaders: headers,
      rawRows: items.map((item) => headers.map((key) => stringifyCell(item[key]))),
      defaultHasHeader: true,
    };
  }

  if (items.every(Array.isArray)) {
    const width = Math.max(...items.map((row) => row.length));
    const headers = Array.from({ length: width }, (_, i) => `第${i + 1}列`);
    return {
      source: 'json',
      fixedHeaders: headers,
      rawRows: items.map((row) => headers.map((_, i) => stringifyCell(row[i]))),
      defaultHasHeader: true,
    };
  }

  return {
    source: 'json',
    fixedHeaders: ['内容'],
    rawRows: items.map((item) => [stringifyCell(item)]),
    defaultHasHeader: true,
  };
}

/** 把任意 JSON 值转成可映射的表格。 */
export function jsonToTable(value) {
  const arrays = [];
  collectCardArrays(value, arrays);
  let items = arrays.length ? arrays.flat() : (findLongestArray(value) || []);
  items = items.filter((item) => item !== null && item !== undefined);
  if (!items.length && value && typeof value === 'object' && !Array.isArray(value) && hasCardKey(value)) {
    items = [value];
  }
  return recordsToTable(items);
}

/** 解析 JSON 文本；失败时抛出带中文提示的错误。 */
export function extractJsonTable(text) {
  let value;
  try {
    value = JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
  } catch (err) {
    throw new Error('JSON 解析失败：' + (err.message || '格式不正确'));
  }
  return [jsonToTable(value)];
}
