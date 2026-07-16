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
import { CHARACTERS } from "../game/constants.js";

/**
 * 世界杯控制器 — 管理锦标赛+比赛+游戏三层状态
 */
export function useWorldCupController() {
  // ---- 三层状态 ----
  const wcState = reactive(createWorldCupState(""));
  const matchState = ref(null);
  const gameState = createGameState();

  // ---- UI 模式 ----
  const uiMode = ref("setup");
  const goalFlash = ref(false);
  const matchResult = ref(null);
  const knockoutIntro = ref(null);
  const opponentSubPending = ref(false);

  let useWeather = false;
  let aiDifficulty = "easy";

  // ---- 初始化 ----
  function initWorldCup(
    teamName,
    startingCharId,
    opponentNames,
    weather,
    difficulty = "easy",
  ) {
    useWeather = weather || false;
    aiDifficulty = difficulty;
    opponentSubPending.value = false;
    const state = createWorldCupState(teamName, opponentNames);
    Object.assign(wcState, state);
    initGroupMatches(wcState);

    wcState._groupOpponentChars = [
      getRandomGroupOpponentChar(),
      getRandomGroupOpponentChar(),
      getRandomGroupOpponentChar(),
    ];

    startNextGroupMatch(startingCharId);
  }

  // ---- 开始下一场小组赛 ----
  function startNextGroupMatch(startingCharId) {
    const matchIdx = getNextPlayerGroupMatch(wcState);
    if (matchIdx < 0) {
      finishGroupStage();
      return;
    }

    const match = wcState.groupMatches[matchIdx];
    const opponentTeam =
      wcState.groupTeams[match.home === 0 ? match.away : match.home];
    const opponentCharId = wcState._groupOpponentChars[matchIdx];

    // ms 从创建起就是 reactive，确保 game 层对 matchRound/score 的修改能被 Vue 检测到
    const ms = reactive(
      createMatchState(
        true,
        startingCharId || wcState._lastPlayerChar,
        opponentCharId,
      ),
    );
    matchState.value = ms;

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
    const playerName = wcState.playerTeamName || "玩家";
    const opponentName = getCurrentOpponentName();

    initGame(
      gameState,
      [playerCharId, opponentCharId],
      useWeather,
      startingRound,
    );

    gameState.players.forEach((p) => {
      if (p.characterId === playerCharId) {
        p.name = playerName;
      } else {
        p.name = opponentName;
      }
    });

    // 标记 AI 玩家
    gameState.players.forEach((p) => {
      if (p.characterId === opponentCharId) {
        p.isAI = true;
        p.aiDifficulty = aiDifficulty;
      }
    });

    gameState.matchContext = {
      onPlayerEliminated: (deadIdx, killerIdx, actualRound) => {
        // 保存被击杀者 characterId，供重置后矫正先手顺序
        const killedCharId = gameState.players[deadIdx]?.characterId;
        if (killedCharId) ms._killedCharId = killedCharId;

        onPlayerEliminated(ms, gameState, deadIdx, killerIdx, actualRound);

        if (ms.matchOver) {
          handleMatchEnd(ms);
        } else if (ms.isPenaltyShootout) {
          uiMode.value = "penalty";
        } else if (ms.substitutionPending) {
          uiMode.value = "substitution";
        }
      },
      onNewRound: (round) => {
        if (ms.matchOver) return;
        ms.matchRound = round;
        if (round > ms.maxRounds) {
          const [pScore, oScore] = ms.score;
          if (pScore > oScore) ms.winner = 0;
          else if (oScore > pScore) ms.winner = 1;
          else ms.winner = null;
          ms.matchOver = true;
          gameState.gameOver = true;
          gameState.winnerIndex = ms.winner ?? -1;
          handleMatchEnd(ms);
        }
      },
    };

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
      const matchIdx = getCurrentGroupMatchIdx();
      if (matchIdx >= 0) {
        const result = winner === 0 ? "home" : winner === 1 ? "away" : "draw";
        recordGroupMatchResult(wcState, matchIdx, result);
      }

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
        finishGroupStage();
      }
    } else {
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
    return wcState.groupMatches.findIndex((m) => m.isPlayerMatch && !m.played);
  }

  // ---- 完成小组赛 ----
  function finishGroupStage() {
    simulateNonPlayerMatches(wcState);
    const standings = calculateGroupStandings(wcState);
    const { advanced, rank } = checkGroupAdvancement(wcState);

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

    const ms = reactive(createMatchState(false, playerCharId, opponent.charId));
    matchState.value = ms;
    wcState.currentMatch = ms;
    ms.matchRound = 1;
    opponentSubPending.value = false;

    initGameForMatch(playerCharId, opponent.charId, 1, ms);
    uiMode.value = "match";
  }

  // ---- 继续下一场淘汰赛 ----
  function continueKnockoutMatch() {
    if (!matchState.value) return;
    const ms = matchState.value;
    resetGameForNextLife(ms, gameState);
    rebuildMatchContext(ms);
    uiMode.value = "match";
  }

  function rebuildMatchContext(ms) {
    gameState.matchContext = {
      onPlayerEliminated: (deadIdx, killerIdx, actualRound) => {
        const killedCharId = gameState.players[deadIdx]?.characterId;
        if (killedCharId) ms._killedCharId = killedCharId;

        onPlayerEliminated(ms, gameState, deadIdx, killerIdx, actualRound);
        if (ms.matchOver) {
          handleMatchEnd(ms);
        } else if (ms.isPenaltyShootout) {
          uiMode.value = "penalty";
        } else if (ms.substitutionPending) {
          uiMode.value = "substitution";
        }
      },
      onNewRound: (round) => {
        if (ms.matchOver) return;
        ms.matchRound = round;
        if (round > ms.maxRounds) {
          const [pScore, oScore] = ms.score;
          if (pScore > oScore) ms.winner = 0;
          else if (oScore > pScore) ms.winner = 1;
          else ms.winner = null;
          ms.matchOver = true;
          gameState.gameOver = true;
          gameState.winnerIndex = ms.winner ?? -1;
          handleMatchEnd(ms);
        }
      },
    };
  }

  /** 击杀→重置后，让被击杀方先手，避免 killer 连续行动两次。 */
  function fixTurnAfterReset() {
    const killedCharId = matchState.value?._killedCharId;
    if (!killedCharId) return;
    matchState.value._killedCharId = null;
    const p = gameState.players.find((pl) => pl.characterId === killedCharId);
    if (p) {
      gameState.currentPlayerIndex = p.index;
    }
  }

  // ---- 换人 ----
  function handleSubstitution(newCharId) {
    if (!matchState.value) return;
    executeSubstitution(matchState.value, gameState, newCharId);
    resetGameForNextLife(matchState.value, gameState);
    fixTurnAfterReset();
    rebuildMatchContext(matchState.value);
    markAIPlayer();
    uiMode.value = "match";
  }

  function handleSkipSubstitution() {
    if (!matchState.value) return;
    skipSubstitution(matchState.value, gameState);
    fixTurnAfterReset();
    rebuildMatchContext(matchState.value);
    markAIPlayer();
    uiMode.value = "match";
  }

  /** 标记 AI 玩家（重置游戏后需重新标记） */
  function markAIPlayer() {
    if (!matchState.value) return;
    const opponentCharId = matchState.value.opponentCharId;
    gameState.players.forEach((p) => {
      if (p.characterId === opponentCharId) {
        p.isAI = true;
        p.aiDifficulty = aiDifficulty;
      }
    });
  }

  // ---- 手动模式双步换人 ----

  /** 玩家换人（第一步：执行换人但不重置游戏，等待对手也换人） */
  function handlePlayerSubstitution(newCharId) {
    if (!matchState.value) return;
    executeSubstitution(matchState.value, gameState, newCharId);
    opponentSubPending.value = true;
    // uiMode 保持 "substitution"，等待对手换人
  }

  /** 对手换人（第二步：更新对手角色并统一重置游戏） */
  function handleOpponentSubstitution(newCharId) {
    if (!matchState.value) return;
    const ms = matchState.value;
    const oldOpponentCharId = ms.opponentCharId;

    const opponent = gameState.players.find(
      (p) => p.characterId === oldOpponentCharId,
    );
    const charData = CHARACTERS.find((c) => c.id === newCharId);

    if (opponent && charData) {
      Object.assign(opponent, {
        characterId: charData.id,
        characterName: charData.name,
        characterTitle: charData.title,
        characterIcon: charData.icon,
        hp: charData.hp,
        maxHp: charData.hp,
        skillUses: charData.maxUses,
        skillName: charData.skillName,
        skillDesc: charData.skillDesc,
        skillType: charData.skillType,
        maxUses: charData.maxUses,
      });

      gameState.messageLog.push(
        `🔄 对手换人：${charData.name} 上场！（剩余换人 ${ms.substitutionsLeft - 1} 次）`,
      );
    }

    ms.opponentCharId = newCharId;
    ms.substitutionsLeft--;
    opponentSubPending.value = false;

    resetGameForNextLife(ms, gameState);
    fixTurnAfterReset();
    rebuildMatchContext(ms);
    markAIPlayer();
    uiMode.value = "match";
  }

  /** 对手跳过换人（第二步skip：不换角色但统一重置游戏） */
  function handleOpponentSkipSubstitution() {
    if (!matchState.value) return;
    const ms = matchState.value;
    opponentSubPending.value = false;

    resetGameForNextLife(ms, gameState);
    fixTurnAfterReset();
    rebuildMatchContext(ms);
    markAIPlayer();
    uiMode.value = "match";
  }

  // ---- 继续 ----
  function continueAfterMatchResult() {
    const result = matchResult.value;
    matchResult.value = null;

    if (!result) return;

    if (wcState.phase === "group") {
      if (result.hasNext) {
        startNextGroupMatch();
      } else {
        finishGroupStage();
      }
    } else if (wcState.phase === "knockout") {
      if (result.winner === 0 && result.hasNext) {
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
  const currentPlayerName = computed(() => {
    const p = gameState.players.find(
      (p) =>
        matchState.value && p.characterId === matchState.value.playerCharId,
    );
    return p?.name || wcState.playerTeamName || "玩家";
  });
  const currentOpponentName = computed(() => {
    const p = gameState.players.find(
      (p) =>
        matchState.value && p.characterId === matchState.value.opponentCharId,
    );
    return p?.name || "对手";
  });
  const currentCharName = computed(() => {
    const p = gameState.players.find(
      (p) =>
        matchState.value && p.characterId === matchState.value.playerCharId,
    );
    return p?.characterName || "";
  });

  return {
    wcState,
    matchState,
    gameState,
    uiMode,
    goalFlash,
    matchResult,
    knockoutIntro,
    currentPlayerName,
    currentOpponentName,
    currentCharName,
    opponentSubPending,
    initWorldCup,
    startNextGroupMatch,
    enterKnockoutStage,
    startKnockoutMatch,
    continueKnockoutMatch,
    handleSubstitution,
    handleSkipSubstitution,
    handlePlayerSubstitution,
    handleOpponentSubstitution,
    handleOpponentSkipSubstitution,
    continueAfterMatchResult,
    continueFromStandings,
    doPenaltyRound,
    resetWorldCup,
  };
}
