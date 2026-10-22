// pending.data 的收窄工具
//
// types.ts 把 PendingData 定为 Record<string, unknown>（形状随 purpose 变化）。
// 命令层写入的载荷是已知的（cards: Card[] / card: Card / total: number …），
// 读取端统一在这里做一次结构化收窄，避免各处散落 `as`。
//
// 注意：这里只排除「非对象」，不逐字段校验 —— 载荷都来自本目录的写入点，
// 加逐字段校验只会把热路径变慢，而不会更安全。

import type { Card, Ctx, Pending, PendingData } from "../../types.js";

/** 是否是牌（对象即视为牌，见上面的取舍） */
export function isCard(value: unknown): value is Card {
  return typeof value === "object" && value !== null;
}

/**
 * 命令层提交待决问题。
 *
 * Pending 契约把 data / options 声明为必填，但命令层旧实现有些 pending 不写这两个键
 * （结盟、调查、赌命）。为了不改变 pending 内容（差分回放盯着字段集合），
 * 这里只做一次类型断言，运行时原样交给 ctx.ask。
 */
export function askPending(
  ctx: Ctx,
  pending: Omit<Pending, "data" | "options"> & {
    data?: PendingData;
    options?: number[];
  },
): Pending {
  return ctx.ask(pending as Pending);
}

/** pending.data.cards（attack / gamble 写入的牌数组） */
export function pendingCards(data: PendingData | null): Card[] {
  const raw = data?.cards;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isCard);
}

/** pending.data.card（defense.support 写入的单张防御牌） */
export function pendingCard(data: PendingData | null): Card | null {
  const raw = data?.card;
  return isCard(raw) ? raw : null;
}

/** pending.data[key] 的数字读取（类型不符时返回 null，由调用方回退） */
export function pendingNumber(data: PendingData | null, key: string): number | null {
  const raw = data?.[key];
  return typeof raw === "number" ? raw : null;
}
