import { MOON_NAMES } from "../core/constants.js";
import { CAT } from "../core/log.js";
import type { CharacterDef } from "../types.js";

// 哥伦比娅 · 三月交辉之刻(被动):每回合自动轮换月相
//   弦月(+4攻) → 满月(+3防盾) → 新月(赌命抽3)
//
// 加成数值在 rules/modifiers.js(attackModifiers 的 moon.waxing / DEFENSE 的 moon.full),
// 这里只负责「回合开始轮换」这一个副作用。
export default {
  id: 7,
  meta: {
    id: 7,
    name: "哥伦比娅",
    title: "月神·少女",
    icon: "./images/哥伦比亚.jpg",
    hp: 11,
    speed: 10,
    skillName: "三月交辉之刻",
    skillType: "passive",
    skillDesc: "每回合自动轮换月相：弦月(+4攻) → 满月(+3防盾) → 新月(赌命抽3)",
    maxUses: Infinity,
    loadMaxUses: 0,
  },
  stateSchema: { moonPhase: 0 },

  canUse() {
    return false;
  },

  hooks: {
    /** 回合开始:月相轮换(旧实现在 nextPlayer 的新回合分支里硬编码 characterId===7) */
    onRoundStart(ctx, player) {
      if (!player.alive) return;
      // stateSchema 把月相初始化为 0；`!` 只做类型收窄，不改变运行时
      const phase = (player.char.moonPhase! + 1) % 3;
      player.char.moonPhase = phase;
      // 旧实现写死角色名,不写玩家名
      ctx.log(`哥伦比娅月相 ${MOON_NAMES[phase]}`);
      ctx.devDebug(CAT.SKILL, `月相轮换: ${player.name} → ${MOON_NAMES[phase]}`, {
        moonPhase: phase,
      });
    },
  },
} satisfies CharacterDef;
