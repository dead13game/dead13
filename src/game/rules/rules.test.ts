import { describe, it, expect, vi } from "vitest";

import { STEP } from "../core/constants.js";
import { createPlayer } from "../core/player.js";
import { createSeededRng } from "../core/rng.js";
import { createContext } from "../flow/context.js";
import { createDeck } from "../core/cards.js";
import type {
  CharState,
  Ctx,
  GameState,
  LeagueContext,
  ModeAdapter,
  Player,
  Rng,
  WeatherId,
} from "../types.js";

import {
  ATTACK_MODIFIERS,
  DEFENSE_MODIFIERS,
  POST_TRAP_MODIFIERS,
  collectModifiers,
  reduceModifiers,
} from "./modifiers.js";
import { applyDamage, dissolveAlliance } from "./damage.js";
import { resolveTrap } from "./trap.js";
import { formAlliance, splitAllianceDamage } from "./alliance.js";
import { setupWeatherDeck, drawWeather } from "./weather.js";

const META = (hp: number) => ({ hp, maxUses: 3, loadMaxUses: 0 });

interface MakeCtxOptions {
  weather?: WeatherId | null;
  useWeather?: boolean;
  leagueContext?: LeagueContext | null;
  mode?: ModeAdapter | null;
  rng?: Rng;
}

function makeCtx(opts: MakeCtxOptions = {}): Ctx {
  const state: GameState = {
    players: [],
    towers: [],
    summons: [],
    unitSeq: 1,
    drawFeed: [],
    drawSeq: 0,
    currentPlayerIndex: 0,
    deck: createDeck(),
    grave: [],
    messageLog: [],
    soundQueue: [],
    soundSeq: 0,
    idSeq: 1,
    round: 5,
    peaceRounds: 0,
    peaceStartRound: 0,
    phase: "normal",
    step: STEP.PICK_ACTION,
    pending: null,
    pendingAttackCard: null,
    pendingVentiCards: null,
    scryCards: null,
    pendingGamble: null,
    turn: { extraAction: false, suspend: null, resync: false, savedBy: null },
    gameOver: false,
    winnerIndex: -1,
    currentWeather: opts.weather ?? null,
    nextWeather: null,
    useWeather: opts.useWeather ?? false,
    weatherDeck: [],
    leagueContext: opts.leagueContext ?? null,
    mode: opts.mode ?? null,
  };
  return createContext(state, { rng: opts.rng ?? createSeededRng(1) });
}

interface AddPlayerOptions {
  uid: number;
  characterId?: number;
  hp?: number;
  char?: CharState;
  teamId?: number;
  name?: string;
}

function addPlayer(ctx: Ctx, opts: AddPlayerOptions): Player {
  const {
    uid,
    characterId = 1,
    hp = 11,
    char = {},
    teamId = -1,
    name,
  } = opts;
  const p = createPlayer({
    uid,
    index: ctx.state.players.length,
    characterId,
    meta: META(hp),
    teamId,
    name,
  });
  Object.assign(p.char, char);
  ctx.state.players.push(p);
  return p;
}

describe("rules/modifiers — 顺序即规则", () => {
  it("攻击加法群按 priority 依次生效,日志顺序一致", () => {
    const ctx = makeCtx({ weather: "sun" });
    const a = addPlayer(ctx, { uid: 1, hp: 12, characterId: 6, char: { fightingSpirit: 3 } });
    const t = addPlayer(ctx, { uid: 2 });
    addPlayer(ctx, { uid: 3 }); // 盟友
    a.relations.allyUid = 3;
    a.relations.allianceTurns = 5;
    t.relations.betrayalPenalty = 2;

    const env = { source: a, target: t, trapTriggered: false, besieged: false };
    const { total, steps } = reduceModifiers(
      ctx,
      5,
      collectModifiers(ATTACK_MODIFIERS),
      env,
    );

    expect(total).toBe(14); // 5 +2烈日 +3斗志 +2联盟 +2背刺
    expect(steps.map((s) => s.id)).toEqual([
      "weather.sun",
      "spirit",
      "ally.attack",
      "betrayal.penalty",
    ]);
    expect(ctx.state.messageLog).toEqual([
      "烈日当空",
      "斗志 3层",
      "联盟攻击+2",
      "惩罚背刺者+2",
    ]);
  });

  it("v3.5：圣遗物在陷阱判定前、围攻在陷阱后:13 → 20 → 10", () => {
    const ctx = makeCtx();
    const a = addPlayer(ctx, { uid: 1, hp: 12 });
    const t = addPlayer(ctx, { uid: 2 });
    a.artifact.id = 1;
    a.artifact.active = true;

    const env = { source: a, target: t, trapTriggered: false, besieged: true };
    const pre = reduceModifiers(
      ctx,
      13,
      collectModifiers(ATTACK_MODIFIERS),
      env,
    );
    expect(pre.total).toBe(20); // 13 × 1.5 = 19.5 → ceil 20
    const post = reduceModifiers(
      ctx,
      pre.total,
      collectModifiers(POST_TRAP_MODIFIERS),
      env,
    );
    expect(post.total).toBe(10);
    expect(ctx.state.messageLog).toEqual([
      "角斗士的终幕礼 +7",
      "围攻减半：20 → 10 点",
    ]);
  });

  it("围攻减半独立于圣遗物（陷阱后只跑 POST_TRAP）", () => {
    const ctx = makeCtx();
    const a = addPlayer(ctx, { uid: 1, hp: 12 });
    const t = addPlayer(ctx, { uid: 2 });
    a.artifact.id = 1;
    a.artifact.active = true;

    const env = { source: a, target: t, trapTriggered: true, besieged: true };
    const { total } = reduceModifiers(
      ctx,
      13,
      collectModifiers(POST_TRAP_MODIFIERS),
      env,
    );
    expect(total).toBe(7); // ceil(13/2)
    expect(ctx.state.messageLog).toEqual(["围攻减半：13 → 7 点"]);
  });

  it("防御管道:黑市 +2、联赛 +4、满月 +3、联盟 +2(只有联盟写日志)", () => {
    const ctx = makeCtx({
      weather: "trade",
      leagueContext: {
        round: 1,
        cardBonus: { 0: { attackBonus: 1, defenseBonus: 4 } },
      },
    });
    const p = addPlayer(ctx, { uid: 1, characterId: 7, char: { moonPhase: 1 }, teamId: 0 });
    addPlayer(ctx, { uid: 2 });
    p.relations.allyUid = 2;
    p.relations.allianceTurns = 5;

    const env = { source: p, target: null };
    const { total } = reduceModifiers(ctx, 5, collectModifiers(DEFENSE_MODIFIERS), env);
    expect(total).toBe(16); // 5 +2 +4 +3 +2
    expect(ctx.state.messageLog).toEqual(["联盟防御+2"]);
  });

  it("角色自定义管道按 priority 插入,不改基础顺序", () => {
    const base = collectModifiers(ATTACK_MODIFIERS);
    const withExtra = collectModifiers(ATTACK_MODIFIERS, [
      { id: "char.custom", priority: 45, apply: (c, e, v) => v + 1 },
    ]);
    const ids = withExtra.map((m) => m.id);
    expect(ids.indexOf("char.custom")).toBe(ids.indexOf("spirit") + 1);
    expect(base.map((m) => m.id)).not.toContain("char.custom");
  });
});

describe("rules/damage — 防御消耗与死亡", () => {
  it("防御牌吸收伤害:大牌只掉防御值,不掉血", () => {
    const ctx = makeCtx();
    const t = addPlayer(ctx, { uid: 1, hp: 11 });
    t.defensePile.push({ id: "d1", value: 12, faceUp: false });

    const r = applyDamage(ctx, { target: t, amount: 10 });
    expect(r.absorbed).toBe(10);
    expect(r.remaining).toBe(0);
    expect(t.hp).toBe(11);
    expect(t.defensePile[0].defenseValue).toBe(2);
    expect(ctx.state.messageLog).toContain("玩家 1 残盾 2点");
  });

  it("防御牌被击穿:扣掉全部剩余并进墓地", () => {
    const ctx = makeCtx();
    const t = addPlayer(ctx, { uid: 1, hp: 11 });
    t.defensePile.push({ id: "d1", value: 4, rank: "4", suit: "♠", faceUp: false });

    const r = applyDamage(ctx, { target: t, amount: 10 });
    expect(r.absorbed).toBe(4);
    expect(r.remaining).toBe(6);
    expect(r.hpDelta).toBe(-6);
    expect(t.hp).toBe(5);
    expect(t.defensePile).toHaveLength(0);
    expect(ctx.state.grave.map((c) => c.id)).toEqual(["d1"]);
    expect(ctx.state.messageLog).toContain("玩家 1 防御牌 4♠ 被击穿");
  });

  it("防护牌残盾:defenseValue 递减且牌留在场上", () => {
    const ctx = makeCtx();
    const t = addPlayer(ctx, { uid: 1, hp: 11 });
    t.defensePile.push({ id: "s1", value: 12, defenseValue: 10, faceUp: true, isShield: true });

    const r = applyDamage(ctx, { target: t, amount: 4 });
    expect(r.absorbed).toBe(4);
    expect(t.hp).toBe(11);
    expect(t.defensePile[0].defenseValue).toBe(6);
    expect(ctx.state.messageLog).toContain("玩家 1 残盾 6点");
    expect(ctx.state.grave).toHaveLength(0); // 护盾牌不入墓
  });

  it("致死触发死亡处理:入墓、解散联盟、通知模式", () => {
    const onPlayerDeath = vi.fn();
    const ctx = makeCtx({
      mode: { id: "test", rules: {}, onPlayerDeath, checkGameOver: vi.fn() },
    });
    const t = addPlayer(ctx, { uid: 1, hp: 3 });
    const ally = addPlayer(ctx, { uid: 2 });
    addPlayer(ctx, { uid: 3 });
    formAlliance(ctx, t, ally);
    t.trap = { id: "trap1", value: 5, faceUp: false };
    t.bait = { id: "bait1", value: 6, faceUp: true };

    const r = applyDamage(ctx, { target: t, amount: 5 });
    expect(r.died).toBe(true);
    expect(t.alive).toBe(false);
    expect(t.hp).toBe(0);
    expect(t.trap).toBeNull();
    expect(t.relations.allyUid).toBeNull();
    expect(ally.relations.allyUid).toBeNull();
    expect(onPlayerDeath).toHaveBeenCalledOnce();
    expect(ctx.state.grave.map((c) => c.id).sort()).toEqual(["bait1", "trap1"]);
  });

  it("赌命惩罚让伤害 +1", () => {
    const ctx = makeCtx();
    const t = addPlayer(ctx, { uid: 1, hp: 11 });
    t.relations.gamblePenalty = true;
    const r = applyDamage(ctx, { target: t, amount: 3 });
    expect(r.hpDelta).toBe(-4);
    expect(t.hp).toBe(7);
  });
});

describe("rules/trap — 三态", () => {
  it("反弹:攻击值 < 陷阱值,攻击者受伤", () => {
    const ctx = makeCtx();
    const a = addPlayer(ctx, { uid: 1, hp: 20 });
    const t = addPlayer(ctx, { uid: 2, hp: 11 });
    t.trap = { id: "T13", value: 13, faceUp: false };
    t.bait = { id: "B1", value: 9, faceUp: true };

    const r = resolveTrap(ctx, { attacker: a, target: t, value: 5 });
    expect(r.outcome).toBe("reflect");
    expect(a.hp).toBe(7);
    expect(t.trap).toBeNull();
    expect(ctx.state.grave.map((c) => c.id).sort()).toEqual(["B1", "T13"]);
    expect(ctx.state.soundQueue.map((s) => s.type)).toContain("trap_reflect");
  });

  it("平局:双方各受陷阱伤害,击破计数 +2", () => {
    const ctx = makeCtx();
    const a = addPlayer(ctx, { uid: 1, hp: 20 });
    const t = addPlayer(ctx, { uid: 2, hp: 20 });
    a.artifact.id = 1;
    t.trap = { id: "T7", value: 7, faceUp: false };

    const r = resolveTrap(ctx, { attacker: a, target: t, value: 7 });
    expect(r.outcome).toBe("tie");
    expect(a.hp).toBe(13);
    expect(t.hp).toBe(13);
    expect(a.resources.breakCount).toBe(2);
  });

  it("击破:陷阱入墓,攻击值继续走后续结算", () => {
    const ctx = makeCtx();
    const a = addPlayer(ctx, { uid: 1, hp: 20, characterId: 6 });
    const t = addPlayer(ctx, { uid: 2, hp: 20 });
    t.trap = { id: "T5", value: 5, faceUp: false };

    const r = resolveTrap(ctx, { attacker: a, target: t, value: 13 });
    expect(r.outcome).toBe("break");
    expect(a.char.fightingSpirit).toBe(1); // 玛薇卡击破陷阱 +1 斗志
    expect(ctx.state.grave.map((c) => c.id)).toEqual(["T5"]);
    expect(t.hp).toBe(20); // 陷阱只负责判定,本体伤害由调用方结算
  });

  it("ignoreTrapThisTurn 时陷阱不触发", () => {
    const ctx = makeCtx();
    const a = addPlayer(ctx, { uid: 1, hp: 20 });
    const t = addPlayer(ctx, { uid: 2, hp: 20 });
    a.effects.ignoreTrapThisTurn = true;
    t.trap = { id: "T13", value: 13, faceUp: false };

    expect(resolveTrap(ctx, { attacker: a, target: t, value: 5 }).outcome).toBe("none");
    expect(t.trap).not.toBeNull();
  });
});

describe("rules/alliance — 平摊与解散", () => {
  it("(13-2)/3:盟友 3,目标 8", () => {
    const ctx = makeCtx();
    const attacker = addPlayer(ctx, { uid: 9 });
    const t = addPlayer(ctx, { uid: 1 });
    const ally = addPlayer(ctx, { uid: 2 });
    formAlliance(ctx, t, ally);

    const split = splitAllianceDamage(ctx, { attacker, target: t, value: 13 });
    expect(split?.value).toBe(8);
    expect(split?.allyValue).toBe(3);
    expect(split?.ally.uid).toBe(2);
    expect(ctx.state.messageLog.at(-1)).toBe("联盟平摊：玩家 2 8点, 玩家 3 3点");
  });

  it("攻击者就是盟友时不触发平摊", () => {
    const ctx = makeCtx();
    const t = addPlayer(ctx, { uid: 1 });
    const ally = addPlayer(ctx, { uid: 2 });
    formAlliance(ctx, t, ally);
    expect(
      splitAllianceDamage(ctx, { attacker: ally, target: t, value: 13 }),
    ).toBeNull();
  });

  it("dissolveAlliance 双向清理", () => {
    const ctx = makeCtx();
    const a = addPlayer(ctx, { uid: 1 });
    const b = addPlayer(ctx, { uid: 2 });
    formAlliance(ctx, a, b);
    dissolveAlliance(ctx, a);
    expect(a.relations.allyUid).toBeNull();
    expect(b.relations.allyUid).toBeNull();
    expect(b.relations.allianceTurns).toBe(0);
  });
});

describe("rules/weather — 牌堆轮转", () => {
  it("v3.5 固定顺序：6 张循环，抽取后轮转到牌底", () => {
    const ctx = makeCtx({ useWeather: true });
    setupWeatherDeck(ctx);
    expect(ctx.state.weatherDeck).toHaveLength(6);
    expect(ctx.state.weatherDeck.map((w) => w.id)).toEqual([
      "sun",
      "rain",
      "wind",
      "trade",
      "arms",
      "calm",
    ]);

    const first = drawWeather(ctx);
    expect(first).toBe("sun");
    expect(ctx.state.currentWeather).toBe("sun");
    expect(ctx.state.weatherDeck).toHaveLength(6);
    expect(ctx.state.weatherDeck.at(-1)?.id).toBe(first);
    expect(ctx.state.nextWeather).toBe("rain");

    expect(drawWeather(ctx)).toBe("rain");
    expect(drawWeather(ctx)).toBe("wind");
    expect(drawWeather(ctx)).toBe("trade");
    expect(drawWeather(ctx)).toBe("arms");
    expect(drawWeather(ctx)).toBe("calm");
    expect(drawWeather(ctx)).toBe("sun");
  });

  it("未启用天气时不抽牌", () => {
    const ctx = makeCtx({ useWeather: false });
    setupWeatherDeck(ctx);
    expect(drawWeather(ctx)).toBeNull();
    expect(ctx.state.currentWeather).toBeNull();
  });
});
