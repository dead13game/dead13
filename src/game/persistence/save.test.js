import { describe, it, expect } from "vitest";

import { createGameState, initGame } from "../flow/setup.js";
import { createContext } from "../flow/context.js";
import { attachTurnEngine } from "../flow/turn.js";
import { defense, attack } from "../flow/commands.js";
import { createClassicMode } from "../modes/classic.js";
import { createMatchMode, restoreMatchMode } from "../modes/match.js";
import { createSeededRng } from "../core/rng.js";
import { projectNext } from "../testing/projection-next.js";
import { firstDiff } from "../testing/compare.js";
import { SAVE_VERSION, normalizePlayer } from "./schema.js";
import { deserializeGameState, serializeGameState } from "./save.js";

function makeClassic(chars = [1, 2, 6, 9]) {
  const state = createGameState();
  const mode = createClassicMode();
  initGame(state, { chars, weather: true, startRound: 1, mode });
  const ctx = createContext(state, { rng: createSeededRng(5), mode });
  attachTurnEngine(ctx);
  return { state, ctx, mode };
}

describe("persistence/save — 存档往返", () => {
  it("经典模式:玩几步后存档再读档,投影完全一致", () => {
    const { state, ctx } = makeClassic();
    defense(ctx);
    defense(ctx);
    defense(ctx);

    const save = serializeGameState(state);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.mode.id).toBe("classic");
    // 存档点不入档
    expect(save.state.players.every((p) => p.effects.savepoint === null)).toBe(true);

    const restored = createGameState();
    const ok = deserializeGameState(restored, JSON.parse(JSON.stringify(save)), {
      modeFactory: () => createClassicMode(),
    });
    expect(ok).toBe(true);
    const diff = firstDiff(projectNext(state), projectNext(restored), "$");
    expect(diff, diff ? `${diff.path}: 旧=${JSON.stringify(diff.a)} 新=${JSON.stringify(diff.b)}` : "").toBeNull();
    expect(restored.mode.id).toBe("classic");
  });

  it("旧版本存档直接拒绝(不做迁移)", () => {
    const { state } = makeClassic();
    const save = serializeGameState(state);
    save.version = 3;
    const restored = createGameState();
    expect(deserializeGameState(restored, save)).toBe(false);
  });

  it("缺字段的旧 payload 会被补齐默认值", () => {
    const p = normalizePlayer({ uid: 1, characterId: 1, hp: 5 });
    expect(p.resources).toEqual({
      skillUses: 0,
      loadUses: 0,
      holyWordUses: 2,
      breakCount: 0,
    });
    expect(p.relations.attackedThisRound).toBe(0);
    expect(p.char).toEqual({});
    expect(p.defensePile).toEqual([]);
  });

  it("存档不包含运行时量,读档后重置", () => {
    const { state, ctx } = makeClassic();
    defense(ctx);
    ctx.sound("hit");
    const save = serializeGameState(state);
    expect(save.state.soundQueue).toBeUndefined();

    const restored = createGameState();
    deserializeGameState(restored, save, { modeFactory: () => createClassicMode() });
    expect(restored.soundQueue).toEqual([]);
    expect(restored.soundSeq).toBe(0);
  });

  it("pending 能原样还原(读档不会把局面卡在非法步骤)", () => {
    const { state, ctx } = makeClassic();
    state.phase = "normal";
    state.round = 5;
    state.deck.push({ id: "F-K", rank: "K", suit: "♠", value: 13, faceUp: false });
    attack(ctx); // 进入 attackShowCard

    const save = JSON.parse(JSON.stringify(serializeGameState(state)));
    const restored = createGameState();
    deserializeGameState(restored, save, { modeFactory: () => createClassicMode() });

    expect(restored.step).toBe("attackShowCard");
    expect(restored.pending.type).toBe("target");
    expect(restored.pendingAttackCard.value).toBe(13);
  });
});

describe("persistence/save — 比赛进度", () => {
  it("比赛比分/回合/换人次数随存档还原", () => {
    const state = createGameState();
    const mode = createMatchMode({
      playerCharId: 1,
      opponentCharId: 2,
      rng: createSeededRng(1),
    });
    initGame(state, { chars: [1, 2], startRound: 1, mode, forcePeace: true });
    const ctx = createContext(state, { rng: createSeededRng(1), mode });
    attachTurnEngine(ctx);

    mode.match.score = [3, 2];
    mode.match.matchRound = 47;
    state.round = 47;
    mode.match.substitutionsLeft = 5;
    state.players.find((p) => p.characterId === 1).alive = false;
    mode.checkGameOver(ctx);

    const save = JSON.parse(JSON.stringify(serializeGameState(state)));
    expect(save.mode.id).toBe("match");
    expect(save.mode.match.score).toEqual([3, 3]); // 对手进球后
    expect(save.mode.match.matchRound).toBe(state.round);

    const restored = createGameState();
    const ok = deserializeGameState(restored, save, {
      modeFactory: (md) => restoreMatchMode(md, { rng: createSeededRng(1) }),
    });
    expect(ok).toBe(true);
    expect(restored.mode.id).toBe("match");
    expect(restored.mode.match.score).toEqual([3, 3]);
    expect(restored.mode.match.matchRound).toBe(47);
    expect(restored.mode.match.substitutionsLeft).toBe(5);
    // 读档后可以继续打
    expect(restored.turn.suspend).toBe(true);
  });
});
