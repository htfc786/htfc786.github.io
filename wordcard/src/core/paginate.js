/* ============================================================
 * paginate.js —— 卡片 → 一页一页
 * 输出顺序天然是 正面1、反面1、正面2、反面2 …… 正好双面打印。
 * ============================================================ */
import { cardNumber } from './cards.js';
import { cardGeometry, mirrorIndex, isBackMirrored } from './geometry.js';

function cellOf(card, order, num, config, side) {
  const noteOn = config.note.show &&
    (config.note.position === 'both' || config.note.position === side);
  return {
    order,
    num: config.extras.cardNum ? String(num) : '',
    cardI: Number.isFinite(card.i) ? card.i : null,
    main: card[side] || '',
    field: side,
    note: noteOn ? (card.content || '') : '',
    showNote: noteOn,
  };
}

export function paginate(cards, config) {
  const g = cardGeometry(config);
  const per = g.perPage;
  const sheets = [];

  for (let start = 0; start < cards.length; start += per) {
    const chunkIndex = start / per;
    const front = new Array(per).fill(null);
    const back = new Array(per).fill(null);

    cards.slice(start, start + per).forEach((card, i) => {
      const ordinal = start + i + 1;
      const num = cardNumber(card, ordinal);
      front[i] = cellOf(card, i, num, config, 'front');
      back[mirrorIndex(i, g.cols, g.rows, config.duplex.mirror)] =
        cellOf(card, i, num, config, 'back');
    });

    sheets.push({
      side: 'front',
      pageNo: chunkIndex * 2 + 1,
      cells: front,
      mirrored: false,
    });
    sheets.push({
      side: 'back',
      pageNo: chunkIndex * 2 + 2,
      cells: back,
      mirrored: isBackMirrored(config, 'back') && config.duplex.mirror !== 'none',
    });
  }
  return sheets;
}
