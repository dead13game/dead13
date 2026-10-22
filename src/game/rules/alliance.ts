// 联盟 / 背刺 — 规则部分(命令编排在 flow/commands)
//
// 与旧 alliance.js 的差别只有一处:身份用 uid 而不是 index。

import { CAT } from "../core/log.js";
import { dissolveAlliance } from "./damage.js";
import type { Ctx, Player } from "../types.js";

export const ALLIANCE_MIN_PLAYERS = 4;
export const ALLIANCE_TURNS = 5;
export const BETRAYAL_PENALTY_TURNS = 10;

/** canFormAlliance 返回值(reason 为要写进日志的文案) */
export interface AllianceCheck {
  ok: boolean;
  reason: string | null;
}

/** splitAllianceDamage 返回值 */
export interface AllianceSplit {
  value: number;
  ally: Player;
  allyValue: number;
}

/** splitAllianceDamage 入参 */
export interface AllianceSplitOptions {
  attacker: Player;
  target: Player;
  value: number;
}

/**
 * 能否结盟。返回 { ok, reason }(reason 为要写进日志的文案)。
 * 联盟在联赛/世界杯禁用(DC-2),由 mode.rules.alliance 控制。
 */
export function canFormAlliance(ctx: Ctx, player: Player): AllianceCheck {
  const { state } = ctx;
  if (state.phase === "peace") return { ok: false, reason: null };
  if (ctx.mode?.rules?.alliance === false) return { ok: false, reason: null };
  if (state.players.length < ALLIANCE_MIN_PLAYERS) {
    return { ok: false, reason: "仅4人局及以上可结盟" };
  }
  if (player.relations.allyUid !== null) {
    return { ok: false, reason: "已有盟友，不可再结盟" };
  }
  if (player.relations.betrayalPenalty > 0) {
    return {
      ok: false,
      reason: `背刺惩罚中，${player.relations.betrayalPenalty}回合内不可结盟`,
    };
  }
  return { ok: true, reason: null };
}

/** 可结盟目标:存活、非自己、没有盟友 */
export function allianceTargets(ctx: Ctx, player: Player): Player[] {
  return ctx.state.players.filter(
    (p) => p.alive && p.uid !== player.uid && p.relations.allyUid === null,
  );
}

/** 建立双向联盟 */
export function formAlliance(ctx: Ctx, a: Player, b: Player): void {
  a.relations.allyUid = b.uid;
  a.relations.allianceTurns = ALLIANCE_TURNS;
  b.relations.allyUid = a.uid;
  b.relations.allianceTurns = ALLIANCE_TURNS;

  ctx.log(`${a.name} 与 ${b.name} 结盟（${ALLIANCE_TURNS}回合）`);
  ctx.dev(
    CAT.ALLIANCE,
    `${a.name} ↔ ${b.name} 结盟（${ALLIANCE_TURNS}回合）`,
    { players: [a.name, b.name], turns: ALLIANCE_TURNS, round: ctx.state.round },
  );
}

/**
 * 联盟平摊:目标有盟友时,(伤害-2) 再按 1/3 给盟友(向下取整),余数给目标。
 * 返回 null 表示不触发。调用方负责真正扣血。
 */
export function splitAllianceDamage(
  ctx: Ctx,
  { attacker, target, value }: AllianceSplitOptions,
): AllianceSplit | null {
  if (target.relations.allyUid === null || target.relations.allianceTurns <= 0) {
    return null;
  }
  const ally = ctx.players.byUid(target.relations.allyUid);
  if (!ally || !ally.alive || ally.uid === attacker.uid) return null;

  const reduced = value - 2;
  const allyValue = Math.floor(reduced / 3);
  const targetValue = reduced - allyValue;

  ctx.dev(CAT.ALLIANCE, `联盟平摊: 原始=${value} 减2=${reduced}`, {
    formula: `(${value}-2)/3`,
    allyDmg: allyValue,
    targetDmg: targetValue,
    ally: ally.name,
  });
  ctx.log(
    `联盟平摊：${target.name} ${targetValue}点, ${ally.name} ${allyValue}点`,
  );

  return { value: targetValue, ally, allyValue };
}

export { dissolveAlliance };
