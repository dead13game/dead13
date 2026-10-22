// 命令层 · query — 由 flow/commands.js 拆分而来（纯搬运，行为不变）
import { getCharData, getCharacter } from "../../characters/index.js";
import type { CharacterDef, Ctx, Player } from "../../types.js";

/**
 * 角色插件定义。
 *
 * getCharacter 的返回类型是 15 个插件字面量的联合（注册表 Object.fromEntries 推断），
 * 与 CharacterDef 契约存在已知差异（典型是 Modifier.apply 的参数顺序：
 * types.ts 写 (value, env)，rules/modifiers.ts 实际调用 (ctx, env, value)）。
 * 这里断言一次收窄到契约形状，运行时仍是注册表对象本身。
 */
export function characterDef(id: number): CharacterDef | null {
  return getCharacter(id) as CharacterDef | null;
}

/**
 * 当前行动者。
 * 命令层只在行动步被调用，current() 必然存在；`!` 只做类型收窄，不改运行时。
 */
export function currentPlayer(ctx: Ctx): Player {
  return ctx.players.current()!;
}

// ════════════════════════════════════════
//  查询
// ════════════════════════════════════════

/** 主动技能可用性(对齐旧 canUseSkill —— 引擎口径,不要往里加回合门槛) */
export function canUseSkill(ctx: Ctx, player: Player): boolean {
  const meta = getCharData(player);
  if (!meta || meta.skillType !== "active") return false;
  const def = characterDef(player.characterId);
  if (!def?.canUse) return false;
  return def.canUse(ctx, player);
}

/**
 * UI/AI 口径:在引擎口径之上叠加回合/阶段门槛(KB-3)。
 * 引擎命令层仍用 canUseSkill,保证差分回放与旧实现一致。
 */
export function canUseSkillNow(ctx: Ctx, player: Player): boolean {
  const meta = getCharData(player);
  if (!meta || meta.skillType !== "active") return false;
  const def = characterDef(player.characterId);
  if (!def?.canUse) return false;
  const fn = def.canUseNow ?? def.canUse;
  return fn(ctx, player);
}

/** 是否处于行动步(旧 state.step === "pickAction") */
export function isIdle(ctx: Ctx): boolean {
  return ctx.state.pending == null && !ctx.state.gameOver;
}
