import { describe, it, expect, beforeEach } from "vitest";
import { reactive } from "vue";
import { createGameLogger } from "./gameLogger.js";
import { PHASE, STEP } from "./constants.js";
import { getCardBonus } from "./league.js";
import {
  _injectCombatDeps,
  executeAttack,
  executeDefense,
} from "./combat.js";

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
    round: 1,
    endTurn: true,
    matchContext: null,
    leagueContext: null,
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
    characterId: 1,
    hp: 20,
    maxHp: 20,
    alive: true,
    teamId: 0,
    defensePile: [],
    trap: null,
    bait: null,
    skillUses: 1,
    fightingSpirit: 0,
    moonPhase: 0,
    loadUses: 0,
    artifactActive: false,
    artifactId: null,
    statusEffects: {
      ignoreTrapThisTurn: false,
      extraAction: false,
      stealTarget: null,
      dotTarget: null,
      damageBonus: {},
      frozenBy: null,
      savepoint: null,
    },
    relations: {
      allyIndex: null,
      allianceTurns: 0,
      betrayalPenalty: 0,
      allyKillBonus: false,
      consecutiveGambles: 0,
      gamblePenalty: false,
    },
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

// 注入 combat 依赖（模拟 gameState.js 的注入）
function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}
function addLog(state, msg) {
  state.messageLog.push(msg);
}
function ensureDeck(state, n = 1) {
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
_injectCombatDeps(currentPlayer, addLog, ensureDeck, endAction);

describe("league 联赛加成", () => {
  describe("getCardBonus 加成计算", () => {
    it("玩家等级高于对手 2 级：攻击+2 防御+2", () => {
      // tier1 曼城(1) vs tier3 狼队(10)
      const b = getCardBonus(1, 10, false);
      expect(b).toEqual({ attackBonus: 2, defenseBonus: 2 });
    });

    it("玩家等级高于对手 1 级：仅攻击+2", () => {
      // tier1 曼城(1) vs tier2 切尔西(5)
      const b = getCardBonus(1, 5, false);
      expect(b).toEqual({ attackBonus: 2, defenseBonus: 0 });
    });

    it("玩家等级低于对手：无加成", () => {
      // tier3 狼队(10) vs tier1 曼城(1)
      const b = getCardBonus(10, 1, false);
      expect(b).toEqual({ attackBonus: 0, defenseBonus: 0 });
    });

    it("主场：攻击额外+1", () => {
      const b = getCardBonus(1, 10, true);
      expect(b).toEqual({ attackBonus: 3, defenseBonus: 2 });
    });
  });

  describe("攻击加成归属队伍", () => {
    it("对手队（teamId=1）攻击玩家队：不享受联赛攻击加成", () => {
      const attacker = mockPlayer({
        index: 0,
        name: "对手",
        teamId: 1,
        characterId: 1,
      });
      const target = mockPlayer({
        index: 1,
        name: "玩家",
        teamId: 0,
        hp: 20,
        maxHp: 20,
      });
      const state = mockState([attacker, target], {
        currentPlayerIndex: 0,
        step: STEP.ATTACK_SHOW_CARD,
        pendingAttackCard: mockCard({ value: 5 }),
        leagueContext: { cardBonus: { attackBonus: 3, defenseBonus: 2 } },
      });

      executeAttack(state, 1);
      expect(state.messageLog).not.toContain("联赛攻击加成+3");
    });

    it("玩家队（teamId=0）攻击对手队：享受联赛攻击加成", () => {
      const attacker = mockPlayer({
        index: 0,
        name: "玩家",
        teamId: 0,
        characterId: 1,
      });
      const target = mockPlayer({
        index: 1,
        name: "对手",
        teamId: 1,
        hp: 20,
        maxHp: 20,
      });
      const state = mockState([attacker, target], {
        currentPlayerIndex: 0,
        step: STEP.ATTACK_SHOW_CARD,
        pendingAttackCard: mockCard({ value: 5 }),
        leagueContext: { cardBonus: { attackBonus: 3, defenseBonus: 2 } },
      });

      executeAttack(state, 1);
      expect(state.messageLog).toContain("联赛攻击加成+3");
    });
  });

  describe("防御加成归属队伍", () => {
    it("对手队（teamId=1）防御：不享受联赛防御加成", () => {
      const defender = mockPlayer({
        index: 0,
        name: "对手",
        teamId: 1,
        defensePile: [],
      });
      const state = mockState([defender], {
        currentPlayerIndex: 0,
        step: STEP.PICK_ACTION,
        deck: [mockCard({ value: 5 })],
        leagueContext: { cardBonus: { attackBonus: 3, defenseBonus: 2 } },
      });

      executeDefense(state);
      expect(defender.defensePile).toHaveLength(1);
      expect(defender.defensePile[0].defenseValue).toBe(5);
    });

    it("玩家队（teamId=0）防御：享受联赛防御加成", () => {
      const defender = mockPlayer({
        index: 0,
        name: "玩家",
        teamId: 0,
        defensePile: [],
      });
      const state = mockState([defender], {
        currentPlayerIndex: 0,
        step: STEP.PICK_ACTION,
        deck: [mockCard({ value: 5 })],
        leagueContext: { cardBonus: { attackBonus: 3, defenseBonus: 2 } },
      });

      executeDefense(state);
      expect(defender.defensePile).toHaveLength(1);
      expect(defender.defensePile[0].defenseValue).toBe(7);
    });
  });
});
