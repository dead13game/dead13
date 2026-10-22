import { PENDING } from "../flow/pending.js";
import { snapshotState, restoreState } from "../persistence/snapshot.js";
import type { CharacterDef, Ctx, Player } from "../types.js";

/**
 * 菜月昴的作答形状（命令层写入）：`{ choice: "save" | "load" }`。
 * 其它取值走「读档」分支判断，与迁移前一致。
 */
interface CaiyueangAnswer {
  choice?: string;
}

/** 引擎口径:只看是否轮到自己(与旧 canUseSkill 对 id=11 的特判一致) */
function defCanUse(ctx: Ctx, player: Player): boolean {
  if (!player || !player.alive) return false;
  return ctx.state.pending == null && !ctx.state.gameOver;
}

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
    // 引擎口径:与旧实现一致(不限制同一回合重复存档),保证差分回放不失配
    return defCanUse(ctx, player);
  },

  /**
   * UI/AI 口径:同一回合只允许存一次档(KB-9)。
   * 重复存档没有收益,却是熟练度 AI 死循环的入口。
   */
  canUseNow(ctx, player) {
    if (!defCanUse(ctx, player)) return false;
    return ctx.state.turn?.savedBy !== player.uid;
  },

  use(ctx, player) {
    ctx.ask({
      type: PENDING.SAVE_OR_LOAD,
      purpose: "skill:caiyueang",
      asker: player.uid,
      options: [],
      data: {
        hasSavepoint: !!player.effects.savepoint,
        loadUses: player.resources.loadUses,
      },
    });
    ctx.log(`${player.name} 死亡回归 — 选择存档或读档`);
  },

  onAnswer(ctx, player, pending, answer) {
    const { state } = ctx;

    // 作答来自命令层（外部输入）：收窄成 `{ choice }` 后照旧比较
    const ans = answer as CaiyueangAnswer;

    if (ans.choice === "save") {
      player.effects.savepoint = snapshotState(state);
      // 标记本回合已存档(下一回合清除,见 flow/turn.js)
      state.turn.savedBy = player.uid;
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
    const savepoint = player.effects.savepoint;
    // 读档会恢复存档瞬间的 loadUses(3),必须先记下当前剩余次数再扣(KB-10 附带修复)
    const remainingUses = player.resources.loadUses;
    restoreState(ctx, savepoint);
    const subaru = state.players[subaruIndex];
    // 读档不应清空存档点:还能继续读(角色描述:读档 3 次)—— KB-10
    subaru.effects.savepoint = savepoint;
    subaru.resources.loadUses = remainingUses - 1;
    ctx.log(
      `${subaru.name} 死亡回归！回溯到存档点（剩余读档${subaru.resources.loadUses}次）`,
    );
    ctx.turn.extra();
  },
} satisfies CharacterDef;
