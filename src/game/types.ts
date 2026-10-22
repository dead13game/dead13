// 内核共享类型 — 整个 src/game 的类型契约
//
// 约定（迁移期）:
//   - 本文件只放「跨模块共享」的类型;单模块私有的 shape 写在该模块内。
//   - 任何地方 `import type { ... } from "../types.js"` —— 类型导入会被完全擦除,
//     不会产生运行时依赖,因此不会破坏 CLAUDE.md 核心设计原则 1（src/game 零依赖）。
//   - 禁止 `any`。拿不准的第三方/序列化快照用 `unknown`,由消费方收窄。

import { PHASE, STEP } from "./core/constants.js";
// 日志条目以 gameLogger.ts 的定义为准（它是唯一产生方），这里只做类型引用
import type { LogEntry } from "./gameLogger.js";

// ── 阶段 / 步骤 ──────────────────────────────────────────────
export type Phase = (typeof PHASE)[keyof typeof PHASE];
export type Step = (typeof STEP)[keyof typeof STEP];

// ── 牌 ──────────────────────────────────────────────────────
export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

/**
 * 一张牌。
 * suit / rank 允许缺省:防御区与陷阱里存在「只有点数」的合成牌
 * （钟离护盾、莉奈娅偷来的盾、砂狼白子无人机盾），它们从不参与牌面文案渲染。
 */
export interface Card {
  id: string;
  suit?: Suit;
  rank?: Rank;
  value: number;
  faceUp: boolean;

  // ── 防御区扩展（rules/damage.ts 与 flow/commands/defense.ts 写入）──
  /** 防御牌当前有效防御值：被击穿/残盾时递减，不改 value */
  defenseValue?: number;
  /** 防御牌放入防御区时的初始防御值（UI 显示上限用） */
  maxDefenseValue?: number;
  /** 护盾牌：不计入「防御牌被击穿」次数，消耗后不进墓地 */
  isShield?: boolean;
  /** 防御牌归属者 uid（沃雅妮莎「领唱」按此计数） */
  ownerUid?: number;

  // ── 陷阱扩展（flow/commands/gamble.ts 写入，UI 读）──
  /** 陷阱的对外显示点数：真陷阱隐藏，展示诱饵点数（团战塔/队友显示用） */
  decoyValue?: number;
}

// ── 随机源 ──────────────────────────────────────────────────
export interface Rng {
  next(): number;
  int(n: number): number;
  pick<T>(arr: readonly T[]): T | undefined;
  chance(p: number): boolean;
}

// ── 计时引用（冻结/偷取/持续伤害）────────────────────────────
export interface TimedRef {
  uid: number;
  turns: number;
}

// ── 玩家 ────────────────────────────────────────────────────
export type UnitKind = "hero" | "tower" | "drone";

/** 资源分区：次数类 */
export interface PlayerResources {
  skillUses: number;
  loadUses: number;
  holyWordUses: number;
  breakCount: number;
}

/** 效果分区：通用状态（角色私有状态一律放 player.char） */
export interface PlayerEffects {
  frozenBy: number | null;
  stealTarget: TimedRef | null;
  dotTarget: TimedRef | null;
  /** uid → 额外伤害 */
  damageBonus: Record<string, number>;
  ignoreTrapThisTurn: boolean;
  /** 菜月昴存档快照（结构见 persistence/snapshot.ts，不参与普通序列化） */
  savepoint: PlayerSavepoint | null;
}

/** 存档快照：原样保存整个 state 的深拷贝，只有菜月昴会读 */
export type PlayerSavepoint = Record<string, unknown>;

/** 关系分区 */
export interface PlayerRelations {
  allyUid: number | null;
  allianceTurns: number;
  betrayalPenalty: number;
  allyKillBonus: boolean;
  consecutiveGambles: number;
  gamblePenalty: boolean;
  /** 围攻计数：本回合被攻击次数 */
  attackedThisRound: number;
  /** 旧字段：按 index 记录盟友（新代码用 allyUid） */
  allyIndex?: number | null;
}

/** 圣遗物分区 */
export interface PlayerArtifact {
  /** 圣遗物 id：数值（`rules/artifacts.ts` 的 ARTIFACTS 表用数字 key，UI 也按 `=== 1` 判断） */
  id: number | null;
  active: boolean;
  roundsLeft: number;
  boost?: number;
}

/** AI 分区 */
export interface PlayerAi {
  enabled: boolean;
  difficulty: string | null;
}

/**
 * 角色私有状态槽。
 *
 * 每个角色的 `stateSchema` 不同，但槽位是可枚举的有限集合（下面这些）：
 * 所以**不用索引签名**——未声明的槽会直接报错，能挡住拼写错误。
 * 槽在运行时可能是 `undefined`（该角色没有这个槽），沿用原代码的 `?? 0` 兜底习惯。
 */
export interface CharState {
  /** 沃雅妮莎：领唱层数 */
  chorus?: number;
  /** 哥伦比亚：月相（0 弦月 / 1 满月 / 2 新月） */
  moonPhase?: number;
  /** 玛薇卡：斗志层数 */
  fightingSpirit?: number;
  /** 薇斯纳：连击计数 */
  attackStreak?: number;
  /** 砂狼白子无人机：锁定的目标 uid */
  targetUid?: number;
  /** 砂狼白子无人机：锁定目标的单位类型（英雄/塔/无人机） */
  targetKind?: UnitKind;
}

/** 玩家 / 英雄 / 塔 / 召唤物的统一结构（kind 区分） */
export interface Player {
  uid: number;
  index: number;
  characterId: number;
  name: string;
  teamId: number;
  kind: UnitKind;
  towerIndex: number | null;
  ownerUid: number | null;

  hp: number;
  maxHp: number;
  alive: boolean;

  defensePile: Card[];
  trap: Card | null;
  bait: Card | null;

  resources: PlayerResources;
  effects: PlayerEffects;
  relations: PlayerRelations;
  char: CharState;
  artifact: PlayerArtifact;
  ai: PlayerAi;

  /** 旧字段：createPlayer 曾把圣言次数写在顶层（保留以免存档失配） */
  holyWordUses?: number;
  /** 旧字段：AI 读 statusEffects.savepoint */
  statusEffects?: { savepoint?: PlayerSavepoint | null };
  /** 团战：本回合是否复活过 / 复活回合 */
  revivedThisRound?: number;
  respawnRound?: number;
}

// ── 待决问题（pending）────────────────────────────────────────
export type PendingType =
  | "action"
  | "target"
  | "gambleSetup"
  | "scryOrder"
  | "liniya"
  | "saveOrLoad";

export interface Pending {
  type: PendingType;
  /** 语义标签：attack / ally / skill:<id> … */
  purpose: string;
  /** 发起者 uid */
  asker: number;
  /** 可选目标 uid */
  options: number[];
  /** 额外数据（牌、子技能、排序结果…） */
  data: PendingData | null;
}

/** pending.data 的形状随 purpose 变化，用宽 shape + 收窄读取 */
export type PendingData = Record<string, unknown>;

// ── 回合状态 ────────────────────────────────────────────────
export interface TurnState {
  extraAction: boolean;
  suspend: boolean | string | null;
  resync: boolean;
  savedBy: number | null;
}

// ── 天气 ────────────────────────────────────────────────────
export type WeatherId = "calm" | "wind" | "trade" | "sun" | "rain" | "arms";

export interface WeatherCard {
  id: WeatherId;
}

// ── 音效 / 摸牌事件 ─────────────────────────────────────────
export interface SoundEvent {
  type: string;
  seq: number;
}

export interface DrawFeedEntry {
  seq: number;
  kind: string;
  actorUid: number | null;
  source: string | null;
  hidden: boolean;
  cards: Card[];
}

// ── 赌命 ────────────────────────────────────────────────────
/**
 * 赌命阶段的附加数据。
 * 注意 `trapIdx` / `baitIdx` 是**可选**的：`flow/commands/gamble.ts` 在
 * 抽牌后只写 `{ drawnCards }`，陷阱位置另有 pending.data 承载。
 */
export interface GambleSetup {
  trapIdx?: number;
  baitIdx?: number;
  /** 已抽出的赌命牌（flow/commands/gamble.ts 写入，投影只读它） */
  drawnCards?: Card[];
  [key: string]: unknown;
}

// ── 模式扩展状态 ─────────────────────────────────────────────
/** 骰子战争：一个对阵（三局两胜/七局四胜） */
export interface DiceSeries {
  a: number;
  b: number;
  aWins: number;
  bWins: number;
}

export interface DiceRoll {
  round: number;
  a: number;
  b: number;
}

export interface DiceMatchSide {
  idx: number;
  name: string;
  camp: string;
  icon: string;
  score: number;
}

/** 单局结束摘要（`diceWar.finishMatch` 写入） */
export interface DiceMatchResult {
  aScore: number;
  bScore: number;
  winnerName: string;
  loserName: string;
  overtime: boolean;
}

/** 当前对阵的局分（只有胜场与目标，不含 a/b 座次） */
export interface DiceSeriesScore {
  aWins: number;
  bWins: number;
  winTarget: number;
}

/** 已结束的一场比赛记录（`state.finishedMatches` 的元素） */
export interface FinishedMatchRecord {
  matchNo: number;
  phase: string;
  a: { name: string; camp: string; icon: string; score: number };
  b: { name: string; camp: string; icon: string; score: number };
  winner: string;
  overtime: boolean;
  /** 多局阶段记录局分，单局阶段为 null */
  sets: { aWins: number; bWins: number } | null;
}

export interface DiceMatch {
  matchNo: number;
  a: DiceMatchSide;
  b: DiceMatchSide;
  round: number;
  phase: string;
  aRoll: number | null;
  bRoll: number | null;
  lastRoll: DiceRoll | null;
  rolls: DiceRoll[];
  overtime: boolean;
  tieEntered: boolean;
  winner: "a" | "b" | null;
  result: DiceMatchResult | null;
  seriesScore: DiceSeriesScore | null;
  seriesDone: boolean;
}

/** 世界杯：小组赛一场 */
export interface GroupMatch {
  home: number;
  away: number;
  played: boolean;
  result: "home" | "draw" | "away" | null;
  isPlayerMatch: boolean;
}

/** 世界杯：小组积分榜一行 */
export interface GroupStanding {
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  isPlayer?: boolean;
  [key: string]: unknown;
}

/** 联赛：一场比赛结果 */
export interface LeagueResult {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  [key: string]: unknown;
}

/** 联赛：进行中的上下文 */
export interface LeagueContext {
  round: number;
  /** 每队卡牌加成表（见 ModeAdapter.cardBonus 的说明） */
  cardBonus?: Record<number, { attackBonus: number; defenseBonus: number }>;
  [key: string]: unknown;
}

// ── 游戏状态（唯一可变数据体）────────────────────────────────
/**
 * 字段分三段:
 *   1. 内核核心 —— 经典/团战/1v1/联赛/世界杯共用
 *   2. 模式扩展 —— 只有对应模式会写（diceWar / worldCup / league）
 *   3. 兼容字段 —— UI/动画直接读，P6 才收敛
 */
export interface GameState {
  // ── 单位 ──
  players: Player[];
  /** v3.5：团战的防御塔与召唤物与角色分开放 */
  towers: Player[];
  summons: Player[];
  unitSeq: number;

  // ── 摸牌事件（只驱动 UI 动画，不入存档）──
  drawFeed: DrawFeedEntry[];
  drawSeq: number;

  // ── 回合 ──
  currentPlayerIndex: number;
  phase: Phase;
  step: Step;
  pending: Pending | null;
  round: number;
  peaceRounds: number;
  peaceStartRound: number;
  turn: TurnState;

  // ── 牌 ──
  deck: Card[];
  grave: Card[];
  deckCount?: number;

  // ── 天气 ──
  weatherDeck: WeatherCard[];
  currentWeather: WeatherId | null;
  nextWeather: WeatherId | null;
  useWeather: boolean;

  // ── 日志 / 音效 / id ──
  messageLog: string[];
  soundQueue: SoundEvent[];
  soundSeq: number;
  idSeq: number;

  // ── 结局 ──
  gameOver: boolean;
  winnerIndex: number;

  // ── 模式 ──
  mode: ModeAdapter | null;

  // ── 兼容字段（UI/动画直接读）──
  pendingAttackCard: Card | null;
  pendingVentiCards: Card[] | null;
  scryCards: Card[] | null;
  pendingGamble: GambleSetup | null;
  devLog?: GameLogger | null;

  // ── 模式扩展：骰子战争 ──
  format?: string;
  matchups?: DiceSeries[];
  matchIndex?: number;
  advancers?: number[];
  finishedMatches?: unknown[];
  champion?: number | null;
  series?: DiceSeries | null;
  currentMatch?: DiceMatch | null;
  matchCounter?: number;

  // ── 模式扩展：世界杯 ──
  groupMatches?: GroupMatch[];
  groupStandings?: GroupStanding[];
  groupTeams?: unknown[];
  knockoutRound?: string | null;
  knockoutOpponent?: unknown;
  playerTeamId?: string | null;
  _usedOpponents?: string[];
  matchHistory?: unknown[];

  // ── 模式扩展：联赛 ──
  leagueContext?: LeagueContext | null;
  results?: LeagueResult[];
  currentRound?: number;
  _currentRound?: number;
  aiPeekDepth?: number;
  roundSimulated?: boolean;
  matchContext?: unknown;
}

// ── 日志 ────────────────────────────────────────────────────
export interface GameLogger {
  info(cat: string, msg: string, data?: unknown): void;
  debug(cat: string, msg: string, data?: unknown): void;
  warn(cat: string, msg: string, data?: unknown): void;
  error(cat: string, msg: string, data?: unknown): void;
  hpChange?(...args: unknown[]): void;

  // ── DevLogPanel 直接消费的部分（见 gameLogger.ts 的 createGameLogger 返回值）──
  /** 日志缓冲（同一个可变数组，UI 直接读长度/元素） */
  entries?: LogEntry[];
  getEntries?(): LogEntry[];
  exportText?(): string;
  clear?(): void;
  stepChange?(from: string, to: string, extra?: Record<string, unknown>): void;
}

// ── 模式适配器 ───────────────────────────────────────────────
export interface ModeRules {
  peaceRounds?: number;
  /** "round" = 经典按回合计；"phase" = 1v1 按阶段计 */
  attackGate?: "round" | "phase";
  attackMinRound?: number;
  alliance?: boolean;
  allyMinPlayers?: number;
  besiege?: boolean;
  [rule: string]: unknown;
}

/**
 * 模式适配器接口。
 * 每个模式的扩展方法都声明为可选 —— 内核只调用存在的那些，
 * 与迁移前「state.mode?.xxx」的判空习惯保持一致。
 */
export interface ModeAdapter {
  id: string;
  rules: ModeRules;

  onNewRound?(ctx: Ctx): void;
  onRoundEnd?(ctx: Ctx): void;
  checkGameOver?(ctx: Ctx): void;
  onAfterCheck?(ctx: Ctx): void;
  onPlayerDeath?(ctx: Ctx, player: Player): void;
  filterPending?(ctx: Ctx, pending: Pending): Pending | null;
  info?(): unknown;

  // 1v1 / 联赛 / 世界杯 / 团战的扩展点
  match?: unknown;
  /**
   * 存档:模式把自己的纯数据挂进来（如 `{ match }`）。
   * 只允许返回可 JSON 化的数据 —— persistence 会把它写进存档的 mode 段。
   */
  serialize?(): Record<string, unknown>;
  startNextLife?(ctx: Ctx): void;
  onMatchEnd?(ctx: Ctx, ...args: unknown[]): void;
  canSubstitute?(...args: unknown[]): boolean;
  isSubstitutionValid?(...args: unknown[]): boolean;
  executeSubstitution?(ctx: Ctx, ...args: unknown[]): void;
  /**
   * 联赛 3V3 的每队卡牌加成表：`{ 0: {attackBonus, defenseBonus}, 1: {...} }`。
   * 注意它是**数据**不是方法（`rules/modifiers.ts` 与联赛测试都按 `cb[teamId]` 读）。
   */
  cardBonus?: Record<number, { attackBonus: number; defenseBonus: number }>;
  getGroupMatchResult?(...args: unknown[]): unknown;
}

// ── 回合引擎（flow/turn.ts 注入）─────────────────────────────
export interface TurnEngine {
  pass(ctx: Ctx): unknown;
  extra(ctx: Ctx): unknown;
  next(ctx: Ctx): unknown;
}

// ── 运行时上下文 ─────────────────────────────────────────────
export interface CtxPlayers {
  all(): Player[];
  alive(): Player[];
  current(): Player | null;
  byUid(uid: number): Player | null;
  byIndex(i: number): Player | null;
}

export interface CtxUnits {
  all(): Player[];
  alive(): Player[];
  byUid(uid: number | null): Player | null;
}

export interface CtxDeck {
  draw(n?: number): Card[];
  ensure(n?: number): void;
  discard(...cards: (Card | null | undefined)[]): void;
  isExhausted(): boolean;
}

export interface CtxTurn {
  pass(): unknown;
  extra(): unknown;
  next(): unknown;
  suspend(reason?: boolean | string): void;
  resync(): void;
}

export interface Ctx {
  state: GameState;
  rng: Rng;

  log(msg: string): void;
  dev(cat: string, msg: string, data?: unknown): void;
  devDebug(cat: string, msg: string, data?: unknown): void;
  devWarn(cat: string, msg: string, data?: unknown): void;
  devError(cat: string, msg: string, data?: unknown): void;
  hpChange(...args: unknown[]): void;

  sound(type: string): void;

  players: CtxPlayers;
  units: CtxUnits;
  deck: CtxDeck;
  turn: CtxTurn;

  ask(pending: Pending): Pending;
  clearPending(): void;
  drawEvent(cards: (Card | null | undefined)[], meta?: DrawEventMeta): DrawFeedEntry | null;
  uniqueId(prefix?: string): string;

  engine: TurnEngine | null;
  attachEngine(api: TurnEngine): Ctx;
  mode: ModeAdapter | null;
}

export interface DrawEventMeta {
  kind?: string;
  actorUid?: number | null;
  source?: string | null;
  hidden?: boolean;
}

// ── 角色插件 ────────────────────────────────────────────────
export interface CharacterMeta {
  id: number;
  name: string;
  title?: string;
  icon?: string;
  hp: number;
  speed: number;
  skillName?: string;
  skillType?: string;
  skillDesc?: string;
  maxUses?: number;
  loadMaxUses?: number;
  holyWordUses?: number;
  [key: string]: unknown;
}

export interface CharacterDef {
  id: number;
  meta: CharacterMeta;
  stateSchema?: CharState;
  canUse?(ctx: Ctx, player: Player): boolean;
  canUseNow?(ctx: Ctx, player: Player): boolean;
  use?(ctx: Ctx, player: Player): void;
  onAnswer?(ctx: Ctx, player: Player, pending: Pending, answer: unknown): void;
  hooks?: CharacterHooks;
  attackModifiers?: Modifier[];
  defenseModifiers?: Modifier[];
  [key: string]: unknown;
}

export interface CharacterHooks {
  onRoundStart?(ctx: Ctx, player: Player): void;
  onTurnStart?(ctx: Ctx, player: Player): void;
  onDefense?(ctx: Ctx, player: Player): void;
  onDamageDealt?(ctx: Ctx, env: DamageDealtEnv): void;
  roundStartPriority?: number;
  damageDealtPriority?: number;
}

/** 攻击命中后的钩子 env（`flow/commands/attack.ts` 构造，玛薇卡/风堇读它） */
export interface DamageDealtEnv {
  attacker: Player;
  target: Player;
  attackValue: number;
  defenseConsumed: number;
  trapTriggered: boolean;
  hadTrap: boolean;
  actualHpLost: number;
}

/**
 * 加减成管道的一步（`rules/modifiers.ts` 的 `reduceModifiers`）。
 * 注意**参数顺序是运行时事实**：`apply(ctx, env, value)` ——
 * `rules/modifiers.ts` 自己还定义了泛型更严的 `RulesModifier<E>`，
 * 这里保持与它同形，角色插件的 `attackModifiers` 才能直接赋给 `Modifier[]`。
 */
export interface Modifier<E = unknown> {
  id?: string;
  priority?: number;
  apply?(ctx: Ctx, env: E, value: number): number;
  [key: string]: unknown;
}

// ── AI 决策视图（ai/ 的输入契约）─────────────────────────────
// 为什么不是 Player:
//   GameShell / LeagueShell / WorldCupShell 调 AI 时传的是 buildView() 的只读视图,
//   view 把分区字段又展开成旧字段形状:
//     resources.skillUses → skillUses
//     effects.frozenBy    → statusEffects.frozenBy (uid 折成 index)
//     relations.allyUid   → relations.allyIndex
//   并派生 canUseSkill / aiDifficulty。AI 的决策是「看局面打分」,
//   读的就是这份视图,不能改成读内核 Player(会改变取值来源)。
//   这里只声明 AI 实际读取的最小字段集,模块内不再重复声明。
export interface AiViewPlayer {
  index: number;
  characterId: number;
  teamId: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  defensePile: Card[];
  trap: Card | null;
  bait: Card | null;

  /** resources.skillUses */
  skillUses: number;
  /** char.moonPhase（哥伦比娅） */
  moonPhase: number;
  /** char.fightingSpirit（玛薇卡） */
  fightingSpirit: number;

  statusEffects: {
    frozenBy: number | null;
    ignoreTrapThisTurn: boolean;
    savepoint: PlayerSavepoint | null;
  };
  relations: {
    allyIndex: number | null;
    allianceTurns: number;
    betrayalPenalty: number;
  };

  /** ai.enabled */
  isAI: boolean;
  /** ai.difficulty */
  aiDifficulty: string | null;
  /** 由内核 canUseSkillNow 派生 */
  canUseSkill: boolean;
}

/** AI 决策读的只读视图（buildView 的子集） */
export interface AiViewState {
  players: AiViewPlayer[];
  currentPlayerIndex: number;
  deck: Card[];
  currentWeather: WeatherId | null;
  phase: Phase;
  round: number;
  /** 1v1 / 联赛等模式上下文;经典模式为 null（view 里是 mode.match） */
  matchContext: unknown;
  /** 地狱难度偷看深度（联赛/世界杯会写入） */
  aiPeekDepth?: number;
}
