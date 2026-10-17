/* ============================================================
 * table.js —— 表格 → 卡片
 * 负责：表头行开关、列宽补齐、自动猜列映射、按映射生成卡片。
 * ============================================================ */
import { CARD_ALIASES, normalizeText, toIndex } from '../../core/cards.js';

export const FIELDS = [
  { key: 'front', label: '正面', required: true },
  { key: 'back', label: '反面' },
  { key: 'content', label: '附加信息' },
  { key: 'i', label: '序号' },
];

function normalizeHeader(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[\s`*_#：:（）()\[\]【】<>《》.,，。;；/\\|｜-]/g, '');
}

function rawHeader(value) {
  return String(value ?? '').trim().toLowerCase();
}

const ALIAS_INDEX = Object.fromEntries(
  Object.entries(CARD_ALIASES).map(([field, aliases]) => [
    field,
    aliases.map((alias) => ({ raw: alias.toLowerCase(), compact: normalizeHeader(alias) })),
  ])
);

function headerScore(header, field) {
  const raw = rawHeader(header);
  const compact = normalizeHeader(header);
  if (!raw && !compact) return 0;
  let best = 0;
  for (const alias of ALIAS_INDEX[field]) {
    if (raw === alias.raw) best = Math.max(best, 1000);
    if (compact && compact === alias.compact) best = Math.max(best, 950);
    // 单字符别名只认全等，避免 "i" 命中任意单词
    if (alias.compact.length >= 2 && compact.includes(alias.compact)) {
      best = Math.max(best, 700 - Math.abs(compact.length - alias.compact.length));
    }
    if (alias.compact.length >= 2 && compact.length >= 2 && alias.compact.includes(compact)) {
      best = Math.max(best, 400 - Math.abs(compact.length - alias.compact.length));
    }
  }
  return best;
}

/**
 * 按表头自动猜列。猜不到就按列顺序兜底：
 * 正面 = 第一列，反面 = 第二列，附加信息 = 第三列。
 */
export function guessMapping(headers) {
  const mapping = { front: -1, back: -1, content: -1, i: -1 };
  const used = new Set();

  for (const field of ['i', 'front', 'back', 'content']) {
    let bestIndex = -1;
    let bestScore = 0;
    headers.forEach((header, index) => {
      if (used.has(index)) return;
      const score = headerScore(header, field);
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    if (bestIndex >= 0) {
      mapping[field] = bestIndex;
      used.add(bestIndex);
    }
  }

  for (const field of ['front', 'back', 'content']) {
    if (mapping[field] >= 0) continue;
    const index = headers.findIndex((_, i) => !used.has(i));
    if (index >= 0) {
      mapping[field] = index;
      used.add(index);
    }
  }
  return mapping;
}

/** 应用「首行是表头」开关，得到规范化表头和行。 */
export function buildTable(table, hasHeader = true) {
  const rawRows = (table.rawRows || []).map((row) => row.map((cell) => String(cell ?? '')));
  let headers;
  let rows;

  if (table.fixedHeaders) {
    headers = [...table.fixedHeaders];
    rows = rawRows;
  } else if (hasHeader && rawRows.length) {
    headers = [...rawRows[0]];
    rows = rawRows.slice(1);
  } else {
    const width = Math.max(0, ...rawRows.map((row) => row.length));
    headers = Array.from({ length: width }, (_, i) => `第${i + 1}列`);
    rows = rawRows;
  }

  const width = Math.max(headers.length, ...rows.map((row) => row.length), 0);
  while (headers.length < width) headers.push(`第${headers.length + 1}列`);
  headers = headers.map((header, index) => String(header || '').trim() || `第${index + 1}列`);
  rows = rows.map((row) => {
    const out = row.slice(0, width);
    while (out.length < width) out.push('');
    return out;
  });

  return { headers, rows, source: table.source || 'table', line: table.line || 0 };
}

export function rowsToCards(table, mapping) {
  const pick = (row, field) => {
    const index = Number(mapping[field]);
    if (!Number.isInteger(index) || index < 0) return '';
    return normalizeText(row[index] ?? '');
  };
  const cards = [];
  for (const row of table.rows) {
    const front = pick(row, 'front');
    const back = pick(row, 'back');
    const content = pick(row, 'content');
    if (!front && !back && !content) continue;
    const iIndex = Number(mapping.i);
    const i = Number.isInteger(iIndex) && iIndex >= 0 ? toIndex(row[iIndex]) : null;
    cards.push({ front, back, content, i });
  }
  return cards;
}

export function mappingPreview(table, mapping, limit = 4) {
  return rowsToCards({ rows: table.rows.slice(0, limit) }, mapping);
}
