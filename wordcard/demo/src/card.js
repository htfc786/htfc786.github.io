/* ============================================================
 * card.js —— 卡片排版核心
 * ------------------------------------------------------------
 * 只做一件事：把「卡片数据 + 配置」变成「一页一页的真实 DOM」。
 * 没有 canvas、没有图片、没有第三方库，文字始终是矢量文本。
 *
 * 对外挂在 window.CardKit 上，纯逻辑 / 只依赖 DOM，
 * 可以直接搬到 Vue 组件或后端渲染（Puppeteer）里复用。
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- 常量与默认配置 ---------------- */

  var FONT_STACKS = {
    sans:  '"Noto Sans SC","Source Han Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
    serif: '"Noto Serif SC","Source Han Serif SC","Songti SC",SimSun,serif',
    kai:   'KaiTi,STKaiti,"Kaiti SC",serif',
    mono:  'ui-monospace,Consolas,"Courier New",monospace',
  };

  var FONT_OPTIONS = [
    ['sans', '无衬线（黑体）'],
    ['serif', '衬线（宋体）'],
    ['kai', '楷体'],
    ['mono', '等宽'],
  ];

  // 背面相对正面的版式。哪种正确取决于打印机/驱动/长边短边翻转，做成可选项 + 对位测试页。
  var MIRROR_OPTIONS = [
    ['flipX', '左右镜像'],
    ['flipY', '上下镜像'],
    ['rot180', '旋转 180°'],
    ['none', '不镜像（与正面同版式）'],
  ];

  var ALIGN_OPTIONS = [
    ['left', '左对齐'],
    ['center', '居中'],
    ['right', '右对齐'],
    ['justify', '两端对齐'],
  ];

  var BLOCK_ALIGN_OPTIONS = [['center', '居中'], ['left', '靠左'], ['right', '靠右']];
  var VALIGN_OPTIONS = [['center', '居中'], ['top', '靠上'], ['bottom', '靠下']];

  // 面板上的取值 → CSS flex 取值
  var V_ALIGN = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
  var H_ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end' };

  function defaultConfig() {
    return {
      // 纸张：留白默认 0，卡片铺满整张纸，裁剪最省事
      page:   { orientation: 'landscape', padding: 0 },
      // 网格：间距默认 0，相邻卡片共用同一条裁切线
      grid:   { cols: 4, rows: 5, gap: 0 },
      // 卡片：没有圆角（裁完也看不见），只有裁切边框和底色
      // 安全区：四边独立设置，因为夹子/打孔往往只占一边
      card:   { border: 'dashed', borderColor: '#c8c8c8', background: '#ffffff',
                safe: { top: 3, right: 3, bottom: 3, left: 3 } },
      // 正面：文本样式 + 整块位置
      front:  { font: 'sans', size: 16, weight: '700', lineHeight: 1.2, color: '#111111',
                align: 'center', valign: 'center', blockAlign: 'center' },
      // 反面
      back:   { font: 'serif', size: 13, weight: '400', lineHeight: 1.25, color: '#111111',
                align: 'center', valign: 'center', blockAlign: 'center' },
      // 附加信息（小字），可以只印在一面
      note:   { show: true, position: 'back', spacing: 1.5,
                font: 'sans', size: 8, weight: '400', lineHeight: 1.3,
                color: '#888888', align: 'center' },
      extras: { cardNum: true, pageNum: true, editable: true,
                autoFit: true, autoFitMin: 7, safeGuide: true },
      duplex: { mirror: 'flipX', mirrorLayout: true },
    };
  }

  /* ---------------- 小工具 ---------------- */

  function mm2px(mm) { return mm * 96 / 25.4; }

  function pageSize(cfg) {
    return cfg.page.orientation === 'landscape'
      ? { w: 297, h: 210 }
      : { w: 210, h: 297 };
  }

  function borderValue(card) {
    return card.border === 'none' ? 'none' : '1px ' + card.border + ' ' + card.borderColor;
  }

  /** 安全区：四边独立。兼容老配置里的单个 safeArea */
  function cardSafe(card) {
    var s = card.safe;
    if (!s) {
      var v = Math.max(0, card.safeArea || 0);
      return { top: v, right: v, bottom: v, left: v };
    }
    return {
      top: Math.max(0, +(s.top || 0)),
      right: Math.max(0, +(s.right || 0)),
      bottom: Math.max(0, +(s.bottom || 0)),
      left: Math.max(0, +(s.left || 0)),
    };
  }

  /**
   * 卡片尺寸不需要用户填 —— 由「纸张 - 留白 - 间距」和一页的数量算出来。
   * 返回 mm，并额外给出扣掉四边安全区之后真正可写的区域。
   */
  function cardGeometry(cfg) {
    var s = pageSize(cfg);
    var safe = cardSafe(cfg.card);
    var cols = Math.max(1, cfg.grid.cols | 0);
    var rows = Math.max(1, cfg.grid.rows | 0);
    var w = (s.w - cfg.page.padding * 2 - cfg.grid.gap * (cols - 1)) / cols;
    var h = (s.h - cfg.page.padding * 2 - cfg.grid.gap * (rows - 1)) / rows;
    return {
      page: s,
      cols: cols,
      rows: rows,
      perPage: cols * rows,
      w: w,
      h: h,
      safe: safe,
      textW: Math.max(0, w - safe.left - safe.right),
      textH: Math.max(0, h - safe.top - safe.bottom),
    };
  }

  /* ---------------- 数据 ---------------- */

  function unescapeNL(s) { return String(s == null ? '' : s).replace(/\\n/g, '\n'); }
  function escapeNL(s) { return String(s == null ? '' : s).replace(/\n/g, '\\n'); }

  /**
   * 文本 → 卡片数组。每行一张卡：正面 | 反面 | 附加信息
   * 分隔符支持 | ｜ 和 Tab；内容里的换行写成 \n。
   */
  function parseCards(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line.length > 0; })
      .map(function (line) {
        var parts = line.split(/\s*[|｜\t]\s*/);
        return {
          front: unescapeNL(parts[0]),
          back:  unescapeNL(parts[1]),
          note:  unescapeNL(parts[2]),
        };
      });
  }

  /** 卡片数组 → 文本（可视化编辑之后回写给文本框） */
  function cardsToText(cards) {
    return (cards || []).map(function (c) {
      var parts = [escapeNL(c.front), escapeNL(c.back), escapeNL(c.note)];
      while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
      return parts.join(' | ');
    }).join('\n');
  }

  /* ---------------- 分页 ---------------- */

  /**
   * 卡片数组 → 页数组。
   * 返回 [{ side:'front'|'back', pageNo, cells:[cell|null × (cols*rows)] }, ...]
   * 顺序天然是 正面1、反面1、正面2、反面2 …… 正好给双面打印用。
   */
  function paginate(cards, cfg) {
    var g = cardGeometry(cfg);
    var per = g.perPage;
    var sheets = [];

    for (var start = 0; start < cards.length; start += per) {
      var chunkIndex = start / per;
      var front = new Array(per).fill(null);
      var back = new Array(per).fill(null);

      cards.slice(start, start + per).forEach(function (card, i) {
        var num = chunkIndex * per + i + 1;
        front[i] = cellOf(card, i, num, cfg, 'front');
        // 同一张卡的反面，放到镜像后的格子里
        back[mirrorIndex(i, g.cols, g.rows, cfg.duplex.mirror)] = cellOf(card, i, num, cfg, 'back');
      });

      sheets.push({ side: 'front', pageNo: chunkIndex * 2 + 1, cells: front });
      sheets.push({ side: 'back',  pageNo: chunkIndex * 2 + 2, cells: back });
    }
    return sheets;
  }

  /** 网格里第 i 个格子在背面应该落在哪一格 */
  function mirrorIndex(i, cols, rows, mode) {
    var r = Math.floor(i / cols);
    var c = i % cols;
    switch (mode) {
      case 'flipX':  return r * cols + (cols - 1 - c);                  // 左右镜像
      case 'flipY':  return (rows - 1 - r) * cols + c;                  // 上下镜像
      case 'rot180': return (rows - 1 - r) * cols + (cols - 1 - c);     // 旋转 180°
      default:       return i;                                         // 不镜像
    }
  }

  /* ---------------- 背面的几何镜像 ----------------
   * 只把"卡片落在哪一格"镜像是不够的：卡片内部的东西也要一起翻。
   * 安全区尤其是硬需求 —— "夹子夹在上面"在正反两面指的是同一条物理边，
   * 背面不翻就会正反面错开（左夹子变成右夹子）。
   * 文字本身不镜像（否则没法读），翻的是它摆放的几何。
   */

  /** 镜像方式 → 哪几个轴要翻 */
  function mirrorAxes(mode) {
    return {
      x: mode === 'flipX' || mode === 'rot180',   // 左右翻转
      y: mode === 'flipY' || mode === 'rot180',   // 上下翻转
    };
  }

  var ALIGN_FLIP = { left: 'right', right: 'left', center: 'center', justify: 'justify' };
  var BLOCK_FLIP = { left: 'right', right: 'left', center: 'center' };
  var VALIGN_FLIP = { top: 'bottom', bottom: 'top', center: 'center' };

  /** 这一面实际用的安全区：背面的四边按镜像方式翻过去 */
  function sheetSafe(cfg, side) {
    var s = cardSafe(cfg.card);
    if (side !== 'back') return s;
    var a = mirrorAxes(cfg.duplex.mirror);
    return {
      top:    a.y ? s.bottom : s.top,
      right:  a.x ? s.left   : s.right,
      bottom: a.y ? s.top    : s.bottom,
      left:   a.x ? s.right  : s.left,
    };
  }

  /** 这一面实际用的内容布局（关掉 mirrorLayout 就按面板设定原样印） */
  function sheetLayout(cfg, side, t) {
    var a = isBackMirrored(cfg, side) ? mirrorAxes(cfg.duplex.mirror) : { x: false, y: false };
    return {
      align:      a.x ? (ALIGN_FLIP[t.align] || t.align) : t.align,
      blockAlign: a.x ? (BLOCK_FLIP[t.blockAlign] || t.blockAlign) : t.blockAlign,
      valign:     a.y ? (VALIGN_FLIP[t.valign] || t.valign) : t.valign,
      noteOnTop:  a.y,
      flipX:      a.x,
      flipY:      a.y,
    };
  }

  function isBackMirrored(cfg, side) {
    return side === 'back' && cfg.duplex.mirrorLayout !== false;
  }

  function cellOf(card, index, num, cfg, side) {
    var noteOn = cfg.note.show &&
      (cfg.note.position === 'both' || cfg.note.position === side);
    return {
      index: index,                                     // 第几张卡（可视化编辑回写用）
      main: card[side] || '',                           // 正面页取 front，反面页取 back
      field: side === 'front' ? 'front' : 'back',
      note: noteOn ? (card.note || '') : '',
      showNote: noteOn,
      num: cfg.extras.cardNum ? String(num) : '',
    };
  }

  /* ---------------- 生成 CSS 变量 ---------------- */

  /** 把配置写到 :root 上；样式表只认变量，不认 JS */
  function applyPageVars(cfg) {
    var s = document.documentElement.style;
    var size = pageSize(cfg);
    s.setProperty('--page-w', size.w + 'mm');
    // 少 0.1mm：高度刚好等于纸张时，Chrome 容易多吐一张空白页
    s.setProperty('--page-h', (size.h - 0.1) + 'mm');
    s.setProperty('--page-pad', Math.max(0, cfg.page.padding) + 'mm');
    s.setProperty('--cols', String(Math.max(1, cfg.grid.cols)));
    s.setProperty('--rows', String(Math.max(1, cfg.grid.rows)));
    s.setProperty('--grid-gap', Math.max(0, cfg.grid.gap) + 'mm');
    s.setProperty('--cell-bg', cfg.card.background);
    s.setProperty('--cell-border', borderValue(cfg.card));

    applyNoteVars(document.documentElement, cfg.note);
    // 兜底值取正面；每一页 .sheet 会再覆盖成自己那一面的（见 applySheetVars）
    applySheetVars(document.documentElement, 'front', cfg);
  }

  /**
   * 一面纸上实际生效的变量：安全区（按镜像翻好的四边）、正/反面文字样式、
   * 整块位置、附加信息顺序、卡片序号所在的角。
   * 全部写在 .sheet 上，所以正反两面互不干扰。
   */
  function applySheetVars(el, side, cfg) {
    var s = el.style;

    /* --- 安全区：背面按镜像翻到对应的物理边 --- */
    var safe = sheetSafe(cfg, side);
    s.setProperty('--cell-safe-t', safe.top + 'mm');
    s.setProperty('--cell-safe-r', safe.right + 'mm');
    s.setProperty('--cell-safe-b', safe.bottom + 'mm');
    s.setProperty('--cell-safe-l', safe.left + 'mm');

    /* --- 正文样式 + 内容摆放 --- */
    var t = cfg[side];
    var L = sheetLayout(cfg, side, t);
    s.setProperty('--main-font', FONT_STACKS[t.font] || FONT_STACKS.sans);
    s.setProperty('--main-size', t.size + 'pt');
    s.setProperty('--main-weight', t.weight);
    s.setProperty('--main-lh', t.lineHeight);
    s.setProperty('--main-color', t.color);
    s.setProperty('--main-align', L.align);
    s.setProperty('--body-valign', V_ALIGN[L.valign] || 'center');
    s.setProperty('--body-halign', H_ALIGN[L.blockAlign] || 'center');
    s.setProperty('--note-order', L.noteOnTop ? '-1' : '0');

    /* --- 附加信息的行内对齐：跟着同一套镜像走 --- */
    var n = cfg.note;
    s.setProperty('--note-align', L.flipX ? (ALIGN_FLIP[n.align] || n.align) : n.align);

    /* --- 卡片序号：正面在右下，背面翻到对应的物理角（安全区内侧） --- */
    var back = side === 'back';
    var a = mirrorAxes(cfg.duplex.mirror);
    var toLeft = back && a.x;
    var toTop = back && a.y;
    s.setProperty('--num-left',   toLeft ? 'calc(var(--cell-safe-l) + 0.5mm)' : 'auto');
    s.setProperty('--num-right',  toLeft ? 'auto' : 'calc(var(--cell-safe-r) + 0.5mm)');
    s.setProperty('--num-top',    toTop  ? 'calc(var(--cell-safe-t) + 0.5mm)' : 'auto');
    s.setProperty('--num-bottom', toTop  ? 'auto' : 'calc(var(--cell-safe-b) + 0.5mm)');
  }

  /** 附加信息是全局一套样式（可能同时印在两面） */
  function applyNoteVars(el, n) {
    var s = el.style;
    s.setProperty('--note-gap', n.spacing + 'mm');
    s.setProperty('--note-font', FONT_STACKS[n.font] || FONT_STACKS.sans);
    s.setProperty('--note-size', n.size + 'pt');
    s.setProperty('--note-weight', n.weight);
    s.setProperty('--note-lh', n.lineHeight);
    s.setProperty('--note-color', n.color);
    s.setProperty('--note-align', n.align);
  }

  /* ---------------- 生成 DOM ---------------- */

  function createSheet(sheet, cfg, index, total) {
    var el = document.createElement('div');
    el.className = 'sheet sheet--' + sheet.side;

    applySheetVars(el, sheet.side, cfg);

    sheet.cells.forEach(function (cell) {
      el.appendChild(createCell(cell, cfg));
    });

    if (cfg.extras.pageNum) {
      var num = document.createElement('div');
      num.className = 'sheet__num';
      num.textContent = '第 ' + sheet.pageNo + ' 页';
      el.appendChild(num);
    }

    // 屏幕上的辅助标记（打印时隐藏）
    var tag = document.createElement('div');
    tag.className = 'sheet__tag';
    var mirrored = sheet.side === 'back' && isBackMirrored(cfg, 'back') &&
      (cfg.duplex.mirror !== 'none');
    tag.textContent = (sheet.side === 'front' ? '正面' : '反面') + ' · ' + (index + 1) + '/' + total +
      (mirrored ? ' · 已按镜像摆放' : '');
    el.appendChild(tag);

    return el;
  }

  function createCell(cell, cfg) {
    var d = document.createElement('div');
    d.className = 'cell';
    if (!cell) { d.classList.add('cell--empty'); return d; }

    var body = document.createElement('div');
    body.className = 'body';

    // 正文：即使为空也建出来，这样空格子也能点进去输入
    var main = document.createElement('div');
    main.className = 'main';
    main.textContent = cell.main || '';
    main.dataset.size = cfg[cell.field].size;      // 供 autoFit 用
    main.dataset.index = String(cell.index);       // 可视化编辑回写用
    main.dataset.field = cell.field;
    main.dataset.ph = cell.field === 'front' ? '正面' : '反面';
    main.spellcheck = false;
    setEditable(main, cfg.extras.editable);
    body.appendChild(main);

    if (cell.showNote) {
      var note = document.createElement('div');
      note.className = 'note';
      note.textContent = cell.note || '';
      note.dataset.index = String(cell.index);
      note.dataset.field = 'note';
      note.dataset.ph = '附加信息';
      note.spellcheck = false;
      setEditable(note, cfg.extras.editable);
      body.appendChild(note);
    }
    d.appendChild(body);

    if (cell.num) {
      var n = document.createElement('div');
      n.className = 'num';
      n.textContent = cell.num;
      d.appendChild(n);
    }
    return d;
  }

  function setEditable(el, on) {
    if (on) el.setAttribute('contenteditable', 'true');
    else el.removeAttribute('contenteditable');
  }

  /* ---------------- 超长文字自动缩字号 ---------------- */

  /**
   * 逐个格子检查有没有溢出（比格子高，或长单词撑破宽度），有就降字号。
   * 纯 CSS 做不到"自动缩到装得下"。
   */
  function autoFitAll(root, minPt) {
    Array.prototype.forEach.call(root.querySelectorAll('.cell'), function (cell) {
      autoFitCell(cell, minPt);
    });
  }

  function autoFitCell(cell, minPt) {
    if (!cell) return;
    var body = cell.querySelector('.body');
    var main = body && body.querySelector('.main');
    if (!body || !main) return;

    var note = body.querySelector('.note');
    var baseMain = parseFloat(main.dataset.size) || 12;

    // 先回到基准字号再重新测量：这样把内容改短之后字号会自己涨回去
    main.style.fontSize = '';
    if (note) note.style.fontSize = '';

    var baseNote = note ? parseFloat(getComputedStyle(note).fontSize) * 72 / 96 : 0;

    var cs = getComputedStyle(cell);
    var availH = cell.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var availW = cell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (availH <= 1 || availW <= 1) return;

    var size = baseMain;
    var guard = 0;
    while (guard++ < 400) {
      var rect = body.getBoundingClientRect();
      var overflowH = rect.height > availH + 1;
      var overflowW = body.scrollWidth > availW + 1;
      if ((!overflowH && !overflowW) || size <= minPt) break;

      size = Math.max(minPt, size - 0.5);
      main.style.fontSize = size + 'pt';
      if (note && baseMain) {
        note.style.fontSize = (baseNote * size / baseMain).toFixed(2) + 'pt';
      }
    }
  }

  global.CardKit = {
    FONT_STACKS: FONT_STACKS,
    FONT_OPTIONS: FONT_OPTIONS,
    MIRROR_OPTIONS: MIRROR_OPTIONS,
    ALIGN_OPTIONS: ALIGN_OPTIONS,
    BLOCK_ALIGN_OPTIONS: BLOCK_ALIGN_OPTIONS,
    VALIGN_OPTIONS: VALIGN_OPTIONS,
    defaultConfig: defaultConfig,
    parseCards: parseCards,
    cardsToText: cardsToText,
    paginate: paginate,
    mirrorIndex: mirrorIndex,
    cardGeometry: cardGeometry,
    cardSafe: cardSafe,
    sheetSafe: sheetSafe,
    sheetLayout: sheetLayout,
    mirrorAxes: mirrorAxes,
    applyPageVars: applyPageVars,
    applySheetVars: applySheetVars,
    createSheet: createSheet,
    autoFitAll: autoFitAll,
    autoFitCell: autoFitCell,
    pageSize: pageSize,
    mm2px: mm2px,
  };
})(window);
