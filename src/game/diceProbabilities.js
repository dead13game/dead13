// 骰子点数和权重表（纯逻辑，零依赖）
//
// 数据源：update_log/骰子概率.csv —— 两枚六面骰的点数和分布（2~12）
// 构建时经 Vite `?raw` 打包进 bundle；CSV 缺失/解析失败时回退经典双骰权重。
// 所有掷骰统一走 rollWeightedDice，权重以本表为准（避免硬编码）。

import diceCsv from "../../update_log/骰子概率.csv?raw";

/** 经典双骰权重（兜底，与 CSV 相同） */
const FALLBACK_WEIGHTS = [
  { sum: 2, weight: 1 },
  { sum: 3, weight: 2 },
  { sum: 4, weight: 3 },
  { sum: 5, weight: 4 },
  { sum: 6, weight: 5 },
  { sum: 7, weight: 6 },
  { sum: 8, weight: 5 },
  { sum: 9, weight: 4 },
  { sum: 10, weight: 3 },
  { sum: 11, weight: 2 },
  { sum: 12, weight: 1 },
];

/**
 * 解析 CSV 文本（列：点数和,组合数,概率,大约概率）。
 * 只取前两列；非法行跳过；结果按点数升序。
 * @param {string} csvText
 * @returns {{ sum: number, weight: number }[]}
 */
export function parseDiceWeights(csvText) {
  const lines = csvText.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const weights = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const sum = Number(cols[0]);
    const weight = Number(cols[1]);
    if (Number.isFinite(sum) && Number.isFinite(weight) && weight > 0) {
      weights.push({ sum, weight });
    }
  }
  if (weights.length < 2) return null; // 数据不足 → 触发兜底
  weights.sort((a, b) => a.sum - b.sum);
  return weights;
}

/** 当前生效的权重表（来自 CSV，解析失败回退经典权重） */
export const DICE_WEIGHTS = parseDiceWeights(diceCsv) || FALLBACK_WEIGHTS;

/** 权重总和（= 组合总数，经典为 36） */
export const DICE_TOTAL = DICE_WEIGHTS.reduce((s, w) => s + w.weight, 0);

/**
 * 累计概率区间 [{ sum, weight, lo, hi }]，rng ∈ [0,1) 落在哪个区间即掷出哪个点数。
 */
export function cumulativeBounds(weights = DICE_WEIGHTS, total = DICE_TOTAL) {
  let lo = 0;
  return weights.map((w) => {
    const hi = lo + w.weight / total;
    const b = { sum: w.sum, weight: w.weight, lo, hi };
    lo = hi;
    return b;
  });
}

export const DICE_BOUNDS = cumulativeBounds();

/** 按权重表掷一次骰子，返回点数和（默认 2~12） */
export function rollWeightedDice(rng = Math.random) {
  const v = rng();
  for (const b of DICE_BOUNDS) {
    if (v < b.hi) return b.sum;
  }
  return DICE_BOUNDS[DICE_BOUNDS.length - 1].sum; // v ≥ 1 兜底
}
