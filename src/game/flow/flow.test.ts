import { describe, it, expect } from "vitest";

import { createSession, dispatch } from "../api.js";
import { buildView } from "../view.js";
import { createClassicMode } from "../modes/classic.js";
import type { GameState } from "../types.js";

function session(
  chars: number[],
  { weather = false, startRound = 5 }: { weather?: boolean; startRound?: number } = {},
): GameState {
  const { state } = createSession({
    chars,
    weather,
    startRound,
    mode: createClassicMode(),
  });
  state.phase = "normal";
  return state;
}

const view = (state: GameState) => buildView(state);

describe("KB-9 菜月昴:同一回合只能存一次档(AI/UI 口径)", () => {
  it("存档后 view.canUseSkill 变 false,新回合恢复", () => {
    const state = session([11, 11, 11, 11]);
    const first = view(state).currentPlayer()!;
    expect(first.canUseSkill).toBe(true);

    // 释放技能 → 选择存档
    expect(dispatch(state, { type: "skill" })).toBe(true);
    expect(state.step).toBe("caiyueangPick");
    dispatch(state, { type: "skillAnswer", answer: { choice: "save" } });

    // 存档不结束回合:还是同一个人,但不能再存
    expect(state.currentPlayerIndex).toBe(first.index);
    expect(view(state).currentPlayer()!.canUseSkill).toBe(false);

    // 引擎口径仍允许(保证差分回放);UI/AI 靠 canUseSkill 拦截
    expect(dispatch(state, { type: "skill" })).toBe(true);
    dispatch(state, { type: "cancel" });

    // 过一回合(4 人局:自己 + 另外三人各防一次)后恢复
    dispatch(state, { type: "defense" });
    dispatch(state, { type: "defense" });
    dispatch(state, { type: "defense" });
    dispatch(state, { type: "defense" });
    const back = view(state).currentPlayer()!;
    expect(back.uid).toBe(first.uid);
    expect(back.canUseSkill).toBe(true);
  });
});

describe("KB-8 牌库+墓地双空:重新生成牌库", () => {
  it("按开局副数补牌,并能继续防御", () => {
    const state = session([1, 2, 3, 4]);
    // 把所有牌塞进防御区(模拟长防御局)
    const all = [...state.deck, ...state.grave];
    state.deck = [];
    state.grave = [];
    state.players[0].defensePile.push(...all);
    expect(state.deckCount).toBe(2);

    expect(dispatch(state, { type: "defense" })).toBe(true);
    expect(state.deck.length).toBe(104 - 1); // 补 2 副后抽走 1 张
    expect(state.messageLog.some((m) => m.includes("牌库耗尽"))).toBe(true);
    expect(state.players[0].defensePile.length).toBe(all.length + 1);
  });

  it("攻击也能在耗尽后继续", () => {
    const state = session([1, 2, 3, 4]);
    const all = [...state.deck];
    state.deck = [];
    state.grave = [];
    state.players[0].defensePile.push(...all);

    expect(dispatch(state, { type: "attack" })).toBe(true);
    expect(state.step).toBe("attackShowCard");
  });
});

describe("KB-10 读档后存档点保留", () => {
  it("连续读档两次,次数递减且存档点仍在", () => {
    const state = session([11, 1, 2, 3]);
    // 存档
    dispatch(state, { type: "skill" });
    dispatch(state, { type: "skillAnswer", answer: { choice: "save" } });
    const me = state.players[state.currentPlayerIndex];
    expect(me.effects.savepoint).toBeTruthy();
    expect(me.resources.loadUses).toBe(3);

    // 第一次读档(引擎允许同回合再开技能)
    dispatch(state, { type: "skill" });
    dispatch(state, { type: "skillAnswer", answer: { choice: "load" } });
    const after1 = state.players.find((p) => p.uid === me.uid)!;
    expect(after1.resources.loadUses).toBe(2);
    expect(after1.effects.savepoint).toBeTruthy();

    // 第二次读档仍可用
    dispatch(state, { type: "skill" });
    dispatch(state, { type: "skillAnswer", answer: { choice: "load" } });
    const after2 = state.players.find((p) => p.uid === me.uid)!;
    expect(after2.resources.loadUses).toBe(1);
    expect(after2.effects.savepoint).toBeTruthy();
  });
});

describe("KB-3 技能门槛:UI 口径与引擎口径分离", () => {
  it("温迪第 5 回合:按钮置灰,但引擎仍会给出拒绝日志", () => {
    const state = session([1, 11, 11, 11], { startRound: 5 });
    const p = view(state).currentPlayer()!;
    expect(p.characterId).toBe(1);
    expect(p.canUseSkill).toBe(false); // 第 10 回合才解锁

    const logsBefore = state.messageLog.length;
    dispatch(state, { type: "skill" }); // 引擎口径:允许调 use(),由 use() 拒绝
    expect(state.messageLog.length).toBeGreaterThan(logsBefore);
    expect(state.messageLog.at(-1)).toBe("第10回合后才能使用");
    expect(state.pending).toBeNull();
  });

  it("芙宁娜第 3 回合置灰,第 4 回合可用", () => {
    const early = session([5, 11, 11, 11], { startRound: 3 });
    expect(view(early).currentPlayer()!.canUseSkill).toBe(false);

    const ok = session([5, 11, 11, 11], { startRound: 4 });
    expect(view(ok).currentPlayer()!.canUseSkill).toBe(true);
  });

  it("菜月昴不受回合门槛限制", () => {
    const state = session([11, 1, 2, 3], { startRound: 1 });
    expect(view(state).currentPlayer()!.canUseSkill).toBe(true);
  });
});
