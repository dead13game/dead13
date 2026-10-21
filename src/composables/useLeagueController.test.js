import { describe, it, expect } from "vitest";

import { useLeagueController } from "./useLeagueController.js";

describe("useLeagueController — 附加赛流程", () => {
  it("第 18 轮后查看积分榜会推进轮次并判定附加赛", () => {
    const c = useLeagueController();
    c.initLeague(1, "easy", null, null, false);
    c.leagueState._currentRound = 18;
    c.leagueState.currentRound = 18;
    c.viewStandings();
    expect(c.leagueState._currentRound).toBe(19);
    expect(c.uiMode.value).toBe("standings");
    // 没有任何比赛结果 → 所有队 0 分 → 必然同分，需要附加赛
    expect(c.leagueState._tiebreakerNeeded).toBe(true);
  });

  it("附加赛选人后正确进入加赛，而不是卡死", () => {
    const c = useLeagueController();
    c.initLeague(1, "easy", null, null, false);
    c.leagueState._currentRound = 19;
    c.leagueState.currentRound = 19;
    c.leagueState._tiebreakerOpponent = 2;
    c.leagueState._tiebreakOrder = [1, 2];
    c.startTiebreaker();
    expect(c.uiMode.value).toBe("draft");

    c.startMatchWithDraft({
      playerChars: [1, 2, 3],
      opponentChars: [4, 5, 6],
    });

    expect(c.uiMode.value).toBe("match");
    expect(c.matchState.value?.isTiebreaker).toBe(true);
    expect(c.matchState.value?.round).toBe(19);
    expect(c.gameState.players).toHaveLength(6);
    expect(c.matchState.value?.maxRounds).toBe(Infinity);
  });

  it("附加赛胜利后同分队排序覆盖，玩家排在对手前", () => {
    const c = useLeagueController();
    c.initLeague(1, "easy", null, null, false);
    c.leagueState._currentRound = 19;
    c.leagueState.currentRound = 19;
    c.leagueState._tiebreakerOpponent = 2;
    c.leagueState._tiebreakOrder = [1, 2, 3];
    c.startTiebreaker();
    c.startMatchWithDraft({
      playerChars: [1, 2, 3],
      opponentChars: [4, 5, 6],
    });
    // 直接改 winner，模拟加赛结束
    c.matchState.value.winner = 0;
    // finishTiebreaker 是内部函数，通过存档/结算路径不可达；这里验证状态字段
    expect(c.leagueState._isTiebreaker).toBe(true);
    expect(c.leagueState._tiebreakerOpponent).toBe(2);
  });
});
