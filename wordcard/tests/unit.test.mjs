import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultConfig, applyPreset, detectPreset, normalizeConfig, PRESETS,
} from '../src/core/config.js';
import {
  cardGeometry, gridDims, mirrorIndex, sheetSafe, sheetLayout,
} from '../src/core/geometry.js';
import {
  normalizeCard, normalizeCards, cardNumber, serializeCards, cardsToJSON,
  parsePlainText, CARD_ALIASES,
} from '../src/core/cards.js';
import { paginate } from '../src/core/paginate.js';
import { extractMarkdownTables, splitPipeRow } from '../src/import/parse/markdown.js';
import {
  parseDelimited, detectDelimiter, extractCsvTable,
} from '../src/import/parse/csv.js';
import { jsonToTable, extractJsonTable } from '../src/import/parse/json.js';
import {
  buildTable, guessMapping, rowsToCards,
} from '../src/import/parse/table.js';
import {
  detectFormat, parseImport, stripOuterCodeFence,
} from '../src/import/parse/detect.js';

/* ================= 配置 / 预设 / 几何 ================= */

test('四个预设的纸张方向与长/短边张数', () => {
  assert.deepEqual(PRESETS.map((p) => [p.orientation, p.long, p.short]), [
    ['portrait', 16, 3],
    ['portrait', 16, 2],
    ['portrait', 8, 4],
    ['landscape', 4, 4],
  ]);
  for (const preset of PRESETS) {
    assert.deepEqual(preset.safe, { top: 0, right: 0, bottom: 0, left: 15 });
  }
});

test('默认配置 = 预设 1，安全区左 15mm', () => {
  const config = defaultConfig();
  assert.equal(config.page.orientation, 'portrait');
  assert.equal(config.grid.long, 16);
  assert.equal(config.grid.short, 3);
  assert.deepEqual(config.card.safe, { top: 0, right: 0, bottom: 0, left: 15 });
  assert.equal(detectPreset(config), 'p1');
  assert.equal(defaultConfig('p4').page.orientation, 'landscape');
});

test('预设几何尺寸（A4 相除）', () => {
  const cases = [
    ['p1', 70, 18.5625, 3, 16],
    ['p2', 105, 18.5625, 2, 16],
    ['p3', 52.5, 37.125, 4, 8],
    ['p4', 74.25, 52.5, 4, 4],
  ];
  for (const [id, w, h, cols, rows] of cases) {
    const g = cardGeometry(defaultConfig(id));
    assert.equal(g.cols, cols, id + ' cols');
    assert.equal(g.rows, rows, id + ' rows');
    assert.ok(Math.abs(g.w - w) < 1e-9, `${id} w=${g.w}`);
    assert.ok(Math.abs(g.h - h) < 1e-9, `${id} h=${g.h}`);
    assert.equal(g.textW, w - 15);
    assert.equal(g.textH, h);
  }
  const p1 = cardGeometry(defaultConfig('p1'));
  assert.equal(p1.perPage, 48);
  assert.equal(p1.textW, 55);
});

test('应用预设会重置留白与间距', () => {
  const config = defaultConfig('p1');
  config.page.padding = 8;
  config.grid.gap = 3;
  applyPreset(config, 'p4');
  assert.equal(config.page.padding, 0);
  assert.equal(config.grid.gap, 0);
  assert.equal(config.page.orientation, 'landscape');
  assert.deepEqual(config.card.safe, { top: 0, right: 0, bottom: 0, left: 15 });
});

test('长/短边 → CSS 行列数与纸张方向有关', () => {
  assert.deepEqual(
    (({ cols, rows }) => ({ cols, rows }))(gridDims(defaultConfig('p1'))),
    { cols: 3, rows: 16 },
  );
  assert.deepEqual(
    (({ cols, rows }) => ({ cols, rows }))(gridDims(defaultConfig('p4'))),
    { cols: 4, rows: 4 },
  );
});

test('旧配置的每行/每列张数和 safeArea 会迁移', () => {
  const config = normalizeConfig({
    page: { orientation: 'landscape' },
    grid: { cols: 6, rows: 4, gap: 0 },
    card: { safeArea: 5 },
  });
  assert.equal(config.grid.long, 6);
  assert.equal(config.grid.short, 4);
  assert.deepEqual(config.card.safe, { top: 5, right: 5, bottom: 5, left: 5 });

  const portrait = normalizeConfig({
    page: { orientation: 'portrait' },
    grid: { cols: 3, rows: 16 },
  });
  assert.equal(portrait.grid.long, 16);
  assert.equal(portrait.grid.short, 3);
});

/* ================= 镜像 ================= */

test('背面网格镜像', () => {
  assert.equal(mirrorIndex(0, 4, 2, 'flipX'), 3);
  assert.equal(mirrorIndex(3, 4, 2, 'flipX'), 0);
  assert.equal(mirrorIndex(4, 4, 2, 'flipY'), 0);
  assert.equal(mirrorIndex(0, 4, 2, 'rot180'), 7);
  assert.equal(mirrorIndex(5, 4, 2, 'none'), 5);
});

test('背面安全区翻到同一条物理边', () => {
  const config = defaultConfig('p1');
  assert.deepEqual(sheetSafe(config, 'front'), { top: 0, right: 0, bottom: 0, left: 15 });
  assert.deepEqual(sheetSafe(config, 'back'), { top: 0, right: 15, bottom: 0, left: 0 });
  config.duplex.mirror = 'flipY';
  config.card.safe = { top: 12, right: 1, bottom: 3, left: 5 };
  assert.deepEqual(sheetSafe(config, 'back'), { top: 3, right: 1, bottom: 12, left: 5 });
});

test('背面内容布局跟随镜像，文字本身不镜像', () => {
  const config = defaultConfig();
  config.back.align = 'left';
  config.back.blockAlign = 'left';
  config.back.valign = 'top';
  config.duplex.mirror = 'rot180';
  const layout = sheetLayout(config, 'back', config.back);
  assert.equal(layout.align, 'right');
  assert.equal(layout.blockAlign, 'right');
  assert.equal(layout.valign, 'bottom');
  assert.equal(layout.noteOnTop, true);
});

/* ================= 卡片模型 ================= */

test('zzti 的 q/ans/con 与 i 字段', () => {
  const card = normalizeCard({ q: 'apple', ans: '苹果', con: '/ˈæpl/', i: '7' });
  assert.deepEqual(card, { front: 'apple', back: '苹果', content: '/ˈæpl/', i: 7 });
  assert.equal(normalizeCard({ word: 'cat', meaning: '猫' }).front, 'cat');
  assert.equal(normalizeCard({ front: 'a\\nb' }).front, 'a\nb');
});

test('卡片序号优先用 i，没有 i 时用顺序号', () => {
  assert.equal(cardNumber({ front: 'a', i: 88 }, 3), 88);
  assert.equal(cardNumber({ front: 'a', i: null }, 3), 3);
  assert.equal(cardNumber({ front: 'a' }, 3), 3);
});

test('序列化保留 i，导出 JSON 是 zzti 格式', () => {
  const cards = normalizeCards([
    { front: 'a', back: 'b', content: 'c', i: 1 },
    { front: 'd', back: 'e' },
  ]);
  assert.deepEqual(serializeCards(cards), [
    { front: 'a', back: 'b', content: 'c', i: 1 },
    { front: 'd', back: 'e', content: '' },
  ]);
  assert.equal(JSON.parse(cardsToJSON(cards))[0].i, 1);
});

test('纯文本行格式（老 demo）', () => {
  const cards = parsePlainText('apple | 苹果 | /ˈæpl/\ncat | 猫');
  assert.equal(cards[0].front, 'apple');
  assert.equal(cards[0].content, '/ˈæpl/');
  assert.equal(cards[1].back, '猫');
});

/* ================= 分页 ================= */

test('分页、正反面配对、i 序号', () => {
  const config = defaultConfig('p1');
  const cards = [
    { front: 'a', back: 'A', content: 'x', i: 7 },
    { front: 'b', back: 'B', content: '', i: 9 },
    { front: 'c', back: 'C', content: '', i: 11 },
  ];
  const sheets = paginate(cards, config);
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].side, 'front');
  assert.equal(sheets[0].pageNo, 1);
  assert.equal(sheets[1].pageNo, 2);
  assert.deepEqual(sheets[0].cells.slice(0, 3).map((cell) => cell.num), ['7', '9', '11']);
  // 3 列 16 行：0 → 第 3 列，1 → 第 2 列，2 → 第 1 列
  assert.equal(sheets[1].cells[0].main, 'C');
  assert.equal(sheets[1].cells[1].main, 'B');
  assert.equal(sheets[1].cells[2].main, 'A');
  assert.equal(sheets[1].mirrored, true);
  assert.equal(sheets[0].cells[5], null);
});

test('没有 i 时按顺序编号，页码连续', () => {
  const config = defaultConfig('p3');       // 32 张 / 页
  const cards = Array.from({ length: 35 }, (_, i) => ({ front: String(i + 1), back: '' }));
  const sheets = paginate(cards, config);
  assert.equal(sheets.length, 4);
  assert.deepEqual(sheets.map((s) => s.pageNo), [1, 2, 3, 4]);
  assert.equal(sheets[2].cells[0].num, '33');
  assert.equal(sheets[2].cells[1].num, '34');
});

/* ================= Markdown ================= */

const MD = `这是一段说明，应该被忽略。

| 序号 | 单词 | 释义 | 音标 |
| :--- | ---: | :---: | --- |
| 1 | apple | 苹果 | /ˈæpl/ |
| 2 | \`banana\` | 香蕉<br>（黄色） | /bəˈnɑːnə/ |

中间的文字也忽略。

| # | 正面 | 备注 |
| --- | --- | --- |
| 3 | **cat** | 猫 \\| kitty |
| 4 | dog | 狗 |
`;

test('Markdown 多表提取，忽略表格外文字', () => {
  const tables = extractMarkdownTables(MD);
  assert.equal(tables.length, 2);
  const first = buildTable(tables[0], true);
  assert.deepEqual(first.headers, ['序号', '单词', '释义', '音标']);
  assert.equal(first.rows.length, 2);
  assert.equal(first.rows[1][1], 'banana');
  assert.equal(first.rows[1][2], '香蕉\n（黄色）');
  const second = buildTable(tables[1], true);
  assert.equal(second.rows[0][2], '猫 | kitty');
  assert.equal(second.rows[0][1], 'cat');
});

test('Markdown 转义竖线，不切列', () => {
  assert.deepEqual(splitPipeRow('| a \\| b | c |'), ['a | b', 'c']);
  assert.deepEqual(splitPipeRow('｜a｜b｜'), ['a', 'b']);
});

test('没有分隔行的表格也能识别', () => {
  const tables = extractMarkdownTables('| 正面 | 反面 |\n| apple | 苹果 |\n| cat | 猫 |');
  assert.equal(tables.length, 1);
  const table = buildTable(tables[0], true);
  assert.deepEqual(table.headers, ['正面', '反面']);
  assert.equal(table.rows.length, 2);
});

test('Markdown 内联格式清洗', () => {
  const [table] = extractMarkdownTables('| A | B |\n| --- | --- |\n| **粗体** | [链接](https://x.com) `code` |');
  const built = buildTable(table, true);
  assert.equal(built.rows[0][0], '粗体');
  assert.equal(built.rows[0][1], '链接 code');
});

/* ================= CSV / TSV ================= */

test('CSV 引号、逗号和换行', () => {
  const rows = parseDelimited('a,b\n"hello, world","line1\nline2"\n"say ""hi""",x');
  assert.deepEqual(rows[0], ['a', 'b']);
  assert.deepEqual(rows[1], ['hello, world', 'line1\nline2']);
  assert.deepEqual(rows[2], ['say "hi"', 'x']);
});

test('自动识别逗号 / 分号 / Tab', () => {
  assert.equal(detectDelimiter('a,b,c\n1,2,3').delimiter, ',');
  assert.equal(detectDelimiter('a;b;c\n1;2;3').delimiter, ';');
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3').delimiter, '\t');
  const [table] = extractCsvTable('\uFEFF序号,单词,释义\n1,apple,苹果\n');
  const built = buildTable(table, true);
  assert.deepEqual(built.headers, ['序号', '单词', '释义']);
  assert.deepEqual(built.rows, [['1', 'apple', '苹果']]);
});

/* ================= JSON ================= */

test('JSON 卡片数组', () => {
  const [table] = extractJsonTable(JSON.stringify([
    { front: 'apple', back: '苹果', content: '/ˈæpl/', i: 1 },
    { front: 'cat', back: '猫' },
  ]));
  const built = buildTable(table, true);
  assert.deepEqual(built.headers, ['front', 'back', 'content', 'i']);
  assert.equal(built.rows.length, 2);
  const mapping = guessMapping(built.headers);
  const cards = rowsToCards(built, mapping);
  assert.deepEqual(cards[0], { front: 'apple', back: '苹果', content: '/ˈæpl/', i: 1 });
  assert.equal(cards[1].i, null);
});

test('JSON 嵌套分组 / zzti 题库格式', () => {
  const value = {
    单元一: { words: [{ q: 'apple', ans: '苹果', con: '' }, { q: 'cat', ans: '猫' }] },
    单元二: [{ q: 'dog', ans: '狗' }],
  };
  const [table] = [jsonToTable(value)];
  const built = buildTable(table, true);
  assert.equal(built.rows.length, 3);
  assert.deepEqual(built.headers, ['q', 'ans', 'con']);
  const cards = rowsToCards(built, guessMapping(built.headers));
  assert.deepEqual(cards.map((c) => c.front), ['apple', 'cat', 'dog']);
});

test('JSON 包装与单个对象', () => {
  const [wrapped] = extractJsonTable('{"data":[{"front":"a","back":"b"}]}');
  assert.equal(buildTable(wrapped, true).rows.length, 1);
  const [single] = extractJsonTable('{"front":"a","back":"b"}');
  assert.equal(buildTable(single, true).rows.length, 1);
});

/* ================= 映射 ================= */

test('自动猜列：序号 / 单词 / 释义 / 音标', () => {
  assert.deepEqual(guessMapping(['序号', '单词', '释义', '音标']), {
    front: 1, back: 2, content: 3, i: 0,
  });
  assert.deepEqual(guessMapping(['#', 'word', 'meaning']), {
    front: 1, back: 2, content: -1, i: 0,
  });
  assert.deepEqual(guessMapping(['单词', '音标', '释义']), {
    front: 0, back: 2, content: 1, i: -1,
  });
  assert.deepEqual(guessMapping(['a', 'b']), {
    front: 0, back: 1, content: -1, i: -1,
  });
  assert.deepEqual(guessMapping(['编号', '词条', '答案', '备注']), {
    front: 1, back: 2, content: 3, i: 0,
  });
});

test('首行不是表头时使用默认列名', () => {
  const table = {
    source: 'csv',
    rawRows: [['apple', '苹果'], ['cat', '猫']],
    defaultHasHeader: false,
  };
  const built = buildTable(table, false);
  assert.deepEqual(built.headers, ['第1列', '第2列']);
  assert.equal(built.rows.length, 2);
  const cards = rowsToCards(built, { front: 0, back: 1, content: -1, i: -1 });
  assert.deepEqual(cards.map((c) => c.front), ['apple', 'cat']);
});

test('空行会被跳过，i 可以是空', () => {
  const table = {
    rows: [
      ['1', 'apple', '苹果'],
      ['', '', ''],
      ['', 'cat', '猫'],
    ],
    headers: ['序号', '正面', '反面'],
  };
  const cards = rowsToCards(table, { front: 1, back: 2, content: -1, i: 0 });
  assert.equal(cards.length, 2);
  assert.equal(cards[0].i, 1);
  assert.equal(cards[1].i, null);
  assert.equal(cards[1].front, 'cat');
});

/* ================= 格式识别 ================= */

test('自动识别 JSON / Markdown / CSV', () => {
  assert.equal(detectFormat(' [{"front":"a"}]'), 'json');
  assert.equal(detectFormat(MD), 'markdown');
  assert.equal(detectFormat('序号,单词,释义\n1,apple,苹果'), 'csv');
  assert.equal(detectFormat('只有一行普通文字'), 'unknown');
  assert.equal(parseImport(MD, 'auto').tables.length, 2);
  assert.equal(parseImport('a,b\n1,2', 'auto').format, 'csv');
});

test('AI 输出的代码围栏 / BOM 也能识别', () => {
  const fenced = '```json\n[{"front":"apple","back":"苹果"}]\n```';
  assert.equal(stripOuterCodeFence(fenced), '[{"front":"apple","back":"苹果"}]');
  assert.equal(detectFormat(fenced), 'json');
  const parsed = parseImport(fenced, 'auto');
  assert.equal(parsed.format, 'json');
  assert.equal(parsed.tables.length, 1);
  const bom = '\uFEFF[{"front":"cat","back":"猫"}]';
  assert.equal(detectFormat(bom), 'json');
  assert.equal(parseImport(bom, 'auto').tables.length, 1);
});

test('CARD_ALIASES 覆盖 zzti 字段', () => {
  assert.ok(CARD_ALIASES.front.includes('q'));
  assert.ok(CARD_ALIASES.back.includes('ans'));
  assert.ok(CARD_ALIASES.content.includes('con'));
  assert.ok(CARD_ALIASES.i.includes('i'));
});
