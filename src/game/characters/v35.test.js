import { describe, it, expect } from "vitest";

import { createContext } from "../flow/context.js";
import { createPlayer } from "../core/player.js";
import { createSeededRng } from "../core/rng.js";
import { createDeck } from "../core/cards.js";
import { STEP } from "../core/constants.js";
import { applyDamage } from "../rules/damage.js";
import { CHARACTERS } from "./index.js";
import shalang from "./shalangbaizi.js";
import juxueli from "./juxueli.js";
import woyanisha from "./woyanisha.js";
import weisina from "./weisina.js";

function makeCtx() {
  const state = {
    players: [],
    towers: [],
    summons: [],
    unitSeq: 0,
    currentPlayerIndex: 0,
    deck: createDeck(),
    grave: [],
    messageLog: [],
    soundQueue: [],
    soundSeq: 0,
    round: 5,
    phase: "normal",
    step: STEP.PICK_ACTION,
    pending: null,
    turn: { extraAction: false, suspend: null, resync: false },
    gameOver: false,
    currentWeather: null,
    nextWeather: null,
    useWeather: false,
    weatherDeck: [],
    mode: { rules: {} },
  };
  const ctx = createContext(state, { rng: createSeededRng(1) });
  ctx.attachEngine({ pass() {}, extra() {}, next() {} });
  return ctx;
}

function addHero(ctx, { uid, characterId, char = {} }) {
  const meta = CHARACTERS[characterId];
  const p = createPlayer({
    uid,
    index: ctx.state.players.length,
    characterId,
    meta,
    charState: { ...meta.stateSchema, ...char },
  });
  ctx.state.players.push(p);
  return p;
}

describe("v3.5 新角色 — 砂狼白子", () => {
  it("部署无人机并指定目标；无人机在主人行动时造成 3 点伤害", () => {
    const ctx = makeCtx();
    const bai = addHero(ctx, { uid: 1, characterId: 13 });
    const target = addHero(ctx, { uid: 2, characterId: 1 });
    target.hp = 20;

    shalang.onAnswer(
      ctx,
      bai,
      { purpose: "skill:shalang.summon" },
      target.uid,
    );
    expect(ctx.state.summons).toHaveLength(1);
    const drone = ctx.state.summons[0];
    expect(drone.hp).toBe(5);
    expect(drone.maxHp).toBe(5);
    expect(drone.kind).toBe("drone");
    expect(drone.char.targetUid).toBe(target.uid);

    shalang.hooks.onTurnStart(ctx, bai);
    expect(target.hp).toBe(17);
  });

  it("无人机吃天气与圣遗物：(3+2)×1.5 向上取整 = 8", () => {
    const ctx = makeCtx();
    const bai = addHero(ctx, { uid: 1, characterId: 13 });
    const target = addHero(ctx, { uid: 2, characterId: 1 });
    target.hp = 30;
    bai.artifact.id = 1;
    bai.artifact.active = true;
    ctx.state.currentWeather = "sun";

    shalang.onAnswer(ctx, bai, { purpose: "skill:shalang.summon" }, target.uid);
    shalang.hooks.onTurnStart(ctx, bai);
    expect(target.hp).toBe(22); // 30 - 8
  });

  it("白子防御时无人机也获得一张防御牌", () => {
    const ctx = makeCtx();
    const bai = addHero(ctx, { uid: 1, characterId: 13 });
    const target = addHero(ctx, { uid: 2, characterId: 1 });
    shalang.onAnswer(ctx, bai, { purpose: "skill:shalang.summon" }, target.uid);
    const drone = ctx.state.summons[0];
    ctx.state.deck.push({ id: "D-9", rank: "9", suit: "♠", value: 9 });

    shalang.hooks.onDefense(ctx, bai);
    expect(drone.defensePile).toHaveLength(1);
    expect(drone.defensePile[0].ownerUid).toBe(bai.uid);
  });

  it("主人阵亡 → 无人机一起消失", () => {
    const ctx = makeCtx();
    const bai = addHero(ctx, { uid: 1, characterId: 13 });
    const target = addHero(ctx, { uid: 2, characterId: 1 });
    shalang.onAnswer(ctx, bai, { purpose: "skill:shalang.summon" }, target.uid);
    const drone = ctx.state.summons[0];

    applyDamage(ctx, { target: bai, amount: 99 });
    expect(drone.alive).toBe(false);
  });

  it("原目标死亡后自动改打防御值最低的敌人", () => {
    const ctx = makeCtx();
    const bai = addHero(ctx, { uid: 1, characterId: 13 });
    const first = addHero(ctx, { uid: 2, characterId: 1 });
    const lowDef = addHero(ctx, { uid: 3, characterId: 2 });
    first.hp = 20;
    lowDef.hp = 20;
    lowDef.defensePile.push({ id: "d1", value: 1, faceUp: false });

    shalang.onAnswer(ctx, bai, { purpose: "skill:shalang.summon" }, first.uid);
    first.alive = false;
    shalang.hooks.onTurnStart(ctx, bai);
    expect(ctx.state.summons[0].char.targetUid).toBe(lowDef.uid);
    expect(lowDef.hp).toBeLessThan(20);
  });
});

describe("v3.5 新角色 — 菊雪梨", () => {
  it("猜中：拆除陷阱并造成 20 点伤害", () => {
    const ctx = makeCtx();
    const ju = addHero(ctx, { uid: 1, characterId: 14 });
    const target = addHero(ctx, { uid: 2, characterId: 1 });
    target.hp = 30;
    target.trap = { id: "T7", value: 7, faceUp: false };

    juxueli.onAnswer(
      ctx,
      ju,
      { purpose: "investigate:guess", data: { targetUid: target.uid } },
      7,
    );
    expect(target.hp).toBe(10);
    expect(target.trap).toBeNull();
  });

  it("猜错：无事发生，陷阱保留", () => {
    const ctx = makeCtx();
    const ju = addHero(ctx, { uid: 1, characterId: 14 });
    const target = addHero(ctx, { uid: 2, characterId: 1 });
    target.hp = 30;
    target.trap = { id: "T7", value: 7, faceUp: false };

    juxueli.onAnswer(
      ctx,
      ju,
      { purpose: "investigate:guess", data: { targetUid: target.uid } },
      5,
    );
    expect(target.hp).toBe(30);
    expect(target.trap?.value).toBe(7);
  });

  it("烈日当空 +2；围攻减半向上取整", () => {
    const ctx = makeCtx();
    const ju = addHero(ctx, { uid: 1, characterId: 14 });
    const target = addHero(ctx, { uid: 2, characterId: 1 });
    target.hp = 30;
    target.trap = { id: "T7", value: 7, faceUp: false };
    ctx.state.currentWeather = "sun";

    juxueli.onAnswer(
      ctx,
      ju,
      {
        purpose: "investigate:guess",
        data: { targetUid: target.uid, besieged: true },
      },
      7,
    );
    expect(target.hp).toBe(19); // (20+2)/2 = 11
  });

  it("战报不暴露陷阱点数", () => {
    const ctx = makeCtx();
    const ju = addHero(ctx, { uid: 1, characterId: 14 });
    const target = addHero(ctx, { uid: 2, characterId: 1 });
    target.hp = 30;
    target.trap = { id: "T7", value: 7, faceUp: false };

    juxueli.onAnswer(
      ctx,
      ju,
      { purpose: "investigate:guess", data: { targetUid: target.uid } },
      5,
    );
    expect(ctx.state.messageLog.join("\n")).not.toContain("7点");
  });
});

describe("v3.5 新角色 — 沃雅妮莎", () => {
  it("执行防御 +1 领唱", () => {
    const ctx = makeCtx();
    const wo = addHero(ctx, { uid: 1, characterId: 15 });
    woyanisha.hooks.onDefense(ctx, wo);
    expect(wo.char.chorus).toBe(1);
  });

  it("自己的防御牌被击破 +1 领唱（给队友的牌也算自己的）", () => {
    const ctx = makeCtx();
    const wo = addHero(ctx, { uid: 1, characterId: 15 });
    const ally = addHero(ctx, { uid: 2, characterId: 1 });
    ally.hp = 20;
    ally.defensePile.push({
      id: "D4",
      rank: "4",
      suit: "♠",
      value: 4,
      ownerUid: wo.uid,
      faceUp: false,
    });

    applyDamage(ctx, { target: ally, amount: 10 });
    expect(wo.char.chorus).toBe(1);
    expect(ally.hp).toBe(14);
  });

  it("开大消耗全部领唱（单次最多 20），每层 1 点伤害", () => {
    const ctx = makeCtx();
    const wo = addHero(ctx, { uid: 1, characterId: 15 });
    const target = addHero(ctx, { uid: 2, characterId: 1 });
    target.hp = 50;
    wo.char.chorus = 30;

    woyanisha.onAnswer(ctx, wo, { purpose: "skill:woyanisha" }, target.uid);
    expect(target.hp).toBe(30);
    expect(wo.char.chorus).toBe(10);

    woyanisha.onAnswer(ctx, wo, { purpose: "skill:woyanisha" }, target.uid);
    expect(target.hp).toBe(20);
    expect(wo.char.chorus).toBe(0);
  });
});

describe("v3.5 新角色 — 薇斯纳", () => {
  const combo = weisina.attackModifiers[0];
  const env = (streak) => {
    const ctx = makeCtx();
    const p = addHero(ctx, { uid: 1, characterId: 16, char: { attackStreak: streak } });
    const t = addHero(ctx, { uid: 2, characterId: 1 });
    return { ctx, source: p, target: t };
  };

  it("第 3 次 ×1.5 向上取整", () => {
    const { ctx, source, target } = env(3);
    expect(combo.apply(ctx, { source, target }, 9)).toBe(14);
  });

  it("第 4 次 ×2，保底 15", () => {
    const { ctx, source, target } = env(4);
    expect(combo.apply(ctx, { source, target }, 6)).toBe(15);
    expect(combo.apply(ctx, { source, target }, 9)).toBe(18);
  });

  it("第 5 次及以后 ×3，保底 20", () => {
    const { ctx, source, target } = env(5);
    expect(combo.apply(ctx, { source, target }, 12)).toBe(36);
    expect(combo.apply(ctx, { source, target }, 5)).toBe(20);
    const { ctx: c2, source: s2, target: t2 } = env(9);
    expect(combo.apply(c2, { source: s2, target: t2 }, 5)).toBe(20);
  });

  it("前两次无加成", () => {
    const { ctx, source, target } = env(2);
    expect(combo.apply(ctx, { source, target }, 9)).toBe(9);
  });
});
