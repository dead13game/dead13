// 新内核 × 旧基线:命令回放对拍
//
// 为什么不重新跑 AI 决策:
//   AI 读的是旧 state 结构(skillUses / statusEffects / relations.allyIndex …),
//   而且决策本身消耗随机数。命令回放把「决策」整个拿掉,只验证内核在
//   同一串命令、同一随机序列位置下是否走出同一状态 —— 这正是重构要保证的东西。
//
// 时间轴:基线记录每条命令执行前后的随机数游标(rngBefore / rngAfter),
//   回放时把游标拨到 rngBefore,于是洗牌/暴击等内部随机结果与旧实现逐位一致。

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import { createGameState, initGame } from "../flow/setup.js";
import { createClassicMode } from "../modes/classic.js";
import { createContext } from "../flow/context.js";
import { attachTurnEngine } from "../flow/turn.js";
import {
  attack,
  attackTarget,
  defense,
  gamble,
  gambleSubmit,
  skill,
  skillAnswer,
  ally,
  allyTarget,
  betray,
  holyWord,
  cancel,
} from "../flow/commands.js";
import { installReplayRandom } from "./seededRandom.js";
import { projectNext } from "./projection-next.js";
import { firstDiff, formatDiff } from "./compare.js";
import { buildScriptedCases, nextScenarioApi } from "./scenarios.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixtures", "classic-v1.json.gz");

const fixture = JSON.parse(
  zlib.gunzipSync(fs.readFileSync(FIXTURE)).toString("utf8"),
);
const scenarioById = new Map(buildScriptedCases().map((c) => [c.id, c]));

const uidByIndex = (ctx, index) =>
  ctx.state.players.find((p) => p.index === index)?.uid ?? null;

function runCommand(ctx, step) {
  const a = step.args ?? {};
  switch (step.type) {
    case "attack":
      return attack(ctx);
    case "defense":
      return defense(ctx);
    case "gamble":
      return gamble(ctx);
    case "gambleSubmit":
      return gambleSubmit(ctx, a.trapIdx, a.baitIdx);
    case "attackTarget":
      return attackTarget(ctx, uidByIndex(ctx, a.targetIndex));
    case "skill":
      return skill(ctx);
    case "skillTarget":
      return skillAnswer(ctx, uidByIndex(ctx, a.targetIndex));
    case "nahidaOrder":
      return skillAnswer(ctx, a.order);
    case "liniya":
      return skillAnswer(ctx, {
        targetUid: uidByIndex(ctx, a.targetIndex),
        subSkill: a.subSkill,
      });
    case "caiyueang":
      return skillAnswer(ctx, { choice: a.choice });
    case "ally":
      return ally(ctx);
    case "allyTarget":
      return allyTarget(ctx, uidByIndex(ctx, a.targetIndex));
    case "betray":
      return betray(ctx);
    case "holyWord":
      return holyWord(ctx);
    case "resetStep":
    case "unknownStep":
      return cancel(ctx);
    default:
      throw new Error(`未支持的命令类型: ${step.type}`);
  }
}

function replayCase(entry) {
  const config = entry.config;
  const origin = scenarioById.get(entry.id);
  const rng = installReplayRandom(entry.trace.rng);

  try {
    const state = createGameState();
    const mode = createClassicMode();
    initGame(state, {
      chars: config.chars,
      weather: !!config.weather,
      startRound: config.startRound ?? 1,
      mode,
    });
    if (origin?.applyPlan) origin.applyPlan(nextScenarioApi(state));
    // 旧适配器在 create 时统一标记 AI(投影里含 ai 字段),回放要还原同一状态
    state.players.forEach((p) => {
      p.ai.enabled = true;
      p.ai.difficulty = config.difficulty ?? "easy";
    });

    const ctx = createContext(state);
    attachTurnEngine(ctx);

    let logCursor = 0;
    let soundCursor = 0;

    for (let i = 0; i < entry.trace.steps.length; i++) {
      const step = entry.trace.steps[i];
      rng.seek(step.rngBefore);
      runCommand(ctx, step);

      const snap = projectNext(state);
      const diff = firstDiff(step.snap, snap, "$.snap");
      if (diff) {
        return {
          stepIndex: i,
          cmd: step.cmd,
          reason: diff.reason,
          path: diff.path,
          base: diff.a,
          next: diff.b,
        };
      }

      const logs = state.messageLog.slice(logCursor).map(String);
      logCursor = state.messageLog.length;
      const logDiff = firstDiff(step.logs, logs, "$.logs");
      if (logDiff) {
        return {
          stepIndex: i,
          cmd: step.cmd,
          reason: "日志不同: " + logDiff.reason,
          path: logDiff.path,
          base: logDiff.a,
          next: logDiff.b,
        };
      }

      const queue = state.soundQueue || [];
      const sounds = queue.filter((e) => e.seq > soundCursor).map((e) => e.type);
      soundCursor = queue.length ? queue[queue.length - 1].seq : soundCursor;
      const soundDiff = firstDiff(step.sounds, sounds, "$.sounds");
      if (soundDiff) {
        return {
          stepIndex: i,
          cmd: step.cmd,
          reason: "音效不同: " + soundDiff.reason,
          path: soundDiff.path,
          base: soundDiff.a,
          next: soundDiff.b,
        };
      }
    }

    return null;
  } finally {
    rng.restore();
  }
}

describe("差分对拍:新内核回放旧命令序列", () => {
  for (const entry of fixture.cases) {
    it(entry.id, () => {
      const r = replayCase(entry);
      expect(
        r,
        r
          ? `第 ${r.stepIndex} 步 (${r.cmd}) ${r.reason} @ ${r.path} 旧=${JSON.stringify(r.base)} 新=${JSON.stringify(r.next)}`
          : "",
      ).toBeNull();
    }, 120000);
  }
});
