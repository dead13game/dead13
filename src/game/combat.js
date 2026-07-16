import { PHASE, STEP } from "./constants.js";
import { drawCards, cardDisplay } from "./deck.js";
import { applyDamage } from "./damage.js";
import { CAT } from "./gameLogger.js";

// 这些函数从 gameState.js 导入（live binding，调用时已就绪）
let _currentPlayer, _addLog, _ensureDeck, _endAction;

export function _injectCombatDeps(
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

// ===== 攻击 =====

export function startAttack(state) {
  if (state.step !== STEP.PICK_ACTION) return;
  const canAttack = state.matchContext
    ? state.phase !== PHASE.PEACE
    : state.round >= 4;
  if (!canAttack) {
    if (state.phase === PHASE.PEACE) {
      addLog(state, "和平阶段禁止攻击");
    } else {
      addLog(state, "第4回合后才能攻击");
    }
    return;
  }

  ensureDeck(state);

  const r = drawCards(state.deck, 1);
  const card = r.drawn[0];
  state.deck = r.remaining;
  card.faceUp = false;

  state.pendingAttackCard = card;
  state.step = STEP.ATTACK_SHOW_CARD;
  addLog(state, `${currentPlayer(state).name} 攻击 摸出${cardDisplay(card)}`);
  state.devLog.info(
    CAT.ATTACK,
    `${currentPlayer(state).name} 攻击抽牌: ${cardDisplay(card)} (${card.value})`,
    { cardId: card.id, value: card.value, deckRemaining: state.deck.length },
  );

  setTimeout(() => {
    if (state.pendingAttackCard === card) {
      card.faceUp = true;
    }
  }, 320);
}

export function executeAttack(state, targetIdx) {
  const attacker = currentPlayer(state);
  const target = state.players.find((p) => p.index === targetIdx);
  if (!target?.alive) return;

  // 经典模式：不能攻击盟友，盟友只能通过背刺伤害
  if (!state.matchContext && attacker.allyIndex === targetIdx) {
    addLog(state, "不能攻击盟友，请使用背刺");
    state.devLog.warn(
      CAT.ANOMALY,
      `${attacker.name} 尝试攻击盟友 ${target.name}`,
    );
    state.pendingAttackCard = null;
    state.step = STEP.PICK_ACTION;
    return;
  }

  if (state.step !== STEP.ATTACK_SHOW_CARD) {
    state.devLog.warn(CAT.ANOMALY, `攻击在非预期步骤执行: ${state.step}`, {
      expected: STEP.ATTACK_SHOW_CARD,
      actual: state.step,
    });
  }

  if (target.index !== targetIdx) {
    state.devLog.error(
      CAT.ANOMALY,
      `目标索引不匹配！传入=${targetIdx} 找到=${target.index}`,
      { targetIdx, foundIndex: target.index, foundName: target.name },
    );
  }

  let attackValue;
  let attackCards = [];

  const card = state.pendingAttackCard;
  state.pendingAttackCard = null;
  if (!card) return;

  const baseCardValue = card.value;

  if (state.pendingVentiCards) {
    attackCards = state.pendingVentiCards;
    attackValue = attackCards[0].value + attackCards[1].value;
    state.pendingVentiCards = null;
    addLog(
      state,
      `${attacker.name} 千风之诗 ${cardDisplay(attackCards[0])} ${cardDisplay(attackCards[1])}`,
    );
    state.devLog.info(
      CAT.ATTACK,
      `温迪双卡攻击: ${cardDisplay(attackCards[0])}+${cardDisplay(attackCards[1])}=${attackValue}`,
    );
  } else {
    attackCards = [card];
    attackValue = card.value;
    addLog(state, `${attacker.name} 攻击 ${target.name}`);
  }

  state.devLog.info(
    CAT.ATTACK,
    `${attacker.name} → ${target.name}，基础伤害=${attackValue}`,
    {
      attackerHp: attacker.hp,
      targetHp: target.hp,
      targetDefCount: target.defensePile.length,
      targetHasTrap: !!target.trap,
    },
  );

  // 天气加成
  if (state.currentWeather === "sun") {
    attackValue += 2;
    addLog(state, "烈日当空");
    state.devLog.debug(CAT.WEATHER, `烈日当空 +2 → ${attackValue}`);
  }

  // 哥伦比娅弦月 +4
  if (attacker.characterId === "columbina" && attacker.moonPhase === 0) {
    attackValue += 4;
    addLog(state, "弦月加持");
    state.devLog.debug(CAT.SKILL, `弦月加持 +4 → ${attackValue}`);
  }

  // 玛薇卡斗志
  if (attacker.characterId === "mavuika" && attacker.fightingSpirit > 0) {
    const spirit = attacker.fightingSpirit;
    attackValue += spirit;
    addLog(state, `斗志 ${spirit}层`);
    state.devLog.debug(CAT.SKILL, `玛薇卡斗志 +${spirit} → ${attackValue}`);
  }

  // 莉奈娅永久伤害加成
  if (
    attacker.characterId === "liniya" &&
    attacker.damageBonus[targetIdx] > 0
  ) {
    const bonus = attacker.damageBonus[targetIdx];
    attackValue += bonus;
    addLog(state, `永久伤害+${bonus}`);
    state.devLog.debug(CAT.SKILL, `莉奈娅永久伤害 +${bonus} → ${attackValue}`);
  }

  // 联盟攻击加成
  if (
    attacker.allyIndex !== null &&
    attacker.allianceTurns > 0 &&
    attacker.betrayalPenalty <= 0
  ) {
    attackValue += 2;
    addLog(state, "联盟攻击+2");
    state.devLog.debug(CAT.ALLIANCE, `联盟攻击 +2 → ${attackValue}`);
  }

  // 打背刺者伤害+2
  if (attacker !== target && target.betrayalPenalty > 0) {
    attackValue += 2;
    addLog(state, "惩罚背刺者+2");
    state.devLog.debug(CAT.ALLIANCE, `背刺惩罚 +2 → ${attackValue}`);
  }

  const totalAttackValue = attackValue;
  state.devLog.debug(
    CAT.DAMAGE,
    `攻击值修正完毕: ${baseCardValue} → ${totalAttackValue}`,
    {
      baseValue: baseCardValue,
      finalValue: totalAttackValue,
      delta: totalAttackValue - baseCardValue,
    },
  );

  // 陷阱判定
  let trapTriggered = false;
  const hadTrap = !!target.trap;
  if (target.trap && !attacker.ignoreTrapThisTurn) {
    target.trap.faceUp = true;
    const trapValue = target.trap.value;
    addLog(state, `${target.name} 触发陷阱`);
    state.devLog.info(
      CAT.DAMAGE,
      `陷阱判定: 攻击值=${attackValue} vs 陷阱值=${trapValue}`,
      { attackValue, trapValue, trapCard: cardDisplay(target.trap) },
    );

    if (attackValue < trapValue) {
      addLog(state, `陷阱反弹 ${attacker.name}`);
      state.devLog.info(
        CAT.DAMAGE,
        `陷阱反弹: ${attacker.name} 受到 ${trapValue} 伤害`,
      );
      state.grave.push(target.trap);
      if (target.bait) state.grave.push(target.bait);
      target.trap = null;
      target.bait = null;
      trapTriggered = true;
      applyDamage(state, attacker, trapValue);
      attackCards.forEach((c) => state.grave.push(c));
      if (!state.gameOver) endAction(state);
      return;
    } else if (attackValue === trapValue) {
      addLog(state, "陷阱平局双方受伤");
      state.devLog.info(CAT.DAMAGE, `陷阱平局: 双方各受 ${trapValue} 伤害`);
      state.grave.push(target.trap);
      if (target.bait) state.grave.push(target.bait);
      target.trap = null;
      target.bait = null;
      trapTriggered = true;
      applyDamage(state, attacker, trapValue);
      applyDamage(state, target, trapValue);
      if (attacker.characterId === "mavuika") {
        attacker.fightingSpirit = Math.min(5, attacker.fightingSpirit + 1);
        addLog(state, `斗志 ${attacker.fightingSpirit}层`);
        state.devLog.debug(
          CAT.SKILL,
          `玛薇卡斗志+1 → ${attacker.fightingSpirit} (陷阱平局)`,
        );
      }
      attackCards.forEach((c) => state.grave.push(c));
      if (!state.gameOver) endAction(state);
      return;
    } else {
      addLog(state, "陷阱被破");
      state.devLog.info(CAT.DAMAGE, `陷阱被破: ${attackValue} > ${trapValue}`);
      if (attacker.characterId === "mavuika") {
        attacker.fightingSpirit = Math.min(5, attacker.fightingSpirit + 1);
        addLog(state, `斗志 ${attacker.fightingSpirit}层`);
        state.devLog.debug(
          CAT.SKILL,
          `玛薇卡斗志+1 → ${attacker.fightingSpirit} (击破陷阱)`,
        );
      }
      state.grave.push(target.trap);
      if (target.bait) state.grave.push(target.bait);
      target.trap = null;
      target.bait = null;
    }
  }

  // 联盟平摊
  if (!trapTriggered && target.allyIndex !== null && target.allianceTurns > 0) {
    const ally = state.players.find((p) => p.index === target.allyIndex);
    if (ally && ally.alive && ally.index !== attacker.index) {
      const reduced = attackValue - 2;
      const allyDmg = Math.floor(reduced / 3);
      const targetDmg = reduced - allyDmg;
      state.devLog.info(
        CAT.ALLIANCE,
        `联盟平摊: 原始=${attackValue} 减2=${reduced}`,
        {
          formula: `(${attackValue}-2)/3`,
          allyDmg,
          targetDmg,
          ally: ally.name,
        },
      );
      attackValue = targetDmg;
      addLog(
        state,
        `联盟平摊：${target.name} ${attackValue}点, ${ally.name} ${allyDmg}点`,
      );
      applyDamage(state, ally, allyDmg);
    }
  }

  // 防御判定
  const targetHpBeforeApply = target.hp;
  const beforeDefense = target.defensePile.length;
  const remainingDmg = applyDamage(state, target, attackValue);
  const actualHpLost = targetHpBeforeApply - target.hp;
  const defenseConsumed = beforeDefense - target.defensePile.length;

  if (actualHpLost > 0 && actualHpLost !== attackValue && !trapTriggered) {
    // 排除合法偏差：防御吸收、伤害溢出（系统自身将HP clamp到0）
    const wasOverkill = targetHpBeforeApply + defenseConsumed < attackValue;
    if (!wasOverkill && defenseConsumed === 0) {
      state.devLog.warn(
        CAT.ANOMALY,
        `伤害偏差: 攻击值=${attackValue} 但HP减少=${actualHpLost}`,
        {
          attackValue,
          actualHpLost,
          delta: attackValue - actualHpLost,
          defConsumed: defenseConsumed,
          hasAlly: target.allyIndex !== null,
        },
      );
    }
  }

  if (
    baseCardValue >= 10 &&
    actualHpLost <= 3 &&
    !trapTriggered &&
    target.alive
  ) {
    state.devLog.warn(
      CAT.ANOMALY,
      `高值卡低伤害: ${cardDisplay(card)}(${baseCardValue}) 仅造成${actualHpLost}点伤害`,
      {
        cardValue: baseCardValue,
        attackValue: totalAttackValue,
        actualHpLost,
        targetDef: beforeDefense,
      },
    );
  }

  // 玛薇卡击穿防御加斗志
  if (
    attacker.characterId === "mavuika" &&
    defenseConsumed > 0 &&
    !trapTriggered
  ) {
    attacker.fightingSpirit = Math.min(
      5,
      attacker.fightingSpirit + defenseConsumed,
    );
    addLog(state, `斗志 ${attacker.fightingSpirit}层`);
    state.devLog.debug(
      CAT.SKILL,
      `玛薇卡斗志+${defenseConsumed} → ${attacker.fightingSpirit} (击穿防御)`,
    );
  }

  // 联盟击杀奖励
  if (!target.alive && attacker.allyIndex !== null) {
    const ally = state.players.find((p) => p.index === attacker.allyIndex);
    if (ally?.alive) {
      ally.allyKillBonus = true;
      addLog(state, `${ally.name} 获得联盟击杀奖励`);
      state.devLog.info(CAT.ALLIANCE, `${ally.name} 获得联盟击杀奖励`, {
        attacker: attacker.name,
        killed: target.name,
      });
    }
  }

  // 风堇被动
  if (attacker.characterId === "fenjin") {
    let healCount = 0;
    if (hadTrap && !trapTriggered) healCount++;
    healCount += defenseConsumed;
    if (healCount > 0) {
      const hpBeforeHeal = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + healCount);
      addLog(
        state,
        `${attacker.name} 风堇被动回复 ${healCount} 点（当前 HP ${attacker.hp}）`,
      );
      state.devLog.info(
        CAT.SKILL,
        `风堇被动回复 ${healCount} 点: ${hpBeforeHeal}→${attacker.hp}`,
        {
          healCount,
          trapBreak: hadTrap && !trapTriggered,
          defConsumed: defenseConsumed,
        },
      );
    }
  }

  state.devLog.info(
    CAT.ATTACK,
    `攻击结算完毕: ${attacker.name}→${target.name}，目标HP: ${targetHpBeforeApply}→${target.hp}`,
    {
      attackerHp: attacker.hp,
      targetHp: target.hp,
      targetAlive: target.alive,
      actualHpLost,
      trapTriggered,
    },
  );

  attackCards.forEach((c) => state.grave.push(c));
  if (attacker.ignoreTrapThisTurn) {
    attacker.ignoreTrapThisTurn = false;
  }

  if (!state.gameOver) endAction(state);
}

// ===== 防御 =====

export function executeDefense(state) {
  if (state.step !== STEP.PICK_ACTION) {
    state.devLog.warn(CAT.ANOMALY, `防御在非预期步骤执行: ${state.step}`);
    return;
  }
  const player = currentPlayer(state);
  ensureDeck(state);

  const r = drawCards(state.deck, 1);
  const card = r.drawn[0];
  state.deck = r.remaining;
  const originalValue = card.value;

  let cardValue = card.value;
  if (state.currentWeather === "trade") {
    cardValue += 2;
    state.devLog.debug(CAT.WEATHER, `黑市交易 +2 → ${cardValue}`);
  }

  if (player.characterId === "columbina" && player.moonPhase === 1) {
    cardValue += 3;
    state.devLog.debug(CAT.SKILL, `满月 +3 → ${cardValue}`);
  }

  if (
    player.allyIndex !== null &&
    player.allianceTurns > 0 &&
    player.betrayalPenalty <= 0
  ) {
    cardValue += 2;
    addLog(state, "联盟防御+2");
    state.devLog.debug(CAT.ALLIANCE, `联盟防御 +2 → ${cardValue}`);
  }

  card.value = cardValue;
  card.faceUp = false;
  player.defensePile.push(card);
  addLog(state, `${player.name} 执行防御`);
  state.devLog.info(
    CAT.DEFENSE,
    `${player.name} 防御: ${cardDisplay(card)} ${originalValue}→${cardValue}`,
    {
      cardId: card.id,
      originalValue,
      finalValue: cardValue,
      defCount: player.defensePile.length,
      bonuses: {
        trade: state.currentWeather === "trade" ? 2 : 0,
        fullMoon:
          player.characterId === "columbina" && player.moonPhase === 1 ? 3 : 0,
        alliance:
          player.allyIndex !== null &&
          player.allianceTurns > 0 &&
          player.betrayalPenalty <= 0
            ? 2
            : 0,
      },
    },
  );

  state.step = STEP.PICK_ACTION;
  endAction(state);
}

// ===== 赌命 =====

export function executeGamble(state) {
  if (state.step !== STEP.PICK_ACTION) return;
  const player = currentPlayer(state);
  ensureDeck(state);

  let drawCount = 2;
  if (player.characterId === "columbina" && player.moonPhase === 2) {
    drawCount = 3;
  }
  if (state.currentWeather === "wind") {
    drawCount += 1;
  }

  const r = drawCards(state.deck, drawCount);
  const drawn = r.drawn.map((c) => ({ ...c, faceUp: true }));
  state.deck = r.remaining;

  addLog(state, `${player.name} 执行赌命`);
  state.devLog.info(
    CAT.GAMBLE,
    `${player.name} 赌命抽${drawn.length}张: ${drawn.map(cardDisplay).join(" ")}`,
    {
      drawCount,
      cards: drawn.map((c) => ({ display: cardDisplay(c), value: c.value })),
      bonuses: {
        newMoon: player.characterId === "columbina" && player.moonPhase === 2,
        wind: state.currentWeather === "wind",
      },
    },
  );

  state.step = STEP.GAMBLE_PICK;
  state.pendingGamble = { drawnCards: drawn };
}

export function submitGamble(state, trapIdx, baitIdx) {
  if (state.step !== STEP.GAMBLE_PICK) return;
  const player = currentPlayer(state);
  const cards = state.pendingGamble?.drawnCards;
  if (!cards || trapIdx === baitIdx) return;

  const trapCard = cards[trapIdx];
  const baitCard = cards[baitIdx];

  if (player.trap) state.grave.push(player.trap);
  if (player.bait) state.grave.push(player.bait);

  trapCard.faceUp = false;
  player.trap = trapCard;
  baitCard.faceUp = true;
  player.bait = baitCard;

  cards.forEach((c, i) => {
    if (i !== trapIdx && i !== baitIdx) state.grave.push(c);
  });

  addLog(state, `${player.name} 设陷阱 诱饵${cardDisplay(baitCard)}`);
  state.devLog.info(
    CAT.GAMBLE,
    `${player.name} 设陷阱: 陷阱=${cardDisplay(trapCard)}(${trapCard.value}) 诱饵=${cardDisplay(baitCard)}(${baitCard.value})`,
    {
      trapValue: trapCard.value,
      baitValue: baitCard.value,
      discarded: cards
        .filter((_, i) => i !== trapIdx && i !== baitIdx)
        .map(cardDisplay),
    },
  );

  state.pendingGamble = null;
  state.step = STEP.PICK_ACTION;
  endAction(state);
}
