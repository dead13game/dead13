// 存档 schema — 一份声明,三处复用(序列化 / 读档补默认值 / 菜月昴快照)
//
// 旧实现的问题:Player 字段清单被手抄了三遍
//   serialize.js · deserializeGameState · caiyueang.deepCloneState
// 加一个字段必漏一处。这里的 FIELD 列表是唯一真相。

import { createPlayerDefaults } from "../core/player.js";

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
  // 兼容字段:UI/动画直接读,P6 收敛
  "pendingAttackCard",
  "pendingVentiCards",
  "scryCards",
  "pendingGamble",
];

/**
 * JSON 存不下 Infinity / NaN(会变成 null),而 6/7 号角色的
 * maxUses 就是 Infinity。存档前统一编码成字符串,读档时再还原。
 */
const NON_FINITE = new Set(["Infinity", "-Infinity", "NaN"]);

export function encodeValue(v) {
  if (Array.isArray(v)) return v.map(encodeValue);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v)) out[k] = encodeValue(v[k]);
    return out;
  }
  if (typeof v === "number" && !Number.isFinite(v)) return String(v);
  return v;
}

export function decodeValue(v) {
  if (Array.isArray(v)) return v.map(decodeValue);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v)) out[k] = decodeValue(v[k]);
    return out;
  }
  if (typeof v === "string" && NON_FINITE.has(v)) return Number(v);
  return v;
}

/**
 * 把一份「可能来自旧存档 / 缺字段」的 player 补齐成当前 schema。
 * 嵌套分区逐层合并,避免整块覆盖丢默认值。
 */
export function normalizePlayer(input = {}) {
  const raw = decodeValue(input);
  const d = createPlayerDefaults();
  return {
    ...d,
    ...raw,
    resources: { ...d.resources, ...(raw.resources || {}) },
    effects: { ...d.effects, ...(raw.effects || {}) },
    relations: { ...d.relations, ...(raw.relations || {}) },
    artifact: { ...d.artifact, ...(raw.artifact || {}) },
    ai: { ...d.ai, ...(raw.ai || {}) },
    char: { ...(raw.char || {}) },
    defensePile: (raw.defensePile || []).map((c) => ({ ...c })),
    trap: raw.trap ? { ...raw.trap } : null,
    bait: raw.bait ? { ...raw.bait } : null,
  };
}

/** 存档里的玩家:存档点自身不入档(旧实现同样置 null) */
export function playerToSave(p) {
  const copy = structuredClone(p);
  if (copy.effects) copy.effects.savepoint = null;
  return encodeValue(copy);
}

/** 局面快照(序列化与菜月昴快照共用) */
export function pickState(state) {
  const out = {};
  for (const key of STATE_FIELDS) {
    const v = state[key];
    out[key] = v === undefined ? null : structuredClone(v);
  }
  out.players = state.players.map(playerToSave);
  out.deck = state.deck.map((c) => ({ ...c }));
  out.grave = state.grave.map((c) => ({ ...c }));
  out.weatherDeck = (state.weatherDeck || []).map((c) => ({ ...c }));
  return out;
}
