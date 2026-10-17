/* ============================================================
 * detect.js —— 格式识别入口
 * ============================================================ */
import { extractMarkdownTables } from './markdown.js';
import { extractCsvTable, detectDelimiter } from './csv.js';
import { extractJsonTable } from './json.js';

export const FORMAT_LABELS = {
  auto: '自动识别',
  json: 'JSON',
  markdown: 'Markdown 表格',
  csv: 'CSV / TSV',
};

/** 去掉 AI 输出常见的整段 ```json / ```csv 代码围栏。 */
export function stripOuterCodeFence(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const match = src.match(/^\s*```[a-zA-Z0-9_-]*\s*\r?\n([\s\S]*?)\r?\n```\s*$/);
  return match ? match[1] : src;
}

export function detectFormat(text) {
  const src = stripOuterCodeFence(text).trim();
  if (!src) return 'unknown';

  if (src[0] === '[' || src[0] === '{') {
    try { JSON.parse(src); return 'json'; } catch { /* 不是 JSON，继续试别的 */ }
  }
  if (extractMarkdownTables(src).length) return 'markdown';
  if (detectDelimiter(src).cols >= 2) return 'csv';
  return 'unknown';
}

/**
 * @param {string} text 原始文本
 * @param {'auto'|'json'|'markdown'|'csv'} format
 * @returns {{format:string, tables:Array}}
 */
export function parseImport(text, format = 'auto') {
  const src = stripOuterCodeFence(text);
  if (!src.trim()) throw new Error('还没有内容，先粘贴数据或选择文件。');

  const actual = format === 'auto' ? detectFormat(src) : format;
  let tables = [];

  if (actual === 'json') {
    tables = extractJsonTable(src);
  } else if (actual === 'markdown') {
    tables = extractMarkdownTables(src);
    if (!tables.length) {
      throw new Error('没有识别到 Markdown 表格。表格需要至少两行，并由 | 分隔。');
    }
  } else if (actual === 'csv') {
    tables = extractCsvTable(src);
    if (!tables.length) throw new Error('CSV 里没有可用的数据行。');
  } else {
    throw new Error('无法识别格式。请选择 JSON / Markdown 表格 / CSV，或检查内容。');
  }

  if (!tables.length) throw new Error('没有解析出任何数据。');
  return { format: actual, tables };
}
