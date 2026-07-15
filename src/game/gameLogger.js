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

// ===== 日志等级 =====
export const LogLevel = { DEBUG: 0, INFO: 1, WARN: 2 };
let currentLevel = LogLevel.DEBUG;
export function setLogLevel(level) {
  currentLevel = level;
}

if (typeof window !== "undefined") {
  window.__GAME_LOG_LEVEL__ = LogLevel.DEBUG;
  Object.defineProperty(window, "__GAME_LOG_LEVEL__", {
    get() {
      return currentLevel;
    },
    set(v) {
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
const TYPE_CAT_MAP = {
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
};

// CAT → 默认 LOG_TYPE（向后兼容旧 CAT 调用）
const CAT_DEFAULT_TYPE = {
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
function sanitize(obj, depth = 3, seen = new WeakSet()) {
  if (depth <= 0) return "[深度限制]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (seen.has(obj)) return "[循环引用]";
  seen.add(obj);
  if (Array.isArray(obj)) return obj.map((i) => sanitize(i, depth - 1, seen));
  // 卡牌对象
  if (obj.suit !== undefined && obj.rank !== undefined) {
    return {
      id: obj.id,
      display: `${obj.rank}${obj.suit}`,
      value: obj.value,
      faceUp: obj.faceUp,
      isShield: obj.isShield || false,
    };
  }
  // 玩家对象
  if (obj.characterId !== undefined && obj.index !== undefined) {
    return {
      index: obj.index,
      name: obj.name,
      characterId: obj.characterId,
      characterName: obj.characterName,
      hp: obj.hp,
      maxHp: obj.maxHp,
      alive: obj.alive,
      defCount: obj.defensePile?.length ?? 0,
      trapValue: obj.trap?.value ?? null,
      allyIndex: obj.allyIndex,
      allianceTurns: obj.allianceTurns,
    };
  }
  const result = {};
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] !== "function")
      result[key] = sanitize(obj[key], depth - 1, seen);
  }
  return result;
}

// ===== 格式化 =====
function formatTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

// ===== 核心函数：gameLog（方案定义） =====
export function gameLog(type, data = {}, level = LogLevel.DEBUG) {
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
export function createGameLogger(getState) {
  const entries = [];

  function _ctx() {
    try {
      return getState ? getState() : null;
    } catch {
      return null;
    }
  }

  /** 解析 typeOrCat → { type, cat } */
  function resolve(typeOrCat) {
    if (TYPE_CAT_MAP[typeOrCat])
      return { type: typeOrCat, cat: TYPE_CAT_MAP[typeOrCat] };
    if (CAT_DEFAULT_TYPE[typeOrCat])
      return { type: CAT_DEFAULT_TYPE[typeOrCat], cat: typeOrCat };
    return { type: typeOrCat, cat: "其他" };
  }

  function _log(levelObj, typeOrCat, msg, data) {
    const s = _ctx();
    const ts = Date.now();
    const { type, cat } = resolve(typeOrCat);

    // → 控制台：[game] JSON（Playwright 可抓取）
    gameLog(
      type,
      {
        round: s?.round ?? 0,
        playerIndex: s?.currentPlayerIndex ?? -1,
        playerName: s?.players?.[s?.currentPlayerIndex]?.name ?? "",
        phase: s?.phase ?? "",
        step: s?.step ?? "",
        ...data,
      },
      levelObj.priority,
    );

    // → UI 面板：结构化条目
    const entry = {
      ts,
      level: levelObj.id,
      type,
      cat,
      round: s?.round ?? 0,
      turn: s?.players?.[s?.currentPlayerIndex]?.name ?? "",
      msg,
      data: data !== undefined ? sanitize(data) : undefined,
    };

    if (entries.length >= MAX_ENTRIES) entries.splice(0, PRUNE_COUNT);
    entries.push(entry);
  }

  return {
    entries,
    debug(typeOrCat, msg, data) {
      _log(LEVEL.DEBUG, typeOrCat, msg, data);
    },
    info(typeOrCat, msg, data) {
      _log(LEVEL.INFO, typeOrCat, msg, data);
    },
    warn(typeOrCat, msg, data) {
      _log(LEVEL.WARN, typeOrCat, msg, data);
    },
    error(typeOrCat, msg, data) {
      _log(LEVEL.ERROR, typeOrCat, msg, data);
    },

    /** HP 变化（统一事件） */
    hpChange(pi, pn, from, to, delta, reason, extra = {}) {
      _log(
        LEVEL.DEBUG,
        LOG_TYPE.HP_CHANGE,
        `${pn} HP ${from}→${to} (${delta >= 0 ? "+" : ""}${delta}) ${reason}`,
        { playerIndex: pi, playerName: pn, from, to, delta, reason, ...extra },
      );
    },

    /** 步骤切换 */
    stepChange(from, to, extra = {}) {
      _log(LEVEL.DEBUG, LOG_TYPE.STEP_CHANGE, `步骤: ${from} → ${to}`, {
        from,
        to,
        ...extra,
      });
    },

    exportText() {
      return _formatExport(entries);
    },
    getEntries() {
      return entries;
    },
    clear() {
      entries.length = 0;
    },
  };
}

// ===== 导出文本 =====
function _formatExport(entries) {
  if (entries.length === 0) return "(日志为空)";
  const counts = {};
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

  const icons = { DEBUG: "●", INFO: "ℹ", WARN: "⚠", ERROR: "✖" };
  const body = entries
    .map((e) => {
      const icon = icons[e.level] || "·";
      let line = `${icon} [${formatTime(e.ts)}] [${e.level}] [${e.type}] [${e.cat}] [回合${e.round}] ${e.turn ? e.turn + " " : ""}${e.msg}`;
      if (e.data && Object.keys(e.data).length > 0) {
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
