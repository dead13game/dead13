import { describe, it, expect } from "vitest";

import { createSession, dispatch } from "../api.js";
import { createGameState } from "../flow/setup.js";
import { createBrawlMode, initBrawlOrder } from "./brawl.js";
import { createTowers, towersOf } from "../core/units.js";

function newBrawl(chars = [13, 14, 15, 16, 1, 2]) {
  const state = createGameState();
  const mode = createBrawlMode({
    maxRounds: 60,
    respawnRounds: 5,
    playerTeamId: 0,
  });
  const { ctx } = createSession({
    state,
    chars,
    weather: false,
    startRound: 1,
    teamIds: [0, 0, 0, 1, 1, 1],
    mode,
  });
  createTowers(state, [0, 1]);
  initBrawlOrder(ctx);
  return { state, ctx, mode };
}

describe("3v3 团战 — 基础局面", () => {
  it("6 英雄 + 每队 5 塔，开局进入 4 回合和平期", () => {
    const { state } = newBrawl();
    expect(state.players).toHaveLength(6);
    expect(towersOf(state, 0)).toHaveLength(5);
    expect(towersOf(state, 1)).toHaveLength(5);
    expect(state.phase).toBe("peace");
    expect(state.peaceRounds).toBe(4);
    expect(state.round).toBe(1);
  });

  it("前 4 回合禁止攻击，第 5 回合开战", () => {
    const { state } = newBrawl();
    expect(dispatch(state, { type: "attack" })).toBe(false);
    state.round = 4;
    expect(dispatch(state, { type: "attack" })).toBe(false);
    state.round = 5;
    state.phase = "normal";
    expect(dispatch(state, { type: "attack" })).toBe(true);
  });

  it("行动顺序按当前 HP 升序，同血随机但 uid 稳定", () => {
    const { state, ctx } = newBrawl();
    state.players[0].hp = 12;
    state.players[1].hp = 3;
    state.players[2].hp = 8;
    state.players[3].hp = 5;
    state.players[4].hp = 10;
    state.players[5].hp = 1;
    initBrawlOrder(ctx);
    const hps = state.players.map((p) => p.hp);
    expect(hps).toEqual([...hps].sort((a, b) => a - b));
  });

  it("和平期塔群待命；开战后 5 座塔 → 敌方全体 2 点", () => {
    const { state, mode, ctx } = newBrawl();
    const enemyBeforePeace = state.players
      .filter((p) => p.teamId === 1)
      .map((p) => p.hp);
    mode.onRoundEnd(ctx, 1);
    expect(
      state.players.filter((p) => p.teamId === 1).map((p) => p.hp),
    ).toEqual(enemyBeforePeace);

    state.phase = "normal";
    const enemyBefore = state.players
      .filter((p) => p.teamId === 1)
      .map((p) => p.hp);
    mode.onRoundEnd(ctx, 5);
    const enemyAfter = state.players
      .filter((p) => p.teamId === 1)
      .map((p) => p.hp);
    enemyAfter.forEach((hp, i) => {
      expect(enemyBefore[i] - hp).toBe(2);
    });
  });

  it("塔数 <3 → 3 点伤害", () => {
    const { state, mode, ctx } = newBrawl();
    state.phase = "normal";
    towersOf(state, 0).forEach((t, i) => {
      t.alive = i < 2;
    });
    const enemyBefore = state.players
      .filter((p) => p.teamId === 1)
      .map((p) => p.hp);
    mode.onRoundEnd(ctx, 5);
    const enemyAfter = state.players
      .filter((p) => p.teamId === 1)
      .map((p) => p.hp);
    enemyAfter.forEach((hp, i) => {
      expect(enemyBefore[i] - hp).toBe(3);
    });
  });

  it("拆光敌方 5 塔 → 我方胜利", () => {
    const { state, mode, ctx } = newBrawl();
    towersOf(state, 1).forEach((t) => {
      t.alive = false;
      t.hp = 0;
    });
    mode.checkGameOver(ctx);
    expect(state.gameOver).toBe(true);
    expect(state.mode.info.result.winnerTeam).toBe(0);
  });
});

describe("3v3 团战 — 复活", () => {
  it("阵亡 5 回合后满状态复活，获得 3 张防御牌并第一个行动", () => {
    const { state, ctx, mode } = newBrawl();
    const hero = state.players.find((p) => p.teamId === 0);
    hero.alive = false;
    hero.hp = 0;
    hero.respawnRound = 5;
    hero.resources.skillUses = 0;
    hero.char.chorus = 9;

    state.round = 5;
    mode.onNewRound(ctx, 5);

    expect(hero.alive).toBe(true);
    expect(hero.hp).toBe(hero.maxHp);
    expect(hero.defensePile).toHaveLength(3);
    expect(hero.resources.skillUses).toBeGreaterThan(0);
    expect(hero.char.chorus ?? 0).toBe(0);
    expect(state.players[0].uid).toBe(hero.uid);
  });
});

describe("3v3 团战 — 60 回合判定", () => {
  it("拆塔数多者胜", () => {
    const { state, ctx, mode } = newBrawl();
    towersOf(state, 1)[0].alive = false;
    state.round = 60;
    state.phase = "normal";
    mode.onRoundEnd(ctx, 60);
    expect(state.gameOver).toBe(true);
    expect(state.mode.info.result.winnerTeam).toBe(0);
    expect(state.mode.info.result.reason).toContain("拆塔数");
  });
});
