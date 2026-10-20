// 差分对拍:经典模式基线
//
// 录制(仅在需要重新冻基线时):
//   $env:RECORD_BASELINE=1; npx vitest run src/game/testing/replay.test.js
// 平时:
//   npx vitest run src/game/testing/replay.test.js
//
// 基线文件必须由「旧实现」录制(P0 阶段),之后任何实现改动都要让这个测试保持绿色。

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import { runTrace } from "./driver.js";
import { compareTraces, formatDiff } from "./compare.js";
import { pickChars } from "./seededRandom.js";
import { createLegacyAdapter } from "./adapters/legacy.js";
import { buildScriptedCases } from "./scenarios.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixtures", "classic-v1.json.gz");
const CHAR_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // 12=开发者,仅模拟宇宙

export function buildClassicCases() {
  const shapes = [
    { count: 4, weather: false, difficulty: "easy", n: 6 },
    { count: 4, weather: true, difficulty: "skilled", n: 6 },
    { count: 6, weather: false, difficulty: "easy", n: 4 },
    { count: 8, weather: true, difficulty: "hell", n: 3 },
  ];
  const cases = [];
  let seed = 1;
  for (const shape of shapes) {
    for (let i = 0; i < shape.n; i++, seed++) {
      const id = `classic-${shape.count}p-${shape.difficulty}-${shape.weather ? "w" : "n"}w-s${seed}`;
      cases.push({
        id,
        seed,
        count: shape.count,
        weather: shape.weather,
        difficulty: shape.difficulty,
        chars: pickChars(seed, shape.count, CHAR_IDS),
      });
    }
  }
  return cases;
}

if (process.env.RECORD_BASELINE === "1") {
  describe("录制基线(旧实现)", () => {
    it("写入 fixtures/classic-v1.json", () => {
      const adapter = createLegacyAdapter();
      const cases = [...buildClassicCases(), ...buildScriptedCases()];
      const out = { version: 1, adapter: "legacy", recordedAt: "P0", cases: [] };
      for (const config of cases) {
        let trace;
        try {
          trace = runTrace(adapter, config);
        } catch (err) {
          throw new Error(`[${config.id}] ${err.message}`, { cause: err });
        }
        const scriptDone = trace.notes.some((n) => n.startsWith("decide=null"));
        expect(
          trace.finished || trace.exhausted || trace.looped || scriptDone,
          `${config.id} 既未终局也未到资源耗尽/死循环/脚本结束边界: 步数=${trace.stepCount} 最近命令=${trace.steps
            .slice(-6)
            .map((s) => s.cmd)
            .join(" → ")} 最近日志=${JSON.stringify(
            trace.steps.slice(-3).flatMap((s) => s.logs),
          )}`,
        ).toBe(true);
        out.cases.push({ id: config.id, config, trace });
      }
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
      const raw = Buffer.from(JSON.stringify(out));
      fs.writeFileSync(FIXTURE, zlib.gzipSync(raw, { level: 9 }));
      // 打印体积与覆盖,便于控制基线膨胀、发现盲区
      const kb = Math.round(fs.statSync(FIXTURE).size / 1024);
      const cmdHist = {};
      const chars = new Set();
      for (const c of out.cases) {
        for (const cid of c.config.chars || []) chars.add(cid);
        for (const s of c.trace.steps) {
          cmdHist[s.cmd.split(":")[0]] = (cmdHist[s.cmd.split(":")[0]] || 0) + 1;
        }
      }
      process.stdout.write(
        `\n[baseline] ${out.cases.length} 局, ${Math.round(raw.length / 1024)}KB JSON → ${kb}KB gz, 命令总数 ${out.cases.reduce((n, c) => n + c.trace.stepCount, 0)}\n` +
          `[coverage] 角色=${[...chars].sort((a, b) => a - b).join(",")}\n` +
          `[coverage] 命令=${JSON.stringify(cmdHist)}\n`,
      );
    }, 180000);
  });
} else {
  describe("差分对拍:经典模式(旧实现 vs 基线)", () => {
    const fixture = JSON.parse(
      zlib.gunzipSync(fs.readFileSync(FIXTURE)).toString("utf8"),
    );
    const adapter = createLegacyAdapter();
    // 函数无法写进 JSON:脚本场景的 preState 在回放时按 id 从定义处回填
    const scenarioById = new Map(buildScriptedCases().map((c) => [c.id, c]));

    for (const entry of fixture.cases) {
      it(entry.id, () => {
        const origin = scenarioById.get(entry.id);
        const config = origin
          ? { ...entry.config, preState: origin.preState }
          : entry.config;
        const trace = runTrace(adapter, config);
        const diff = compareTraces(entry.trace, trace);
        expect(diff, diff ? formatDiff(diff) : "").toBeNull();
      }, 120000);
    }
  });
}
