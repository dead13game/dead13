import { PHASE } from "../core/constants.js";
import { PENDING } from "../flow/pending.js";
import { unitByUid } from "../core/units.js";
import { baseCanUse, friendlyUnitUids, answerUid } from "./helpers.js";
import type { Card, CharacterDef, Ctx } from "../types.js";

/**
 * 合成护盾牌：只有点数，suit/rank 是战报 `display()` 用的占位文案（迁移前就有）。
 *
 * Card 的 suit/rank 只描述扑克牌（见 types.ts），所以先用合法字段建牌，
 * 再用 Object.assign 写入占位文案 —— 既保持运行时数据与迁移前一致，
 * 又不需要放宽 Card 的类型。
 */
function shieldCard(ctx: Ctx, value: number): Card {
  const card: Card = {
    id: ctx.uniqueId("shield-zhongli"),
    value,
    faceUp: true,
    isShield: true,
  };
  return Object.assign(card, { suit: "", rank: "盾" });
}

// 钟离 · 坚如磐石:获得 18 + 已损失生命×2 的护盾
export default {
  id: 2,
  meta: {
    id: 2,
    name: "钟离",
    title: "岩神·摩拉克斯",
    icon: "./images/钟离.jpg",
    hp: 12,
    speed: 9,
    skillName: "坚如磐石",
    skillType: "active",
    skillDesc: "获得 18+已损失生命值×2 的护盾",
    maxUses: 1,
    loadMaxUses: 0,
  },
  stateSchema: {},

  canUse: baseCanUse,

  use(ctx, player) {
    // 团战：护盾可以给任意己方角色 / 塔 / 无人机（护盾量按获得者已损失血量计算）
    if (ctx.state.mode?.rules?.teamSkills) {
      player.resources.skillUses--;
      ctx.ask({
        type: PENDING.TARGET,
        purpose: "skill:zhongli",
        asker: player.uid,
        options: friendlyUnitUids(ctx, player),
        data: null,
      });
      ctx.log(`${player.name} 释放坚如磐石，选择护盾目标`);
      return;
    }

    // 经典/联赛：给自己
    const lostHp = player.maxHp - player.hp;
    const shieldValue = 18 + lostHp * 2;
    player.defensePile.push(shieldCard(ctx, shieldValue));
    player.resources.skillUses--;

    ctx.log(`${player.name} 释放坚如磐石 护盾${shieldValue}点`);
    ctx.dev("skill", `钟离坚如磐石: 护盾=${shieldValue} (18+${lostHp}×2)`, {
      lostHp,
      shieldValue,
      defCount: player.defensePile.length,
    });

    ctx.turn.pass();
    return true;
  },

  onAnswer(ctx, player, pending, answer) {
    if (pending.purpose !== "skill:zhongli") return;
    const target = unitByUid(ctx.state, answerUid(answer));
    if (!target?.alive) return;

    const lostHp = Math.max(0, target.maxHp - target.hp);
    const shieldValue = 18 + lostHp * 2;
    target.defensePile.push(shieldCard(ctx, shieldValue));
    ctx.log(
      `${player.name} 为 ${target.name} 套上护盾 ${shieldValue} 点`,
    );
    ctx.dev("skill", `钟离坚如磐石(支援): ${target.name} 护盾=${shieldValue}`, {
      targetUid: target.uid,
      lostHp,
      shieldValue,
    });
    ctx.turn.pass();
  },
} satisfies CharacterDef;
