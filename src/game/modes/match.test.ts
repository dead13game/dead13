import { describe, it, expect } from "vitest";

import { createGameState, initGame } from "../flow/setup.js";
import { createContext } from "../flow/context.js";
import { attachTurnEngine } from "../flow/turn.js";
import { createSeededRng } from "../core/rng.js";
import { attack, attackTarget, defense } from "../flow/commands.js";
import { MATCH_CONFIG } from "./constants.js";
import { createMatchMode } from "./match.js";
import type { MatchMode, PenaltyRoundResult } from "./match.js";
import type { Ctx, GameState, Player } from "../types.js";

interface MakeMatchOptions {
  isGroupStage?: boolean;
  playerCharId?: number;
  opponentCharId?: number;
}

function makeMatch(opts: MakeMatchOptions = {}) {
  const state = createGameState();
  const mode = createMatchMode({
    isGroupStage: opts.isGroupStage ?? false,
    playerCharId: opts.playerCharId ?? 1,
    opponentCharId: opts.opponentCharId ?? 2,
    rng: createSeededRng(7),
  });
  initGame(state, {
    chars: [mode.match.playerCharId, mode.match.opponentCharId],
    weather: false,
    startRound: 1,
    mode,
    forcePeace: true,
  });
  state.players[0].name = "玩家";
  state.players[1].name = "对手";
  const ctx = createContext(state, { rng: createSeededRng(7), mode });
  attachTurnEngine(ctx);
  return { state, mode, ctx };
}

/** 按条件取一名玩家；取不到说明测试局面本身坏了（让测试立即失败） */
function requirePlayer(
  state: GameState,
  predicate: (p: Player) => boolean,
  label: string,
): Player {
  const p = state.players.find(predicate);
  if (!p) throw new Error(`测试局面缺少${label}`);
  return p;
}

/** 当前行动者 */
function currentPlayer(ctx: Ctx): Player {
  const p = ctx.players.current();
  if (!p) throw new Error("测试局面没有当前行动者");
  return p;
}

/** 击杀某一方并跑结束判定;round 会同步进 matchRound */
function eliminate(
  ctx: Ctx,
  mode: MatchMode,
  who: "player" | "opponent",
  round?: number,
) {
  const { state } = ctx;
  if (round) state.round = round;
  const charId =
    who === "player" ? mode.match.playerCharId : mode.match.opponentCharId;
  const victim = requirePlayer(
    state,
    (p) => p.characterId === charId,
    `角色 ${charId} 的玩家`,
  );
  victim.alive = false;
  victim.hp = 0;
  return mode.checkGameOver(ctx);
}

const killOpponent = (ctx: Ctx, mode: MatchMode, round?: number) =>
  eliminate(ctx, mode, "opponent", round);
const killPlayer = (ctx: Ctx, mode: MatchMode, round?: number) =>
  eliminate(ctx, mode, "player", round);

describe("modes/match — 进球与每命重置", () => {
  it("击杀对手记玩家进球,并进入换人待处理 + 暂停", () => {
    const { ctx, mode } = makeMatch();
    killOpponent(ctx, mode, 5);
    expect(mode.match.score).toEqual([1, 0]);
    expect(mode.match.substitutionPending).toBe(true);
    expect(ctx.state.turn.suspend).toBe(true);
    expect(ctx.state.gameOver).toBe(false);
  });

  it("玩家阵亡记对手进球", () => {
    const { ctx, mode } = makeMatch();
    killPlayer(ctx, mode, 5);
    expect(mode.match.score).toEqual([0, 1]);
  });

  it("下一命:回合 +1、玩家重建、名字保留、进入 resync", () => {
    const { ctx, mode, state } = makeMatch();
    killOpponent(ctx, mode, 5);
    expect(mode.match.matchRound).toBe(5);
    const logLen = state.messageLog.length;

    mode.startNextLife(ctx);

    expect(mode.match.matchRound).toBe(6);
    expect(mode.match.substitutionPending).toBe(false);
    expect(state.round).toBe(6);
    expect(state.players).toHaveLength(2);
    expect(state.players.every((p) => p.alive && p.hp === p.maxHp)).toBe(true);
    expect(state.players.map((p) => p.name).sort()).toEqual(["对手", "玩家"]);
    expect(state.turn.resync).toBe(true);
    expect(state.messageLog.length).toBeGreaterThanOrEqual(logLen);
    expect(state.messageLog).toContain("亡命十三街开始"); // 旧日志没被清掉
  });

  it("每条命都重新给 4 回合和平期", () => {
    const { ctx, mode, state } = makeMatch();
    killOpponent(ctx, mode, 40);
    mode.startNextLife(ctx);
    expect(state.phase).toBe("peace");
    expect(state.peaceRounds).toBe(4);
    expect(state.peaceStartRound).toBe(mode.match.matchRound - 1);
  });

  it("重置后 index 与 uid 仍然唯一有效", () => {
    const { ctx, mode, state } = makeMatch();
    killOpponent(ctx, mode, 3);
    mode.startNextLife(ctx);
    expect(state.players.map((p) => p.index)).toEqual([0, 1]);
    expect(new Set(state.players.map((p) => p.uid)).size).toBe(2);
  });
});

describe("modes/match — 加时与点球", () => {
  it("第 90 回合平分 → 加时,上限变 120", () => {
    const { ctx, mode } = makeMatch();
    mode.match.score = [1, 0];
    killPlayer(ctx, mode, MATCH_CONFIG.knockoutRounds); // 对手扳平 → 1:1
    expect(mode.match.score).toEqual([1, 1]);
    expect(mode.match.isExtraTime).toBe(true);
    expect(mode.match.maxRounds).toBe(MATCH_CONFIG.totalRounds);
    expect(ctx.state.gameOver).toBe(false);
  });

  it("第 90 回合比分不同 → 直接结束", () => {
    const { ctx, mode, state } = makeMatch();
    mode.match.score = [0, 0];
    killOpponent(ctx, mode, MATCH_CONFIG.knockoutRounds); // 玩家进球 → 1:0
    expect(mode.match.matchOver).toBe(true);
    expect(mode.match.winner).toBe(0);
    expect(state.gameOver).toBe(true);
  });

  it("小组赛第 90 回合平分 → 直接结束(平局)", () => {
    const { ctx, mode } = makeMatch({ isGroupStage: true });
    mode.match.score = [1, 0];
    killPlayer(ctx, mode, MATCH_CONFIG.knockoutRounds); // 1:1
    expect(mode.match.matchOver).toBe(true);
    expect(mode.match.winner).toBeNull();
    expect(mode.getGroupMatchResult()).toBe("draw");
  });

  it("加时第 120 回合仍平分 → 点球,专用牌堆 52 张", () => {
    const { ctx, mode } = makeMatch();
    mode.match.isExtraTime = true;
    mode.match.maxRounds = MATCH_CONFIG.totalRounds;
    mode.match.score = [1, 0];
    killPlayer(ctx, mode, MATCH_CONFIG.totalRounds); // 1:1
    expect(mode.match.isPenaltyShootout).toBe(true);
    expect(mode.match.matchOver).toBe(true);
    expect(mode.match.penaltyDeck).toHaveLength(52);
    expect(mode.match.penalty?.round).toBe(0);
  });

  it("点球先到 5 分者胜,牌堆可重构", () => {
    const { ctx, mode } = makeMatch();
    mode.match.isExtraTime = true;
    mode.match.score = [1, 0];
    killPlayer(ctx, mode, MATCH_CONFIG.totalRounds);

    let last: PenaltyRoundResult | null = null;
    for (let i = 0; i < 40 && mode.match.winner === null; i++) {
      last = mode.executePenaltyRound(ctx);
    }
    expect(mode.match.winner).not.toBeNull();
    expect([0, 1]).toContain(mode.match.winner);
    expect(last?.playerCards).toHaveLength(MATCH_CONFIG.penaltyCardsPerSide);
    const pen = mode.match.penalty;
    if (!pen) throw new Error("点球状态应已创建");
    const max = Math.max(pen.playerScore, pen.opponentScore);
    expect(max).toBeGreaterThanOrEqual(MATCH_CONFIG.penaltyFirstTo);
  });
});

describe("modes/match — 完整一命流程(集成)", () => {
  it("攻击致死 → 暂停被消费 → 换人待处理 → 重置后 resync 生效", () => {
    const { ctx, mode, state } = makeMatch();

    state.phase = "normal";
    state.round = 5;
    state.players.forEach((p) => {
      p.hp = 3;
      p.maxHp = 3;
    });

    const attacker = currentPlayer(ctx);
    const target = requirePlayer(
      state,
      (p) => p.uid !== attacker.uid,
      "对手玩家",
    );
    state.deck.push({
      id: "F-K",
      rank: "K",
      suit: "♠",
      value: 13,
      faceUp: false,
    });

    expect(attack(ctx)).toBe(true);
    expect(state.step).toBe("attackShowCard");
    attackTarget(ctx, target.uid);

    expect(target.alive).toBe(false);
    expect(mode.match.score).toEqual([1, 0]);
    expect(mode.match.substitutionPending).toBe(true);
    // 旧 _elimPaused:被同一动作的 endAction 消费掉(消费后回到 null)
    expect(state.turn.suspend).toBeNull();

    // 控制器在这时重置下一命
    mode.startNextLife(ctx);
    expect(state.round).toBe(6);
    expect(state.turn.resync).toBe(true);
    expect(state.phase).toBe("peace");

    // 重置后的第一条命令结束时应消费 resync,而不是走完整回合结算
    const before = currentPlayer(ctx).uid;
    expect(defense(ctx)).toBe(true);
    expect(state.turn.resync).toBe(false);
    expect(state.round).toBe(6); // 没有触发新回合
    expect(currentPlayer(ctx).uid).not.toBe(before);
  });
});

describe("modes/match — 换人", () => {
  it("待处理时才能换,且不能换成对手当前角色", () => {
    const { ctx, mode } = makeMatch();
    expect(mode.canSubstitute()).toBe(false);
    killOpponent(ctx, mode, 3);
    expect(mode.canSubstitute()).toBe(true);
    expect(mode.isSubstitutionValid(3)).toBe(true);
    expect(mode.isSubstitutionValid(mode.match.opponentCharId)).toBe(false);
  });

  it("换人后角色/血量/技能次数重置,剩余次数 -1", () => {
    const { ctx, mode, state } = makeMatch();
    killOpponent(ctx, mode, 3);
    const before = mode.match.substitutionsLeft;
    expect(mode.executeSubstitution(ctx, 9)).toBe(true);
    const p = requirePlayer(state, (x) => x.characterId === 9, "角色 9 的玩家");
    expect(p).toBeTruthy();
    expect(p.hp).toBe(p.maxHp);
    expect(mode.match.substitutionsLeft).toBe(before - 1);
    expect(mode.match.playerCharId).toBe(9);
    expect(state.messageLog.at(-1)).toContain("🔄 换人");
  });

  it("换人清空角色私有状态(KB-11)", () => {
    const { ctx, mode, state } = makeMatch({
      playerCharId: 7, // 哥伦比娅有 moonPhase
      opponentCharId: 2,
    });
    const me = requirePlayer(
      state,
      (p) => p.uid === mode.match.playerUid,
      "玩家控制的角色",
    );
    me.char.moonPhase = 2;
    killOpponent(ctx, mode, 3);

    expect(mode.executeSubstitution(ctx, 6)).toBe(true); // 换成玛薇卡
    expect(me.characterId).toBe(6);
    expect(me.char.moonPhase).toBeUndefined();
    expect(me.char.fightingSpirit).toBe(0);
  });
});

describe("modes/match — 进球归属(KB-7)", () => {
  it("双方同角色时按 uid 判定,不会把对手进球算成玩家的", () => {
    const { ctx, mode, state } = makeMatch({
      playerCharId: 1,
      opponentCharId: 1,
    });
    // 玩家(uid=1)阵亡,对手(uid=2)存活
    const me = requirePlayer(
      state,
      (p) => p.uid === mode.match.playerUid,
      "玩家控制的角色",
    );
    me.alive = false;
    mode.checkGameOver(ctx);
    expect(mode.match.score).toEqual([0, 1]);
  });

  it("玩家击杀对手记玩家进球", () => {
    const { ctx, mode, state } = makeMatch({
      playerCharId: 1,
      opponentCharId: 1,
    });
    const opponent = requirePlayer(
      state,
      (p) => p.uid === mode.match.opponentUid,
      "对手控制的角色",
    );
    opponent.alive = false;
    mode.checkGameOver(ctx);
    expect(mode.match.score).toEqual([1, 0]);
  });
});
