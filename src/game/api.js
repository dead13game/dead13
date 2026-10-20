// 门面 API — UI/控制器只从这里进内核
//
// 分工:
//   createSession  建房(带 ctx、模式、view)
//   dispatch       唯一写入口(命令)
//   buildView      只读视图(见 view.js)
//   save/load      存档

import { createGameState, initGame } from "./flow/setup.js";
import { createContext } from "./flow/context.js";
import { attachTurnEngine } from "./flow/turn.js";
import { dispatch as kernelDispatch } from "./flow/commands.js";
import { createRng } from "./core/rng.js";
import { createGameLogger } from "./gameLogger.js";
import { createClassicMode } from "./modes/classic.js";
import { attachCtx, buildView, getCtx } from "./view.js";
import {
  deserializeGameState,
  serializeGameState,
} from "./persistence/save.js";

export { attachCtx, buildView, getCtx };

/**
 * 创建一局并接线(turn engine + ctx + mode)。
 * @param {object} opts
 * @param {number[]} opts.chars
 * @param {boolean} [opts.weather]
 * @param {number} [opts.startRound]
 * @param {object} [opts.mode]     默认 classic
 * @param {object} [opts.rng]
 * @param {object} [opts.state]    复用已有 state 对象(Vue reactive 场景)
 */
export function createSession(opts) {
  const state = opts.state ?? createGameState();
  const mode = opts.mode ?? createClassicMode();
  const rng = opts.rng ?? createRng();

  initGame(state, {
    chars: opts.chars,
    weather: !!opts.weather,
    startRound: opts.startRound ?? 1,
    deckCount: opts.deckCount ?? 2,
    teamIds: opts.teamIds ?? null,
    mode,
    rng,
    keepLog: !!opts.keepLog,
    forcePeace: !!opts.forcePeace,
    peaceStartRound: opts.peaceStartRound ?? 0,
  });

  const ctx = createContext(state, { rng, mode });
  attachTurnEngine(ctx);
  attachCtx(state, ctx);
  if (!state.devLog) state.devLog = createGameLogger(() => state);

  return { state, ctx, mode, view: buildView(state) };
}

/** 重建 ctx(读档后调用:mode 换新了,旧 ctx 指向旧 mode) */
export function rewireContext(state, mode) {
  const ctx = createContext(state, { rng: createRng(), mode });
  attachTurnEngine(ctx);
  attachCtx(state, ctx);
  return ctx;
}

/** 唯一写入口 */
export function dispatch(state, command) {
  const ctx = getCtx(state);
  if (!ctx) throw new Error("api.dispatch: state 尚未接线(缺少 ctx)");
  return kernelDispatch(ctx, command);
}

export function save(state, extra) {
  return serializeGameState(state, extra);
}

export function load(state, data, options) {
  const ok = deserializeGameState(state, data, options);
  if (ok && state.mode) rewireContext(state, state.mode);
  return ok;
}

export { createGameState, initGame };
