import { describe, it, expect } from "vitest";

import { createSession, dispatch } from "../api.js";
import { createClassicMode } from "../modes/classic.js";
import { createBrawlMode, initBrawlOrder } from "../modes/brawl.js";
import { createTowers, towersOf } from "../core/units.js";

function classic2p() {
  const { state } = createSession({
    chars: [1, 2],
    weather: false,
    mode: createClassicMode(),
  });
  state.phase = "normal";
  state.round = 5;
  return state;
}

function brawl() {
  const { state, ctx } = createSession({
    chars: [1, 2, 3, 4, 5, 6],
    weather: false,
    startRound: 1,
    teamIds: [0, 0, 0, 1, 1, 1],
    mode: createBrawlMode({ maxRounds: 60, respawnRounds: 5 }),
  });
  createTowers(state, [0, 1]);
  initBrawlOrder(ctx);
  return { state, ctx };
}

describe("v3.5 伤害乘区 — 圣遗物在陷阱判定前", () => {
  it("10 点攻击 ×1.5 后 15 > 陷阱14 → 破陷阱；若在陷阱后结算则会反弹", () => {
    const state = classic2p();
    const attacker = state.players[state.currentPlayerIndex];
    const target = state.players.find((p) => p.uid !== attacker.uid);

    attacker.artifact.id = 1;
    attacker.artifact.active = true;
    attacker.artifact.roundsLeft = 2;
    target.trap = { id: "T14", value: 14, faceUp: false };
    target.bait = { id: "B1", value: 1, faceUp: true };
    state.deck = [
      { id: "ATK10", rank: "10", suit: "♠", value: 10, faceUp: false },
    ];

    expect(dispatch(state, { type: "attack" })).toBe(true);
    expect(dispatch(state, { type: "attackTarget", targetUid: target.uid })).toBe(
      true,
    );

    // 15 点打破 14 点陷阱 → 攻击者不掉血，目标受到 15 点
    expect(attacker.hp).toBe(attacker.maxHp);
    expect(target.alive).toBe(false);
    expect(target.trap).toBeNull();
  });

  it("无圣遗物时 10 < 陷阱14 → 攻击者被反弹", () => {
    const state = classic2p();
    const attacker = state.players[state.currentPlayerIndex];
    const target = state.players.find((p) => p.uid !== attacker.uid);
    target.trap = { id: "T14", value: 14, faceUp: false };
    state.deck = [
      { id: "ATK10", rank: "10", suit: "♠", value: 10, faceUp: false },
    ];

    dispatch(state, { type: "attack" });
    dispatch(state, { type: "attackTarget", targetUid: target.uid });
    expect(attacker.alive).toBe(false);
    expect(target.hp).toBe(target.maxHp);
  });
});

describe("v3.5 橘雪梨 — 调查流程", () => {
  it("目标没有陷阱 → 7 点普攻（无视陷阱）", () => {
    const { state } = createSession({
      chars: [14, 1],
      weather: false,
      mode: createClassicMode(),
    });
    state.phase = "normal";
    state.round = 5;
    const actor = state.players[state.currentPlayerIndex];
    const target = state.players.find((p) => p.uid !== actor.uid);
    expect(actor.characterId).toBe(14);

    expect(dispatch(state, { type: "attack" })).toBe(true);
    expect(state.pending?.purpose).toBe("attack:investigate");
    expect(
      dispatch(state, { type: "attackTarget", targetUid: target.uid }),
    ).toBe(true);
    expect(target.hp).toBe(target.maxHp - 7);
  });

  it("猜中陷阱 → 拆陷阱并造成 20 点伤害", () => {
    const { state } = createSession({
      chars: [14, 1],
      weather: false,
      mode: createClassicMode(),
    });
    state.phase = "normal";
    state.round = 5;
    const actor = state.players[state.currentPlayerIndex];
    const target = state.players.find((p) => p.uid !== actor.uid);
    target.trap = { id: "T7", value: 7, faceUp: false };

    dispatch(state, { type: "attack" });
    dispatch(state, { type: "attackTarget", targetUid: target.uid });
    expect(state.pending?.purpose).toBe("investigate:guess");
    dispatch(state, { type: "skillAnswer", answer: 7 });
    expect(target.alive).toBe(false);
    expect(target.trap).toBeNull();
  });
});

describe("v3.5 团战 — 防御支援 / 陷阱支援", () => {
  it("非沃雅妮莎防御不会误加「领唱」", () => {
    const state = classic2p();
    const actor = state.players[state.currentPlayerIndex];
    dispatch(state, { type: "defense" });
    expect(actor.char.chorus ?? 0).toBe(0);
  });

  it("摸牌会写入 drawFeed（供抽牌动画/明牌展示）", () => {
    const state = classic2p();
    state.deck = [
      { id: "DRAW9", rank: "9", suit: "♦", value: 9, faceUp: false },
    ];
    expect(dispatch(state, { type: "attack" })).toBe(true);
    expect(state.drawFeed.length).toBeGreaterThan(0);
    const entry = state.drawFeed[state.drawFeed.length - 1];
    expect(entry.kind).toBe("attack");
    expect(entry.cards[0].rank).toBe("9");
    expect(entry.cards[0].faceUp).toBe(true);
  });

  it("防御支援可以把牌给队友或己方塔", () => {
    const { state } = brawl();
    const actor = state.players[state.currentPlayerIndex];
    const teammate = state.players.find(
      (p) => p.teamId === actor.teamId && p.uid !== actor.uid,
    );

    expect(dispatch(state, { type: "defense" })).toBe(true);
    expect(state.pending?.purpose).toBe("defense.support");
    expect(state.pending.options).toContain(teammate.uid);

    expect(
      dispatch(state, { type: "defenseTarget", targetUid: teammate.uid }),
    ).toBe(true);
    expect(teammate.defensePile).toHaveLength(1);
    expect(teammate.defensePile[0].ownerUid).toBe(actor.uid);
  });

  it("陷阱支援可以把陷阱布置到己方塔，诱饵留在自己这里", () => {
    const { state } = brawl();
    const actor = state.players[state.currentPlayerIndex];
    const tower = towersOf(state, actor.teamId)[0];

    expect(dispatch(state, { type: "gamble" })).toBe(true);
    expect(dispatch(state, { type: "gambleSubmit", trapIdx: 0, baitIdx: 1 })).toBe(
      true,
    );
    expect(state.pending?.purpose).toBe("gamble:trap");

    expect(
      dispatch(state, { type: "gambleTarget", targetUid: tower.uid }),
    ).toBe(true);
    expect(tower.trap).toBeTruthy();
    expect(actor.trap).toBeNull();
    expect(actor.bait).toBeTruthy();
  });
});
