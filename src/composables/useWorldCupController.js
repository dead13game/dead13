import { reactive, ref, computed } from "vue";
import {
  createWorldCupState,
  initGroupMatches,
  getNextPlayerGroupMatch,
  recordGroupMatchResult,
  simulateNonPlayerMatches,
  calculateGroupStandings,
  checkGroupAdvancement,
  advanceKnockoutRound,
  eliminatePlayer,
  getRandomGroupOpponentChar,
  getKnockoutRoundName,
} from "../game/worldCup.js";
import {
  createMatchState,
  onPlayerEliminated,
  resetGameForNextLife,
  executeSubstitution,
  skipSubstitution,
  executePenaltyRound,
} from "../game/matchState.js";
import { createGameState, initGame } from "../game/gameState.js";
import { MATCH_CONFIG } from "../game/worldCupConstants.js";

/**
 * 世界杯控制器 — 管理锦标赛+比赛+游戏三层状态
 */
export function useWorldCupController() {
  // ---- 三层状态 ----
  const wcState = reactive(createWorldCupState(""));
  const matchState = ref(null);
  const gameState = createGameState();

  // ---- UI 模式 ----
  // 'setup' | 'groupIntro' | 'match' | 'substitution' | 'penalty' | 'goalScored' | 'matchResult' | 'standings' | 'knockoutIntro' | 'tournamentEnd'
  const uiMode = ref("setup");
  const goalFlash = ref(false);
  const matchResult = ref(null); // { winner, score, stage }
  const knockoutIntro = ref(null); // { round, opponent }

  // ---- 初始化 ----
  function initWorldCup(teamName, startingCharId) {
    const state = createWorldCupState(teamName);
    Object.assign(wcState, state);
    initGroupMatches(wcState);

    // 设置小组赛对手角色（随机选，存储到 wcState 扩展字段）
    wcState._groupOpponentChars = [
      getRandomGroupOpponentChar(),
      getRandomGroupOpponentChar(),
      getRandomGroupOpponentChar(),
    ];

    // 开始第一场小组赛
    startNextGroupMatch(startingCharId);
  }

  // ---- 开始下一场小组赛 ----
  function startNextGroupMatch(startingCharId) {
    const matchIdx = getNextPlayerGroupMatch(wcState);
    if (matchIdx < 0) {
      // 所有小组赛打完
      finishGroupStage();
      return;
    }

    const match = wcState.groupMatches[matchIdx];
    const opponentTeam =
      wcState.groupTeams[match.home === 0 ? match.away : match.home];
    const opponentCharId = wcState._groupOpponentChars[matchIdx];

    // 创建比赛状态（小组赛=简化规则）
    const ms = createMatchState(
      true,
      startingCharId || wcState._lastPlayerChar,
      opponentCharId,
    );
    matchState.value = ms;

    // 初始化游戏
    initGameForMatch(
      startingCharId || wcState._lastPlayerChar,
      opponentCharId,
      1,
      ms,
    );
    wcState.currentMatch = ms;
    uiMode.value = "match";
  }

  // ---- 初始化一场比赛的1v1游戏 ----
  function initGameForMatch(playerCharId, opponentCharId, startingRound, ms) {
    // 保存名称
    const playerName = wcState.playerTeamName || "玩家";
    const opponentName = wcState.currentMatch
      ? ms === wcState.currentMatch
        ? getCurrentOpponentName()
        : "对手"
      : getCurrentOpponentName();

    // 用 initGame 初始化 1v1 游戏
    initGame(gameState, [playerCharId, opponentCharId], false, startingRound);

    // 按 characterId 分配名字（initGame 会按血量排序，索引可能对调）
    gameState.players.forEach((p) => {
      if (p.characterId === playerCharId) {
        p.name = playerName;
      } else {
        p.name = opponentName;
      }
    });

    // 设置比赛上下文钩子
    gameState.matchContext = {
      onPlayerEliminated: (deadIdx, killerIdx, actualRound) => {
        onPlayerEliminated(ms, gameState, deadIdx, killerIdx, actualRound);

        if (ms.matchOver) {
          handleMatchEnd(ms);
        } else if (ms.isPenaltyShootout) {
          uiMode.value = "penalty";
        } else if (ms.substitutionPending) {
          uiMode.value = "substitution";
        }
      },
    };

    // 更新当前使用的角色
    wcState._lastPlayerChar = playerCharId;
  }

  function getCurrentOpponentName() {
    if (wcState.phase === "group") {
      const matchIdx = getNextPlayerGroupMatch(wcState);
      if (matchIdx >= 0) {
        const match = wcState.groupMatches[matchIdx];
        return wcState.groupTeams[match.home === 0 ? match.away : match.home]
          .name;
      }
      // 已打完，查当前进行中的比赛
      const currentMatch = wcState.groupMatches.find(
        (m) => m.isPlayerMatch && !m.played,
      );
      if (currentMatch) {
        return wcState.groupTeams[
          currentMatch.home === 0 ? currentMatch.away : currentMatch.home
        ].name;
      }
    }
    if (wcState.knockoutOpponent) {
      return wcState.knockoutOpponent.name;
    }
    return "对手";
  }

  // ---- 处理比赛结束 ----
  function handleMatchEnd(ms) {
    const winner = ms.winner;
    const [pScore, oScore] = ms.score;

    if (ms.isGroupStage) {
      // 记录小组赛结果
      const matchIdx = getCurrentGroupMatchIdx();
      if (matchIdx >= 0) {
        const result = winner === 0 ? "home" : winner === 1 ? "away" : "draw";
        recordGroupMatchResult(wcState, matchIdx, result);
      }

      // 检查是否还有未打的小组赛
      const nextMatch = getNextPlayerGroupMatch(wcState);
      if (nextMatch >= 0) {
        matchResult.value = {
          winner,
          score: [pScore, oScore],
          stage: `小组赛第${(matchIdx >= 0 ? matchIdx : 0) + 1}场`,
          hasNext: true,
          isGroupStage: true,
        };
        uiMode.value = "matchResult";
      } else {
        // 所有小组赛打完
        finishGroupStage();
      }
    } else {
      // 淘汰赛
      const roundName = getKnockoutRoundName(wcState.knockoutRound);
      if (winner === 0) {
        matchResult.value = {
          winner: 0,
          score: [pScore, oScore],
          stage: roundName,
          hasNext: wcState.knockoutRound !== "Final",
          isChampion: wcState.knockoutRound === "Final",
        };
        uiMode.value = "matchResult";
      } else {
        matchResult.value = {
          winner: 1,
          score: [pScore, oScore],
          stage: roundName,
          hasNext: false,
          eliminated: true,
        };
        eliminatePlayer(wcState);
        uiMode.value = "matchResult";
      }
    }
  }

  function getCurrentGroupMatchIdx() {
    // 找到第一个未打的小组赛（当前刚打完的），recordGroupMatchResult 会将其标为 played
    return wcState.groupMatches.findIndex((m) => m.isPlayerMatch && !m.played);
  }

  // ---- 完成小组赛 ----
  function finishGroupStage() {
    // 模拟非玩家比赛
    simulateNonPlayerMatches(wcState);

    // 计算积分榜
    const standings = calculateGroupStandings(wcState);
    const { advanced, rank } = checkGroupAdvancement(wcState);

    // 存储结果
    wcState._groupFinished = true;
    wcState._playerRank = rank;
    wcState._advanced = advanced;

    uiMode.value = "standings";
  }

  // ---- 进入淘汰赛 ----
  function enterKnockoutStage() {
    wcState.phase = "knockout";
    advanceKnockoutRound(wcState);
    wcState.substitutionsLeft = MATCH_CONFIG.maxSubstitutions;

    const opponent = wcState.knockoutOpponent;
    knockoutIntro.value = {
      round: wcState.knockoutRound,
      roundName: getKnockoutRoundName(wcState.knockoutRound),
      opponent,
    };
    uiMode.value = "knockoutIntro";
  }

  // ---- 开始淘汰赛比赛 ----
  function startKnockoutMatch() {
    const playerCharId = wcState._lastPlayerChar;
    const opponent = wcState.knockoutOpponent;

    const ms = createMatchState(false, playerCharId, opponent.charId);
    matchState.value = ms;
    wcState.currentMatch = ms;
    ms.matchRound = 1;

    initGameForMatch(playerCharId, opponent.charId, 1, ms);
    uiMode.value = "match";
  }

  // ---- 继续下一场淘汰赛 ----
  function continueKnockoutMatch() {
    if (!matchState.value) return;
    const ms = matchState.value;
    resetGameForNextLife(ms, gameState);
    // 重建 matchContext（因为 resetGameForNextLife 会重新 initGame）
    rebuildMatchContext(ms);
    uiMode.value = "match";
  }

  function rebuildMatchContext(ms) {
    gameState.matchContext = {
      onPlayerEliminated: (deadIdx, killerIdx, actualRound) => {
        onPlayerEliminated(ms, gameState, deadIdx, killerIdx, actualRound);
        if (ms.matchOver) {
          handleMatchEnd(ms);
        } else if (ms.isPenaltyShootout) {
          uiMode.value = "penalty";
        } else if (ms.substitutionPending) {
          uiMode.value = "substitution";
        }
      },
    };
  }

  // ---- 换人 ----
  function handleSubstitution(newCharId) {
    if (!matchState.value) return;
    executeSubstitution(matchState.value, gameState, newCharId);
    resetGameForNextLife(matchState.value, gameState);
    rebuildMatchContext(matchState.value);
    uiMode.value = "match";
  }

  function handleSkipSubstitution() {
    if (!matchState.value) return;
    skipSubstitution(matchState.value, gameState);
    rebuildMatchContext(matchState.value);
    uiMode.value = "match";
  }

  // ---- 继续（小组赛下一场或淘汰赛下一轮） ----
  function continueAfterMatchResult() {
    const result = matchResult.value;
    matchResult.value = null;

    if (!result) return;

    if (wcState.phase === "group") {
      if (result.hasNext) {
        // 开始下一场小组赛（复用上次角色，可改）
        startNextGroupMatch();
      } else {
        finishGroupStage();
      }
    } else if (wcState.phase === "knockout") {
      if (result.winner === 0 && result.hasNext) {
        // 晋级下一轮淘汰赛
        advanceKnockoutRound(wcState);
        wcState.substitutionsLeft = MATCH_CONFIG.maxSubstitutions;
        startKnockoutMatch();
      } else if (result.isChampion) {
        uiMode.value = "tournamentEnd";
      } else {
        uiMode.value = "tournamentEnd";
      }
    } else {
      uiMode.value = "standings";
    }
  }

  // ---- 从积分榜进入淘汰赛 ----
  function continueFromStandings() {
    if (wcState._advanced) {
      enterKnockoutStage();
    } else {
      uiMode.value = "tournamentEnd";
    }
  }

  // ---- 点球大战 ----
  function doPenaltyRound() {
    if (!matchState.value) return null;
    const result = executePenaltyRound(matchState.value);
    if (result?.winner !== null && result?.winner !== undefined) {
      // 点球结束，比赛结束
      matchState.value.winner = result.winner;
      handleMatchEnd(matchState.value);
    }
    return result;
  }

  // ---- 重置 ----
  function resetWorldCup() {
    uiMode.value = "setup";
    matchState.value = null;
    matchResult.value = null;
    knockoutIntro.value = null;
    Object.assign(wcState, createWorldCupState(""));
  }

  // ---- 计算属性 ----
  const currentPlayerName = computed(
    () => gameState.players[0]?.name || wcState.playerTeamName || "玩家",
  );
  const currentOpponentName = computed(
    () => gameState.players[1]?.name || "对手",
  );
  const currentCharName = computed(
    () => gameState.players[0]?.characterName || "",
  );

  return {
    // 状态
    wcState,
    matchState,
    gameState,
    uiMode,
    goalFlash,
    matchResult,
    knockoutIntro,
    // 计算属性
    currentPlayerName,
    currentOpponentName,
    currentCharName,
    // 方法
    initWorldCup,
    startNextGroupMatch,
    enterKnockoutStage,
    startKnockoutMatch,
    continueKnockoutMatch,
    handleSubstitution,
    handleSkipSubstitution,
    continueAfterMatchResult,
    continueFromStandings,
    doPenaltyRound,
    resetWorldCup,
  };
}
