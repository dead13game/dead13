import { PHASE } from "../core/constants.js";
import { PENDING } from "../flow/pending.js";
import { CAT } from "../core/log.js";
import { applyDamage } from "../rules/damage.js";
import { unitByUid } from "../core/units.js";
import { baseCanUse, withTurnGate, otherUnitUids } from "./helpers.js";
import type { CharacterDef } from "../types.js";

/**
 * 莉奈娅的作答形状（命令层写入，见 docs/classic-refactor-plan.md §4.4）：
 * `{ targetUid, subSkill }` —— subSkill 1 = 偷防御牌，2 = DoT。
 */
interface LiniyaAnswer {
  targetUid: number;
  subSkill: number;
}

// 莉奈娅 · 青春之力的馈赠
//   子技能 1:偷取目标防御牌 3 回合,对其伤害永久 +2
//   子技能 2:每回合 5 点 DoT(无视陷阱)持续 5 回合
export default {
  id: 9,
  meta: {
    id: 9,
    name: "莉奈娅",
    title: "青春之力的馈赠",
    icon: "./images/莉奈娅.jpg",
    hp: 12,
    speed: 9,
    skillName: "青春之力的馈赠",
    skillType: "active",
    skillDesc:
      "技能一：偷取指定角色防御牌3回合，对其伤害永久+2。技能二：每回合5点DoT伤害无视陷阱持续5回合",
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
      type: PENDING.LINIYA,
      purpose: "skill:liniya",
      asker: player.uid,
      options: otherUnitUids(ctx, player),
      data: { subSkills: [1, 2] },
    });
    ctx.log(`${player.name} 释放青春之力的馈赠，选择子技能和目标`);
  },

  onAnswer(ctx, player, pending, answer) {
    // 作答来自命令层（外部输入）：收窄成 `{ targetUid, subSkill }` 后照旧读取
    const ans = answer as LiniyaAnswer;
    const target = unitByUid(ctx.state, ans.targetUid);
    if (!target?.alive) return;

    if (ans.subSkill === 1) {
      player.effects.stealTarget = { uid: target.uid, turns: 3 };
      player.effects.damageBonus[target.uid] =
        (player.effects.damageBonus[target.uid] || 0) + 2;
      ctx.log(
        `${player.name} 偷取 ${target.name} 的防御牌（3回合），对其伤害+2`,
      );
    } else {
      player.effects.dotTarget = { uid: target.uid, turns: 5 };
      ctx.log(
        `${player.name} 对 ${target.name} 施加5回合DoT（每回合5点无视陷阱）`,
      );
    }

    ctx.turn.pass();
  },

  hooks: {
    /** 回合开始:先结算 DoT,再结算偷牌(与旧 nextPlayer 的 per-player 顺序一致) */
    onRoundStart(ctx, player) {
      if (!player.alive) return;
      const { effects } = player;

      if (effects.dotTarget && effects.dotTarget.turns > 0) {
        const target = unitByUid(ctx.state, effects.dotTarget.uid);
        if (target?.alive) {
          ctx.log(`${target.name} 受到莉奈娅DoT 5点伤害（无视陷阱）`);
          ctx.dev(CAT.DAMAGE, `莉奈娅DoT: ${player.name} → ${target.name} 5点伤害`, {
            remaining: effects.dotTarget.turns - 1,
          });
          applyDamage(ctx, { target, amount: 5 });
          effects.dotTarget.turns--;
          if (effects.dotTarget.turns <= 0) effects.dotTarget = null;
        } else {
          effects.dotTarget = null;
        }
      }

      if (effects.stealTarget && effects.stealTarget.turns > 0) {
        const target = unitByUid(ctx.state, effects.stealTarget.uid);
        if (target?.alive && target.defensePile.length > 0) {
          // length > 0 已保证 pop() 有值，`!` 只做类型收窄
          const stolen = target.defensePile.pop()!;
          stolen.faceUp = true;
          player.defensePile.push(stolen);
          ctx.log(`${player.name} 偷取了 ${target.name} 的防御牌`);
        }
        effects.stealTarget.turns--;
        if (effects.stealTarget.turns <= 0) effects.stealTarget = null;
      }
    },
  },
} satisfies CharacterDef;
