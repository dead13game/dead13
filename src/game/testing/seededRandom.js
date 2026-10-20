// 差分对拍用:可复现随机源
//
// 为什么要全局替换 Math.random:
// 旧实现把随机散落在 deck/artifacts/ai/league/worldCup 里直接调用 Math.random,
// 要在不改生产代码的前提下得到确定性轨迹,只能替换全局函数。
// 重构完成后新增代码一律走 ctx.rng,但这条替换仍然保留,用于跑旧基线。

/** xorshift32,返回 [0,1) */
export function createSeededRandom(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function random() {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** 安装种子随机源,返回恢复函数 */
export function installSeededRandom(seed) {
  const original = Math.random;
  const rng = createSeededRandom(seed);
  Math.random = rng;
  return function restore() {
    Math.random = original;
  };
}

/** 由 seed 派生角色阵容(不消耗 rng,避免适配器实现差异影响随机序列) */
export function pickChars(seed, count, availableIds) {
  const pool = [...availableIds];
  let s = (seed * 2654435761 + 12345) >>> 0;
  const picks = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const idx = s % pool.length;
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
}
