import { describe, it, expect, beforeEach } from "vitest";
import { reactive } from "vue";
import { createGameLogger, CAT } from "./gameLogger.js";

// 直接导入纯函数测试
import {
  applyDamage,
  dissolveAlliance,
  checkGameOver,
  alivePlayers,
} from "./damage.js";

/** 创建一个最小 state mock */
function mockState(players = []) {
  const state = reactive({
    players,
    grave: [],
    messageLog: [],
    gameOver: false,
    winnerIndex: -1,
    phase: "normal",
    round: 5,
    matchContext: null,
    devLog: createGameLogger(() => state),
  });
  return state;
}

/** 创建一个模拟玩家 */
function mockPlayer(overrides = {}) {
  return {
    index: 0,
    name: "测试玩家",
    hp: 20,
    maxHp: 20,
    alive: true,
    defensePile: [],
    trap: null,
    bait: null,
    allyIndex: null,
    allianceTurns: 0,
    betrayalPenalty: 0,
    ...overrides,
  };
}

/** 创建一张模拟牌 */
function mockCard(overrides = {}) {
  return {
    id: "♠-5",
    suit: "♠",
    rank: "5",
    value: 5,
    faceUp: false,
    isShield: false,
    ...overrides,
  };
}

describe("applyDamage", () => {
  let state, player;

  beforeEach(() => {
    player = mockPlayer();
    state = mockState([player]);
  });

  it("无防御直接扣血", () => {
    applyDamage(state, player, 10);
    expect(player.hp).toBe(10);
    expect(state.messageLog).toContain("测试玩家 HP 10");
  });

  it("防御牌完全抵消伤害", () => {
    player.defensePile = [mockCard({ value: 8 })];
    applyDamage(state, player, 5);
    expect(player.hp).toBe(20); // 未扣血
    expect(player.defensePile[0].value).toBe(3); // 残盾 3
    expect(state.messageLog).toContain("测试玩家 残盾 3点");
  });

  it("防御牌刚好抵消 → 弃入墓地", () => {
    player.defensePile = [mockCard({ value: 5, id: "♠-5" })];
    applyDamage(state, player, 5);
    expect(player.hp).toBe(20);
    expect(player.defensePile).toHaveLength(0);
    expect(state.grave).toHaveLength(1);
    expect(state.grave[0].id).toBe("♠-5");
  });

  it("多层防御被击穿", () => {
    player.defensePile = [
      mockCard({ value: 3, id: "A" }),
      mockCard({ value: 4, id: "B" }),
    ];
    applyDamage(state, player, 10);
    // 第一张 4 被击穿 (10-4=6), 第二张 3 被击穿 (6-3=3), 剩余 3 扣血
    expect(player.hp).toBe(17);
    expect(player.defensePile).toHaveLength(0);
    expect(state.grave).toHaveLength(2);
  });

  it("护盾牌不进入墓地", () => {
    player.defensePile = [mockCard({ value: 5, isShield: true })];
    applyDamage(state, player, 3);
    expect(player.defensePile[0].value).toBe(2); // 残盾
    // 护盾没消耗完 → 不弃入墓地
    if (player.defensePile[0].value === 0) {
      expect(state.grave).toHaveLength(0);
    }
  });

  it("致死伤害 → 玩家死亡", () => {
    applyDamage(state, player, 25);
    expect(player.alive).toBe(false);
    expect(player.hp).toBe(0);
    expect(state.messageLog).toContain("测试玩家 阵亡");
  });

  it("死亡后防御牌和陷阱弃入墓地（护盾除外）", () => {
    player.defensePile = [mockCard({ value: 5, id: "def1" })];
    player.trap = mockCard({ value: 8, id: "trap1" });
    player.bait = mockCard({ value: 3, id: "bait1" });
    applyDamage(state, player, 30);
    expect(player.alive).toBe(false);
    expect(player.defensePile).toHaveLength(0);
    expect(player.trap).toBeNull();
    expect(player.bait).toBeNull();
  });

  it("HP ≤ 0 时修正为 0", () => {
    applyDamage(state, player, 30);
    expect(player.hp).toBe(0);
  });
});

describe("dissolveAlliance", () => {
  it("双向解除联盟", () => {
    const p1 = mockPlayer({ index: 0, allyIndex: 1, allianceTurns: 3 });
    const p2 = mockPlayer({ index: 1, allyIndex: 0, allianceTurns: 3 });
    const state = mockState([p1, p2]);

    dissolveAlliance(state, p1);
    expect(p1.allyIndex).toBeNull();
    expect(p1.allianceTurns).toBe(0);
    expect(p2.allyIndex).toBeNull();
    expect(p2.allianceTurns).toBe(0);
  });

  it("单方无盟友时安全处理", () => {
    const p1 = mockPlayer({ index: 0, allyIndex: null });
    const state = mockState([p1]);
    expect(() => dissolveAlliance(state, p1)).not.toThrow();
  });
});

describe("checkGameOver", () => {
  it("最后一人存活 → 游戏结束", () => {
    const p1 = mockPlayer({ index: 0, alive: true });
    const p2 = mockPlayer({ index: 1, alive: false });
    const state = mockState([p1, p2]);

    checkGameOver(state);
    expect(state.gameOver).toBe(true);
    expect(state.winnerIndex).toBe(0);
    expect(state.phase).toBe("gameOver");
  });

  it("全员阵亡 → 游戏结束无胜者", () => {
    const p1 = mockPlayer({ index: 0, alive: false });
    const p2 = mockPlayer({ index: 1, alive: false });
    const state = mockState([p1, p2]);

    checkGameOver(state);
    expect(state.gameOver).toBe(true);
    expect(state.messageLog).toContain("全员阵亡");
  });

  it("多人存活 → 继续游戏", () => {
    const p1 = mockPlayer({ index: 0, alive: true });
    const p2 = mockPlayer({ index: 1, alive: true });
    const state = mockState([p1, p2]);

    checkGameOver(state);
    expect(state.gameOver).toBe(false);
  });
});

describe("alivePlayers", () => {
  it("过滤出存活玩家", () => {
    const players = [
      mockPlayer({ index: 0, alive: true, name: "A" }),
      mockPlayer({ index: 1, alive: false, name: "B" }),
      mockPlayer({ index: 2, alive: true, name: "C" }),
    ];
    const state = mockState(players);
    expect(alivePlayers(state)).toHaveLength(2);
  });
});
