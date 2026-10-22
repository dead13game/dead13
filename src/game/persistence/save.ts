// 存档 / 读档 — schema 驱动,不再手抄字段清单
//
// 格式:
//   { version: 4, savedAt, mode: { id, ...自定义 }, state: { ... } }
//
// 读档必须重建 mode(它含函数,不能进 JSON),由调用方提供 modeFactory。

import { createPlayerDefaults } from "../core/player.js";
import {
  SAVE_VERSION,
  STATE_FIELDS,
  normalizePlayer,
  pickState,
} from "./schema.js";
import type { SavedState, StateField } from "./schema.js";
import type { GameState, ModeAdapter, Player } from "../types.js";

/** 存档里的模式段:id 必填,其余由各模式的 serialize() 追加 */
export interface SaveModeData {
  id: string;
  [key: string]: unknown;
}

/** 存档文件:公开格式(version 是数字而非字面量,旧档要靠它拒绝) */
export interface SaveFile {
  version: number;
  savedAt: string;
  mode: SaveModeData;
  state: SavedState;
  /** extra 里的附加信息(联赛/世界杯赛程上下文等) */
  [key: string]: unknown;
}

/** 读档选项 */
export interface DeserializeOptions {
  /** 重建模式适配器(模式含函数,不能进 JSON) */
  modeFactory?: (modeData: unknown) => ModeAdapter | null;
}

/** 外部输入(存档 JSON)收窄:非数组的普通对象 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * 按 STATE_FIELDS 写入一个局面字段。
 * 存档值是外部 JSON,未经 schema 校验,故按存档契约断言成目标字段类型;
 * 键本身由 StateField 约束,拼错字段名会编译失败。
 */
function assignStateField<K extends StateField>(
  state: GameState,
  key: K,
  value: unknown,
): void {
  state[key] = value as GameState[K];
}

/**
 * 序列化为可 JSON 存储的纯对象。
 * @param state
 * @param extra 额外附加信息(如联赛/世界杯的赛程上下文)
 */
export function serializeGameState(
  state: GameState,
  extra: Record<string, unknown> = {},
): SaveFile {
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
 * @param state         已由 createGameState() 创建的目标
 * @param data          serializeGameState 的产物(外部 JSON,先收窄再用)
 * @param options.modeFactory 重建模式适配器
 * @returns 是否成功
 */
export function deserializeGameState(
  state: GameState,
  data: unknown,
  options: DeserializeOptions = {},
): boolean {
  if (!isRecord(data)) return false;
  const rawState = data.state;
  if (!isRecord(rawState) || !Array.isArray(rawState.players)) {
    return false;
  }
  if (data.version !== SAVE_VERSION) {
    // 旧存档按约定作废(不做迁移)
    return false;
  }

  // 不变量:version 匹配 ⇒ 结构由 serializeGameState/pickState 产出
  const s = rawState as SavedState;

  state.players = s.players.map((p) => normalizePlayer(p));

  for (const key of STATE_FIELDS) {
    if (s[key] === undefined) continue;
    assignStateField(state, key, structuredClone(s[key]));
  }

  // v3.5：塔 / 召唤物 / uid 计数（旧档没有，补空数组）
  if (!Array.isArray(state.towers)) state.towers = [];
  if (!Array.isArray(state.summons)) state.summons = [];
  // 旧档可能没有 unitSeq(类型上必填,读档期按可能缺字段处理)
  if ((state.unitSeq as number | undefined) === undefined) state.unitSeq = 0;
  // 抽牌动画事件是运行时量，读档后清空
  state.drawFeed = [];
  state.drawSeq = 0;

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
  // 旧档可能缺 pending(类型上可为 null,但不允许 undefined)
  if ((state.pending as GameState["pending"] | undefined) === undefined) {
    state.pending = null;
  }
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
export function createEmptySaveState(): Player & { players: Player[] } {
  return { players: [], ...createPlayerDefaults() };
}
