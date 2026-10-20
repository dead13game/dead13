// GameContext — 显式传递的运行时依赖
//
// 旧实现靠 6 组 `_injectXDeps()` 把 currentPlayer/addLog/ensureDeck/endAction
// 塞进各模块的模块级变量,测试里还必须再注入一遍。
//
// 新实现:所有规则/角色/流程函数的第一个参数都是 ctx。
//   - 依赖方向固定:flow → characters → rules → core,没有反向边
//   - 测试:createContext(state, { rng: createSeededRng(42) }) 一行
//   - ctx.turn 由 flow/turn.js 通过 attachEngine 注入,避免 context ↔ turn 循环

import { createRng } from "../core/rng.js";
import { draw, reshuffleFromGrave } from "../core/cards.js";
import { CAT } from "../core/log.js";
import {
  alivePlayers,
  currentPlayer,
  playerByIndex,
  playerByUid,
} from "../core/player.js";
import { clearPending, setPending } from "./pending.js";

const SOUND_QUEUE_LIMIT = 32;

export function createContext(state, deps = {}) {
  const rng = deps.rng ?? createRng();
  const logger = deps.logger ?? state.devLog ?? null;

  const ctx = {
    state,
    rng,

    // ── 日志 ──
    log(msg) {
      state.messageLog.push(msg);
    },
    dev(cat, msg, data) {
      logger?.info?.(cat, msg, data);
    },
    devDebug(cat, msg, data) {
      logger?.debug?.(cat, msg, data);
    },
    devWarn(cat, msg, data) {
      logger?.warn?.(cat, msg, data);
    },
    devError(cat, msg, data) {
      logger?.error?.(cat, msg, data);
    },
    hpChange(...args) {
      logger?.hpChange?.(...args);
    },

    // ── 音效 ──
    sound(type) {
      if (!state.soundQueue) state.soundQueue = [];
      state.soundSeq = (state.soundSeq ?? 0) + 1;
      state.soundQueue.push({ type, seq: state.soundSeq });
      if (state.soundQueue.length > SOUND_QUEUE_LIMIT) {
        state.soundQueue.splice(
          0,
          state.soundQueue.length - SOUND_QUEUE_LIMIT,
        );
      }
    },

    // ── 玩家查询 ──
    players: {
      all: () => state.players,
      alive: () => alivePlayers(state),
      current: () => currentPlayer(state),
      byUid: (uid) => playerByUid(state, uid),
      byIndex: (i) => playerByIndex(state, i),
    },

    // ── 牌堆 ──
    deck: {
      /** 抽 n 张(牌堆顶 = 数组尾部) */
      draw(n = 1) {
        const r = draw(state.deck, n);
        state.deck = r.remaining;
        return r.drawn;
      },
      /** 保证牌库至少有 n 张,不足则重构墓地(与旧 ensureDeck 等价) */
      ensure(n = 1) {
        if (state.deck.length >= n) return;
        const graveCount = state.grave.length;
        state.deck = reshuffleFromGrave(state.grave, rng);
        state.grave = [];
        ctx.log("牌库重构");
        ctx.dev(
          CAT.DECK,
          `牌库重构: 墓地${graveCount}张 → 牌库${state.deck.length}张`,
          { graveCount, deckCount: state.deck.length, round: state.round },
        );
      },
      /** 入墓(跳过空值) */
      discard(...cards) {
        for (const c of cards) if (c) state.grave.push(c);
      },
      /** 牌库 + 墓地同时为空 = 资源耗尽(KB-8 的边界) */
      isExhausted() {
        return state.deck.length === 0 && state.grave.length === 0;
      },
    },

    // ── 决策 ──
    ask(pending) {
      return setPending(state, pending);
    },
    clearPending() {
      clearPending(state);
    },

    // ── 回合(由 flow/turn.js 注入实现) ──
    turn: {
      pass() {
        return requireEngine(ctx).pass(ctx);
      },
      extra() {
        return requireEngine(ctx).extra(ctx);
      },
      next() {
        return requireEngine(ctx).next(ctx);
      },
      suspend(reason = true) {
        if (!state.turn) state.turn = { extraAction: false, suspend: null, resync: false };
        state.turn.suspend = reason;
      },
      resync() {
        if (!state.turn) state.turn = { extraAction: false, suspend: null, resync: false };
        state.turn.resync = true;
      },
    },

    engine: null,
    attachEngine(api) {
      ctx.engine = api;
      return ctx;
    },
  };

  return ctx;
}

function requireEngine(ctx) {
  if (!ctx.engine) {
    throw new Error(
      "ctx.turn 尚未接线:请在创建 context 后调用 attachEngine(flow/turn.js)",
    );
  }
  return ctx.engine;
}
