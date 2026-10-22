// 世界杯锦标赛状态机 — 管理小组赛→淘汰赛的完整旅程
// 纯逻辑层，零依赖

import {
  AI_TEAM_NAMES,
  TEAM_EMOJIS,
  POINTS,
  KNOCKOUT_NAMES,
  KNOCKOUT_OPPONENT_POOLS,
} from "./worldCupConstants.js";
import { CHARACTERS } from "./characters/index.js";

/** 锦标赛阶段 */
export type WorldCupPhase = "group" | "knockout" | "champion" | "eliminated";

/** 小组赛一场的结果（主队胜 / 平 / 客队胜） */
export type GroupMatchOutcome = "home" | "draw" | "away";

/** 小组里的一支球队 */
export interface GroupTeam {
  name: string;
  isPlayer: boolean;
  emoji: string;
}

/** 小组赛一场比赛 */
export interface GroupMatchState {
  home: number;
  away: number;
  played: boolean;
  result: GroupMatchOutcome | null;
  isPlayerMatch: boolean;
}

/** 小组积分榜一行 */
export interface GroupStandingRow {
  index: number;
  name: string;
  emoji: string;
  isPlayer: boolean;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

/** 淘汰赛对手 */
export interface KnockoutOpponent {
  name: string;
  emoji: string;
  charId: number;
}

/** 小组出线判定 */
export interface GroupAdvancement {
  advanced: boolean;
  rank: number;
  needTiebreaker: boolean;
  standings: GroupStandingRow[];
}

/**
 * 世界杯锦标赛状态（独立于 GameState，由世界杯控制器持有）。
 * `_` 前缀为 v3.5 的内部簿记；控制器还会往 reactive 对象上挂别的编排字段，
 * 因此保留索引签名。
 */
export interface WorldCupState {
  phase: WorldCupPhase;
  playerTeamName: string;
  // 小组
  groupName: string;
  groupTeams: GroupTeam[];
  groupMatches: GroupMatchState[];
  groupStandings: GroupStandingRow[] | null;
  // 淘汰赛
  knockoutRound: string | null;
  knockoutOpponent: KnockoutOpponent | null;
  // 换人（仅淘汰赛）
  substitutionsLeft: number;
  // 当前比赛引用
  currentMatch: unknown;
  // v3.5：整届战绩（小组赛 + 淘汰赛，用于淘汰/夺冠总结）
  matchHistory: unknown[];
  // v3.5：本届已交手球队（避免淘汰赛重复抽到同一对手）
  _usedOpponents: string[];
  [extra: string]: unknown;
}

// ---- 工具函数 ----

/** 洗牌（Fisher-Yates） */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从 AI 名称池中随机选取不重复的 n 个名称 */
function pickRandomNames(
  pool: readonly string[],
  n: number,
  exclude: readonly string[] = [],
): string[] {
  const available = pool.filter((name) => !exclude.includes(name));
  return shuffle(available).slice(0, n);
}

// ---- 创建锦标赛状态 ----

/**
 * 创建世界杯锦标赛状态
 * @param playerTeamName 玩家队伍名称
 * @param opponentNamesOverride 小组赛对手名称（可选，保持与 UI 一致）
 */
export function createWorldCupState(
  playerTeamName: string,
  opponentNamesOverride?: string[],
): WorldCupState {
  // 为小组赛选取3个对手名称（可通过参数传入以保持与 UI 一致）
  const opponentNames = opponentNamesOverride
    ? [...opponentNamesOverride]
    : pickRandomNames(AI_TEAM_NAMES, 3, [playerTeamName]);
  const opponentEmojis = opponentNames.map(
    (name) => TEAM_EMOJIS[AI_TEAM_NAMES.indexOf(name)] || "🏳️",
  );

  return {
    phase: "group", // 'group' | 'knockout' | 'champion' | 'eliminated'
    playerTeamName,
    // 小组
    groupName: "A",
    groupTeams: [
      { name: playerTeamName, isPlayer: true, emoji: "⭐" },
      { name: opponentNames[0], isPlayer: false, emoji: opponentEmojis[0] },
      { name: opponentNames[1], isPlayer: false, emoji: opponentEmojis[1] },
      { name: opponentNames[2], isPlayer: false, emoji: opponentEmojis[2] },
    ],
    groupMatches: [], // 小组赛6场比赛
    groupStandings: null,
    // 淘汰赛
    knockoutRound: null, // 'R16' | 'QF' | 'SF' | 'Final' | null
    knockoutOpponent: null, // { name, emoji, charId }
    // 换人（仅淘汰赛）
    substitutionsLeft: 3,
    // 当前比赛引用
    currentMatch: null,
    // v3.5：整届战绩（小组赛 + 淘汰赛，用于淘汰/夺冠总结）
    matchHistory: [],
    // v3.5：本届已交手球队（避免淘汰赛重复抽到同一对手）
    _usedOpponents: [...opponentNames],
  };
}

// ---- 小组赛 ----

/** 初始化小组赛赛程（6场单循环） */
export function initGroupMatches(state: WorldCupState): void {
  // 4队单循环：6场比赛
  // 顺序：玩家(0)先打完3场，然后模拟其他3场
  state.groupMatches = [
    { home: 0, away: 1, played: false, result: null, isPlayerMatch: true },
    { home: 0, away: 2, played: false, result: null, isPlayerMatch: true },
    { home: 0, away: 3, played: false, result: null, isPlayerMatch: true },
    { home: 1, away: 2, played: false, result: null, isPlayerMatch: false },
    { home: 1, away: 3, played: false, result: null, isPlayerMatch: false },
    { home: 2, away: 3, played: false, result: null, isPlayerMatch: false },
  ];
}

/** 获取玩家需要参与的小组赛场次 */
export function getPlayerGroupMatches(state: WorldCupState): GroupMatchState[] {
  return state.groupMatches.filter((m) => m.isPlayerMatch && !m.played);
}

/** 获取下一个玩家需要打的小组赛（返回 match 索引或 -1） */
export function getNextPlayerGroupMatch(state: WorldCupState): number {
  return state.groupMatches.findIndex((m) => m.isPlayerMatch && !m.played);
}

/** 自动模拟所有非玩家小组赛（随机胜负平） */
export function simulateNonPlayerMatches(state: WorldCupState): void {
  state.groupMatches.forEach((match) => {
    if (match.isPlayerMatch || match.played) return;

    const r = Math.random();
    if (r < 0.4) {
      match.result = "home";
    } else if (r < 0.7) {
      match.result = "draw";
    } else {
      match.result = "away";
    }
    match.played = true;
  });
}

/** 记录玩家小组赛结果 */
export function recordGroupMatchResult(
  state: WorldCupState,
  matchIndex: number,
  result: GroupMatchOutcome,
): void {
  // result: 'home'=玩家胜, 'away'=对方胜, 'draw'=平
  const match = state.groupMatches[matchIndex];
  if (!match || match.played) return;
  match.result = result;
  match.played = true;
}

/** 计算小组积分榜 */
export function calculateGroupStandings(state: WorldCupState): GroupStandingRow[] {
  const teams = state.groupTeams.map((t, i) => ({
    index: i,
    name: t.name,
    emoji: t.emoji,
    isPlayer: t.isPlayer,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }));

  state.groupMatches.forEach((m) => {
    if (!m.played || !m.result) return;
    const home = teams[m.home];
    const away = teams[m.away];

    home.played++;
    away.played++;

    if (m.result === "home") {
      home.wins++;
      home.points += POINTS.WIN;
      away.losses++;
    } else if (m.result === "away") {
      away.wins++;
      away.points += POINTS.WIN;
      home.losses++;
    } else {
      home.draws++;
      away.draws++;
      home.points += POINTS.DRAW;
      away.points += POINTS.DRAW;
    }
    // 小组赛简化：每场比赛进1球（赢方1-0，平局0-0）
    if (m.result === "home") {
      home.goalsFor += 1;
      away.goalsAgainst += 1;
    } else if (m.result === "away") {
      away.goalsFor += 1;
      home.goalsAgainst += 1;
    }
  });

  // 排序：积分高→净胜球多→进球多
  teams.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return 0;
  });

  state.groupStandings = teams;
  return teams;
}

/**
 * 检查小组出线情况
 */
export function checkGroupAdvancement(state: WorldCupState): GroupAdvancement {
  const standings = state.groupStandings || calculateGroupStandings(state);
  const playerIdx = standings.findIndex((t) => t.isPlayer);
  const rank = playerIdx + 1;

  // 检查是否有同分情况（第2名和第3名同分时需要加赛）
  let needTiebreaker = false;
  if (standings.length >= 3) {
    const second = standings[1];
    const third = standings[2];
    if (second && third && second.points === third.points) {
      needTiebreaker = true;
    }
  }

  return {
    advanced: rank <= 2,
    rank,
    needTiebreaker: needTiebreaker && (rank === 2 || rank === 3),
    standings,
  };
}

// ---- 淘汰赛 ----

/**
 * 初始化淘汰赛对手（v3.5：按轮次从对应名单抽取，避开本届已交手球队）
 * @param state 锦标赛状态（提供 knockoutRound / _usedOpponents）
 */
export function initKnockoutOpponent(
  state: WorldCupState | null = null,
): KnockoutOpponent {
  const round = state?.knockoutRound || "R16";
  const pool = KNOCKOUT_OPPONENT_POOLS[round] || AI_TEAM_NAMES;
  const used = new Set<string>(state?._usedOpponents ?? []);
  let available = pool.filter((name) => !used.has(name));
  // 名单被抽空时退回整份名单，保证永远能开出对手
  if (available.length === 0) available = [...pool];

  const name = available[Math.floor(Math.random() * available.length)];
  const emoji = TEAM_EMOJIS[AI_TEAM_NAMES.indexOf(name)] || "🏳️";
  if (state) state._usedOpponents = [...used, name];

  // 随机选角色
  const chars = Object.values(CHARACTERS);
  const char = chars[Math.floor(Math.random() * chars.length)];

  return { name, emoji, charId: char.id };
}

/** 获取淘汰赛轮次中文名 */
export function getKnockoutRoundName(round: string): string {
  return KNOCKOUT_NAMES[round] || round;
}

/** 晋级下一轮淘汰赛 */
export function advanceKnockoutRound(state: WorldCupState): void {
  const order = ["R16", "QF", "SF", "Final", "champion"];
  // 未进入淘汰赛(null) 时 indexOf 也是 -1 → 走「初始进入 R16」分支，与原实现一致
  const currentIdx = order.indexOf(state.knockoutRound ?? "");

  if (currentIdx < 0) {
    // 初始进入淘汰赛
    state.knockoutRound = "R16";
  } else if (state.knockoutRound === "Final") {
    // 赢得决赛 → 冠军
    state.phase = "champion";
    state.knockoutRound = "champion";
    return;
  } else {
    // 晋级下一轮
    state.knockoutRound = order[currentIdx + 1];
  }

  // 生成新对手
  state.knockoutOpponent = initKnockoutOpponent(state);
}

/** 淘汰赛失利 */
export function eliminatePlayer(state: WorldCupState): void {
  state.phase = "eliminated";
}

// ---- 小组赛对手角色 ----

/** 为小组赛对手随机选取角色 */
export function getRandomGroupOpponentChar(): number {
  const chars = Object.values(CHARACTERS);
  const char = chars[Math.floor(Math.random() * chars.length)];
  return char.id;
}
