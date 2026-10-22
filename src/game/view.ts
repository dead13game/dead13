// 只读 view-model — UI 只读这里,不再直接摸内核 state 的字段路径
//
// 为什么需要:
//   - PIXI 精灵、ActionBar 的标签/按钮、动画桥接都在读「玩家字段」;
//   - 新内核把字段分了区(resources / effects / relations / char / artifact),
//     而 UI 关心的是「显示什么」。
//   - 这个 view 是纯派生物,不是第二真相:所有值都在 getter 里从 state 计算。
//
// 约定:view 只读。任何写操作都必须走 api.dispatch(state, command)。

import { CHARACTERS, getCharData as kernelGetCharData } from "./characters/index.js";
import { getArtifactData } from "./rules/artifacts.js";
import { canUseHolyWord as kernelCanHolyWord } from "./rules/artifacts.js";
import { allianceTargets as kernelAllianceTargets } from "./rules/alliance.js";
import { canUseSkillNow as kernelCanUseSkill } from "./flow/commands.js";
import { getCurrentWeather, getNextWeather } from "./rules/weather.js";
import type { WeatherInfo } from "./rules/weather.js";
import type {
  Card,
  CharacterMeta,
  Ctx,
  DrawFeedEntry,
  GameLogger,
  GameState,
  GambleSetup,
  Pending,
  Phase,
  Player,
  PlayerSavepoint,
  SoundEvent,
  Step,
  UnitKind,
  WeatherCard,
  WeatherId,
} from "./types.js";

/** 位移效果(偷取/持续伤害)在视图里的形状:uid 折成渲染序 index */
export interface TimedRefView {
  idx: number | null;
  turns: number;
}

/** 砂狼白子无人机(视图) */
export interface DroneView {
  uid: number;
  hp: number;
  defCount: number;
  targetIndex: number | null;
}

/** 玩家效果分区(视图) */
export interface PlayerStatusEffectsView {
  frozenBy: number | null;
  ignoreTrapThisTurn: boolean;
  /** 旧字段:从未被写入,恒 false */
  extraAction: boolean;
  stealTarget: TimedRefView | null;
  dotTarget: TimedRefView | null;
  savepoint: PlayerSavepoint | null;
  /** 渲染序 index → 额外伤害 */
  damageBonus: Record<number, number>;
  drone: DroneView | null;
}

/** 玩家关系分区(视图) */
export interface PlayerRelationsView {
  allyIndex: number | null;
  allianceTurns: number;
  betrayalPenalty: number;
  allyKillBonus: boolean;
  consecutiveGambles: number;
  gamblePenalty: boolean;
  attackedThisRound: number;
}

/**
 * 一名玩家 / 塔 / 召唤物的只读视图。
 * 字段全部由 renderPlayer 从内核 Player 的分区字段映射而来(纯展示用)。
 */
export interface PlayerView {
  uid: number;
  index: number;
  name: string;
  teamId: number;
  kind: UnitKind;
  towerIndex: number | null;
  ownerIndex: number | null;
  characterId: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  defensePile: Card[];
  trap: Card | null;
  bait: Card | null;

  // 资源
  skillUses: number;
  loadUses: number;
  holyWordUses: number;
  breakCount: number;
  fightingSpirit: number;
  moonPhase: number;
  chorus: number;
  attackStreak: number;
  droneTargetIndex: number | null;

  // 效果 / 关系
  statusEffects: PlayerStatusEffectsView;
  relations: PlayerRelationsView;

  // 圣遗物
  artifactId: number | null;
  artifactActive: boolean;
  artifactRoundsLeft: number;

  // AI
  isAI: boolean;
  aiDifficulty: string | null;

  // 派生
  charData: CharacterMeta | null;
  canUseSkill: boolean;
  canUseHolyWord: boolean;
}

/**
 * 只读视图模型 —— UI / PIXI / AI 唯一的数据来源。
 *
 * devLog 直接用 `GameLogger`（它已经覆盖 `entries` 与导出方法）；
 * `buildView` 在无 logger 时回退一个只带 `entries` 的空壳，也满足该类型。
 */
export type DevLogView = GameLogger;

/**
 * 无 logger 时的空壳（测试/未接线的 state 会走到这里）。
 * 之所以补齐 4 个空实现：`DevLogView` 就是 `GameLogger`，
 * 只有 `entries` 的对象不满足契约；这些方法本身不做任何事。
 */
const EMPTY_DEV_LOG: DevLogView = {
  entries: [],
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
};

/** `buildView(state)` 的返回类型:局面快照 + 玩家视图 + 只读选择器 */
export interface ViewModel {
  // 局面
  phase: Phase;
  step: Step;
  round: number;
  currentPlayerIndex: number;
  gameOver: boolean;
  winnerIndex: number;
  pending: Pending | null;
  deck: Card[];
  grave: Card[];
  weatherDeck: WeatherCard[];
  currentWeather: WeatherId | null;
  nextWeather: WeatherId | null;
  useWeather: boolean;
  messageLog: string[];
  soundQueue: SoundEvent[];
  devLog: DevLogView;

  // v3.5：摸牌事件（抽牌动画）
  drawFeed: DrawFeedEntry[];
  drawSeq: number;

  // 兼容字段
  pendingAttackCard: Card | null;
  pendingVentiCards: Card[] | null;
  scryCards: Card[] | null;
  pendingGamble: GambleSetup | null;

  // 模式信息(旧 UI 用 matchContext 判断 1v1)
  matchContext: unknown;
  modeId: string;

  // 玩家 / 塔 / 召唤物
  players: PlayerView[];
  towers: PlayerView[];
  summons: PlayerView[];
  units: PlayerView[];

  // ── 选择器(UI 只读调用) ──
  currentPlayer: () => PlayerView | null;
  alivePlayers: () => PlayerView[];
  canUseSkill: (player?: PlayerView | null) => boolean;
  canUseHolyWord: (player?: PlayerView | null) => boolean;
  allianceTargets: () => Player[];
  playerByUid: (uid: number) => PlayerView | null;
  playerByIndex: (index: number) => PlayerView | null;
  unitByUid: (uid: number) => PlayerView | null;
  unitByIndex: (index: number) => PlayerView | null;
  towersOf: (teamId: number) => PlayerView[];
  getCurrentWeather: () => WeatherInfo | null;
  getNextWeather: () => WeatherInfo | null;
  getArtifactData: typeof getArtifactData;
  getCharData: typeof kernelGetCharData;
  CHARACTERS: typeof CHARACTERS;
}

function indexOfUid(
  raw: GameState,
  uid: number | null | undefined,
): number | null {
  if (uid == null) return null;
  const p = raw.players.find((x) => x.uid === uid);
  return p ? p.index : null;
}

/** 旧 UI 读的那套字段形状(纯展示用) */
function renderPlayer(raw: GameState, p: Player): PlayerView {
  const idx = (uid: number | null | undefined) => indexOfUid(raw, uid);
  const bonus: Record<number, number> = {};
  for (const [uid, v] of Object.entries(p.effects.damageBonus || {})) {
    const i = idx(Number(uid));
    if (i !== null) bonus[i] = v;
  }
  const drone = (raw.summons ?? []).find(
    (s) => s.ownerUid === p.uid && s.alive,
  );

  return {
    uid: p.uid,
    index: p.index,
    name: p.name,
    teamId: p.teamId,
    kind: p.kind ?? "hero",
    towerIndex: p.towerIndex ?? null,
    ownerIndex: idx(p.ownerUid),
    characterId: p.characterId,
    hp: p.hp,
    maxHp: p.maxHp,
    alive: p.alive,
    defensePile: p.defensePile,
    trap: p.trap,
    bait: p.bait,

    // 资源
    skillUses: p.resources.skillUses,
    loadUses: p.resources.loadUses,
    holyWordUses: p.resources.holyWordUses,
    breakCount: p.resources.breakCount,
    fightingSpirit: p.char.fightingSpirit ?? 0,
    moonPhase: p.char.moonPhase ?? 0,
    // v3.5 新角色叠层 / 无人机索敌
    chorus: p.char.chorus ?? 0,
    attackStreak: p.char.attackStreak ?? 0,
    droneTargetIndex: idx(p.char?.targetUid),

    // 效果
    statusEffects: {
      frozenBy: idx(p.effects.frozenBy),
      ignoreTrapThisTurn: p.effects.ignoreTrapThisTurn,
      extraAction: false, // 旧字段从未被写入
      stealTarget: p.effects.stealTarget
        ? { idx: idx(p.effects.stealTarget.uid), turns: p.effects.stealTarget.turns }
        : null,
      dotTarget: p.effects.dotTarget
        ? { idx: idx(p.effects.dotTarget.uid), turns: p.effects.dotTarget.turns }
        : null,
      savepoint: p.effects.savepoint,
      damageBonus: bonus,
      drone: drone
        ? {
            uid: drone.uid,
            hp: drone.hp,
            defCount: drone.defensePile.length,
            targetIndex: idx(drone.char?.targetUid),
          }
        : null,
    },

    // 关系
    relations: {
      allyIndex: idx(p.relations.allyUid),
      allianceTurns: p.relations.allianceTurns,
      betrayalPenalty: p.relations.betrayalPenalty,
      allyKillBonus: p.relations.allyKillBonus,
      consecutiveGambles: p.relations.consecutiveGambles,
      gamblePenalty: p.relations.gamblePenalty,
      attackedThisRound: p.relations.attackedThisRound,
    },

    // 圣遗物
    artifactId: p.artifact.id,
    artifactActive: p.artifact.active,
    artifactRoundsLeft: p.artifact.roundsLeft,

    // AI
    isAI: p.ai.enabled,
    aiDifficulty: p.ai.difficulty,

    // 派生
    charData: CHARACTERS[p.characterId] ?? null,
    // buildView 只在内核接线后调用(ctx 由 createSession/attachCtx 注入)。
    // `!` 只做类型收窄,运行时仍按原样把可能为 null 的 ctx 传进去。
    canUseSkill: kernelCanUseSkill(getCtx(raw)!, p),
    canUseHolyWord: kernelCanHolyWord(getCtx(raw)!, p),
  };
}

/** ctx 与 state 的绑定放在 WeakMap 里,避免污染 state(也不进存档) */
const CTX = new WeakMap<GameState, Ctx>();

export function getCtx(state: GameState): Ctx | null {
  return CTX.get(state) ?? null;
}

export function attachCtx(state: GameState, ctx: Ctx): GameState {
  CTX.set(state, ctx);
  return state;
}

/** 构建只读视图 */
export function buildView(raw: GameState): ViewModel {
  const players = raw.players.map((p) => renderPlayer(raw, p));
  const towers = (raw.towers ?? []).map((t) => renderPlayer(raw, t));
  const summons = (raw.summons ?? []).map((s) => renderPlayer(raw, s));
  const units = [...players, ...towers, ...summons];
  return {
    // 局面
    phase: raw.phase,
    step: raw.step,
    round: raw.round,
    currentPlayerIndex: raw.currentPlayerIndex,
    gameOver: raw.gameOver,
    winnerIndex: raw.winnerIndex,
    pending: raw.pending,
    deck: raw.deck,
    grave: raw.grave,
    weatherDeck: raw.weatherDeck,
    currentWeather: raw.currentWeather,
    nextWeather: raw.nextWeather,
    useWeather: raw.useWeather,
    messageLog: raw.messageLog,
    soundQueue: raw.soundQueue,
    devLog: raw.devLog ?? EMPTY_DEV_LOG,

    // v3.5：摸牌事件（抽牌动画）
    drawFeed: raw.drawFeed ?? [],
    drawSeq: raw.drawSeq ?? 0,

    // 兼容字段
    pendingAttackCard: raw.pendingAttackCard,
    pendingVentiCards: raw.pendingVentiCards,
    scryCards: raw.scryCards,
    pendingGamble: raw.pendingGamble,

    // 模式信息(旧 UI 用 matchContext 判断 1v1)
    matchContext: raw.mode?.id === "match" ? raw.mode.match : null,
    modeId: raw.mode?.id ?? "classic",

    // 玩家 / 塔 / 召唤物
    players,
    towers,
    summons,
    units,

    // ── 选择器(UI 只读调用) ──
    currentPlayer: () => players[raw.currentPlayerIndex] ?? null,
    alivePlayers: () => players.filter((p) => p.alive),
    canUseSkill: (p) => !!p?.canUseSkill,
    canUseHolyWord: (p) => !!p?.canUseHolyWord,
    allianceTargets: () => {
      const ctx = getCtx(raw);
      const me = raw.players[raw.currentPlayerIndex];
      if (!ctx || !me) return [];
      return kernelAllianceTargets(ctx, me);
    },
    playerByUid: (uid) => players.find((p) => p.uid === uid) ?? null,
    playerByIndex: (i) => players.find((p) => p.index === i) ?? null,
    unitByUid: (uid) => units.find((u) => u.uid === uid) ?? null,
    unitByIndex: (i) => units.find((u) => u.index === i) ?? null,
    towersOf: (teamId) => towers.filter((t) => t.teamId === teamId),

    getCurrentWeather: () => getCurrentWeather(raw),
    getNextWeather: () => getNextWeather(raw),
    getArtifactData,
    getCharData: kernelGetCharData,
    CHARACTERS,
  };
}

// ── 兼容旧 import(UI 侧函数式调用) ──

export function currentPlayer(view: ViewModel): PlayerView | null {
  return view.currentPlayer?.() ?? null;
}

export function canUseSkill(
  view: ViewModel,
  player?: PlayerView | null,
): boolean {
  if (player === undefined) return !!view?.canUseSkill;
  return !!player?.canUseSkill;
}

export function canUseHolyWord(
  view: ViewModel,
  player?: PlayerView | null,
): boolean {
  if (player === undefined) return !!view?.canUseHolyWord;
  return !!player?.canUseHolyWord;
}

export function getAllianceTargets(view: ViewModel): Player[] {
  return view.allianceTargets?.() ?? [];
}

export { getArtifactData };
export const getCharData = kernelGetCharData;
