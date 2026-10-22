import { PHASE } from "../core/constants.js";
import { PENDING } from "../flow/pending.js";
import { applyDamage } from "../rules/damage.js";
import { unitByUid } from "../core/units.js";
import { baseCanUse, withTurnGate, enemyTargetUids } from "./helpers.js";

// 雷电将军 · 无想的一刀:造成 27 点伤害(第 10 回合解锁)
export default {
  id: 3,
  meta: {
    id: 3,
    name: "雷电将军",
    title: "雷神·巴尔泽布",
    icon: "./images/雷电将军.jpg",
    hp: 11,
    speed: 10,
    skillName: "无想的一刀",
    skillType: "active",
    skillDesc: "造成27点伤害（第10回合解锁）",
    maxUses: 1,
    loadMaxUses: 0,
  },
  stateSchema: {},

  canUse: baseCanUse,
  canUseNow: withTurnGate(baseCanUse, { minRound: 10, requireNormal: true }),

  use(ctx, player) {
    const { state } = ctx;
    if (state.phase === PHASE.PEACE) {
      ctx.log("和平阶段禁止攻击");
      return;
    }
    if (state.round < 10) {
      ctx.log("第10回合后才能使用");
      return;
    }

    ctx.ask({
      type: PENDING.TARGET,
      purpose: "skill:raiden",
      asker: player.uid,
      options: enemyTargetUids(ctx, player),
    });
    ctx.log(`${player.name} 释放无想的一刀`);
  },

  onAnswer(ctx, player, pending, answer) {
    const target = unitByUid(ctx.state, answer);
    if (!target?.alive) return;

    player.resources.skillUses--;
    const baseDamage = 27;
    let damage = baseDamage;
    const bonuses = {};

    if (ctx.state.currentWeather === "sun") {
      damage += 2;
      bonuses.sun = 2;
    }
    if (player.characterId === 6 && player.char.fightingSpirit > 0) {
      bonuses.spirit = player.char.fightingSpirit;
      damage += player.char.fightingSpirit;
    }

    ctx.dev(
      "skill",
      `雷电将军 无想一刀: ${player.name}→${target.name} 伤害=${damage}`,
      {
        baseDamage,
        bonuses,
        finalDamage: damage,
        targetHpBefore: target.hp,
      },
    );

    ctx.log(`${player.name} 无想的一刀 ➜ ${target.name}`);
    applyDamage(ctx, { target, amount: damage });
    player.effects.ignoreTrapThisTurn = false;
    ctx.turn.pass();
  },
};
