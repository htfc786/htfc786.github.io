/* ============================================================
 * constants.js —— 共享常量
 * 只放纯数据，不碰 DOM，方便单元测试和复用。
 * ============================================================ */

export const FONT_STACKS = {
  sans: '"Noto Sans SC","Source Han Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
  serif: '"Noto Serif SC","Source Han Serif SC","Songti SC",SimSun,serif',
  kai: 'KaiTi,STKaiti,"Kaiti SC",serif',
  mono: 'ui-monospace,Consolas,"Courier New",monospace',
};

export const FONT_OPTIONS = [
  ['sans', '无衬线（黑体）'],
  ['serif', '衬线（宋体）'],
  ['kai', '楷体'],
  ['mono', '等宽'],
];

export const WEIGHT_OPTIONS = [
  ['400', '常规'],
  ['500', '中等'],
  ['700', '加粗'],
];

export const ALIGN_OPTIONS = [
  ['left', '左对齐'],
  ['center', '居中'],
  ['right', '右对齐'],
  ['justify', '两端对齐'],
];

export const BLOCK_ALIGN_OPTIONS = [
  ['center', '居中'],
  ['left', '靠左'],
  ['right', '靠右'],
];

export const VALIGN_OPTIONS = [
  ['center', '居中'],
  ['top', '靠上'],
  ['bottom', '靠下'],
];

export const MIRROR_OPTIONS = [
  ['flipX', '左右镜像'],
  ['flipY', '上下镜像'],
  ['rot180', '旋转 180°'],
  ['none', '不镜像'],
];

export const ORIENTATION_OPTIONS = [
  ['portrait', 'A4 竖向'],
  ['landscape', 'A4 横向'],
];

export const BORDER_OPTIONS = [
  ['dashed', '虚线'],
  ['solid', '实线'],
  ['dotted', '点线'],
  ['none', '不显示'],
];

export const NOTE_POSITION_OPTIONS = [
  ['back', '反面'],
  ['front', '正面'],
  ['both', '两面'],
];

export const PAGE_SIZES = {
  portrait: { w: 210, h: 297, label: 'A4 竖向', longEdge: 297, shortEdge: 210 },
  landscape: { w: 297, h: 210, label: 'A4 横向', longEdge: 297, shortEdge: 210 },
};

export const MAX_GRID = { long: 24, short: 12 };
