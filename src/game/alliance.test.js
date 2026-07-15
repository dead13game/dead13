import { describe, it, expect, beforeEach } from "vitest";
import { reactive } from "vue";
import { createGameLogger } from "./gameLogger.js";
import { dissolveAlliance, applyDamage } from "./damage.js";
import { PHASE, STEP } from "./constants.js";

// 注入 combat/skills/alliance 所需的依赖（模拟 gameState.js 的注入）
import { _injectAllianceDeps } from "./alliance.js";

/** 创建最小 state mock */
function mockState(players = [], overrides = {}) {
  const state = reactive({
    players,
    currentPlayerIndex: 0,
    grave: [],
    deck: [],
    messageLog: [],
    gameOver: false,
    winnerIndex: -1,
    phase: PHASE.NORMAL,
    step: STEP.PICK_ACTION,
    round: 5,
    endTurn: true,
    matchContext: null,
    useWeather: false,
    weatherDeck: [],
    currentWeather: null,
    nextWeather: null,
    devLog: createGameLogger(() => state),
    ...overrides,
  });
  return state;
}

function mockPlayer(overrides = {}) {
  return {
    index: 0,
    name: "测试玩家",
    characterId: "test",
    characterName: "测试",
    hp: 20,
    maxHp: 20,
    alive: true,
    defensePile: [],
    trap: null,
    bait: null,
    skillUses: 1,
    skillName: "测试技能",
    skillDesc: "",
    skillType: "active",
    maxUses: 1,
    fightingSpirit: 0,
    moonPhase: 0,
    ignoreTrapThisTurn: false,
    extraAction: false,
    loadUses: 3,
    loadMaxUses: 3,
    stealTarget: null,
    dotTarget: null,
    damageBonus: {},
    frozenBy: null,
    savepoint: null,
    allyIndex: null,
    allianceTurns: 0,
    betrayalPenalty: 0,
    allyKillBonus: false,
    ...overrides,
  };
}

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

// 模拟 gameState.js 的依赖注入
function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}
function addLog(state, msg) {
  state.messageLog.push(msg);
}
function ensureDeck(state, n = 1) {
  // 简单版：不够就加 mock 牌
  while (state.deck.length < n) {
    state.deck.push(mockCard({ id: `mock-${Date.now()}` }));
  }
}
function endAction(state) {
  if (state.endTurn) {
    state.currentPlayerIndex =
      (state.currentPlayerIndex + 1) % state.players.length;
  }
  state.endTurn = true;
  state.step = STEP.PICK_ACTION;
}

// 注入依赖
_injectAllianceDeps(currentPlayer, addLog, ensureDeck, endAction);

import {
  startAlly,
  executeAlly,
  executeBetray,
  getAllianceTargets,
} from "./alliance.js";

describe("alliance", () => {
  describe("结盟", () => {
    // 添加填充玩家满足 4 人最小要求
    function withFillers(...players) {
      while (players.length < 4) {
        players.push(
          mockPlayer({ index: players.length, name: `填充${players.length}` }),
        );
      }
      return players;
    }

    it("4人成功结盟，5回合", () => {
      const p0 = mockPlayer({ index: 0, name: "A" });
      const p1 = mockPlayer({ index: 1, name: "B" });
      const state = mockState(withFillers(p0, p1));

      startAlly(state);
      expect(state.step).toBe("allyPick");

      executeAlly(state, 1);
      expect(p0.allyIndex).toBe(1);
      expect(p0.allianceTurns).toBe(5);
      expect(p1.allyIndex).toBe(0);
      expect(p1.allianceTurns).toBe(5);
    });

    it("已有盟友不可再结盟", () => {
      const p0 = mockPlayer({ index: 0, name: "A", allyIndex: 1 });
      const p1 = mockPlayer({ index: 1, name: "B", allyIndex: 0 });
      const state = mockState(withFillers(p0, p1));

      startAlly(state);
      expect(state.messageLog).toContain("已有盟友，不可再结盟");
      expect(state.step).not.toBe("allyPick");
    });

    it("目标已有盟友不可结盟", () => {
      const p0 = mockPlayer({ index: 0, name: "A" });
      const p1 = mockPlayer({ index: 1, name: "B", allyIndex: 2 });
      const p2 = mockPlayer({ index: 2, name: "C", allyIndex: 1 });
      const state = mockState(withFillers(p0, p1, p2));

      startAlly(state);
      executeAlly(state, 1);
      expect(state.messageLog).toContain("B 已有盟友");
      expect(p0.allyIndex).toBeNull();
    });

    it("背刺惩罚中不可结盟", () => {
      const p0 = mockPlayer({ index: 0, name: "A", betrayalPenalty: 5 });
      const p1 = mockPlayer({ index: 1, name: "B" });
      const state = mockState(withFillers(p0, p1));

      startAlly(state);
      expect(state.messageLog).toContain("背刺惩罚中，5回合内不可结盟");
    });
  });

  describe("背刺", () => {
    it("背刺盟友 +4 伤害", () => {
      const p0 = mockPlayer({
        index: 0,
        name: "A",
        allyIndex: 1,
        allianceTurns: 3,
      });
      const p1 = mockPlayer({
        index: 1,
        name: "B",
        allyIndex: 0,
        allianceTurns: 3,
        hp: 20,
        maxHp: 20,
      });
      const state = mockState([p0, p1]);

      executeBetray(state);
      // 背刺造成卡牌值 +4 伤害
      expect(p1.hp).toBeLessThan(20);
      // 联盟被解除
      expect(p0.allyIndex).toBeNull();
      expect(p1.allyIndex).toBeNull();
      // 背刺惩罚
      expect(p0.betrayalPenalty).toBe(10);
    });

    it("无盟友时背刺无效", () => {
      const p0 = mockPlayer({ index: 0, name: "A", allyIndex: null });
      const state = mockState([p0]);

      executeBetray(state);
      expect(state.messageLog).toContain("没有盟友可以背刺");
    });
  });

  describe("getAllianceTargets", () => {
    it("筛选可结盟目标", () => {
      const p0 = mockPlayer({ index: 0, name: "A" });
      const p1 = mockPlayer({ index: 1, name: "B" });
      const p2 = mockPlayer({ index: 2, name: "C", allyIndex: 3 });
      const p3 = mockPlayer({ index: 3, name: "D", betrayalPenalty: 3 });
      const state = mockState([p0, p1, p2, p3]);

      state.currentPlayerIndex = 0;
      const targets = getAllianceTargets(state);
      // B 可选（无盟友无惩罚），C 不可选（已有盟友），D 不可选（惩罚中）
      expect(targets.map((t) => t.name)).toEqual(["B"]);
    });
  });

  describe("dissolveAlliance 边缘情况", () => {
    it("盟友已死亡时安全解除", () => {
      const p0 = mockPlayer({ index: 0, name: "A", allyIndex: 1 });
      const p1 = mockPlayer({
        index: 1,
        name: "B",
        allyIndex: 0,
        alive: false,
      });
      const state = mockState([p0, p1]);

      expect(() => dissolveAlliance(state, p0)).not.toThrow();
      expect(p0.allyIndex).toBeNull();
    });
  });
});
