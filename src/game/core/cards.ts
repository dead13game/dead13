// 牌与牌堆 — 纯函数,随机源显式传入
//
// 与旧 deck.js 的算法逐行等价(洗牌循环方向、抽牌用 pop),这是差分对拍的前提:
// 任何"更优雅"的洗牌都会让基线全红。

import { SUITS, RANKS, RANK_VALUES } from "./constants.js";
import type { Card, Rng } from "../types.js";

/** 一副牌(52 张,无大小王) */
export function createDeck(): Card[] {
  const cards: Card[] = [];
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
export function createFullDeck(numDecks = 2): Card[] {
  let deck: Card[] = [];
  for (let i = 0; i < numDecks; i++) deck = deck.concat(createDeck());
  return deck;
}

/** Fisher-Yates,方向与旧实现一致 */
export function shuffle<T>(deck: readonly T[], rng: Rng): T[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 从牌堆顶抽 n 张(pop = 牌堆顶在数组尾部) */
export function draw(
  deck: readonly Card[],
  n = 1,
): { drawn: Card[]; remaining: Card[] } {
  const drawn: Card[] = [];
  const remaining = [...deck];
  for (let i = 0; i < n && remaining.length > 0; i++) {
    drawn.push(remaining.pop()!);
  }
  return { drawn, remaining };
}

/**
 * 牌库重构:把墓地洗成新牌库。
 * 旧实现调用方负责清空墓地(ensureDeck),这里保持一致,不做隐式清空。
 */
export function reshuffleFromGrave<T extends { id: string }>(
  grave: readonly T[],
  rng: Rng,
  excludeIds: string[] = [],
): T[] {
  const eligible = grave.filter((c) => !excludeIds.includes(c.id));
  return shuffle(eligible, rng);
}

/** 牌面文案 */
export function display(card: Pick<Card, "rank" | "suit"> | null | undefined): string {
  if (!card) return "无牌";
  return `${card.rank}${card.suit}`;
}

// ── 兼容别名 ──
// 单机模式(solo/)仍用旧名字调用;它不在本次重构范围内,
// 这里提供薄别名,避免为了几个 import 去动那套逻辑。新代码请直接用上面的名字。
const defaultRng: Rng = {
  next: () => Math.random(),
  int: (n: number) => Math.floor(Math.random() * n),
  pick: <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p: number) => Math.random() < p,
};

export function shuffleDeck(deck: Card[]): Card[] {
  return shuffle(deck, defaultRng);
}

export function drawCards(deck: Card[], n = 1) {
  return draw(deck, n);
}

export const cardDisplay = display;

/** 复制一张牌(避免共享引用穿越存档/快照) */
export function cloneCard<T extends Card>(card: T | null): T | null {
  return card ? { ...card } : null;
}
