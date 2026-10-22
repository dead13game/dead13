/**
 * AI 决策模块 — 向后兼容 re-export
 * 实际实现已拆分到 ai/ 子目录：
 *   ai/index.js — 公共 API + 共享工具
 *   ai/easy.js   — 简单难度
 *   ai/skilled.js — 熟练难度
 *   ai/hell.js   — 地狱难度
 */
export {
  isAiPlayer,
  decideTopAction,
  decideTarget,
  decideGamblePick,
  decideNahidaOrder,
  decideLiniyaChoice,
  decideCaiyueangChoice,
} from "./ai/index.js";
