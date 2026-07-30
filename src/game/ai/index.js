import { PHASE, getCharData } from "../constants.js";
import { canUseSkill } from "../skills.js";
import { alivePlayers } from "../damage.js";
import {
  decideEasyTop,
  decideEasyTarget,
  decideEasyGamble,
  decideEasyNahida,
  decideEasyLiniya,
  decideEasyCaiyueang,
} from "./easy.js";
import {
  decideSkilledTop,
  decideSkilledTarget,
  decideSkilledGamble,
  decideSkilledNahida,
  decideSkilledLiniya,
  decideSkilledCaiyueang,
  scoreSkillSkilled,
} from "./skilled.js";
import {
  decideHellTop,
  decideHellTarget,
  decideHellGamble,
  decideHellNahida,
} from "./hell.js";

// ════════════════════════════════════════════════════════════
//  共享工具函数（所有难度共用）
// ════════════════════════════════════════════════════════════

export function getDifficulty(player) {
  return player?.aiDifficulty || "easy";
}

export function currentAiPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

export function avgDeckValue(state) {
  if (state.deck.length > 0) {
    const sum = state.deck.reduce((s, c) => s + c.value, 0);
    return sum / state.deck.length;
  }
  return 7;
}

export function extraAttackBonus(state, player) {
  let b = 0;
  if (state.currentWeather === "sun") b += 2;
  if (player.characterId === 7 && player.moonPhase === 0) b += 4; // 哥伦比娅弦月
  if (player.characterId === 6) b += player.fightingSpirit; // 玛薇卡
  if (
    player.relations.allyIndex !== null &&
    player.relations.allianceTurns > 0 &&
    player.relations.betrayalPenalty <= 0
  )
    b += 2;
  return b;
}

export function getGambleDrawCount(state, player) {
  let count = 2;
  if (state.currentWeather === "wind") count += 1;
  if (player.characterId === 7 && player.moonPhase === 2) count += 1; // 哥伦比娅新月
  return count;
}

export function getNextAliveIndex(state, currentIdx) {
  const sorted = [...state.players].sort((a, b) => a.index - b.index);
  const startIdx = sorted.findIndex((p) => p.index === currentIdx);
  for (let i = 1; i <= sorted.length; i++) {
    const next = sorted[(startIdx + i) % sorted.length];
    if (next.alive) return next.index;
  }
  return currentIdx;
}

export function canAttackAi(state) {
  if (state.matchContext) return state.phase !== PHASE.PEACE;
  return state.round >= 4;
}

/**
 * 上下文映射（decideTarget 用）
 */
export function mapContext(context) {
  if (!context) return "attack";
  const { action, characterId } = context;
  if (action === "attack") return "attack";
  if (action === "ally") return "ally";
  if (action === "skill") {
    if (characterId === 3) return "skillRaiden"; // 雷神
    if (characterId === 5) return "skillFurina"; // 芙宁娜
    if (characterId === 8) return "skillFenjin"; // 风堇
    if (characterId === 10) return "skillAimiliya"; // 爱蜜莉雅
    if (characterId === 9) return "skillLiniya"; // 莉奈娅
    return "attack";
  }
  return "attack";
}

// ════════════════════════════════════════════════════════════
//  公共 API（7个导出函数）
// ════════════════════════════════════════════════════════════

/** 判断玩家是否为 AI */
export function isAiPlayer(player) {
  return !!player.isAI;
}

/** 顶层决策：选择行动（攻击/防御/赌命/技能） */
export function decideTopAction(state) {
  const player = currentAiPlayer(state);
  const diff = getDifficulty(player);

  if (diff === "skilled") return decideSkilledTop(state, player);
  if (diff === "hell") return decideHellTop(state, player);
  return decideEasyTop(state, player);
}

/** 选择目标 */
export function decideTarget(state, context) {
  const player = currentAiPlayer(state);
  const diff = getDifficulty(player);
  const ctx = mapContext(context);

  if (diff === "skilled") return decideSkilledTarget(state, player, ctx);
  if (diff === "hell") return decideHellTarget(state, player, ctx);
  return decideEasyTarget(state, player);
}

/** 赌命选牌（陷阱 + 诱饵） */
export function decideGamblePick(state, drawnCards) {
  const player = currentAiPlayer(state);
  const diff = getDifficulty(player);

  if (diff === "skilled") return decideSkilledGamble(state, player, drawnCards);
  if (diff === "hell") return decideHellGamble(state, player, drawnCards);
  return decideEasyGamble(state, player, drawnCards);
}

/** 纳西妲占卜牌排序 */
export function decideNahidaOrder(state, scryCards) {
  const player = currentAiPlayer(state);
  const diff = getDifficulty(player);

  if (diff === "skilled") return decideSkilledNahida(state, player, scryCards);
  if (diff === "hell") return decideHellNahida(state, player, scryCards);
  return decideEasyNahida(state, player, scryCards);
}

/** 莉奈娅子技能 + 目标选择 */
export function decideLiniyaChoice(state) {
  const player = currentAiPlayer(state);
  const diff = getDifficulty(player);

  if (diff === "skilled" || diff === "hell")
    return decideSkilledLiniya(state, player);
  return decideEasyLiniya(state, player);
}

/** 菜月昴存档/读档选择 */
export function decideCaiyueangChoice(state) {
  const player = currentAiPlayer(state);
  const diff = getDifficulty(player);

  if (diff === "skilled" || diff === "hell")
    return decideSkilledCaiyueang(state, player);
  return decideEasyCaiyueang(state, player);
}
