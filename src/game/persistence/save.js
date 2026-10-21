// 存档 / 读档 — schema 驱动,不再手抄字段清单
//
// 格式:
//   { version: 4, savedAt, mode: { id, ...自定义 }, state: { ... } }
//
// 读档必须重建 mode(它含函数,不能进 JSON),由调用方提供 modeFactory。

import { createPlayerDefaults } from "../core/player.js";
import { STATE_FIELDS, SAVE_VERSION, normalizePlayer, pickState } from "./schema.js";

/**
 * 序列化为可 JSON 存储的纯对象。
 * @param {object} state
 * @param {object} [extra] 额外附加信息(如联赛/世界杯的赛程上下文)
 */
export function serializeGameState(state, extra = {}) {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    mode: {
      id: state.mode?.id ?? "classic",
      ...(state.mode?.serialize?.() ?? {}),
    },
    state: pickState(state),
    ...extra,
  };
}

/**
 * 从存档恢复(原地覆盖,引用稳定)。
 * @param {object} state         已由 createGameState() 创建的目标
 * @param {object} data          serializeGameState 的产物
 * @param {object} [options]
 * @param {(modeData: object) => object} [options.modeFactory] 重建模式适配器
 * @returns {boolean} 是否成功
 */
export function deserializeGameState(state, data, options = {}) {
  if (!data || !data.state || !Array.isArray(data.state.players)) {
    return false;
  }
  if (data.version !== SAVE_VERSION) {
    // 旧存档按约定作废(不做迁移)
    return false;
  }

  const s = data.state;

  state.players = s.players.map(normalizePlayer);

  for (const key of STATE_FIELDS) {
    if (s[key] === undefined) continue;
    state[key] = structuredClone(s[key]);
  }

  // v3.5：塔 / 召唤物 / uid 计数（旧档没有，补空数组）
  if (!Array.isArray(state.towers)) state.towers = [];
  if (!Array.isArray(state.summons)) state.summons = [];
  if (state.unitSeq === undefined) state.unitSeq = 0;

  // 嵌套结构兜底:旧档可能缺 turn / pending
  if (!state.turn || typeof state.turn !== "object") {
    state.turn = {
      extraAction: false,
      suspend: null,
      resync: false,
      savedBy: null,
    };
  } else {
    state.turn = {
      extraAction: !!state.turn.extraAction,
      suspend: state.turn.suspend ?? null,
      resync: !!state.turn.resync,
      savedBy: state.turn.savedBy ?? null,
    };
  }
  if (state.pending === undefined) state.pending = null;
  if (state.deckCount === undefined) state.deckCount = 2;

  state.deck = (s.deck || []).map((c) => ({ ...c }));
  state.grave = (s.grave || []).map((c) => ({ ...c }));
  state.weatherDeck = (s.weatherDeck || []).map((c) => ({ ...c }));

  // 运行时量不入档,读档时重置
  state.soundQueue = [];
  state.soundSeq = 0;
  state.idSeq = Math.max(state.idSeq ?? 0, 1e12);

  // 存档点不还原(旧实现同样丢弃)
  state.players.forEach((p) => {
    p.effects.savepoint = null;
  });

  // 重建模式
  state.mode = options.modeFactory ? options.modeFactory(data.mode) : null;

  return true;
}

/** 兼容旧调用:返回一个新建的空白局面骨架(便于测试) */
export function createEmptySaveState() {
  return { players: [], ...createPlayerDefaults() };
}
