import { getCharData, PHASE } from "../constants.js";
import { canUseSkill } from "../skills.js";
import { alivePlayers } from "../damage.js";
import {
  avgDeckValue,
  extraAttackBonus,
  canAttackAi,
  getNextAliveIndex,
  getGambleDrawCount,
} from "./index.js";
import { scoreSkillSkilled } from "./skilled.js";

// ════════════════════════════════════════════════════════════
//  地狱难度偷看工具函数
// ════════════════════════════════════════════════════════════

function peekDeckTop(state, n) {
  const depth = Math.min(n || state.aiPeekDepth || 3, state.deck.length);
  return state.deck.slice(-depth).map((c) => ({ ...c }));
}

function estimateExactDamage(attackValue, target) {
  let remaining = attackValue;
  const defCopy = [...target.defensePile.map((c) => ({ ...c }))];
  while (remaining > 0 && defCopy.length > 0) {
    const top = defCopy[defCopy.length - 1];
    if (top.value >= remaining) {
      remaining = 0;
    } else {
      remaining -= top.value;
      defCopy.pop();
    }
  }
  return remaining;
}

function willTrapTrigger(atkVal, trapVal) {
  if (atkVal < trapVal) return "rebound";
  if (atkVal === trapVal) return "tie";
  return "break";
}

// ════════════════════════════════════════════════════════════
//  地狱难度实现（偷看 + 增强评分）
// ════════════════════════════════════════════════════════════

export function decideHellTop(state, player) {
  const candidates = [];

  if (canAttackAi(state)) {
    const targets = alivePlayers(state).filter((p) => p.index !== player.index);
    const bestAtk = Math.max(
      ...targets.map((t) => scoreAttackHell(state, player, t)),
    );
    candidates.push({ action: "attack", score: bestAtk });
  }

  candidates.push({
    action: "defense",
    score: scoreDefenseHell(state, player),
  });
  candidates.push({
    action: "gamble",
    score: scoreGambleHell(state, player),
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

// --- 地狱评分函数 ---

function scoreAttackHell(state, player, target) {
  let score = 0;
  const hpRatio = target.hp / target.maxHp;
  score += (1 - hpRatio) * 20;
  score -= target.defensePile.length * 4;
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

  // 地狱增强：知道下一张牌的真实值
  const nextCard = peekDeckTop(state, 1)[0];
  const nextVal = nextCard?.value ?? 7;
  const bonus = extraAttackBonus(state, player);
  if (nextVal + bonus >= target.hp + target.defensePile.length * 4) score += 15;

  // 精确陷阱判断
  if (target.trap) {
    const trapVal = target.trap.value;
    const atkVal = nextVal + bonus;
    const result = willTrapTrigger(atkVal, trapVal);

    if (result === "break") {
      score += 15;
    } else if (result === "rebound") {
      const selfDmg = estimateExactDamage(atkVal, player);
      if (atkVal > player.hp + selfDmg) score -= 80;
      else score -= 15;
    } else {
      if (atkVal > player.hp + estimateExactDamage(atkVal, player)) score -= 50;
      else if (target.hp <= atkVal + target.defensePile.length * 2) score += 5;
      else score -= 10;
    }
  }

  // 精确伤害穿透计算
  const exactDmg = estimateExactDamage(nextVal + bonus, target);

  if (exactDmg >= target.hp) {
    score += 30;
    if (!target.trap) score += 15;
  }
  if (
    target.trap &&
    willTrapTrigger(nextVal + bonus, target.trap.value) === "break" &&
    exactDmg >= target.hp
  ) {
    score += 25;
  }
  if (exactDmg <= 0) score -= 10;

  if (!target.trap) score += 12;

  return score;
}

function scoreDefenseHell(state, player) {
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

  // 地狱增强：偷看下一张防御牌的真实值
  const nextCard = peekDeckTop(state, 1)[0];
  if (nextCard && nextCard.value > avgDeckValue(state)) score += 8;

  return score;
}

function scoreGambleHell(state, player) {
  let score = 20;
  if (!player.trap && !player.bait) score += 25;
  else if (!player.trap || !player.bait) score += 10;
  if (player.trap && player.trap.value < 5) score += 8;
  if (player.bait && player.bait.value < 3) score += 4;
  if (state.currentWeather === "wind") score += 10;
  if (player.characterId === 7 && player.moonPhase === 2) score += 8;
  if (player.defensePile.length >= 3) score -= 10;

  // 地狱增强：偷看赌命抽牌数的牌库顶部
  const drawCount = getGambleDrawCount(state, player);
  const peeked = peekDeckTop(state, drawCount);
  if (peeked.length > 0) {
    const avg = avgDeckValue(state);
    const strongCount = peeked.filter((c) => c.value > avg).length;
    const weakCount = peeked.filter((c) => c.value < avg).length;
    if (strongCount > weakCount) score += 10;
    else if (weakCount > strongCount) score -= 10;

    const maxPeeked = Math.max(...peeked.map((c) => c.value));
    if (player.trap && player.trap.value < maxPeeked) score += 10;
  }

  return score;
}

function scoreTargetHell(state, player, target, context) {
  let score = 0;
  score += Math.max(0, 15 - target.hp) * 2;
  score -= target.defensePile.length * 3;
  if (target.trap && context === "attack") score -= 10;
  if (target.statusEffects.frozenBy !== null) score += 5;

  switch (context) {
    case "attack": {
      if (target.relations.betrayalPenalty > 0) score += 8;
      const nextCard = peekDeckTop(state, 1)[0];
      const atkVal = (nextCard?.value ?? 7) + extraAttackBonus(state, player);
      const exactDmg = estimateExactDamage(atkVal, target);
      if (exactDmg >= target.hp) score += 25;
      if (exactDmg <= 0 && target.defensePile.length > 0) score -= 15;
      break;
    }
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

// --- 地狱目标选择 ---

export function decideHellTarget(state, player, context) {
  const targets = alivePlayers(state).filter(
    (p) =>
      p.index !== player.index &&
      !(player.teamId >= 0 && p.teamId === player.teamId),
  );
  const best = targets
    .map((t) => ({
      idx: t.index,
      score: scoreTargetHell(state, player, t, context),
    }))
    .sort((a, b) => b.score - a.score)[0];

  return {
    targetIndex: best?.idx ?? 0,
    reason: `score=${best?.score?.toFixed(0) ?? "?"}`,
  };
}

// --- 地狱赌命选牌 ---

export function decideHellGamble(state, player, cards) {
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

// --- 地狱纳西妲排序 ---

export function decideHellNahida(state, player, scryCards) {
  const indexed = scryCards.map((c, i) => ({ ...c, origIdx: i }));
  if (state.phase === PHASE.PEACE || state.currentWeather === "arms") {
    indexed.sort((a, b) => b.value - a.value);
  } else {
    indexed.sort((a, b) => a.value - b.value);
    if ((state.aiPeekDepth || 3) > 5) {
      const beyond = peekDeckTop(state, state.aiPeekDepth - 5);
      if (beyond.length > 0) {
        const beyondAvg =
          beyond.reduce((s, c) => s + c.value, 0) / beyond.length;
        if (beyondAvg <= avgDeckValue(state)) {
          indexed.sort((a, b) => b.value - a.value);
        }
      }
    }
  }
  return indexed.map((c) => c.origIdx);
}
