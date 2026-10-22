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
import type {
  KnockoutOpponent,
  WorldCupState,
} from "../game/worldCup.js";
import type {
  MatchMode,
  MatchState,
  PenaltyRoundResult,
} from "../game/modes/match.js";
import type { Ctx, GameState, ModeAdapter, Player } from "../game/types.js";

/**
 * 世界杯运行态。
 * `_` 前缀字段是控制器的编排簿记（WorldCupState 用索引签名容纳），
 * 这里显式声明，读的时候不必再收窄 unknown。
 */
interface WorldCupRuntimeState extends WorldCupState {
  _groupOpponentChars?: number[];
  _lastPlayerChar?: number;
  _groupFinished?: boolean;
  _playerRank?: number;
  _advanced?: boolean;
}

/**
 * 比赛状态。
 * `_killedUid` / `_killedCharId` 在换人重置后由控制器置 null（旧实现如此），
 * 而 MatchState 里声明成 `number | undefined`，故这里放宽成含 null。
 */
type WorldCupMatchState = Omit<
  MatchState,
  "_killedUid" | "_killedCharId"
> & {
  _killedUid?: number | null;
  _killedCharId?: number | null;
};

/** 调试用：旧实现会把 mode 挂在 match 上（__mode） */
type WorldCupMatchRuntime = WorldCupMatchState & {
  __mode?: ModeAdapter | null;
};

/** 比赛结果页要展示的数据 */
interface WorldCupMatchResultView {
  winner: number | null;
  score: [number, number];
  stage: string;
  hasNext?: boolean;
  isGroupStage?: boolean;
  isChampion?: boolean;
  decidedByPenalty?: boolean;
  eliminated?: boolean;
}

/** 整届战绩的一行（小组赛 + 淘汰赛） */
interface MatchHistoryEntry {
  stage: string;
  opponent: string;
  opponentEmoji?: string;
  score: [number, number];
  winner: number | null;
  isGroup: boolean;
  decidedByPenalty: boolean;
}

/** 淘汰赛前瞻 */
interface KnockoutIntro {
  round: string | null;
  roundName: string;
  opponent: KnockoutOpponent | null;
}

/** 旧字段：Player 上曾挂过 characterName（现在角色名在 CHARACTERS 表） */
interface LegacyNamedPlayer extends Player {
  characterName?: string;
}

// ── 外部存档收窄工具（JSON ⇒ unknown）──────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

/**
 * 世界杯控制器 — 管理锦标赛+比赛+游戏三层状态
 */
export function useWorldCupController() {
  // ---- 三层状态 ----
  const wcState = reactive<WorldCupRuntimeState>(createWorldCupState(""));
  const matchState = ref<WorldCupMatchState | null>(null);
  const gameState = reactive<GameState>(createGameState());
  let gameCtx: Ctx | null = null;
  // 本控制器创建的比赛模式（gameState.mode 的接口形状不含比赛操作，见 modes/match.ts）
  let matchMode: MatchMode | null = null;

  // ---- UI 模式 ----
  const uiMode = ref("setup");
  const goalFlash = ref(false);
  const matchResult = ref<WorldCupMatchResultView | null>(null);
  const knockoutIntro = ref<KnockoutIntro | null>(null);
  const opponentSubPending = ref(false);

  let useWeather = false;
  let aiDifficulty = "easy";
  let playerArtifactId: number | null = null; // 玩家圣遗物ID
  let opponentArtifactId: number | null = null; // 对手圣遗物ID（手动模式）

  // ---- 初始化 ----
  function initWorldCup(
    teamName: string,
    startingCharId: number,
    opponentNames: string[],
    weather: boolean,
    difficulty = "easy",
    artifactId: number | null = null,
    oppArtifactId: number | null = null,
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
  function startNextGroupMatch(startingCharId?: number) {
    const matchIdx = getNextPlayerGroupMatch(wcState);
    if (matchIdx < 0) {
      finishGroupStage();
      return;
    }

    const match = wcState.groupMatches[matchIdx];
    const opponentCharId = wcState._groupOpponentChars?.[matchIdx] ?? 0;
    const playerCharId = startingCharId || wcState._lastPlayerChar || 0;

    const mode = buildMatchMode({
      isGroupStage: true,
      playerCharId,
      opponentCharId,
    });
    startMatchState(mode, 1);
    uiMode.value = "match";
  }

  /** 建立「模式 + 局面」,并把 matchState 指向模式里的比赛对象 */
  function startMatchState(mode: MatchMode, startingRound = 1) {
    matchState.value = mode.match as WorldCupMatchState;
    wcState.currentMatch = mode.match;

    const { ctx } = createSession({
      state: gameState,
      chars: [mode.match.playerCharId, mode.match.opponentCharId],
      weather: useWeather,
      startRound: startingRound,
      mode,
    });
    gameCtx = ctx;
    matchMode = mode;

    labelPlayers(mode.match);
    applyPlayerArtifact();
    markAIPlayer();
    wcState._lastPlayerChar = mode.match.playerCharId;
    return mode;
  }

  function labelPlayers(ms: MatchState) {
    const playerName = wcState.playerTeamName || "玩家";
    const opponentName = getCurrentOpponentName();
    gameState.players.forEach((p) => {
      p.name = p.characterId === ms.opponentCharId ? opponentName : playerName;
    });
  }

  function buildMatchMode({
    isGroupStage,
    playerCharId,
    opponentCharId,
  }: {
    isGroupStage: boolean;
    playerCharId: number;
    opponentCharId: number;
  }) {
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

  function getCurrentOpponentName(): string {
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
  function handleMatchEnd(ms: WorldCupMatchState) {
    recordSound(gameState, "match_end");
    const winner = ms.winner;
    const [pScore, oScore] = ms.score;
    const decidedByPenalty = ms.isPenaltyShootout || false;

    if (ms.isGroupStage) {
      const matchIdx = getCurrentGroupMatchIdx();
      const opponentName = getCurrentOpponentName();
      const stageLabel = `小组赛第${(matchIdx >= 0 ? matchIdx : 0) + 1}场${
        decidedByPenalty ? "（点球）" : ""
      }`;
      if (matchIdx >= 0) {
        const result = winner === 0 ? "home" : winner === 1 ? "away" : "draw";
        recordGroupMatchResult(wcState, matchIdx, result);
      }
      recordHistory({
        stage: stageLabel,
        opponent: opponentName,
        score: [pScore, oScore],
        winner,
        isGroup: true,
        decidedByPenalty,
      });

      const nextMatch = getNextPlayerGroupMatch(wcState);
      if (nextMatch >= 0) {
        matchResult.value = {
          winner,
          score: [pScore, oScore],
          stage: stageLabel,
          hasNext: true,
          isGroupStage: true,
          decidedByPenalty,
        };
        uiMode.value = "matchResult";
      } else {
        finishGroupStage();
      }
    } else {
      const roundName = getKnockoutRoundName(wcState.knockoutRound ?? "");
      const opponentName = wcState.knockoutOpponent?.name || "对手";
      const opponentEmoji = wcState.knockoutOpponent?.emoji || "🏳️";
      recordHistory({
        stage: roundName,
        opponent: opponentName,
        opponentEmoji,
        score: [pScore, oScore],
        winner,
        isGroup: false,
        decidedByPenalty,
      });

      if (winner === 0) {
        matchResult.value = {
          winner: 0,
          score: [pScore, oScore],
          stage: roundName,
          hasNext: wcState.knockoutRound !== "Final",
          isChampion: wcState.knockoutRound === "Final",
          decidedByPenalty,
        };
        if (wcState.knockoutRound === "Final") {
          wcState.phase = "champion";
        }
        uiMode.value = "matchResult";
      } else {
        // v3.5：淘汰即出总结，不再回到可继续下一轮的结果页
        eliminatePlayer(wcState);
        matchResult.value = null;
        uiMode.value = "tournamentSummary";
      }
    }
  }

  /** 记录一届世界杯的单场战绩（小组赛 + 淘汰赛） */
  function recordHistory(entry: MatchHistoryEntry) {
    if (!Array.isArray(wcState.matchHistory)) wcState.matchHistory = [];
    wcState.matchHistory.push(entry);
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
      roundName: getKnockoutRoundName(wcState.knockoutRound ?? ""),
      opponent,
    };
    uiMode.value = "knockoutIntro";
  }

  // ---- 开始淘汰赛比赛 ----
  function startKnockoutMatch() {
    const playerCharId = wcState._lastPlayerChar ?? 0;
    // advanceKnockoutRound 之后 knockoutOpponent 必然存在
    const opponent = wcState.knockoutOpponent!;
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
  function rebuildMatchContext(ms: WorldCupMatchRuntime | null | undefined) {
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
  function restoreWorldCup(saveData: unknown): boolean {
    if (!isRecord(saveData)) return false;
    const wcStateRaw = saveData.wcState;
    const saved = saveData.matchState;
    if (!isRecord(wcStateRaw) || !isRecord(saved)) return false;

    const wcSetup = isRecord(saveData.wcSetup) ? saveData.wcSetup : {};
    setArtifacts(
      numOrNull(wcSetup.artifactId),
      numOrNull(wcSetup.opponentArtifactId),
    );
    Object.assign(wcState, wcStateRaw);

    const mode = buildMatchMode({
      isGroupStage: saved.isGroupStage === true,
      playerCharId: num(saved.playerCharId, 0),
      opponentCharId: num(saved.opponentCharId, 0),
    });
    Object.assign(mode.match, saved);
    matchState.value = mode.match as WorldCupMatchState;
    matchMode = mode;
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
    const killedUid = matchState.value?._killedUid;
    if (!killedUid) return;
    const ms = matchState.value;
    if (!ms) return;
    ms._killedUid = null;
    ms._killedCharId = null;
    const p = gameState.players.find((pl) => pl.uid === killedUid);
    if (p) {
      gameState.currentPlayerIndex = p.index;
    }
  }

  // ---- 换人 ----
  function handleSubstitution(newCharId: number) {
    if (!matchState.value || !gameCtx || !matchMode) return;
    matchMode.executeSubstitution(gameCtx, newCharId);
    startNextLife();
    uiMode.value = "match";
  }

  function handleSkipSubstitution() {
    if (!matchState.value || !gameCtx || !matchMode) return;
    matchMode.skipSubstitution(gameCtx);
    applyPlayerArtifact();
    fixTurnAfterReset();
    markAIPlayer();
    uiMode.value = "match";
  }

  /** 在游戏初始化/重置后给双方应用圣遗物ID(按 uid 区分双方,KB-7) */
  function applyPlayerArtifact() {
    if (!matchState.value) return;
    const ms = matchState.value;
    gameState.players.forEach((p) => {
      const artId =
        p.uid === ms.playerUid
          ? playerArtifactId
          : p.uid === ms.opponentUid
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
    const opponentUid = matchState.value.opponentUid;
    gameState.players.forEach((p) => {
      if (p.uid === opponentUid) {
        p.ai.enabled = true;
        p.ai.difficulty = aiDifficulty;
      }
    });
  }

  // ---- 手动模式双步换人 ----

  /** 玩家换人（第一步：执行换人但不重置游戏，等待对手也换人） */
  function handlePlayerSubstitution(newCharId: number) {
    if (!matchState.value || !gameCtx || !matchMode) return;
    matchMode.executeSubstitution(gameCtx, newCharId);
    opponentSubPending.value = true;
    // uiMode 保持 "substitution"，等待对手换人
  }

  /** 对手换人（第二步：更新对手角色并统一重置游戏） */
  function handleOpponentSubstitution(newCharId: number) {
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
      // 角色表里每个可选角色都声明了 maxUses；缺失时迁移前同样会写入 undefined
      opponent.resources.skillUses = charData.maxUses as number;

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

    if (result.isGroupStage) {
      if (result.hasNext) {
        startNextGroupMatch();
      } else {
        finishGroupStage();
      }
      return;
    }

    if (result.winner === 0 && result.hasNext) {
      advanceKnockoutRound(wcState);
      wcState.substitutionsLeft = MATCH_CONFIG.maxSubstitutions;
      startKnockoutMatch();
      return;
    }

    if (result.isChampion) {
      wcState.phase = "champion";
      uiMode.value = "tournamentSummary";
      return;
    }

    if (result.eliminated) {
      uiMode.value = "tournamentSummary";
      return;
    }

    uiMode.value = "tournamentSummary";
  }

  function continueFromStandings() {
    if (wcState._advanced) {
      enterKnockoutStage();
    } else {
      // 小组赛未出线：直接给整届总结
      uiMode.value = "tournamentSummary";
    }
  }

  // ---- 点球大战 ----
  function doPenaltyRound(): PenaltyRoundResult | null {
    if (!matchState.value || !gameCtx || !matchMode) return null;
    // 新内核不再需要「临时把 matchOver 改回 false」的 hack(KB-12)
    const result = matchMode.executePenaltyRound(gameCtx);
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
    const ms = matchState.value;
    const p = gameState.players.find(
      (pl) => ms && pl.characterId === ms.playerCharId,
    );
    return p?.name || wcState.playerTeamName || "玩家";
  });
  const currentOpponentName = computed(() => {
    const ms = matchState.value;
    const p = gameState.players.find(
      (pl) => ms && pl.characterId === ms.opponentCharId,
    );
    return p?.name || "对手";
  });
  const currentCharName = computed(() => {
    const ms = matchState.value;
    const p = gameState.players.find(
      (pl) => ms && pl.characterId === ms.playerCharId,
    );
    return legacyCharacterName(p) || "";
  });

  /** 读档时恢复圣遗物配置 */
  function setArtifacts(playerArt: number | null, oppArt: number | null) {
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

/**
 * 旧字段 characterName 的读取口。
 * 内核 v3.5 起角色名在 CHARACTERS 表里，Player 上没有该字段；
 * 保留旧读取路径，避免改变 UI 文案的来源。
 */
function legacyCharacterName(p: Player | undefined): string {
  if (!p) return "";
  const legacy: LegacyNamedPlayer = p;
  return legacy.characterName ?? "";
}
