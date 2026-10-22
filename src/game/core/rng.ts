// 随机源 — 纯逻辑层唯一的随机入口
//
// 旧实现的随机散落在 deck/artifacts/ai/league/worldCup 里直接调 Math.random,
// 导致「同 seed 复现」只能靠全局打了补丁。新代码一律走这里的 rng。

import type { Rng } from "../types.js";

/** 用任意 [0,1) 函数创建 rng(默认 Math.random,保持线上行为) */
export function createRng(source: () => number = Math.random): Rng {
  const next = () => source();
  return {
    next,
    /** [0, n) 整数 */
    int(n) {
      return Math.floor(next() * n);
    },
    /** 均匀取值(空数组返回 undefined) */
    pick(arr) {
      return arr.length ? arr[Math.floor(next() * arr.length)] : undefined;
    },
    /** 概率 p 为真 */
    chance(p) {
      return next() < p;
    },
  };
}

/** xorshift32,用于测试与回放(与 src/game/testing/seededRandom.js 同算法) */
export function createSeededRng(seed: number): Rng {
  let s = (seed >>> 0) || 0x9e3779b9;
  const source = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  return createRng(source);
}
