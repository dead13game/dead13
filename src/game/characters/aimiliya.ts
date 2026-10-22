import { PENDING } from "../flow/pending.js";
import { unitByUid } from "../core/units.js";
import { baseCanUse, enemyHeroUids, answerUid } from "./helpers.js";
import type { CharacterDef } from "../types.js";

// 爱蜜莉雅 · 冻结:冻结一名对象,使其跳过下一次行动,一局 2 次
export default {
  id: 10,
  meta: {
    id: 10,
    name: "爱蜜莉雅",
    title: "冻结",
    icon: "./images/爱蜜莉雅.png",
    hp: 12,
    speed: 9,
    skillName: "冻结",
    skillType: "active",
    skillDesc: "冻结一名对象，使其跳过下一次行动，一局2次",
    maxUses: 2,
    loadMaxUses: 0,
  },
  stateSchema: {},

  canUse: baseCanUse,

  use(ctx, player) {
    player.resources.skillUses--;
    ctx.ask({
      type: PENDING.TARGET,
      purpose: "skill:aimiliya.freeze",
      asker: player.uid,
      options: enemyHeroUids(ctx, player),
      data: null,
    });
    ctx.log(`${player.name} 释放冻结`);
  },

  onAnswer(ctx, player, pending, answer) {
    const target = unitByUid(ctx.state, answerUid(answer));
    if (!target?.alive) return;

    target.effects.frozenBy = player.uid;
    // 冻结可以打断薇斯纳的连击
    if (target.characterId === 16) target.char.attackStreak = 0;
    ctx.log(`${target.name} 被冻结，将跳过下一次行动`);
    ctx.turn.extra();
  },
} satisfies CharacterDef;
