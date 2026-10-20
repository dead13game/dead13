// 世界杯单场:比赛模式 + 赛程钩子
//
// 小组赛/淘汰赛的差别只在 isGroupStage(平局是否直接结束),
// 赛程推进仍由 worldCup.js 负责 —— 那是数据编排,不是内核。

import { createMatchMode } from "./match.js";

/**
 * @param {object} opts
 * @param {boolean} opts.isGroupStage
 * @param {number} opts.playerCharId
 * @param {number} opts.opponentCharId
 * @param {number|null} [opts.playerArtifactId]
 * @param {object} [opts.hooks] onMatchEnd(match) / onGroupResult(result)
 */
export function createWorldCupMatchMode(opts = {}) {
  const { hooks = {}, ...rest } = opts;

  const base = createMatchMode({
    ...rest,
    onMatchEnd(match) {
      hooks.onMatchEnd?.(match);
      if (match.isGroupStage) {
        const [p, o] = match.score;
        hooks.onGroupResult?.(p > o ? "win" : p < o ? "loss" : "draw");
      }
    },
  });

  return {
    ...base,
    id: "worldcup",
  };
}
