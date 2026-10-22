// 1v1 比赛模式 — 在经典内核之上叠加:进球 / 每命重置 / 换人 / 加时 / 点球
//
// 与旧 matchState.js 的对应关系:
//   matchState 对象 → mode.match(挂在 mode 上,不进 gameState)
//   resetGameForNextLife → mode.startNextLife(ctx)
//   _elimPaused → state.turn.suspend
//   _gameJustReset → state.turn.resync
//
// 旧实现在 damage.js 里用 `_elimGuard` 防重入,这里用 match.elimGuard。

import { MATCH_CONFIG } from "./constants.js";
import { RANK_VALUES } from "../core/constants.js";
import { createFullDeck, draw, reshuffleFromGrave, shuffle } from "../core/cards.js";
import { CHARACTERS, characterStateFor } from "../characters/index.js";
import { initGame } from "../flow/setup.js";
import type {
  Card,
  Ctx,
  ModeAdapter,
  ModeRules,
  Rng,
} from "../types.js";

/** 点球大战的状态 */
export interface PenaltyState {
  playerScore: number;
  opponentScore: number;
  round: number;
  playerCards: Card[] | null;
  opponentCards: Card[] | null;
  lastResult: "player" | "opponent" | "draw" | null;
}

/**
 * 比赛状态（挂在 mode.match 上，不进 gameState）。
 *
 * `_killedCharId` / `_killedUid` 是旧实现的兼容字段：世界杯换人重置后
 * 要让被击杀方先手，控制器会读它们。
 */
export interface MatchState {
  isGroupStage: boolean;
  matchRound: number;
  maxRounds: number;
  score: [number, number];
  isExtraTime: boolean;
  isPenaltyShootout: boolean;
  matchOver: boolean;
  winner: number | null;
  substitutionPending: boolean;
  substitutionsLeft: number;
  playerCharId: number;
  opponentCharId: number;
  // 稳定身份:initGame 按传入顺序分配 uid(i+1),换人不会改变它(KB-7)
  playerUid: number;
  opponentUid: number;
  playerArtifactId: number | null;
  penalty: PenaltyState | null;
  penaltyDeck: Card[];
  penaltyGrave: Card[];
  elimGuard: boolean;
  _killedCharId?: number;
  _killedUid?: number;
}

/** 1v1 规则（场场都是 4 回合和平期，按阶段而非回合数放行攻击） */
export interface MatchRules extends ModeRules {
  peaceRounds: number;
  attackGate: "phase";
  attackMinRound: number;
  alliance: boolean;
  allyMinPlayers: number;
  besiege: boolean;
  blockAllyAttack: boolean;
  forcePeace: boolean;
}

/** 点球一轮的结果（控制器/UI 画比分区用） */
export interface PenaltyRoundResult {
  winner: number | null;
  playerSum: number;
  opponentSum: number;
  playerCards: Card[] | null;
  opponentCards: Card[] | null;
  pen: PenaltyState;
}

/** 比赛结束回调：运行时只接收 match（世界杯钩子按此签名包装） */
export type MatchEndHook = (match: MatchState) => void;

export interface MatchModeOptions {
  isGroupStage?: boolean;
  playerCharId: number;
  opponentCharId: number;
  playerArtifactId?: number | null;
  rng?: Rng;
  onMatchEnd?: MatchEndHook | null;
  onAfterCheck?: ((ctx: Ctx) => void) | null;
  /** 控制器需要 Vue 响应式（比分/回合驱动 UI），由调用方把 reactive 传进来包一层 */
  wrap?: ((base: MatchState) => MatchState) | null;
}

/**
 * 1v1 比赛模式适配器。
 *
 * 注意两个 ModeAdapter 声明与运行时不一致的成员：
 *   - `onMatchEnd`：接口是 (ctx, ...args)，实际是单参 (match)（见 worldcup.ts）；
 *   - `match`：接口是 unknown，实际是本文件的 MatchState。
 * 前者从接口里 Omit 掉（工厂内部用 MatchModeInternals 精确调用），
 * 后者收窄成 MatchState —— 两者都不会进入 UI 层，类型债记在 types.ts。
 */
export interface MatchMode extends Omit<ModeAdapter, "onMatchEnd" | "match"> {
  rules: MatchRules;
  match: MatchState;
  onNewRound(ctx: Ctx, round?: number): "halt" | undefined;
  checkGameOver(ctx: Ctx): number | null | undefined;
  canSubstitute(): boolean;
  isSubstitutionValid(newCharId: number): boolean;
  executeSubstitution(ctx: Ctx, newCharId: number): boolean;
  skipSubstitution(ctx: Ctx): void;
  startNextLife(ctx: Ctx): void;
  executePenaltyRound(ctx: Ctx): PenaltyRoundResult | null;
  isPenaltyOver(): boolean;
  serialize(): { match: MatchState };
  getGroupMatchResult(): "win" | "loss" | "draw" | null;
}

/** 工厂内部的完整形状：补上 ModeAdapter 没有声明（或声明不一致）的回调 */
interface MatchModeInternals {
  onMatchEnd: MatchEndHook | null;
  /** 运行时该属性从未被赋值（旧实现如此），保留读取以维持行为 */
  onAfterCheck?: (ctx: Ctx) => void;
}

export function createMatchMode({
  isGroupStage = false,
  playerCharId,
  opponentCharId,
  playerArtifactId = null,
  rng,
  onMatchEnd = null,
  onAfterCheck = null,
  wrap = null,
}: MatchModeOptions): MatchMode {
  const base: MatchState = {
    isGroupStage,
    matchRound: 1,
    maxRounds: MATCH_CONFIG.knockoutRounds,
    score: [0, 0],
    isExtraTime: false,
    isPenaltyShootout: false,
    matchOver: false,
    winner: null,
    substitutionPending: false,
    substitutionsLeft: MATCH_CONFIG.maxSubstitutions,
    playerCharId,
    opponentCharId,
    // 稳定身份:initGame 按传入顺序分配 uid(i+1),换人不会改变它(KB-7)
    playerUid: 1,
    opponentUid: 2,
    playerArtifactId,
    penalty: null,
    penaltyDeck: [],
    penaltyGrave: [],
    elimGuard: false,
  };
  // 控制器需要 Vue 响应式(比分/回合要驱动 UI),纯逻辑层不 import vue,
  // 所以由调用方把 reactive 传进来包一层。
  const match: MatchState = wrap ? wrap(base) : base;

  const mode: MatchMode & MatchModeInternals = {
    id: "match",
    match,
    onMatchEnd,
    rules: {
      peaceRounds: 4, // 每条命都重新给 4 回合和平(有意设计)
      attackGate: "phase", // 1v1 只看阶段,不看回合数
      attackMinRound: 0,
      alliance: false,
      allyMinPlayers: 99,
      besiege: false,
      blockAllyAttack: false,
      forcePeace: true,
    },

    /** 新回合:同步比赛回合;超过上限时结算 */
    onNewRound(ctx: Ctx, round?: number) {
      if (match.matchOver) return undefined;
      // 内核（flow/turn.ts）总是传 round；单参调用时落到当前回合计
      const roundNo = round ?? ctx.state.round;
      match.matchRound = roundNo;
      if (roundNo > match.maxRounds) {
        checkMatchEnd(ctx, match, onMatchEnd);
        mode.onAfterCheck?.(ctx);
        return "halt";
      }
      return undefined;
    },

    /**
     * 结束判定(替代旧 damage.js 的 matchContext 分支):
     * 存活 ≤ 1 时记一个进球,再决定 继续 / 加时 / 点球 / 结束。
     */
    checkGameOver(ctx: Ctx) {
      const { state } = ctx;
      if (match.matchOver) return undefined;
      const alive = ctx.players.alive();
      if (alive.length > 1) return undefined;
      if (match.elimGuard) return undefined;
      match.elimGuard = true;

      match.matchRound = state.round;
      const killer = alive[0];
      // 记录阵亡者(世界杯换人重置后要让被击杀方先手)
      const dead = state.players.find((p) => !p.alive);
      if (dead) {
        match._killedCharId = dead.characterId;
        match._killedUid = dead.uid;
      }

      // 用 uid 判进球:换人/双方同角色时 characterId 会歧义(KB-7)
      const isPlayerGoal = !!killer && killer.uid === match.playerUid;
      if (isPlayerGoal) match.score[0]++;
      else match.score[1]++;

      const result = checkMatchEnd(ctx, match, onMatchEnd);
      // 旧实现:回调后立刻暂停,防止幽灵回合
      state.turn.suspend = true;
      mode.onAfterCheck?.(ctx);
      return result;
    },

    // ── 换人 ──
    canSubstitute(): boolean {
      return (
        match.substitutionPending &&
        !match.matchOver &&
        match.substitutionsLeft > 0
      );
    },

    isSubstitutionValid(newCharId: number): boolean {
      return newCharId !== match.opponentCharId;
    },

    executeSubstitution(ctx: Ctx, newCharId: number): boolean {
      if (!mode.canSubstitute()) return false;
      const charData = CHARACTERS[newCharId];
      if (!charData) return false;

      match.playerCharId = newCharId;
      match.substitutionsLeft--;

      // 用 uid 找玩家:换人后 characterId 已不可靠(KB-7)
      const player = ctx.state.players.find(
        (p) => p.uid === match.playerUid,
      );
      if (player) {
        player.characterId = charData.id;
        player.hp = charData.hp;
        player.maxHp = charData.hp;
        // CharacterMeta.maxUses 契约上是可选，但 15 个角色插件全部声明了它；
        // 与团战复活保持一致，用 0 兜底（技能次数槽是非可选的 number）
        player.resources.skillUses = charData.maxUses ?? 0;
        // 角色私有状态必须清零,否则新角色会继承上一个角色的斗志/月相(KB-11)
        player.char = structuredClone(characterStateFor(charData.id));
      }

      ctx.state.messageLog.push(
        `🔄 换人：${charData.name} 上场！（剩余换人 ${match.substitutionsLeft} 次）`,
      );
      return true;
    },

    /** 跳过换人 = 直接进入下一命 */
    skipSubstitution(ctx: Ctx) {
      match.substitutionPending = false;
      startNextLifeImpl(ctx, match);
    },

    startNextLife(ctx: Ctx) {
      startNextLifeImpl(ctx, match);
    },

    // ── 点球 ──
    executePenaltyRound: (ctx: Ctx) =>
      executePenaltyRound(ctx, match, rng, onMatchEnd),

    isPenaltyOver(): boolean {
      return match.winner !== null;
    },

    /** 存档:比赛进度是纯数据,可整体序列化 */
    serialize(): { match: MatchState } {
      return { match: structuredClone(match) };
    },

    getGroupMatchResult(): "win" | "loss" | "draw" | null {
      if (!match.matchOver) return null;
      const [p, o] = match.score;
      return p > o ? "win" : p < o ? "loss" : "draw";
    },
  };

  return mode;
}

// ────────────────────────────────────────
//  读档恢复
// ────────────────────────────────────────

/** 从存档里的 mode.match 还原一个比赛模式 */
export function restoreMatchMode(
  modeData: { match?: MatchState } | null | undefined,
  opts: { rng?: Rng } = {},
): MatchMode {
  const saved = modeData?.match;
  if (!saved) throw new Error("restoreMatchMode: 缺少 match 数据");
  const mode = createMatchMode({
    isGroupStage: saved.isGroupStage,
    playerCharId: saved.playerCharId,
    opponentCharId: saved.opponentCharId,
    playerArtifactId: saved.playerArtifactId,
    rng: opts.rng,
  });
  Object.assign(mode.match, structuredClone(saved));
  return mode;
}

// ────────────────────────────────────────
//  内部:比赛结算
// ────────────────────────────────────────

/** 判定比赛是否结束,或进入加时/点球 */
function checkMatchEnd(
  ctx: Ctx,
  match: MatchState,
  onMatchEnd: MatchEndHook | null,
): number | null {
  const { state } = ctx;
  const [pScore, oScore] = match.score;
  const round = match.matchRound;

  // 常规时间结束
  if (round >= MATCH_CONFIG.knockoutRounds && !match.isExtraTime) {
    if (pScore !== oScore) return endMatch(ctx, match, onMatchEnd);
    if (match.isGroupStage) return endMatch(ctx, match, onMatchEnd);
    return startExtraTime(match);
  }

  // 加时结束
  if (round >= MATCH_CONFIG.totalRounds && match.isExtraTime) {
    if (pScore !== oScore) return endMatch(ctx, match, onMatchEnd);
    return startPenaltyShootout(ctx, match);
  }

  // 比赛继续:等 UI 处理换人后再重置
  match.substitutionPending = true;
  return null;
}

function endMatch(
  ctx: Ctx,
  match: MatchState,
  onMatchEnd: MatchEndHook | null,
): number | null {
  const { state } = ctx;
  match.matchOver = true;
  const [p, o] = match.score;
  match.winner = p > o ? 0 : o > p ? 1 : null;
  state.gameOver = true;
  state.winnerIndex = match.winner ?? -1;
  onMatchEnd?.(match);
  return match.winner;
}

function startExtraTime(match: MatchState): null {
  match.isExtraTime = true;
  match.maxRounds = MATCH_CONFIG.totalRounds;
  match.substitutionPending = true;
  return null;
}

function startPenaltyShootout(ctx: Ctx, match: MatchState): null {
  match.isPenaltyShootout = true;
  match.matchOver = true;
  match.penalty = {
    playerScore: 0,
    opponentScore: 0,
    round: 0,
    playerCards: null,
    opponentCards: null,
    lastResult: null,
  };
  match.penaltyDeck = shuffle(createFullDeck(1), ctx.rng);
  match.penaltyGrave = [];
  return null;
}

/**
 * 重置以开始下一命。
 * 保留:比分、回合数、名字、天气、日志、模式本身。
 */
function startNextLifeImpl(ctx: Ctx, match: MatchState) {
  const { state } = ctx;

  const playerName =
    state.players.find((p) => p.uid === match.playerUid)?.name ?? "玩家";
  const opponentName =
    state.players.find((p) => p.uid === match.opponentUid)?.name ?? "对手";

  match.matchRound++;
  match.substitutionPending = false;

  // reset1v1Game 会清空天气,先存后还原
  const savedUseWeather = state.useWeather;
  const savedWeatherDeck = state.weatherDeck;
  const savedCurrentWeather = state.currentWeather;
  const savedNextWeather = state.nextWeather;

  initGame(state, {
    chars: [match.playerCharId, match.opponentCharId],
    weather: false,
    startRound: match.matchRound,
    mode: ctx.mode,
    keepLog: true,
    forcePeace: true,
    peaceStartRound: match.matchRound - 1,
    rng: ctx.rng,
  });

  state.useWeather = savedUseWeather;
  state.weatherDeck = savedWeatherDeck;
  state.currentWeather = savedCurrentWeather;
  state.nextWeather = savedNextWeather;

  // 按 uid 恢复名字(双方同角色时 characterId 会歧义,KB-7)
  state.players.forEach((p) => {
    if (p.uid === match.playerUid) p.name = playerName;
    else if (p.uid === match.opponentUid) p.name = opponentName;
  });

  // 控制器在每条命开始时重刷圣遗物
  if (match.playerArtifactId) {
    const p = state.players.find((x) => x.uid === match.playerUid);
    if (p) p.artifact.id = match.playerArtifactId;
  }

  match.elimGuard = false;
  // 旧 _gameJustReset:下一条 endAction 不推进回合,只把指针移到下一位存活者
  state.turn.resync = true;

  if (
    match.isExtraTime &&
    match.matchRound === MATCH_CONFIG.knockoutRounds + 1
  ) {
    state.messageLog.push("⚽ 90分钟结束，进入加时赛！");
  }
  if (match.matchRound === 1) {
    state.messageLog.push(
      `⚽ 比赛开始！（${match.maxRounds === Infinity ? "小组赛" : match.maxRounds + "回合制"}）`,
    );
  }
}

/** 点球大战一轮:双方各抽 2 张比点数,先到 5 分者胜 */
function executePenaltyRound(
  ctx: Ctx,
  match: MatchState,
  rng: Rng | undefined,
  onMatchEnd: MatchEndHook | null,
): PenaltyRoundResult | null {
  // 旧实现这里是 `!matchState.matchOver`,但 startPenaltyShootout 又把它置 true,
  // 控制器只能每轮手动改回 false(useWorldCupController:517)。新内核直接不依赖它。
  if (!match.penalty) return null;

  const pen = match.penalty;
  const state = ctx.state;

  ensurePenaltyDeck(match, rng);

  const r1 = draw(match.penaltyDeck, MATCH_CONFIG.penaltyCardsPerSide);
  match.penaltyDeck = r1.remaining;
  const r2 = draw(match.penaltyDeck, MATCH_CONFIG.penaltyCardsPerSide);
  match.penaltyDeck = r2.remaining;

  match.penaltyGrave.push(...r1.drawn, ...r2.drawn);
  pen.playerCards = r1.drawn;
  pen.opponentCards = r2.drawn;

  // 合成牌可能没有 rank，按旧实现的 `|| 0` 语义跳过
  const playerSum = r1.drawn.reduce(
    (s, c) => s + (c.rank ? RANK_VALUES[c.rank] : 0),
    0,
  );
  const opponentSum = r2.drawn.reduce(
    (s, c) => s + (c.rank ? RANK_VALUES[c.rank] : 0),
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

  let winner: number | null = null;
  if (pen.playerScore >= MATCH_CONFIG.penaltyFirstTo) winner = 0;
  else if (pen.opponentScore >= MATCH_CONFIG.penaltyFirstTo) winner = 1;

  if (winner !== null) {
    match.winner = winner;
    state.winnerIndex = winner;
    onMatchEnd?.(match);
  }

  return {
    winner,
    playerSum,
    opponentSum,
    playerCards: pen.playerCards,
    opponentCards: pen.opponentCards,
    pen,
  };
}

/**
 * 点球牌堆重构。
 *
 * rng 来自工厂选项，控制器不传；但先到 5 分最多 9 轮 × 4 张 = 36 < 52，
 * 正常流程进不到重构分支（旧实现同样直接使用 rng），故这里沿用并标注不变量。
 */
function ensurePenaltyDeck(match: MatchState, rng: Rng | undefined): void {
  if (match.penaltyDeck.length < MATCH_CONFIG.penaltyCardsPerSide * 2) {
    match.penaltyDeck = reshuffleFromGrave(match.penaltyGrave, rng as Rng);
    match.penaltyGrave = [];
  }
}
