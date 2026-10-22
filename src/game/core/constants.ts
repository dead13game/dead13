// 阶段 / 步骤 / 月相常量
//
// 注意:STEP 的字符串值必须与旧实现完全一致 ——
// UI 模板( ActionBar 的 v-if )、动画桥接( watch step )都靠这些字面量。
// 新内核把 step 变成「pending 的派生量」(见 flow/pending.js),但对外字符串不变。

import type { Rank, Suit } from "../types.js";

export const SUITS = ["♠", "♥", "♦", "♣"] as const satisfies readonly Suit[];

export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const satisfies readonly Rank[];

export const RANK_VALUES: Record<Rank, number> = {
  A: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  J: 11,
  Q: 12,
  K: 13,
};

export const PHASE = {
  SETUP: "setup",
  PEACE: "peace",
  NORMAL: "normal",
  GAME_OVER: "gameOver",
} as const;

export const STEP = {
  PICK_ACTION: "pickAction",
  PICK_TARGET: "pickTarget",
  ATTACK_SHOW_CARD: "attackShowCard",
  GAMBLE_PICK: "gamblePick",
  SKILL_PICK_TARGET: "skillPickTarget",
  SKILL_NAHIDA: "skillNahida",
  LINIYA_PICK: "liniyaPick",
  CAIYUEANG_PICK: "caiyueangPick",
  ALLY_PICK: "allyPick",
  ANIMATING: "animating",
} as const;

export const MOON_NAMES = ["弦月", "满月", "新月"];
