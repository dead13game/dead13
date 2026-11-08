import { describe, it, expect } from "vitest";

import { useWorldCupController } from "./useWorldCupController.js";
import { getCtx } from "../game/api.js";

/**
 * VB-20 回归：世界杯击杀对手后必须离开比赛桌进换人界面。
 *
 * 之前 `createMatchMode` 没把 onAfterCheck 挂到 adapter 上，控制器的
 * `routeAfterCheck` 永不触发，`uiMode` 停在 `match`，界面卡死。
 */
function startGroupMatch() {
  const c = useWorldCupController();
  c.initWorldCup("测试队", 1, ["西班牙", "德国", "巴西"], false);
  return c;
}

/** 在真实局面里把对手打死，并按内核路径跑结束判定 */
function killOpponent(c: ReturnType<typeof useWorldCupController>) {
  const ms = c.matchState.value;
  if (!ms) throw new Error("测试局面没有比赛状态");
  const ctx = getCtx(c.gameState);
  if (!ctx) throw new Error("测试局面没有 ctx");
  const opponent = c.gameState.players.find(
    (p) => p.uid === ms.opponentUid,
  );
  if (!opponent) throw new Error("测试局面缺少对手");
  opponent.alive = false;
  opponent.hp = 0;
  ctx.mode?.checkGameOver?.(ctx);
  return ms;
}

describe("useWorldCupController — 击杀后换人(VB-20)", () => {
  it("小组赛击杀对手 → 进入换人界面，而不是卡在比赛桌", () => {
    const c = startGroupMatch();
    expect(c.uiMode.value).toBe("match");

    const ms = killOpponent(c);

    expect(ms.substitutionPending).toBe(true);
    expect(ms.score).toEqual([1, 0]);
    expect(c.uiMode.value).toBe("substitution");
  });

  it("跳过换人 → 新一命继续比赛（回合 +1，双方满血）", () => {
    const c = startGroupMatch();
    const ms = killOpponent(c);
    const before = ms.matchRound;

    c.handleSkipSubstitution();

    expect(c.uiMode.value).toBe("match");
    const after = c.matchState.value;
    if (!after) throw new Error("换人后应仍有比赛状态");
    expect(after.matchRound).toBe(before + 1);
    expect(after.substitutionPending).toBe(false);
    expect(c.gameState.players.every((p) => p.alive)).toBe(true);
    expect(c.gameState.players.every((p) => p.hp === p.maxHp)).toBe(true);
  });
});
