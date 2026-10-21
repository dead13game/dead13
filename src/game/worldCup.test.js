import { describe, it, expect } from "vitest";

import {
  createWorldCupState,
  initGroupMatches,
  initKnockoutOpponent,
  advanceKnockoutRound,
  getKnockoutRoundName,
  calculateGroupStandings,
  checkGroupAdvancement,
  recordGroupMatchResult,
} from "./worldCup.js";
import { KNOCKOUT_OPPONENT_POOLS } from "./worldCupConstants.js";

function newState() {
  const state = createWorldCupState("我的队", ["甲队", "乙队", "丙队"]);
  initGroupMatches(state);
  return state;
}

describe("世界杯 v3.5 对手名单", () => {
  it("createWorldCupState 记录整届战绩容器与已交手球队", () => {
    const state = newState();
    expect(state.matchHistory).toEqual([]);
    expect(state._usedOpponents).toEqual(["甲队", "乙队", "丙队"]);
  });

  it("R16/QF/SF/Final 各自从对应名单抽取", () => {
    for (const round of ["R16", "QF", "SF", "Final"]) {
      const state = newState();
      state.knockoutRound = round;
      // 把名单里其他球队都标记为本届已交手，只留一支
      const pool = KNOCKOUT_OPPONENT_POOLS[round];
      state._usedOpponents = pool.slice(1);
      const opponent = initKnockoutOpponent(state);
      expect(opponent.name).toBe(pool[0]);
      expect(opponent.emoji).toBeTruthy();
      expect(opponent.charId).not.toBe(12);
    }
  });

  it("名单抽空后仍能开出对手（退回整份名单）", () => {
    const state = newState();
    state.knockoutRound = "QF";
    state._usedOpponents = [...KNOCKOUT_OPPONENT_POOLS.QF];
    const opponent = initKnockoutOpponent(state);
    expect(KNOCKOUT_OPPONENT_POOLS.QF).toContain(opponent.name);
  });

  it("淘汰赛中文名使用八分之一决赛", () => {
    expect(getKnockoutRoundName("R16")).toBe("八分之一决赛");
    expect(getKnockoutRoundName("QF")).toBe("四分之一决赛");
  });

  it("advanceKnockoutRound 进入 R16 并生成 R16 名单内的对手", () => {
    const state = newState();
    advanceKnockoutRound(state);
    expect(state.knockoutRound).toBe("R16");
    expect(KNOCKOUT_OPPONENT_POOLS.R16).toContain(state.knockoutOpponent.name);
    expect(state._usedOpponents).toContain(state.knockoutOpponent.name);

    advanceKnockoutRound(state);
    expect(state.knockoutRound).toBe("QF");
    expect(KNOCKOUT_OPPONENT_POOLS.QF).toContain(state.knockoutOpponent.name);
  });
});

describe("世界杯小组赛积分", () => {
  it("三场小组赛结束后计算积分榜与出线判定", () => {
    const state = newState();
    // 玩家赢下三场
    recordGroupMatchResult(state, 0, "home");
    recordGroupMatchResult(state, 1, "home");
    recordGroupMatchResult(state, 2, "home");
    // 其余比赛补上结果
    state.groupMatches.slice(3).forEach((m) => {
      m.result = "draw";
      m.played = true;
    });
    const standings = calculateGroupStandings(state);
    expect(standings).toHaveLength(4);
    expect(standings[0].isPlayer).toBe(true);
    const { advanced, rank } = checkGroupAdvancement(state);
    expect(advanced).toBe(true);
    expect(rank).toBe(1);
  });
});
