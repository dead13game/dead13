// 单机模式状态机 — 章节地图 / 属性成长 / 卡组构筑 / 金币 / 存档
// 纯逻辑层，零依赖（设计文档 docs/solo-roguelike-design.md v0.8）

import {
  SOLO_CONST,
  SOLO_CHAPTER,
  SOLO_CARDS,
  SOLO_ENEMIES,
  EXP_CURVE,
  BATTLE_REWARD,
  SHOP_PRICE,
  calcMaxHp,
} from "./soloConstants.js";
import { createFullDeck, shuffleDeck, drawCards } from "../../game/deck.js";
import { createGameLogger, LOG_TYPE } from "../../game/gameLogger.js";

/** 玛薇卡默认初始卡组（12.2）：猛击 ×2 / 重击 ×1 / 格挡 ×1 */
export const DEFAULT_START_DECK = { mengji: 2, zhongji: 1, gedang: 1 };

// ---- 创建 ----

/** 创建单机模式状态 */
export function createSoloState(charId = 6) {
  const attrs = { ...SOLO_CONST.INIT_ATTRS };
  const player = {
    charId,
    hp: calcMaxHp(attrs),
    maxHp: calcMaxHp(attrs),
    level: 1,
    exp: 0,
    attrs,
    pendingAttrPoints: 0, // 待分配属性点
    deck: { ...DEFAULT_START_DECK }, // 聚合 {cardId: count}
    upgraded: {}, // 卡牌升级次数 {cardId: n}，效果 base + 2n
    gold: 0,
    removedCount: 0, // 已删卡次数（删卡价格递增）
  };
  const state = {
    chapter: 1,
    chapterTitle: "第 1 章",
    chapterFlavor: "",
    nodeIndex: 0,
    mapNodes: SOLO_CHAPTER.map((n) => ({ ...n })),
    player,
    combat: null,
    pendingEvent: null,
    gameOver: false,
    victory: false,
    log: [],
  };
  // 结构化日志（[game] 控制台 + DevLogPanel），与多人模式同系统
  state.devLog = createGameLogger(() => state);
  return state;
}

// ---- 节点 ----

/** 当前节点 */
export function getCurrentNode(state) {
  return state.mapNodes[state.nodeIndex] || null;
}

/** 是否通关（打完所有节点） */
export function isSoloFinished(state) {
  return state.nodeIndex >= state.mapNodes.length;
}

/** 推进到下一节点（战斗胜利后由控制器调用） */
export function advanceNode(state) {
  state.nodeIndex += 1;
}

// ---- 属性 / 经验 ----

/** 获得经验，自动升级（升级时累积待分配属性点） */
export function gainExp(state, n) {
  state.player.exp += n;
  while (
    state.player.level < EXP_CURVE.length + 1 &&
    state.player.exp >= EXP_CURVE[state.player.level - 1]
  ) {
    state.player.exp -= EXP_CURVE[state.player.level - 1];
    state.player.level += 1;
    state.player.pendingAttrPoints += SOLO_CONST.ATTR_POINTS_PER_LEVEL;
    // 升级回满血？设计层未定，采用升级回满（肉鸽惯例）
    state.player.hp = calcMaxHp(state.player.attrs);
    state.player.maxHp = calcMaxHp(state.player.attrs);
  }
}

/** 分配属性点（str/mag/def），更新 HP */
export function applyAttrPoints(state, attr, n) {
  if (n > state.player.pendingAttrPoints) return false;
  if (!["str", "mag", "def"].includes(attr)) return false;
  state.player.attrs[attr] += n;
  state.player.pendingAttrPoints -= n;
  state.player.maxHp = calcMaxHp(state.player.attrs);
  state.player.hp = Math.min(state.player.hp, state.player.maxHp);
  return true;
}

// ---- 卡组构筑 ----

/** 加卡到牌库（聚合） */
export function addCards(state, cardId, count = 1) {
  if (!SOLO_CARDS[cardId]) return false;
  state.player.deck[cardId] = (state.player.deck[cardId] || 0) + count;
  return true;
}

/** 从牌库删卡（随机删 1 张时由调用方先选 cardId） */
export function removeCard(state, cardId) {
  if (!state.player.deck[cardId]) return false;
  state.player.deck[cardId] -= 1;
  if (state.player.deck[cardId] <= 0) delete state.player.deck[cardId];
  state.player.removedCount += 1;
  return true;
}

/** 随机删 1 张卡（事件"绕路"用） */
export function removeRandomCard(state) {
  const ids = Object.keys(state.player.deck);
  if (ids.length === 0) return null;
  const cardId = ids[Math.floor(Math.random() * ids.length)];
  removeCard(state, cardId);
  return cardId;
}

/** 升级 1 张卡（base +2） */
export function upgradeCard(state, cardId) {
  if (!state.player.deck[cardId]) return false;
  state.player.upgraded[cardId] = (state.player.upgraded[cardId] || 0) + 1;
  return true;
}

/** 获取卡牌实际数值（含升级加成） */
export function getCardStats(state, cardId) {
  const card = SOLO_CARDS[cardId];
  if (!card) return null;
  const ups = state.player.upgraded[cardId] || 0;
  return { ...card, base: card.base + ups * 2 };
}

// ---- 金币 / 生命 ----

export function addGold(state, n) {
  state.player.gold = Math.max(0, state.player.gold + n);
}

export function spendGold(state, n) {
  if (state.player.gold < n) return false;
  state.player.gold -= n;
  return true;
}

export function healPlayer(state, n) {
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + n);
}

// ---- 商店 ----

/** 商店可购买列表（当前未拥有的卡 + 已拥有的） */
export function shopCatalog(state) {
  return Object.keys(SOLO_CARDS);
}

/** 买卡 */
export function shopBuy(state, cardId) {
  const card = SOLO_CARDS[cardId];
  if (!card) return { ok: false, reason: "无此卡" };
  const price = CARD_RARITY_PRICE(cardId);
  if (!spendGold(state, price)) return { ok: false, reason: "金币不足" };
  addCards(state, cardId, 1);
  return { ok: true, price };
}

/** 删卡价格（逐张递增） */
export function shopRemovePrice(state) {
  return (
    SHOP_PRICE.removeBase +
    state.player.removedCount * SHOP_PRICE.removeIncrement
  );
}

/** 回血价格：每 5 HP 收 5 金 */
export function shopHealPrice(amount) {
  return Math.ceil(amount / 5) * SHOP_PRICE.healPer5;
}

/** 升级卡价格 */
export function shopUpgradePrice() {
  return SHOP_PRICE.upgrade;
}

function CARD_RARITY_PRICE(cardId) {
  // 稀有度价格：简化用 cost 区分（cost ≥ 8 视为稀有）
  const card = SOLO_CARDS[cardId];
  return card && card.cost >= 8 ? SHOP_PRICE.buyRare : SHOP_PRICE.buyCommon;
}

// ---- 战斗奖励 ----

/** 战斗胜利奖励（金币随机区间 + 经验；卡牌 3 选 1 由控制器弹候选） */
export function awardBattleReward(state, enemyKey) {
  const reward = BATTLE_REWARD[enemyKey];
  if (!reward) return null;
  const gold =
    reward.gold[0] + Math.floor(Math.random() * (reward.gold[1] - reward.gold[0] + 1));
  addGold(state, gold);
  gainExp(state, reward.exp);
  return { gold, exp: reward.exp, rarity: reward.rarity, attrPoint: reward.attrPoint || 0 };
}

/** 按稀有度生成卡牌候选（3 选 1） */
export function rollCardCandidates(rarity) {
  const ids = Object.keys(SOLO_CARDS);
  const pool = ids.filter((id) => {
    const card = SOLO_CARDS[id];
    if (rarity === "rare") return card.cost >= 8;
    if (rarity === "mix") return true;
    return card.cost < 8; // common
  });
  // 洗牌取 3
  const shuffled = shuffleDeck(pool.map((id) => ({ id })));
  return shuffled.slice(0, 3).map((c) => c.id);
}

// ---- 存档 ----

export function serializeSolo(state) {
  return JSON.parse(JSON.stringify(state));
}

export function deserializeSolo(state, data) {
  if (!data) return false;
  Object.assign(state, JSON.parse(JSON.stringify(data)));
  return true;
}

// 复用扑克牌堆工具（solo 战斗内抽 3 选 2 用）
export { createFullDeck, shuffleDeck, drawCards };
export { calcMaxHp }; // re-export（供外部使用）
