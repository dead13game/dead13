// 局内快照 — 菜月昴「死亡回归」与存档共用
//
// 与旧 caiyueang.js 的 deepCloneState / restoreState 行为对齐:
//   - 只快照牌局本身(玩家/牌堆/回合/阶段/天气),不含 matchContext 等运行时上下文
//   - 存档点自身不入快照(避免递归),读档后该玩家的存档点按旧行为被清空
//   - 恢复用 Object.assign 原地覆盖,保持 player 对象引用稳定(Vue 响应式前提)

import { STEP } from "../core/constants.js";
import { clonePlain } from "./schema.js";

/** 深拷贝一份牌局快照 */
export function snapshotState(state) {
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
export function restoreState(ctx, snap) {
  const { state } = ctx;
  state.players.forEach((p, i) => {
    const saved = snap.players[i];
    if (!saved) return;
    Object.assign(p, structuredClone(saved));
  });

  // 塔 / 召唤物按 uid 恢复（数量可能变化，直接替换数组）
  if (Array.isArray(snap.towers)) {
    state.towers = snap.towers.map((t) => structuredClone(t));
  }
  if (Array.isArray(snap.summons)) {
    state.summons = snap.summons.map((s) => structuredClone(s));
  }
  if (snap.unitSeq !== undefined) state.unitSeq = snap.unitSeq;

  state.deck = snap.deck.map((c) => ({ ...c }));
  state.grave = snap.grave.map((c) => ({ ...c }));
  state.currentPlayerIndex = snap.currentPlayerIndex;
  state.phase = snap.phase;
  state.round = snap.round;
  state.currentWeather = snap.currentWeather;
  state.peaceRounds = snap.peaceRounds;

  // 读档后一定回到行动步(旧实现同样强制重置)
  state.pending = null;
  state.step = STEP.PICK_ACTION;

  ctx.mode?.checkGameOver?.(ctx);
  return true;
}
