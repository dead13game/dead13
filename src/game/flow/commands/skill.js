// 命令层 · skill — 由 flow/commands.js 拆分而来（纯搬运，行为不变）
import { CAT } from "../../core/log.js";
import { getCharData, getCharacter } from "../../characters/index.js";
import { resetAttackStreak } from "../../characters/helpers.js";
import { canUseSkill, isIdle } from "./query.js";

export function skill(ctx) {
  const state = ctx.state;
  if (!isIdle(ctx)) return false;
  const player = ctx.players.current();

  if (!canUseSkill(ctx, player)) {
    ctx.devWarn(
      CAT.ANOMALY,
      `${player.name} 尝试使用技能但 canUseSkill=false`,
      {
        skillUses: player.resources.skillUses,
        skillType: getCharData(player)?.skillType,
        weather: state.currentWeather,
        step: state.step,
      },
    );
    return false;
  }

  if (player.relations.consecutiveGambles > 0) {
    player.relations.consecutiveGambles = 0;
  }
  resetAttackStreak(player);

  ctx.sound("skill");
  ctx.dev(CAT.SKILL, `${player.name} 释放技能: ${getCharData(player).skillName}`, {
    characterId: player.characterId,
    skillUsesBefore: player.resources.skillUses,
  });

  const def = getCharacter(player.characterId);
  def.use(ctx, player);
  return true;
}

/** 作答:把 pending 交给发起者的插件处理 */
export function skillAnswer(ctx, answer) {
  const state = ctx.state;
  const pending = state.pending;
  if (!pending) return false;

  const asker = ctx.players.byUid(pending.asker);
  if (!asker) return false;
  const def = getCharacter(asker.characterId);
  if (!def?.onAnswer) return false;

  def.onAnswer(ctx, asker, pending, answer);
  return true;
}

// ════════════════════════════════════════
//  结盟 / 背刺
// ════════════════════════════════════════
