/* ============================================================
 * page.js —— 数据导入页控制器
 * 负责：词表目录、数据集加载、序号范围、编辑/删除/添加、
 *      自动保存、导出、交接给制作页。
 * ============================================================ */
import {
  $, $$, el, debounce, intFmt, downloadText, uid,
} from '../core/dom.js';
import {
  cardsToJSON, normalizeCards, cardNumber,
} from '../core/cards.js';
import {
  loadWork, saveWork, saveHandoff, clearHandoff,
} from '../core/storage.js';
import { createDataPreview } from './preview.js';
import { createImportWizard } from './wizard.js';

const state = {
  catalog: [],
  source: null,      // { type:'dataset'|'custom', id, name }
  items: [],
  range: null,       // { min, max }；null = 全部
  touched: false,
  loading: false,
};

const sourceSelect = $('#source-select');
const sourceState = $('#source-state');
const dirtyState = $('#dirty-state');
const catalogError = $('#catalog-error');
const topCount = $('#top-count');
const statTotal = $('#stat-total');
const statVisible = $('#stat-visible');
const statSource = $('#stat-source');
const rangeBox = $('#range-box');
const rangeMin = $('#range-min');
const rangeMax = $('#range-max');
const rangeApply = $('#range-apply');
const rangeTotal = $('#range-total');
const rangeHint = $('#range-hint');
const saveStateEl = $('#save-state');
const addButton = $('#add-row');
const addHint = $('#add-hint');
const exportButton = $('#export-json');
const clearButton = $('#clear-data');
const previewClose = $('#preview-close');

let preview = null;
let wizard = null;

/* ================= 小工具 ================= */

function boundsOf(items) {
  if (!items.length) return { min: 0, max: 0 };
  let min = Infinity;
  let max = -Infinity;
  items.forEach((item, index) => {
    const n = cardNumber(item, index + 1);
    if (n < min) min = n;
    if (n > max) max = n;
  });
  return { min, max };
}

function visibleEntries() {
  const range = state.range;
  return state.items
    .map((item, index) => ({ item, ordinal: index + 1 }))
    .filter(({ item, ordinal }) => {
      if (!range) return true;
      const n = cardNumber(item, ordinal);
      return n >= range.min && n <= range.max;
    });
}

function sourceValue() {
  if (!state.source) return '';
  return state.source.type === 'custom' ? '__custom__' : (state.source.id || '');
}

function sourceName() {
  if (state.source?.name) return state.source.name;
  return state.items.length ? '自定义数据' : '未选择数据';
}

function rangeIsFull() {
  if (!state.range || state.source?.type !== 'dataset') return true;
  const bounds = boundsOf(state.items);
  return state.range.min === bounds.min && state.range.max === bounds.max;
}

function rangeLabel() {
  if (!state.range || state.source?.type !== 'dataset' || rangeIsFull()) return '';
  return `${state.range.min}–${state.range.max}`;
}

function displaySource() {
  if (!state.source) return state.items.length ? '自定义数据' : '未选择数据';
  const range = rangeLabel();
  return state.source.name + (range ? ` · ${range}` : '');
}

function setSaveState(text, saving = false) {
  saveStateEl.textContent = text;
  saveStateEl.classList.toggle('is-saving', saving);
}

function setAnchorDisabled(anchor, disabled) {
  anchor.classList.toggle('is-disabled', disabled);
  anchor.setAttribute('aria-disabled', String(disabled));
  if (disabled) anchor.setAttribute('tabindex', '-1');
  else anchor.removeAttribute('tabindex');
}

function showCatalogError(message) {
  catalogError.textContent = message || '';
  catalogError.hidden = !message;
}

/* ================= 自动保存 ================= */

const saveWorkLater = debounce(() => {
  saveWork({ source: state.source, items: state.items, range: state.range });
  // 数据一旦变化，上一次交接给制作页的快照就作废；
  // 制作页会优先读 handoff，没有时回退到 work。
  clearHandoff();
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  setSaveState(`已自动保存 · ${time}`);
}, 500);

function scheduleSave() {
  clearHandoff();
  setSaveState('正在保存…', true);
  saveWorkLater();
}

function saveNow() {
  saveWorkLater.cancel();
  saveWork({ source: state.source, items: state.items, range: state.range });
  clearHandoff();
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  setSaveState(`已自动保存 · ${time}`);
}

/* ================= UI 状态 ================= */

function updateDirty() {
  dirtyState.textContent = state.touched ? '已修改' : '未修改';
  dirtyState.className = 'badge' + (state.touched ? ' badge--warn' : '');
}

function updateSelectValue() {
  const value = sourceValue();
  const exists = [...sourceSelect.options].some((option) => option.value === value);
  sourceSelect.value = exists ? value : '';
}

function renderSourceOptions() {
  const current = sourceValue();
  sourceSelect.replaceChildren();
  sourceSelect.appendChild(el('option', { value: '', text: '选择数据集…' }));

  for (const dataset of state.catalog) {
    sourceSelect.appendChild(el('option', {
      value: dataset.id,
      text: dataset.name,
    }));
  }

  // 恢复的工作稿可能来自一个已经从目录里删掉的数据集
  if (state.source?.type === 'dataset' && current &&
      !state.catalog.some((d) => d.id === state.source.id)) {
    sourceSelect.appendChild(el('option', { value: current, text: state.source.name }));
  }

  sourceSelect.appendChild(el('option', { value: '__custom__', text: '导入数据 / 自定义…' }));
  sourceSelect.disabled = state.loading;
  updateSelectValue();
}

function updateRangeUI(visibleCount) {
  const isDataset = state.source?.type === 'dataset' && state.items.length > 0;
  rangeBox.hidden = !isDataset;
  if (!isDataset) return;

  const bounds = boundsOf(state.items);
  if (!state.range) state.range = { ...bounds };
  state.range.min = Math.max(bounds.min, Math.min(bounds.max, state.range.min));
  state.range.max = Math.max(bounds.min, Math.min(bounds.max, state.range.max));

  rangeMin.min = String(bounds.min);
  rangeMin.max = String(bounds.max);
  rangeMax.min = String(bounds.min);
  rangeMax.max = String(bounds.max);
  rangeMin.value = String(state.range.min);
  rangeMax.value = String(state.range.max);
  rangeTotal.textContent = `共 ${intFmt(state.items.length)} 条 · 序号 ${bounds.min}–${bounds.max}`;
  rangeHint.textContent = `当前范围内 ${intFmt(visibleCount)} 张卡片`;
  rangeHint.classList.remove('danger');
  rangeApply.disabled = false;
}

function updateStats(visibleCount) {
  topCount.textContent = `${intFmt(visibleCount)} 张`;
  statTotal.textContent = intFmt(state.items.length);
  statVisible.textContent = intFmt(visibleCount);
  statSource.textContent = displaySource();
  statSource.title = displaySource();

  const sourceType = state.source?.type || (state.items.length ? 'custom' : null);
  sourceState.textContent = state.loading
    ? '载入中…'
    : sourceType === 'dataset'
      ? '预设词表'
      : sourceType === 'custom'
        ? '自定义数据'
        : '未选择';
  sourceState.className = 'badge' + (sourceType ? ' badge--accent' : '');

  const empty = !state.items.length;
  const addDisabled = state.source?.type === 'dataset';
  addButton.disabled = addDisabled;
  addButton.title = addDisabled ? '预设词表按序号范围读取；需要增删请先导入为自定义数据' : '';
  addHint.hidden = !addDisabled;
  exportButton.disabled = empty;
  clearButton.disabled = empty;
  rangeApply.disabled = empty || state.source?.type !== 'dataset';

  for (const anchor of $$('a[href="make.html"], #go-make')) {
    setAnchorDisabled(anchor, visibleCount === 0);
  }
  updateDirty();
}

function refreshAll({ focusId = null, resetSearch = false } = {}) {
  const entries = visibleEntries();
  preview.setEntries(entries, {
    focusId,
    resetSearch,
    sourceEmpty: state.items.length === 0,
  });
  updateStats(entries.length);
  updateRangeUI(entries.length);
  updateSelectValue();
}

/* ================= 数据加载 ================= */

async function loadCatalog() {
  try {
    const res = await fetch('data/catalog.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.catalog = Array.isArray(data.datasets) ? data.datasets : [];
    showCatalogError('');
  } catch (err) {
    state.catalog = [];
    showCatalogError(
      '词表目录加载失败：' + (err.message || '未知错误') +
      '。请确认 data/catalog.json 存在，并通过 HTTP（node server.mjs）打开页面。'
    );
  }
  renderSourceOptions();
}

function extractDatasetList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    for (const key of ['cards', 'data', 'list', 'items', 'words']) {
      if (Array.isArray(raw[key])) return raw[key];
    }
  }
  return null;
}

async function loadDataset(id, { initial = false } = {}) {
  const meta = state.catalog.find((item) => item.id === id);
  if (!meta) return;

  if (!initial && state.items.length &&
      !confirm('切换数据来源会替换当前数据，确定继续？')) {
    updateSelectValue();
    return;
  }

  state.loading = true;
  sourceSelect.disabled = true;
  sourceState.textContent = '载入中…';
  showCatalogError('');

  try {
    const res = await fetch('data/' + meta.file, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const list = extractDatasetList(raw);
    if (!list) throw new Error('JSON 顶层不是数组');
    const cards = normalizeCards(list);
    if (!cards.length) throw new Error('词表里没有有效条目（需要 front/back/content 或 q/ans/con 字段）');

    state.items = cards.map((card) => ({ ...card, _id: uid('c') }));
    state.source = { type: 'dataset', id: meta.id, name: meta.name || meta.id, file: meta.file };
    state.range = boundsOf(state.items);
    state.touched = false;
    refreshAll({ resetSearch: true });
    saveNow();
  } catch (err) {
    showCatalogError(`词表「${meta.name}」加载失败：${err.message}`);
  } finally {
    state.loading = false;
    sourceSelect.disabled = false;
    if (!state.items.length) refreshAll();
    else updateStats(visibleEntries().length);
    updateSelectValue();
  }
}

/* ================= 编辑操作 ================= */

function handleEdit(item, field, text) {
  if (!item || !(field in item)) return;
  if (item[field] === text) return;
  item[field] = text;
  if (!state.touched) {
    state.touched = true;
    updateDirty();
  }
  scheduleSave();
}

function handleDelete(item) {
  const index = state.items.findIndex((entry) => entry._id === item._id);
  if (index < 0) return;
  const n = cardNumber(item, index + 1);
  if (!confirm(`删除序号 ${n} 的这张卡片？`)) return;
  state.items.splice(index, 1);
  state.touched = true;
  refreshAll();
  saveNow();
}

function handleAdd() {
  if (state.source?.type === 'dataset') return;
  const bounds = boundsOf(state.items);
  const hasSequence = state.items.some((item) => Number.isFinite(item.i));
  const i = hasSequence ? bounds.max + 1 : null;

  const item = { _id: uid('c'), front: '', back: '', content: '', i };
  state.items.push(item);
  if (!state.source) {
    state.source = { type: 'custom', name: '自定义数据' };
    renderSourceOptions();
  }
  if (state.range && i !== null) {
    state.range.min = Math.min(state.range.min, i);
    state.range.max = Math.max(state.range.max, i);
  }
  state.touched = true;
  refreshAll({ focusId: item._id });
  saveNow();
}

function handleClear() {
  if (!state.items.length) return;
  if (!confirm('清空当前数据？这一步不能撤销。')) return;
  state.items = [];
  state.source = null;
  state.range = null;
  state.touched = false;
  renderSourceOptions();
  refreshAll({ resetSearch: true });
  saveNow();
}

function handleImport(imported, { mode }) {
  const incoming = imported.map((card) => ({ ...card, _id: uid('c') }));

  if (mode === 'append' && state.items.length) {
    const used = new Set(state.items.filter((item) => Number.isFinite(item.i)).map((item) => item.i));
    const existingHasI = state.items.some((item) => Number.isFinite(item.i));
    let next = used.size ? Math.max(...used) + 1 : 1;
    if (existingHasI) {
      for (const card of incoming) {
        if (!Number.isFinite(card.i) || used.has(card.i)) {
          card.i = next++;
        } else {
          used.add(card.i);
        }
      }
    }
    state.items.push(...incoming);
    if (state.range) {
      incoming.forEach((card, index) => {
        const n = cardNumber(card, state.items.length - incoming.length + index + 1);
        state.range.min = Math.min(state.range.min, n);
        state.range.max = Math.max(state.range.max, n);
      });
    }
    if (!state.source) state.source = { type: 'custom', name: '自定义数据' };
    state.touched = true;
    renderSourceOptions();
    refreshAll({ focusId: incoming[0]?._id });
  } else {
    state.items = incoming;
    state.source = { type: 'custom', name: '自定义导入' };
    state.range = null;
    state.touched = true;
    renderSourceOptions();
    refreshAll({ resetSearch: true });
  }
  saveNow();
}

/* ================= 范围 / 导出 / 交接 ================= */

function applyRange() {
  if (!state.items.length) return;
  const bounds = boundsOf(state.items);
  let min = parseInt(rangeMin.value, 10);
  let max = parseInt(rangeMax.value, 10);
  if (!Number.isFinite(min)) min = bounds.min;
  if (!Number.isFinite(max)) max = bounds.max;

  min = Math.max(bounds.min, Math.min(bounds.max, min));
  max = Math.max(bounds.min, Math.min(bounds.max, max));

  if (min > max) {
    rangeHint.textContent = '起始序号不能大于结束序号';
    rangeHint.classList.add('danger');
    return;
  }

  const count = state.items
    .map((item, index) => ({ item, ordinal: index + 1 }))
    .filter(({ item, ordinal }) => {
      const n = cardNumber(item, ordinal);
      return n >= min && n <= max;
    }).length;
  if (!count) {
    rangeHint.textContent = '这个范围内没有卡片';
    rangeHint.classList.add('danger');
    return;
  }

  state.range = { min, max };
  rangeHint.textContent = `当前范围内 ${intFmt(count)} 张卡片`;
  rangeHint.classList.remove('danger');
  refreshAll();
  saveNow();
}

function exportJson() {
  const entries = visibleEntries();
  if (!entries.length) return;
  const name = (state.source?.name || 'wordcard')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const range = rangeLabel();
  const filename = `wordcard-${name || 'data'}${range ? '-' + range : ''}.json`;
  downloadText(filename, cardsToJSON(entries.map(({ item }) => item)));
}

function goMake(event) {
  if (event) event.preventDefault();
  const entries = visibleEntries();
  if (!entries.length) {
    alert('还没有数据。先从左侧选择词表或导入数据。');
    return;
  }
  saveNow();
  saveHandoff(entries.map(({ item }) => item), {
    name: sourceName(),
    range: state.range && state.source?.type === 'dataset' && !rangeIsFull()
      ? { ...state.range }
      : null,
  });
  window.location.href = 'make.html';
}

/* ================= 移动端预览 ================= */

function openMobilePreview() {
  document.body.classList.add('preview-open');
  preview.refresh();
}

function closeMobilePreview() {
  document.body.classList.remove('preview-open');
}

function syncMobileMode() {
  if (window.matchMedia('(min-width: 981px)').matches) closeMobilePreview();
}

/* ================= 初始化 ================= */

function bindEvents() {
  sourceSelect.addEventListener('change', () => {
    const value = sourceSelect.value;
    if (value === '__custom__') {
      updateSelectValue();
      wizard.open();
      return;
    }
    if (!value) {
      updateSelectValue();
      return;
    }
    loadDataset(value);
  });

  $('#open-import').addEventListener('click', () => wizard.open());
  rangeApply.addEventListener('click', applyRange);
  [rangeMin, rangeMax].forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') applyRange();
    });
  });

  addButton.addEventListener('click', handleAdd);
  exportButton.addEventListener('click', exportJson);
  clearButton.addEventListener('click', handleClear);

  for (const anchor of $$('a[href="make.html"]')) {
    anchor.addEventListener('click', goMake);
  }

  for (const trigger of [$('#open-preview-inline')].filter(Boolean)) {
    trigger.addEventListener('click', openMobilePreview);
  }
  previewClose.addEventListener('click', closeMobilePreview);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('preview-open')) {
      closeMobilePreview();
    }
  });
  window.addEventListener('resize', syncMobileMode);
  window.addEventListener('pagehide', () => saveWorkLater.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveWorkLater.flush();
  });
}

async function init() {
  preview = createDataPreview({
    onEdit: handleEdit,
    onDelete: handleDelete,
  });
  wizard = createImportWizard({
    onImport: handleImport,
    hasData: () => state.items.length > 0,
    canAppend: () => state.source?.type !== 'dataset',
  });

  bindEvents();
  await loadCatalog();

  const work = loadWork();
  if (work) {
    state.source = work.source;
    state.items = work.items;
    state.range = work.range;
    state.touched = false;
    if (state.source?.type === 'dataset' && !state.range && state.items.length) {
      state.range = boundsOf(state.items);
    }
    renderSourceOptions();
    refreshAll();
    setSaveState('已恢复上次的编辑');
  } else if (state.catalog[0]) {
    await loadDataset(state.catalog[0].id, { initial: true });
  } else {
    refreshAll();
    setSaveState('数据会自动保存在本机');
  }
}

init().catch((err) => {
  console.error(err);
  setSaveState('初始化失败：' + (err.message || err));
});
