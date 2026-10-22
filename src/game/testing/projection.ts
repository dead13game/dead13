// 差分对拍:状态投影
//
// 投影 = 「可观察行为」的规范化快照。等价性以投影为准,不是以内存对象为准。
// 规则:
//   - 含:一切影响后续判定的字段(HP/牌堆/资源/效果/关系/阶段/待决)
//   - 不含:调试日志、纯视觉字段、时间戳/随机序号
//   - 牌堆用 长度 + 顺序哈希 + 首尾采样,避免基线文件膨胀

import type { Card } from "../types.js";

const CARD_HASH_BASE = 0x811c9dc5;

/**
 * 可投影的牌。
 * 合成盾牌(钟离护盾/无人机盾…)在运行期会挂 defenseValue / isShield,
 * 它们不在 Card 契约里,但对拍基线记录了这两个字段。
 */
export type ProjectedCard = Card & {
  defenseValue?: number | null;
  isShield?: boolean;
};

/** 单张牌的投影:只保留影响判定的字段 */
export type CardProjection = unknown[];

/** 牌堆投影:长度 + 顺序哈希 + 首尾各 2 张采样 */
export interface DeckProjection {
  n: number;
  h: number;
  head: (CardProjection | null)[];
  tail: (CardProjection | null)[];
}

function fnv1a(str: string, h = CARD_HASH_BASE): number {
  let hash = h;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 归一化时间/随机 id:'shield-zhongli-1792501174918' → 'shield-zhongli' */
function normId(id: unknown): unknown {
  if (typeof id !== "string") return id;
  return id.replace(/-\d{9,}$/, "").replace(/\d{10,}/g, "#");
}

/**
 * Infinity / NaN 不能存活于 JSON(会变成 null),
 * 而 6/7 号角色 maxUses: Infinity 是合法数据 → 统一转成字符串标记。
 */
function normalizeNumbers(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalizeNumbers);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) {
      out[k] = normalizeNumbers((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  if (typeof v === "number" && !Number.isFinite(v)) return String(v);
  return v;
}

function projCard(card: ProjectedCard | null | undefined): CardProjection | null {
  if (!card) return null;
  return [
    normId(card.id),
    card.value,
    card.defenseValue ?? null,
    card.faceUp ? 1 : 0,
    card.isShield ? 1 : 0,
  ];
}

/** 牌堆投影:长度 + 顺序哈希 + 首尾各 2 张采样 */
function projDeck(
  cards: readonly ProjectedCard[] | null | undefined,
): DeckProjection {
  if (!Array.isArray(cards)) return { n: 0, h: 0, head: [], tail: [] };
  let h = CARD_HASH_BASE;
  for (const c of cards) h = fnv1a(JSON.stringify(projCard(c)), h);
  return {
    n: cards.length,
    h,
    head: cards.slice(0, 2).map(projCard),
    tail: cards.slice(-2).map(projCard),
  };
}

/** 归一化投影工具(供 projection-next 复用) */
export { projCard, projDeck, normId, fnv1a, normalizeNumbers };
