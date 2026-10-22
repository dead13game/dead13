import { describe, it, expect } from "vitest";

import { createContext } from "./context.js";
import { createGameState } from "./setup.js";
import { createSeededRng } from "../core/rng.js";
import { createDeck } from "../core/cards.js";
import { createPlayer } from "../core/player.js";
import { STEP } from "../core/constants.js";
import type { GameState } from "../types.js";

const META = { hp: 11, maxUses: 3, loadMaxUses: 0 };

function makeState(): GameState {
  // 用完整的空局面起步：既满足 GameState 契约，又让断言与旧的最小 state 一致
  const state = createGameState();
  state.players = [
    createPlayer({ uid: 1, index: 0, characterId: 1, meta: META }),
    createPlayer({ uid: 2, index: 1, characterId: 2, meta: META }),
  ];
  state.currentPlayerIndex = 0;
  state.deck = createDeck();
  state.round = 3;
  return state;
}

describe("flow/context", () => {
  it("deck.draw 从顶部抽并消耗牌堆", () => {
    const state = makeState();
    const ctx = createContext(state, { rng: createSeededRng(1) });
    const cards = ctx.deck.draw(2);
    expect(cards).toHaveLength(2);
    expect(state.deck).toHaveLength(50);
    expect(cards[0].id).toBe("♣-K");
  });

  it("deck.ensure 在牌库不足时重构墓地(与旧 ensureDeck 等价)", () => {
    const state = makeState();
    const ctx = createContext(state, { rng: createSeededRng(2) });
    state.deck = [];
    state.grave = createDeck().slice(0, 5);
    ctx.deck.ensure(1);
    expect(state.deck).toHaveLength(5);
    expect(state.grave).toHaveLength(0);
    expect(state.messageLog).toContain("牌库重构");
  });

  it("牌库充足时 ensure 不动墓地", () => {
    const state = makeState();
    const ctx = createContext(state, { rng: createSeededRng(3) });
    state.grave = createDeck().slice(0, 3);
    ctx.deck.ensure(2);
    expect(state.grave).toHaveLength(3);
    expect(state.messageLog).toHaveLength(0);
  });

  it("deck.isExhausted 只在牌库墓地双空时为真(KB-8 边界)", () => {
    const state = makeState();
    const ctx = createContext(state, { rng: createSeededRng(4) });
    state.deck = [];
    state.grave = createDeck().slice(0, 1);
    expect(ctx.deck.isExhausted()).toBe(false);
    state.grave = [];
    expect(ctx.deck.isExhausted()).toBe(true);
  });

  it("sound 追加序号并截断到 32 条", () => {
    const state = makeState();
    const ctx = createContext(state, { rng: createSeededRng(5) });
    for (let i = 0; i < 40; i++) ctx.sound("hit");
    expect(state.soundQueue).toHaveLength(32);
    const last = state.soundQueue[state.soundQueue.length - 1];
    expect(last.seq).toBe(40);
    expect(last.type).toBe("hit");
  });

  it("turn 未接线时给出明确错误,接线后可用", () => {
    const state = makeState();
    const ctx = createContext(state, { rng: createSeededRng(6) });
    expect(() => ctx.turn.pass()).toThrow(/尚未接线/);
    ctx.attachEngine({ pass: () => "passed", extra: () => "extra", next: () => "next" });
    expect(ctx.turn.pass()).toBe("passed");
    ctx.turn.suspend("elimination");
    expect(state.turn.suspend).toBe("elimination");
    ctx.turn.resync();
    expect(state.turn.resync).toBe(true);
  });

  it("ask 写入 pending 并同步 step", () => {
    const state = makeState();
    const ctx = createContext(state, { rng: createSeededRng(7) });
    ctx.ask({ type: "target", purpose: "attack", asker: 1, options: [2], data: null });
    expect(state.step).toBe(STEP.ATTACK_SHOW_CARD);
    ctx.clearPending();
    expect(state.step).toBe(STEP.PICK_ACTION);
  });
});
