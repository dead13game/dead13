// 联赛状态机 — 管理10队双循环联赛（18轮）
// 纯逻辑层，零依赖

import {
  LEAGUE_TEAMS,
  LEAGUE_SCHEDULE,
  LEAGUE_MATCH_CONFIG,
  LEAGUE_POINTS,
  RANK_POINTS,
  TOTAL_ROUNDS,
} from "./leagueConstants.js";

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

/** 获取球队等级 */
export function getTeamTier(teamId) {
  const team = LEAGUE_TEAMS[teamId];
  return team ? team.tier : 3;
}

/**
 * 计算卡牌加成
 * @param {number} playerTeamId - 玩家球队ID
 * @param {number} opponentTeamId - 对手球队ID
 * @param {boolean} isHome - 玩家是否是主队
 * @returns {{ attackBonus: number, defenseBonus: number }}
 */
export function getCardBonus(playerTeamId, opponentTeamId, isHome) {
  const playerTier = getTeamTier(playerTeamId);
  const opponentTier = getTeamTier(opponentTeamId);
  let attackBonus = 0;
  let defenseBonus = 0;

  const tierDiff = opponentTier - playerTier; // 正数=玩家等级更高

  if (tierDiff >= 1) {
    // 玩家等级高于对手
    if (tierDiff >= 2) {
      // 一流 vs 末流：攻击+2，防御+2
      attackBonus = 2;
      defenseBonus = 2;
    } else {
      // 一流 vs 二流 或 二流 vs 末流：攻击+2
      attackBonus = 2;
    }
  }

  // 主场加成：攻击牌额外+1
  if (isHome) {
    attackBonus += 1;
  }

  return { attackBonus, defenseBonus };
}

// ---- 创建联赛状态 ----

/**
 * 创建联赛状态
 * @param {number} playerTeamId - 玩家选择的球队ID (1-10)
 */
export function createLeagueState(playerTeamId) {
  return {
    playerTeamId,
    currentRound: 1,
    // 比赛结果存储：results[round][matchIdx] = 'home' | 'away' | 'draw'
    results: {},
    // 本轮非玩家比赛是否已模拟
    roundSimulated: {},
  };
}

// ---- 赛程查询 ----

/**
 * 获取某一轮的所有比赛
 * @returns {Array<{home: number, away: number}>}
 */
export function getRoundMatches(round) {
  if (round < 1 || round > TOTAL_ROUNDS) return [];
  return LEAGUE_SCHEDULE[round] || [];
}

/**
 * 获取玩家在某一轮参与的比赛
 * @returns {{ matchIdx: number, match: object, isHome: boolean } | null}
 */
export function getPlayerMatchForRound(state, round) {
  const matches = getRoundMatches(round);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.home === state.playerTeamId) {
      return { matchIdx: i, match: m, isHome: true };
    }
    if (m.away === state.playerTeamId) {
      return { matchIdx: i, match: m, isHome: false };
    }
  }
  return null;
}

/**
 * 判断玩家在某一轮是否是主队
 */
export function isPlayerHome(state, round) {
  const pm = getPlayerMatchForRound(state, round);
  return pm ? pm.isHome : false;
}

/**
 * 获取玩家在某一轮的对手球队ID
 */
export function getPlayerOpponent(state, round) {
  const pm = getPlayerMatchForRound(state, round);
  if (!pm) return null;
  return pm.isHome ? pm.match.away : pm.match.home;
}

// ---- 自动模拟 ----

/**
 * 自动模拟某一轮的非玩家比赛
 * 按等级差+主场优势计算概率
 */
export function simulateNonPlayerMatches(state, round) {
  if (state.roundSimulated[round]) return;

  const matches = getRoundMatches(round);
  matches.forEach((m, idx) => {
    // 跳过玩家比赛
    if (m.home === state.playerTeamId || m.away === state.playerTeamId) return;
    // 跳过已有结果的比赛
    const key = `${round}_${idx}`;
    if (state.results[key]) return;

    const result = simulateMatch(m.home, m.away);
    state.results[key] = result;
  });

  state.roundSimulated[round] = true;
}

/**
 * 自动模拟单场比赛
 * 胜率表（主队视角，已包含主场优势）：
 *   一流 vs 末流: 75/15/10
 *   一流 vs 二流: 60/20/20
 *   二流 vs 末流: 60/20/20
 *   同等级:       35/30/35
 * 反向对阵对称翻转主胜/客胜
 * @returns {'home' | 'away' | 'draw'}
 */
export function simulateMatch(homeId, awayId) {
  const homeTier = getTeamTier(homeId);
  const awayTier = getTeamTier(awayId);

  let homeWinProb, drawProb, awayWinProb;

  if (homeTier === awayTier) {
    // 同等级
    homeWinProb = 0.35;
    drawProb = 0.3;
    awayWinProb = 0.35;
  } else if (homeTier < awayTier) {
    // 主队等级更高（一流 vs 二流/末流，二流 vs 末流）
    if (homeTier === 1 && awayTier === 3) {
      homeWinProb = 0.75;
      drawProb = 0.15;
      awayWinProb = 0.1;
    } else {
      // 一流 vs 二流 或 二流 vs 末流
      homeWinProb = 0.6;
      drawProb = 0.2;
      awayWinProb = 0.2;
    }
  } else {
    // 主队等级更低 — 翻转反向对阵的概率
    if (awayTier === 1 && homeTier === 3) {
      // 末流 vs 一流 ← 翻转 一流 vs 末流
      homeWinProb = 0.1;
      drawProb = 0.15;
      awayWinProb = 0.75;
    } else {
      // 二流 vs 一流 或 末流 vs 二流 ← 翻转 60/20/20
      homeWinProb = 0.2;
      drawProb = 0.2;
      awayWinProb = 0.6;
    }
  }

  const r = Math.random();
  if (r < homeWinProb) return "home";
  if (r < homeWinProb + drawProb) return "draw";
  return "away";
}

// ---- 比赛结果记录 ----

/**
 * 记录玩家比赛结果
 */
export function recordMatchResult(state, round, result) {
  // result: 'home'=玩家视角的主队胜, 'away'=玩家视角的客队胜, 'draw'=平
  const pm = getPlayerMatchForRound(state, round);
  if (!pm) return;

  const key = `${round}_${pm.matchIdx}`;

  // 转换为绝对视角：'home'=赛程中的主队胜
  if (pm.isHome) {
    state.results[key] = result; // 玩家视角=绝对视角
  } else {
    // 玩家是客队，需要翻转
    if (result === "home") state.results[key] = "away";
    else if (result === "away") state.results[key] = "home";
    else state.results[key] = "draw";
  }
}

/**
 * 获取某轮某场比赛的结果（绝对视角）
 * @returns {'home' | 'away' | 'draw' | null}
 */
export function getMatchResult(state, round, matchIdx) {
  return state.results[`${round}_${matchIdx}`] || null;
}

/**
 * 获取玩家在某轮比赛的结果（玩家视角）
 * @returns {'win' | 'loss' | 'draw' | null}
 */
export function getPlayerResult(state, round) {
  const pm = getPlayerMatchForRound(state, round);
  if (!pm) return null;

  const key = `${round}_${pm.matchIdx}`;
  const absoluteResult = state.results[key];
  if (!absoluteResult) return null;

  if (absoluteResult === "draw") return "draw";

  if (pm.isHome) {
    return absoluteResult === "home" ? "win" : "loss";
  } else {
    return absoluteResult === "away" ? "win" : "loss";
  }
}

// ---- 积分榜 ----

/**
 * 计算积分榜
 * @returns {Array} 按积分降序排列的球队排名数组
 */
export function calculateStandings(state) {
  // 初始化每队数据
  const teams = {};
  for (let id = 1; id <= 10; id++) {
    teams[id] = {
      teamId: id,
      name: LEAGUE_TEAMS[id].name,
      emoji: LEAGUE_TEAMS[id].emoji,
      tier: LEAGUE_TEAMS[id].tier,
      isPlayer: id === state.playerTeamId,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
    };
  }

  // 遍历所有已有结果的比赛
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    const matches = getRoundMatches(round);
    matches.forEach((m, idx) => {
      const key = `${round}_${idx}`;
      const result = state.results[key];
      if (!result) return;

      const home = teams[m.home];
      const away = teams[m.away];

      home.played++;
      away.played++;

      if (result === "home") {
        home.wins++;
        home.points += LEAGUE_POINTS.WIN;
        away.losses++;
      } else if (result === "away") {
        away.wins++;
        away.points += LEAGUE_POINTS.WIN;
        home.losses++;
      } else {
        home.draws++;
        away.draws++;
        home.points += LEAGUE_POINTS.DRAW;
        away.points += LEAGUE_POINTS.DRAW;
      }
    });
  }

  // 排序：积分降序
  const standings = Object.values(teams);
  standings.sort((a, b) => b.points - a.points);

  return standings;
}

/**
 * 检查联赛是否结束（18轮全部打完）
 */
export function isLeagueFinished(state) {
  return state.currentRound > TOTAL_ROUNDS;
}

/**
 * 检测是否需要加赛
 * 联赛结束后，玩家与某队积分并列时需要加赛
 * @returns {{ needed: boolean, opponentTeamId: number | null }}
 */
export function checkTiebreakerNeeded(state) {
  if (!isLeagueFinished(state)) return { needed: false, opponentTeamId: null };

  const standings = calculateStandings(state);
  const playerStanding = standings.find((t) => t.isPlayer);
  if (!playerStanding) return { needed: false, opponentTeamId: null };

  // 找到和玩家同分的其他球队
  const tiedTeams = standings.filter(
    (t) => !t.isPlayer && t.points === playerStanding.points,
  );

  if (tiedTeams.length > 0) {
    return { needed: true, opponentTeamId: tiedTeams[0].teamId };
  }

  return { needed: false, opponentTeamId: null };
}

// ---- 3v3 比赛结果计算 ----

/**
 * 根据死亡顺序计算两队积分
 * @param {Array} deathOrder - [{playerIndex, teamId}] 按死亡顺序排列
 *   索引0=第1个死=第6名，最后存活者的team里不再有新增death
 * @param {number} playerTeamId - 玩家队伍ID (0 或 1，比赛中的teamId)
 * @param {number} opponentTeamId - 对手队伍ID
 * @returns {{ playerScore: number, opponentScore: number, winner: number | null }}
 *   winner: 0=玩家, 1=对手, null=平局（应在round limit时用）
 */
export function calculateMatchScore(deathOrder, playerTeamId, opponentTeamId) {
  const totalPlayers = 6;
  const playersPerTeam = 3;
  // 第6名到第1名的积分（规则v3.0：1/2/3/4/5/6）
  const rankPoints = [
    RANK_POINTS[6],
    RANK_POINTS[5],
    RANK_POINTS[4],
    RANK_POINTS[3],
    RANK_POINTS[2],
    RANK_POINTS[1],
  ];

  // 按死亡顺序分配排名：deathOrder[0]=第6名, ..., deathOrder[5]=第1名
  // 如果deathOrder不足6人（一方团灭），剩余名次全部归存活方
  let playerScore = 0;
  let opponentScore = 0;

  // 先计算已确定的名次
  deathOrder.forEach((entry, i) => {
    const rank = totalPlayers - i; // 6, 5, 4, ...
    const points = rankPoints[i]; // 第6名=1分, 第5名=2分, ...
    if (entry.teamId === playerTeamId) {
      playerScore += points;
    } else if (entry.teamId === opponentTeamId) {
      opponentScore += points;
    }
  });

  // 剩余名次分配：某队 3 人全部阵亡（该队团灭）→ 剩余高名次全归另一队。
  // 注意：存活方可能也先阵亡过人（如对手先死1人、随后玩家3人全灭），
  // 此时 deathOrder 同时含两队，不能再用"缺席于 deadTeamIds"推断存活方。
  const remainingRanks = totalPlayers - deathOrder.length;
  let survivingTeam = null;
  if (remainingRanks > 0) {
    let playerDeaths = 0;
    let opponentDeaths = 0;
    for (const e of deathOrder) {
      if (e.teamId === playerTeamId) playerDeaths++;
      else if (e.teamId === opponentTeamId) opponentDeaths++;
    }
    if (playerDeaths >= playersPerTeam) {
      survivingTeam = opponentTeamId;
    } else if (opponentDeaths >= playersPerTeam) {
      survivingTeam = playerTeamId;
    }
    // 两队都未满 3 死 = 双方均有人存活（30回合平局场景），剩余名次不分配

    if (survivingTeam !== null) {
      for (let i = deathOrder.length; i < totalPlayers; i++) {
        const points = rankPoints[i];
        if (survivingTeam === playerTeamId) {
          playerScore += points;
        } else {
          opponentScore += points;
        }
      }
    }
  }

  // 胜负判定：双方均有人存活时名次未定，winner 应为 null（平局），
  // 由调用方（回合上限）决定；其余情况按已确定积分比较。
  const undecided = remainingRanks > 0 && survivingTeam === null;
  const winner = undecided
    ? null
    : playerScore > opponentScore
      ? 0
      : opponentScore > playerScore
        ? 1
        : null;

  return { playerScore, opponentScore, winner };
}

// ---- 3v3 劣势方防御补给（规则v3.0） ----

/**
 * 劣势方防御补给计算：双方存活人数不等时，劣势方每人获得 X 张防御牌，X=人数差。
 * 每回合开始阶段（所有玩家行动之前）调用，双方人数相等或任一方团灭时不触发。
 * @param {Array} players - 全部玩家（含 teamId / alive）
 * @returns {{ weakerTeamId: number, diff: number } | null}
 */
export function computeDefenseReinforcement(players) {
  if (!Array.isArray(players)) return null;
  const alive = players.filter((p) => p && p.alive);
  const team0 = alive.filter((p) => p.teamId === 0).length;
  const team1 = alive.filter((p) => p.teamId === 1).length;
  // 人数相等 或 任一方已团灭（比赛应已结束）时不补给
  if (team0 === team1 || team0 === 0 || team1 === 0) return null;
  return { weakerTeamId: team0 < team1 ? 0 : 1, diff: Math.abs(team0 - team1) };
}
