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

/** 除自己以外的存活玩家 uid */
export function otherAliveUids(ctx, player) {
  return ctx.state.players
    .filter((p) => p.alive && p.uid !== player.uid)
    .map((p) => p.uid);
}

/** 敌方英雄 uid（只能指定角色的技能用） */
export function enemyHeroUids(ctx, player) {
  return enemyHeroes(ctx.state, player).map((u) => u.uid);
}

/**
 * 敌方可选目标：英雄 + 召唤物 + 当前可拆的塔。
 * 攻击型技能（雷电/风堇/莉奈娅/沃雅妮莎）在团战里可以打塔。
 */
export function enemyTargetUids(ctx, player) {
  return attackTargets(ctx.state, player).map((u) => u.uid);
}

/** 己方单位（含自己 / 队友 / 塔 / 召唤物），用于护盾与防御支援 */
export function friendlyUnitUids(ctx, player, opts) {
  return friendlyTargets(ctx.state, player, opts).map((u) => u.uid);
}

/** 除自己以外的全部存活单位（审判/偷防御等可指定任意单位的技能） */
export function otherUnitUids(ctx, player) {
  return ctx.units
    .alive()
    .filter((u) => u.uid !== player.uid)
    .map((u) => u.uid);
}

/** 薇斯纳连击计数：任何非攻击操作都清零 */
export function resetAttackStreak(player) {
  if (player?.char && "attackStreak" in player.char) {
    player.char.attackStreak = 0;
  }
}

/**
 * 主动技能默认可用性判定。
 * 与旧 canUseSkill 对齐: 主动技 + 有次数 + 非军备 + 空 pending
 * + 圣遗物激活期间禁用温迪/雷神/风堇的大招。
 */
export function baseCanUse(ctx, player) {
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
export function neverUsable() {
  return false;
}

/**
 * 「现在能不能点」的附加门槛(回合数 / 阶段)。
 *
 * 为什么要和 canUse 分开:
 *   - canUse 是引擎口径(命令层用它做兜底校验),必须与旧实现一致,否则差分回放会失配;
 *   - canUseNow 是 UI/AI 口径,应该把「点了也会被拒」的技能提前置灰,避免 AI 空转(KB-3)。
 */
export function withTurnGate(canUseFn, { minRound = 0, requireNormal = false }) {
  return function canUseNow(ctx, player) {
    if (!canUseFn(ctx, player)) return false;
    if (requireNormal && ctx.state.phase === "peace") return false;
    if (ctx.state.round < minRound) return false;
    return true;
  };
}

/** 技能专用: 不能对自己以外无目标时返回空,由命令层判定 */
export function defaultPurpose(characterId, tag) {
  return tag ? `skill:${tag}` : `skill:${characterId}`;
}
