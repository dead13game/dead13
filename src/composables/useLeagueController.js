import { reactive, ref, computed } from "vue";
import {
  createLeagueState,
  getPlayerMatchForRound,
  getPlayerOpponent,
  isPlayerHome,
  getTeamCardBonuses,
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
} from "../game/flow/setup.js";
import { createSession, save, load, rewireContext } from "../game/api.js";
import { createLeagueMatchMode } from "../game/modes/league.js";
import { CHARACTERS } from "../game/characters/index.js";
import { recordSound } from "../game/soundEvents.js";

/**
 * 联赛控制器 — 管理联赛+比赛+游戏三层状态
 */
export function useLeagueController() {
  // ---- 三层状态 ----
  const leagueState = reactive(createLeagueState(0));
  const gameState = reactive(createGameState());
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
    leagueState.currentRound = 1;
    leagueState._tiebreakerNeeded = false;
    leagueState._tiedTeams = [];
    leagueState._tiebreakerOpponent = null;
    leagueState._tiebreakResult = null;
    leagueState._tiebreakOrder = null;
    leagueState._isTiebreaker = false;
    uiMode.value = "draft";
  }

  /** 将圣遗物应用到所有玩家（根据AI开关分配） */
  function applyLeagueArtifact() {
    gameState.players.forEach((p) => {
      const artId =
        p.teamId === 0 ? leagueArtifactId : opponentArtifactId;
      if (artId == null) return;
      p.artifact.id = artId;
      p.artifact.active = false;
      p.artifact.roundsLeft = 0;
      p.resources.breakCount = 0;
      p.resources.holyWordUses = 2;
    });
  }

  // ---- 选人完成后开始比赛 ----
  function startMatchWithDraft(draft) {
    // 加赛也走同一个选人组件：这里统一路由，避免选完人后卡死
    if (leagueState._isTiebreaker) {
      startTiebreakerMatch(draft);
      return;
    }
    draftResult.value = draft;
    leagueState._playerChars = draft.playerChars;
    leagueState._opponentChars = draft.opponentChars;
    startRoundMatch(leagueState._currentRound);
  }

  // ---- 开始一轮的比赛 ----
  function startRoundMatch(round) {
    const pm = getPlayerMatchForRound(leagueState, round);
    if (!pm) {
      // 没有玩家比赛（正常情况下不该发生）：直接按联赛结束处理
      finishLeague();
      return;
    }

    const opponentId = getPlayerOpponent(leagueState, round);
    const home = isPlayerHome(leagueState, round);
    // 双方各自卡牌加成（teamId 0=玩家队伍，1=对手队伍）：
    // 等级差与主场加成对双方通用，各按本方 vs 对方视角计算
    const cardBonus = getTeamCardBonuses(
      leagueState.playerTeamId,
      opponentId,
      home,
    );

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

    // 初始化 6 人比赛(新内核:mode 提供规则,不再挂 leagueContext)
    const allChars = [
      ...draftResult.value.playerChars,
      ...draftResult.value.opponentChars,
    ];
    const teamIds = [0, 0, 0, 1, 1, 1];

    const mode = buildLeagueMode(cardBonus, LEAGUE_MATCH_CONFIG.maxRounds);
    createSession({
      state: gameState,
      chars: allChars,
      weather: true, // v3.5：联赛也启用天气（固定顺序轮换）
      startRound: 1,
      deckCount: LEAGUE_MATCH_CONFIG.deckCount,
      teamIds,
      mode,
    });

    // 队伍名 + AI 标记（新内核: player.ai.enabled）
    gameState.players.forEach((p) => {
      const team = p.teamId === 0 ? playerTeam : opponentTeam;
      p.name = `${team.emoji} ${team.name}·${CHARACTERS[p.characterId]?.name || "?"}`;
      if (useAI && p.teamId === 1) {
        p.ai.enabled = true;
        p.ai.difficulty = aiDifficulty;
      }
    });

    applyLeagueArtifact();

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
      handleTeamWipe();
    }
  }

  // ---- 团灭处理 ----
  // 胜负只看积分：团灭对方不等于获胜，名次分高者胜、积分相等则平局
  function handleTeamWipe() {
    const ms = matchState.value;
    if (!ms || ms.matchOver) return;

    ms.matchOver = true;
    recordSound(gameState, "match_end");

    const { playerScore, opponentScore, winner } = calculateMatchScore(
      ms.deathOrder,
      0,
      1,
    );
    ms.playerScore = playerScore;
    ms.opponentScore = opponentScore;
    ms.winner = winner;

    // 延迟跳转到比赛结果（短暂暂停让玩家看到最后一击）
    setTimeout(() => {
      finishMatch();
    }, 800);
  }

  // ---- 回合上限到达（平局） ----
  function handleRoundLimit() {
    const ms = matchState.value;
    if (!ms || ms.matchOver) return;

    ms.matchOver = true;
    recordSound(gameState, "match_end");

    const { playerScore, opponentScore, winner } = calculateMatchScore(
      ms.deathOrder,
      0,
      1,
    );
    ms.playerScore = playerScore;
    ms.opponentScore = opponentScore;
    // 30 回合到点：双方均有人存活时名次未定 → winner 为 null（平局）
    ms.winner = winner;

    setTimeout(() => {
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
    leagueState.currentRound = leagueState._currentRound;

    if (isLeagueFinished(leagueState)) {
      evaluateLeagueEnd();
      uiMode.value = "standings";
    } else {
      // 新一轮需要重新选人
      uiMode.value = "draft";
    }
  }

  /** 18 轮结束后：只处理涉及玩家的附加赛，其余同分队随机模拟 */
  function evaluateLeagueEnd() {
    const tb = checkTiebreakerNeeded(leagueState);
    leagueState._tiebreakerNeeded = tb.needed;
    leagueState._tiedTeams = tb.tiedTeamIds;
    leagueState._tiebreakerOpponent = tb.opponentTeamId;
    if (!tb.needed) {
      leagueState._tiebreakOrder = null;
      return;
    }
    // 玩家先与排名最高的同分队打一局；其余同分队的相对名次随机模拟
    const others = tb.tiedTeamIds.filter((id) => id !== tb.opponentTeamId);
    const shuffled = [...others].sort(() => Math.random() - 0.5);
    leagueState._tiebreakOrder = [
      leagueState.playerTeamId,
      tb.opponentTeamId,
      ...shuffled,
    ];
  }

  // ---- 查看积分榜 ----
  function viewStandings() {
    // 第 18 轮结束后点「查看积分榜」时，轮次还没被 continueToNextRound 推进：
    // 这里补一次推进，保证附加赛判定与 isFinished 都正确。
    if (leagueState._currentRound === TOTAL_ROUNDS) {
      leagueState._currentRound++;
      leagueState.currentRound = leagueState._currentRound;
    }
    if (leagueState._currentRound > TOTAL_ROUNDS) evaluateLeagueEnd();
    uiMode.value = "standings";
  }

  // ---- 获取当前积分榜（附加赛结果会覆盖同分队的相对名次） ----
  function getStandings() {
    const base = calculateStandings(leagueState);
    const order = leagueState._tiebreakOrder;
    if (!order?.length) return base;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...base].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return (rank.get(a.teamId) ?? 999) - (rank.get(b.teamId) ?? 999);
    });
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
      // 加赛不涉及等级差/主场，两队均无加成
      cardBonus: buildNoBonusCardBonus(),
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

    const mode = buildLeagueMode(buildNoBonusCardBonus(), Infinity, {
      onTeamWipe: (survivingTeam) => handleTiebreakerWipe(survivingTeam),
      onRoundLimit: () => {},
    });
    createSession({
      state: gameState,
      chars: allChars,
      weather: true,
      startRound: 1,
      deckCount: LEAGUE_MATCH_CONFIG.deckCount,
      teamIds,
      mode,
    });

    gameState.players.forEach((p) => {
      const team = p.teamId === 0 ? playerTeam : opponentTeam;
      p.name = `${team.emoji} ${team.name}·${CHARACTERS[p.characterId]?.name || "?"}`;
      if (useAI && p.teamId === 1) {
        p.ai.enabled = true;
        p.ai.difficulty = aiDifficulty;
      }
    });

    applyLeagueArtifact();

    uiMode.value = "match";
  }

  /** 加赛:胜负按积分,winner 为 null 时用最后存活方兜底 */
  function handleTiebreakerWipe(survivingTeam) {
    const ms = matchState.value;
    if (!ms || ms.matchOver) return;
    ms.matchOver = true;
    recordSound(gameState, "match_end");

    const { playerScore, opponentScore, winner } = calculateMatchScore(
      ms.deathOrder,
      0,
      1,
    );
    ms.playerScore = playerScore;
    ms.opponentScore = opponentScore;
    ms.winner = winner === null ? survivingTeam : winner;

    setTimeout(() => finishTiebreaker(), 800);
  }

  function finishTiebreaker() {
    // 加赛结束后按胜负覆盖同分队的相对名次（其余同分队在 evaluateLeagueEnd 已随机）
    const ms = matchState.value;
    const playerId = leagueState.playerTeamId;
    const oppId = leagueState._tiebreakerOpponent;
    const others = (leagueState._tiebreakOrder || []).filter(
      (id) => id !== playerId && id !== oppId,
    );
    if (ms?.winner === 0) {
      leagueState._tiebreakOrder = [playerId, oppId, ...others];
      leagueState._tiebreakResult = 0;
    } else if (ms?.winner === 1) {
      leagueState._tiebreakOrder = [oppId, playerId, ...others];
      leagueState._tiebreakResult = 1;
    }
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
        _tiedTeams: leagueState._tiedTeams,
        _tiebreakerOpponent: leagueState._tiebreakerOpponent,
        _tiebreakResult: leagueState._tiebreakResult,
        _tiebreakOrder: leagueState._tiebreakOrder,
        _isTiebreaker: leagueState._isTiebreaker,
      },
      matchState: matchState.value ? { ...matchState.value } : null,
      draftResult: draftResult.value ? { ...draftResult.value } : null,
      gameState: save(gameState),
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
      currentRound: sd.leagueState.currentRound,
      results: sd.leagueState.results || {},
      roundSimulated: sd.leagueState.roundSimulated || {},
      _playerChars: sd.leagueState._playerChars,
      _opponentChars: sd.leagueState._opponentChars,
      _tiebreakerNeeded: sd.leagueState._tiebreakerNeeded,
      _tiedTeams: sd.leagueState._tiedTeams || [],
      _tiebreakerOpponent: sd.leagueState._tiebreakerOpponent,
      _tiebreakResult: sd.leagueState._tiebreakResult ?? null,
      _tiebreakOrder: sd.leagueState._tiebreakOrder ?? null,
      _isTiebreaker: sd.leagueState._isTiebreaker,
    });

    if (sd.draftResult) {
      draftResult.value = sd.draftResult;
    }

    if (sd.matchState && sd.gameState) {
      // 恢复比赛中状态
      matchState.value = reactive(sd.matchState);

      const ms = matchState.value;
      const mode = ms.isTiebreaker
        ? buildLeagueMode(buildNoBonusCardBonus(), Infinity, {
            onTeamWipe: (survivingTeam) => handleTiebreakerWipe(survivingTeam),
            onRoundLimit: () => {},
          })
        : buildLeagueMode(
            buildCardBonusFromMatch(ms),
            ms.maxRounds || LEAGUE_MATCH_CONFIG.maxRounds,
          );

      load(gameState, sd.gameState, { modeFactory: () => mode });

      uiMode.value = "match";
    } else {
      uiMode.value = sd.uiMode || "standings";
    }
  }

  // ---- 卡牌加成辅助 ----

  /** 两队均无加成的 cardBonus 结构（加赛用） */
  function buildNoBonusCardBonus() {
    return {
      0: { attackBonus: 0, defenseBonus: 0 },
      1: { attackBonus: 0, defenseBonus: 0 },
    };
  }

  /**
   * 读档时按球队与主客场重算两队卡牌加成（兼容旧存档的平铺格式，
   * 旧值本身按旧规则可能错误，故一律重算而非沿用存档值）
   * @returns {{0: object, 1: object}}
   */
  function buildCardBonusFromMatch(ms) {
    if (!ms || ms.isTiebreaker || ms.round > TOTAL_ROUNDS) {
      return buildNoBonusCardBonus();
    }
    const pm = getPlayerMatchForRound(leagueState, ms.round);
    if (!pm) return buildNoBonusCardBonus();
    return getTeamCardBonuses(
      leagueState.playerTeamId,
      pm.isHome ? pm.match.away : pm.match.home,
      pm.isHome,
    );
  }

  /**
   * 构建联赛模式适配器。
   * 规则(每场 4 回合和平期 / 禁结盟 / 围攻 / 回合上限 / 劣势补给)全在 modes/league.js,
   * 这里只负责把生命周期回调接到控制器。
   */
  function buildLeagueMode(cardBonus, maxRounds, overrides = {}) {
    return createLeagueMatchMode({
      maxRounds,
      cardBonus,
      hooks: {
        onPlayerDeath: (deadIdx) => handlePlayerDeath(deadIdx),
        onTeamWipe: () => handleTeamWipe(),
        onRoundLimit: () => handleRoundLimit(),
        onNewRound: (round) => {
          const ms = matchState.value;
          if (ms && !ms.matchOver) {
            // clamp 到上限:第31回合触发平局判定时记分牌不应显示 R31/30
            ms._currentRound = Math.min(round, ms.maxRounds);
          }
        },
        ...overrides,
      },
    });
  }

  /** 读档/热重载后重建模式并重新接线 ctx */
  function rebuildLeagueContext() {
    const ms = matchState.value;
    if (!ms) return;
    const mode = ms.isTiebreaker
      ? buildLeagueMode(buildNoBonusCardBonus(), Infinity, {
          onTeamWipe: (survivingTeam) => handleTiebreakerWipe(survivingTeam),
          onRoundLimit: () => {},
        })
      : buildLeagueMode(
          buildCardBonusFromMatch(ms),
          ms.maxRounds || LEAGUE_MATCH_CONFIG.maxRounds,
        );
    gameState.mode = mode;
    rewireContext(gameState, mode);
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
    if (leagueState._isTiebreaker) {
      return LEAGUE_TEAMS[leagueState._tiebreakerOpponent] || LEAGUE_TEAMS[2];
    }
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
