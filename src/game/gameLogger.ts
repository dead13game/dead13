/**
 * 游戏逻辑日志系统 — 零依赖纯 JS 模块
 *
 * 两层设计：
 * 1. gameLog(type, data, level) — 底层，输出 [game] JSON 到 console（Playwright 可抓取）
 * 2. createGameLogger(getState) — 上层，自动填状态上下文 + 存储条目供 DevLogPanel
 *
 * 用法：
 *   import { gameLog, createGameLogger, LOG_TYPE, LogLevel } from './gameLogger.js';
 *   gameLog('hp_change', { playerIndex:1, from:10, to:5, delta:-5, reason:'attack' });
 *   const logger = createGameLogger(() => state);
 *   logger.info(CAT.DAMAGE, '扣血', { before: 10, after: 5 }); // 兼容旧 CAT
 *   logger.info(LOG_TYPE.ATTACK_START, '攻击开始', { cardValue: 13 }); // 新 LOG_TYPE
 *
 * 控制台过滤：console.filter('[game]') 筛选所有日志
 * 动态等级：window.__GAME_LOG_LEVEL__ = 0|1|2
 */

// 宿主调试开关是 src/game 里唯一被允许触碰 window 的地方（见 guard/scan.ts 注释）。
// 只在此处声明全局形状，避免用 any 绕过类型检查。
declare global {
  interface Window {
    /** 日志等级：0 调试 / 1 信息 / 2 警告（DevLogPanel 与 Playwright 可热调） */
    __GAME_LOG_LEVEL__?: number;
  }
}

// ===== 日志等级 =====
export const LogLevel = { DEBUG: 0, INFO: 1, WARN: 2 };
let currentLevel = LogLevel.DEBUG;
export function setLogLevel(level: number): void {
  currentLevel = level;
}

if (typeof window !== "undefined") {
  window.__GAME_LOG_LEVEL__ = LogLevel.DEBUG;
  Object.defineProperty(window, "__GAME_LOG_LEVEL__", {
    get() {
      return currentLevel;
    },
    set(v: number) {
      currentLevel = v;
    },
    configurable: true,
  });
}

// ===== 兼容旧 API 的级别对象 =====
export const LEVEL = {
  DEBUG: { id: "DEBUG", label: "调试", priority: 0 },
  INFO: { id: "INFO", label: "信息", priority: 1 },
  WARN: { id: "WARN", label: "警告", priority: 2 },
  ERROR: { id: "ERROR", label: "错误", priority: 3 },
};

// ===== 事件类型（与方案对齐） =====
export const LOG_TYPE = {
  TURN_START: "turn_start",
  TURN_END: "turn_end",
  PHASE_CHANGE: "phase_change",
  STEP_CHANGE: "step_change",
  GAME_OVER: "game_over",
  GAME_INIT: "game_init",
  ATTACK_START: "attack_start",
  ATTACK_DRAW: "attack_draw",
  ATTACK_TARGET: "attack_target",
  ATTACK_EXEC: "attack_execute",
  ATTACK_RESULT: "attack_result",
  DAMAGE_CALC: "damage_calc",
  DEFENSE_START: "defense_start",
  DEFENSE_DRAW: "defense_draw",
  DEFENSE_PLACE: "defense_place",
  GAMBLE_START: "gamble_start",
  GAMBLE_CARDS: "gamble_cards",
  GAMBLE_RESULT: "gamble_result",
  TRAP_TRIGGER: "trap_trigger",
  HP_CHANGE: "hp_change",
  SKILL_USE: "skill_use",
  SKILL_EFFECT: "skill_effect",
  STATUS_ADD: "status_add",
  STATUS_REMOVE: "status_remove",
  STATUS_TICK: "status_tick",
  ALLY_FORM: "ally_form",
  ALLY_BREAK: "ally_break",
  BETRAYAL: "betrayal",
  WEATHER_CHANGE: "weather_change",
  WEATHER_EFFECT: "weather_effect",
  DECK_DRAW: "deck_draw",
  GRAVE_RESHUFFLE: "grave_reshuffle",
  AI_DECISION: "ai_decision",
  ANOMALY: "anomaly",
  GAMBLE_PENALTY_START: "gamble_penalty_start",
  GAMBLE_PENALTY_END: "gamble_penalty_end",
  GAMBLE_CONSECUTIVE: "gamble_consecutive",
  GAME_SAVE: "game_save",
  GAME_LOAD: "game_load",
  // ==== solo 单机模式（爬塔）====
  SOLO_NODE: "solo_node",
  SOLO_POKER_DRAW: "solo_poker_draw",
  SOLO_POKER_PICK: "solo_poker_pick",
  SOLO_SKILL_DRAW: "solo_skill_draw",
  SOLO_CARD_PLAY: "solo_card_play",
  SOLO_DAMAGE: "solo_damage",
  SOLO_SHIELD: "solo_shield",
  SOLO_SPIRIT: "solo_spirit",
  SOLO_ENEMY_TURN: "solo_enemy_turn",
  SOLO_REWARD: "solo_reward",
  SOLO_EVENT: "solo_event",
  SOLO_END: "solo_end",
  SOLO_SAVE: "solo_save",
  SOLO_LOAD: "solo_load",
};

// ===== 分类（中文标签，用于 DevLogPanel 过滤，兼容旧代码） =====
export const CAT = {
  STATE: "状态",
  ATTACK: "攻击",
  DEFENSE: "防御",
  DAMAGE: "伤害",
  SKILL: "技能",
  GAMBLE: "赌命",
  ALLIANCE: "联盟",
  WEATHER: "天气",
  DECK: "牌库",
  AI: "AI",
  ANOMALY: "异常",
};

// LOG_TYPE → CAT 映射
const TYPE_CAT_MAP: Record<string, string> = {
  turn_start: CAT.STATE,
  turn_end: CAT.STATE,
  phase_change: CAT.STATE,
  step_change: CAT.STATE,
  game_over: CAT.STATE,
  game_init: CAT.STATE,
  attack_start: CAT.ATTACK,
  attack_draw: CAT.ATTACK,
  attack_target: CAT.ATTACK,
  damage_calc: CAT.DAMAGE,
  attack_execute: CAT.DAMAGE,
  attack_result: CAT.ATTACK,
  defense_start: CAT.DEFENSE,
  defense_draw: CAT.DEFENSE,
  defense_place: CAT.DEFENSE,
  gamble_start: CAT.GAMBLE,
  gamble_cards: CAT.GAMBLE,
  gamble_result: CAT.GAMBLE,
  trap_trigger: CAT.GAMBLE,
  hp_change: CAT.DAMAGE,
  skill_use: CAT.SKILL,
  skill_effect: CAT.SKILL,
  status_add: CAT.STATE,
  status_remove: CAT.STATE,
  status_tick: CAT.STATE,
  ally_form: CAT.ALLIANCE,
  ally_break: CAT.ALLIANCE,
  betrayal: CAT.ALLIANCE,
  weather_change: CAT.WEATHER,
  weather_effect: CAT.WEATHER,
  deck_draw: CAT.DECK,
  grave_reshuffle: CAT.DECK,
  ai_decision: CAT.AI,
  anomaly: CAT.ANOMALY,
  gamble_penalty_start: CAT.GAMBLE,
  gamble_penalty_end: CAT.GAMBLE,
  gamble_consecutive: CAT.GAMBLE,
  game_save: CAT.STATE,
  game_load: CAT.STATE,
  solo_node: CAT.STATE,
  solo_poker_draw: CAT.DECK,
  solo_poker_pick: CAT.DECK,
  solo_skill_draw: CAT.DECK,
  solo_card_play: CAT.ATTACK,
  solo_damage: CAT.DAMAGE,
  solo_shield: CAT.DEFENSE,
  solo_spirit: CAT.STATE,
  solo_enemy_turn: CAT.AI,
  solo_reward: CAT.STATE,
  solo_event: CAT.STATE,
  solo_end: CAT.STATE,
  solo_save: CAT.STATE,
  solo_load: CAT.STATE,
  uni_init: CAT.STATE,
  uni_floor: CAT.STATE,
  uni_region: CAT.STATE,
  uni_choose: CAT.STATE,
  uni_shards: CAT.STATE,
  uni_revive: CAT.STATE,
  uni_gameover: CAT.STATE,
  uni_save: CAT.STATE,
  uni_load: CAT.STATE,
};

// CAT → 默认 LOG_TYPE（向后兼容旧 CAT 调用）
const CAT_DEFAULT_TYPE: Record<string, string> = {
  [CAT.STATE]: LOG_TYPE.STEP_CHANGE,
  [CAT.ATTACK]: LOG_TYPE.ATTACK_EXEC,
  [CAT.DEFENSE]: LOG_TYPE.DEFENSE_PLACE,
  [CAT.DAMAGE]: LOG_TYPE.HP_CHANGE,
  [CAT.SKILL]: LOG_TYPE.SKILL_USE,
  [CAT.GAMBLE]: LOG_TYPE.GAMBLE_RESULT,
  [CAT.ALLIANCE]: LOG_TYPE.ALLY_FORM,
  [CAT.WEATHER]: LOG_TYPE.WEATHER_EFFECT,
  [CAT.DECK]: LOG_TYPE.DECK_DRAW,
  [CAT.AI]: LOG_TYPE.AI_DECISION,
  [CAT.ANOMALY]: LOG_TYPE.ANOMALY,
};

// ===== 容量控制 =====
const MAX_ENTRIES = 2000;
const PRUNE_COUNT = 500;

// ===== 数据清理 =====
// depth 5：确保事件 outcome.fx（第 3 层）等奖励数值在日志中完整可见（此前 3 层把 fx 截断为 [深度限制]）
function sanitize(obj: unknown, depth = 5, seen = new WeakSet<object>()): unknown {
  if (depth <= 0) return "[深度限制]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (seen.has(obj)) return "[循环引用]";
  seen.add(obj);
  if (Array.isArray(obj)) return obj.map((i) => sanitize(i, depth - 1, seen));
  // 快照里是任意运行时形状（卡牌 / 玩家 / 普通对象），统一按 Record 读取；
  // 这里只放宽「读」的类型，输出字段与顺序与迁移前完全一致。
  const rec = obj as Record<string, unknown>;
  // 卡牌对象
  if (rec.suit !== undefined && rec.rank !== undefined) {
    return {
      id: rec.id,
      display: `${rec.rank}${rec.suit}`,
      value: rec.value,
      faceUp: rec.faceUp,
      isShield: rec.isShield || false,
    };
  }
  // 玩家对象
  if (rec.characterId !== undefined && rec.index !== undefined) {
    const trap = readObject(rec.trap);
    const relations = readObject(rec.relations);
    return {
      index: rec.index,
      name: rec.name,
      characterId: rec.characterId,
      hp: rec.hp,
      maxHp: rec.maxHp,
      alive: rec.alive,
      defCount: Array.isArray(rec.defensePile) ? rec.defensePile.length : 0,
      trapValue: trap ? (trap.value ?? null) : null,
      allyIndex: relations?.allyIndex,
      allianceTurns: relations?.allianceTurns,
    };
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(rec)) {
    if (typeof rec[key] !== "function")
      result[key] = sanitize(rec[key], depth - 1, seen);
  }
  return result;
}

/** 把 unknown 收窄成可读对象；非对象返回 null（保持原 `a?.b ?? x` 的兜底语义） */
function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

// ===== 格式化 =====
function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

// ===== 核心函数：gameLog（方案定义） =====
export function gameLog(
  type: string,
  data: Record<string, unknown> = {},
  level: number = LogLevel.DEBUG,
): void {
  if (level < currentLevel) return;
  const entry = { ts: Date.now(), type, ...data };
  if (typeof console !== "undefined") {
    const json = JSON.stringify(entry);
    if (level >= LogLevel.WARN) console.warn(`[game] ${json}`);
    else if (level >= LogLevel.INFO) console.info(`[game] ${json}`);
    else console.debug(`[game] ${json}`);
  }
}

// ===== 上层工厂：createGameLogger =====

/**
 * 日志上下文的只读视图（getState 的返回值）。
 * 全部字段可选：经典 / 联赛 / 世界杯 / 单机各有自己的 state 结构，
 * 日志器只按需读取这几个字段，缺省时用与原实现一致的兜底值。
 */
export interface LogContext {
  round?: number;
  currentPlayerIndex?: number;
  players?: { name?: string }[];
  phase?: string;
  step?: string;
}

/** DevLogPanel 消费的结构化条目 */
export interface LogEntry {
  ts: number;
  level: string;
  type: string;
  cat: string;
  round: number;
  turn: string;
  msg: string;
  data?: unknown;
}

/** 级别对象（LEVEL 的成员） */
interface LevelInfo {
  id: string;
  label: string;
  priority: number;
}

export function createGameLogger(getState?: (() => LogContext | null) | null) {
  const entries: LogEntry[] = [];

  function _ctx(): LogContext | null {
    try {
      return getState ? getState() : null;
    } catch {
      return null;
    }
  }

  /** 解析 typeOrCat → { type, cat } */
  function resolve(typeOrCat: string): { type: string; cat: string } {
    if (TYPE_CAT_MAP[typeOrCat])
      return { type: typeOrCat, cat: TYPE_CAT_MAP[typeOrCat] };
    if (CAT_DEFAULT_TYPE[typeOrCat])
      return { type: CAT_DEFAULT_TYPE[typeOrCat], cat: typeOrCat };
    return { type: typeOrCat, cat: "其他" };
  }

  function _log(
    levelObj: LevelInfo,
    typeOrCat: string,
    msg: string,
    data?: Record<string, unknown>,
  ): void {
    const s = _ctx();
    const ts = Date.now();
    const { type, cat } = resolve(typeOrCat);
    const playerIndex = s?.currentPlayerIndex ?? -1;

    // → 控制台：[game] JSON（Playwright 可抓取）
    gameLog(
      type,
      {
        round: s?.round ?? 0,
        playerIndex,
        playerName: s?.players?.[playerIndex]?.name ?? "",
        phase: s?.phase ?? "",
        step: s?.step ?? "",
        ...data,
      },
      levelObj.priority,
    );

    // → UI 面板：结构化条目
    const entry: LogEntry = {
      ts,
      level: levelObj.id,
      type,
      cat,
      round: s?.round ?? 0,
      turn: s?.players?.[playerIndex]?.name ?? "",
      msg,
      data: data !== undefined ? sanitize(data) : undefined,
    };

    if (entries.length >= MAX_ENTRIES) entries.splice(0, PRUNE_COUNT);
    entries.push(entry);
  }

  return {
    entries,
    debug(typeOrCat: string, msg: string, data?: Record<string, unknown>): void {
      _log(LEVEL.DEBUG, typeOrCat, msg, data);
    },
    info(typeOrCat: string, msg: string, data?: Record<string, unknown>): void {
      _log(LEVEL.INFO, typeOrCat, msg, data);
    },
    warn(typeOrCat: string, msg: string, data?: Record<string, unknown>): void {
      _log(LEVEL.WARN, typeOrCat, msg, data);
    },
    error(typeOrCat: string, msg: string, data?: Record<string, unknown>): void {
      _log(LEVEL.ERROR, typeOrCat, msg, data);
    },

    /** HP 变化（统一事件） */
    hpChange(
      pi: number,
      pn: string,
      from: number,
      to: number,
      delta: number,
      reason: string,
      extra: Record<string, unknown> = {},
    ): void {
      _log(
        LEVEL.DEBUG,
        LOG_TYPE.HP_CHANGE,
        `${pn} HP ${from}→${to} (${delta >= 0 ? "+" : ""}${delta}) ${reason}`,
        { playerIndex: pi, playerName: pn, from, to, delta, reason, ...extra },
      );
    },

    /** 步骤切换 */
    stepChange(from: string, to: string, extra: Record<string, unknown> = {}): void {
      _log(LEVEL.DEBUG, LOG_TYPE.STEP_CHANGE, `步骤: ${from} → ${to}`, {
        from,
        to,
        ...extra,
      });
    },

    exportText(): string {
      return _formatExport(entries);
    },
    getEntries(): LogEntry[] {
      return entries;
    },
    clear(): void {
      entries.length = 0;
    },
  };
}

// ===== 导出文本 =====
function _formatExport(entries: LogEntry[]): string {
  if (entries.length === 0) return "(日志为空)";
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.level] = (counts[e.level] || 0) + 1;
  const countStr = Object.entries(counts)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  const firstTs = entries[0]?.ts,
    lastTs = entries[entries.length - 1]?.ts;
  const firstR = entries[0]?.round,
    lastR = entries[entries.length - 1]?.round;

  const header = [
    "═══════════════════════════════════════════",
    "  亡命十三街 — 开发调试日志",
    "═══════════════════════════════════════════",
    `  导出时间: ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    `  日志范围: ${new Date(firstTs).toLocaleString("zh-CN", { hour12: false })} ~ ${new Date(lastTs).toLocaleString("zh-CN", { hour12: false })}`,
    `  游戏回合: ${firstR} - ${lastR}`,
    `  总条目: ${entries.length} (${countStr})`,
    "═══════════════════════════════════════════",
    "",
  ].join("\n");

  const icons: Record<string, string> = {
    DEBUG: "●",
    INFO: "ℹ",
    WARN: "⚠",
    ERROR: "✖",
  };
  const body = entries
    .map((e) => {
      const icon = icons[e.level] || "·";
      let line = `${icon} [${formatTime(e.ts)}] [${e.level}] [${e.type}] [${e.cat}] [回合${e.round}] ${e.turn ? e.turn + " " : ""}${e.msg}`;
      // sanitize 的返回值在结构上可能是对象也可能是原始值，Object.keys 的判定语义与迁移前一致
      if (e.data && Object.keys(e.data as Record<string, unknown>).length > 0) {
        line +=
          "\n" +
          JSON.stringify(e.data, null, 2)
            .split("\n")
            .map((l) => `  │ ${l}`)
            .join("\n");
      }
      return line;
    })
    .join("\n");

  return header + body;
}
