// 命令层 · misc — 由 flow/commands.js 拆分而来（纯搬运，行为不变）
import { executeHolyWord } from "../../rules/artifacts.js";
import { resetAttackStreak } from "../../characters/helpers.js";
import type { Ctx } from "../../types.js";

// ════════════════════════════════════════
//  圣言 / 取消
// ════════════════════════════════════════

export function holyWord(ctx: Ctx): boolean {
  const player = ctx.players.current();
  if (player) {
    resetAttackStreak(player);
    player.relations.consecutiveGambles = 0;
  }
  return executeHolyWord(ctx);
}

/** 取消当前待决(替代 UI 直接改 step + 手清私有 flag,顺带修掉 KB-2) */
export function cancel(ctx: Ctx): boolean {
  const state = ctx.state;
  const player = ctx.players.current();
  if (player) resetAttackStreak(player);
  state.pendingAttackCard = null;
  state.pendingVentiCards = null;
  state.pendingGamble = null;
  state.scryCards = null;
  ctx.clearPending();
  return true;
}
