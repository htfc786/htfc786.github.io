/* ============================================================
 * preview.js —— 导入页右侧的可编辑数据表
 * 分页 + 搜索 + 单元格直接编辑；数据本身由 page.js 持有。
 * ============================================================ */
import {
  $, el, clear, debounce, plainPaste, intFmt,
} from '../core/dom.js';

const FIELD_META = {
  front: { label: '正面', ph: '单词' },
  back: { label: '反面', ph: '释义' },
  content: { label: '附加信息', ph: '音标 / 词性 / 备注' },
};

export function createDataPreview({ onEdit, onDelete }) {
  const tbody = $('#data-body');
  const emptyEl = $('#preview-empty');
  const rowRangeEl = $('#row-range');
  const pageLabelEl = $('#page-label');
  const pagePrev = $('#page-prev');
  const pageNext = $('#page-next');
  const pageSizeEl = $('#page-size');
  const searchEl = $('#search-input');

  let entries = [];
  let filtered = [];
  let page = 1;
  let pageSize = Number(pageSizeEl.value) || 50;
  let keyword = '';
  let sourceEmpty = true;

  const applySearch = debounce(() => {
    page = 1;
    render();
  }, 180);

  function computeFiltered() {
    const q = keyword.trim().toLowerCase();
    filtered = q
      ? entries.filter(({ item }) =>
          `${item.front}\n${item.back}\n${item.content}`.toLowerCase().includes(q))
      : entries;
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > pages) page = pages;
    if (page < 1) page = 1;
    return { pages, start: (page - 1) * pageSize };
  }

  function updateEmpty() {
    const show = filtered.length === 0;
    emptyEl.hidden = !show;
    if (!show) return;
    const strong = emptyEl.querySelector('strong');
    const span = emptyEl.querySelector('span');
    if (!entries.length) {
      if (keyword.trim()) {
        if (strong) strong.textContent = '没有匹配结果';
        if (span) span.textContent = '换个关键词试试。';
      } else if (sourceEmpty) {
        if (strong) strong.textContent = '还没有数据';
        if (span) span.textContent = '从左侧选择预设词表，或导入自己的数据。';
      } else {
        if (strong) strong.textContent = '当前范围没有数据';
        if (span) span.textContent = '调整左侧的序号范围，或换一个数据来源。';
      }
    } else {
      if (strong) strong.textContent = '没有匹配结果';
      if (span) span.textContent = '换个关键词试试。';
    }
  }

  function editorFor(item, ordinal, field) {
    const meta = FIELD_META[field];
    const node = el('div', {
      class: 'cell-edit',
      contenteditable: 'true',
      spellcheck: 'false',
      role: 'textbox',
      'aria-label': `第 ${ordinal} 张卡片的${meta.label}`,
      dataset: { field, ph: meta.ph },
    });
    node.textContent = item[field] || '';

    const read = (trim) => {
      let text = String(node.innerText || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n?/g, '\n');
      if (trim) text = text.replace(/\n{3,}/g, '\n\n').trim();
      return text;
    };
    const commit = (trim = false) => {
      const text = read(trim);
      onEdit(item, field, text);
    };

    node.addEventListener('input', (event) => {
      if (event.isComposing) return;
      commit(false);
    });
    node.addEventListener('compositionend', () => commit(false));
    node.addEventListener('blur', () => {
      const text = read(true);
      if (node.textContent !== text) node.textContent = text;
      commit(true);
    });
    node.addEventListener('paste', (event) => {
      plainPaste(event);
      commit(false);
    });
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); node.blur(); }
    });
    return node;
  }

  function rowFor(entry) {
    const { item, ordinal } = entry;
    const tr = el('tr', { dataset: { id: item._id } });

    const seq = el('td', { class: 'cell-seq' });
    const number = Number.isFinite(item.i) ? item.i : ordinal;
    seq.appendChild(el('span', {
      class: 'seq-badge',
      text: String(number),
      title: Number.isFinite(item.i) ? '序号来自 i 字段' : '按顺序编号',
    }));
    tr.appendChild(seq);

    for (const field of ['front', 'back', 'content']) {
      const td = el('td');
      td.appendChild(editorFor(item, number, field));
      tr.appendChild(td);
    }

    const delTd = el('td', { class: 'cell-del' });
    delTd.appendChild(el('button', {
      class: 'row-del',
      type: 'button',
      'aria-label': `删除第 ${number} 张卡片`,
      title: '删除这一行',
      on: { click: () => onDelete(item) },
    }, [
      el('span', { class: 'sr-only', text: '删除' }),
    ]));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.innerHTML = '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6"/>';
    delTd.querySelector('button').appendChild(svg);
    tr.appendChild(delTd);
    return tr;
  }

  function render() {
    const { pages, start } = computeFiltered();
    const slice = filtered.slice(start, start + pageSize);

    clear(tbody);
    const frag = document.createDocumentFragment();
    slice.forEach((entry) => frag.appendChild(rowFor(entry)));
    tbody.appendChild(frag);

    updateEmpty();

    const end = slice.length ? start + slice.length : 0;
    rowRangeEl.textContent = `显示 ${filtered.length ? start + 1 : 0}–${end} / 共 ${intFmt(filtered.length)} 条`;
    pageLabelEl.textContent = `${page} / ${pages}`;
    pagePrev.disabled = page <= 1;
    pageNext.disabled = page >= pages;
  }

  function setEntries(list, {
    focusId = null, sourceEmpty: empty = false, resetSearch = false,
  } = {}) {
    entries = Array.isArray(list) ? list : [];
    sourceEmpty = !!empty;
    if (focusId || resetSearch) {
      keyword = '';
      searchEl.value = '';
      page = 1;
    }
    render();

    if (focusId) {
      const index = filtered.findIndex(({ item }) => item._id === focusId);
      if (index >= 0) {
        page = Math.floor(index / pageSize) + 1;
        render();
        requestAnimationFrame(() => {
          const row = tbody.querySelector(`tr[data-id="${CSS.escape(focusId)}"]`);
          const cell = row?.querySelector('.cell-edit');
          if (cell) {
            cell.focus();
            row.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        });
      }
    }
  }

  searchEl.addEventListener('input', () => {
    keyword = searchEl.value;
    applySearch();
  });

  pageSizeEl.addEventListener('change', () => {
    pageSize = Number(pageSizeEl.value) || 50;
    page = 1;
    render();
  });

  pagePrev.addEventListener('click', () => {
    if (page > 1) { page--; render(); }
  });
  pageNext.addEventListener('click', () => {
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page < pages) { page++; render(); }
  });

  return {
    setEntries,
    refresh: render,
    getSearchKeyword: () => keyword,
  };
}
