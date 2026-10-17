/* ============================================================
 * preview.js —— 制作页右侧预览
 * 渲染、缩放、适应宽度、打印、手机端弹层。
 * ============================================================ */
import {
  $, el, clamp, debounce, afterPaint, isNarrowScreen,
} from '../core/dom.js';
import {
  applyPageVars, applyPageRule, applySheetVars, applySafeGuideClasses,
  renderSheets, autoFitAll, layoutSummary,
} from '../core/render.js';
import {
  pageSize, mm2px, cardGeometry, sheetSafe,
} from '../core/geometry.js';
import { loadUI, patchUI } from '../core/storage.js';

export function createCardPreview({ getCards, getConfig, getMeta, onInfo, onDisabled }) {
  const stage = $('#stage');
  const sheetsEl = $('#sheets');
  const infoEl = $('#preview-info');
  const metaEl = $('#preview-meta');
  const zoomEl = $('#zoom');
  const zoomValEl = $('#zoom-val');
  const fitBtn = $('#fit-width');
  const printButtons = [$('#print-main'), $('#print-top'), $('#print-preview')].filter(Boolean);
  const openButtons = [$('#open-preview'), $('#open-preview-inline')].filter(Boolean);
  const closeBtn = $('#preview-close');

  const ui = loadUI();
  let zoom = Number.isFinite(Number(ui.zoom)) ? Number(ui.zoom) : 70;
  let autoZoom = ui.autoZoom !== false;
  let forcedForPrint = false;
  let sheetObserver = null;
  let lastTrigger = null;
  const LAZY_AUTOFIT_AFTER = 400;

  const scheduleFit = debounce(() => {
    if (autoZoom) fitWidth();
  }, 120);

  function isVisible() {
    return stage.getClientRects().length > 0;
  }

  function applyZoom() {
    zoom = Math.round(clamp(zoom, 20, 150));
    document.documentElement.style.setProperty('--preview-zoom', String(zoom / 100));
    zoomEl.value = String(zoom);
    zoomValEl.textContent = zoom + '%';
  }

  function fitWidth() {
    if (!isVisible()) return;
    const cs = getComputedStyle(stage);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const avail = Math.max(80, stage.clientWidth - pad - 2);
    const pageW = mm2px(pageSize(getConfig()).w);
    zoom = Math.round(clamp(avail / pageW * 100, 20, 150));
    applyZoom();
  }

  function minimalAutoFitPt() {
    return getConfig().extras.autoFitMin;
  }

  /**
   * 卡片很多时只给当前可见的几页做自动缩字号，其余页面在滚到跟前
   * （或打印前）再量。否则每次改一个参数都要重新量 2900 张卡。
   */
  function autoFitVisibleSheets() {
    const stageRect = stage.getBoundingClientRect();
    for (const sheet of sheetsEl.querySelectorAll('.sheet')) {
      const rect = sheet.getBoundingClientRect();
      if (rect.bottom >= stageRect.top - 700 && rect.top <= stageRect.bottom + 700) {
        autoFitAll(sheet, minimalAutoFitPt());
      }
    }
  }

  function observeSheets() {
    if (!('IntersectionObserver' in window)) {
      autoFitAll(sheetsEl, minimalAutoFitPt());
      return;
    }
    sheetObserver?.disconnect();
    sheetObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target.isConnected) {
          autoFitAll(entry.target, minimalAutoFitPt());
        }
      }
    }, { root: stage, rootMargin: '500px 0px' });
    for (const sheet of sheetsEl.querySelectorAll('.sheet')) sheetObserver.observe(sheet);
  }

  function autoFit() {
    const config = getConfig();
    if (!config.extras.autoFit || !isVisible()) return;
    if (getCards().length <= LAZY_AUTOFIT_AFTER) {
      sheetObserver?.disconnect();
      sheetObserver = null;
      autoFitAll(sheetsEl, config.extras.autoFitMin);
    } else {
      autoFitVisibleSheets();
      observeSheets();
    }
  }

  function emptyState() {
    const wrap = el('div', { class: 'stage-empty' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.innerHTML = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h7M7 17h4"/>';
    wrap.append(
      svg,
      el('strong', { text: '还没有卡片数据' }),
      el('p', { text: '先到数据导入页选择词表，确认范围后再来做卡片。' }),
      el('a', { class: 'btn btn--primary btn--sm', href: 'import.html', text: '去导入数据' }),
    );
    return wrap;
  }

  function render() {
    const config = getConfig();
    const cards = getCards();

    applyPageVars(config);
    applyPageRule(config);
    applyZoom();
    sheetObserver?.disconnect();
    sheetObserver = null;

    if (!cards.length) {
      sheetsEl.replaceChildren(emptyState());
      metaEl.textContent = '0 张';
      infoEl.textContent = '暂无数据';
      onDisabled?.(true);
      onInfo?.({ cards, sheets: [], geometry: cardGeometry(config) });
      return;
    }

    const sheets = renderSheets(sheetsEl, cards, config);
    const summary = layoutSummary(cards, config);
    const meta = getMeta?.() || {};
    metaEl.textContent = `${cards.length} 张`;
    metaEl.title = meta.name ? `${meta.name}${meta.range ? ` · ${meta.range.min}–${meta.range.max}` : ''}` : '';
    infoEl.textContent =
      `共 ${cards.length} 张 · 每页 ${summary.perPage} 张 · ${sheets.length} 页` +
      `（${summary.groupCount} 组双面）`;
    onDisabled?.(false);
    onInfo?.({ cards, sheets, geometry: summary, meta });
    autoFit();
    if (autoZoom) fitWidth();
  }

  const renderSoon = debounce(render, 180);

  // 只更新 CSS 变量和自动缩字号，不重新创建几千个卡片 DOM。
  // 这些改动不影响文字是否溢出，跳过逐格测量，改颜色/对齐时几乎瞬时。
  const NO_MEASURE_PATHS = new Set([
    'front.color', 'back.color', 'note.color',
    'front.align', 'back.align', 'note.align',
    'front.valign', 'back.valign',
    'front.blockAlign', 'back.blockAlign',
    'card.background', 'card.borderColor',
    'extras.safeGuide', 'duplex.mirrorLayout',
  ]);

  function sidesForPath(path) {
    if (!path) return ['front', 'back'];
    if (path.startsWith('front.')) return ['front'];
    if (path.startsWith('back.')) return ['back'];
    if (path === 'note.align') return ['front', 'back'];
    if (path.startsWith('note.')) return [];               // 其余 note 变量在 :root 上
    if (path.startsWith('card.safe.') || path === 'duplex.mirrorLayout') return ['front', 'back'];
    if (path.startsWith('card.')) return [];               // 背景、边框颜色在 :root 上
    if (path === 'extras.safeGuide') return [];
    return [];                                             // 纸张留白、间距、自动缩放
  }

  function softUpdate(path) {
    const config = getConfig();
    const cards = getCards();
    applyPageVars(config);
    applyPageRule(config);
    if (!cards.length) return;

    const sides = sidesForPath(path);
    const needsMeasure = !path || !NO_MEASURE_PATHS.has(path);
    const updateGuides = !path || path === 'extras.safeGuide' || path.startsWith('card.safe.');

    if (sides.length || updateGuides) {
      for (const sheet of sheetsEl.querySelectorAll('.sheet')) {
        const side = sheet.dataset.side === 'back' ? 'back' : 'front';
        if (sides.includes(side)) applySheetVars(sheet, side, config);
        if (updateGuides) {
          sheet.classList.remove('show-guide', 'guide-t', 'guide-r', 'guide-b', 'guide-l');
          applySafeGuideClasses(sheet, sheetSafe(config, side), config.extras.safeGuide);
        }
        if (needsMeasure && sides.includes(side)) {
          for (const main of sheet.querySelectorAll('.main')) {
            main.dataset.baseSize = String(config[side].size);
          }
        }
      }
    }

    if (path === 'duplex.mirrorLayout') {
      const mirrored = config.duplex.mirrorLayout !== false && config.duplex.mirror !== 'none';
      for (const sheet of sheetsEl.querySelectorAll('.sheet--back')) {
        const tag = sheet.querySelector('.sheet__tag');
        if (!tag) continue;
        const base = tag.textContent.replace(' · 已镜像', '');
        tag.textContent = base + (mirrored ? ' · 已镜像' : '');
      }
    }

    if (!config.extras.autoFit) {
      // 关掉自动缩放时，把之前二分搜索留下的行内字号清掉
      for (const node of sheetsEl.querySelectorAll('.main, .note')) node.style.fontSize = '';
    } else if (needsMeasure) {
      autoFit();
    }
  }

  function setZoom(value, { manual = true } = {}) {
    zoom = Number(value);
    autoZoom = !manual;
    applyZoom();
    if (manual) patchUI({ zoom, autoZoom: false });
  }

  /* ---------------- 手机端弹层 ---------------- */

  function openMobile(event) {
    lastTrigger = event?.currentTarget || document.activeElement;
    document.body.classList.add('preview-open');
    requestAnimationFrame(() => {
      if (autoZoom) fitWidth();
      autoFit();
      closeBtn?.focus?.();
    });
  }

  function closeMobile() {
    document.body.classList.remove('preview-open');
    if (lastTrigger && lastTrigger.offsetParent !== null) lastTrigger.focus();
    lastTrigger = null;
  }

  function printNow() {
    if (!getCards().length) return;
    if (isNarrowScreen() && !document.body.classList.contains('preview-open')) {
      document.body.classList.add('preview-open');
      forcedForPrint = true;
      afterPaint().then(() => {
        if (getConfig().extras.autoFit) autoFitAll(sheetsEl, getConfig().extras.autoFitMin);
        window.print();
        setTimeout(() => {
          if (forcedForPrint) {
            document.body.classList.remove('preview-open');
            forcedForPrint = false;
          }
        }, 200);
      });
      return;
    }
    if (getConfig().extras.autoFit) autoFitAll(sheetsEl, getConfig().extras.autoFitMin);
    window.print();
  }

  /* ---------------- 事件 ---------------- */

  zoomEl.addEventListener('input', () => setZoom(zoomEl.value, { manual: true }));
  fitBtn.addEventListener('click', () => {
    autoZoom = true;
    fitWidth();
    patchUI({ autoZoom: true, zoom });
  });
  for (const button of openButtons) button.addEventListener('click', openMobile);
  closeBtn?.addEventListener('click', closeMobile);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('preview-open')) closeMobile();
  });
  window.addEventListener('resize', scheduleFit);
  window.matchMedia('(min-width: 901px)').addEventListener('change', (event) => {
    if (event.matches) closeMobile();
    else scheduleFit();
  });
  if ('ResizeObserver' in window) {
    new ResizeObserver(scheduleFit).observe(stage);
  }

  for (const button of printButtons) button.addEventListener('click', printNow);

  window.addEventListener('beforeprint', () => {
    if (!isVisible() && isNarrowScreen()) {
      document.body.classList.add('preview-open');
      forcedForPrint = true;
    }
    if (getConfig().extras.autoFit) autoFitAll(sheetsEl, getConfig().extras.autoFitMin);
  });
  window.addEventListener('afterprint', () => {
    if (forcedForPrint) {
      document.body.classList.remove('preview-open');
      forcedForPrint = false;
    }
  });

  return {
    render,
    renderSoon,
    softUpdate,
    fitWidth,
    refit: () => { if (autoZoom) fitWidth(); },
    autoFit,
    openMobile,
    closeMobile,
    printNow,
    getZoom: () => zoom,
    isAutoZoom: () => autoZoom,
  };
}
