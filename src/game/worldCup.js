// 世界杯锦标赛状态机 — 管理小组赛→淘汰赛的完整旅程
// 纯逻辑层，零依赖

import { AI_TEAM_NAMES, TEAM_EMOJIS, POINTS } from "./worldCupConstants.js";
import { CHARACTERS } from "./constants.js";

// ---- 工具函数 ----

/** 洗牌（Fisher-Yates） */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从 AI 名称池中随机选取不重复的 n 个名称 */
function pickRandomNames(pool, n, exclude = []) {
  const available = pool.filter((name) => !exclude.includes(name));
  return shuffle(available).slice(0, n);
}

// ---- 创建锦标赛状态 ----

/**
 * 创建世界杯锦标赛状态
 * @param {string} playerTeamName - 玩家队伍名称
 */
export function createWorldCupState(playerTeamName, opponentNamesOverride) {
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
  };
}

// ---- 小组赛 ----

/** 初始化小组赛赛程（6场单循环） */
export function initGroupMatches(state) {
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
export function getPlayerGroupMatches(state) {
  return state.groupMatches.filter((m) => m.isPlayerMatch && !m.played);
}

/** 获取下一个玩家需要打的小组赛（返回 match 索引或 -1） */
export function getNextPlayerGroupMatch(state) {
  return state.groupMatches.findIndex((m) => m.isPlayerMatch && !m.played);
}

/** 自动模拟所有非玩家小组赛（随机胜负平） */
export function simulateNonPlayerMatches(state) {
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
export function recordGroupMatchResult(state, matchIndex, result) {
  // result: 'home'=玩家胜, 'away'=对方胜, 'draw'=平
  const match = state.groupMatches[matchIndex];
  if (!match || match.played) return;
  match.result = result;
  match.played = true;
}

/** 计算小组积分榜 */
export function calculateGroupStandings(state) {
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
 * @returns {{ advanced: boolean, rank: number, needTiebreaker: boolean }}
 */
export function checkGroupAdvancement(state) {
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
 * 初始化淘汰赛对手
 * @returns {{ name, emoji, charId }}
 */
export function initKnockoutOpponent() {
  const name = AI_TEAM_NAMES[Math.floor(Math.random() * AI_TEAM_NAMES.length)];
  const emoji = TEAM_EMOJIS[AI_TEAM_NAMES.indexOf(name)] || "🏳️";

  // 随机选角色
  const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];

  return { name, emoji, charId: char.id };
}

/** 获取淘汰赛轮次中文名 */
export function getKnockoutRoundName(round) {
  const names = {
    R16: "16强赛",
    QF: "四分之一决赛",
    SF: "半决赛",
    Final: "决赛",
  };
  return names[round] || round;
}

/** 晋级下一轮淘汰赛 */
export function advanceKnockoutRound(state) {
  const order = ["R16", "QF", "SF", "Final", "champion"];
  const currentIdx = order.indexOf(state.knockoutRound);

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
  state.knockoutOpponent = initKnockoutOpponent();
}

/** 淘汰赛失利 */
export function eliminatePlayer(state) {
  state.phase = "eliminated";
}

// ---- 小组赛对手角色 ----

/** 为小组赛对手随机选取角色 */
export function getRandomGroupOpponentChar() {
  const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
  return char.id;
}
