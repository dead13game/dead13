// 门面 API — UI/控制器只从这里进内核
//
// 分工:
//   createSession  建房(带 ctx、模式、view)
//   dispatch       唯一写入口(命令)
//   buildView      只读视图(见 view.ts)
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
import type { DeserializeOptions, SaveFile } from "./persistence/save.js";
import type { Command } from "./flow/commands.js";
import type { Ctx, GameState, ModeAdapter, Rng } from "./types.js";
import type { ViewModel } from "./view.js";

export { attachCtx, buildView, getCtx };
export type { Command };
export type { ViewModel };

/** createSession 的参数(都透传给 initGame，再补 ctx/模式/view) */
export interface CreateSessionOptions {
  /** 角色 id 列表(按座次) */
  chars: number[];
  /** 是否启用天气 */
  weather?: boolean;
  /** 起始回合 */
  startRound?: number;
  /** 模式适配器，默认经典 */
  mode?: ModeAdapter;
  /** 随机源(测试注入可复现序列) */
  rng?: Rng;
  /** 牌库副数 */
  deckCount?: number;
  /** 与 chars 对齐的队伍 id */
  teamIds?: number[] | null;
  /** 1v1 每条命重开时保留日志 */
  keepLog?: boolean;
  /** 强制从和平期开始 */
  forcePeace?: boolean;
  /** 和平期起点 */
  peaceStartRound?: number;
  /** 复用已有 state 对象(Vue reactive 场景) */
  state?: GameState;
}

/** 一局游戏的接线结果 */
export interface Session {
  state: GameState;
  ctx: Ctx;
  mode: ModeAdapter;
  view: ViewModel;
}

/**
 * 创建一局并接线(turn engine + ctx + mode)。
 * @param opts 建房参数(见 CreateSessionOptions)
 */
export function createSession(opts: CreateSessionOptions): Session {
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
export function rewireContext(state: GameState, mode: ModeAdapter): Ctx {
  const ctx = createContext(state, { rng: createRng(), mode });
  attachTurnEngine(ctx);
  attachCtx(state, ctx);
  return ctx;
}

/** 唯一写入口 */
export function dispatch(state: GameState, command: Command): boolean {
  const ctx = getCtx(state);
  if (!ctx) throw new Error("api.dispatch: state 尚未接线(缺少 ctx)");
  return kernelDispatch(ctx, command);
}

/** 存档(可附加赛程上下文等额外信息) */
export function save(
  state: GameState,
  extra?: Record<string, unknown>,
): SaveFile {
  return serializeGameState(state, extra);
}

/** 读档(原地覆盖；mode 由 options.modeFactory 重建) */
export function load(
  state: GameState,
  data: unknown,
  options?: DeserializeOptions,
): boolean {
  const ok = deserializeGameState(state, data, options);
  if (ok && state.mode) rewireContext(state, state.mode);
  return ok;
}

export { createGameState, initGame };
