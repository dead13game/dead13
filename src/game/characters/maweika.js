import { CAT } from "../core/log.js";

// 玛薇卡 · 焚焰(被动):每破除陷阱/击穿防御 +1 斗志,下次攻击 +斗志层数(上限 5)
//
// 陷阱平局/击破的斗志由 rules/trap.js 直接加(它握着判定结果);
// 这里只处理「击穿防御」这条路径 —— 防御消耗数只有结算层知道。
export default {
  id: 6,
  meta: {
    id: 6,
    name: "玛薇卡",
    title: "火神",
    icon: "./images/玛薇卡.jpg",
    hp: 12,
    speed: 9,
    skillName: "焚焰",
    skillType: "passive",
    skillDesc:
      "每破除一个陷阱或击穿一层防御获得1层斗志，下次攻击伤害+斗志层数（上限5层）",
    maxUses: Infinity,
    loadMaxUses: 0,
  },
  stateSchema: { fightingSpirit: 0 },

  canUse() {
    return false; // 被动技
  },

  hooks: {
    /** 击穿防御牌 → 斗志 +消耗数 */
    onDamageDealt(ctx, env) {
      const { attacker, defenseConsumed, trapTriggered } = env;
      if (attacker.characterId !== 6) return;
      if (defenseConsumed <= 0 || trapTriggered) return;

      attacker.char.fightingSpirit = Math.min(
        5,
        attacker.char.fightingSpirit + defenseConsumed,
      );
      ctx.log(`斗志 ${attacker.char.fightingSpirit}层`);
      ctx.devDebug(
        CAT.SKILL,
        `玛薇卡斗志+${defenseConsumed} → ${attacker.char.fightingSpirit} (击穿防御)`,
      );
    },
  },
};
