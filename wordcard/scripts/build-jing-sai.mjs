#!/usr/bin/env node
/**
 * build-jing-sai.mjs
 *
 * 把 tmp/答案对照表.txt（TSV：编号 / 词条 / 答案 / 备注）转换成项目卡片 JSON。
 *
 * 规则（按需求刻意保持“错就错”）：
 *   1. i 原样取「编号」，不重排、不重新编号，缺号/跳号也保留；
 *   2. front = 词条去掉末尾词性后的部分；
 *   3. back  = 词性 + 空格 + 中文；若答案本身已带词性，则不重复添加；
 *   4. 识别不出词性、词条里混入音标/变形/多余字符、答案残缺等，
 *      一律按源文件原样输出，不做“修正”。
 *
 * 用法：
 *   node scripts/build-jing-sai.mjs
 *   node scripts/build-jing-sai.mjs <源文件> <输出JSON> <报告TXT>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = path.join(ROOT, 'tmp/答案对照表.txt');
const DEFAULT_OUTPUT = path.join(ROOT, 'data/jing-sai-2900.json');
const DEFAULT_REPORT = path.join(ROOT, 'tmp/答案对照表-转换报告.txt');

/* 词性白名单。vn. 是源表里的写法（v. / n. 粘连），保留。 */
const POS_ATOMS = new Set([
  'n', 'v', 'vt', 'vi', 'a', 'ad', 'adj', 'adv',
  'prep', 'conj', 'pron', 'num', 'int', 'aux', 'art', 'pl', 'vn',
]);

/** 去掉词性 token 首尾的 . & / 、 , ; 后，拆成若干词性原子。 */
function posAtoms(token) {
  const core = token.replace(/^[.&/、,;]+|[.&/、,;]+$/g, '');
  if (!core) return [];
  if (!/^[a-z.&/、,;]+$/i.test(core)) return [];
  return core
    .split(/[.&/、,;]+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase());
}

/** 整个 token 是否只由词性原子和分隔符组成，例如 n. / vt. / n.& v. / a./ */
function isPosToken(token) {
  if (!/[a-z]/i.test(token)) return false;
  const atoms = posAtoms(token);
  return atoms.length > 0 && atoms.every((atom) => POS_ATOMS.has(atom));
}

/** 纯标点 token（. 、 - / 等），扫描词性块时允许跨过。 */
function isPunctToken(token) {
  return !/[a-z0-9]/i.test(token);
}

/**
 * 拆分「词条」列。
 * 从右往左找最后一段词性，词性前面整体算单词。
 * 例：
 *   "abandon   v."          -> { front: "abandon", pos: "v." }
 *   "abstract  a./ n."      -> { front: "abstract", pos: "a./ n." }
 *   "bacon  n.  -"          -> { front: "bacon", pos: "n." }
 *   "according to  ad."     -> { front: "according to", pos: "ad." }
 *   "ad." / "E"             -> { front: "ad.", pos: "" }（整条都是词性/标题，保持原样）
 */
function splitWordCell(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { front: '', pos: '' };

  const tokens = text.split(' ');
  let last = -1;
  for (let j = tokens.length - 1; j >= 0; j -= 1) {
    if (isPosToken(tokens[j])) {
      last = j;
      break;
    }
  }
  if (last < 0) return { front: text, pos: '' };

  let start = last;
  for (let j = last - 1; j >= 0; j -= 1) {
    if (isPosToken(tokens[j]) || isPunctToken(tokens[j])) start = j;
    else break;
  }

  // 整条都是词性（ad.）或只有一个字母标题（N / V），不硬拆。
  if (start === 0) return { front: text, pos: '' };

  const pos = tokens
    .slice(start, last + 1)
    .filter((token) => /[a-z]/i.test(token))
    .join(' ');
  const front = tokens.slice(0, start).join(' ').trim();
  return { front, pos };
}

/** 答案列是否已经以词性开头。 */
function startsWithPos(answer) {
  const first = String(answer || '').trim().split(/\s+/)[0] || '';
  return isPosToken(first);
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function main() {
  const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SOURCE;
  const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUTPUT;
  const reportPath = process.argv[4] ? path.resolve(process.argv[4]) : DEFAULT_REPORT;

  if (!fs.existsSync(sourcePath)) fail(`找不到源文件：${sourcePath}`);

  const rawText = fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = rawText.split(/\r?\n/);

  const cards = [];
  const skipped = [];
  const noPos = [];
  const emptyBack = [];
  const answerHadPos = [];
  const suspiciousFront = [];
  const seen = new Map();

  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const cols = line.split('\t');
    const rawNo = (cols[0] || '').trim();

    // 表头 / 非数字编号：不生成卡片。i 始终取源表编号，绝不按行号补号。
    if (!/^\d+$/.test(rawNo)) {
      skipped.push({ line: index + 1, raw: line });
      return;
    }

    const i = Number(rawNo);
    const rawWord = (cols[1] || '').trim();
    const answer = (cols[2] || '').trim();
    const note = (cols[3] || '').trim();

    const { front, pos } = splitWordCell(rawWord);
    const alreadyPos = startsWithPos(answer);
    const back = alreadyPos || !pos
      ? answer
      : (answer ? `${pos} ${answer}` : pos);

    cards.push({ front, back, i });
    if (seen.has(i)) seen.get(i).push(index + 1);
    else seen.set(i, [index + 1]);

    if (!pos) noPos.push({ i, front, back, raw: rawWord, note, line: index + 1 });
    if (!back) emptyBack.push({ i, front, raw: rawWord, note, line: index + 1 });
    if (alreadyPos && pos) {
      answerHadPos.push({ i, front, pos, answer, line: index + 1 });
    }
    if (/[=()/]|[\u4e00-\u9fff]/.test(front)) {
      suspiciousFront.push({ i, front, pos, line: index + 1 });
    }
  });

  if (!cards.length) fail('没有解析出任何卡片');

  const numbers = cards.map((card) => card.i);
  const unique = new Set(numbers);
  const duplicates = [...unique]
    .filter((number) => seen.get(number).length > 1)
    .sort((a, b) => a - b);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const gaps = [];
  for (let n = min; n <= max; n += 1) {
    if (!unique.has(n)) gaps.push(n);
  }

  // 一行一张卡，保持和原 data 文件相同的排版。
  const body = cards
    .map((card) => `  { "front": ${JSON.stringify(card.front)}, "back": ${JSON.stringify(card.back)}, "i": ${card.i} }`)
    .join(',\n');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `[\n${body}\n]\n`, 'utf8');

  const report = [];
  report.push('答案对照表 → 项目 JSON 转换报告');
  report.push('='.repeat(52));
  report.push(`源文件：${path.relative(ROOT, sourcePath)}`);
  report.push(`输出：  ${path.relative(ROOT, outputPath)}`);
  report.push('');
  report.push(`源表非空行：${lines.filter((line) => line.trim()).length}`);
  report.push(`生成卡片：  ${cards.length}`);
  report.push(`跳过行：    ${skipped.length}（表头/非数字编号）`);
  report.push(`编号范围：  ${min}–${max}，唯一编号 ${unique.size} 个`);
  report.push(`缺号：      ${gaps.length ? gaps.join(', ') : '无'}`);
  report.push(`重号：      ${duplicates.length ? duplicates.join(', ') : '无'}`);
  report.push(`带词性：    ${cards.length - noPos.length}`);
  report.push(`未识别词性：${noPos.length}（front 保留原词条，back 直接中文）`);
  report.push(`空反面：    ${emptyBack.length}（字母标题 / 残缺行，按原样保留）`);
  report.push(`答案已带词性、未重复添加：${answerHadPos.length}`);
  report.push('');

  report.push('— 未识别词性的行 —');
  if (!noPos.length) report.push('（无）');
  for (const row of noPos) {
    report.push(`${row.i}\t${row.front}\t${row.back}${row.note ? `\t[${row.note}]` : ''}`);
  }
  report.push('');

  report.push('— 空反面的行（不修正） —');
  if (!emptyBack.length) report.push('（无）');
  for (const row of emptyBack) {
    report.push(`${row.i}\t${JSON.stringify(row.front)}\t${row.note ? `[${row.note}]` : ''}`);
  }
  report.push('');

  report.push('— 答案已带词性、未再前置词性的行 —');
  if (!answerHadPos.length) report.push('（无）');
  for (const row of answerHadPos) {
    report.push(`${row.i}\t${row.front}\t词条词性=${row.pos}\t答案=${row.answer}`);
  }
  report.push('');

  report.push('— front 含 = ( ) / 或中文的可疑行（不修正） —');
  if (!suspiciousFront.length) report.push('（无）');
  for (const row of suspiciousFront) {
    report.push(`${row.i}\t${row.front}${row.pos ? `\t${row.pos}` : ''}`);
  }
  report.push('');

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${report.join('\n')}\n`, 'utf8');

  console.log(`✓ 已生成 ${path.relative(ROOT, outputPath)}`);
  console.log(`  卡片 ${cards.length} 条，编号 ${min}–${max}，缺号 ${gaps.length}，重号 ${duplicates.length}`);
  console.log(`  带词性 ${cards.length - noPos.length}，未识别词性 ${noPos.length}，空反面 ${emptyBack.length}`);
  console.log(`✓ 报告 ${path.relative(ROOT, reportPath)}`);
}

main();
