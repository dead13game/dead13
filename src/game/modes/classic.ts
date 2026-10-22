// 经典对战模式:规则配置 + 结束判定
//
// P4 会加入 match/league/worldcup 三个同构 adapter。
// 规则字段必须显式声明,禁止再靠「context 是否存在」隐式切换(旧实现就这么干)。

import { PHASE } from "../core/constants.js";
import type { Ctx, ModeAdapter } from "../types.js";

export function createClassicMode(): ModeAdapter {
  return {
    id: "classic",
    rules: {
      peaceRounds: 4,
      attackGate: "round", // "round" = 经典按回合计,"phase" = 1v1 按阶段计
      attackMinRound: 4,
      alliance: true,
      allyMinPlayers: 4,
    },

    onNewRound() {
      // 经典模式没有回合开始时要做的事
    },

    /** 结束判定:存活 ≤ 1(与旧 checkGameOver 的 classic 分支逐行对齐) */
    checkGameOver(ctx: Ctx) {
      const { state } = ctx;
      const alive = ctx.players.alive();
      if (alive.length > 1) return;

      state.gameOver = true;
      state.winnerIndex = alive[0]?.index ?? -1;
      state.phase = PHASE.GAME_OVER;

      if (alive.length === 1) {
        ctx.log(`${alive[0].name} 获胜`);
        // 玩家失败:胜者是 AI 时播放失败音效(胜利无素材,静默)
        if (alive[0].ai.enabled) ctx.sound("lose");
      } else {
        ctx.log("全员阵亡");
        ctx.sound("lose");
      }
    },
  };
}
