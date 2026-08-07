import { reactive, ref, computed } from "vue";
import {
  createLeagueState,
  getPlayerMatchForRound,
  getPlayerOpponent,
  isPlayerHome,
  getCardBonus,
  simulateNonPlayerMatches,
  recordMatchResult,
  calculateStandings,
  calculateMatchScore,
  isLeagueFinished,
  checkTiebreakerNeeded,
  getRoundMatches,
  getMatchResult,
} from "../game/league.js";
import {
  LEAGUE_TEAMS,
  LEAGUE_MATCH_CONFIG,
  TOTAL_ROUNDS,
} from "../game/leagueConstants.js";
import {
  createGameState,
  initGame,
  serializeGameState,
  deserializeGameState,
} from "../game/gameState.js";
import { CHARACTERS } from "../game/constants.js";
import { recordSound } from "../game/soundEvents.js";

/**
 * 联赛控制器 — 管理联赛+比赛+游戏三层状态
 */
export function useLeagueController() {
  // ---- 三层状态 ----
  const leagueState = reactive(createLeagueState(0));
  const gameState = createGameState();
  const matchState = ref(null); // 当前比赛元信息

  // ---- UI 模式 ----
  const uiMode = ref("setup"); // 'setup' | 'draft' | 'match' | 'roundResult' | 'standings' | 'tournamentEnd'

  // 选人结果
  const draftResult = ref(null);

  // 本轮比赛结果（用于roundResult UI）
  const roundResults = ref(null);

  let aiDifficulty = "skilled";
  let useAI = true;
  let leagueArtifactId = null; // 玩家队伍圣遗物ID
  let opponentArtifactId = null; // 对手队伍圣遗物ID（手动模式）

  // ---- 初始化 ----
  function initLeague(
    teamId,
    difficulty = "skilled",
    artifactId = null,
    opponentArtId = null,
    aiEnabled = true,
  ) {
    aiDifficulty = difficulty;
    leagueArtifactId = artifactId;
    opponentArtifactId = opponentArtId;
    useAI = aiEnabled;
    const state = createLeagueState(teamId);
    Object.assign(leagueState, state);
    leagueState._currentRound = 1;
    uiMode.value = "draft";
  }

  /** 将圣遗物应用到所有人类玩家（根据AI开关分配） */
  function applyLeagueArtifact() {
    gameState.players.forEach((p) => {
      if (p.teamId === 0 && leagueArtifactId != null) {
        p.artifactId = leagueArtifactId;
        p.breakCount = 0;
        p.holyWordUses = 2;
        p.artifactActive = false;
        p.artifactRoundsLeft = 0;
      } else if (p.teamId === 1 && opponentArtifactId != null) {
        // 手动模式下对手也选圣遗物
        p.artifactId = opponentArtifactId;
        p.breakCount = 0;
        p.holyWordUses = 2;
        p.artifactActive = false;
        p.artifactRoundsLeft = 0;
      }
    });
  }

  // ---- 选人完成后开始比赛 ----
  function startMatchWithDraft(draft) {
    draftResult.value = draft;
    leagueState._playerChars = draft.playerChars;
    leagueState._opponentChars = draft.opponentChars;
    startRoundMatch(leagueState._currentRound);
  }

  // ---- 开始一轮的比赛 ----
  function startRoundMatch(round) {
    const pm = getPlayerMatchForRound(leagueState, round);
    if (!pm) {
      // 没有玩家比赛（不应该发生）
      finishRound();
      return;
    }

    const opponentId = getPlayerOpponent(leagueState, round);
    const home = isPlayerHome(leagueState, round);
    const cardBonus = getCardBonus(leagueState.playerTeamId, opponentId, home);

    // 获取队伍名称
    const playerTeam = LEAGUE_TEAMS[leagueState.playerTeamId];
    const opponentTeam = LEAGUE_TEAMS[opponentId];

    // 创建比赛元信息
    matchState.value = reactive({
      round,
      playerTeamId: 0, // 游戏中的teamId
      opponentTeamId: 1,
      isHome: home,
      cardBonus,
      deathOrder: [], // [{playerIndex, teamId}]
      matchOver: false,
      winner: null, // 0=玩家, 1=对手, null=平局
      playerScore: 0,
      opponentScore: 0,
      maxRounds: LEAGUE_MATCH_CONFIG.maxRounds,
    });

    // 初始化6人游戏
    // teamId: 0=玩家队伍, 1=对手队伍
    const allChars = [
      ...draftResult.value.playerChars,
      ...draftResult.value.opponentChars,
    ];
    const teamIds = [
      0,
      0,
      0, // 玩家队伍3人
      1,
      1,
      1, // 对手队伍3人
    ];

    initGame(
      gameState,
      allChars,
      false, // 无天气
      1, // startingRound
      LEAGUE_MATCH_CONFIG.deckCount,
      teamIds,
    );

    // 设置玩家名称
    gameState.players.forEach((p) => {
      if (p.teamId === 0) {
        p.name = `${playerTeam.emoji} ${playerTeam.name}·${CHARACTERS[p.characterId]?.name || "?"}`;
      } else {
        p.name = `${opponentTeam.emoji} ${opponentTeam.name}·${CHARACTERS[p.characterId]?.name || "?"}`;
      }
    });

    // 标记AI玩家（仅AI模式）
    if (useAI) {
      gameState.players.forEach((p) => {
        if (p.teamId === 1) {
          p.isAI = true;
          p.aiDifficulty = aiDifficulty;
        }
      });
    }

    // 应用圣遗物
    applyLeagueArtifact();

    // 设置联赛上下文
    gameState.leagueContext = {
      cardBonus,
      maxRounds: LEAGUE_MATCH_CONFIG.maxRounds,
      onPlayerDeath: (deadIdx) => {
        handlePlayerDeath(deadIdx);
      },
      onTeamWipe: (survivingTeamId) => {
        handleTeamWipe(survivingTeamId);
      },
      onNewRound: (round) => {
        if (matchState.value && !matchState.value.matchOver) {
          matchState.value._currentRound = round;
        }
      },
      onRoundLimit: () => {
        handleRoundLimit();
      },
    };

    uiMode.value = "match";
  }

  // ---- 球员死亡处理 ----
  function handlePlayerDeath(deadIdx) {
    const ms = matchState.value;
    if (!ms || ms.matchOver) return;

    const deadPlayer = gameState.players.find((p) => p.index === deadIdx);
    if (!deadPlayer) return;

    // 记录死亡顺序
    ms.deathOrder.push({
      playerIndex: deadIdx,
      teamId: deadPlayer.teamId,
      charId: deadPlayer.characterId,
    });

    // 检查团灭
    const alive = gameState.players.filter((p) => p.alive);
    const playerAlive = alive.filter((p) => p.teamId === 0);
    const opponentAlive = alive.filter((p) => p.teamId === 1);

    if (playerAlive.length === 0 || opponentAlive.length === 0) {
      const survivingTeam = playerAlive.length > 0 ? 0 : 1;
      handleTeamWipe(survivingTeam);
    }
  }

  // ---- 团灭处理 ----
  function handleTeamWipe(survivingTeamId) {
    const ms = matchState.value;
    if (!ms || ms.matchOver) return;

    ms.matchOver = true;
    ms.winner = survivingTeamId;
    recordSound(gameState, "match_end");

    const { playerScore, opponentScore } = calculateMatchScore(
      ms.deathOrder,
      0,
      1,
    );
    ms.playerScore = playerScore;
    ms.opponentScore = opponentScore;

    // 延迟跳转到比赛结果（短暂暂停让玩家看到最后一击）
    setTimeout(() => {
      gameState._elimPaused = false;
      finishMatch();
    }, 800);
  }

  // ---- 回合上限到达（平局） ----
  function handleRoundLimit() {
    const ms = matchState.value;
    if (!ms || ms.matchOver) return;

    ms.matchOver = true;
    ms.winner = null; // 平局
    recordSound(gameState, "match_end");

    const { playerScore, opponentScore } = calculateMatchScore(
      ms.deathOrder,
      0,
      1,
    );
    ms.playerScore = playerScore;
    ms.opponentScore = opponentScore;

    setTimeout(() => {
      gameState._elimPaused = false;
      finishMatch();
    }, 800);
  }

  // ---- 比赛结束 ----
  function finishMatch() {
    const ms = matchState.value;
    if (!ms) return;

    const round = ms.round;
    // 记录比赛结果
    if (ms.winner === 0) {
      recordMatchResult(leagueState, round, "home"); // 玩家视角的主队胜
    } else if (ms.winner === 1) {
      recordMatchResult(leagueState, round, "away"); // 玩家视角的客队胜
    } else {
      recordMatchResult(leagueState, round, "draw");
    }

    // 模拟本轮其他比赛
    simulateNonPlayerMatches(leagueState, round);

    // 构建本轮结果展示
    buildRoundResults(round);

    uiMode.value = "roundResult";
  }

  // ---- 构建本轮所有比赛结果 ----
  function buildRoundResults(round) {
    const matches = getRoundMatches(round);
    const results = matches.map((m, idx) => {
      const result = getMatchResult(leagueState, round, idx);
      const homeTeam = LEAGUE_TEAMS[m.home];
      const awayTeam = LEAGUE_TEAMS[m.away];
      const isPlayer =
        m.home === leagueState.playerTeamId ||
        m.away === leagueState.playerTeamId;

      return {
        homeTeamId: m.home,
        homeName: homeTeam.name,
        homeEmoji: homeTeam.emoji,
        awayTeamId: m.away,
        awayName: awayTeam.name,
        awayEmoji: awayTeam.emoji,
        result: result || "?",
        isPlayer,
      };
    });

    roundResults.value = results;
  }

  // ---- 继续到下一轮 ----
  function continueToNextRound() {
    leagueState._currentRound++;

    if (isLeagueFinished(leagueState)) {
      // 检查是否需要加赛
      const tb = checkTiebreakerNeeded(leagueState);
      if (tb.needed) {
        // 设置加赛状态
        leagueState._tiebreakerNeeded = true;
        leagueState._tiebreakerOpponent = tb.opponentTeamId;
      }
      uiMode.value = "standings";
    } else {
      // 新一轮需要重新选人
      uiMode.value = "draft";
    }
  }

  // ---- 查看积分榜 ----
  function viewStandings() {
    uiMode.value = "standings";
  }

  // ---- 获取当前积分榜 ----
  function getStandings() {
    return calculateStandings(leagueState);
  }

  // ---- 联赛结束 ----
  function finishLeague() {
    uiMode.value = "tournamentEnd";
  }

  // ---- 加赛 ----
  function startTiebreaker() {
    leagueState._tiebreakerNeeded = false;
    // 加赛也需要重新选人
    leagueState._isTiebreaker = true;
    uiMode.value = "draft";
  }

  // ---- 加赛完成后的比赛开始 ----
  function startTiebreakerMatch(draft) {
    draftResult.value = draft;
    leagueState._playerChars = draft.playerChars;
    leagueState._opponentChars = draft.opponentChars;

    const opponentId = leagueState._tiebreakerOpponent;
    const playerTeam = LEAGUE_TEAMS[leagueState.playerTeamId];
    const opponentTeam = LEAGUE_TEAMS[opponentId];

    matchState.value = reactive({
      round: TOTAL_ROUNDS + 1,
      playerTeamId: 0,
      opponentTeamId: 1,
      isHome: true, // 加赛无主客场区别
      cardBonus: { attackBonus: 0, defenseBonus: 0 },
      deathOrder: [],
      matchOver: false,
      winner: null,
      playerScore: 0,
      opponentScore: 0,
      maxRounds: Infinity, // 加赛无回合上限
      isTiebreaker: true,
    });

    const allChars = [...draft.playerChars, ...draft.opponentChars];
    const teamIds = [0, 0, 0, 1, 1, 1];

    initGame(
      gameState,
      allChars,
      false,
      1,
      LEAGUE_MATCH_CONFIG.deckCount,
      teamIds,
    );

    gameState.players.forEach((p) => {
      if (p.teamId === 0) {
        p.name = `${playerTeam.emoji} ${playerTeam.name}·${CHARACTERS[p.characterId]?.name || "?"}`;
      } else {
        p.name = `${opponentTeam.emoji} ${opponentTeam.name}·${CHARACTERS[p.characterId]?.name || "?"}`;
      }
    });

    // 标记AI玩家（仅AI模式）
    if (useAI) {
      gameState.players.forEach((p) => {
        if (p.teamId === 1) {
          p.isAI = true;
          p.aiDifficulty = aiDifficulty;
        }
      });
    }

    applyLeagueArtifact();

    gameState.leagueContext = {
      cardBonus: { attackBonus: 0, defenseBonus: 0 },
      maxRounds: Infinity,
      onPlayerDeath: (deadIdx) => {
        handlePlayerDeath(deadIdx);
      },
      onTeamWipe: (survivingTeamId) => {
        // 加赛：团灭即结束
        const ms = matchState.value;
        if (!ms || ms.matchOver) return;
        ms.matchOver = true;
        ms.winner = survivingTeamId;
        recordSound(gameState, "match_end");
        const { playerScore, opponentScore } = calculateMatchScore(
          ms.deathOrder,
          0,
          1,
        );
        ms.playerScore = playerScore;
        ms.opponentScore = opponentScore;
        setTimeout(() => {
          gameState._elimPaused = false;
          finishTiebreaker();
        }, 800);
      },
      onNewRound: () => {},
      onRoundLimit: () => {},
    };

    uiMode.value = "match";
  }

  function finishTiebreaker() {
    // 加赛结束后直接显示最终排名
    uiMode.value = "tournamentEnd";
  }

  // ---- 存档/读档 ----
  function saveLeague() {
    return {
      gameMode: "football",
      footballSubMode: "league",
      leagueSetup: {
        teamId: leagueState.playerTeamId,
        difficulty: aiDifficulty,
        artifactId: leagueArtifactId,
        opponentArtifactId: opponentArtifactId,
        useAI,
      },
      leagueState: {
        playerTeamId: leagueState.playerTeamId,
        currentRound: leagueState._currentRound,
        results: { ...leagueState.results },
        roundSimulated: { ...leagueState.roundSimulated },
        _playerChars: leagueState._playerChars,
        _opponentChars: leagueState._opponentChars,
        _tiebreakerNeeded: leagueState._tiebreakerNeeded,
        _tiebreakerOpponent: leagueState._tiebreakerOpponent,
        _isTiebreaker: leagueState._isTiebreaker,
      },
      matchState: matchState.value ? { ...matchState.value } : null,
      draftResult: draftResult.value ? { ...draftResult.value } : null,
      gameState: serializeGameState(gameState),
      uiMode: uiMode.value,
    };
  }

  function restoreLeague(saveData) {
    const sd = saveData;
    aiDifficulty = sd.leagueSetup?.difficulty || "skilled";
    leagueArtifactId = sd.leagueSetup?.artifactId ?? null;
    opponentArtifactId = sd.leagueSetup?.opponentArtifactId ?? null;
    useAI = sd.leagueSetup?.useAI ?? true;

    Object.assign(leagueState, {
      playerTeamId: sd.leagueState.playerTeamId,
      _currentRound: sd.leagueState.currentRound,
      results: sd.leagueState.results || {},
      roundSimulated: sd.leagueState.roundSimulated || {},
      _playerChars: sd.leagueState._playerChars,
      _opponentChars: sd.leagueState._opponentChars,
      _tiebreakerNeeded: sd.leagueState._tiebreakerNeeded,
      _tiebreakerOpponent: sd.leagueState._tiebreakerOpponent,
      _isTiebreaker: sd.leagueState._isTiebreaker,
    });

    if (sd.draftResult) {
      draftResult.value = sd.draftResult;
    }

    if (sd.matchState && sd.gameState) {
      // 恢复比赛中状态
      matchState.value = reactive(sd.matchState);

      deserializeGameState(gameState, sd.gameState);

      // 重建leagueContext
      rebuildLeagueContext();

      uiMode.value = "match";
    } else {
      uiMode.value = sd.uiMode || "standings";
    }
  }

  function rebuildLeagueContext() {
    const ms = matchState.value;
    if (!ms) return;

    gameState.leagueContext = {
      cardBonus: ms.cardBonus || { attackBonus: 0, defenseBonus: 0 },
      maxRounds: ms.maxRounds || LEAGUE_MATCH_CONFIG.maxRounds,
      onPlayerDeath: (deadIdx) => {
        handlePlayerDeath(deadIdx);
      },
      onTeamWipe: (survivingTeamId) => {
        handleTeamWipe(survivingTeamId);
      },
      onNewRound: (round) => {
        if (matchState.value && !matchState.value.matchOver) {
          matchState.value._currentRound = round;
        }
      },
      onRoundLimit: () => {
        handleRoundLimit();
      },
    };
  }

  // ---- 重置 ----
  function resetLeague() {
    uiMode.value = "setup";
    matchState.value = null;
    draftResult.value = null;
    roundResults.value = null;
    Object.assign(leagueState, createLeagueState(0));
  }

  // ---- 计算属性 ----
  const currentPlayerTeam = computed(() => {
    return LEAGUE_TEAMS[leagueState.playerTeamId] || LEAGUE_TEAMS[1];
  });

  const currentOpponentTeam = computed(() => {
    const round = leagueState._currentRound || 1;
    const opponentId = getPlayerOpponent(leagueState, round);
    return LEAGUE_TEAMS[opponentId] || LEAGUE_TEAMS[2];
  });

  return {
    leagueState,
    matchState,
    gameState,
    uiMode,
    draftResult,
    roundResults,
    currentPlayerTeam,
    currentOpponentTeam,
    initLeague,
    startMatchWithDraft,
    continueToNextRound,
    viewStandings,
    getStandings,
    finishLeague,
    startTiebreaker,
    startTiebreakerMatch,
    saveLeague,
    restoreLeague,
    resetLeague,
    rebuildLeagueContext,
  };
}
