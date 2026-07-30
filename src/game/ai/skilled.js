import { PHASE, getCharData } from "../constants.js";
import { canUseSkill } from "../skills.js";
import { alivePlayers } from "../damage.js";
import {
  avgDeckValue,
  extraAttackBonus,
  canAttackAi,
  getNextAliveIndex,
} from "./index.js";

// ════════════════════════════════════════════════════════════
//  熟练难度实现
// ════════════════════════════════════════════════════════════

export function decideSkilledTop(state, player) {
  const candidates = [];

  if (canAttackAi(state)) {
    const targets = alivePlayers(state).filter((p) => p.index !== player.index);
    const bestAtk = Math.max(
      ...targets.map((t) => scoreAttackSkilled(state, player, t)),
    );
    candidates.push({ action: "attack", score: bestAtk });
  }

  candidates.push({
    action: "defense",
    score: scoreDefenseSkilled(state, player),
  });
  candidates.push({
    action: "gamble",
    score: scoreGambleSkilled(state, player),
  });

  if (canUseSkill(state, player)) {
    candidates.push({
      action: "skill",
      score: scoreSkillSkilled(state, player),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    action: candidates[0].action,
    reason: `score=${candidates[0].score.toFixed(0)}`,
  };
}

// --- 熟练评分函数 ---

function scoreAttackSkilled(state, player, target) {
  let score = 0;
  const hpRatio = target.hp / target.maxHp;
  score += (1 - hpRatio) * 20;
  score -= target.defensePile.length * 4;
  if (target.trap) score -= 8;
  if (state.currentWeather === "sun") score += 5;
  if (player.characterId === 7 && player.moonPhase === 0) score += 5;
  if (player.characterId === 6) score += player.fightingSpirit * 2;
  if (
    player.relations.allyIndex !== null &&
    player.relations.allianceTurns > 0 &&
    player.relations.betrayalPenalty <= 0
  )
    score += 4;
  if (target.relations.betrayalPenalty > 0) score += 4;
  if (target.statusEffects.frozenBy !== null) score += 5;
  if (player.relations.allyIndex === target.index) score -= 100;

  const avgCard = avgDeckValue(state);
  const bonus = extraAttackBonus(state, player);
  if (avgCard + bonus >= target.hp + target.defensePile.length * 4) score += 15;

  return score;
}

function scoreDefenseSkilled(state, player) {
  let score = 45;
  const hpRatio = player.hp / player.maxHp;
  score += (1 - hpRatio) * 35;
  if (player.defensePile.length === 0) score += 15;
  else if (player.defensePile.length <= 1) score += 8;
  if (state.currentWeather === "trade") score += 12;
  if (player.characterId === 7 && player.moonPhase === 1) score += 8;
  if (
    player.relations.allyIndex !== null &&
    player.relations.allianceTurns > 0 &&
    player.relations.betrayalPenalty <= 0
  )
    score += 6;
  if (player.defensePile.length >= 3) score -= 10;
  if (player.trap && player.bait) score -= 5;
  return score;
}

function scoreGambleSkilled(state, player) {
  let score = 20;
  if (!player.trap && !player.bait) score += 25;
  else if (!player.trap || !player.bait) score += 10;
  if (player.trap && player.trap.value < 5) score += 8;
  if (player.bait && player.bait.value < 3) score += 4;
  if (state.currentWeather === "wind") score += 10;
  if (player.characterId === 7 && player.moonPhase === 2) score += 8;
  if (player.defensePile.length >= 3) score -= 10;
  return score;
}

export function scoreSkillSkilled(state, player) {
  if (!canUseSkill(state, player)) return -Infinity;

  let score = 40;

  switch (player.characterId) {
    case 2: {
      // 钟离
      const lostHp = player.maxHp - player.hp;
      score += lostHp * 3;
      break;
    }
    case 3: {
      // 雷神
      if (state.phase === PHASE.PEACE) return -Infinity;
      if (state.round < 10) return -Infinity;
      const targets = alivePlayers(state).filter(
        (p) => p.index !== player.index,
      );
      const anyLethal = targets.some(
        (t) => 27 >= t.hp + t.defensePile.length * 4,
      );
      score += anyLethal ? 30 : 10;
      break;
    }
    case 4: // 纳西妲
      score += 20;
      break;
    case 5: {
      // 芙宁娜
      if (state.phase === PHASE.PEACE) return -Infinity;
      if (player.statusEffects.ignoreTrapThisTurn) return -Infinity;
      const opponentsWithTrap = alivePlayers(state).filter(
        (p) => p.index !== player.index && p.trap,
      ).length;
      if (opponentsWithTrap === 0) return -Infinity;
      score += opponentsWithTrap * 8;
      if (player.skillUses <= 1) score -= 40;
      break;
    }
    case 8: {
      // 风堇
      if (state.phase === PHASE.PEACE) return -Infinity;
      const heal = Math.max(0, player.maxHp + 3 - player.hp);
      score += heal * 2;
      break;
    }
    case 9: {
      // 莉奈娅
      if (state.phase === PHASE.PEACE) return -Infinity;
      score += 10;
      break;
    }
    case 10: // 爱蜜莉雅
      score += 5;
      break;
    case 1: {
      // 温迪
      if (state.phase === PHASE.PEACE) return -Infinity;
      if (state.round < 10) return -Infinity;
      score += 12;
      break;
    }
    case 11: // 菜月昴
      score += player.statusEffects.savepoint ? 5 : 12;
      break;
    default:
      break;
  }

  return score;
}

function scoreTargetSkilled(state, player, target, context) {
  let score = 0;
  score += Math.max(0, 15 - target.hp) * 2;
  score -= target.defensePile.length * 3;
  if (target.trap && context === "attack") score -= 10;
  if (target.statusEffects.frozenBy !== null) score += 5;

  switch (context) {
    case "attack":
      if (target.relations.betrayalPenalty > 0) score += 8;
      break;
    case "skillRaiden":
      if (27 >= target.hp + target.defensePile.length * 4) score += 20;
      break;
    case "skillFurina":
      if (target.trap) score += 15;
      break;
    case "skillFenjin":
      score += target.hp * 0.5 + target.defensePile.length * 2;
      break;
    case "skillAimiliya": {
      const nextIdx = getNextAliveIndex(state, state.currentPlayerIndex);
      if (target.index === nextIdx) score += 15;
      break;
    }
    case "ally":
      if (target.relations.betrayalPenalty > 0) score -= 50;
      if (target.relations.allyIndex !== null) score -= 50;
      score += target.hp * 0.3;
      break;
    case "skillLiniya":
      score += target.defensePile.length * 3;
      break;
  }

  if (target.index === player.index) return -Infinity;
  return score;
}

// --- 熟练目标选择 ---

export function decideSkilledTarget(state, player, context) {
  const targets = alivePlayers(state).filter(
    (p) =>
      p.index !== player.index &&
      !(player.teamId >= 0 && p.teamId === player.teamId),
  );
  const best = targets
    .map((t) => ({
      idx: t.index,
      score: scoreTargetSkilled(state, player, t, context),
    }))
    .sort((a, b) => b.score - a.score)[0];

  return {
    targetIndex: best?.idx ?? 0,
    reason: `score=${best?.score?.toFixed(0) ?? "?"}`,
  };
}

// --- 熟练赌命选牌 ---

export function decideSkilledGamble(state, player, cards) {
  const indexed = cards.map((c, i) => ({ ...c, origIdx: i }));
  indexed.sort((a, b) => b.value - a.value);

  let trapIdx = indexed[0].origIdx;
  let baitIdx = indexed[1].origIdx;

  if (indexed[0].value - indexed[1].value <= 2 && indexed[1].value >= 10) {
    trapIdx = indexed[1].origIdx;
    baitIdx = indexed[0].origIdx;
  }

  return {
    trapIdx,
    baitIdx,
    reason: `trap=${cards[trapIdx].value} bait=${cards[baitIdx].value}`,
  };
}

// --- 熟练纳西妲排序 ---

export function decideSkilledNahida(state, player, scryCards) {
  const indexed = scryCards.map((c, i) => ({ ...c, origIdx: i }));
  if (state.phase === PHASE.PEACE || state.currentWeather === "arms") {
    indexed.sort((a, b) => b.value - a.value);
  } else {
    indexed.sort((a, b) => a.value - b.value);
  }
  return indexed.map((c) => c.origIdx);
}

// --- 熟练莉奈娅 ---

export function decideSkilledLiniya(state, player) {
  const targets = alivePlayers(state).filter((p) => p.index !== player.index);
  const best = targets
    .map((t) => ({
      idx: t.index,
      score: scoreTargetSkilled(state, player, t, "skillLiniya"),
    }))
    .sort((a, b) => b.score - a.score)[0];

  const target = state.players[best.idx];
  const subSkill = target.defensePile.length > 0 ? 1 : 2;
  return {
    subSkill,
    targetIndex: best.idx,
    reason: subSkill === 1 ? "steal" : "dot",
  };
}

// --- 熟练菜月昴 ---

export function decideSkilledCaiyueang(state, player) {
  const hpRatio = player.hp / player.maxHp;
  if (player.statusEffects.savepoint && hpRatio < 0.3) {
    return {
      choice: "load",
      reason: `low HP (${(hpRatio * 100).toFixed(0)}%)`,
    };
  }
  return { choice: "save", reason: "save point" };
}
