// 差分对拍用:可复现随机源 + 随机值录制
//
// 为什么要全局替换 Math.random:
// 旧实现把随机散落在 deck/artifacts/ai/league/worldCup 里直接调用 Math.random,
// 要在不改生产代码的前提下得到确定性轨迹,只能替换全局函数。
//
// 为什么要录制:
// AI 决策也消耗随机数(简单 AI 用 Math.random 选行动)。新内核回放时不再跑 AI,
// 随机序列会错位。基线记录「每条命令执行前后各消耗到第几个随机数」,
// 回放时把游标拨到同一位置,这样洗牌、暴击等内部随机结果与旧实现逐位一致。

/** 回放用随机源把手 */
export interface ReplayRandomHandle {
  /** 还原原始 Math.random */
  restore(): void;
  /** 把游标拨到第 n 个随机数 */
  seek(n: number): void;
  /** 当前游标 */
  position(): number;
}

/** xorshift32,返回 [0,1) */
export function createSeededRandom(seed: number): () => number {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function random(): number {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * 安装种子随机源。
 * @param seed
 * @param sink 传入数组则记录每次返回值(用于回放)
 * @returns 还原函数
 */
export function installSeededRandom(
  seed: number,
  sink?: number[],
): () => void {
  const original = Math.random;
  const rng = createSeededRandom(seed);
  Math.random = () => {
    const v = rng();
    if (sink) sink.push(v);
    return v;
  };
  return function restore(): void {
    Math.random = original;
  };
}

/**
 * 回放用随机源:按录制序列逐位返回;可以随时拨动游标。
 */
export function installReplayRandom(recorded: number[]): ReplayRandomHandle {
  const original = Math.random;
  let pos = 0;
  Math.random = () => {
    const v = recorded[pos];
    pos++;
    if (v === undefined) {
      // 录制长度不足 = 新实现多调用了随机数(本身就是要抓的行为差异)
      throw new Error(`随机序列越界: 需要第 ${pos} 个值, 录制只有 ${recorded.length} 个`);
    }
    return v;
  };
  return {
    restore() {
      Math.random = original;
    },
    seek(n) {
      pos = n;
    },
    position() {
      return pos;
    },
  };
}

/** 由 seed 派生角色阵容(不消耗 rng,避免适配器实现差异影响随机序列) */
export function pickChars(
  seed: number,
  count: number,
  availableIds: readonly number[],
): number[] {
  const pool = [...availableIds];
  let s = (seed * 2654435761 + 12345) >>> 0;
  const picks: number[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const idx = s % pool.length;
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
}
