import { describe, it, expect, vi } from "vitest";
import { createUniState, rollNormalChoice } from "./uniState.js";
import { applyEventOption } from "./uniEvents.js";

describe("debug 日志深度", () => {
  it("事件日志 fx 数值不被 [深度限制] 截断", () => {
    const s = createUniState();
    const spy = vi.spyOn(console, "info");
    applyEventOption(s, "old_blacksmith", 0); // 老铁匠 A：defenseCards: 4
    const logs = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logs).not.toContain("[深度限制]");
    expect(logs).toContain('"defenseCards":4');
    spy.mockRestore();
  });
});
