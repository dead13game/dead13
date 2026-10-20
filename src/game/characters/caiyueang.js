import { PENDING } from "../flow/pending.js";
import { snapshotState, restoreState } from "../persistence/snapshot.js";

// 菜月昴 · 死亡回归:存档不限次,读档 3 次,均不结束回合
//
// 注意(与旧实现一致的边界):读档会清空该玩家自己的存档点 ——
// 旧 deepCloneState 把 savepoint 置 null,恢复时 Object.assign 覆盖回去。
// 这条行为已记录为 KB-10,不在本次重构中修改。
export default {
  id: 11,
  meta: {
    id: 11,
    name: "菜月昴",
    title: "死亡回归",
    icon: "./images/菜月昴.png",
    hp: 11,
    speed: 10,
    skillName: "死亡回归",
    skillType: "active",
    skillDesc: "存档不限次，读档3次。均不结束回合",
    maxUses: 3,
    loadMaxUses: 3,
  },
  stateSchema: {},

  /**
   * 旧 canUseSkill 对 id=11 特判:只看是否处于行动步,不看次数/天气/圣遗物。
   * 这是「存档不限次」的实现方式,保留。
   */
  canUse(ctx, player) {
    if (!player || !player.alive) return false;
    return ctx.state.pending == null && !ctx.state.gameOver;
  },

  use(ctx, player) {
    ctx.ask({
      type: PENDING.SAVE_OR_LOAD,
      purpose: "skill:caiyueang",
      asker: player.uid,
      data: {
        hasSavepoint: !!player.effects.savepoint,
        loadUses: player.resources.loadUses,
      },
    });
    ctx.log(`${player.name} 死亡回归 — 选择存档或读档`);
  },

  onAnswer(ctx, player, pending, answer) {
    const { state } = ctx;

    if (answer.choice === "save") {
      player.effects.savepoint = snapshotState(state);
      ctx.log(`${player.name} 存档完成`);
      ctx.turn.extra();
      return;
    }

    if (!player.effects.savepoint) {
      ctx.log("没有存档点可以回溯");
      ctx.clearPending();
      return;
    }
    if (player.resources.loadUses <= 0) {
      ctx.log("读档次数已用完");
      ctx.clearPending();
      return;
    }

    const subaruIndex = player.index;
    restoreState(ctx, player.effects.savepoint);
    const subaru = state.players[subaruIndex];
    subaru.resources.loadUses--;
    ctx.log(
      `${subaru.name} 死亡回归！回溯到存档点（剩余读档${subaru.resources.loadUses}次）`,
    );
    ctx.turn.extra();
  },
};
