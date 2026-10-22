import { describe, it, expect } from "vitest";

import { STEP } from "../core/constants.js";
import { createGameState } from "./setup.js";
import type { Pending, PendingType } from "../types.js";
import {
  PENDING,
  askTarget,
  clearPending,
  createPending,
  isAsking,
  isValidAnswer,
  setPending,
  stepOf,
} from "./pending.js";

/** stepOf 只看 type/purpose；这里给出完整 Pending（asker/options/data 用默认值） */
function pendingOf(type: PendingType, purpose = ""): Pending {
  return { type, purpose, asker: 0, options: [], data: null };
}

describe("flow/pending", () => {
  it("pending → 旧 step 字符串的映射表", () => {
    expect(stepOf(null)).toBe(STEP.PICK_ACTION);
    expect(stepOf(pendingOf(PENDING.ACTION))).toBe(STEP.PICK_ACTION);
    expect(stepOf(pendingOf(PENDING.GAMBLE))).toBe(STEP.GAMBLE_PICK);
    expect(stepOf(pendingOf(PENDING.SCRY))).toBe(STEP.SKILL_NAHIDA);
    expect(stepOf(pendingOf(PENDING.LINIYA))).toBe(STEP.LINIYA_PICK);
    expect(stepOf(pendingOf(PENDING.SAVE_OR_LOAD))).toBe(STEP.CAIYUEANG_PICK);
    expect(stepOf(pendingOf(PENDING.TARGET, "attack"))).toBe(
      STEP.ATTACK_SHOW_CARD,
    );
    expect(stepOf(pendingOf(PENDING.TARGET, "ally"))).toBe(
      STEP.ALLY_PICK,
    );
    expect(
      stepOf(pendingOf(PENDING.TARGET, "skill:aimiliya.freeze")),
    ).toBe(STEP.SKILL_PICK_TARGET);
  });

  it("三个旧路由 flag 的消歧信息都落在 purpose 里", () => {
    const p1 = askTarget({ asker: 0, purpose: "skill:furina", options: [1, 2] });
    const p2 = askTarget({
      asker: 0,
      purpose: "skill:aimiliya.freeze",
      options: [1],
    });
    const p3 = askTarget({ asker: 0, purpose: "skill:fenjin", options: [1, 3] });
    expect([p1.purpose, p2.purpose, p3.purpose]).toEqual([
      "skill:furina",
      "skill:aimiliya.freeze",
      "skill:fenjin",
    ]);
    expect(stepOf(p1)).toBe(stepOf(p2));
    expect(stepOf(p2)).toBe(stepOf(p3));
  });

  it("setPending 同步派生 step,clearPending 复位", () => {
    const state = createGameState();
    setPending(
      state,
      createPending({ type: PENDING.SCRY, purpose: "skill:nahida", asker: 0 }),
    );
    expect(state.step).toBe(STEP.SKILL_NAHIDA);
    expect(state.pending?.type).toBe(PENDING.SCRY);
    clearPending(state);
    expect(state.step).toBe(STEP.PICK_ACTION);
    expect(state.pending).toBeNull();
  });

  it("作答者与选项校验", () => {
    const state = createGameState();
    setPending(state, askTarget({ asker: 5, purpose: "attack", options: [1, 2] }));
    expect(isAsking(state, 5)).toBe(true);
    expect(isAsking(state, 1)).toBe(false);
    expect(isValidAnswer(state, 1)).toBe(true); // 目标是合法答案
    expect(isValidAnswer(state, 5)).toBe(false); // 发起者自己不在可选目标内
    expect(isValidAnswer(state, 9)).toBe(false);
  });

  it("无选项约束时任意作答都允许(赌命/排序)", () => {
    const state = createGameState();
    setPending(
      state,
      createPending({ type: PENDING.GAMBLE, purpose: "gamble", asker: 2 }),
    );
    expect(isValidAnswer(state, 2)).toBe(true);
    expect(isValidAnswer(state, 99)).toBe(true);
  });

  it("pending 可 JSON 序列化(存档前提)", () => {
    const p = askTarget({
      asker: 1,
      purpose: "skill:liniya",
      options: [0, 2],
      data: { subSkill: 1 },
    });
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});
