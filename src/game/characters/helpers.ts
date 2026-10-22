// 角色插件公共工具
//
// 插件契约(见 docs/classic-refactor-plan.md §4.4):
//   必须是「无状态对象」: 实例上不许存状态, 不许 instanceof 分发, 不许继承抽基类。
//   所有状态都在 player 上(char 存角色私有, effects/relations/resources 存通用)。

import {
  attackTargets,
  enemyHeroes,
  friendlyTargets,
} from "../core/units.js";
import type { Ctx, Player } from "../types.js";

/** 除自己以外的存活玩家 uid */
export function otherAliveUids(ctx: Ctx, player: Player): number[] {
  return ctx.state.players
    .filter((p) => p.alive && p.uid !== player.uid)
    .map((p) => p.uid);
}

/** 敌方英雄 uid（只能指定角色的技能用） */
export function enemyHeroUids(ctx: Ctx, player: Player): number[] {
  return enemyHeroes(ctx.state, player).map((u) => u.uid);
}

/**
 * 敌方可选目标：英雄 + 召唤物 + 当前可拆的塔。
 * 攻击型技能（雷电/风堇/莉奈娅/沃雅妮莎）在团战里可以打塔。
 */
export function enemyTargetUids(ctx: Ctx, player: Player): number[] {
  return attackTargets(ctx.state, player).map((u) => u.uid);
}

/** 己方单位（含自己 / 队友 / 塔 / 召唤物），用于护盾与防御支援 */
export function friendlyUnitUids(
  ctx: Ctx,
  player: Player,
  opts?: { includeTowers?: boolean },
): number[] {
  return friendlyTargets(ctx.state, player, opts).map((u) => u.uid);
}

/** 除自己以外的全部存活单位（审判/偷防御等可指定任意单位的技能） */
export function otherUnitUids(ctx: Ctx, player: Player): number[] {
  return ctx.units
    .alive()
    .filter((u) => u.uid !== player.uid)
    .map((u) => u.uid);
}

/**
 * 作答值 → 目标 uid。
 *
 * 为什么不是直接 `unitByUid(state, answer)`:作答值在契约里是 `unknown`。
 * 非数字作答不可能命中任何单位(`unitByUid` 用 `===` 比较数字 uid),
 * 所以「非数字 → null」与迁移前把它原样传进去的行为完全一致。
 */
export function answerUid(answer: unknown): number | null {
  return typeof answer === "number" ? answer : null;
}

/** 薇斯纳连击计数：任何非攻击操作都清零 */
export function resetAttackStreak(player: Player): void {
  if (player?.char && "attackStreak" in player.char) {
    player.char.attackStreak = 0;
  }
}

/**
 * 主动技能默认可用性判定。
 * 与旧 canUseSkill 对齐: 主动技 + 有次数 + 非军备 + 空 pending
 * + 圣遗物激活期间禁用温迪/雷神/风堇的大招。
 */
export function baseCanUse(ctx: Ctx, player: Player): boolean {
  if (!player || !player.alive) return false;
  if (ctx.state.pending) return false;
  if (ctx.state.gameOver) return false;
  if (ctx.state.currentWeather === "arms") return false;
  if (player.resources.skillUses <= 0) return false;

  const RESTRICTED_WHEN_ARTIFACT = [1, 3, 8];
  if (
    player.artifact.active &&
    RESTRICTED_WHEN_ARTIFACT.includes(player.characterId)
  ) {
    return false;
  }
  return true;
}

/** 被动技不可主动释放 */
export function neverUsable(): boolean {
  return false;
}

/**
 * 「现在能不能点」的附加门槛(回合数 / 阶段)。
 *
 * 为什么要和 canUse 分开:
 *   - canUse 是引擎口径(命令层用它做兜底校验),必须与旧实现一致,否则差分回放会失配;
 *   - canUseNow 是 UI/AI 口径,应该把「点了也会被拒」的技能提前置灰,避免 AI 空转(KB-3)。
 */
export function withTurnGate(
  canUseFn: (ctx: Ctx, player: Player) => boolean,
  {
    minRound = 0,
    requireNormal = false,
  }: { minRound?: number; requireNormal?: boolean },
): (ctx: Ctx, player: Player) => boolean {
  return function canUseNow(ctx: Ctx, player: Player) {
    if (!canUseFn(ctx, player)) return false;
    if (requireNormal && ctx.state.phase === "peace") return false;
    if (ctx.state.round < minRound) return false;
    return true;
  };
}

/** 技能专用: 不能对自己以外无目标时返回空,由命令层判定 */
export function defaultPurpose(characterId: number, tag?: string): string {
  return tag ? `skill:${tag}` : `skill:${characterId}`;
}
