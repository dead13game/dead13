import { CAT } from "../core/log.js";

// 薇斯纳 · 风翔剑（被动）
// 连续攻击：第 3 次 ×1.5（向上取整，保底 10）、第 4 次 ×2（保底 15）、
// 第 5 次及以后 ×3（保底 20）。
// 任意非攻击操作（防御/赌命/技能/圣遗物/被冻结）都会中断连击。
// 倍数在「所有加法加成之后、陷阱判定之前」生效（v3.5 补充说明）。

const COMBO_PRIORITY = 85; // 在圣遗物(80)之后、陷阱判定之前

const COMBO = {
  3: { mult: 1.5, floor: 10 },
  4: { mult: 2, floor: 15 },
  5: { mult: 3, floor: 20 },
};

export default {
  id: 16,
  meta: {
    id: 16,
    name: "薇斯纳",
    title: "风翔剑",
    icon: "./images/薇斯纳.jpg",
    hp: 11,
    speed: 10,
    skillName: "风翔剑",
    skillType: "passive",
    skillDesc:
      "连续攻击第3次×1.5(保底10)、第4次×2(保底15)、第5次及以后×3(保底20)；任何非攻击操作或被冻结都会中断连击",
    maxUses: Infinity,
    loadMaxUses: 0,
  },
  stateSchema: { attackStreak: 0 },

  canUse() {
    return false; // 被动技
  },

  attackModifiers: [
    {
      id: "vesna.combo",
      priority: COMBO_PRIORITY,
      apply(ctx, env, value) {
        if (env.source?.characterId !== 16) return value;
        const streak = env.source.char.attackStreak ?? 0;
        if (streak < 3) return value;
        const conf = COMBO[Math.min(streak, 5)];
        const after = Math.max(conf.floor, Math.ceil(value * conf.mult));
        ctx.log(
          `风翔剑 ${streak >= 5 ? "三阶" : streak === 4 ? "二阶" : "一阶"}：${value} → ${after} 点`,
        );
        ctx.dev(CAT.SKILL, `薇斯纳连击 ×${conf.mult}`, {
          streak,
          before: value,
          after,
          floor: conf.floor,
        });
        return after;
      },
    },
  ],
};
