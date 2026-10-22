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
import type {
  BrawlModeRuntime,
  BrawlResult,
} from "../game/modes/brawl.js";
import type { Ctx, GameState } from "../game/types.js";

export const BRAWL_CONFIG = {
  maxRounds: 60,
  respawnRounds: 5,
  deckCount: 3,
  teamSize: 3,
  towerCount: 5,
};

/** Ban/Pick 的一组操作 */
export interface DraftStep {
  side: 0 | 1;
  type: "ban" | "pick";
}

/** Ban/Pick 顺序：A ban1 → B ban2 → A ban1；A pick1 → B pick2 → A pick2 → B pick1 */
export const DRAFT_SEQUENCE: DraftStep[] = [
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

/** 团战开局设置（UI 双向绑定） */
export interface BrawlSetup {
  opponentMode: "ai" | "hotseat";
  weather: boolean;
  playerName: string;
  opponentName: string;
  artifacts: {
    player: (number | null)[];
    opponent: (number | null)[];
  };
}

/** Ban/Pick 进度 */
export interface BrawlDraft {
  stepIndex: number;
  bans: number[];
  picks: { 0: number[]; 1: number[] };
}

function defaultSetup(): BrawlSetup {
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

function defaultDraft(): BrawlDraft {
  return {
    stepIndex: 0,
    bans: [],
    picks: { 0: [], 1: [] },
  };
}

/** 外部存档是 JSON：先收窄成普通对象再用 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** 从存档里取数字数组（含非数字时按迁移前的 `bans || []` 兜底） */
function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
}

/** 从存档里取数字（对应迁移前的 `?? 0`） */
function num(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

export function useBrawlController() {
  const gameState = reactive<GameState>(createGameState());
  const uiMode = ref("setup"); // setup | draft | match | result
  const setup = reactive<BrawlSetup>(defaultSetup());
  const draft = reactive<BrawlDraft>(defaultDraft());
  const aiDifficulty = ref("easy"); // v3.5 团战只保留简单随机 AI

  let gameCtx: Ctx | null = null;
  // 团战 adapter 的 info 运行时是数据对象（见 modes/brawl.ts 的 BrawlModeRuntime）
  let brawlRuntime: BrawlModeRuntime | null = null;

  const allCharIds = computed(() => selectableIds());
  const bannedIds = computed(() => [...draft.bans]);
  const pickedIds = computed(() => [...draft.picks[0], ...draft.picks[1]]);
  const availableIds = computed(() =>
    allCharIds.value.filter(
      (id) => !bannedIds.value.includes(id) && !pickedIds.value.includes(id),
    ),
  );
  const currentDraftStep = computed<DraftStep | null>(
    () => DRAFT_SEQUENCE[draft.stepIndex] ?? null,
  );
  const draftFinished = computed(() => draft.stepIndex >= DRAFT_SEQUENCE.length);
  const playerTeamName = computed(() =>
    setup.opponentMode === "hotseat" ? "蓝方" : setup.playerName || "蓝方",
  );
  const opponentTeamName = computed(() =>
    setup.opponentMode === "hotseat" ? "红方" : setup.opponentName || "红方",
  );
  const result = computed<BrawlResult | null>(
    () => brawlRuntime?.info.result ?? null,
  );

  /** 当前 Ban/Pick 是否轮到 AI（AI 模式下只替对手操作） */
  const isAiDraftTurn = computed(
    () => setup.opponentMode === "ai" && currentDraftStep.value?.side === 1,
  );

  function initSetup(patch: Partial<BrawlSetup> = {}) {
    Object.assign(setup, defaultSetup(), patch);
    Object.assign(draft, defaultDraft());
    uiMode.value = "setup";
  }

  function startDraft() {
    Object.assign(draft, defaultDraft());
    uiMode.value = "draft";
  }

  /** 执行一次 ban/pick；返回是否成功 */
  function draftAction(charId: number): boolean {
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
  function aiDraftAction(): boolean {
    const step = currentDraftStep.value;
    if (!step || step.side !== 1) return false;
    const pool = availableIds.value;
    if (pool.length === 0) return false;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return draftAction(pick);
  }

  /** 选人结束 → 建立团战局面 */
  function startMatch(): boolean {
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

    const { ctx } = createSession({
      state: gameState,
      chars: [...playerPicks, ...opponentPicks],
      weather: !!setup.weather,
      startRound: 1,
      deckCount: BRAWL_CONFIG.deckCount,
      teamIds: [0, 0, 0, 1, 1, 1],
      mode,
    });
    gameCtx = ctx;
    brawlRuntime = mode as BrawlModeRuntime;

    createTowers(gameState, [0, 1]);
    gameState.towers.forEach((t) => {
      t.name = `${t.teamId === 0 ? "蓝方" : "红方"}${t.towerIndex}号塔`;
    });

    const nameOf = (side: number, charId: number) => {
      const team = side === 0 ? playerTeamName.value : opponentTeamName.value;
      return `${team}·${CHARACTERS[charId]?.name ?? "?"}`;
    };
    const artifactOf = (side: number, slot: number): number | null =>
      side === 0
        ? (setup.artifacts.player[slot] ?? null)
        : (setup.artifacts.opponent[slot] ?? null);

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

    initBrawlOrder(ctx);
    uiMode.value = "match";
    return true;
  }

  /** 从游戏结束状态回到结果页 */
  function checkResult(): boolean {
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

  function restoreBrawl(saveData: unknown): boolean {
    if (!saveData) return false;
    const data = isRecord(saveData) ? saveData : {};

    const setupData = data.brawlSetup;
    if (isRecord(setupData)) {
      Object.assign(setup, defaultSetup(), setupData);
    }
    const draftData = data.brawlDraft;
    if (isRecord(draftData)) {
      draft.stepIndex = num(draftData.stepIndex, 0);
      draft.bans = nums(draftData.bans);
      const picks = isRecord(draftData.picks) ? draftData.picks : {};
      draft.picks = {
        0: nums(picks[0]),
        1: nums(picks[1]),
      };
    }

    if (data.gameState) {
      const mode = createBrawlMode({
        maxRounds: BRAWL_CONFIG.maxRounds,
        respawnRounds: BRAWL_CONFIG.respawnRounds,
        playerTeamId: 0,
      });
      const ok = load(gameState, data.gameState, {
        modeFactory: () => mode,
      });
      if (!ok) return false;
      gameCtx = getCtx(gameState);
      brawlRuntime = mode as BrawlModeRuntime;
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

    uiMode.value = data.uiMode === "draft" ? "draft" : "setup";
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
