import { PHASE } from "../core/constants.js";
import { PENDING } from "../flow/pending.js";
import { unitByUid } from "../core/units.js";
import { baseCanUse, friendlyUnitUids } from "./helpers.js";

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
      });
      ctx.log(`${player.name} 释放坚如磐石，选择护盾目标`);
      return;
    }

    // 经典/联赛：给自己
    const lostHp = player.maxHp - player.hp;
    const shieldValue = 18 + lostHp * 2;
    player.defensePile.push({
      id: ctx.uniqueId("shield-zhongli"),
      suit: "",
      rank: "盾",
      value: shieldValue,
      faceUp: true,
      isShield: true,
    });
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
    const target = unitByUid(ctx.state, answer);
    if (!target?.alive) return;

    const lostHp = Math.max(0, target.maxHp - target.hp);
    const shieldValue = 18 + lostHp * 2;
    target.defensePile.push({
      id: ctx.uniqueId("shield-zhongli"),
      suit: "",
      rank: "盾",
      value: shieldValue,
      faceUp: true,
      isShield: true,
    });
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
};
