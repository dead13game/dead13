// 模拟宇宙常量 — 位面/层规则 / 敌人基础 / 区域 / 货币 / 商店价格
// 纯逻辑层，零依赖（设计文档 docs/simuniverse-design.md v0.1）

// ---- 全局常量 ----

export const UNI_CONST = {
  START_SHARDS: 0, // 初始宇宙碎片
  TEAM_SIZE: 4, // 固定 4 人队伍
  RESURRECT_COST: 150, // 休整复活 1 名死亡角色费用（§6.5）
  BOSS_HEAT: 5, // 首领层造物调试台热量
  OVERWRITE_BASE: 25, // 覆写祝福/方程基础价
  OVERWRITE_STEP: 25, // 每次递增
  OVERWRITE_CAP: 200, // 价格上限
};

// ---- 位面膨胀（文档第四框架）----

/** 位面 1-9 的血量膨胀倍数表；10+ 每 +3 */
export const PLANE_MULT = [1, 2, 4, 6, 8, 10, 13, 16, 19];

/** 血量膨胀倍数：位面 → 倍数 */
export function planeMult(plane) {
  if (plane <= PLANE_MULT.length) return PLANE_MULT[plane - 1];
  return PLANE_MULT[PLANE_MULT.length - 1] + (plane - PLANE_MULT.length) * 3;
}

/** 伤害膨胀倍率 = 血量膨胀倍率 × 0.5，向上取整，最低 1 */
export function dmgMult(plane) {
  return Math.max(1, Math.ceil((planeMult(plane) * 0.5)));
}

/**
 * 位面换算：1-10 → 1；11-30 → 2；31-60 → 3；61+ 每 30 层 +1（循环期）
 */
export function getPlane(floor) {
  if (floor <= 10) return 1;
  if (floor <= 30) return 2;
  if (floor <= 60) return 3;
  return 4 + Math.floor((floor - 61) / 30);
}

/**
 * 层类型规则（文档第一/二框架）：
 * 首领 = 10 的倍数；转化 = 25,35,55,75,95…（35 起每 +20）；
 * 奇遇 = 45,75,105…（45 起每 +30，第三位面起）；休整 = 29,59,89…（29 起每 +30）。
 * 冲突处理：75 同时命中转化与奇遇 → 奇遇优先（奇遇更稀有，且与「第三位面 45 奇遇 → 第四位面 75 奇遇」的相对位置一致）。
 */
export function getLayerType(floor) {
  if (floor === 1) return "battle"; // 固定战斗（新手引导）
  if (floor % 10 === 0) return "boss";
  if (floor >= 45 && (floor - 45) % 30 === 0) return "oddity";
  if (floor === 25 || (floor >= 35 && (floor - 35) % 20 === 0)) return "transform";
  if (floor >= 29 && (floor - 29) % 30 === 0) return "rest";
  return "normal";
}

// ---- 敌人基础（文档第四框架）----

export const ENEMY_BASE = {
  normal: { name: "普通敌人", hp: 10 },
  elite: { name: "精英敌人", hp: 25 },
  boss: { name: "首领", hp: 60 },
};

// ---- 普通层抽取池（文档第二框架）----

export const NORMAL_POOL = [
  "event",
  "reward",
  "battle",
  "elite",
  "adventure",
  "shop",
  "fortune",
];

// ---- 区域类型元信息（避免 UI 硬编码映射）----

export const REGION_META = {
  event: { icon: "❓", name: "事件" },
  reward: { icon: "🎁", name: "奖励" },
  battle: { icon: "⚔️", name: "战斗" },
  elite: { icon: "💀", name: "精英" },
  adventure: { icon: "🎲", name: "冒险" },
  shop: { icon: "🛒", name: "商店" },
  fortune: { icon: "💰", name: "财富" },
  boss: { icon: "👑", name: "首领" },
  transform: { icon: "🔮", name: "转化" },
  rest: { icon: "🏕️", name: "休整" },
  oddity: { icon: "✨", name: "奇遇" },
};

// ---- 区域奖励（文档第九框架）----
// blessingPicks: 胜利后可进行的「祝福三选一」次数
// blessingStars: 三选一的星级范围（[min, max]）
// equations: 胜利后获得的方程个数（首领）
export const REGION_REWARD = {
  battle: { shards: 30, blessingPicks: 3, blessingStars: [1, 2] },
  elite: { shards: 80, blessingPicks: 3, blessingStars: [2, 3] },
  boss: {
    shards: 250,
    blessingPicks: 2,
    blessingStars: [3, 3],
    equations: 2,
    equationStars: [2, 3],
  },
  fortune: { shards: 300 },
};

// ---- 转化层（文档第九框架）----

export const TRANSFORM_WAVES = [
  { kind: "normal", count: 5 }, // 第一波：5 普通
  { kind: "normal", count: 5 }, // 第二波：5 普通
  { kind: "elite", count: 3 }, // 第三波：3 精英
];
export const TRANSFORM_PASS_ROUND = 20; // 及格线：20 回合消灭两波
export const TRANSFORM_ELITE_SHARDS = 150; // 第三波每消灭 1 个精英 +150 碎片

// ---- 普通战斗波次（文档第四框架：3 波×3 普通）----

export const BATTLE_WAVES = [
  { kind: "normal", count: 3 },
  { kind: "normal", count: 3 },
  { kind: "normal", count: 3 },
];

// ---- 精英战斗配置（文档第四框架：3 个精英）----

export const ELITE_BATTLE = [{ kind: "elite", count: 3 }];

// ---- 商店价格（文档第七框架 §10.1）----

export const SHOP_PRICE = {
  blessing: { 1: 80, 2: 120, 3: 180 },
  curio: { 1: 120, 2: 200, 3: 0 }, // 3 星奇物商店不出售
  equation: { 1: 200, 2: 450, 3: 650 },
};

// ---- 商店商品生成（文档第九框架）----

export const SHOP_STOCK = {
  blessing: [
    { star: 1, count: 3 },
    { star: 2, count: 4 },
    { star: 3, count: 3 },
  ],
  curio: [
    { star: 1, count: 4 },
    { star: 2, count: 4 },
  ],
  equation: [
    { star: 1, count: 1 },
    { star: 2, count: 1 },
    { star: 3, count: 1 },
  ],
};

// ---- 奇遇效果池（文档第九框架）----

export const ODDITY_EFFECTS = ["workbench", "shards", "strengthen"];
export const ODDITY_SHARDS = 800;
export const ODDITY_STRENGTHEN_COUNT = 8;

// ---- 方程重复转化碎片（文档注）----

export const EQUATION_DUPE_SHARDS = { 1: 200, 2: 450, 3: 650 };

// ---- 敌人技能模板（文档第五框架）----
// 普通：actions 每回合执行 1 次（1 个行动）
// 精英：actions 每回合执行 2 次（行动1+行动2）；B/C 为轮次循环特殊模板
// 首领：interlude 在前 2 名玩家行动后执行 1 次，actions 在剩余 2 名玩家行动后执行 2 次
// dmg 为第一位面基础伤害，实际伤害 = dmg × dmgMult(plane)
export const ENEMY_PATTERNS = {
  normal: {
    A: { name: "重击", actions: [{ type: "single", dmg: 5 }] },
    B: { name: "震荡波", actions: [{ type: "aoe", dmg: 3 }] },
    C: { name: "岩化", actions: [{ type: "shield", pct: 0.3 }] },
  },
  elite: {
    A: { name: "连击", actions: [{ type: "single", dmg: 8 }, { type: "aoe", dmg: 5 }] },
    B: { name: "锁定狙击", special: "lock", actions: [{ type: "single", dmg: 16 }] },
    C: { name: "腐蚀", special: "cycle", actions: [{ type: "debuff" }, { type: "aoe", dmg: 8 }] },
  },
  boss: {
    A: {
      name: "帝王威压",
      interlude: { type: "aoe", dmg: 8 },
      actions: [{ type: "single", dmg: 12 }, { type: "heal", pct: 0.1 }],
    },
    B: {
      name: "权柄压制",
      interlude: { type: "healcut" },
      actions: [{ type: "aoe", dmg: 6 }, { type: "stun" }],
    },
    C: {
      name: "傀儡仪式",
      interlude: { type: "summon" },
      actions: [{ type: "aoe", dmg: 6 }, { type: "puppet", every: 5 }],
    },
  },
};

/** 敌人 C 类 debuff（第一版：dot 2 点 × 3 回合，可调） */
export const ENEMY_DEBUFF_DOT = 2;
export const ENEMY_DEBUFF_DURATION = 3;

/** 首领 C 傀儡：下回合对另一玩家造成的伤害 */
export const PUPPET_DMG = 10;

/** 首领 C 傀儡触发间隔（每 N 回合） */
export const PUPPET_EVERY = 5;

/** 首领 B 减疗比例 */
export const BOSS_HEAL_CUT = 0.5;

/** 精英 B 锁定伤害倍数（对被锁定者） */
export const ELITE_LOCK_DMG = 16;

// ---- 角色 PVE 技能表（文档第六框架）----
// type: active=可开大（有冷却） / passive=被动生效
// cd: 冷却数组（等级 1-10；冷却含开大当回合）
// values: 主数值数组（等级 1-10）
// 辅助数值（芙宁娜 heal%、莉奈娅 dot、斗志上限等）见各角色字段
export const UNI_SKILLS = {
  1: {
    name: "千风之诗",
    type: "active",
    cd: [7],
    values: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10], // 爆发牌数（1-9 级 2~10，10 级 10）
  },
  2: {
    name: "坚如磐石",
    type: "active",
    cd: [6],
    values: [18, 21, 25, 30, 35, 40, 45, 50, 55, 65], // 全队护盾
  },
  3: {
    name: "无想的一刀",
    type: "active",
    cd: [7],
    values: [20, 22, 25, 28, 32, 36, 40, 45, 50, 60], // 单体伤害
  },
  4: {
    name: "智慧之殿堂",
    type: "active",
    cd: [9, 9, 9, 9, 8, 7, 6, 5, 4, 3], // 1-4 级 9，5-10 级递减
    values: [1, 2, 3, 4, 4, 4, 4, 4, 4, 4], // 立即行动人数
  },
  5: {
    name: "审判",
    type: "active",
    cd: [6],
    values: [20, 24, 28, 32, 36, 40, 45, 50, 55, 70], // 全队增伤%（3 回合）
    heal: [10, 12, 15, 18, 21, 24, 27, 30, 33, 40], // 治疗（自身生命上限%）
  },
  6: {
    name: "焚焰",
    type: "passive",
    values: [4, 5, 6, 7, 8, 9, 10, 10, 10, 10], // 斗志上限
    team: [1, 1, 1, 1, 1, 1, 1, 2, 3, 4], // 8-10 级让 2/3/4 人拥有斗志
    spiritPer5: 1, // 每 5 层斗志普攻伤害 +1（数值待平衡）
  },
  7: {
    name: "三月交辉之刻",
    type: "passive",
    values: [2, 3, 4, 5, 6, 7, 8, 8, 8, 8], // 攻击/防御加成
    team: [1, 1, 1, 1, 1, 1, 1, 2, 3, 4], // 8-10 级让 2/3/4 人享受
  },
  8: {
    name: "重见澄澈晴空",
    type: "active",
    cd: [6],
    values: [10, 12, 15, 18, 21, 24, 27, 30, 33, 40], // 全队生命上限%（3 回合）
  },
  9: {
    name: "青春之力的馈赠",
    type: "active",
    cd: [6], // 文档未给冷却，暂定 6（可调）
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // 全队获得 N 张盾
    dot: [3, 4, 5, 6, 7, 7, 7, 7, 7, 7], // 二技能：dot 伤害（6-10 级持续）
    dotTurns: [0, 0, 0, 0, 0, 3, 4, 5, 6, 7], // 6-10 级持续回合
  },
  10: {
    name: "冻结",
    type: "active",
    cd: [12, 12, 12, 12, 12, 12, 11, 10, 9, 8], // 6-10 级冷却递减
    values: [1, 2, 3, 4, 5, 5, 5, 5, 5, 5], // 敌方停 N 回合
  },
  11: {
    name: "死亡回归",
    type: "passive",
    maxLoads: 3, // 3 次读档，不可升级
  },
};

/** 莉奈娅一技能的护盾牌单张值（可调） */
export const LINIYA_SHIELD_VALUE = 6;

/** 菜月昴读档次数上限 */
export const CAIYUEANG_MAX_LOADS = 3;

/** 斗志：每 N 层普攻伤害 +1 */
export const SPIRIT_PER_5 = 5;
