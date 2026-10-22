import { PHASE } from "../core/constants.js";
import { PENDING } from "../flow/pending.js";
import { CAT } from "../core/log.js";
import { applyDamage } from "../rules/damage.js";
import { unitByUid } from "../core/units.js";
import { baseCanUse, withTurnGate, enemyTargetUids, answerUid } from "./helpers.js";
import type { CharacterDef } from "../types.js";

// 风堇 · 重见澄澈晴空:生命上限 +3 并回满,对一名玩家造成回复量×2 的伤害
// 被动:消耗陷阱/防御牌时回复 1 点生命
export default {
  id: 8,
  meta: {
    id: 8,
    name: "风堇",
    title: "重见澄澈晴空",
    icon: "./images/风堇.jpg",
    hp: 11,
    speed: 10,
    skillName: "重见澄澈晴空",
    skillType: "active",
    skillDesc:
      "提高3点生命上限并回满，对一名玩家造成回复量×2的伤害。被动：消耗陷阱/防御牌时回复1点生命",
    maxUses: 1,
    loadMaxUses: 0,
  },
  stateSchema: {},

  canUse: baseCanUse,
  canUseNow: withTurnGate(baseCanUse, { requireNormal: true }),

  use(ctx, player) {
    if (ctx.state.phase === PHASE.PEACE) {
      ctx.log("和平阶段禁止攻击");
      return;
    }
    player.resources.skillUses--;
    ctx.ask({
      type: PENDING.TARGET,
      purpose: "skill:fenjin",
      asker: player.uid,
      options: enemyTargetUids(ctx, player),
      data: null,
    });
    ctx.log(`${player.name} 释放重见澄澈晴空`);
  },

  onAnswer(ctx, player, pending, answer) {
    const target = unitByUid(ctx.state, answerUid(answer));
    if (!target?.alive) return;

    const oldMaxHp = player.maxHp;
    player.maxHp += 3;
    const healAmount = player.maxHp - player.hp;
    player.hp = player.maxHp;
    const damage = healAmount * 2;

    ctx.dev(
      "skill",
      `风堇重见澄澈晴空: 生命上限${oldMaxHp}→${player.maxHp} 回复${healAmount} 伤害=${damage}`,
      {
        maxHpChange: `${oldMaxHp}→${player.maxHp}`,
        healAmount,
        damage,
        target: target.name,
        targetHpBefore: target.hp,
      },
    );

    ctx.log(
      `${player.name} 生命上限 ${oldMaxHp}→${player.maxHp}，回复 ${healAmount} 点`,
    );
    ctx.log(`对 ${target.name} 造成 ${damage} 点伤害`);
    applyDamage(ctx, { target, amount: damage });
    ctx.turn.pass();
  },

  hooks: {
    /** 被动:攻击时消耗了目标陷阱或击穿防御 → 回复等量生命(上限为 maxHp) */
    onDamageDealt(ctx, env) {
      const { attacker, defenseConsumed, trapTriggered, hadTrap } = env;
      if (attacker.characterId !== 8) return;

      let healCount = 0;
      if (hadTrap && !trapTriggered) healCount++;
      healCount += defenseConsumed;
      if (healCount <= 0) return;

      const hpBeforeHeal = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + healCount);
      ctx.log(
        `${attacker.name} 风堇被动回复 ${healCount} 点（当前 HP ${attacker.hp}）`,
      );
      ctx.dev(
        CAT.SKILL,
        `风堇被动回复 ${healCount} 点: ${hpBeforeHeal}→${attacker.hp}`,
        { healCount, trapBreak: hadTrap && !trapTriggered, defConsumed: defenseConsumed },
      );
    },
  },
} satisfies CharacterDef;
