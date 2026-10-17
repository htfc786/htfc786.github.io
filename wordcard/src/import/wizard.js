/* ============================================================
 * wizard.js —— 导入向导
 * 步骤 1：文件 / 粘贴 → 识别格式
 * 步骤 2：选表（多张时）→ 表头开关 → 列映射 → 预览 → 导入
 * ============================================================ */
import { $, el, clear, debounce, intFmt } from '../core/dom.js';
import { parseImport, detectFormat, FORMAT_LABELS } from './parse/detect.js';
import { buildTable, guessMapping, rowsToCards, FIELDS } from './parse/table.js';

const FIELD_NOTE = {
  front: '必填',
  back: '',
  content: '',
  i: '可选',
};

const SOURCE_LABEL = { markdown: 'Markdown', csv: 'CSV', json: 'JSON' };

export function createImportWizard({ onImport, hasData, canAppend }) {
  const dialog = $('#import-dialog');
  const dropzone = $('#import-dropzone');
  const fileInput = $('#import-file');
  const textarea = $('#import-text');
  const formatSelect = $('#import-format');
  const detectedBadge = $('#import-detected');
  const importError = $('#import-error');
  const mapError = $('#map-error');
  const stepSections = [...dialog.querySelectorAll('[data-step]')];
  const dots = [...dialog.querySelectorAll('[data-dot]')];
  const btnNext = $('#wizard-next');
  const btnBack = $('#wizard-back');
  const btnImport = $('#wizard-import');
  const btnCancel = $('#wizard-cancel');
  const btnClose = $('#wizard-close');
  const tablePicker = $('#table-picker');
  const headerSwitch = $('#header-switch');
  const headerCheckbox = $('#import-header');
  const tableMeta = $('#table-meta');
  const mapFields = $('#map-fields');
  const mapPreview = $('#map-preview');
  const modeRadios = [...dialog.querySelectorAll('input[name="import-mode"]')];

  let step = 1;
  let parsed = null;
  let tableIndex = 0;
  let hasHeader = true;
  let table = null;
  let mapping = null;
  let cards = [];

  const detectLater = debounce(() => showDetected(), 220);

  /* ---------------- 基本显示 ---------------- */

  function setStep(next) {
    step = next;
    stepSections.forEach((section) => {
      section.hidden = Number(section.dataset.step) !== next;
    });
    dots.forEach((dot) => {
      const n = Number(dot.dataset.dot);
      dot.classList.toggle('is-active', n === next);
      dot.classList.toggle('is-done', n < next);
    });
    btnBack.hidden = next === 1;
    btnNext.hidden = next === 2;
    btnImport.hidden = next !== 2;
    dialog.querySelector('.dialog__body').scrollTop = 0;
  }

  function showError(node, message) {
    node.textContent = message || '';
    node.hidden = !message;
  }

  function clearErrors() {
    showError(importError, '');
    showError(mapError, '');
  }

  function showDetected() {
    const text = textarea.value.trim();
    if (!text) { detectedBadge.hidden = true; return; }
    const format = formatSelect.value === 'auto' ? detectFormat(text) : formatSelect.value;
    detectedBadge.hidden = false;
    detectedBadge.textContent = format === 'unknown'
      ? '未识别格式'
      : '识别为 ' + FORMAT_LABELS[format];
    detectedBadge.classList.toggle('badge--danger', format === 'unknown');
    detectedBadge.classList.toggle('badge--accent', format !== 'unknown');
  }

  function tableInfo(entry) {
    const built = buildTable(entry, true);
    const cols = Math.max(built.headers.length, ...built.rows.map((r) => r.length), 0);
    const dataRows = entry.fixedHeaders
      ? entry.rawRows.length
      : Math.max(0, entry.rawRows.length - 1);
    return { built, cols, dataRows };
  }

  /* ---------------- 文件读取 ---------------- */

  async function readFile(file) {
    if (!file) return;
    clearErrors();
    try {
      const text = await file.text();
      textarea.value = text;
      showDetected();
      const ext = file.name.split('.').pop().toLowerCase();
      if (['json'].includes(ext)) formatSelect.value = 'json';
      else if (['md', 'markdown'].includes(ext)) formatSelect.value = 'markdown';
      else if (['csv', 'tsv'].includes(ext)) formatSelect.value = 'csv';
      else formatSelect.value = 'auto';
      showDetected();
    } catch (err) {
      showError(importError, '读取文件失败：' + (err.message || '未知错误'));
    }
  }

  dropzone.addEventListener('click', (event) => {
    if (event.target === fileInput) return;   // 程序化 click 会冒泡回来，避免递归
    fileInput.click();
  });
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-over');
    const file = event.dataTransfer?.files?.[0];
    if (file) readFile(file);
  });
  fileInput.addEventListener('change', () => readFile(fileInput.files?.[0]));

  textarea.addEventListener('input', () => {
    clearErrors();
    detectLater();
  });
  textarea.addEventListener('paste', () => detectLater());
  formatSelect.addEventListener('change', showDetected);

  /* ---------------- 第 2 步：选表与映射 ---------------- */

  function selectedTable() {
    return parsed?.tables?.[tableIndex] || null;
  }

  function renderTablePicker() {
    clear(tablePicker);
    if (!parsed) return;
    const tables = parsed.tables;
    tablePicker.appendChild(el('p', {
      class: 'table-options__title',
      text: tables.length > 1
        ? `识别到 ${tables.length} 张表，选择要用的一张`
        : `识别到 1 张表`,
    }));

    const box = el('div', { class: 'table-options' });
    tables.forEach((entry, index) => {
      const info = tableInfo(entry);
      const sample = (entry.fixedHeaders ? entry.rawRows[0] : entry.rawRows[1]) || [];
      const label = el('label', { class: 'table-option' + (index === tableIndex ? ' is-active' : '') });
      const radio = el('input', {
        type: 'radio',
        name: 'table-choice',
        value: String(index),
        checked: index === tableIndex,
      });
      radio.addEventListener('change', () => {
        tableIndex = index;
        hasHeader = entry.fixedHeaders ? true : (entry.defaultHasHeader !== false);
        headerCheckbox.checked = hasHeader;
        renderTablePicker();
        applyTable();
      });
      const main = el('span', { class: 'table-option__main' }, [
        el('span', { class: 'table-option__name', text: `表格 ${index + 1} · ${SOURCE_LABEL[entry.source] || ''}` }),
        el('span', {
          class: 'table-option__meta',
          text: `${intFmt(info.dataRows)} 行 × ${info.cols} 列` +
            (entry.line ? ` · 第 ${entry.line} 行起` : ''),
        }),
        sample.length
          ? el('span', { class: 'table-option__sample', text: sample.slice(0, 4).join('  ·  ') })
          : null,
      ]);
      label.append(radio, main);
      box.appendChild(label);
    });
    tablePicker.appendChild(box);
  }

  function renderMapFields() {
    clear(mapFields);
    for (const field of FIELDS) {
      const row = el('div', { class: 'map-field' });
      row.appendChild(el('label', {
        text: field.label,
        for: `map-${field.key}`,
      }));
      const select = el('select', { class: 'select', id: `map-${field.key}` });
      select.appendChild(el('option', { value: '-1', text: '（不导入）' }));
      table.headers.forEach((header, index) => {
        select.appendChild(el('option', {
          value: String(index),
          text: `第${index + 1}列 · ${header}`,
        }));
      });
      select.value = String(mapping[field.key]);
      select.addEventListener('change', () => {
        mapping[field.key] = Number(select.value);
        updatePreview();
      });
      row.appendChild(select);
      if (FIELD_NOTE[field.key]) {
        row.dataset.note = FIELD_NOTE[field.key];
      }
      mapFields.appendChild(row);
    }
  }

  function updatePreview() {
    clear(mapPreview);
    cards = rowsToCards(table, mapping);

    const head = el('div', { class: 'map-preview__head' }, [
      el('span', { text: '字段预览' }),
      el('span', { text: `共 ${intFmt(cards.length)} 张` }),
    ]);
    mapPreview.appendChild(head);

    if (!cards.length) {
      mapPreview.appendChild(el('div', { class: 'empty', text: '没有可导入的行，检查一下列的映射。' }));
      btnImport.disabled = true;
      btnImport.textContent = '导入 0 张';
      showError(mapError, mapping.front < 0 ? '请选择“正面”对应的列。' : '');
      return;
    }
    if (mapping.front < 0) {
      showError(mapError, '请选择“正面”对应的列。');
      btnImport.disabled = true;
      btnImport.textContent = `导入 ${cards.length} 张`;
      return;
    }
    showError(mapError, '');

    const previewTable = el('table', { class: 'preview-table' });
    const thead = el('thead');
    thead.appendChild(el('tr', {}, [
      el('th', { class: 'preview-i', text: '序号' }),
      el('th', { text: '正面' }),
      el('th', { text: '反面' }),
      el('th', { text: '附加信息' }),
    ]));
    const tbody = el('tbody');
    cards.slice(0, 5).forEach((card) => {
      tbody.appendChild(el('tr', {}, [
        el('td', { class: 'preview-i', text: card.i == null ? '—' : String(card.i) }),
        el('td', { text: card.front || '—' }),
        el('td', { text: card.back || '—' }),
        el('td', { text: card.content || '—' }),
      ]));
    });
    previewTable.append(thead, tbody);
    mapPreview.appendChild(previewTable);

    if (cards.length > 5) {
      mapPreview.appendChild(el('p', {
        class: 'hint',
        style: { padding: '6px 10px 8px' },
        text: `仅预览前 5 张，实际会导入 ${intFmt(cards.length)} 张。`,
      }));
    }

    btnImport.disabled = false;
    btnImport.textContent = `导入 ${intFmt(cards.length)} 张`;
  }

  function applyTable() {
    const entry = selectedTable();
    if (!entry) return;
    clearErrors();
    const isFixed = !!entry.fixedHeaders;
    headerSwitch.classList.toggle('hidden', isFixed);
    hasHeader = isFixed ? true : (hasHeader !== false);
    headerCheckbox.checked = hasHeader;

    table = buildTable(entry, hasHeader);
    tableMeta.textContent = isFixed
      ? `${intFmt(table.rows.length)} 行 × ${table.headers.length} 列`
      : `${intFmt(table.rows.length)} 行 × ${table.headers.length} 列` +
        (hasHeader ? ' · 首行为表头' : ' · 无表头');
    mapping = guessMapping(table.headers);
    headerCheckbox.disabled = isFixed;

    const appendRadio = modeRadios.find((r) => r.value === 'append');
    const replaceRadio = modeRadios.find((r) => r.value === 'replace');
    if (appendRadio) {
      appendRadio.disabled = !hasData() || (canAppend ? !canAppend() : false);
      appendRadio.parentElement.title = appendRadio.disabled
        ? (hasData() ? '预设词表不支持追加，请用“替换当前数据”' : '还没有可追加的数据')
        : '';
      if (appendRadio.disabled) replaceRadio.checked = true;
    }

    renderMapFields();
    updatePreview();
  }

  headerCheckbox.addEventListener('change', () => {
    hasHeader = headerCheckbox.checked;
    applyTable();
  });

  /* ---------------- 步骤切换 ---------------- */

  function parse() {
    clearErrors();
    try {
      const result = parseImport(textarea.value, formatSelect.value);
      parsed = result;
      tableIndex = 0;
      const first = selectedTable();
      hasHeader = first?.fixedHeaders ? true : (first?.defaultHasHeader !== false);
      headerCheckbox.checked = hasHeader;
      detectedBadge.hidden = false;
      detectedBadge.textContent = '识别为 ' + FORMAT_LABELS[result.format];
      detectedBadge.classList.remove('badge--danger');
      detectedBadge.classList.add('badge--accent');
      renderTablePicker();
      applyTable();
      setStep(2);
    } catch (err) {
      showError(importError, err.message || '解析失败');
      setStep(1);
    }
  }

  function open() {
    clearErrors();
    formatSelect.value = 'auto';
    fileInput.value = '';
    setStep(1);
    parsed = null;
    table = null;
    mapping = null;
    cards = [];
    tableIndex = 0;
    tablePicker.replaceChildren();
    mapFields.replaceChildren();
    mapPreview.replaceChildren();
    btnImport.disabled = true;
    btnImport.textContent = '导入';
    showDetected();
    if (!dialog.open) dialog.showModal();
    // 手机上不要一打开就弹键盘，把屏幕顶掉
    if (!window.matchMedia('(max-width: 640px)').matches) {
      setTimeout(() => textarea.focus(), 30);
    }
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function doImport() {
    if (!cards.length || mapping.front < 0) return;
    const mode = modeRadios.find((r) => r.checked)?.value || 'replace';
    onImport(cards.map((c) => ({ ...c })), { mode });
    close();
    textarea.value = '';
    fileInput.value = '';
    parsed = null;
    cards = [];
    detectedBadge.hidden = true;
  }

  btnNext.addEventListener('click', parse);
  btnBack.addEventListener('click', () => setStep(1));
  btnImport.addEventListener('click', doImport);
  btnCancel.addEventListener('click', close);
  btnClose.addEventListener('click', close);

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('close', () => {
    // 下次打开重新从第一步开始，但保留已粘贴的文本方便修改
    setStep(1);
  });

  return { open, close };
}
