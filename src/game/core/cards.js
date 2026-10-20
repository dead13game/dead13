// 牌与牌堆 — 纯函数,随机源显式传入
//
// 与旧 deck.js 的算法逐行等价(洗牌循环方向、抽牌用 pop),这是差分对拍的前提:
// 任何"更优雅"的洗牌都会让基线全红。

import { SUITS, RANKS, RANK_VALUES } from "./constants.js";

/** 一副牌(52 张,无大小王) */
export function createDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
        value: RANK_VALUES[rank],
        faceUp: false,
      });
    }
  }
  return cards;
}

/** n 副牌混在一起(不洗) */
export function createFullDeck(numDecks = 2) {
  let deck = [];
  for (let i = 0; i < numDecks; i++) deck = deck.concat(createDeck());
  return deck;
}

/** Fisher-Yates,方向与旧实现一致 */
export function shuffle(deck, rng) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 从牌堆顶抽 n 张(pop = 牌堆顶在数组尾部) */
export function draw(deck, n = 1) {
  const drawn = [];
  const remaining = [...deck];
  for (let i = 0; i < n && remaining.length > 0; i++) {
    drawn.push(remaining.pop());
  }
  return { drawn, remaining };
}

/**
 * 牌库重构:把墓地洗成新牌库。
 * 旧实现调用方负责清空墓地(ensureDeck),这里保持一致,不做隐式清空。
 */
export function reshuffleFromGrave(grave, rng, excludeIds = []) {
  const eligible = grave.filter((c) => !excludeIds.includes(c.id));
  return shuffle(eligible, rng);
}

/** 牌面文案 */
export function display(card) {
  if (!card) return "无牌";
  return `${card.rank}${card.suit}`;
}

/** 复制一张牌(避免共享引用穿越存档/快照) */
export function cloneCard(card) {
  return card ? { ...card } : null;
}
