// 角色插件公共工具
//
// 插件契约(见 docs/classic-refactor-plan.md §4.4):
//   必须是「无状态对象」: 实例上不许存状态, 不许 instanceof 分发, 不许继承抽基类。
//   所有状态都在 player 上(char 存角色私有, effects/relations/resources 存通用)。

/** 除自己以外的存活玩家 uid */
export function otherAliveUids(ctx, player) {
  return ctx.state.players
    .filter((p) => p.alive && p.uid !== player.uid)
    .map((p) => p.uid);
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

/** 技能专用: 不能对自己以外无目标时返回空,由命令层判定 */
export function defaultPurpose(characterId, tag) {
  return tag ? `skill:${tag}` : `skill:${characterId}`;
}
