import { reactive, ref, computed } from "vue";
import { createSession, save, load, getCtx } from "../game/api.js";
import { createGameState } from "../game/flow/setup.js";
import { createBrawlMode, initBrawlOrder } from "../game/modes/brawl.js";
import { createTowers } from "../game/core/units.js";
import {
  CHARACTERS,
  selectableIds,
  getCharacter,
} from "../game/characters/index.js";
import { recordSound } from "../game/soundEvents.js";

export const BRAWL_CONFIG = {
  maxRounds: 60,
  respawnRounds: 5,
  deckCount: 3,
  teamSize: 3,
  towerCount: 5,
};

/** Ban/Pick 顺序：A ban1 → B ban2 → A ban1；A pick1 → B pick2 → A pick2 → B pick1 */
export const DRAFT_SEQUENCE = [
  { side: 0, type: "ban" },
  { side: 1, type: "ban" },
  { side: 1, type: "ban" },
  { side: 0, type: "ban" },
  { side: 0, type: "pick" },
  { side: 1, type: "pick" },
  { side: 1, type: "pick" },
  { side: 0, type: "pick" },
  { side: 0, type: "pick" },
  { side: 1, type: "pick" },
];

function defaultSetup() {
  return {
    opponentMode: "ai", // 'ai' | 'hotseat'
    weather: true,
    playerName: "蓝方",
    opponentName: "红方",
    artifacts: {
      player: [null, null, null],
      opponent: [null, null, null],
    },
  };
}

function defaultDraft() {
  return {
    stepIndex: 0,
    bans: [],
    picks: { 0: [], 1: [] },
  };
}

export function useBrawlController() {
  const gameState = reactive(createGameState());
  const uiMode = ref("setup"); // setup | draft | match | result
  const setup = reactive(defaultSetup());
  const draft = reactive(defaultDraft());
  const aiDifficulty = ref("easy"); // v3.5 团战只保留简单随机 AI

  let gameCtx = null;

  const allCharIds = computed(() => selectableIds());
  const bannedIds = computed(() => [...draft.bans]);
  const pickedIds = computed(() => [...draft.picks[0], ...draft.picks[1]]);
  const availableIds = computed(() =>
    allCharIds.value.filter(
      (id) => !bannedIds.value.includes(id) && !pickedIds.value.includes(id),
    ),
  );
  const currentDraftStep = computed(
    () => DRAFT_SEQUENCE[draft.stepIndex] ?? null,
  );
  const draftFinished = computed(() => draft.stepIndex >= DRAFT_SEQUENCE.length);
  const playerTeamName = computed(() =>
    setup.opponentMode === "hotseat" ? "蓝方" : setup.playerName || "蓝方",
  );
  const opponentTeamName = computed(() =>
    setup.opponentMode === "hotseat" ? "红方" : setup.opponentName || "红方",
  );
  const result = computed(() => gameState.mode?.info?.result ?? null);

  /** 当前 Ban/Pick 是否轮到 AI（AI 模式下只替对手操作） */
  const isAiDraftTurn = computed(
    () =>
      setup.opponentMode === "ai" && currentDraftStep.value?.side === 1,
  );

  function initSetup(patch = {}) {
    Object.assign(setup, defaultSetup(), patch);
    Object.assign(draft, defaultDraft());
    uiMode.value = "setup";
  }

  function startDraft() {
    Object.assign(draft, defaultDraft());
    uiMode.value = "draft";
  }

  /** 执行一次 ban/pick；返回是否成功 */
  function draftAction(charId) {
    const step = currentDraftStep.value;
    if (!step) return false;
    if (!availableIds.value.includes(charId)) return false;

    if (step.type === "ban") {
      draft.bans.push(charId);
    } else {
      draft.picks[step.side].push(charId);
    }
    draft.stepIndex++;

    if (draftFinished.value) {
      uiMode.value = "draft"; // 由 UI 显示「开始比赛」
    }
    return true;
  }

  /** AI 自动 ban/pick（简单随机） */
  function aiDraftAction() {
    const step = currentDraftStep.value;
    if (!step || step.side !== 1) return false;
    const pool = availableIds.value;
    if (pool.length === 0) return false;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return draftAction(pick);
  }

  /** 选人结束 → 建立团战局面 */
  function startMatch() {
    if (!draftFinished.value) return false;
    const playerPicks = draft.picks[0].slice(0, BRAWL_CONFIG.teamSize);
    const opponentPicks = draft.picks[1].slice(0, BRAWL_CONFIG.teamSize);
    if (
      playerPicks.length !== BRAWL_CONFIG.teamSize ||
      opponentPicks.length !== BRAWL_CONFIG.teamSize
    ) {
      return false;
    }

    const mode = createBrawlMode({
      maxRounds: BRAWL_CONFIG.maxRounds,
      respawnRounds: BRAWL_CONFIG.respawnRounds,
      playerTeamId: 0,
    });

    createSession({
      state: gameState,
      chars: [...playerPicks, ...opponentPicks],
      weather: !!setup.weather,
      startRound: 1,
      deckCount: BRAWL_CONFIG.deckCount,
      teamIds: [0, 0, 0, 1, 1, 1],
      mode,
    });
    gameCtx = getCtx(gameState);

    createTowers(gameState, [0, 1]);
    gameState.towers.forEach((t) => {
      t.name = `${t.teamId === 0 ? "蓝方" : "红方"}${t.towerIndex}号塔`;
    });

    const nameOf = (side, charId) => {
      const team = side === 0 ? playerTeamName.value : opponentTeamName.value;
      return `${team}·${CHARACTERS[charId]?.name ?? "?"}`;
    };
    const artifactOf = (side, slot) =>
      side === 0
        ? setup.artifacts.player[slot] ?? null
        : setup.artifacts.opponent[slot] ?? null;

    gameState.players.forEach((p) => {
      const side = p.teamId === 0 ? 0 : 1;
      const picks = side === 0 ? playerPicks : opponentPicks;
      const slot = picks.indexOf(p.characterId);
      p.name = nameOf(side, p.characterId);
      const artId = artifactOf(side, Math.max(0, slot));
      p.artifact.id = artId;
      p.artifact.active = false;
      p.artifact.roundsLeft = 0;
      p.resources.breakCount = 0;
      p.resources.holyWordUses = 2;
      if (setup.opponentMode === "ai" && side === 1) {
        p.ai.enabled = true;
        p.ai.difficulty = aiDifficulty.value;
      }
    });

    initBrawlOrder(gameCtx);
    uiMode.value = "match";
    return true;
  }

  /** 从游戏结束状态回到结果页 */
  function checkResult() {
    if (gameState.gameOver) {
      recordSound(gameState, "match_end");
      uiMode.value = "result";
      return true;
    }
    return false;
  }

  // ---- 存档 / 读档 ----
  function saveBrawl() {
    return {
      gameMode: "brawl",
      brawlSetup: {
        ...setup,
        artifacts: {
          player: [...setup.artifacts.player],
          opponent: [...setup.artifacts.opponent],
        },
      },
      brawlDraft: {
        stepIndex: draft.stepIndex,
        bans: [...draft.bans],
        picks: { 0: [...draft.picks[0]], 1: [...draft.picks[1]] },
      },
      uiMode: uiMode.value,
      gameState:
        gameState.players.length > 0 && uiMode.value === "match"
          ? save(gameState)
          : null,
    };
  }

  function restoreBrawl(saveData) {
    if (!saveData) return false;
    if (saveData.brawlSetup) {
      Object.assign(setup, defaultSetup(), saveData.brawlSetup);
    }
    if (saveData.brawlDraft) {
      draft.stepIndex = saveData.brawlDraft.stepIndex ?? 0;
      draft.bans = [...(saveData.brawlDraft.bans || [])];
      draft.picks = {
        0: [...(saveData.brawlDraft.picks?.[0] || [])],
        1: [...(saveData.brawlDraft.picks?.[1] || [])],
      };
    }

    if (saveData.gameState) {
      const mode = createBrawlMode({
        maxRounds: BRAWL_CONFIG.maxRounds,
        respawnRounds: BRAWL_CONFIG.respawnRounds,
        playerTeamId: 0,
      });
      const ok = load(gameState, saveData.gameState, {
        modeFactory: () => mode,
      });
      if (!ok) return false;
      gameCtx = getCtx(gameState);
      // 读档后补回 AI 标记（旧档可能缺）
      if (setup.opponentMode === "ai") {
        gameState.players.forEach((p) => {
          if (p.teamId === 1) {
            p.ai.enabled = true;
            p.ai.difficulty = "easy";
          }
        });
      }
      uiMode.value = gameState.gameOver ? "result" : "match";
      return true;
    }

    uiMode.value =
      saveData.uiMode === "draft" ? "draft" : "setup";
    return true;
  }

  function resetBrawl() {
    uiMode.value = "setup";
    Object.assign(setup, defaultSetup());
    Object.assign(draft, defaultDraft());
    gameState.players = [];
    gameState.towers = [];
    gameState.summons = [];
    gameState.gameOver = false;
    gameCtx = null;
  }

  return {
    gameState,
    uiMode,
    setup,
    draft,
    aiDifficulty,
    allCharIds,
    bannedIds,
    pickedIds,
    availableIds,
    currentDraftStep,
    draftFinished,
    isAiDraftTurn,
    playerTeamName,
    opponentTeamName,
    result,
    getCharacter,
    initSetup,
    startDraft,
    draftAction,
    aiDraftAction,
    startMatch,
    checkResult,
    saveBrawl,
    restoreBrawl,
    resetBrawl,
  };
}
