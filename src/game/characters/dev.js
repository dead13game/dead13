// 12 号「myracler(开发者)」— 仅模拟宇宙可选
//
// 不属于经典/联赛/世界杯的注册表(selectableIds 不含它),
// 但模拟宇宙(uniState/uniCombat)与选角池需要它的静态数据。

export default {
  id: 12,
  meta: {
    id: 12,
    name: "myracler(开发者)",
    title: "开发者指令",
    icon: "./images/myracler.png",
    hp: 100,
    speed: 15,
    skillName: "开发者指令",
    skillType: "active",
    skillDesc:
      "对敌方全体造成1000点伤害，冷却0（开发者测试用，仅模拟宇宙可选）",
    maxUses: 999,
    loadMaxUses: 999,
  },
  stateSchema: {},
  // 模拟宇宙有自己的技能实现(uniSkills),这里不参与经典内核
  canUse() {
    return false;
  },
};
