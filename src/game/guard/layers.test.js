import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scan, FRAMEWORK_IMPORTS, HOST_APIS } from "./scan.js";

// 本文件位于 src/game/guard/，故 ../ 就是 src/game/
const GAME_DIR = fileURLToPath(new URL("../", import.meta.url));

/** 递归收集 src/game 下的非测试源码（跳过 guard/ 自身：它定义规则字面量） */
function collect(dir = GAME_DIR, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "guard") continue;
      collect(full, acc);
    } else if (entry.endsWith(".js") && !entry.endsWith(".test.js")) acc.push(full);
  }
  return acc;
}

function assertClean(label, file, hits) {
  if (hits.length === 0) return;
  const detail = hits
    .map((h) => `  ${file}:${h.line}  [${h.rule}]  ${h.text}`)
    .join("\n");
  throw new Error(
    `${label}：src/game 必须保持零前端依赖（CLAUDE.md 核心设计原则 1）。\n` +
      detail +
      `\n修复：把这段逻辑移到 src/bridge/ 或 src/pixi/；src/game 只保留纯规则。`,
  );
}

describe("G3 分层依赖：src/game 零依赖", () => {
  const files = collect();

  it("不 import vue / pixi / gsap", () => {
    for (const file of files) {
      assertClean("框架依赖", file, scan(readFileSync(file, "utf8"), FRAMEWORK_IMPORTS));
    }
  });

  it("不使用浏览器 / 宿主 API（document、localStorage、fetch…）", () => {
    for (const file of files) {
      assertClean("浏览器 API", file, scan(readFileSync(file, "utf8"), HOST_APIS));
    }
  });

  // ── 反例：证明护栏不是永远绿 ──
  it("反例：含 vue / document 的违规源码必须被扫出来", () => {
    const bad = [
      'import { ref } from "vue";',
      "const el = document.body;",
    ].join("\n");
    expect(scan(bad, FRAMEWORK_IMPORTS)).toHaveLength(1);
    expect(scan(bad, HOST_APIS)).toHaveLength(1);
  });

  it("反例：assertClean 对违规项必须抛错，且错误里带行号与修复建议", () => {
    const hits = scan('import gsap from "gsap";', FRAMEWORK_IMPORTS);
    expect(() => assertClean("框架依赖", "demo.js", hits)).toThrow(/demo\.js:1/);
    expect(() => assertClean("框架依赖", "demo.js", hits)).toThrow(/修复/);
  });
});
