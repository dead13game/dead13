import { PHASE } from "../core/constants.js";
import { baseCanUse } from "./helpers.js";

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
    // 注意:钟离开盾不受和平期限制(旧实现同样没有 phase 检查)
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
};
