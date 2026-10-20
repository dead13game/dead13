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
import { createSession, load, getCtx } from "../game/api.js";
import { createGameState } from "../game/flow/setup.js";
import { createWorldCupMatchMode } from "../game/modes/worldcup.js";
import { MATCH_CONFIG } from "../game/modes/constants.js";
import { CHARACTERS } from "../game/characters/index.js";
import { recordSound } from "../game/soundEvents.js";

/**
 * 世界杯控制器 — 管理锦标赛+比赛+游戏三层状态
 */
export function useWorldCupController() {
  // ---- 三层状态 ----
  const wcState = reactive(createWorldCupState(""));
  const matchState = ref(null);
  const gameState = reactive(createGameState());
  let gameCtx = null;

  // ---- UI 模式 ----
  const uiMode = ref("setup");
  const goalFlash = ref(false);
  const matchResult = ref(null);
  const knockoutIntro = ref(null);
  const opponentSubPending = ref(false);

  let useWeather = false;
  let aiDifficulty = "easy";
  let playerArtifactId = null; // 玩家圣遗物ID
  let opponentArtifactId = null; // 对手圣遗物ID（手动模式）

  // ---- 初始化 ----
  function initWorldCup(
    teamName,
    startingCharId,
    opponentNames,
    weather,
    difficulty = "easy",
    artifactId = null,
    oppArtifactId = null,
  ) {
    useWeather = weather || false;
    aiDifficulty = difficulty;
    playerArtifactId = artifactId;
    opponentArtifactId = oppArtifactId;
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
    const opponentCharId = wcState._groupOpponentChars[matchIdx];
    const playerCharId = startingCharId || wcState._lastPlayerChar;

    const mode = buildMatchMode({
      isGroupStage: true,
      playerCharId,
      opponentCharId,
    });
    startMatchState(mode, 1);
    uiMode.value = "match";
  }

  /** 建立「模式 + 局面」,并把 matchState 指向模式里的比赛对象 */
  function startMatchState(mode, startingRound = 1) {
    matchState.value = mode.match;
    wcState.currentMatch = mode.match;

    const { ctx } = createSession({
      state: gameState,
      chars: [mode.match.playerCharId, mode.match.opponentCharId],
      weather: useWeather,
      startRound: startingRound,
      mode,
    });
    gameCtx = ctx;

    labelPlayers(mode.match);
    applyPlayerArtifact();
    markAIPlayer();
    wcState._lastPlayerChar = mode.match.playerCharId;
    return mode;
  }

  function labelPlayers(ms) {
    const playerName = wcState.playerTeamName || "玩家";
    const opponentName = getCurrentOpponentName();
    gameState.players.forEach((p) => {
      p.name = p.characterId === ms.opponentCharId ? opponentName : playerName;
    });
  }

  function buildMatchMode({ isGroupStage, playerCharId, opponentCharId }) {
    return createWorldCupMatchMode({
      isGroupStage,
      playerCharId,
      opponentCharId,
      playerArtifactId,
      wrap: reactive, // 比分/回合要驱动 UI,由控制器传入响应式包装
      onAfterCheck: () => routeAfterCheck(),
    });
  }

  /** 内核完成进球/到点结算后,决定 UI 该进哪个阶段 */
  function routeAfterCheck() {
    const ms = matchState.value;
    if (!ms) return;
    if (ms.isPenaltyShootout) uiMode.value = "penalty";
    else if (ms.matchOver) handleMatchEnd(ms);
    else if (ms.substitutionPending) uiMode.value = "substitution";
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
    recordSound(gameState, "match_end");
    const winner = ms.winner;
    const [pScore, oScore] = ms.score;
    const decidedByPenalty = ms.isPenaltyShootout || false;

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
          stage: decidedByPenalty
            ? `小组赛第${(matchIdx >= 0 ? matchIdx : 0) + 1}场（点球）`
            : `小组赛第${(matchIdx >= 0 ? matchIdx : 0) + 1}场`,
          hasNext: true,
          isGroupStage: true,
          decidedByPenalty,
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
          decidedByPenalty,
        };
        uiMode.value = "matchResult";
      } else {
        matchResult.value = {
          winner: 1,
          score: [pScore, oScore],
          stage: roundName,
          hasNext: false,
          eliminated: true,
          decidedByPenalty,
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
    opponentSubPending.value = false;

    const mode = buildMatchMode({
      isGroupStage: false,
      playerCharId,
      opponentCharId: opponent.charId,
    });
    startMatchState(mode, 1);
    uiMode.value = "match";
  }

  // ---- 继续下一场淘汰赛 ----
  function continueKnockoutMatch() {
    if (!matchState.value) return;
    startNextLife();
    uiMode.value = "match";
  }

  /** 下一命:内核重建局面,控制器补圣遗物/AI/先手 */
  function startNextLife() {
    const mode = gameState.mode;
    if (!mode?.startNextLife || !gameCtx) return;
    mode.startNextLife(gameCtx);
    applyPlayerArtifact();
    fixTurnAfterReset();
    markAIPlayer();
  }

  /** 读档/热重载后重新接线(新内核里 mode 已存在时是空操作) */
  function rebuildMatchContext(ms) {
    if (!ms) return;
    if (gameState.mode !== ms.__mode && gameCtx) {
      // 仅供调试:正常情况下 mode 由 startMatchState 一并创建
      gameState.mode = ms.__mode ?? gameState.mode;
    }
  }

  /**
   * 从存档恢复世界杯比赛(比赛进度 + 局面 + 模式)。
   * 旧实现靠 deserializeGameState + 手工重建 matchContext;现在模式对象本身
   * 就是数据(mode.match),读档直接还原它。
   */
  function restoreWorldCup(saveData) {
    if (!saveData?.wcState || !saveData?.matchState) return false;

    setArtifacts(
      saveData.wcSetup?.artifactId ?? null,
      saveData.wcSetup?.opponentArtifactId ?? null,
    );
    Object.assign(wcState, saveData.wcState);

    const saved = saveData.matchState;
    const mode = buildMatchMode({
      isGroupStage: !!saved.isGroupStage,
      playerCharId: saved.playerCharId,
      opponentCharId: saved.opponentCharId,
    });
    Object.assign(mode.match, saved);
    matchState.value = mode.match;
    wcState.currentMatch = mode.match;

    const ok = load(gameState, saveData.gameState, { modeFactory: () => mode });
    if (!ok) return false;

    gameCtx = getCtx(gameState);
    markAIPlayer();
    applyPlayerArtifact();
    uiMode.value = "match";
    return true;
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
    if (!matchState.value || !gameCtx) return;
    gameState.mode.executeSubstitution(gameCtx, newCharId);
    startNextLife();
    uiMode.value = "match";
  }

  function handleSkipSubstitution() {
    if (!matchState.value || !gameCtx) return;
    gameState.mode.skipSubstitution(gameCtx);
    applyPlayerArtifact();
    fixTurnAfterReset();
    markAIPlayer();
    uiMode.value = "match";
  }

  /** 在游戏初始化/重置后给双方应用圣遗物ID */
  function applyPlayerArtifact() {
    if (!matchState.value) return;
    const { playerCharId, opponentCharId } = matchState.value;
    gameState.players.forEach((p) => {
      const artId =
        p.characterId === playerCharId
          ? playerArtifactId
          : p.characterId === opponentCharId
            ? opponentArtifactId
            : null;
      p.artifact.id = artId;
      p.artifact.active = false;
      p.artifact.roundsLeft = 0;
      p.resources.breakCount = 0;
      p.resources.holyWordUses = 2;
    });
  }

  /** 标记 AI 玩家（重置游戏后需重新标记） */
  function markAIPlayer() {
    if (!matchState.value) return;
    const opponentCharId = matchState.value.opponentCharId;
    gameState.players.forEach((p) => {
      if (p.characterId === opponentCharId) {
        p.ai.enabled = true;
        p.ai.difficulty = aiDifficulty;
      }
    });
  }

  // ---- 手动模式双步换人 ----

  /** 玩家换人（第一步：执行换人但不重置游戏，等待对手也换人） */
  function handlePlayerSubstitution(newCharId) {
    if (!matchState.value || !gameCtx) return;
    gameState.mode.executeSubstitution(gameCtx, newCharId);
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
    const charData = CHARACTERS[newCharId];

    if (opponent && charData) {
      Object.assign(opponent, {
        characterId: charData.id,
        hp: charData.hp,
        maxHp: charData.hp,
      });
      opponent.resources.skillUses = charData.maxUses;

      gameState.messageLog.push(
        `🔄 对手换人：${charData.name} 上场！（剩余换人 ${ms.substitutionsLeft - 1} 次）`,
      );
    }

    ms.opponentCharId = newCharId;
    ms.substitutionsLeft--;
    opponentSubPending.value = false;

    startNextLife();
    uiMode.value = "match";
  }

  /** 对手跳过换人（第二步skip：不换角色但统一重置游戏） */
  function handleOpponentSkipSubstitution() {
    if (!matchState.value) return;
    opponentSubPending.value = false;
    startNextLife();
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
    if (!matchState.value || !gameCtx) return null;
    // 新内核不再需要「临时把 matchOver 改回 false」的 hack(KB-12)
    const result = gameState.mode.executePenaltyRound(gameCtx);
    if (result?.winner !== null && result?.winner !== undefined) {
      matchState.value.winner = result.winner;
      // 不立即调用 handleMatchEnd — 让 UI 先展示最终轮结果再手动跳转
    }
    return result;
  }

  /** 点球结束后手动跳转到比赛结果页 */
  function finishPenalty() {
    if (!matchState.value) return;
    handleMatchEnd(matchState.value);
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

  /** 读档时恢复圣遗物配置 */
  function setArtifacts(playerArt, oppArt) {
    playerArtifactId = playerArt;
    opponentArtifactId = oppArt;
  }

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
    finishPenalty,
    resetWorldCup,
    rebuildMatchContext,
    restoreWorldCup,
    markAIPlayer,
    setArtifacts,
    applyPlayerArtifact,
  };
}
