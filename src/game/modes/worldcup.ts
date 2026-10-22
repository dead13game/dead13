// 世界杯单场:比赛模式 + 赛程钩子
//
// 小组赛/淘汰赛的差别只在 isGroupStage(平局是否直接结束),
// 赛程推进仍由 worldCup.js 负责 —— 那是数据编排,不是内核。

import { createMatchMode } from "./match.js";
import type { MatchMode, MatchState } from "./match.js";
import type { Ctx, Rng } from "../types.js";

/** 世界杯赛程回调（控制器传入，纯数据） */
export interface WorldCupHooks {
  onMatchEnd?(match: MatchState): void;
  onGroupResult?(result: "win" | "loss" | "draw"): void;
}

export interface WorldCupMatchModeOptions {
  isGroupStage?: boolean;
  playerCharId: number;
  opponentCharId: number;
  playerArtifactId?: number | null;
  rng?: Rng;
  onAfterCheck?: ((ctx: Ctx) => void) | null;
  wrap?: ((base: MatchState) => MatchState) | null;
  hooks?: WorldCupHooks;
}

/** 世界杯单场的 adapter：id 标记为 worldcup，便于控制器分流 */
export type WorldCupMatchMode = MatchMode & { id: "worldcup" };

export function createWorldCupMatchMode(
  opts: WorldCupMatchModeOptions,
): WorldCupMatchMode {
  const { hooks = {}, ...rest } = opts;

  const base = createMatchMode({
    ...rest,
    onMatchEnd(match: MatchState) {
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
