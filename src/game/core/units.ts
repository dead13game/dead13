// 单位 — 英雄 / 防御塔 / 召唤物(无人机)的统一查询
//
// 为什么英雄仍在 state.players、塔与召唤物单独放：
//   - 经典模式的 PIXI 桌面、AI 决策、存档都只认 players（英雄）；
//   - 团战需要塔与无人机作为可攻击目标，但它们没有回合、没有技能；
//   - 用 kind 区分、用 units.* 统一查询，避免把「会行动的角色」和「靶子」混在一起。

import { createPlayerDefaults } from "./player.js";
import type { GameState, Player, UnitKind } from "../types.js";

export const TOWER_HP = 10;
export const TOWER_COUNT = 5;

/** 创建任意非英雄单位（默认值补齐所有分区，保证 JSON/存档/伤害流程安全） */
export function createUnit({
  uid,
  index = 0,
  kind,
  name,
  hp,
  teamId = -1,
  ownerUid = null,
  towerIndex = null,
  characterId = null,
}: {
  uid: number;
  index?: number;
  kind: UnitKind;
  name: string;
  hp: number;
  teamId?: number;
  ownerUid?: number | null;
  towerIndex?: number | null;
  characterId?: number | null;
}): Player {
  const u = createPlayerDefaults();
  u.uid = uid;
  u.index = index;
  u.kind = kind;
  u.name = name;
  u.hp = hp;
  u.maxHp = hp;
  u.teamId = teamId;
  u.ownerUid = ownerUid;
  u.towerIndex = towerIndex;
  // 塔与无人机没有角色：运行时历来存 null，但 Player.characterId 是数字槽，
  // 用 0 兜底（全项目没有任何一处用 null 判断 characterId）。
  u.characterId = characterId ?? 0;
  u.resources.skillUses = 0;
  u.resources.loadUses = 0;
  u.resources.holyWordUses = 0;
  return u;
}

/** 分配一个稳定的召唤物 uid（读档后继续递增，不会撞号） */
export function nextUnitUid(state: GameState, base = 500000): number {
  state.unitSeq = (state.unitSeq ?? 0) + 1;
  return base + state.unitSeq;
}

/** 创建 2 队 × 5 座塔 */
export function createTowers(state: GameState, teamIds: number[] = [0, 1]): Player[] {
  const towers: Player[] = [];
  let uid = 100;
  for (const teamId of teamIds) {
    for (let i = 1; i <= TOWER_COUNT; i++) {
      towers.push(
        createUnit({
          uid: uid++,
          index: 100 + towers.length,
          kind: "tower",
          name: `${teamId === 0 ? "我方" : "敌方"}${i}号塔`,
          hp: TOWER_HP,
          teamId,
          towerIndex: i,
        }),
      );
    }
  }
  state.towers = towers;
  return towers;
}

export function allUnits(state: GameState): Player[] {
  return [...state.players, ...(state.towers ?? []), ...(state.summons ?? [])];
}

export function aliveUnits(state: GameState): Player[] {
  return allUnits(state).filter((u) => u.alive);
}

export function unitByUid(state: GameState, uid: number | null): Player | null {
  if (uid == null) return null;
  return allUnits(state).find((u) => u.uid === uid) ?? null;
}

/**
 * UI 目标解析：ActionBar 的 target 事件传的是 index（渲染序），
 * 不是 uid。必须先按 index 查，再兜底 uid —— 否则玩家的 uid=1/2/3…
 * 会与其他玩家的 index 撞号，攻击目标被错误解析成自己/队友。
 */
export function unitByIndexOrUid(
  state: GameState,
  indexOrUid: number | null,
): Player | null {
  if (indexOrUid == null) return null;
  const units = allUnits(state);
  return (
    units.find((u) => u.index === indexOrUid) ??
    units.find((u) => u.uid === indexOrUid) ??
    null
  );
}

export function heroes(state: GameState): Player[] {
  return state.players;
}

export function towersOf(state: GameState, teamId: number): Player[] {
  return (state.towers ?? []).filter((t) => t.teamId === teamId);
}

export function summonsOf(state: GameState, ownerUid: number | null): Player[] {
  return (state.summons ?? []).filter(
    (s) => s.ownerUid === ownerUid && s.alive,
  );
}

/** 当前可攻击的塔：该队序号最小的存活塔（必须按顺序拆） */
export function currentAttackableTower(
  state: GameState,
  teamId: number,
): Player | null {
  return (
    towersOf(state, teamId)
      .filter((t) => t.alive)
      .sort((a, b) => (a.towerIndex ?? 0) - (b.towerIndex ?? 0))[0] ?? null
  );
}

/** 是否敌对（经典模式 teamId=-1 时，除自己/自己的召唤物外都算敌人） */
export function isEnemy(a: Player | null, b: Player | null): boolean {
  if (!a || !b) return false;
  if (a.uid === b.uid) return false;
  if (a.ownerUid === b.uid) return false;
  if (a.teamId >= 0 && b.teamId >= 0) return a.teamId !== b.teamId;
  return true;
}

/** 是否友方（含自己） */
export function isFriendly(a: Player | null, b: Player | null): boolean {
  if (!a || !b) return false;
  if (a.uid === b.uid) return true;
  if (a.teamId >= 0 && b.teamId >= 0) return a.teamId === b.teamId;
  return a.ownerUid === b.uid || b.ownerUid === a.uid;
}

/**
 * 可攻击目标：敌方英雄 + 敌方召唤物 + 当前可拆的敌方塔。
 * 团战用；经典模式没有塔，召唤物同样可被攻击。
 */
export function attackTargets(state: GameState, attacker: Player): Player[] {
  const list: Player[] = [];
  for (const u of aliveUnits(state)) {
    if (!isEnemy(attacker, u)) continue;
    if (u.kind === "tower") continue;
    list.push(u);
  }
  const tower = currentAttackableTower(
    state,
    attacker.teamId >= 0 ? 1 - attacker.teamId : -1,
  );
  if (tower && isEnemy(attacker, tower)) list.push(tower);
  return list;
}

/** 友方单位（含自己），用于防御支援 / 钟离护盾 */
export function friendlyTargets(
  state: GameState,
  unit: Player,
  { includeTowers = true }: { includeTowers?: boolean } = {},
): Player[] {
  return aliveUnits(state).filter((u) => {
    if (!isFriendly(unit, u)) return false;
    if (u.kind === "tower" && !includeTowers) return false;
    return true;
  });
}

/** 敌方英雄（用于只能指定角色的技能） */
export function enemyHeroes(state: GameState, unit: Player): Player[] {
  return state.players.filter((p) => p.alive && isEnemy(unit, p));
}

export function teamAliveHeroes(state: GameState, teamId: number): Player[] {
  return state.players.filter((p) => p.alive && p.teamId === teamId);
}
