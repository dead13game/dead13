// 局内快照 — 菜月昴「死亡回归」与存档共用
//
// 与旧 caiyueang.js 的 deepCloneState / restoreState 行为对齐:
//   - 只快照牌局本身(玩家/牌堆/回合/阶段/天气),不含 matchContext 等运行时上下文
//   - 存档点自身不入快照(避免递归),读档后该玩家的存档点按旧行为被清空
//   - 恢复用 Object.assign 原地覆盖,保持 player 对象引用稳定(Vue 响应式前提)

import { STEP } from "../core/constants.js";
import { clonePlain } from "./schema.js";
import type {
  Card,
  Ctx,
  GameState,
  Phase,
  Player,
  PlayerSavepoint,
  WeatherId,
} from "../types.js";

/**
 * 快照形状。
 * 用 type 而非 interface：player.effects.savepoint 的类型是
 * `Record<string, unknown>`,对象字面量类型才有隐式索引签名,能直接赋过去。
 */
export type StateSnapshot = {
  players: Player[];
  towers: Player[];
  summons: Player[];
  unitSeq: number;
  deck: Card[];
  grave: Card[];
  currentPlayerIndex: number;
  phase: Phase;
  round: number;
  currentWeather: WeatherId | null;
  peaceRounds: number;
};

/** 深拷贝一份牌局快照 */
export function snapshotState(state: GameState): StateSnapshot {
  return {
    players: state.players.map((p) => {
      const copy = clonePlain(p);
      if (copy.effects) copy.effects.savepoint = null;
      return copy;
    }),
    towers: (state.towers ?? []).map((t) => clonePlain(t)),
    summons: (state.summons ?? []).map((s) => clonePlain(s)),
    unitSeq: state.unitSeq ?? 0,
    deck: state.deck.map((c) => ({ ...c })),
    grave: state.grave.map((c) => ({ ...c })),
    currentPlayerIndex: state.currentPlayerIndex,
    phase: state.phase,
    round: state.round,
    currentWeather: state.currentWeather,
    peaceRounds: state.peaceRounds,
  };
}

/** 从快照恢复(原地覆盖,引用不变) */
export function restoreState(ctx: Ctx, snap: PlayerSavepoint): boolean {
  const { state } = ctx;
  // 不变量:存档点只由 snapshotState 写入,结构即 StateSnapshot
  const saved = snap as StateSnapshot;
  state.players.forEach((p, i) => {
    const savedPlayer = saved.players[i];
    if (!savedPlayer) return;
    Object.assign(p, structuredClone(savedPlayer));
  });

  // 塔 / 召唤物按 uid 恢复（数量可能变化，直接替换数组）
  if (Array.isArray(saved.towers)) {
    state.towers = saved.towers.map((t) => structuredClone(t));
  }
  if (Array.isArray(saved.summons)) {
    state.summons = saved.summons.map((s) => structuredClone(s));
  }
  if (saved.unitSeq !== undefined) state.unitSeq = saved.unitSeq;

  state.deck = saved.deck.map((c) => ({ ...c }));
  state.grave = saved.grave.map((c) => ({ ...c }));
  state.currentPlayerIndex = saved.currentPlayerIndex;
  state.phase = saved.phase;
  state.round = saved.round;
  state.currentWeather = saved.currentWeather;
  state.peaceRounds = saved.peaceRounds;

  // 读档后一定回到行动步(旧实现同样强制重置)
  state.pending = null;
  state.step = STEP.PICK_ACTION;

  ctx.mode?.checkGameOver?.(ctx);
  return true;
}
