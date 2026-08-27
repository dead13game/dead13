import { describe, it, expect, beforeEach } from "vitest";
import { reactive } from "vue";
import { createGameLogger } from "./gameLogger.js";
import { PHASE, STEP } from "./constants.js";
import {
  getCardBonus,
  calculateMatchScore,
  computeDefenseReinforcement,
} from "./league.js";
import { RANK_POINTS } from "./leagueConstants.js";
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

describe("league 规则v3.0：3v3 积分", () => {
  it("RANK_POINTS 为 6/5/4/3/2/1", () => {
    expect(RANK_POINTS).toEqual({ 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1 });
  });

  it("全员阵亡：按实际死亡顺序分配名次积分", () => {
    // 玩家3人先死 → 第6/5/4名 = 1+2+3；对手3人后死 → 第3/2/1名 = 4+5+6
    const deathOrder = [
      { playerIndex: 0, teamId: 0 },
      { playerIndex: 1, teamId: 0 },
      { playerIndex: 2, teamId: 0 },
      { playerIndex: 3, teamId: 1 },
      { playerIndex: 4, teamId: 1 },
      { playerIndex: 5, teamId: 1 },
    ];
    const { playerScore, opponentScore, winner } = calculateMatchScore(
      deathOrder,
      0,
      1,
    );
    expect(playerScore).toBe(6); // 1+2+3
    expect(opponentScore).toBe(15); // 4+5+6
    expect(winner).toBe(1);
  });

  it("一方团灭：剩余高名次积分全归存活队", () => {
    // 玩家3人全灭 → 第6/5/4名 = 6分；剩余第3/2/1名 = 15分全给对手
    const deathOrder = [
      { playerIndex: 0, teamId: 0 },
      { playerIndex: 1, teamId: 0 },
      { playerIndex: 2, teamId: 0 },
    ];
    const { playerScore, opponentScore, winner } = calculateMatchScore(
      deathOrder,
      0,
      1,
    );
    expect(playerScore).toBe(6);
    expect(opponentScore).toBe(15);
    expect(winner).toBe(1);
  });

  it("存活方先阵亡过的团灭：剩余高名次仍归存活方（回归）", () => {
    // 对手先死1人（第6名=1分），随后玩家3人全灭（第5/4/3名=2+3+4=9分）
    // 剩余第2/1名 = 5+6 应全给存活方对手 → 对手 1+5+6=12
    const deathOrder = [
      { playerIndex: 3, teamId: 1 },
      { playerIndex: 0, teamId: 0 },
      { playerIndex: 1, teamId: 0 },
      { playerIndex: 2, teamId: 0 },
    ];
    const { playerScore, opponentScore, winner } = calculateMatchScore(
      deathOrder,
      0,
      1,
    );
    expect(playerScore).toBe(9); // 2+3+4
    expect(opponentScore).toBe(12); // 1+5+6
    expect(winner).toBe(1); // 团灭方不应反胜
  });

  it("存活方先阵亡过的团灭：玩家存活方向（回归）", () => {
    // 玩家先死1人（第6名=1分），随后对手3人全灭（第5/4/3名=2+3+4=9分）
    // 剩余第2/1名 = 5+6 应全给存活方玩家 → 玩家 1+5+6=12
    const deathOrder = [
      { playerIndex: 0, teamId: 0 },
      { playerIndex: 3, teamId: 1 },
      { playerIndex: 4, teamId: 1 },
      { playerIndex: 5, teamId: 1 },
    ];
    const { playerScore, opponentScore, winner } = calculateMatchScore(
      deathOrder,
      0,
      1,
    );
    expect(playerScore).toBe(12); // 1+5+6
    expect(opponentScore).toBe(9); // 2+3+4
    expect(winner).toBe(0);
  });

  it("双方均有人存活（回合上限平局）：只计已锁定名次，winner 为 null", () => {
    // 玩家死1 → 第6名=1分；对手死1 → 第5名=2分；剩余4人未定名次不分配
    const deathOrder = [
      { playerIndex: 0, teamId: 0 },
      { playerIndex: 3, teamId: 1 },
    ];
    const { playerScore, opponentScore, winner } = calculateMatchScore(
      deathOrder,
      0,
      1,
    );
    expect(playerScore).toBe(1);
    expect(opponentScore).toBe(2);
    expect(winner).toBeNull(); // 名次未定，平局由调用方判定
  });
});

describe("league 规则v3.0：劣势方防御补给", () => {
  const mk = (teamId, alive = true) => ({ teamId, alive });

  it("人数相等不触发", () => {
    expect(
      computeDefenseReinforcement([mk(0), mk(0), mk(0), mk(1), mk(1), mk(1)]),
    ).toBeNull();
  });

  it("2v3：劣势方每人 +1 张", () => {
    expect(
      computeDefenseReinforcement([
        mk(0),
        mk(0),
        mk(1),
        mk(1),
        mk(1),
        mk(0, false),
      ]),
    ).toEqual({ weakerTeamId: 0, diff: 1 });
  });

  it("1v3：劣势方每人 +2 张", () => {
    expect(
      computeDefenseReinforcement([
        mk(0),
        mk(1),
        mk(1),
        mk(1),
        mk(0, false),
        mk(0, false),
      ]),
    ).toEqual({ weakerTeamId: 0, diff: 2 });
  });

  it("任一方已团灭不触发", () => {
    expect(
      computeDefenseReinforcement([
        mk(1),
        mk(1),
        mk(1),
        mk(0, false),
        mk(0, false),
        mk(0, false),
      ]),
    ).toBeNull();
  });
});

describe("league 规则v3.0：围攻惩罚", () => {
  function siegeState(targetHp = 50, targetDef = [], cardValue = 10) {
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
      hp: targetHp,
      maxHp: targetHp,
      defensePile: targetDef,
    });
    const state = mockState([attacker, target], {
      currentPlayerIndex: 0,
      step: STEP.ATTACK_SHOW_CARD,
      pendingAttackCard: mockCard({ value: cardValue }),
      leagueContext: { cardBonus: { attackBonus: 0, defenseBonus: 0 }, maxRounds: 30 },
    });
    return { state, target };
  }

  /** 重置到玩家（index 0）再次发起攻击 */
  function reattack(state, value) {
    state.currentPlayerIndex = 0;
    state.step = STEP.ATTACK_SHOW_CARD;
    state.pendingAttackCard = mockCard({ value });
  }

  it("第1次攻击不受影响", () => {
    const { state, target } = siegeState();
    executeAttack(state, 1);
    expect(target.hp).toBe(40); // 10 点全额
    expect(target.attackedThisRound).toBe(1);
  });

  it("第2次及后续攻击伤害减半（向上取整）", () => {
    const { state, target } = siegeState();
    executeAttack(state, 1); // 第1次：10 点
    expect(target.hp).toBe(40);

    reattack(state, 10);
    executeAttack(state, 1); // 第2次：ceil(10/2)=5
    expect(target.hp).toBe(35);
    expect(target.attackedThisRound).toBe(2);

    reattack(state, 3);
    executeAttack(state, 1); // 第3次：ceil(3/2)=2
    expect(target.hp).toBe(33);
    expect(state.messageLog.some((m) => m.includes("围攻减半"))).toBe(true);
  });

  it("减半后最低为1", () => {
    const { state, target } = siegeState();
    executeAttack(state, 1); // 第1次：10 点
    reattack(state, 1);
    executeAttack(state, 1); // 第2次：ceil(1/2)=1
    expect(target.hp).toBe(50 - 10 - 1);
  });

  it("被防御完全抵消仍算一次攻击", () => {
    const { state, target } = siegeState(50, [mockCard({ value: 10 })], 5);
    executeAttack(state, 1); // 第1次：5 点被 10 防完全抵消，计数+1
    expect(target.hp).toBe(50);
    expect(target.attackedThisRound).toBe(1);

    reattack(state, 5);
    executeAttack(state, 1); // 第2次：ceil(5/2)=3，被剩余防抵消，计数+1
    expect(target.attackedThisRound).toBe(2);
    expect(target.hp).toBe(50);
    expect(state.messageLog.some((m) => m.includes("围攻减半"))).toBe(true);
  });

  it("非联赛模式（无 leagueContext）不触发围攻", () => {
    const attacker = mockPlayer({
      index: 0,
      name: "玩家",
      teamId: -1,
      characterId: 1,
    });
    const target = mockPlayer({
      index: 1,
      name: "对手",
      teamId: -1,
      hp: 20,
      maxHp: 20,
    });
    const state = mockState([attacker, target], {
      currentPlayerIndex: 0,
      step: STEP.ATTACK_SHOW_CARD,
      pendingAttackCard: mockCard({ value: 5 }),
    });

    executeAttack(state, 1);
    expect(target.hp).toBe(15);
    expect(target.attackedThisRound).toBeUndefined();
  });
});
