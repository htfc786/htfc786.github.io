/* ============================================================
 * settings.js —— 制作页左侧参数面板
 * 上面是常用设置（预设、纸张、张数、字号、安全区、双面），
 * 下面按折叠分组放细节；所有控件直接读写配置对象。
 * ============================================================ */
import { $, el, clear, clamp, fmt } from '../core/dom.js';
import {
  PRESETS, applyPreset, detectPreset, cloneConfig,
} from '../core/config.js';
import { cardGeometry, gridDims } from '../core/geometry.js';
import {
  FONT_OPTIONS, WEIGHT_OPTIONS, ALIGN_OPTIONS, BLOCK_ALIGN_OPTIONS,
  VALIGN_OPTIONS, MIRROR_OPTIONS, ORIENTATION_OPTIONS, BORDER_OPTIONS,
  NOTE_POSITION_OPTIONS, MAX_GRID,
} from '../core/constants.js';

function getPath(obj, path) {
  return path.split('.').reduce((value, key) => value?.[key], obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((target, key) => target[key], obj)[last] = value;
}
const fieldId = (path) => 'cfg-' + path.replace(/[^a-z0-9]+/gi, '-');

const DETAIL_GROUPS = [
  {
    id: 'card',
    title: '卡片与裁切',
    sub: '留白 / 边框',
    items: [
      { path: 'page.padding', type: 'number', label: '纸张留白', unit: 'mm', min: 0, max: 20, step: 1 },
      { path: 'grid.gap', type: 'number', label: '卡片间距', unit: 'mm', min: 0, max: 20, step: 0.5 },
      { path: 'card.border', type: 'select', label: '裁切边框', options: BORDER_OPTIONS },
      { path: 'card.borderColor', type: 'color', label: '边框颜色' },
      { path: 'card.background', type: 'color', label: '卡片底色' },
      { path: 'extras.safeGuide', type: 'switch', label: '显示安全区参考线', wide: true },
    ],
  },
  {
    id: 'front',
    title: '正面文字',
    sub: '字体 / 对齐',
    items: [
      { path: 'front.font', type: 'select', label: '字体', options: FONT_OPTIONS },
      { path: 'front.weight', type: 'select', label: '字重', options: WEIGHT_OPTIONS },
      { path: 'front.lineHeight', type: 'number', label: '行高', min: 1, max: 2.5, step: 0.05 },
      { path: 'front.color', type: 'color', label: '颜色' },
      { path: 'front.align', type: 'select', label: '行内对齐', options: ALIGN_OPTIONS },
      { path: 'front.valign', type: 'select', label: '垂直位置', options: VALIGN_OPTIONS },
      { path: 'front.blockAlign', type: 'select', label: '整块位置', options: BLOCK_ALIGN_OPTIONS, wide: true },
    ],
  },
  {
    id: 'back',
    title: '反面文字',
    sub: '字体 / 对齐',
    items: [
      { path: 'back.font', type: 'select', label: '字体', options: FONT_OPTIONS },
      { path: 'back.weight', type: 'select', label: '字重', options: WEIGHT_OPTIONS },
      { path: 'back.lineHeight', type: 'number', label: '行高', min: 1, max: 2.5, step: 0.05 },
      { path: 'back.color', type: 'color', label: '颜色' },
      { path: 'back.align', type: 'select', label: '行内对齐', options: ALIGN_OPTIONS },
      { path: 'back.valign', type: 'select', label: '垂直位置', options: VALIGN_OPTIONS },
      { path: 'back.blockAlign', type: 'select', label: '整块位置', options: BLOCK_ALIGN_OPTIONS, wide: true },
    ],
  },
  {
    id: 'note',
    title: '附加信息',
    sub: '位置 / 样式',
    items: [
      { path: 'note.position', type: 'select', label: '印在哪面', options: NOTE_POSITION_OPTIONS },
      { path: 'note.spacing', type: 'number', label: '与正文间距', unit: 'mm', min: 0, max: 10, step: 0.5 },
      { path: 'note.font', type: 'select', label: '字体', options: FONT_OPTIONS },
      { path: 'note.size', type: 'number', label: '字号', unit: 'pt', min: 3, max: 40, step: 0.5 },
      { path: 'note.weight', type: 'select', label: '字重', options: WEIGHT_OPTIONS },
      { path: 'note.lineHeight', type: 'number', label: '行高', min: 1, max: 2.5, step: 0.05 },
      { path: 'note.color', type: 'color', label: '颜色' },
      { path: 'note.align', type: 'select', label: '行内对齐', options: ALIGN_OPTIONS },
    ],
  },
  {
    id: 'duplex',
    title: '双面打印',
    sub: '镜像 / 对位',
    items: [
      { path: 'duplex.mirrorLayout', type: 'switch', label: '背面位置跟随镜像', wide: true },
      { path: 'alignTest', type: 'alignTest', label: '对位测试', wide: true },
    ],
  },
  {
    id: 'other',
    title: '其他',
    sub: '序号 / 自动缩放',
    items: [
      { path: 'extras.cardNum', type: 'switch', label: '显示卡片序号', wide: true },
      { path: 'extras.pageNum', type: 'switch', label: '显示页码', wide: true },
      { path: 'extras.autoFit', type: 'switch', label: '超长内容自动缩小', wide: true },
      { path: 'extras.autoFitMin', type: 'number', label: '缩小下限', unit: 'pt', min: 3, max: 20, step: 0.5 },
    ],
  },
  { id: 'printHelp', title: '打印提示', type: 'tips' },
];

const PRINT_TIPS = [
  '浏览器打印设置里：边距选“无”，缩放 100%，取消页眉页脚。',
  '双面打印选“长边翻转”；对不齐就先做一次对位测试。',
  '导出 PDF 时目标打印机选“另存为 PDF”，文字仍是矢量。',
  '用了卡片底色或边框颜色时，打印时勾选“背景图形”。',
  '屏幕上的安全区虚线和「正面/反面」角标不会打印。',
];

export function createSettings({
  getConfig, onChange, onPreset, onAlignTest, isAlignTesting,
}) {
  const presetGrid = $('#preset-grid');
  const primaryFields = $('#primary-fields');
  const detailSections = $('#detail-sections');
  const geometryInfo = $('#geometry-info');
  const alignBanner = $('#align-banner');
  const bindings = [];

  /* ---------------- 通用控件 ---------------- */

  function register(binding) {
    bindings.push(binding);
    return binding;
  }

  function afterChange(path) {
    updateGeometryInfo();
    updatePresetActive();
    onChange?.(path);
  }

  function switchControl({ path, label, wide }, container) {
    const wrap = el('div', { class: 'setting setting--switch' + (wide ? ' setting--wide' : '') });
    const lab = el('label', { class: 'switch' });
    const input = el('input', {
      type: 'checkbox', checked: !!getPath(getConfig(), path), dataset: { path },
    });
    const track = el('span', { class: 'switch__track' });
    lab.append(input, track, document.createTextNode(label));
    input.addEventListener('change', () => {
      setPath(getConfig(), path, input.checked);
      afterChange(path);
    });
    wrap.appendChild(lab);
    container.appendChild(wrap);
    register({ type: 'switch', path, input });
  }

  function segmentedControl({ path, label, options, wide }) {
    const wrap = el('div', { class: 'setting' + (wide ? ' setting--wide' : '') });
    wrap.appendChild(el('label', { class: 'setting__label', text: label }));
    const seg = el('div', {
      class: 'segmented', role: 'group', 'aria-label': label, dataset: { path },
    });
    const buttons = options.map(([value, text]) => {
      const btn = el('button', { type: 'button', text, dataset: { value } });
      btn.addEventListener('click', () => {
        setPath(getConfig(), path, value);
        buttons.forEach((b) => b.classList.toggle('is-active', b === btn));
        afterChange(path);
      });
      seg.appendChild(btn);
      return btn;
    });
    wrap.appendChild(seg);
    primaryFields.appendChild(wrap);
    register({ type: 'segmented', path, input: seg, buttons });
  }

  /* ---------------- 预设 ---------------- */

  function buildPresets() {
    clear(presetGrid);
    const config = getConfig();
    for (const preset of PRESETS) {
      const temp = applyPreset(cloneConfig(config), preset.id);
      const g = cardGeometry(temp);
      const dims = gridDims(temp);
      const card = el('button', {
        class: 'preset-card',
        type: 'button',
        dataset: { preset: preset.id, orientation: preset.orientation },
        title: `${preset.name} · ${preset.long} × ${preset.short}`,
      });
      const mini = el('span', { class: 'preset-mini', style: {
        backgroundSize: `${100 / dims.cols}% ${100 / dims.rows}%`,
      } });
      const text = el('span', { class: 'preset-text' }, [
        el('span', { class: 'preset-name', text: preset.name }),
        el('span', { class: 'preset-meta', text: `${preset.orientation === 'landscape' ? 'A4 横向' : 'A4 竖向'} · ${preset.long} × ${preset.short}` }),
        el('span', { class: 'preset-size', text: `${fmt(g.w)} × ${fmt(g.h)} mm` }),
      ]);
      card.append(mini, text);
      card.addEventListener('click', () => onPreset(preset.id));
      presetGrid.appendChild(card);
    }
    updatePresetActive();
  }

  function updatePresetActive() {
    const active = detectPreset(getConfig());
    for (const card of presetGrid.querySelectorAll('.preset-card')) {
      card.classList.toggle('is-active', card.dataset.preset === active);
    }
  }

  /* ---------------- 常规设置 ---------------- */

  function buildPrimary() {
    segmentedControl({
      path: 'page.orientation', label: '纸张方向', options: ORIENTATION_OPTIONS, wide: true,
    });

    const pairDims = el('div', { class: 'field-row' });
    primaryFields.appendChild(pairDims);

    const makeNumberIn = (container, cfg) => {
      const wrap = el('div', { class: 'setting' });
      const id = fieldId(cfg.path);
      const labelEl = el('label', { class: 'setting__label', for: id }, [
        el('span', { text: cfg.label }),
        el('em', { text: cfg.unit || '' }),
      ]);
      const input = el('input', {
        class: 'input',
        type: 'number',
        id,
        min: String(cfg.min),
        max: String(cfg.max),
        step: String(cfg.step),
        value: String(getPath(getConfig(), cfg.path)),
        dataset: { path: cfg.path },
      });
      input.addEventListener('input', () => {
        if (input.value === '') return;
        const n = Number(input.value);
        if (!Number.isFinite(n)) return;
        setPath(getConfig(), cfg.path, clamp(n, cfg.min, cfg.max));
        afterChange(cfg.path);
      });
      input.addEventListener('blur', () => {
        input.value = String(getPath(getConfig(), cfg.path));
      });
      wrap.append(labelEl, input);
      container.appendChild(wrap);
      register({ type: 'number', path: cfg.path, input });
    };

    makeNumberIn(pairDims, { path: 'grid.long', label: '长边张数', unit: '张', min: 1, max: MAX_GRID.long, step: 1 });
    makeNumberIn(pairDims, { path: 'grid.short', label: '短边张数', unit: '张', min: 1, max: MAX_GRID.short, step: 1 });

    const pairFont = el('div', { class: 'field-row' });
    primaryFields.appendChild(pairFont);
    makeNumberIn(pairFont, { path: 'front.size', label: '正面字号', unit: 'pt', min: 4, max: 96, step: 0.5 });
    makeNumberIn(pairFont, { path: 'back.size', label: '反面字号', unit: 'pt', min: 4, max: 96, step: 0.5 });

    // 安全区
    const safe = el('div', { class: 'safe-group' });
    const head = el('div', { class: 'safe-group__head' }, [
      el('span', { text: '安全区' }),
      el('em', { text: 'mm · 内容不进入' }),
    ]);
    const grid = el('div', { class: 'safe-grid' });
    const sides = [['top', '上'], ['right', '右'], ['bottom', '下'], ['left', '左']];
    for (const [side, label] of sides) {
      const cell = el('label', { class: 'safe-cell' }, [el('span', { text: label })]);
      const input = el('input', {
        type: 'number',
        min: '0',
        max: '50',
        step: '0.5',
        value: String(getPath(getConfig(), `card.safe.${side}`)),
        'aria-label': `安全区${label}`,
        dataset: { path: `card.safe.${side}` },
      });
      input.addEventListener('input', () => {
        if (input.value === '') return;
        const n = Number(input.value);
        if (!Number.isFinite(n)) return;
        setPath(getConfig(), `card.safe.${side}`, clamp(n, 0, 50));
        afterChange(`card.safe.${side}`);
      });
      input.addEventListener('blur', () => {
        input.value = String(getPath(getConfig(), `card.safe.${side}`));
      });
      cell.appendChild(input);
      grid.appendChild(cell);
      register({ type: 'number', path: `card.safe.${side}`, input });
    }
    safe.append(head, grid);
    primaryFields.appendChild(safe);

    const pairBottom = el('div', { class: 'field-row' });
    primaryFields.appendChild(pairBottom);
    // 背面版式
    const mirrorWrap = el('div', { class: 'setting' });
    mirrorWrap.appendChild(el('label', { class: 'setting__label', for: 'cfg-duplex-mirror', text: '背面版式' }));
    const mirrorSelect = el('select', {
      class: 'select', id: 'cfg-duplex-mirror', dataset: { path: 'duplex.mirror' },
    });
    for (const [value, text] of MIRROR_OPTIONS) mirrorSelect.appendChild(el('option', { value, text }));
    mirrorSelect.value = getConfig().duplex.mirror;
    mirrorSelect.addEventListener('change', () => {
      setPath(getConfig(), 'duplex.mirror', mirrorSelect.value);
      afterChange('duplex.mirror');
    });
    mirrorWrap.appendChild(mirrorSelect);
    pairBottom.appendChild(mirrorWrap);
    register({ type: 'select', path: 'duplex.mirror', input: mirrorSelect });

    // 附加信息开关
    const noteWrap = el('div', { class: 'setting setting--switch' });
    const noteLab = el('label', { class: 'switch' });
    const noteInput = el('input', {
      type: 'checkbox', checked: !!getConfig().note.show, dataset: { path: 'note.show' },
    });
    noteLab.append(noteInput, el('span', { class: 'switch__track' }), document.createTextNode('附加信息'));
    noteInput.addEventListener('change', () => {
      setPath(getConfig(), 'note.show', noteInput.checked);
      afterChange('note.show');
    });
    noteWrap.appendChild(noteLab);
    pairBottom.appendChild(noteWrap);
    register({ type: 'switch', path: 'note.show', input: noteInput });
  }

  /* ---------------- 细节分组 ---------------- */

  function buildDetails() {
    clear(detailSections);
    for (const group of DETAIL_GROUPS) {
      const details = el('details', { class: 'settings-details', dataset: { group: group.id } });
      const summary = el('summary', {}, [
        el('span', { text: group.title }),
        group.sub ? el('span', { class: 'details-sub', text: group.sub }) : null,
      ]);
      details.appendChild(summary);

      if (group.type === 'tips') {
        details.appendChild(el('ul', { class: 'print-tips' },
          PRINT_TIPS.map((tip) => el('li', { text: tip }))));
        detailSections.appendChild(details);
        continue;
      }

      const body = el('div', { class: 'details-body' });
      for (const item of group.items) {
        if (item.type === 'alignTest') {
          const wrap = el('div', { class: 'setting setting--wide' });
          const btn = el('button', {
            class: 'btn btn--block',
            type: 'button',
            id: 'align-test',
            text: isAlignTesting?.() ? '退出对位测试' : '打印一张对位测试',
          });
          btn.addEventListener('click', () => onAlignTest());
          wrap.appendChild(btn);
          body.appendChild(wrap);
          register({ type: 'alignButton', input: btn });
          continue;
        }
        if (item.type === 'switch') {
          switchControl(item, body);
          continue;
        }
        const wrap = el('div', { class: 'setting' + (item.wide ? ' setting--wide' : '') });
        const id = fieldId(item.path);
        wrap.appendChild(el('label', {
          class: 'setting__label',
          for: id,
          text: item.label,
          title: item.unit ? `单位：${item.unit}` : undefined,
        }));
        if (item.type === 'select') {
          const select = el('select', { class: 'select', id, dataset: { path: item.path } });
          for (const [value, text] of item.options) select.appendChild(el('option', { value, text }));
          select.value = String(getPath(getConfig(), item.path));
          select.addEventListener('change', () => {
            setPath(getConfig(), item.path, select.value);
            afterChange(item.path);
          });
          wrap.appendChild(select);
          register({ type: 'select', path: item.path, input: select });
        } else if (item.type === 'color') {
          const colorWrap = el('div', { class: 'color-control' });
          const input = el('input', {
            type: 'color',
            id,
            value: normalizeColor(getPath(getConfig(), item.path)),
            'aria-label': item.label,
            dataset: { path: item.path },
          });
          const hex = el('span', { class: 'color-hex', text: String(getPath(getConfig(), item.path)) });
          input.addEventListener('change', () => {
            setPath(getConfig(), item.path, input.value);
            hex.textContent = input.value;
            afterChange(item.path);
          });
          colorWrap.append(input, hex);
          wrap.appendChild(colorWrap);
          register({ type: 'color', path: item.path, input, hex });
        } else {
          const unit = item.unit ? el('em', { text: item.unit }) : null;
          const label = wrap.querySelector('.setting__label');
          if (unit) label.appendChild(unit);
          const input = el('input', {
            class: 'input',
            type: 'number',
            id,
            min: String(item.min),
            max: String(item.max),
            step: String(item.step),
            value: String(getPath(getConfig(), item.path)),
            dataset: { path: item.path },
          });
          input.addEventListener('input', () => {
            if (input.value === '') return;
            const n = Number(input.value);
            if (!Number.isFinite(n)) return;
            setPath(getConfig(), item.path, clamp(n, item.min, item.max));
            afterChange(item.path);
          });
          input.addEventListener('blur', () => {
            input.value = String(getPath(getConfig(), item.path));
          });
          wrap.appendChild(input);
          register({ type: 'number', path: item.path, input });
        }
        body.appendChild(wrap);
      }
      details.appendChild(body);
      detailSections.appendChild(details);
    }
  }

  /* ---------------- 同步 ---------------- */

  function updateGeometryInfo() {
    const config = getConfig();
    const g = cardGeometry(config);
    clear(geometryInfo);
    const cell = (label, value) => el('div', {}, [
      el('span', { text: label }),
      el('strong', { text: value }),
    ]);
    geometryInfo.append(
      cell('卡片', `${fmt(g.w)} × ${fmt(g.h)} mm`),
      cell('内容区', `${fmt(g.textW)} × ${fmt(g.textH)} mm`),
      cell('每页', `${g.perPage} 张`),
    );
  }

  function updateAlignState() {
    const active = !!isAlignTesting?.();
    alignBanner.hidden = !active;
    const btn = $('#align-test');
    if (btn) btn.textContent = active ? '退出对位测试' : '打印一张对位测试';
  }

  function sync() {
    const config = getConfig();
    for (const binding of bindings) {
      if (binding.type === 'alignButton') continue;
      const value = getPath(config, binding.path);
      if (binding.type === 'number') {
        binding.input.value = String(value);
      } else if (binding.type === 'select') {
        binding.input.value = String(value);
      } else if (binding.type === 'switch') {
        binding.input.checked = !!value;
      } else if (binding.type === 'color') {
        binding.input.value = normalizeColor(value);
        if (binding.hex) binding.hex.textContent = String(value);
      } else if (binding.type === 'segmented') {
        binding.buttons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.value === String(value)));
      }
    }
    updatePresetActive();
    updateGeometryInfo();
    updateAlignState();
  }

  function normalizeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : '#000000';
  }

  function build() {
    buildPresets();
    buildPrimary();
    buildDetails();
    updateGeometryInfo();
    updateAlignState();
  }

  build();

  return { sync, updateAlignState, updateGeometryInfo };
}
