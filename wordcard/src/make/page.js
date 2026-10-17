/* ============================================================
 * page.js —— 制作页控制器
 * 负责：数据交接、配置保存、预设、对位测试、可拖拽中线。
 * ============================================================ */
import { $, debounce } from '../core/dom.js';
import {
  defaultConfig, applyPreset, cloneConfig,
} from '../core/config.js';
import { normalizeCards, cardNumber } from '../core/cards.js';
import {
  loadConfig, saveConfig, loadHandoff, loadWork,
} from '../core/storage.js';
import { createSettings } from './settings.js';
import { createCardPreview } from './preview.js';
import { createSplitter } from './splitter.js';

const state = {
  config: loadConfig(),
  cards: [],
  meta: {},
  testMode: false,
  testBackup: null,
};

const layout = $('#make-layout');
const settingsPane = $('#settings-pane');
const splitter = $('#splitter');
const dataBadge = $('#data-badge');
const dataSummary = $('#data-summary');
const printButtons = [$('#print-main'), $('#print-top'), $('#print-preview')].filter(Boolean);

let settings = null;
let preview = null;

/* ================= 数据来源 ================= */

function fallbackCardsFromWork() {
  const work = loadWork();
  if (!work?.items?.length) return null;
  const range = work.range;
  const selected = work.items
    .map((item, index) => ({ item, ordinal: index + 1 }))
    .filter(({ item, ordinal }) => {
      if (!range) return true;
      const n = cardNumber(item, ordinal);
      return n >= range.min && n <= range.max;
    })
    .map(({ item }) => item);
  if (!selected.length) return null;
  return {
    cards: normalizeCards(selected),
    meta: {
      name: work.source?.name || '导入数据',
      range: range && (work.source?.type === 'dataset') ? range : null,
      count: selected.length,
    },
  };
}

function loadCards() {
  const handoff = loadHandoff();
  if (handoff?.cards?.length) {
    state.cards = handoff.cards;
    state.meta = handoff.meta || {};
    return;
  }
  const fallback = fallbackCardsFromWork();
  if (fallback) {
    state.cards = fallback.cards;
    state.meta = fallback.meta;
    return;
  }
  state.cards = [];
  state.meta = {};
}

/* ================= 顶部信息 / 打印状态 ================= */

function updateDataSummary() {
  const count = state.cards.length;
  dataBadge.textContent = state.testMode ? '对位测试' : `${count} 张`;
  dataBadge.classList.toggle('badge--warn', state.testMode);

  if (state.testMode) {
    dataSummary.textContent = '对位测试 · 2 × 2 · 4 张数字卡';
    return;
  }
  if (!count) {
    dataSummary.textContent = '还没有数据，请先到导入页选择词表';
    return;
  }
  const name = state.meta?.name || '当前数据';
  const range = state.meta?.range ? ` · ${state.meta.range.min}–${state.meta.range.max}` : '';
  dataSummary.textContent = `${name}${range} · ${count} 张`;
}

function setPrintDisabled(disabled) {
  for (const button of printButtons) button.disabled = disabled;
}

/* ================= 配置变更 ================= */

const saveConfigLater = debounce(() => saveConfig(state.config), 350);
const softUpdateLater = debounce((path) => preview.softUpdate(path), 140);

/** 结构变化必须重排 DOM；字号、颜色、安全区等只需更新 CSS 变量。 */
function pathNeedsFullRender(path) {
  if (!path) return true;
  if (path === 'note.show' || path === 'note.position') return true;
  if (path.startsWith('front.') || path.startsWith('back.') || path.startsWith('note.')) return false;
  if (path.startsWith('card.')) return false;
  return ![
    'page.padding',
    'grid.gap',
    'extras.safeGuide',
    'extras.autoFit',
    'extras.autoFitMin',
    'duplex.mirrorLayout',
  ].includes(path);
}

function onConfigChange(path) {
  if (!state.testMode) saveConfigLater();
  if (path && !pathNeedsFullRender(path)) softUpdateLater(path);
  else preview.renderSoon();
}

function applyPresetById(id) {
  if (state.testMode) {
    alert('对位测试中，先退出测试再切换预设。');
    return;
  }
  applyPreset(state.config, id);
  saveConfig(state.config);
  settings.sync();
  preview.render();
}

function resetSettings() {
  if (state.testMode) {
    alert('对位测试中，先退出测试再恢复默认。');
    return;
  }
  if (!confirm('恢复默认设置？安全区会回到 左 15mm，其余为 0。')) return;
  state.config = defaultConfig();
  saveConfig(state.config);
  settings.sync();
  preview.render();
}

/* ================= 对位测试 ================= */

function enterAlignTest() {
  if (state.testMode) return;
  // 先把测试前待保存的配置落盘，测试期间不再保存配置
  saveConfigLater.cancel();
  saveConfig(state.config);
  state.testBackup = {
    config: cloneConfig(state.config),
    cards: state.cards,
    meta: state.meta,
  };
  const config = cloneConfig(state.config);
  config.grid.long = 2;
  config.grid.short = 2;
  config.page.padding = 0;
  config.grid.gap = 0;
  config.card.safe = { top: 0, right: 0, bottom: 0, left: 0 };
  config.card.border = 'solid';
  config.card.borderColor = '#333333';
  config.note.show = false;
  config.extras.cardNum = true;
  config.extras.pageNum = true;
  config.extras.safeGuide = false;
  config.extras.autoFit = false;
  config.duplex.mirrorLayout = true;

  state.config = config;
  state.cards = [1, 2, 3, 4].map((n) => ({
    front: String(n),
    back: String(n),
    content: '',
    i: n,
  }));
  state.meta = { name: '对位测试', range: null, count: 4 };
  state.testMode = true;

  settings.sync();
  preview.render();
  updateDataSummary();
  document.querySelector('.settings-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function exitAlignTest() {
  if (!state.testMode || !state.testBackup) return;
  state.config = state.testBackup.config;
  state.cards = state.testBackup.cards;
  state.meta = state.testBackup.meta;
  state.testBackup = null;
  state.testMode = false;

  settings.sync();
  preview.render();
  updateDataSummary();
  saveConfig(state.config);
}

function toggleAlignTest() {
  if (state.testMode) exitAlignTest();
  else enterAlignTest();
}

/* ================= 初始化 ================= */

function init() {
  loadCards();

  settings = createSettings({
    getConfig: () => state.config,
    onChange: onConfigChange,
    onPreset: applyPresetById,
    onAlignTest: toggleAlignTest,
    isAlignTesting: () => state.testMode,
  });

  preview = createCardPreview({
    getCards: () => state.cards,
    getConfig: () => state.config,
    getMeta: () => state.meta,
    onDisabled: setPrintDisabled,
  });

  $('#reset-settings').addEventListener('click', resetSettings);
  $('#align-exit').addEventListener('click', exitAlignTest);

  const splitter = $('#splitter');
  if (splitter) {
    createSplitter({
      layout,
      settingsPane,
      handle: splitter,
      onChange: () => preview.refit(),
    });
  }
  updateDataSummary();
  settings.sync();
  preview.render();

  window.addEventListener('pagehide', () => saveConfigLater.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveConfigLater.flush();
  });
}

init();
