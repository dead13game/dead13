import { describe, it, expect, vi } from "vitest";

import { getCardBonus, calculateMatchScore } from "./league.js";
import { RANK_POINTS } from "./leagueConstants.js";
import { createSession, dispatch } from "./api.js";
import { createClassicMode } from "./modes/classic.js";
import { createLeagueMatchMode } from "./modes/league.js";
import type { LeagueCardBonusTable } from "./modes/league.js";
import { useLeagueController } from "../composables/useLeagueController.js";
import { getCtx } from "./view.js";
import type { Card, GameState, Rank } from "./types.js";

/** 控制器 matchState 的 value（当前比赛元信息） */
interface LeagueMatchState {
  deathOrder: { playerIndex: number; teamId: number }[];
  playerScore: number;
  opponentScore: number;
  winner: number | null;
}

type LeagueController = ReturnType<typeof useLeagueController>;

// ────────────────────────────────────────
//  纯数据层:卡牌加成 / 名次积分
// ────────────────────────────────────────

describe("league 卡牌加成", () => {
  it("等级差 2 级:攻击 +2 防御 +2", () => {
    // team 1 = tier1(一流), team 10 = tier3
    expect(getCardBonus(1, 10, false)).toEqual({
      attackBonus: 2,
      defenseBonus: 2,
    });
  });

  it("等级差 1 级:只加攻击 +1", () => {
    expect(getCardBonus(1, 5, false)).toEqual({
      attackBonus: 1,
      defenseBonus: 0,
    });
  });

  it("同级别无加成", () => {
    expect(getCardBonus(1, 2, false)).toEqual({
      attackBonus: 0,
      defenseBonus: 0,
    });
  });

  it("主场额外 +1 攻击", () => {
    expect(getCardBonus(1, 1, true)).toEqual({
      attackBonus: 1,
      defenseBonus: 0,
    });
  });
});

describe("league 名次积分", () => {
  it("六人全部阵亡:按 6/5/4/3/2/1 分累加", () => {
    const deathOrder = [
      { teamId: 0 }, // 第6名 1分
      { teamId: 0 }, // 第5名 2分
      { teamId: 0 }, // 第4名 3分
      { teamId: 1 }, // 第3名 4分
      { teamId: 1 }, // 第2名 5分
      { teamId: 1 }, // 第1名 6分
    ];
    const r = calculateMatchScore(deathOrder, 0, 1);
    expect(r.playerScore).toBe(RANK_POINTS[6] + RANK_POINTS[5] + RANK_POINTS[4]);
    expect(r.opponentScore).toBe(RANK_POINTS[3] + RANK_POINTS[2] + RANK_POINTS[1]);
    expect(r.winner).toBe(1);
  });

  it("对手团灭:剩余名次全归玩家,但可能仍按积分判负", () => {
    // 玩家先死 2 人(6/5 名 = 1+2),对手 3 人全灭(4/3/2 名 = 3+4+5),
    // 玩家剩 1 人拿第 1 名 6 分 → 9 : 12
    const deathOrder = [
      { teamId: 0 },
      { teamId: 0 },
      { teamId: 1 },
      { teamId: 1 },
      { teamId: 1 },
    ];
    const r = calculateMatchScore(deathOrder, 0, 1);
    expect(r.playerScore).toBe(9);
    expect(r.opponentScore).toBe(12);
    expect(r.winner).toBe(1);
  });

  it("双方均有人存活(到点):名次未定,winner 为 null", () => {
    const deathOrder = [{ teamId: 0 }];
    const r = calculateMatchScore(deathOrder, 0, 1);
    expect(r.winner).toBeNull();
  });
});

// ────────────────────────────────────────
//  新内核:联赛加成进入攻防管道
// ────────────────────────────────────────

/** 测试用卡牌（value 均为合法 Rank 点数） */
const CARD = (value: number, id?: string): Card => ({
  id: id ?? `F-${value}`,
  suit: "♠",
  rank: String(value) as Rank,
  value,
  faceUp: false,
});

function newLeagueSession({ cardBonus = null }: { cardBonus?: LeagueCardBonusTable | null } = {}) {
  const mode = createLeagueMatchMode({
    maxRounds: 30,
    cardBonus: cardBonus ?? {
      0: { attackBonus: 2, defenseBonus: 2 },
      1: { attackBonus: 0, defenseBonus: 0 },
    },
  });
  const { state, ctx } = createSession({
    chars: [1, 2, 3, 4, 5, 6],
    weather: false,
    startRound: 5,
    deckCount: 3,
    teamIds: [0, 0, 0, 1, 1, 1],
    mode,
  });
  return { state, ctx, mode };
}

function forceCard(state: GameState, value: number): void {
  state.deck.push(CARD(value, `F-${value}-${state.deck.length}`));
}

describe("league 加成与围攻(新内核)", () => {
  it("攻击加成按模式配置生效", () => {
    const { state } = newLeagueSession();
    const attacker = state.players.find((p) => p.teamId === 0)!;
    const target = state.players.find((p) => p.teamId === 1)!;
    state.currentPlayerIndex = attacker.index;
    state.phase = "normal";
    const hpBefore = target.hp;

    forceCard(state, 5);
    expect(dispatch(state, { type: "attack" })).toBe(true);
    dispatch(state, { type: "attackTarget", targetUid: target.uid });

    // 5 + 攻击加成 2 = 7
    expect(target.hp).toBe(hpBefore - 7);
  });

  it("防御加成按模式配置生效", () => {
    const { state } = newLeagueSession({
      cardBonus: {
        0: { attackBonus: 0, defenseBonus: 3 },
        1: { attackBonus: 0, defenseBonus: 0 },
      },
    });
    const defender = state.players.find((p) => p.teamId === 0)!;
    state.currentPlayerIndex = defender.index;

    forceCard(state, 6);
    expect(dispatch(state, { type: "defense" })).toBe(true);
    expect(defender.defensePile[0].defenseValue).toBe(9); // 6 + 3
  });

  it("同一回合第 2 次受击伤害减半,攻击计数累加", () => {
    const { state } = newLeagueSession();
    state.phase = "normal";
    const team0 = state.players.filter((p) => p.teamId === 0);
    const target = state.players.find((p) => p.teamId === 1)!;
    const hp0 = target.hp;

    // 第一次攻击:3 + 攻击加成 2 = 5
    state.currentPlayerIndex = team0[0].index;
    forceCard(state, 3);
    dispatch(state, { type: "attack" });
    dispatch(state, { type: "attackTarget", targetUid: target.uid });
    expect(target.hp).toBe(hp0 - 5);
    expect(target.relations.attackedThisRound).toBe(1);

    // 第二次攻击(同一回合,换一名队友):5 → 围攻减半 ceil(5/2)=3
    state.currentPlayerIndex = team0[1].index;
    forceCard(state, 3);
    dispatch(state, { type: "attack" });
    dispatch(state, { type: "attackTarget", targetUid: target.uid });

    expect(target.relations.attackedThisRound).toBe(2);
    expect(target.hp).toBe(hp0 - 5 - 3);
  });

  it("经典模式没有围攻判定", () => {
    const { state } = createSession({
      chars: [1, 2, 3, 4],
      weather: false,
      startRound: 5,
      mode: createClassicMode(),
    });
    state.phase = "normal";
    const target = state.players[1];
    const hp0 = target.hp;
    // 直接把目标挂到攻击方队友身上模拟连续攻击
    for (let i = 0; i < 2; i++) {
      const attacker = state.players[0];
      state.currentPlayerIndex = attacker.index;
      forceCard(state, 6);
      dispatch(state, { type: "attack" });
      dispatch(state, { type: "attackTarget", targetUid: target.uid });
      // 把目标救活继续测试
      target.alive = true;
      target.hp = hp0;
    }
    expect(target.relations.attackedThisRound).toBe(0);
  });
});

// ────────────────────────────────────────
//  控制器:比赛胜负只看积分
// ────────────────────────────────────────

describe("league 比赛胜负:只看积分(团灭对方不等于获胜)", () => {
  function startLeagueMatch(lc: LeagueController): LeagueMatchState {
    lc.initLeague(1, "easy", null, null, true);
    lc.startMatchWithDraft({
      playerChars: [1, 2, 3],
      opponentChars: [4, 5, 6],
    });
    // 迁移期收窄：控制器的 matchState 在 JS 侧是 ref(null)，类型未覆盖实际写入的比赛元信息
    return lc.matchState.value as unknown as LeagueMatchState;
  }

  it("团灭对方但积分更低 → 判负", () => {
    vi.useFakeTimers();
    try {
      const lc = useLeagueController();
      const ms = startLeagueMatch(lc);
      ms.deathOrder = [
        { playerIndex: 0, teamId: 0 },
        { playerIndex: 1, teamId: 0 },
        { playerIndex: 3, teamId: 1 },
        { playerIndex: 4, teamId: 1 },
        { playerIndex: 5, teamId: 1 },
      ];
      lc.gameState.players
        .filter((p) => p.teamId === 1)
        .forEach((p) => (p.alive = false));
      // 这些用例里模式适配器必然已挂上，故用非空断言（不改运行时行为）
      lc.gameState.mode!.checkGameOver!(getCtx(lc.gameState)!);
      expect(ms.playerScore).toBe(9);
      expect(ms.opponentScore).toBe(12);
      expect(ms.winner).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("团灭对方且积分更高 → 判胜", () => {
    vi.useFakeTimers();
    try {
      const lc = useLeagueController();
      const ms = startLeagueMatch(lc);
      ms.deathOrder = [
        { playerIndex: 3, teamId: 1 },
        { playerIndex: 4, teamId: 1 },
        { playerIndex: 0, teamId: 0 },
        { playerIndex: 1, teamId: 0 },
        { playerIndex: 2, teamId: 0 },
      ];
      lc.gameState.players
        .filter((p) => p.teamId === 0)
        .forEach((p) => (p.alive = false));
      // 这些用例里模式适配器必然已挂上，故用非空断言（不改运行时行为）
      lc.gameState.mode!.checkGameOver!(getCtx(lc.gameState)!);
      expect(ms.playerScore).toBe(12);
      expect(ms.opponentScore).toBe(9);
      expect(ms.winner).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("加赛:团灭时同样按积分判胜负", () => {
    vi.useFakeTimers();
    try {
      const lc = useLeagueController();
      lc.initLeague(5, "easy", null, null, true);
      lc.leagueState._tiebreakerOpponent = 1;
      lc.startTiebreaker();
      lc.startTiebreakerMatch({
        playerChars: [1, 2, 3],
        opponentChars: [4, 5, 6],
      });
      const ms = lc.matchState.value as unknown as LeagueMatchState;
      ms.deathOrder = [
        { playerIndex: 0, teamId: 0 },
        { playerIndex: 3, teamId: 1 },
        { playerIndex: 4, teamId: 1 },
        { playerIndex: 5, teamId: 1 },
      ];
      lc.gameState.players
        .filter((p) => p.teamId === 1)
        .forEach((p) => (p.alive = false));
      // 这些用例里模式适配器必然已挂上，故用非空断言（不改运行时行为）
      lc.gameState.mode!.checkGameOver!(getCtx(lc.gameState)!);
      expect(ms.playerScore).toBe(12);
      expect(ms.opponentScore).toBe(9);
      expect(ms.winner).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
