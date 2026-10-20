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
import { CHARACTERS } from "../characters/index.js";
import { initGame } from "../flow/setup.js";

export function createMatchMode({
  isGroupStage = false,
  playerCharId,
  opponentCharId,
  playerArtifactId = null,
  rng,
  onMatchEnd = null,
  onAfterCheck = null,
  wrap = null,
} = {}) {
  const base = {
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
    playerArtifactId,
    penalty: null,
    penaltyDeck: [],
    penaltyGrave: [],
    elimGuard: false,
  };
  // 控制器需要 Vue 响应式(比分/回合要驱动 UI),纯逻辑层不 import vue,
  // 所以由调用方把 reactive 传进来包一层。
  const match = wrap ? wrap(base) : base;

  const mode = {
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
    onNewRound(ctx, round) {
      if (match.matchOver) return undefined;
      match.matchRound = round;
      if (round > match.maxRounds) {
        checkMatchEnd(ctx);
        mode.onAfterCheck?.(ctx);
        return "halt";
      }
      return undefined;
    },

    /**
     * 结束判定(替代旧 damage.js 的 matchContext 分支):
     * 存活 ≤ 1 时记一个进球,再决定 继续 / 加时 / 点球 / 结束。
     */
    checkGameOver(ctx) {
      const { state } = ctx;
      if (match.matchOver) return undefined;
      const alive = ctx.players.alive();
      if (alive.length > 1) return undefined;
      if (match.elimGuard) return undefined;
      match.elimGuard = true;

      match.matchRound = state.round;
      const killer = alive[0];
      // 记录阵亡者角色(世界杯换人重置后要让被击杀方先手,需要这个信息)
      const dead = state.players.find((p) => !p.alive);
      if (dead) match._killedCharId = dead.characterId;

      // 旧实现用 characterId 判进球(索引会随 speed 重排,不可靠)
      const isPlayerGoal = !!killer && killer.characterId === match.playerCharId;
      if (isPlayerGoal) match.score[0]++;
      else match.score[1]++;

      const result = checkMatchEnd(ctx);
      // 旧实现:回调后立刻暂停,防止幽灵回合
      state.turn.suspend = true;
      mode.onAfterCheck?.(ctx);
      return result;
    },

    // ── 换人 ──
    canSubstitute() {
      return (
        match.substitutionPending &&
        !match.matchOver &&
        match.substitutionsLeft > 0
      );
    },

    isSubstitutionValid(newCharId) {
      return newCharId !== match.opponentCharId;
    },

    executeSubstitution(ctx, newCharId) {
      if (!mode.canSubstitute()) return false;
      const charData = CHARACTERS[newCharId];
      if (!charData) return false;

      const oldCharId = match.playerCharId;
      match.playerCharId = newCharId;
      match.substitutionsLeft--;

      const player = ctx.state.players.find((p) => p.characterId === oldCharId);
      if (player) {
        // 旧实现只重置这几项:角色私有状态(fightingSpirit 等)会残留 —— KB-11
        player.characterId = charData.id;
        player.hp = charData.hp;
        player.maxHp = charData.hp;
        player.resources.skillUses = charData.maxUses;
      }

      ctx.state.messageLog.push(
        `🔄 换人：${charData.name} 上场！（剩余换人 ${match.substitutionsLeft} 次）`,
      );
      return true;
    },

    /** 跳过换人 = 直接进入下一命 */
    skipSubstitution(ctx) {
      match.substitutionPending = false;
      startNextLife(ctx);
    },

    startNextLife,

    // ── 点球 ──
    executePenaltyRound: (ctx) => executePenaltyRound(ctx, match, rng),

    isPenaltyOver() {
      return match.winner !== null;
    },

    /** 存档:比赛进度是纯数据,可整体序列化 */
    serialize() {
      return { match: structuredClone(match) };
    },

    getGroupMatchResult() {
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
export function restoreMatchMode(modeData, opts = {}) {
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
function checkMatchEnd(ctx) {
  const match = ctx.mode.match;
  const { state } = ctx;
  const [pScore, oScore] = match.score;
  const round = match.matchRound;

  // 常规时间结束
  if (round >= MATCH_CONFIG.knockoutRounds && !match.isExtraTime) {
    if (pScore !== oScore) return endMatch(ctx);
    if (match.isGroupStage) return endMatch(ctx);
    return startExtraTime(ctx);
  }

  // 加时结束
  if (round >= MATCH_CONFIG.totalRounds && match.isExtraTime) {
    if (pScore !== oScore) return endMatch(ctx);
    return startPenaltyShootout(ctx);
  }

  // 比赛继续:等 UI 处理换人后再重置
  match.substitutionPending = true;
  return null;
}

function endMatch(ctx) {
  const match = ctx.mode.match;
  const { state } = ctx;
  match.matchOver = true;
  const [p, o] = match.score;
  match.winner = p > o ? 0 : o > p ? 1 : null;
  state.gameOver = true;
  state.winnerIndex = match.winner ?? -1;
  ctx.mode.onMatchEnd?.(match);
  return match.winner;
}

function startExtraTime(ctx) {
  const match = ctx.mode.match;
  match.isExtraTime = true;
  match.maxRounds = MATCH_CONFIG.totalRounds;
  match.substitutionPending = true;
  return null;
}

function startPenaltyShootout(ctx) {
  const match = ctx.mode.match;
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
function startNextLife(ctx) {
  const { state } = ctx;
  const match = ctx.mode.match;

  const playerName =
    state.players.find((p) => p.characterId === match.playerCharId)?.name ??
    "玩家";
  const opponentName =
    state.players.find((p) => p.characterId === match.opponentCharId)?.name ??
    "对手";

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

  // 按 characterId 恢复名字(speed 重排后索引不可靠)
  state.players.forEach((p) => {
    if (p.characterId === match.playerCharId) p.name = playerName;
    else if (p.characterId === match.opponentCharId) p.name = opponentName;
  });

  // 控制器在每条命开始时重刷圣遗物
  if (match.playerArtifactId) {
    const p = state.players.find((x) => x.characterId === match.playerCharId);
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
function executePenaltyRound(ctx, match, rng) {
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

  const playerSum = r1.drawn.reduce((s, c) => s + (RANK_VALUES[c.rank] || 0), 0);
  const opponentSum = r2.drawn.reduce((s, c) => s + (RANK_VALUES[c.rank] || 0), 0);
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

  let winner = null;
  if (pen.playerScore >= MATCH_CONFIG.penaltyFirstTo) winner = 0;
  else if (pen.opponentScore >= MATCH_CONFIG.penaltyFirstTo) winner = 1;

  if (winner !== null) {
    match.winner = winner;
    state.winnerIndex = winner;
    ctx.mode.onMatchEnd?.(match);
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

function ensurePenaltyDeck(match, rng) {
  if (match.penaltyDeck.length < MATCH_CONFIG.penaltyCardsPerSide * 2) {
    match.penaltyDeck = reshuffleFromGrave(match.penaltyGrave, rng);
    match.penaltyGrave = [];
  }
}
