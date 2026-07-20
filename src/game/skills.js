import { PHASE, STEP } from "./constants.js";
import { drawCards, cardDisplay } from "./deck.js";
import { applyDamage } from "./damage.js";
import { CAT } from "./gameLogger.js";

let _currentPlayer, _addLog, _ensureDeck, _endAction;

export function _injectSkillsDeps(
  currentPlayerFn,
  addLogFn,
  ensureDeckFn,
  endActionFn,
) {
  _currentPlayer = currentPlayerFn;
  _addLog = addLogFn;
  _ensureDeck = ensureDeckFn;
  _endAction = endActionFn;
}

function currentPlayer(state) {
  return _currentPlayer(state);
}
function addLog(state, msg) {
  _addLog(state, msg);
}
function ensureDeck(state, n) {
  _ensureDeck(state, n);
}
function endAction(state) {
  _endAction(state);
}

// ===== 技能入口 =====

export function canUseSkill(state, player) {
  if (!player.alive) return false;
  if (player.skillType !== "active") return false;
  if (player.characterId === "caiyueang")
    return state.step === STEP.PICK_ACTION;
  if (player.skillUses <= 0) return false;
  if (state.currentWeather === "arms") return false;
  return state.step === STEP.PICK_ACTION;
}

export function executeSkill(state) {
  if (state.step !== STEP.PICK_ACTION) {
    state.devLog.warn(CAT.ANOMALY, `技能在非预期步骤执行: ${state.step}`);
    return;
  }
  const player = currentPlayer(state);
  if (!canUseSkill(state, player)) {
    state.devLog.warn(
      CAT.ANOMALY,
      `${player.name} 尝试使用技能但 canUseSkill=false`,
      {
        skillUses: player.skillUses,
        skillType: player.skillType,
        weather: state.currentWeather,
        step: state.step,
      },
    );
    return false;
  }

  state.devLog.info(CAT.SKILL, `${player.name} 释放技能: ${player.skillName}`, {
    characterId: player.characterId,
    skillUsesBefore: player.skillUses,
  });

  switch (player.characterId) {
    case "venti":
      return startSkillVenti(state);
    case "zhongli":
      return executeSkillZhongli(state);
    case "raiden":
      return executeSkillRaidenPick(state);
    case "nahida":
      return startSkillNahida(state);
    case "furina":
      return executeSkillFurina(state);
    case "fenjin":
      return executeSkillFenjin(state);
    case "liniya":
      return executeSkillLiniya(state);
    case "aimiliya":
      return executeSkillAimiliya(state);
    case "caiyueang":
      return executeSkillCaiyueang(state);
    default:
      return false;
  }
}

// ===== 温迪 =====

function startSkillVenti(state) {
  const player = currentPlayer(state);
  if (state.phase === PHASE.PEACE) {
    addLog(state, "和平阶段禁止攻击");
    return;
  }
  if (state.round < 10) {
    addLog(state, "第10回合后才能使用");
    return;
  }

  ensureDeck(state, 2);
  const r = drawCards(state.deck, 2);
  const cards = r.drawn.map((c) => ({ ...c, faceUp: false }));
  state.deck = r.remaining;

  state.pendingVentiCards = cards;
  state.pendingAttackCard = {
    ...cards[0],
    value: cards[0].value + cards[1].value,
    faceUp: true,
  };
  state.step = STEP.ATTACK_SHOW_CARD;
  player.skillUses--;
  addLog(
    state,
    `${player.name} 千风之诗 ${cardDisplay(cards[0])} ${cardDisplay(cards[1])}`,
  );
  cards.forEach((c) => (c.faceUp = true));
}

// ===== 钟离 =====

function executeSkillZhongli(state) {
  const player = currentPlayer(state);
  const lostHp = player.maxHp - player.hp;
  const shieldValue = 18 + lostHp * 2;
  const shield = {
    id: `shield-zhongli-${Date.now()}`,
    suit: "",
    rank: "盾",
    value: shieldValue,
    faceUp: true,
    isShield: true,
  };
  player.defensePile.push(shield);
  player.skillUses--;
  addLog(state, `${player.name} 释放坚如磐石 护盾${shieldValue}点`);
  state.devLog.info(
    CAT.SKILL,
    `钟离坚如磐石: 护盾=${shieldValue} (18+${lostHp}×2)`,
    {
      lostHp,
      shieldValue,
      defCount: player.defensePile.length,
    },
  );
  endAction(state);
  return true;
}

// ===== 雷电将军 =====

function executeSkillRaidenPick(state) {
  const player = currentPlayer(state);
  if (state.phase === PHASE.PEACE) {
    addLog(state, "和平阶段禁止攻击");
    return;
  }
  if (state.round < 10) {
    addLog(state, "第10回合后才能使用");
    return;
  }
  state.step = STEP.SKILL_PICK_TARGET;
  addLog(state, `${player.name} 释放无想的一刀`);
}

export function executeRaidenSkill(state, targetIdx) {
  const attacker = currentPlayer(state);
  const target = state.players.find((p) => p.index === targetIdx);
  if (!target?.alive) return;

  attacker.skillUses--;
  const baseDamage = 27;
  let damage = baseDamage;
  const bonuses = {};

  if (state.currentWeather === "sun") {
    damage += 2;
    bonuses.sun = 2;
  }
  if (attacker.characterId === "mavuika" && attacker.fightingSpirit > 0) {
    bonuses.spirit = attacker.fightingSpirit;
    damage += attacker.fightingSpirit;
  }

  state.devLog.info(
    CAT.SKILL,
    `雷电将军 无想一刀: ${attacker.name}→${target.name} 伤害=${damage}`,
    {
      baseDamage,
      bonuses,
      finalDamage: damage,
      targetHpBefore: target.hp,
    },
  );

  addLog(state, `${attacker.name} 无想的一刀 ➜ ${target.name}`);
  applyDamage(state, target, damage);
  attacker.ignoreTrapThisTurn = false;
  if (!state.gameOver) endAction(state);
}

// ===== 纳西妲 =====

function startSkillNahida(state) {
  const player = currentPlayer(state);
  ensureDeck(state, 5);
  const r = drawCards(state.deck, 5);
  state.scryCards = r.drawn.map((c) => ({ ...c, faceUp: true }));
  state.deck = r.remaining;
  player.skillUses--;
  state.step = STEP.SKILL_NAHIDA;
  addLog(state, `${player.name} 释放智慧之殿堂`);
}

export function submitNahidaScry(state, orderArr) {
  if (state.step !== STEP.SKILL_NAHIDA || !state.scryCards) return;
  const cards = orderArr.map((i) => state.scryCards[i]);
  cards.reverse();
  cards.forEach((c) => (c.faceUp = false));
  state.deck.push(...cards);
  state.scryCards = null;
  addLog(state, `${currentPlayer(state).name} 牌库顶重排`);
  state.endTurn = false;
  state.step = STEP.PICK_ACTION;
  endAction(state);
}

// ===== 芙宁娜 =====

function executeSkillFurina(state) {
  const player = currentPlayer(state);
  if (state.phase === PHASE.PEACE) {
    addLog(state, "和平阶段禁止攻击");
    return;
  }
  if (state.round < 4) {
    addLog(state, "第4回合后才能攻击");
    return;
  }
  player.ignoreTrapThisTurn = true;
  player.skillUses--;
  state.pendingFurinaTarget = true;
  state.step = STEP.SKILL_PICK_TARGET;
  addLog(state, `${player.name} 释放审判，选择要交换陷阱的目标`);
}

export function executeFurinaSwap(state, targetIdx) {
  const player = currentPlayer(state);
  const target = state.players.find((p) => p.index === targetIdx);
  if (!target?.alive) return;

  const temp = target.trap;
  target.trap = target.bait;
  target.bait = temp;
  if (target.trap) target.trap.faceUp = false;
  if (target.bait) target.bait.faceUp = true;

  state.pendingFurinaTarget = false;
  state.endTurn = false;
  addLog(state, `${target.name}的陷阱明暗交换`);
  endAction(state);
}

// ===== 风堇 =====

function executeSkillFenjin(state) {
  const player = currentPlayer(state);
  if (state.phase === PHASE.PEACE) {
    addLog(state, "和平阶段禁止攻击");
    return;
  }
  player.skillUses--;
  state.step = STEP.SKILL_PICK_TARGET;
  state._fenjinHeal = null;
  addLog(state, `${player.name} 释放重见澄澈晴空`);
}

export function executeFenjinSkill(state, targetIdx) {
  const player = currentPlayer(state);
  const target = state.players.find((p) => p.index === targetIdx);
  if (!target?.alive) return;

  const oldMaxHp = player.maxHp;
  player.maxHp += 3;
  const healAmount = player.maxHp - player.hp;
  player.hp = player.maxHp;
  const damage = healAmount * 2;

  state.devLog.info(
    CAT.SKILL,
    `风堇重见澄澈晴空: 生命上限${oldMaxHp}→${player.maxHp} 回复${healAmount} 伤害=${damage}`,
    {
      maxHpChange: `${oldMaxHp}→${player.maxHp}`,
      healAmount,
      damage,
      target: target.name,
      targetHpBefore: target.hp,
    },
  );

  addLog(
    state,
    `${player.name} 生命上限 ${oldMaxHp}→${player.maxHp}，回复 ${healAmount} 点`,
  );
  addLog(state, `对 ${target.name} 造成 ${damage} 点伤害`);
  applyDamage(state, target, damage);
  if (!state.gameOver) endAction(state);
}

// ===== 莉奈娅 =====

function executeSkillLiniya(state) {
  const player = currentPlayer(state);
  if (state.phase === PHASE.PEACE) {
    addLog(state, "和平阶段禁止攻击");
    return;
  }
  player.skillUses--;
  state._liniyaSubSkill = true;
  state.step = STEP.LINIYA_PICK;
  addLog(state, `${player.name} 释放青春之力的馈赠，选择子技能和目标`);
}

export function executeLiniyaSkill(state, targetIdx, subSkill) {
  const player = currentPlayer(state);
  const target = state.players.find((p) => p.index === targetIdx);
  if (!target?.alive) return;

  if (subSkill === 1) {
    player.stealTarget = { idx: targetIdx, turns: 3 };
    player.damageBonus[targetIdx] = (player.damageBonus[targetIdx] || 0) + 2;
    addLog(
      state,
      `${player.name} 偷取 ${target.name} 的防御牌（3回合），对其伤害+2`,
    );
  } else {
    player.dotTarget = { idx: targetIdx, turns: 5 };
    addLog(
      state,
      `${player.name} 对 ${target.name} 施加5回合DoT（每回合5点无视陷阱）`,
    );
  }

  state._liniyaSubSkill = null;
  state.step = STEP.PICK_ACTION;
  endAction(state);
}

// ===== 爱蜜莉雅 =====

function executeSkillAimiliya(state) {
  const player = currentPlayer(state);
  player.skillUses--;
  state.step = STEP.SKILL_PICK_TARGET;
  state._aimiliyaFreeze = true;
  addLog(state, `${player.name} 释放冻结`);
}

export function executeAimiliyaSkill(state, targetIdx) {
  const player = currentPlayer(state);
  const target = state.players.find((p) => p.index === targetIdx);
  if (!target?.alive) return;

  target.frozenBy = player.index;
  addLog(state, `${target.name} 被冻结，将跳过下一次行动`);
  state._aimiliyaFreeze = null;
  state.step = STEP.PICK_ACTION;
  state.endTurn = false;
  endAction(state);
}

// ===== 菜月昴（入口） =====

function executeSkillCaiyueang(state) {
  const player = currentPlayer(state);
  state._caiyueangMode = true;
  state.step = STEP.CAIYUEANG_PICK;
  addLog(state, `${player.name} 死亡回归 — 选择存档或读档`);
}

export { executeSkillCaiyueang };
