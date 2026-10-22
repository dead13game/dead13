// 角色注册表 — 唯一入口
//
// 依赖方向:characters → rules/core,characters 不直接 import flow 的实现
// (只用 ctx 提供的接口形状),因此不会与 flow 形成环。

import venti from "./venti.js";
import zhongli from "./zhongli.js";
import raiden from "./raiden.js";
import nahida from "./nahida.js";
import furina from "./furina.js";
import maweika from "./maweika.js";
import zolumbia from "./zolumbia.js";
import fenjin from "./fenjin.js";
import liniya from "./liniya.js";
import aimiliya from "./aimiliya.js";
import caiyueang from "./caiyueang.js";
import shalangbaizi from "./shalangbaizi.js";
import juxueli from "./juxueli.js";
import woyanisha from "./woyanisha.js";
import weisina from "./weisina.js";

import type {
  CharacterDef,
  CharacterMeta,
  CharState,
  Ctx,
  DamageDealtEnv,
  Player,
} from "../types.js";
import type {
  AttackModifierEnv,
  ModifierEnv,
  RulesModifier,
} from "../rules/modifiers.js";

/** 回合开始钩子的执行优先级(数值小先执行) */
export const ROUND_START_PRIORITY = {
  MOON: 20,
  CHAR: 60,
};

/**
 * 角色插件的加成管道。
 *
 * 为什么要交叉 `Record<string, unknown>`:
 *   内核 `Modifier` 带字符串索引签名,rules 的 `RulesModifier<E>` 是接口
 *   (接口没有隐式索引签名),不交叉就无法同时满足「可赋给 Modifier[]」与
 *   「下游 collectModifiers 拿到 apply 必有的精确签名」。
 */
type CharacterModifier<E extends ModifierEnv> = RulesModifier<E> &
  Record<string, unknown>;

/**
 * 注册表条目：内核 CharacterDef + 加成管道的精确签名。
 * 缩窄是合法覆盖（RulesModifier 可赋给 Modifier），下游因此不用再收窄。
 */
interface CharacterEntry extends CharacterDef {
  attackModifiers?: CharacterModifier<AttackModifierEnv>[];
  defenseModifiers?: CharacterModifier<ModifierEnv>[];
}

export const CHARACTER_DEFS: CharacterEntry[] = [
  venti,
  zhongli,
  raiden,
  nahida,
  furina,
  maweika,
  zolumbia,
  fenjin,
  liniya,
  aimiliya,
  caiyueang,
  shalangbaizi,
  juxueli,
  woyanisha,
  weisina,
];

const REGISTRY = new Map<number, CharacterEntry>(
  CHARACTER_DEFS.map((d) => [d.id, d]),
);

/** id → 插件定义 */
export function getCharacter(id: number): CharacterDef | null {
  return REGISTRY.get(id) ?? null;
}

/** id → 静态数据(UI 兼容 CHARACTERS 字典) */
export const CHARACTERS: Record<number, CharacterMeta> = Object.fromEntries(
  CHARACTER_DEFS.map((d): [number, CharacterMeta] => [d.id, d.meta]),
);

/**
 * 旧 API:根据 player 取静态数据。
 * 参数只要求 `characterId` —— AI 层传的是 buildView() 产出的 view 玩家,
 * 不是内核 Player,标完整 Player 会把 AI 调用卡住。
 */
export function getCharData(player: Pick<Player, "characterId">): CharacterMeta {
  return CHARACTERS[player.characterId];
}

/** 经典模式可选角色 id(按 id 升序) */
export function selectableIds(): number[] {
  return [...REGISTRY.keys()].sort((a, b) => a - b);
}

/** 某角色的私有状态默认值(创建 player 时用) */
export function characterStateFor(id: number): CharState {
  return getCharacter(id)?.stateSchema ?? {};
}

/** 回合开始钩子 */
export interface RoundStartHook {
  id: number;
  priority: number;
  run: (ctx: Ctx, player: Player) => void;
}

/**
 * 收集所有角色的「回合开始」钩子,按优先级排序。
 * 返回 [{ id, priority, run(ctx, player) }]
 */
export function roundStartHooks(): RoundStartHook[] {
  const hooks: RoundStartHook[] = [];
  for (const def of CHARACTER_DEFS) {
    const fn = def.hooks?.onRoundStart;
    if (!fn) continue;
    hooks.push({
      id: def.id,
      priority: def.hooks?.roundStartPriority ?? ROUND_START_PRIORITY.CHAR,
      run: fn,
    });
  }
  return hooks.sort((a, b) => a.priority - b.priority);
}

/** 攻击命中后的角色钩子 */
export interface DamageDealtHook {
  id: number;
  priority: number;
  run: (ctx: Ctx, env: DamageDealtEnv) => void;
}

/**
 * 收集攻击命中后的角色钩子,按优先级排序。
 * 返回 [{ id, priority, run(ctx, env) }]
 */
export function damageDealtHooks(): DamageDealtHook[] {
  const hooks: DamageDealtHook[] = [];
  for (const def of CHARACTER_DEFS) {
    const fn = def.hooks?.onDamageDealt;
    if (!fn) continue;
    hooks.push({
      id: def.id,
      priority: def.hooks?.damageDealtPriority ?? ROUND_START_PRIORITY.CHAR,
      run: fn,
    });
  }
  return hooks.sort((a, b) => a.priority - b.priority);
}

/** 攻击/防御加成管道(角色可追加) */
export function attackModifiersOf(
  characterId: number,
): RulesModifier<AttackModifierEnv>[] {
  return REGISTRY.get(characterId)?.attackModifiers ?? [];
}

export function defenseModifiersOf(
  characterId: number,
): RulesModifier<ModifierEnv>[] {
  return REGISTRY.get(characterId)?.defenseModifiers ?? [];
}

/** 角色侧钩子（只吃 ctx/player，没有优先级） */
export interface PlayerHook {
  id: number;
  run: (ctx: Ctx, player: Player) => void;
}

/** 执行防御操作后的角色钩子（沃雅妮莎领唱 / 砂狼白子无人机拿盾） */
export function defenseHooks(): PlayerHook[] {
  const hooks: PlayerHook[] = [];
  for (const def of CHARACTER_DEFS) {
    const fn = def.hooks?.onDefense;
    if (!fn) continue;
    hooks.push({ id: def.id, run: fn });
  }
  return hooks;
}

/** 轮到该角色行动时的钩子 — 无人机在主人行动时攻击 */
export function turnStartHooks(): PlayerHook[] {
  const hooks: PlayerHook[] = [];
  for (const def of CHARACTER_DEFS) {
    const fn = def.hooks?.onTurnStart;
    if (!fn) continue;
    hooks.push({ id: def.id, run: fn });
  }
  return hooks;
}

/** 全部 15 名可选角色（经典/世界杯/联赛/团战），不含开发者 */
export const SELECTABLE_COUNT = CHARACTER_DEFS.length;
