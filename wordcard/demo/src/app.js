/* ============================================================
 * app.js —— 界面层：参数面板 + 预览 + 可视化编辑 + 打印
 * ------------------------------------------------------------
 * 两个数据源：
 *   state.cards  卡片数据（唯一真相），预览和文本框都从它渲染
 *   state.config 排版参数
 * 面板是「schema 驱动」的：加一个可调项只要往 SCHEMA 里加一行。
 * ============================================================ */
(function () {
  'use strict';

  var K = window.CardKit;
  var STORE_KEY = 'wordcard.v2';

  var SAMPLE = [
    'abandon | 放弃；抛弃 | v. 舍弃',
    'benefit | 好处；使受益 | n. / v.',
    'capable | 有能力的 | adj.\\nbe capable of',
    'delicate | 精致的；微妙的 | adj.',
    'efficient | 高效的 | adj.\\nefficiency n.',
    'fragile | 易碎的 | adj.',
    'genuine | 真正的；真诚的 | adj.',
    'hesitate | 犹豫 | v. hesitation n.',
    'identify | 识别；确认 | v. identity n.',
    'justify | 证明…正当 | v. justification n.',
  ].join('\n');

  var state = {
    config: K.defaultConfig(),
    cards: K.parseCards(SAMPLE),
    zoom: 70,
    autoZoom: true,     // 窗口变化时自动重新适应宽度
  };

  var sheetsEl = document.getElementById('sheets');
  var dataEl = document.getElementById('data');
  var statusEl = document.getElementById('status');
  var cardInfoEl = document.getElementById('cardinfo');
  var editInfoEl = document.getElementById('editinfo');

  /* ================= 参数面板定义 ================= */

  /** 文本样式：三个内容块共用这一套 */
  function textItems(prefix) {
    return [
      { p: prefix + '.font',       t: 'select', label: '字体', options: K.FONT_OPTIONS },
      { p: prefix + '.size',       t: 'number', label: '字号', unit: 'pt', min: 4, max: 72, step: 0.5 },
      { p: prefix + '.weight',     t: 'select', label: '字重', options: [['400', '常规'], ['500', '中等'], ['700', '加粗']] },
      { p: prefix + '.lineHeight', t: 'number', label: '行高', min: 1, max: 2.5, step: 0.05 },
      { p: prefix + '.color',      t: 'color',  label: '颜色' },
      { p: prefix + '.align',      t: 'select', label: '行内对齐', options: K.ALIGN_OPTIONS,
        hint: '控制每一行文字自己怎么排；配合上面的"整块位置"就能做出「文字块居中、每行从左边起排」' },
    ];
  }

  /** 整块内容在卡片里的位置 */
  function layoutItems(prefix) {
    return [
      { p: prefix + '.valign',     t: 'select', label: '垂直位置', options: K.VALIGN_OPTIONS },
      { p: prefix + '.blockAlign', t: 'select', label: '整块位置', options: K.BLOCK_ALIGN_OPTIONS },
    ];
  }

  var SCHEMA = [
    { title: '纸张与网格', items: [
      { p: 'page.orientation', t: 'select', label: '纸张方向', options: [['landscape', 'A4 横向 297×210'], ['portrait', 'A4 纵向 210×297']] },
      { p: 'grid.cols',        t: 'number', label: '每行张数', min: 1, max: 12, step: 1 },
      { p: 'grid.rows',        t: 'number', label: '每列张数', min: 1, max: 16, step: 1 },
      { p: 'page.padding',     t: 'number', label: '纸张留白', unit: 'mm', min: 0, max: 20, step: 1,
        hint: '默认 0：卡片直接铺到纸边，裁的时候不用先修边。靠边的部分被打印机吃掉也没关系' },
      { p: 'grid.gap',         t: 'number', label: '卡片间距', unit: 'mm', min: 0, max: 10, step: 0.5,
        hint: '默认 0：相邻卡片共用一条裁切线，一刀两块' },
    ]},
    { title: '卡片与裁切', items: [
      { p: 'card.border',      t: 'select', label: '裁切边框', options: [['dashed', '虚线'], ['solid', '实线'], ['dotted', '点线'], ['none', '不显示']] },
      { p: 'card.borderColor', t: 'color',  label: '边框颜色' },
      { p: 'card.background',  t: 'color',  label: '卡片底色' },
    ]},
    { title: '安全区（四边独立）', items: [
      { p: 'card.safe.top',    t: 'number', label: '上', unit: 'mm', min: 0, max: 30, step: 0.5 },
      { p: 'card.safe.right',  t: 'number', label: '右', unit: 'mm', min: 0, max: 30, step: 0.5 },
      { p: 'card.safe.bottom', t: 'number', label: '下', unit: 'mm', min: 0, max: 30, step: 0.5 },
      { p: 'card.safe.left',   t: 'number', label: '左', unit: 'mm', min: 0, max: 30, step: 0.5,
        hint: '这块边带不渲染内容。只在上方夹夹子就只调"上"，其余留 0，版面不浪费。' +
              '按正面的物理方向填一次即可 —— 背面会按"背面版式"自动翻到同一条物理边' },
      { p: 'extras.safeGuide', t: 'check',  label: '屏幕上显示安全区参考线' },
    ]},
    { title: '正面', items: layoutItems('front').concat(textItems('front')) },
    { title: '反面', items: layoutItems('back').concat(textItems('back')) },
    { title: '附加信息', items: [
      { p: 'note.show',     t: 'check',  label: '启用附加信息' },
      { p: 'note.position', t: 'select', label: '印在哪面', options: [['back', '反面'], ['front', '正面'], ['both', '两面']] },
      { p: 'note.spacing',  t: 'number', label: '与正文间距', unit: 'mm', min: 0, max: 10, step: 0.5 },
    ].concat(textItems('note')) },
    { title: '其他', items: [
      { p: 'extras.cardNum',    t: 'check',  label: '显示卡片序号' },
      { p: 'extras.pageNum',    t: 'check',  label: '显示页码' },
      { p: 'extras.editable',   t: 'check',  label: '预览里直接编辑（可视化编辑）' },
      { p: 'extras.autoFit',    t: 'check',  label: '超长内容自动缩小' },
      { p: 'extras.autoFitMin', t: 'number', label: '缩小下限', unit: 'pt', min: 4, max: 16, step: 0.5 },
    ]},
    { title: '双面打印', items: [
      { p: 'duplex.mirror', t: 'select', label: '背面版式', options: K.MIRROR_OPTIONS,
        hint: '哪种对取决于打印机和"长边/短边翻转"。点上面「对位测试数据」打一张，对着光看数字是否重合即可' },
      { p: 'duplex.mirrorLayout', t: 'check', label: '背面位置跟随镜像',
        hint: '安全区四边、内容整块位置、附加信息上下顺序、卡片序号，都会按上面的镜像方式翻到同一条物理边。' +
              '关掉则按面板里设定的方向原样印（适合正反面故意做成不一样的卡片）。文字本身永远不镜像' },
    ]},
  ];

  /* ================= 配置读写 ================= */

  function get(path) {
    return path.split('.').reduce(function (o, k) { return o[k]; }, state.config);
  }
  function set(path, v) {
    var keys = path.split('.');
    var last = keys.pop();
    keys.reduce(function (o, k) { return o[k]; }, state.config)[last] = v;
  }

  /* ================= 面板渲染 ================= */

  function buildControls() {
    var host = document.getElementById('controls');
    host.replaceChildren();

    SCHEMA.forEach(function (sec) {
      var group = document.createElement('section');
      group.className = 'group';

      var h = document.createElement('h2');
      h.textContent = sec.title;
      group.appendChild(h);

      sec.items.forEach(function (item) { group.appendChild(controlEl(item)); });
      host.appendChild(group);
    });
  }

  function controlEl(item) {
    var wrap = document.createElement('div');
    wrap.className = 'field';
    var value = get(item.p);

    if (item.t === 'check') {
      var label = document.createElement('label');
      label.className = 'check';
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!value;
      box.addEventListener('change', function () { set(item.p, box.checked); refresh(); });
      label.appendChild(box);
      label.appendChild(document.createTextNode(' ' + item.label));
      wrap.appendChild(label);
      if (item.hint) {
        var chint = document.createElement('p');
        chint.className = 'hint';
        chint.textContent = item.hint;
        wrap.appendChild(chint);
      }
      return wrap;
    }

    var name = document.createElement('label');
    name.textContent = item.label;
    wrap.appendChild(name);

    var input;
    if (item.t === 'select') {
      input = document.createElement('select');
      item.options.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt[0];
        o.textContent = opt[1];
        input.appendChild(o);
      });
      input.value = value;
      input.addEventListener('change', function () { set(item.p, input.value); refresh(); });
    } else if (item.t === 'color') {
      input = document.createElement('input');
      input.type = 'color';
      input.value = value;
      input.addEventListener('input', function () { set(item.p, input.value); refresh(); });
    } else {
      input = document.createElement('input');
      input.type = 'number';
      input.min = item.min;
      input.max = item.max;
      input.step = item.step;
      input.value = value;
      input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        if (!isFinite(v)) return;
        v = Math.min(item.max, Math.max(item.min, v));
        set(item.p, v);
        refresh();
      });
    }
    wrap.appendChild(input);

    if (item.unit) {
      var unit = document.createElement('span');
      unit.className = 'unit';
      unit.textContent = item.unit;
      wrap.appendChild(unit);
    }
    if (item.hint) {
      var hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = item.hint;
      wrap.appendChild(hint);
    }
    return wrap;
  }

  /* ================= 渲染 ================= */

  function render() {
    var cfg = state.config;
    K.applyPageVars(cfg);
    document.documentElement.style.setProperty('--preview-zoom', state.zoom / 100);
    document.body.classList.toggle('show-guide', !!cfg.extras.safeGuide);

    // @page 的纸张方向必须跟着配置走
    document.getElementById('page-rule').textContent =
      '@page { size: A4 ' + cfg.page.orientation + '; margin: 0; }';

    var sheets = K.paginate(state.cards, cfg);
    var frag = document.createDocumentFragment();
    sheets.forEach(function (sheet, i) { frag.appendChild(K.createSheet(sheet, cfg, i, sheets.length)); });
    sheetsEl.replaceChildren(frag);

    var info = '';
    if (state.cards.length) {
      if (cfg.extras.autoFit) K.autoFitAll(sheetsEl, cfg.extras.autoFitMin);
      info = state.cards.length + ' 张卡片 · 每页 ' + (sheets.length ? (cfg.grid.cols * cfg.grid.rows) : 0) +
        ' 张 · 共 ' + sheets.length + ' 页（' + (sheets.length / 2) + ' 组双面）';
    } else {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '左边贴一些数据，每行一张卡：正面 | 反面 | 附加信息';
      sheetsEl.appendChild(empty);
      info = '暂无数据';
    }
    statusEl.textContent = info;
    updateCardInfo();
    save();
  }

  /** 卡片尺寸是算出来的，不需要用户填 */
  function updateCardInfo() {
    var g = K.cardGeometry(state.config);
    var s = g.safe;
    var same = s.top === s.right && s.right === s.bottom && s.bottom === s.left;
    var safeTxt = (s.top || s.right || s.bottom || s.left)
      ? (same ? '安全区 ' + s.top + 'mm'
              : '安全区 上' + s.top + ' 右' + s.right + ' 下' + s.bottom + ' 左' + s.left + 'mm')
      : '无安全区';
    cardInfoEl.textContent =
      '卡片 ' + g.w.toFixed(1) + ' × ' + g.h.toFixed(1) + ' mm' +
      ' · 内容可用 ' + g.textW.toFixed(1) + ' × ' + g.textH.toFixed(1) + ' mm' +
      ' · ' + safeTxt +
      ' · 每页 ' + g.perPage + ' 张';
  }

  var renderTimer = null;
  function refresh() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 100);   // 拖滑块时防抖
  }

  /* ================= 可视化编辑 ================= */

  function onCellFocus(e) {
    var el = e.target.closest ? e.target.closest('[data-field]') : null;
    if (!el) return;
    var cell = el.closest('.cell');
    Array.prototype.forEach.call(sheetsEl.querySelectorAll('.cell--active'), function (c) {
      if (c !== cell) c.classList.remove('cell--active');
    });
    if (cell) cell.classList.add('cell--active');

    var index = parseInt(el.dataset.index, 10);
    var label = el.dataset.field === 'front' ? '正面' :
                el.dataset.field === 'back' ? '反面' : '附加信息';
    editInfoEl.textContent = '正在编辑第 ' + (index + 1) + ' 张卡 · ' + label + '（Enter 换行，Esc 退出）';
  }

  var fitTimer = null;
  function scheduleFit(cell) {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(function () {
      if (!cell || !cell.isConnected) return;
      if (state.config.extras.autoFit) K.autoFitCell(cell, state.config.extras.autoFitMin);
    }, 200);
  }

  var textTimer = null;
  function scheduleTextareaSync() {
    clearTimeout(textTimer);
    textTimer = setTimeout(function () {
      dataEl.value = K.cardsToText(state.cards);   // 保持文本框和卡片同步
    }, 400);
  }

  function normalizeText(t) {
    return String(t || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+$/gm, '');
  }

  function handleEdit(target) {
    var el = target.closest ? target.closest('[data-field]') : null;
    if (!el) return;

    var index = parseInt(el.dataset.index, 10);
    var field = el.dataset.field;
    var card = state.cards[index];
    if (!card) return;

    var text = normalizeText(el.innerText);
    if (card[field] === text) return;
    card[field] = text;

    // 同一张卡的同一字段可能同时出现在正反两面（附加信息），一起更新
    Array.prototype.forEach.call(
      sheetsEl.querySelectorAll('[data-field="' + field + '"][data-index="' + index + '"]'),
      function (other) {
        if (other !== el && normalizeText(other.innerText) !== text) other.innerText = text;
      }
    );

    scheduleFit(el.closest('.cell'));
    scheduleTextareaSync();
    save();
  }

  function onCellInput(e) {
    if (e.isComposing) return;      // 中文输入法组字中，等 compositionend 再处理
    handleEdit(e.target);
  }

  /** 粘贴只取纯文本，避免带一堆样式进来 */
  function onPaste(e) {
    var el = e.target.closest ? e.target.closest('[data-field]') : null;
    if (!el) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text');
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    range.deleteContents();
    var node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);
    handleEdit(el);
  }

  /* ================= 预览缩放 ================= */

  function fitWidth() {
    var stage = document.querySelector('.stage');
    var size = K.pageSize(state.config);
    var avail = stage.clientWidth - 40;
    state.zoom = Math.round(Math.min(150, Math.max(30, avail / K.mm2px(size.w) * 100)));
    syncZoomUI();
    refresh();          // 走防抖，拖窗口时不至于每帧重排全部页面
  }

  function syncZoomUI() {
    document.getElementById('zoom').value = state.zoom;
    document.getElementById('zoom-val').textContent = state.zoom + '%';
  }

  /* ================= 存取 ================= */

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        config: state.config,
        data: K.cardsToText(state.cards),
        zoom: state.zoom,
      }));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function load() {
    var raw;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
      var saved = JSON.parse(raw);
      // 老配置里的单个 safeArea → 四边统一
      var c = saved.config;
      if (c && c.card && c.card.safeArea !== undefined && !c.card.safe) {
        var v = c.card.safeArea;
        c.card.safe = { top: v, right: v, bottom: v, left: v };
      }
      if (saved.config) merge(state.config, saved.config);
      if (typeof saved.data === 'string') state.cards = K.parseCards(saved.data);
      if (saved.zoom) { state.zoom = saved.zoom; state.autoZoom = false; }
    } catch (e) { /* 数据坏了就用默认值 */ }
  }

  function merge(target, src) {
    Object.keys(src || {}).forEach(function (k) {
      var v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) merge(target[k] = target[k] || {}, v);
      else if (v !== undefined) target[k] = v;
    });
  }

  /* ================= 启动 ================= */

  function init() {
    load();
    buildControls();
    syncZoomUI();
    dataEl.value = K.cardsToText(state.cards);

    // 文本框 → 卡片数据
    dataEl.addEventListener('input', function () {
      state.cards = K.parseCards(dataEl.value);
      refresh();
      editInfoEl.textContent = '';
    });

    // 卡片 ←→ 数据（可视化编辑）
    sheetsEl.addEventListener('input', onCellInput);
    sheetsEl.addEventListener('compositionend', function (e) { handleEdit(e.target); });
    sheetsEl.addEventListener('focusin', onCellFocus);
    sheetsEl.addEventListener('paste', onPaste);
    sheetsEl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.target.blur(); editInfoEl.textContent = ''; }
    });

    document.getElementById('btn-sample').addEventListener('click', function () {
      state.cards = K.parseCards(SAMPLE);
      dataEl.value = K.cardsToText(state.cards);
      refresh();
    });
    document.getElementById('btn-align').addEventListener('click', function () {
      // 2×2，每格正面=背面=同一个数字：打出来对着光看数字是否重合就知道镜像选对了没
      set('grid.cols', 2); set('grid.rows', 2);
      set('card.border', 'solid');
      set('card.safe.top', 0); set('card.safe.right', 0);
      set('card.safe.bottom', 0); set('card.safe.left', 0);
      state.cards = K.parseCards('1 | 1\n2 | 2\n3 | 3\n4 | 4');
      dataEl.value = K.cardsToText(state.cards);
      buildControls();
      refresh();
    });
    document.getElementById('btn-clear').addEventListener('click', function () {
      state.cards = [];
      dataEl.value = '';
      refresh();
    });
    document.getElementById('btn-print').addEventListener('click', function () {
      if (state.config.extras.autoFit) K.autoFitAll(sheetsEl, state.config.extras.autoFitMin);
      window.print();
    });
    document.getElementById('btn-fit').addEventListener('click', function () {
      state.autoZoom = true;
      fitWidth();
    });

    var zoomEl = document.getElementById('zoom');
    zoomEl.addEventListener('input', function () {
      state.autoZoom = false;
      state.zoom = parseInt(zoomEl.value, 10);
      document.getElementById('zoom-val').textContent = state.zoom + '%';
      render();
    });

    window.addEventListener('beforeprint', function () {
      if (state.config.extras.autoFit) K.autoFitAll(sheetsEl, state.config.extras.autoFitMin);
    });
    window.addEventListener('resize', function () { if (state.autoZoom) fitWidth(); });

    render();
    if (state.autoZoom) fitWidth();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
