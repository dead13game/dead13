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
import { canUseSkill as kernelCanUseSkill } from "./flow/commands.js";
import { getCurrentWeather, getNextWeather } from "./rules/weather.js";

function indexOfUid(raw, uid) {
  if (uid == null) return null;
  const p = raw.players.find((x) => x.uid === uid);
  return p ? p.index : null;
}

/** 旧 UI 读的那套字段形状(纯展示用) */
function renderPlayer(raw, p) {
  const idx = (uid) => indexOfUid(raw, uid);
  const bonus = {};
  for (const [uid, v] of Object.entries(p.effects.damageBonus || {})) {
    const i = idx(Number(uid));
    if (i !== null) bonus[i] = v;
  }

  return {
    uid: p.uid,
    index: p.index,
    name: p.name,
    teamId: p.teamId,
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
    canUseSkill: kernelCanUseSkill(getCtx(raw), p),
    canUseHolyWord: kernelCanHolyWord(getCtx(raw), p),
  };
}

/** ctx 与 state 的绑定放在 WeakMap 里,避免污染 state(也不进存档) */
const CTX = new WeakMap();

export function getCtx(state) {
  return CTX.get(state) ?? null;
}

export function attachCtx(state, ctx) {
  CTX.set(state, ctx);
  return state;
}

/** 构建只读视图 */
export function buildView(raw) {
  const players = raw.players.map((p) => renderPlayer(raw, p));
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
    devLog: raw.devLog ?? { entries: [] },

    // 兼容字段
    pendingAttackCard: raw.pendingAttackCard,
    pendingVentiCards: raw.pendingVentiCards,
    scryCards: raw.scryCards,
    pendingGamble: raw.pendingGamble,

    // 模式信息(旧 UI 用 matchContext 判断 1v1)
    matchContext: raw.mode?.id === "match" ? raw.mode.match : null,
    modeId: raw.mode?.id ?? "classic",

    // 玩家
    players,

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

    getCurrentWeather: () => getCurrentWeather(raw),
    getNextWeather: () => getNextWeather(raw),
    getArtifactData,
    getCharData: kernelGetCharData,
    CHARACTERS,
  };
}

// ── 兼容旧 import(UI 侧函数式调用) ──

export function currentPlayer(view) {
  return view.currentPlayer?.() ?? null;
}

export function canUseSkill(view, player) {
  if (player === undefined) return !!view?.canUseSkill;
  return !!player?.canUseSkill;
}

export function canUseHolyWord(view, player) {
  if (player === undefined) return !!view?.canUseHolyWord;
  return !!player?.canUseHolyWord;
}

export function getAllianceTargets(view) {
  return view.allianceTargets?.() ?? [];
}

export { getArtifactData };
export const getCharData = kernelGetCharData;
