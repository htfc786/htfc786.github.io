/* ============================================================
 * cards.js —— 卡片数据模型
 * 规范字段：front / back / content / i（i 可选）
 * 兼容 zzti-web 的 q / ans / con 以及常见的 word / meaning 命名。
 * ============================================================ */

export const CARD_ALIASES = {
  front: ['front', 'word', 'term', 'q', 'question', '正面', '单词', '词条'],
  back: ['back', 'meaning', 'definition', 'ans', 'answer', '反面', '释义', '意思', '翻译', '答案'],
  content: ['content', 'note', 'remark', 'con', 'extra', '附加信息', '备注', '注释', '音标', '词性', '短语'],
  i: ['i', 'index', 'no', 'no.', '#', '序号', '编号', '顺序'],
};

const ALIAS_LOOKUP = Object.fromEntries(
  Object.entries(CARD_ALIASES).flatMap(([field, names]) => names.map((n) => [n.toLowerCase(), field]))
);

export function unescapeNL(value) {
  return String(value ?? '').replace(/\\n/g, '\n');
}

export function escapeNL(value) {
  return String(value ?? '').replace(/\n/g, '\\n');
}

/** 清洗文本：统一换行、去掉首尾空白、把字面量 \n 变成真换行。 */
export function normalizeText(value, { keepOuter = false } = {}) {
  let text = unescapeNL(value).replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return keepOuter ? text : text.trim();
}

export function toIndex(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function pickField(raw, field) {
  if (!raw || typeof raw !== 'object') return undefined;
  if (raw[field] !== undefined && raw[field] !== null) return raw[field];
  for (const [key, value] of Object.entries(raw)) {
    if (ALIAS_LOOKUP[key.trim().toLowerCase()] === field && value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

/** 任意来源的一条数据 → 规范卡片。 */
export function normalizeCard(raw) {
  if (!raw || typeof raw !== 'object') {
    return { front: normalizeText(raw), back: '', content: '', i: null };
  }
  return {
    front: normalizeText(pickField(raw, 'front')),
    back: normalizeText(pickField(raw, 'back')),
    content: normalizeText(pickField(raw, 'content')),
    i: toIndex(pickField(raw, 'i')),
  };
}

export function normalizeCards(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeCard).filter((card) => card.front || card.back || card.content);
}

/** 卡片上印的序号：优先用 i；没有 i 时按当前顺序从 1 开始。 */
export function cardNumber(card, ordinal) {
  return card && Number.isFinite(card.i) ? card.i : ordinal;
}

export function serializeCard(card) {
  const out = {
    front: card.front || '',
    back: card.back || '',
    content: card.content || '',
  };
  if (Number.isFinite(card.i)) out.i = card.i;
  return out;
}

export function serializeCards(cards) {
  return (cards || []).map(serializeCard);
}

export function cardsToJSON(cards, space = 2) {
  return JSON.stringify(serializeCards(cards), null, space);
}

/** 老 demo 的纯文本格式：每行 正面 | 反面 | 附加信息。 */
export function parsePlainText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*[|｜\t]\s*/);
      return {
        front: normalizeText(parts[0]),
        back: normalizeText(parts[1]),
        content: normalizeText(parts[2]),
        i: null,
      };
    })
    .filter((card) => card.front || card.back);
}

export function cardsToPlainText(cards) {
  return (cards || []).map((card) => {
    const parts = [escapeNL(card.front), escapeNL(card.back), escapeNL(card.content)];
    while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
    return parts.join(' | ');
  }).join('\n');
}
