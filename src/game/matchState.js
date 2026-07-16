// 比赛状态机 — 在 1v1 游戏之上叠加比赛逻辑（进球、重置、换人、加时、点球）
// 纯逻辑层，零依赖

import { MATCH_CONFIG } from "./worldCupConstants.js";
import { RANK_VALUES, CHARACTERS } from "./constants.js";
import {
  shuffleDeck,
  createFullDeck,
  drawCards,
  reshuffleFromGrave,
} from "./deck.js";

/** 创建比赛状态 */
export function createMatchState(isGroupStage, playerCharId, opponentCharId) {
  return {
    isGroupStage,
    matchRound: 1,
    maxRounds: MATCH_CONFIG.knockoutRounds, // 小组赛和淘汰赛都是90回合
    score: [0, 0], // [玩家进球, 对方进球]
    isExtraTime: false,
    isPenaltyShootout: false,
    matchOver: false,
    winner: null, // 0=玩家, 1=对方, null=未结束
    // 换人
    substitutionPending: false,
    substitutionsLeft: MATCH_CONFIG.maxSubstitutions,
    playerCharId,
    opponentCharId,
    // 点球大战
    penalty: null,
    penaltyDeck: [],
    penaltyGrave: [],
  };
}

/**
 * 核心钩子：当有人阵亡时记录进球并决定下一步
 * 由 gameState.checkGameOver 通过 matchContext 回调调用
 */
export function onPlayerEliminated(
  matchState,
  gameState,
  deadIdx,
  killerIdx,
  actualRound,
) {
  if (matchState.matchOver) return;

  // 用实际游戏回合同步比赛回合计数器
  if (typeof actualRound === "number") {
    matchState.matchRound = actualRound;
  }

  // 通过 characterId 判定谁进球（因为 initGame 会按血量排序，索引不可靠）
  const killer = gameState.players.find((p) => p.index === killerIdx);
  const isPlayerGoal = killer && killer.characterId === matchState.playerCharId;
  if (isPlayerGoal) {
    matchState.score[0]++;
  } else {
    matchState.score[1]++;
  }

  // 小组赛和淘汰赛统一：检查回合和比分决定是否结束/加时/点球
  return checkMatchEnd(matchState, gameState);
}

/** 判定比赛是否结束，或是否需要加时/点球（导出供控制器在回合推进时调用） */
export function checkMatchEnd(matchState, gameState) {
  const [pScore, oScore] = matchState.score;
  const round = matchState.matchRound;

  // 常规时间（90回合）结束
  if (round >= MATCH_CONFIG.knockoutRounds && !matchState.isExtraTime) {
    if (pScore !== oScore) {
      return endMatch(matchState, gameState);
    }
    // 平局：小组赛直接结束，淘汰赛进加时
    if (matchState.isGroupStage) {
      return endMatch(matchState, gameState);
    }
    return startExtraTime(matchState, gameState);
  }

  // 加时赛（120回合）结束
  if (round >= MATCH_CONFIG.totalRounds && matchState.isExtraTime) {
    if (pScore !== oScore) {
      return endMatch(matchState, gameState);
    }
    // 仍平局 → 点球大战
    return startPenaltyShootout(matchState, gameState);
  }

  // 比赛继续：标记换人待处理，然后重置游戏
  matchState.substitutionPending = true;
  // 不在这里重置游戏——由 UI 层处理换人后再调用 resetGameForNextLife
  return null;
}

/** 比赛结束 */
function endMatch(matchState, gameState) {
  matchState.matchOver = true;
  const [pScore, oScore] = matchState.score;
  if (pScore > oScore) {
    matchState.winner = 0;
  } else if (oScore > pScore) {
    matchState.winner = 1;
  } else {
    matchState.winner = null; // 平局
  }
  gameState.gameOver = true;
  gameState.winnerIndex = matchState.winner ?? -1;
  return matchState.winner;
}

/** 进入加时赛 */
function startExtraTime(matchState, gameState) {
  matchState.isExtraTime = true;
  matchState.maxRounds = MATCH_CONFIG.totalRounds;
  // 加时赛不结束比赛，继续（重置游戏后继续打）
  matchState.substitutionPending = true;
  return null;
}

/** 进入点球大战 */
function startPenaltyShootout(matchState, gameState) {
  matchState.isPenaltyShootout = true;
  matchState.matchOver = true; // 停止正常比赛流程
  matchState.penalty = {
    playerScore: 0,
    opponentScore: 0,
    round: 0,
    playerCards: null,
    opponentCards: null,
    lastResult: null, // 'player' | 'opponent' | 'draw'
  };
  // 创建点球专用牌堆
  matchState.penaltyDeck = shuffleDeck(createFullDeck(1));
  matchState.penaltyGrave = [];
  return null;
}

/**
 * 重置游戏状态以进行下一局（保留回合数）
 * 在换人完成或跳过换人后调用
 */
export function resetGameForNextLife(matchState, gameState) {
  // 按 characterId 保存名称（HP 排序后索引不可靠）
  const playerP = gameState.players.find(
    (p) => p.characterId === matchState.playerCharId,
  );
  const opponentP = gameState.players.find(
    (p) => p.characterId === matchState.opponentCharId,
  );
  const playerName = playerP?.name || "玩家";
  const opponentName = opponentP?.name || "对手";

  // 回合数 +1（因为上一局消耗了当前回合）
  matchState.matchRound++;
  matchState.substitutionPending = false;

  // 保存 matchContext
  const savedContext = gameState.matchContext;

  // 重新初始化 1v1 游戏
  reset1v1Game(
    gameState,
    matchState.playerCharId,
    matchState.opponentCharId,
    matchState.matchRound,
  );

  // 按 characterId 恢复名称（HP 排序后索引可能已变）
  gameState.players.forEach((p) => {
    if (p.characterId === matchState.playerCharId) {
      p.name = playerName;
    } else if (p.characterId === matchState.opponentCharId) {
      p.name = opponentName;
    }
  });

  // 恢复比赛上下文
  gameState.matchContext = savedContext;

  // 如果已过和平回合，直接进入战斗
  if (matchState.matchRound > gameState.peaceRounds) {
    gameState.phase = "normal";
  }

  // 加时赛提示
  if (
    matchState.isExtraTime &&
    matchState.matchRound === MATCH_CONFIG.knockoutRounds + 1
  ) {
    gameState.messageLog.push("⚽ 90分钟结束，进入加时赛！");
  }
  if (matchState.matchRound === 1) {
    gameState.messageLog.push(
      `⚽ 比赛开始！（${matchState.maxRounds === Infinity ? "小组赛" : matchState.maxRounds + "回合制"}）`,
    );
  }
}

/**
 * 重置为 1v1 游戏（重用 initGame 的核心逻辑，但更轻量）
 */
function reset1v1Game(gameState, playerCharId, opponentCharId, startingRound) {
  const charData1 = getCharData(playerCharId);
  const charData2 = getCharData(opponentCharId);

  if (!charData1 || !charData2) return;

  // 重置核心状态
  Object.assign(gameState, {
    players: [],
    currentPlayerIndex: 0,
    phase: "peace",
    step: "pickAction",
    deck: shuffleDeck(createFullDeck(2)),
    grave: [],
    weatherDeck: [],
    currentWeather: null,
    nextWeather: null,
    round: startingRound,
    messageLog: gameState.messageLog, // 保留日志
    gameOver: false,
    winnerIndex: -1,
    scryCards: null,
    pendingAttackCard: null,
    pendingVentiCards: null,
    endTurn: true,
    useWeather: false,
    peaceRounds: 2,
    _elimGuard: false,
    _skipAnim: false,
    _gameJustReset: true,
  });

  // 创建两个玩家
  gameState.players.push(createPlayerForMatch(0, charData1, "玩家"));
  gameState.players.push(createPlayerForMatch(1, charData2, "对手"));

  // 按血量排序
  gameState.players.sort((a, b) => {
    if (a.hp !== b.hp) return a.hp - b.hp;
    return a.index - b.index;
  });
  gameState.players.forEach((p, i) => {
    p.index = i;
  });

  // 如果 startingRound > peaceRounds，直接进入战斗阶段
  if (startingRound > 2) {
    gameState.phase = "normal";
  }
}

/** 创建比赛用玩家对象（精简版 createPlayer） */
function createPlayerForMatch(index, charData, name) {
  return {
    index,
    name,
    characterId: charData.id,
    characterName: charData.name,
    characterTitle: charData.title,
    characterIcon: charData.icon,
    hp: charData.hp,
    maxHp: charData.hp,
    alive: true,
    defensePile: [],
    trap: null,
    bait: null,
    skillUses: 0, // 击杀后技能进入冷却，随回合逐步恢复
    skillName: charData.skillName,
    skillDesc: charData.skillDesc,
    skillType: charData.skillType,
    maxUses: charData.maxUses,
    fightingSpirit: 0,
    moonPhase: 0,
    ignoreTrapThisTurn: false,
    extraAction: false,
    loadUses: charData.id === "caiyueang" ? 3 : 0,
    loadMaxUses: charData.id === "caiyueang" ? 3 : 0,
    stealTarget: null,
    dotTarget: null,
    damageBonus: {},
    frozenBy: null,
    savepoint: null,
    allyIndex: null,
    allianceTurns: 0,
    betrayalPenalty: 0,
    allyKillBonus: false,
  };
}

function getCharData(charId) {
  return CHARACTERS.find((c) => c.id === charId) || null;
}

// ===== 换人 =====

/** 是否可以换人 */
export function canSubstitute(matchState) {
  return (
    matchState.substitutionPending &&
    !matchState.matchOver &&
    matchState.substitutionsLeft > 0
  );
}

/** 检查换人是否合法（新角色不能与对方当前角色相同） */
export function isSubstitutionValid(matchState, newCharId) {
  return newCharId !== matchState.opponentCharId;
}

/** 执行换人 */
export function executeSubstitution(matchState, gameState, newCharId) {
  if (!canSubstitute(matchState)) return false;

  const charData = getCharData(newCharId);
  if (!charData) return false;

  const oldCharId = matchState.playerCharId;
  matchState.playerCharId = newCharId;
  matchState.substitutionsLeft--;

  // 找到人类玩家（用旧 characterId，因为新 charId 尚未应用到 player 对象）
  const player = gameState.players.find((p) => p.characterId === oldCharId);
  if (player) {
    Object.assign(player, {
      characterId: charData.id,
      characterName: charData.name,
      characterTitle: charData.title,
      characterIcon: charData.icon,
      hp: charData.hp,
      maxHp: charData.hp,
      skillUses: 0, // 换人后技能进入冷却，随回合恢复
      skillName: charData.skillName,
      skillDesc: charData.skillDesc,
      skillType: charData.skillType,
      maxUses: charData.maxUses,
    });
  }

  gameState.messageLog.push(
    `🔄 换人：${charData.name} 上场！（剩余换人 ${matchState.substitutionsLeft} 次）`,
  );

  return true;
}

/** 跳过换人 */
export function skipSubstitution(matchState, gameState) {
  matchState.substitutionPending = false;
  resetGameForNextLife(matchState, gameState);
}

// ===== 点球大战 =====

/** 执行一轮点球 */
export function executePenaltyRound(matchState) {
  if (!matchState.penalty || matchState.matchOver) return null;

  const pen = matchState.penalty;

  // 确保牌堆有足够牌
  ensurePenaltyDeck(matchState);

  // 各抽2张
  const r1 = drawCards(matchState.penaltyDeck, 2);
  matchState.penaltyDeck = r1.remaining;
  const r2 = drawCards(matchState.penaltyDeck, 2);
  matchState.penaltyDeck = r2.remaining;

  // 弃入墓地
  matchState.penaltyGrave.push(...r1.drawn, ...r2.drawn);

  pen.playerCards = r1.drawn;
  pen.opponentCards = r2.drawn;

  // 计算总分
  const playerSum = pen.playerCards.reduce(
    (s, c) => s + (RANK_VALUES[c.rank] || 0),
    0,
  );
  const opponentSum = pen.opponentCards.reduce(
    (s, c) => s + (RANK_VALUES[c.rank] || 0),
    0,
  );

  pen.round++;

  if (playerSum > opponentSum) {
    pen.playerScore++;
    pen.lastResult = "player";
  } else if (opponentSum > playerSum) {
    pen.opponentScore++;
    pen.lastResult = "opponent";
  } else {
    pen.lastResult = "draw";
  }

  // 检查是否有人先到5分
  if (pen.playerScore >= MATCH_CONFIG.penaltyFirstTo) {
    matchState.winner = 0;
    return {
      winner: 0,
      playerSum,
      opponentSum,
      playerCards: pen.playerCards,
      opponentCards: pen.opponentCards,
    };
  }
  if (pen.opponentScore >= MATCH_CONFIG.penaltyFirstTo) {
    matchState.winner = 1;
    return {
      winner: 1,
      playerSum,
      opponentSum,
      playerCards: pen.playerCards,
      opponentCards: pen.opponentCards,
    };
  }

  return {
    winner: null,
    playerSum,
    opponentSum,
    playerCards: pen.playerCards,
    opponentCards: pen.opponentCards,
    pen,
  };
}

function ensurePenaltyDeck(matchState) {
  if (matchState.penaltyDeck.length < 4) {
    matchState.penaltyDeck = reshuffleFromGrave(matchState.penaltyGrave);
    matchState.penaltyGrave = [];
  }
}

/** 检查点球是否有人获胜 */
export function isPenaltyOver(matchState) {
  return matchState.winner !== null;
}

// ===== 小组赛 =====

/** 获取小组赛结果（供积分计算使用） */
export function getGroupMatchResult(matchState) {
  if (!matchState.matchOver) return null;
  const [pScore, oScore] = matchState.score;
  if (pScore > oScore) return "win";
  if (pScore < oScore) return "loss";
  return "draw";
}
