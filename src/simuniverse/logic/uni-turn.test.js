import { describe, it, expect } from "vitest";
import { createUniState } from "./uniState.js";
import { startCombat, playerDefense } from "./uniCombat.js";
import { enemyAnnounce, enemyResolve } from "./uniCombat.js";

describe("模拟宇宙 M12：回合推进回归（敌人行动后回我方回合）", () => {
  it("完整玩家回合 → 敌人阶段 → 下一回合回到玩家行动", () => {
    const s = createUniState();
    startCombat(s);
    // 4 名存活玩家各行动一次走完玩家阶段
    for (let i = 0; i < 4; i++) {
      if (s.combat.phase !== "player-action") break;
      playerDefense(s, 0);
    }
    expect(s.combat.phase).toBe("enemy-announce");
    // 敌人阶段同步跑完（3 个普通敌人各 1 次行动）
    let guard = 0;
    while (guard++ < 40) {
      const p = s.combat?.phase;
      if (p !== "enemy-announce") break;
      const r = enemyAnnounce(s);
      if (!r.playing) break;
      enemyResolve(s);
    }
    // 关键断言：敌人行动后必须回到玩家回合且 actionOrder 重排
    expect(s.combat.phase).toBe("player-action");
    expect(s.combat.activeIdx).toBe(s.combat.actionOrder[0]);
    expect(s.combat.round).toBe(2);
  });

  it("首领穿插：2 名玩家行动后敌人行动，剩余玩家继续行动", () => {
    const s = createUniState();
    s.region = { type: "boss", name: "首领", waves: [{ kind: "boss", count: 1 }] };
    startCombat(s);
    // 前 2 名玩家行动 → 首领穿插入队
    for (let i = 0; i < 2; i++) {
      if (s.combat.phase !== "player-action") break;
      playerDefense(s, 0);
    }
    expect(s.combat.enemyQueue.length).toBeGreaterThan(0);
    expect(s.combat.phase).toBe("enemy-announce");
    // 结算穿插行动 → 应回到玩家阶段继续
    let guard = 0;
    while (guard++ < 20) {
      const p = s.combat?.phase;
      if (p !== "enemy-announce") break;
      const r = enemyAnnounce(s);
      if (!r.playing) break;
      enemyResolve(s);
    }
    expect(s.combat.phase).toBe("player-action");
  });
});
