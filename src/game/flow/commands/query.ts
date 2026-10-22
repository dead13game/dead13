// 命令层 · query — 由 flow/commands.js 拆分而来（纯搬运，行为不变）
import { getCharData, getCharacter } from "../../characters/index.js";

// ════════════════════════════════════════
//  查询
// ════════════════════════════════════════

/** 主动技能可用性(对齐旧 canUseSkill —— 引擎口径,不要往里加回合门槛) */
export function canUseSkill(ctx, player) {
  const meta = getCharData(player);
  if (!meta || meta.skillType !== "active") return false;
  const def = getCharacter(player.characterId);
  if (!def?.canUse) return false;
  return def.canUse(ctx, player);
}

/**
 * UI/AI 口径:在引擎口径之上叠加回合/阶段门槛(KB-3)。
 * 引擎命令层仍用 canUseSkill,保证差分回放与旧实现一致。
 */
export function canUseSkillNow(ctx, player) {
  const meta = getCharData(player);
  if (!meta || meta.skillType !== "active") return false;
  const def = getCharacter(player.characterId);
  if (!def?.canUse) return false;
  const fn = def.canUseNow ?? def.canUse;
  return fn(ctx, player);
}

/** 是否处于行动步(旧 state.step === "pickAction") */
export function isIdle(ctx) {
  return ctx.state.pending == null && !ctx.state.gameOver;
}
