// 单机模式常量 — 技能卡池 / 敌人数据 / 节点链 / 数值常量
// 纯逻辑层，零依赖（设计文档 docs/solo-roguelike-design.md v0.8）

// ---- 数值常量（12.1 玩家基准）----
export const SOLO_CONST = {
  INIT_ATTRS: { str: 2, mag: 2, def: 2 }, // 初始属性
  ATTR_POINTS_PER_LEVEL: 2, // 每级 +2 属性点
  HP_BASE: 20, // 最大 HP = 20 + def × 2
  HP_PER_DEF: 2,
  HAND_KIND_LIMIT: 6, // 手牌种类上限
  AI_PLAY_DELAY: 1500, // AI 出牌慢放延迟（ms）
  SPIRIT_PER_ACTION: 5, // 玛薇卡：每 5 层斗志 → 行动力 +1
  TURN_LIMIT: 30, // 平局回合上限
  POKER_DRAW: 3, // 每回合抽 3 张扑克（抽3选2）
};

/** 默认首发角色（玛薇卡） */
export const DEFAULT_CHAR_ID = 6;

/** 节点类型元信息（图标 + 名称，避免 UI 层硬编码映射） */
export const NODE_META = {
  battle: { icon: "⚔️", name: "战斗" },
  event: { icon: "❓", name: "事件" },
  shop: { icon: "🛒", name: "商店" },
  camp: { icon: "🏕️", name: "营地" },
};

// ---- 技能卡池（12.2，13 张）----
// type: physical=力量修正 / magic=法力修正 / defense=防御修正 / utility=功能
// cost: 行动力消耗；base: 基础数值（+对应属性修正）
export const SOLO_CARDS = {
  mengji: { id: "mengji", name: "猛击", type: "physical", cost: 5, base: 3 },
  zhongji: { id: "zhongji", name: "重击", type: "physical", cost: 9, base: 6 },
  lianji: { id: "lianji", name: "连击", type: "physical", cost: 12, base: 3, hits: 2 },
  pojia: { id: "pojia", name: "破甲", type: "physical", cost: 8, base: 4, armorPen: 2 },
  aoshu: { id: "aoshu", name: "奥术冲击", type: "magic", cost: 5, base: 2 },
  bingzhui: { id: "bingzhui", name: "冰锥", type: "magic", cost: 8, base: 3, actionDrain: 4 },
  zhiyu: { id: "zhiyu", name: "治愈", type: "magic", cost: 8, base: 4, heal: true },
  huogiu: { id: "huogiu", name: "火球", type: "magic", cost: 12, base: 5 },
  gedang: { id: "gedang", name: "格挡", type: "defense", cost: 4, base: 4 },
  huiqi: { id: "huiqi", name: "回气", type: "defense", cost: 4, base: 2, actionRefund: 4 },
  tiebi: { id: "tiebi", name: "铁壁", type: "defense", cost: 8, base: 7 },
  kuangnu: { id: "kuangnu", name: "狂怒", type: "utility", cost: 4, fightingSpirit: 2 },
  zhuanzhu: { id: "zhuanzhu", name: "专注", type: "utility", cost: 5, drawBonus: 2 },
};

/** 卡牌稀有度（商店/奖励定价用） */
export const CARD_RARITY = {
  mengji: "common",
  zhongji: "common",
  lianji: "rare",
  pojia: "rare",
  aoshu: "common",
  bingzhui: "rare",
  zhiyu: "common",
  huogiu: "rare",
  gedang: "common",
  huiqi: "common",
  tiebi: "rare",
  kuangnu: "common",
  zhuanzhu: "common",
};

// ---- 敌人数据（12.3）----
// deck: 预设技能卡牌组 {cardId: count}；buff: 专属 BUFF（复用角色特殊效果，如 fightingSpirit=斗志）
export const SOLO_ENEMIES = {
  normal: {
    name: "普通敌人",
    hp: 20,
    deck: { mengji: 4, zhongji: 2 },
    buff: null,
  },
  elite: {
    name: "精英敌人",
    hp: 30,
    deck: { zhongji: 3, huogiu: 2, gedang: 2 },
    buff: null,
  },
  boss: {
    name: "首领",
    hp: 40,
    deck: { lianji: 2, huogiu: 2, tiebi: 2 },
    buff: "fightingSpirit", // 复用玛薇卡斗志：破盾攒斗志、每5层行动力+1
  },
};

// ---- 最小闭环节点链（6.1，7 节点固定链）----
export const SOLO_CHAPTER = [
  { type: "battle", enemy: "normal" },
  { type: "event", eventId: "hunter" },
  { type: "shop" },
  { type: "battle", enemy: "normal" },
  { type: "camp" },
  { type: "battle", enemy: "elite" },
  { type: "battle", enemy: "boss" },
];

// ---- 经验曲线（12.4）：1→2 ... 9→10 ----
export const EXP_CURVE = [10, 14, 19, 25, 32, 40, 49, 59, 70];

// ---- 战斗奖励（12.5）----
// rarity: common=普通卡池 / mix=普通+稀有 / rare=稀有卡池
export const BATTLE_REWARD = {
  normal: { gold: [8, 15], exp: 10, rarity: "common" },
  elite: { gold: [15, 25], exp: 20, rarity: "mix" },
  boss: { gold: [30, 45], exp: 40, rarity: "rare", attrPoint: 1 },
};

// ---- 商店定价（12.6）----
export const SHOP_PRICE = {
  buyCommon: 15,
  buyRare: 25,
  removeBase: 20, // 删卡基础价，每删 1 张 +5
  removeIncrement: 5,
  healPer5: 5, // 每 5 HP 收费
  upgrade: 15, // 升级卡（数值 +2）
};

/** 最大 HP = 20 + 防御 × 2 */
export function calcMaxHp(attrs) {
  return SOLO_CONST.HP_BASE + (attrs?.def ?? 0) * SOLO_CONST.HP_PER_DEF;
}
