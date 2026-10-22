// 存档 schema — 一份声明,三处复用(序列化 / 读档补默认值 / 菜月昴快照)
//
// 旧实现的问题:Player 字段清单被手抄了三遍
//   serialize.js · deserializeGameState · caiyueang.deepCloneState
// 加一个字段必漏一处。这里的 FIELD 列表是唯一真相。

import { createPlayerDefaults } from "../core/player.js";
import type {
  Card,
  CharState,
  GameState,
  Player,
  WeatherCard,
} from "../types.js";

export const SAVE_VERSION = 4;

/** 局面级字段(不含 devLog / soundQueue 等运行时量) */
export const STATE_FIELDS = [
  "currentPlayerIndex",
  "phase",
  "step",
  "pending",
  "round",
  "peaceRounds",
  "peaceStartRound",
  "currentWeather",
  "nextWeather",
  "useWeather",
  "messageLog",
  "gameOver",
  "winnerIndex",
  "turn",
  "idSeq",
  "deckCount",
  // v3.5：团战塔 / 召唤物 / 召唤物 uid 计数
  "towers",
  "summons",
  "unitSeq",
  // 兼容字段:UI/动画直接读,P6 收敛
  "pendingAttackCard",
  "pendingVentiCards",
  "scryCards",
  "pendingGamble",
] as const;

/** STATE_FIELDS 的元素类型(= GameState 的键,编译器保证清单与 GameState 同步) */
export type StateField = (typeof STATE_FIELDS)[number];

/** JSON 对象(存档深拷贝 / 编解码的中间形态) */
export type JsonObject = Record<string, unknown>;

/** 外部输入(存档 JSON)收窄:非数组的普通对象 */
function isJsonObject(v: unknown): v is JsonObject {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * 存档里的值:encodeValue 只把 Infinity / -Infinity / NaN 编码成字符串,
 * 其余原样 —— 于是数字字段读回来时类型是 number | string。
 */
export type Saved<T> = T extends number
  ? number | string
  : T extends readonly (infer U)[]
    ? Saved<U>[]
    : T extends object
      ? { [K in keyof T]: Saved<T[K]> }
      : T;

/** 存档里的一名玩家(字段与 Player 同构,数字可能是编码后的字符串) */
export type SavedPlayer = Saved<Player>;

/** 存档里的局面段(pickState 的产物) */
export type SavedState = Saved<Pick<GameState, StateField>> & {
  players: SavedPlayer[];
  deck: Card[];
  grave: Card[];
  weatherDeck: WeatherCard[];
  /** 存档是开放格式:未声明的扩展字段按 unknown 读 */
  [key: string]: unknown;
};

/**
 * JSON 存不下 Infinity / NaN(会变成 null),而 6/7 号角色的
 * maxUses 就是 Infinity。存档前统一编码成字符串,读档时再还原。
 */
const NON_FINITE = new Set(["Infinity", "-Infinity", "NaN"]);

/** 兼容 Vue reactive Proxy：structuredClone 不能克隆 Proxy，改用递归深拷贝（保留 Infinity） */
export function clonePlain<T>(v: T): T {
  if (Array.isArray(v)) {
    // 不变量:数组逐元素深拷贝后与原值同构(元素类型不变)
    return v.map((item: unknown) => clonePlain(item)) as unknown as T;
  }
  if (isJsonObject(v)) {
    const out: JsonObject = {};
    for (const key of Object.keys(v)) out[key] = clonePlain(v[key]);
    // 不变量:对象逐键深拷贝后与原值同构(键与值类型都不变)
    return out as unknown as T;
  }
  return v;
}

export function encodeValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(encodeValue);
  if (isJsonObject(v)) {
    const out: JsonObject = {};
    for (const k of Object.keys(v)) out[k] = encodeValue(v[k]);
    return out;
  }
  if (typeof v === "number" && !Number.isFinite(v)) return String(v);
  return v;
}

export function decodeValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodeValue);
  if (isJsonObject(v)) {
    const out: JsonObject = {};
    for (const k of Object.keys(v)) out[k] = decodeValue(v[k]);
    return out;
  }
  if (typeof v === "string" && NON_FINITE.has(v)) return Number(v);
  return v;
}

/**
 * 分区合并:以默认值为底,用存档里的同名分区覆盖。
 * 存档分区与 T 同构(JSON 对象),故合并结果可直接当 T 用。
 */
function mergePartition<T extends object>(base: T, patch: unknown): T {
  return { ...base, ...(isJsonObject(patch) ? patch : {}) } as T;
}

/** 存档契约:defensePile 是牌数组,缺失/假值按空数组(与旧实现的 `|| []` 一致) */
function savedCardList(v: unknown): Card[] {
  return (v as Card[] | undefined) || [];
}

/** 存档契约:牌是 JSON 对象,逐字段复制(与旧实现的 `{ ...card }` 一致) */
function copySavedCard(v: unknown): Card {
  // 存档里的牌与 Card 同构(外部 JSON 未经校验),断言只发生在读档边界
  return { ...(isJsonObject(v) ? v : {}) } as unknown as Card;
}

/**
 * 角色私有槽位白名单。
 * CharState 的槽是可枚举的有限集合,所以逐槽校验:类型不符或未知槽一律丢弃。
 * 旧代码从未写过这 6 个以外的槽(角色 stateSchema 只声明其中 4 个,
 * targetUid/targetKind 由砂狼白子的无人机在 flow 里写入),因此没有兼容性损失。
 */
function normalizeCharState(v: unknown): CharState {
  const raw: JsonObject = isJsonObject(v) ? v : {};
  const out: CharState = {};
  if (typeof raw.chorus === "number") out.chorus = raw.chorus;
  if (typeof raw.moonPhase === "number") out.moonPhase = raw.moonPhase;
  if (typeof raw.fightingSpirit === "number") out.fightingSpirit = raw.fightingSpirit;
  if (typeof raw.attackStreak === "number") out.attackStreak = raw.attackStreak;
  if (typeof raw.targetUid === "number") out.targetUid = raw.targetUid;
  if (
    raw.targetKind === "hero" ||
    raw.targetKind === "tower" ||
    raw.targetKind === "drone"
  ) {
    out.targetKind = raw.targetKind;
  }
  return out;
}

/**
 * 把一份「可能来自旧存档 / 缺字段」的 player 补齐成当前 schema。
 * 嵌套分区逐层合并,避免整块覆盖丢默认值。
 */
export function normalizePlayer(input: unknown = {}): Player {
  // decodeValue 已把 "Infinity" 之类的编码还原成数字
  const decoded = decodeValue(input);
  // 不变量:存档里的 player 是 JSON 对象;非对象按空对象处理(缺的字段全由默认值补)
  const raw: JsonObject = isJsonObject(decoded) ? decoded : {};
  const d = createPlayerDefaults();
  return {
    ...mergePartition(d, raw),
    resources: mergePartition(d.resources, raw.resources),
    effects: mergePartition(d.effects, raw.effects),
    relations: mergePartition(d.relations, raw.relations),
    artifact: mergePartition(d.artifact, raw.artifact),
    ai: mergePartition(d.ai, raw.ai),
    char: normalizeCharState(raw.char),
    defensePile: savedCardList(raw.defensePile).map((c) => ({ ...c })),
    trap: raw.trap ? copySavedCard(raw.trap) : null,
    bait: raw.bait ? copySavedCard(raw.bait) : null,
  };
}

/** 存档里的玩家:存档点自身不入档(旧实现同样置 null) */
export function playerToSave(p: Player): SavedPlayer {
  const copy = clonePlain(p);
  if (copy.effects) copy.effects.savepoint = null;
  // 不变量:encodeValue 与 Saved<T> 同构(只把非有限数字变成字符串)
  return encodeValue(copy) as SavedPlayer;
}

/** 局面快照(序列化与菜月昴快照共用) */
export function pickState(state: GameState): SavedState {
  const out: JsonObject = {};
  for (const key of STATE_FIELDS) {
    const v = state[key];
    out[key] = v === undefined ? null : clonePlain(v);
  }
  out.players = state.players.map(playerToSave);
  out.deck = state.deck.map((c) => ({ ...c }));
  out.grave = state.grave.map((c) => ({ ...c }));
  out.weatherDeck = (state.weatherDeck || []).map((c) => ({ ...c }));
  // 不变量:键集合就是 STATE_FIELDS + players/deck/grave/weatherDeck
  return out as SavedState;
}
