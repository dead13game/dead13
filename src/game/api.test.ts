import { describe, it, expect } from "vitest";

import { createSession, dispatch, save, load } from "./api.js";
import { buildView } from "./view.js";
import { createClassicMode } from "./modes/classic.js";
import { firstDiff } from "./testing/compare.js";
import { projectNext } from "./testing/projection-next.js";
import { createGameState } from "./flow/setup.js";

function newSession(chars = [1, 2, 6, 9], weather = false) {
  const { state, ctx } = createSession({
    chars,
    weather,
    mode: createClassicMode(),
  });
  return { state, ctx, view: buildView(state) };
}

describe("api/view — UI 接线契约", () => {
  it("session 建好后 view 可读且 step 为行动步", () => {
    const { view } = newSession();
    expect(view.players).toHaveLength(4);
    expect(view.step).toBe("pickAction");
    expect(view.phase).toBe("peace");
    expect(view.currentPlayer()).toBeTruthy();
    expect(view.currentPlayer()!.name).toMatch(/^玩家 /);
    expect(typeof view.canUseSkill(view.players[0])).toBe("boolean");
    expect(view.CHARACTERS[1].name).toBe("温迪");
  });

  it("dispatch 是唯一写入口,view 反映最新状态", () => {
    const { state, view } = newSession();
    const logsBefore = view.messageLog.length;

    expect(dispatch(state, { type: "defense" })).toBe(true);
    const fresh = buildView(state);
    expect(fresh.messageLog.length).toBeGreaterThan(logsBefore);
    expect(fresh.players.some((p) => p.defensePile.length > 0)).toBe(true);
  });

  it("和平期攻击会被内核对拒绝(不抛异常)", () => {
    const { state } = newSession();
    expect(dispatch(state, { type: "attack" })).toBe(false);
    expect(state.pending).toBeNull();
  });

  it("取消命令清空待决,不再残留路由标记", () => {
    const { state, ctx } = newSession();
    state.phase = "normal";
    state.round = 5;
    state.deck.push({ id: "F-K", rank: "K", suit: "♠", value: 13, faceUp: false });
    expect(dispatch(state, { type: "attack" })).toBe(true);
    expect(state.step).toBe("attackShowCard");

    dispatch(state, { type: "cancel" });
    expect(state.pending).toBeNull();
    expect(state.step).toBe("pickAction");
    expect(state.pendingAttackCard).toBeNull();
    void ctx;
  });

  it("view 的玩家字段是内核字段的映射(不是第二份真相)", () => {
    const { state, view } = newSession();
    const raw = state.players[0];
    const pv = view.players.find((p) => p.uid === raw.uid)!;
    expect(pv.skillUses).toBe(raw.resources.skillUses);
    expect(pv.holyWordUses).toBe(raw.resources.holyWordUses);
    expect(pv.artifactId).toBe(raw.artifact.id);
    expect(pv.isAI).toBe(raw.ai.enabled);
    expect(pv.statusEffects.ignoreTrapThisTurn).toBe(
      raw.effects.ignoreTrapThisTurn,
    );
    expect(pv.charData!.id).toBe(raw.characterId);
  });

  it("api.save / api.load 往返后 view 一致", () => {
    const { state } = newSession([1, 2, 6, 9], true);
    dispatch(state, { type: "defense" });
    dispatch(state, { type: "defense" });

    const data = JSON.parse(JSON.stringify(save(state)));
    const restored = createGameState();
    const ok = load(restored, data, {
      modeFactory: () => createClassicMode(),
    });
    expect(ok).toBe(true);

    const diff = firstDiff(projectNext(state), projectNext(restored), "$");
    expect(diff, diff ? `${diff.path}: ${diff.reason}` : "").toBeNull();

    // 读档后可以继续下达命令
    expect(dispatch(restored, { type: "defense" })).toBe(true);
  });
});
