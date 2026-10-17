/* ============================================================
 * csv.js —— RFC4180 风格的 CSV / TSV 解析
 * 自动识别 , ; Tab 三种分隔符；支持引号、引号内换行、"" 转义。
 * ============================================================ */

export function parseDelimited(text, delimiter = ',') {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field.trim() === '') {
      inQuotes = true;
      field = '';
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);

  const cleaned = rows
    .map((cells) => cells.map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell !== ''));

  // 去掉每行末尾多余的空列（常见的尾随逗号）
  while (cleaned.length && cleaned.every((cells) => cells[cells.length - 1] === '')) {
    if (cleaned.every((cells) => cells.length <= 1)) break;
    for (const cells of cleaned) {
      if (cells.length > 1) cells.pop();
    }
  }
  return cleaned;
}

/** 候选分隔符打分：列数 >= 2、各行一致、列数多者胜。 */
export function detectDelimiter(text) {
  const candidates = [',', ';', '\t'];
  let best = { delimiter: ',', score: 0, cols: 1 };
  for (const delimiter of candidates) {
    const rows = parseDelimited(text, delimiter).slice(0, 30);
    if (!rows.length) continue;
    const counts = rows.map((r) => r.length);
    const max = Math.max(...counts);
    if (max < 2) continue;
    const consistent = counts.filter((n) => n === max).length / counts.length;
    const score = max * 10 + consistent * 100;
    if (score > best.score) best = { delimiter, score, cols: max };
  }
  return best;
}

/** @returns {Array<{source:'csv', rawRows:string[][], defaultHasHeader:boolean}>} */
export function extractCsvTable(text, delimiter) {
  const d = delimiter || detectDelimiter(text).delimiter;
  const rows = parseDelimited(text, d);
  if (!rows.length) return [];
  return [{
    source: 'csv',
    delimiter: d,
    rawRows: rows,
    defaultHasHeader: true,
  }];
}

export function looksLikeCsv(text) {
  return detectDelimiter(text).cols >= 2;
}
