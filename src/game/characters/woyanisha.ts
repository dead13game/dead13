import { PHASE } from "../core/constants.js";
import { PENDING } from "../flow/pending.js";
import { CAT } from "../core/log.js";
import { unitByUid } from "../core/units.js";
import { applyDamage } from "../rules/damage.js";
import {
  baseCanUse,
  enemyTargetUids,
  withTurnGate,
  answerUid,
} from "./helpers.js";
import type { CharacterDef } from "../types.js";

// 沃雅妮莎 · 领唱（被动）+ 终幕领唱（主动，不限次数）
// 被动：每次执行防御操作 +1 层（不管防御牌给谁）；
//       自己的防御牌被击破时 +1 层（不管是谁放的，只看牌的主人）。
// 主动：消耗全部【领唱】，单次最多 20 层，每层对目标造成 1 点伤害。

export const CHORUS_MAX_PER_CAST = 20;

export default {
  id: 15,
  meta: {
    id: 15,
    name: "沃雅妮莎",
    title: "领唱",
    icon: "./images/沃雅妮莎.jpg",
    hp: 12,
    speed: 9,
    skillName: "终幕领唱",
    skillType: "active",
    skillDesc:
      "被动：防御+1领唱，自己的防御牌被击破+1领唱。主动：消耗全部领唱（单次最多20层），每层造成1点伤害，不限次数",
    maxUses: Infinity,
    loadMaxUses: 0,
  },
  stateSchema: { chorus: 0 },

  canUse(ctx, player) {
    if (ctx.state.phase === PHASE.PEACE) return false;
    if ((player.char.chorus ?? 0) <= 0) return false;
    return baseCanUse(ctx, player);
  },
  canUseNow: withTurnGate(
    (ctx, player) =>
      ctx.state.phase !== PHASE.PEACE &&
      (player.char.chorus ?? 0) > 0 &&
      baseCanUse(ctx, player),
    { requireNormal: true },
  ),

  use(ctx, player) {
    if (ctx.state.phase === PHASE.PEACE) {
      ctx.log("和平阶段禁止攻击");
      return;
    }
    if ((player.char.chorus ?? 0) <= 0) {
      ctx.log("没有领唱层数");
      return;
    }
    ctx.ask({
      type: PENDING.TARGET,
      purpose: "skill:woyanisha",
      asker: player.uid,
      options: enemyTargetUids(ctx, player),
      data: null,
    });
    ctx.log(`${player.name} 释放终幕领唱，选择目标`);
  },

  onAnswer(ctx, player, pending, answer) {
    if (pending.purpose !== "skill:woyanisha") return;
    const target = unitByUid(ctx.state, answerUid(answer));
    if (!target?.alive) return;

    const stacks = Math.min(player.char.chorus ?? 0, CHORUS_MAX_PER_CAST);
    if (stacks <= 0) return;
    // stacks > 0 已证明槽位是数字；`!` 只做类型收窄，不改变运行时
    player.char.chorus = player.char.chorus! - stacks;

    ctx.log(
      `${player.name} 消耗 ${stacks} 层领唱，对 ${target.name} 造成 ${stacks} 点伤害（剩余 ${player.char.chorus} 层）`,
    );
    ctx.dev(CAT.SKILL, `终幕领唱: ${player.name} → ${target.name}`, {
      stacks,
      remaining: player.char.chorus,
      targetHp: target.hp,
    });
    applyDamage(ctx, { target, amount: stacks, cause: "chorus" });
    ctx.turn.pass();
  },

  hooks: {
    /** 执行防御操作 → +1 领唱（不管防御牌给谁） */
    onDefense(ctx, player) {
      player.char.chorus = (player.char.chorus ?? 0) + 1;
      ctx.log(`${player.name} 领唱 ${player.char.chorus}层`);
      ctx.devDebug(CAT.SKILL, `沃雅妮莎领唱 +1 → ${player.char.chorus}（防御）`);
    },
  },
} satisfies CharacterDef;
