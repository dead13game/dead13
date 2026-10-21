import { CAT } from "../core/log.js";
import { unitByUid } from "../core/units.js";
import { applyDamage } from "../rules/damage.js";

// 菊雪梨 · 调查（被动）
// 普通攻击变为「调查」：猜测目标陷阱点数。
//   猜中 → 拆除陷阱，造成 20 + 烈日当空（2）点伤害（可被防御牌吸收）
//   猜错 → 无事发生，陷阱保留
//   目标没有陷阱 → 造成 7 + 烈日当空 的普攻伤害，无视陷阱，可吃圣遗物加成
// 注意：任何日志/UI 都不能暴露对方陷阱点数。

export default {
  id: 14,
  meta: {
    id: 14,
    name: "菊雪梨",
    title: "调查",
    icon: null,
    hp: 11,
    speed: 10,
    skillName: "调查",
    skillType: "passive",
    skillDesc:
      "普通攻击变为调查：猜目标陷阱点数，猜中拆陷阱并造成20点伤害；猜错无事发生；目标无陷阱时造成7点普攻伤害",
    maxUses: Infinity,
    loadMaxUses: 0,
  },
  stateSchema: {},

  canUse() {
    return false; // 被动技
  },

  onAnswer(ctx, player, pending, answer) {
    if (pending.purpose !== "investigate:guess") return;
    const state = ctx.state;
    const target = unitByUid(state, pending.data?.targetUid);
    if (!target?.alive) {
      state.pending = null;
      if (!state.gameOver) ctx.turn.pass();
      return;
    }

    const guess = Number(answer);
    const trap = target.trap;
    if (!trap) {
      ctx.log(`${target.name} 没有陷阱`);
      state.pending = null;
      if (!state.gameOver) ctx.turn.pass();
      return;
    }

    if (guess === trap.value) {
      // 拆除陷阱（不公开点数），再造成伤害
      state.grave.push(trap);
      target.trap = null;
      let damage = 20 + (state.currentWeather === "sun" ? 2 : 0);
      if (pending.data?.besieged) {
        damage = Math.max(1, Math.ceil(damage / 2));
      }
      ctx.log(`${player.name} 调查命中！拆除 ${target.name} 的陷阱并造成 ${damage} 点伤害`);
      ctx.dev(CAT.SKILL, `调查猜中: ${player.name} → ${target.name}`, {
        guess,
        damage,
        besieged: !!pending.data?.besieged,
      });
      applyDamage(ctx, { target, amount: damage, cause: "investigate" });
    } else {
      ctx.log(`${player.name} 调查猜错，${target.name} 的陷阱保留`);
      ctx.dev(CAT.SKILL, `调查猜错: ${player.name} → ${target.name}`, {
        guess,
        // 只在开发日志里记录真实值，普通战报不暴露
        trapValue: trap.value,
      });
    }

    state.pending = null;
    if (!state.gameOver) ctx.turn.pass();
  },
};
