import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scan, UID_FIRST_LOOKUP } from "./scan.js";
import { unitByIndexOrUid } from "../core/units.js";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("G2 目标解析：index/uid 只有一处裁决", () => {
  it("core/units.js 导出 unitByIndexOrUid", () => {
    expect(typeof unitByIndexOrUid).toBe("function");
  });

  it("GameShell 走 unitByIndexOrUid，不自己写 uid 优先的查找", () => {
    const src = read("../../components/GameShell.vue");
    expect(src).toContain("unitByIndexOrUid(");

    const hits = scan(src, UID_FIRST_LOOKUP);
    if (hits.length) {
      throw new Error(
        "GameShell.vue 出现了「uid 优先」的目标查找：\n" +
          hits.map((h) => `  :${h.line}  ${h.text}`).join("\n") +
          "\n修复：改用 core/units.js 的 unitByIndexOrUid(state, indexOrUid)（index 优先）。\n" +
          "原因：ActionBar 传的是 index，玩家 uid=1/2/3… 会与 index 撞号，uid 优先会把敌人解析成自己。",
      );
    }
  });

  // ── 反例：证明护栏不是永远绿 ──
  it("反例：uid 优先的查找必须被扫出来", () => {
    const bad = "const u = players.find((p) => p.uid === indexOrUid);";
    expect(scan(bad, UID_FIRST_LOOKUP)).toHaveLength(1);
  });

  it("反例：index 优先的正常写法不应误报", () => {
    const ok = [
      "const a = unitByIndexOrUid(state, indexOrUid);",
      "const b = players.find((p) => p.index === idx);",
    ].join("\n");
    expect(scan(ok, UID_FIRST_LOOKUP)).toHaveLength(0);
  });
});
