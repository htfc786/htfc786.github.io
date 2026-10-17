/* ============================================================
 * markdown.js —— 从 Markdown 文本中提取表格
 * ------------------------------------------------------------
 * 只认「连续的一批带竖线的行」，表格上下的说明文字自动忽略。
 * 支持：多张表、没有分隔行（AI 偶尔会漏）、\| 转义、全角竖线、
 *      <br>、粗体/行内代码/链接等 Markdown 内联格式。
 * ============================================================ */

function isEscaped(text, index) {
  let count = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) count++;
  return count % 2 === 1;
}

function hasUnescapedPipe(line) {
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if ((ch === '|' || ch === '｜') && !isEscaped(line, i)) return true;
  }
  return false;
}

/** 拆一行表格，处理转义竖线；首尾竖线产生的空单元会被去掉。 */
export function splitPipeRow(line) {
  const cells = [];
  let buf = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && (line[i + 1] === '|' || line[i + 1] === '｜')) {
      buf += line[i + 1];
      i++;
      continue;
    }
    if (ch === '|' || ch === '｜') {
      cells.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  cells.push(buf);

  if (cells.length && !cells[0].trim()) cells.shift();
  if (cells.length && !cells[cells.length - 1].trim()) cells.pop();
  return cells.map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  if (!cells.length) return false;
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, '')));
}

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&apos;': "'", '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
};

export function decodeEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp|mdash|ndash|hellip);/g, (m) => ENTITIES[m] || m);
}

/** 去掉 AI 表格里常见的 Markdown / HTML 修饰，只留可读文本。 */
export function cleanCell(cell) {
  let text = String(cell ?? '').trim();
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|li|tr)>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/!\[([^\]]*)\]\((?:[^)]*)\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1');
  text = text.replace(/`([^`]*)`/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2');
  text = decodeEntities(text);
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function normalizeRows(rows) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((row) => {
    const out = row.slice(0, width);
    while (out.length < width) out.push('');
    return out;
  });
}

/**
 * @returns {Array<{source:'markdown', rawRows:string[][], defaultHasHeader:boolean, line:number}>}
 */
export function extractMarkdownTables(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let current = null;

  const flush = () => {
    if (current && current.rows.length >= 2) blocks.push(current);
    current = null;
  };

  lines.forEach((line, index) => {
    if (hasUnescapedPipe(line)) {
      if (!current) current = { rows: [], line: index + 1 };
      current.rows.push(splitPipeRow(line));
    } else {
      flush();
    }
  });
  flush();

  const tables = [];
  for (const block of blocks) {
    const rows = block.rows;
    const sep = rows.findIndex(isSeparatorRow);
    if (sep === 0) continue;                       // 没有表头，大概率不是正经表格
    const headerIndex = sep > 0 ? sep - 1 : 0;
    const headers = rows[headerIndex];
    if (headers.length < 2) continue;

    const body = rows.slice(sep > 0 ? sep + 1 : 1)
      .filter((row) => row.some((cell) => cell.trim() !== ''));
    if (!body.length) continue;

    const rawRows = normalizeRows([headers, ...body])
      .map((row) => row.map(cleanCell));
    tables.push({
      source: 'markdown',
      rawRows,
      defaultHasHeader: true,
      line: block.line,
    });
  }
  return tables;
}

export function looksLikeMarkdownTable(text) {
  return extractMarkdownTables(text).length > 0;
}
