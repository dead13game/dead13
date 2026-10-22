import { describe, it, expect } from "vitest";

import {
  createLeagueState,
  countPlayedRounds,
  isLeagueFinished,
  checkTiebreakerNeeded,
  getPlayerMatchForRound,
  recordMatchResult,
  calculateStandings,
  getMatchResult,
  getRoundMatches,
} from "./league.js";
import { TOTAL_ROUNDS, LEAGUE_TEAMS } from "./leagueConstants.js";
import type { LeagueState, PlayerMatchForRound } from "./league.js";

/** 让 18 轮全部以平局结束：所有球队同分，必然触发附加赛 */
function allDraws(state: LeagueState): void {
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    getRoundMatches(round).forEach((m, idx) => {
      state.results[`${round}_${idx}`] = "draw";
    });
  }
  state._currentRound = TOTAL_ROUNDS + 1;
  state.currentRound = TOTAL_ROUNDS + 1;
}

describe("league v3.5 轮次与附加赛", () => {
  it("countPlayedRounds 按玩家实际完成的比赛计数（不是 -1）", () => {
    const state = createLeagueState(1);
    expect(countPlayedRounds(state)).toBe(0);
    for (let round = 1; round <= 9; round++) {
      recordMatchResult(state, round, "home");
    }
    expect(countPlayedRounds(state)).toBe(9);
  });

  it("isLeagueFinished 同时兼容 _currentRound 与 currentRound", () => {
    const state = createLeagueState(1);
    state._currentRound = 19;
    expect(isLeagueFinished(state)).toBe(true);
    const state2 = createLeagueState(1);
    state2.currentRound = 19;
    expect(isLeagueFinished(state2)).toBe(true);
  });

  it("18 轮全平局 → 玩家与其余 9 队同分，附加赛列出全部同分队", () => {
    const state = createLeagueState(1);
    allDraws(state);
    const standings = calculateStandings(state);
    const player = standings.find((t) => t.isPlayer);
    expect(player!.points).toBeGreaterThan(0);

    const tb = checkTiebreakerNeeded(state);
    expect(tb.needed).toBe(true);
    expect(tb.tiedTeamIds).toHaveLength(9);
    expect(tb.opponentTeamId).toBe(tb.tiedTeamIds[0]);
    expect(tb.tiedTeamIds).not.toContain(state.playerTeamId);
  });

  it("没有同分时不需要附加赛", () => {
    const state = createLeagueState(1);
    // 玩家 18 胜，其余球队互相平局 → 玩家独占榜首
    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      const pm = getPlayerMatchForRound(state, round)!;
      getRoundMatches(round).forEach((m, idx) => {
        state.results[`${round}_${idx}`] =
          idx === pm.matchIdx ? (pm.isHome ? "home" : "away") : "draw";
      });
    }
    state._currentRound = TOTAL_ROUNDS + 1;
    state.currentRound = TOTAL_ROUNDS + 1;

    const standings = calculateStandings(state);
    const player = standings.find((t) => t.isPlayer);
    const others = standings.filter((t) => !t.isPlayer);
    expect(player!.points).toBeGreaterThan(
      Math.max(...others.map((t) => t.points)),
    );
    const tb = checkTiebreakerNeeded(state);
    expect(tb.needed).toBe(false);
    expect(tb.tiedTeamIds).toEqual([]);
  });

  it("getMatchResult / recordMatchResult 在玩家是客队时正确翻转", () => {
    const state = createLeagueState(1);
    let round: number | null = null;
    let pm: PlayerMatchForRound | null = null;
    for (let r = 1; r <= TOTAL_ROUNDS; r++) {
      const m = getPlayerMatchForRound(state, r);
      if (m && !m.isHome) {
        round = r;
        pm = m;
        break;
      }
    }
    expect(round).not.toBeNull();
    recordMatchResult(state, round!, "home"); // 玩家视角：玩家胜
    expect(getMatchResult(state, round!, pm!.matchIdx)).toBe("away");

    recordMatchResult(state, round! + 1, "draw");
    expect(getMatchResult(state, round! + 1, getPlayerMatchForRound(state, round! + 1)!.matchIdx)).toBe("draw");
  });

  it("球队表数据完整（10 队、tier 合法）", () => {
    const teams = LEAGUE_TEAMS.filter(Boolean);
    expect(teams).toHaveLength(10);
    for (const t of teams) {
      expect([1, 2, 3]).toContain(t!.tier);
    }
  });
});
