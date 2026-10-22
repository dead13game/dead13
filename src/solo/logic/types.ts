// 单机模式共享类型 — logic 层（solo / soloCombat / soloEvents / soloConstants）共用的形状。
// 纯类型文件：编译后全部擦除，不产生任何运行时依赖（import 路径仍保留 .js 后缀）。

import type { Card, SoundEvent } from "../../game/types.js";
import type { LogContext, LogEntry } from "../../game/gameLogger.js";

// ── 属性 / 聚合结构 ─────────────────────────────────────────
/** 三维属性（力量 / 法力 / 防御） */
export interface SoloAttrs {
  str: number;
  mag: number;
  def: number;
}

export type SoloAttrKey = keyof SoloAttrs;

/** 手牌 / 牌库 / 坟场 / 升级次数的聚合结构：`{cardId: count}` */
export type CardAgg = Record<string, number>;

// ── 技能卡 ────────────────────────────────────────────────
export type SoloCardType = "physical" | "magic" | "defense" | "utility";

/** 一张技能卡定义（SOLO_CARDS 的值；getCardStats 返回含升级加成的副本） */
export interface SoloCard {
  id: string;
  name: string;
  type: SoloCardType;
  cost: number;
  /**
   * 基础数值（+对应属性修正）。
   * 功能卡（utility：狂怒 / 专注）没有数值，故为可选；攻击/防御卡一定存在。
   */
  base?: number;
  /** 连击：每次打出的结算段数 */
  hits?: number;
  /** 破甲：穿透的护盾点数 */
  armorPen?: number;
  /** 冰锥：敌方下回合行动力 -N */
  actionDrain?: number;
  /** 治愈：命中后治疗自己 */
  heal?: boolean;
  /** 回气：打出后返还行动力 */
  actionRefund?: number;
  /** 狂怒：叠加斗志 */
  fightingSpirit?: number;
  /** 专注：立即补抽 N 张 */
  drawBonus?: number;
}

/**
 * 技能牌作为「牌堆元素」时的边界类型（仅类型层）。
 * 运行时元素是 `{ ...SOLO_CARDS[id], id }`，没有扑克牌的 value / faceUp；
 * 而 game/core 的 shuffleDeck / drawCards 以 Card[] 为契约。
 * 单机牌堆只用到 id 与数组语义（洗牌 / 抽牌 / 移出 / 洗回），故在构造处做一次结构性断言。
 */
export type SoloPileCard = SoloCard & Card;

/** 稀有度（战斗奖励 / 商店定价） */
export type SoloRarity = "common" | "mix" | "rare";

// ── 玩家 / 地图 ────────────────────────────────────────────
export interface SoloPlayer {
  charId: number;
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
  attrs: SoloAttrs;
  /** 待分配属性点 */
  pendingAttrPoints: number;
  deck: CardAgg;
  /** 卡牌升级次数 `{cardId: n}`，效果 base + 2n */
  upgraded: CardAgg;
  gold: number;
  /** 已删卡次数（删卡价格递增） */
  removedCount: number;
}

export type SoloNodeType = "battle" | "event" | "shop" | "camp";

/** 一个地图节点；battle 带 enemy，event 带 eventId */
export interface SoloMapNode {
  type: SoloNodeType;
  enemy?: string;
  eventId?: string;
}

// ── 敌人 / 奖励 ────────────────────────────────────────────
export interface SoloEnemy {
  name: string;
  hp: number;
  deck: CardAgg;
  /** 专属 BUFF（复用角色特殊效果键，如 fightingSpirit = 斗志） */
  buff: string | null;
}

/** BATTLE_REWARD 的一项配置 */
export interface SoloBattleRewardConfig {
  /** 金币随机区间 [min, max] */
  gold: [number, number];
  exp: number;
  rarity: SoloRarity;
  attrPoint?: number;
}

/** 战斗胜利发放的奖励（awardBattleReward 返回值 / combat.lastReward） */
export interface SoloBattleReward {
  gold: number;
  exp: number;
  rarity: SoloRarity;
  attrPoint: number;
  /** 已领取的卡牌（领奖后写入，供 UI 显示） */
  claimedCard?: string;
}

// ── 战斗 ──────────────────────────────────────────────────
export type SoloPhase =
  | "pick-poker"
  | "draw-skill"
  | "play"
  | "enemy-announce"
  | "enemy-resolve"
  | "won"
  | "lost";

export type SoloSide = "player" | "enemy";

/** 最近打出队列的元素（最多 6 种） */
export interface SoloPlayedCard {
  cardId: string;
  count: number;
  side: SoloSide;
  round: number;
}

/** 敌方已宣布、等待慢放后结算的牌 */
export interface SoloPendingEnemyPlay {
  cardId: string;
  count: number;
  cost: number;
}

/** 单机战斗状态（字段与 startCombat 里的对象字面量一一对应） */
export interface SoloCombatState {
  enemyKey: string;
  enemyName: string;
  enemyHp: number;
  enemyMaxHp: number;
  enemyShield: number;
  /** 敌方专属 BUFF（"fightingSpirit" 时破玩家盾攒斗志） */
  enemyBuff: string | null;
  enemySpirit: number;
  /** 冰锥 debuff：敌方下回合行动力 -N */
  enemyNextActionDrain: number;
  /** 破甲 debuff：下回合敌方护盾获取 -N */
  enemyNextShieldPen: number;

  playerPile: Card[];
  playerHand: CardAgg;
  playerGrave: CardAgg;
  enemyPile: Card[];
  enemyHand: CardAgg;
  enemyGrave: CardAgg;

  /** 扑克牌堆（抽 3 选 2） */
  pokerDeck: Card[];
  /** 本回合抽到的 3 张扑克，选牌后清空 */
  pendingPoker: Card[] | null;

  actionPoints: number;
  drawCount: number;
  playsThisTurn: number;
  playedQueue: SoloPlayedCard[];

  playerShield: number;
  /** 玛薇卡斗志：破盾累积，每 5 层行动力 +1 */
  fightingSpirit: number;

  round: number;
  phase: SoloPhase;
  log: string[];

  // ── 敌方回合（startEnemyTurn 写入；startCombat 预置 0 以免读到 undefined）──
  enemyActionPoints: number;
  enemyDrawCount: number;
  enemySpent: number;
  enemyPendingPlay: SoloPendingEnemyPlay | null;

  /** 战斗胜利奖励（endCombat 写入，claimCardReward 读取） */
  lastReward?: SoloBattleReward | null;
}

// ── 事件 ──────────────────────────────────────────────────
/** 事件选项结算后的效果（也可直接作为 fixed 选项） */
export interface SoloEventEffect {
  /** 金币增减（±） */
  gold?: number;
  /** HP 增减（±） */
  hp?: number;
  /** 随机删 N 张卡 */
  removeRandom?: number;
  /** 随机加 N 张稀有卡 */
  addRareCard?: number;
  /** 加指定卡 */
  addCard?: string;
  note?: string;

  // ── 结算时写入的结果字段（供 UI / 日志展示）──
  removedCard?: string | null;
  gainedCard?: string;
  dead?: boolean;
}

/** 直接生效的选项 */
export interface SoloEventFixedOption extends SoloEventEffect {
  text: string;
  type: "fixed";
}

/** 扑克检定选项 */
export interface SoloEventCheckOption extends SoloEventEffect {
  text: string;
  type: "check";
  attr: SoloAttrKey;
  dc: number;
  success: SoloEventEffect;
  fail: SoloEventEffect;
}

export type SoloEventOption = SoloEventFixedOption | SoloEventCheckOption;

export interface SoloEventDef {
  id: string;
  title: string;
  desc: string;
  options: SoloEventOption[];
}

/** 扑克检定结果 */
export interface SoloCheckResult {
  success: boolean;
  total: number;
  card: Card;
  rerolled: boolean;
}

// ── 返回值形状（UI / 测试按字段读取，失败时字段缺省）──────────
export interface SoloActionResult {
  ok: boolean;
  reason?: string;
}

export interface SoloPickPokerResult extends SoloActionResult {
  actionPoints?: number;
  drawCount?: number;
}

export interface SoloEnemyAnnounce {
  playing: boolean;
  /** playing=true 时才有 */
  cardId?: string;
  count?: number;
}

export interface SoloShopResult extends SoloActionResult {
  price?: number;
}

export interface SoloEventResult {
  ok: boolean;
  option?: SoloEventOption;
  check?: SoloCheckResult | null;
  outcome?: SoloEventEffect;
}

/** 单机存档快照（JSON 序列化后的纯数据） */
export type SoloSnapshot = Record<string, unknown>;

/** 开发日志器（createGameLogger 的返回值里单机用到的部分） */
export interface SoloLogger {
  entries: LogEntry[];
  debug(typeOrCat: string, msg: string, data?: Record<string, unknown>): void;
  info(typeOrCat: string, msg: string, data?: Record<string, unknown>): void;
  warn(typeOrCat: string, msg: string, data?: Record<string, unknown>): void;
  error(typeOrCat: string, msg: string, data?: Record<string, unknown>): void;
}

/** 单机模式完整状态 */
export interface SoloState extends LogContext {
  chapter: number;
  chapterTitle: string;
  chapterFlavor: string;
  nodeIndex: number;
  mapNodes: SoloMapNode[];
  player: SoloPlayer;
  combat: SoloCombatState | null;
  pendingEvent: SoloEventDef | null;
  gameOver: boolean;
  victory: boolean;
  log: string[];
  /** 音效事件队列（useSoundSync 桥接层消费） */
  soundQueue: SoundEvent[];
  /** 结构化日志（[game] 控制台 + DevLogPanel） */
  devLog: SoloLogger;
}
