import { PHASE } from "./constants.js";
import { canUseSkill } from "./skills.js";
import { alivePlayers } from "./damage.js";

// ════════════════════════════════════════════════════════════
//  共享工具函数
// ════════════════════════════════════════════════════════════

function getDifficulty(player) {
  return player?.aiDifficulty || "easy";
}

function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

function avgDeckValue(state) {
  if (state.deck.length > 0) {
    const sum = state.deck.reduce((s, c) => s + c.value, 0);
    return sum / state.deck.length;
  }
  return 7;
}

function extraAttackBonus(state, player) {
  let b = 0;
  if (state.currentWeather === "sun") b += 2;
  if (player.characterId === "columbina" && player.moonPhase === 0) b += 4;
  if (player.characterId === "mavuika") b += player.fightingSpirit;
  if (
    player.allyIndex !== null &&
    player.allianceTurns > 0 &&
    player.betrayalPenalty <= 0
  )
    b += 2;
  return b;
}

function getGambleDrawCount(state, player) {
  let count = 2;
  if (state.currentWeather === "wind") count += 1;
  if (player.characterId === "columbina" && player.moonPhase === 2) count += 1;
  return count;
}

function getNextAliveIndex(state, currentIdx) {
  const sorted = [...state.players].sort((a, b) => a.index - b.index);
  const startIdx = sorted.findIndex((p) => p.index === currentIdx);
  for (let i = 1; i <= sorted.length; i++) {
    const next = sorted[(startIdx + i) % sorted.length];
    if (next.alive) return next.index;
  }
  return currentIdx;
}

function canAttack(state) {
  if (state.matchContext) return state.phase !== PHASE.PEACE;
  return state.round >= 4;
}

// ════════════════════════════════════════════════════════════
//  地狱难度偷看工具函数
// ════════════════════════════════════════════════════════════

function peekDeckTop(state, n) {
  const depth = Math.min(n || state.aiPeekDepth || 3, state.deck.length);
  return state.deck.slice(-depth).map((c) => ({ ...c }));
}

function peekOpponentTrap(state, opponent) {
  if (!opponent.trap) return null;
  return { ...opponent.trap };
}

function peekOpponentDefense(state, opponent) {
  return opponent.defensePile.map((c) => ({ ...c }));
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
//  上下文映射（decideTarget 用）
// ════════════════════════════════════════════════════════════

function mapContext(context) {
  if (!context) return "attack";
  const { action, characterId } = context;
  if (action === "attack") return "attack";
  if (action === "ally") return "ally";
  if (action === "skill") {
    if (characterId === "raiden") return "skillRaiden";
    if (characterId === "furina") return "skillFurina";
    if (characterId === "fenjin") return "skillFenjin";
    if (characterId === "aimiliya") return "skillAimiliya";
    if (characterId === "liniya") return "skillLiniya";
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
  const player = currentPlayer(state);
  const diff = getDifficulty(player);

  if (diff === "skilled") return decideSkilledTop(state, player);
  if (diff === "hell") return decideHellTop(state, player);
  return decideEasyTop(state, player);
}

/** 选择目标 */
export function decideTarget(state, context) {
  const player = currentPlayer(state);
  const diff = getDifficulty(player);
  const ctx = mapContext(context);

  if (diff === "skilled") return decideSkilledTarget(state, player, ctx);
  if (diff === "hell") return decideHellTarget(state, player, ctx);
  return decideEasyTarget(state, player);
}

/** 赌命选牌（陷阱 + 诱饵） */
export function decideGamblePick(state, drawnCards) {
  const player = currentPlayer(state);
  const diff = getDifficulty(player);

  if (diff === "skilled") return decideSkilledGamble(state, player, drawnCards);
  if (diff === "hell") return decideHellGamble(state, player, drawnCards);
  return decideEasyGamble(state, player, drawnCards);
}

/** 纳西妲占卜牌排序 */
export function decideNahidaOrder(state, scryCards) {
  const player = currentPlayer(state);
  const diff = getDifficulty(player);

  if (diff === "skilled") return decideSkilledNahida(state, player, scryCards);
  if (diff === "hell") return decideHellNahida(state, player, scryCards);
  return decideEasyNahida(state, player, scryCards);
}

/** 莉奈娅子技能 + 目标选择 */
export function decideLiniyaChoice(state) {
  const player = currentPlayer(state);
  const diff = getDifficulty(player);

  if (diff === "skilled" || diff === "hell")
    return decideSkilledLiniya(state, player);
  return decideEasyLiniya(state, player);
}

/** 菜月昴存档/读档选择 */
export function decideCaiyueangChoice(state) {
  const player = currentPlayer(state);
  const diff = getDifficulty(player);

  if (diff === "skilled" || diff === "hell")
    return decideSkilledCaiyueang(state, player);
  return decideEasyCaiyueang(state, player);
}

// ════════════════════════════════════════════════════════════
//  简单难度实现
// ════════════════════════════════════════════════════════════

function decideEasyTop(state, player) {
  const r = Math.random();
  const canAtk = canAttack(state);
  const canSkill =
    player.skillType === "active" &&
    player.skillUses > 0 &&
    state.currentWeather !== "arms";

  if (r < 0.55 && canAtk) return { action: "attack", reason: "random(55%)" };
  if (r < 0.82) return { action: "defense", reason: "random(27%)" };
  if (r < 0.94) return { action: "gamble", reason: "random(12%)" };
  if (canSkill) return { action: "skill", reason: "random(6%)" };
  return { action: "defense", reason: "fallback" };
}

function decideEasyTarget(state, player) {
  const alive = alivePlayers(state).filter((p) => p.index !== player.index);
  return { targetIndex: alive[0]?.index ?? 0, reason: "first opponent" };
}

function decideEasyGamble(state, player, cards) {
  return { trapIdx: 0, baitIdx: 1, reason: "first two" };
}

function decideEasyNahida(state, player, scryCards) {
  return [0, 1, 2, 3, 4];
}

function decideEasyLiniya(state, player) {
  const targets = alivePlayers(state).filter((p) => p.index !== player.index);
  return {
    subSkill: 2,
    targetIndex: targets[0]?.index ?? 0,
    reason: "dot",
  };
}

function decideEasyCaiyueang(state, player) {
  return { choice: "save", reason: "always save" };
}

// ════════════════════════════════════════════════════════════
//  熟练难度实现
// ════════════════════════════════════════════════════════════

function decideSkilledTop(state, player) {
  const candidates = [];

  if (canAttack(state)) {
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
  if (player.characterId === "columbina" && player.moonPhase === 0) score += 5;
  if (player.characterId === "mavuika") score += player.fightingSpirit * 2;
  if (
    player.allyIndex !== null &&
    player.allianceTurns > 0 &&
    player.betrayalPenalty <= 0
  )
    score += 4;
  if (target.betrayalPenalty > 0) score += 4;
  if (target.frozenBy !== null) score += 5;
  if (player.allyIndex === target.index) score -= 100;

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
  if (player.characterId === "columbina" && player.moonPhase === 1) score += 8;
  if (
    player.allyIndex !== null &&
    player.allianceTurns > 0 &&
    player.betrayalPenalty <= 0
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
  if (player.characterId === "columbina" && player.moonPhase === 2) score += 8;
  if (player.defensePile.length >= 3) score -= 10;
  return score;
}

function scoreSkillSkilled(state, player) {
  if (!canUseSkill(state, player)) return -Infinity;

  let score = 40;

  switch (player.characterId) {
    case "zhongli": {
      const lostHp = player.maxHp - player.hp;
      score += lostHp * 3;
      break;
    }
    case "raiden": {
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
    case "nahida":
      score += 20;
      break;
    case "furina": {
      if (state.phase === PHASE.PEACE) return -Infinity;

      // 如果已经有无视陷阱效果，不要再放技能
      if (player.ignoreTrapThisTurn) return -Infinity;

      const opponentsWithTrap = alivePlayers(state).filter(
        (p) => p.index !== player.index && p.trap,
      ).length;

      // 如果所有对手都没有陷阱，芙宁娜技能意义不大
      if (opponentsWithTrap === 0) return -Infinity;

      score += opponentsWithTrap * 8;

      // 技能次数快用完了，降低滥用倾向
      if (player.skillUses <= 1) score -= 40; // 最后一次省着用

      break;
    }
    case "fenjin": {
      if (state.phase === PHASE.PEACE) return -Infinity;
      const heal = Math.max(0, player.maxHp + 3 - player.hp);
      score += heal * 2;
      break;
    }
    case "liniya": {
      if (state.phase === PHASE.PEACE) return -Infinity;
      score += 10;
      break;
    }
    case "aimiliya":
      score += 5;
      break;
    case "venti": {
      if (state.phase === PHASE.PEACE) return -Infinity;
      if (state.round < 10) return -Infinity;
      score += 12;
      break;
    }
    case "caiyueang":
      score += player.savepoint ? 5 : 12;
      break;
    default:
      break;
  }

  // 最后一次技能省着用（菜月昴除外，他的机制不同）
  if (player.skillUses <= 1 && player.characterId !== "caiyueang") {
    score -= 25;
  }

  return score;
}

function scoreTargetSkilled(state, player, target, context) {
  let score = 0;
  score += Math.max(0, 15 - target.hp) * 2;
  score -= target.defensePile.length * 3;
  if (target.trap && context === "attack") score -= 10;
  if (target.frozenBy !== null) score += 5;

  switch (context) {
    case "attack":
      if (target.betrayalPenalty > 0) score += 8;
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
      if (target.betrayalPenalty > 0) score -= 50;
      if (target.allyIndex !== null) score -= 50;
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

function decideSkilledTarget(state, player, context) {
  const targets = alivePlayers(state).filter((p) => p.index !== player.index);
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

function decideSkilledGamble(state, player, cards) {
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

function decideSkilledNahida(state, player, scryCards) {
  const indexed = scryCards.map((c, i) => ({ ...c, origIdx: i }));
  if (state.phase === PHASE.PEACE || state.currentWeather === "arms") {
    indexed.sort((a, b) => b.value - a.value);
  } else {
    indexed.sort((a, b) => a.value - b.value);
  }
  return indexed.map((c) => c.origIdx);
}

// --- 熟练莉奈娅 ---

function decideSkilledLiniya(state, player) {
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

function decideSkilledCaiyueang(state, player) {
  const hpRatio = player.hp / player.maxHp;
  if (player.savepoint && hpRatio < 0.3) {
    return {
      choice: "load",
      reason: `low HP (${(hpRatio * 100).toFixed(0)}%)`,
    };
  }
  return { choice: "save", reason: "save point" };
}

// ════════════════════════════════════════════════════════════
//  地狱难度实现（偷看 + 增强评分）
// ════════════════════════════════════════════════════════════

function decideHellTop(state, player) {
  const candidates = [];

  if (canAttack(state)) {
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
  if (player.characterId === "columbina" && player.moonPhase === 0) score += 5;
  if (player.characterId === "mavuika") score += player.fightingSpirit * 2;
  if (
    player.allyIndex !== null &&
    player.allianceTurns > 0 &&
    player.betrayalPenalty <= 0
  )
    score += 4;
  if (target.betrayalPenalty > 0) score += 4;
  if (target.frozenBy !== null) score += 5;
  if (player.allyIndex === target.index) score -= 100;

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
      score += 15; // 能击破陷阱！加分
    } else if (result === "rebound") {
      const selfDmg = estimateExactDamage(atkVal, player);
      if (atkVal > player.hp + selfDmg) score -= 80;
      else score -= 15; // 反弹但不致命，只是亏
    } else {
      // tie
      if (atkVal > player.hp + estimateExactDamage(atkVal, player)) score -= 50;
      else if (target.hp <= atkVal + target.defensePile.length * 2)
        score += 5; // 平局但能杀对手
      else score -= 10;
    }
  }

  // 精确伤害穿透计算
  const exactDmg = estimateExactDamage(nextVal + bonus, target);

  // 斩杀机会检测
  if (exactDmg >= target.hp) {
    score += 30; // 必杀！最高优先级
    // 如果对方无陷阱或者能破陷阱，再加分
    if (!target.trap) score += 15;
  }
  // 有陷阱但能破 + 防御为0 + 残血 → 几乎必杀
  if (
    target.trap &&
    willTrapTrigger(nextVal + bonus, target.trap.value) === "break" &&
    exactDmg >= target.hp
  ) {
    score += 25;
  }
  if (exactDmg <= 0) score -= 10;

  // 安全攻击：对手无陷阱
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
  if (player.characterId === "columbina" && player.moonPhase === 1) score += 8;
  if (
    player.allyIndex !== null &&
    player.allianceTurns > 0 &&
    player.betrayalPenalty <= 0
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
  if (player.characterId === "columbina" && player.moonPhase === 2) score += 8;
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

    // 如果现有陷阱值 < 未来强牌值 → 值得替换
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
  if (target.frozenBy !== null) score += 5;

  switch (context) {
    case "attack": {
      if (target.betrayalPenalty > 0) score += 8;

      // 地狱增强：精确伤害穿透计算，优先可斩杀目标
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
      if (target.betrayalPenalty > 0) score -= 50;
      if (target.allyIndex !== null) score -= 50;
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

function decideHellTarget(state, player, context) {
  const targets = alivePlayers(state).filter((p) => p.index !== player.index);
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

function decideHellGamble(state, player, cards) {
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

function decideHellNahida(state, player, scryCards) {
  const indexed = scryCards.map((c, i) => ({ ...c, origIdx: i }));
  if (state.phase === PHASE.PEACE || state.currentWeather === "arms") {
    indexed.sort((a, b) => b.value - a.value);
  } else {
    // 战斗阶段：高牌→顶部
    indexed.sort((a, b) => a.value - b.value);
    // 地狱增强：如果能偷看到 scryCards 之后更深的牌，微调策略
    if ((state.aiPeekDepth || 3) > 5) {
      const beyond = peekDeckTop(state, state.aiPeekDepth - 5);
      if (beyond.length > 0) {
        const beyondAvg =
          beyond.reduce((s, c) => s + c.value, 0) / beyond.length;
        // 如果后续牌很强，则把 scry 中强牌也推上去抢先用
        // 反之如果后续牌弱，则保留 scry 强牌
        if (beyondAvg > avgDeckValue(state)) {
          // 后续牌强，维持高牌顶部策略（不变）
        } else {
          // 后续牌弱，把最高牌放底部保存
          indexed.sort((a, b) => b.value - a.value);
        }
      }
    }
  }
  return indexed.map((c) => c.origIdx);
}
