// 角色注册表 — 唯一入口
//
// 依赖方向:characters → rules/core,characters 不直接 import flow 的实现
// (只用 ctx 提供的接口形状),因此不会与 flow 形成环。
//
// 12 号「myracler(开发者)」只属于模拟宇宙,不进本注册表。

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
import dev from "./dev.js";

/** 回合开始钩子的执行优先级(数值小先执行) */
export const ROUND_START_PRIORITY = {
  MOON: 20,
  CHAR: 60,
};

export const CHARACTER_DEFS = [
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

const REGISTRY = new Map(CHARACTER_DEFS.map((d) => [d.id, d]));

/** id → 插件定义 */
export function getCharacter(id) {
  return REGISTRY.get(id) ?? null;
}

/** id → 静态数据(UI 兼容 CHARACTERS 字典) */
export const CHARACTERS = Object.fromEntries(
  CHARACTER_DEFS.map((d) => [d.id, d.meta]),
);

/** 含开发者角色(12)的全量字典 — 仅模拟宇宙使用 */
export const SIM_CHARACTERS = { ...CHARACTERS, [dev.id]: dev.meta };

export const DEV_CHARACTER = dev;

/** 旧 API:根据 player 取静态数据 */
export function getCharData(player) {
  return CHARACTERS[player.characterId];
}

/** 经典模式可选角色 id(按 id 升序) */
export function selectableIds() {
  return [...REGISTRY.keys()].sort((a, b) => a - b);
}

/** 某角色的私有状态默认值(创建 player 时用) */
export function characterStateFor(id) {
  return getCharacter(id)?.stateSchema ?? {};
}

/**
 * 收集所有角色的「回合开始」钩子,按优先级排序。
 * 返回 [{ id, priority, run(ctx, player) }]
 */
export function roundStartHooks() {
  const hooks = [];
  for (const def of CHARACTER_DEFS) {
    const fn = def.hooks?.onRoundStart;
    if (!fn) continue;
    hooks.push({
      id: def.id,
      priority: def.hooks.roundStartPriority ?? ROUND_START_PRIORITY.CHAR,
      run: fn,
    });
  }
  return hooks.sort((a, b) => a.priority - b.priority);
}

/**
 * 收集攻击命中后的角色钩子,按优先级排序。
 * 返回 [{ id, priority, run(ctx, env) }]
 */
export function damageDealtHooks() {
  const hooks = [];
  for (const def of CHARACTER_DEFS) {
    const fn = def.hooks?.onDamageDealt;
    if (!fn) continue;
    hooks.push({
      id: def.id,
      priority: def.hooks.damageDealtPriority ?? ROUND_START_PRIORITY.CHAR,
      run: fn,
    });
  }
  return hooks.sort((a, b) => a.priority - b.priority);
}

/** 攻击/防御加成管道(角色可追加) */
export function attackModifiersOf(characterId) {
  return getCharacter(characterId)?.attackModifiers ?? [];
}

export function defenseModifiersOf(characterId) {
  return getCharacter(characterId)?.defenseModifiers ?? [];
}

/** 执行防御操作后的角色钩子（沃雅妮莎领唱 / 砂狼白子无人机拿盾） */
export function defenseHooks() {
  const hooks = [];
  for (const def of CHARACTER_DEFS) {
    const fn = def.hooks?.onDefense;
    if (!fn) continue;
    hooks.push({ id: def.id, run: fn });
  }
  return hooks;
}

/** 轮到该角色行动时的钩子 — 无人机在主人行动时攻击 */
export function turnStartHooks() {
  const hooks = [];
  for (const def of CHARACTER_DEFS) {
    const fn = def.hooks?.onTurnStart;
    if (!fn) continue;
    hooks.push({ id: def.id, run: fn });
  }
  return hooks;
}

/** 全部 15 名可选角色（经典/世界杯/联赛/团战），不含开发者 */
export const SELECTABLE_COUNT = CHARACTER_DEFS.length;
