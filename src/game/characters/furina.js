import { PHASE } from "../core/constants.js";
import { PENDING } from "../flow/pending.js";
import { unitByUid } from "../core/units.js";
import { baseCanUse, withTurnGate, otherUnitUids } from "./helpers.js";

// 芙宁娜 · 审判:指定目标交换陷阱明暗,本回合攻击无视陷阱,获得额外行动
export default {
  id: 5,
  meta: {
    id: 5,
    name: "芙宁娜",
    title: "水神·芙卡洛斯",
    icon: "./images/芙宁娜.jpg",
    hp: 11,
    speed: 10,
    skillName: "审判",
    skillType: "active",
    skillDesc: "指定目标令其陷阱明暗交换，本回合攻击无视陷阱，获得额外行动",
    maxUses: 3,
    loadMaxUses: 0,
  },
  stateSchema: {},

  canUse: baseCanUse,
  canUseNow: withTurnGate(baseCanUse, { minRound: 4, requireNormal: true }),

  use(ctx, player) {
    const { state } = ctx;
    if (state.phase === PHASE.PEACE) {
      ctx.log("和平阶段禁止攻击");
      return;
    }
    if (state.round < 4) {
      ctx.log("第4回合后才能攻击");
      return;
    }

    player.effects.ignoreTrapThisTurn = true;
    player.resources.skillUses--;

    ctx.ask({
      type: PENDING.TARGET,
      purpose: "skill:furina",
      asker: player.uid,
      options: otherUnitUids(ctx, player),
    });
    ctx.log(`${player.name} 释放审判，选择要交换陷阱的目标`);
  },

  onAnswer(ctx, player, pending, answer) {
    const target = unitByUid(ctx.state, answer);
    if (!target?.alive) return;

    const temp = target.trap;
    target.trap = target.bait;
    target.bait = temp;
    if (target.trap) {
      target.trap.faceUp = false;
      // 明暗交换后，新的诱饵成为公开点数；真正的陷阱仍隐藏
      if (target.bait) target.trap.decoyValue = target.bait.value;
      else delete target.trap.decoyValue;
    }
    if (target.bait) target.bait.faceUp = true;

    ctx.log(`${target.name}的陷阱明暗交换`);
    ctx.turn.extra();
  },
};
