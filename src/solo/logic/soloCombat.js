// 单机战斗结算 — 抽3选2 / 行动力 / 牌堆坟场 / 护盾 / 斗志 / AI 随机出牌
// 纯逻辑层，零依赖（设计文档 docs/solo-roguelike-design.md v0.8）

import { SOLO_CONST, SOLO_CARDS, SOLO_ENEMIES } from "./soloConstants.js";
import { createFullDeck, shuffleDeck, drawCards } from "../../game/deck.js";
import { LOG_TYPE } from "../../game/gameLogger.js";
import { getCardStats, awardBattleReward } from "./solo.js";

// ---- 聚合工具 ----

function expandDeck(agg) {
  const arr = [];
  for (const [id, count] of Object.entries(agg)) {
    const card = SOLO_CARDS[id];
    if (!card) continue;
    for (let i = 0; i < count; i++) arr.push({ id, ...card });
  }
  return arr;
}

function addToAgg(agg, cardId, count) {
  agg[cardId] = (agg[cardId] || 0) + count;
}

function removeFromAgg(agg, cardId, count) {
  if (!agg[cardId]) return;
  agg[cardId] -= count;
  if (agg[cardId] <= 0) delete agg[cardId];
}

/** 从牌堆抽 n 张并聚合进 hand；牌堆空时从 grave 洗回 */
function drawIntoPile(state, pile, hand, grave, n) {
  let left = n;
  while (left > 0) {
    const { drawn, remaining } = drawCards(pile, left);
    for (const card of drawn) addToAgg(hand, card.id, 1);
    left -= drawn.length;
    // 真正从牌堆移除已抽的牌
    pile.splice(0, pile.length, ...remaining);
    if (drawn.length === 0) {
      // 牌堆空 → 坟场洗回（原地清空保持引用）
      const gravePile = expandDeck(grave);
      for (const k of Object.keys(grave)) delete grave[k];
      if (gravePile.length === 0) break;
      pile.splice(0, pile.length, ...shuffleDeck(gravePile));
    }
  }
}

/** 记录到"最近打出队列"（最多 6 种，同 cardId+side+回合 合并并置最新） */
function pushPlayedQueue(c, cardId, count, side) {
  if (!c.playedQueue) c.playedQueue = [];
  const round = c.round;
  const idx = c.playedQueue.findIndex(
    (e) => e.cardId === cardId && e.side === side && e.round === round,
  );
  if (idx >= 0) {
    c.playedQueue[idx].count += count;
    const [item] = c.playedQueue.splice(idx, 1);
    c.playedQueue.push(item); // 移到最新
  } else {
    c.playedQueue.push({ cardId, count, side, round });
  }
  while (c.playedQueue.length > 6) c.playedQueue.shift();
}

/** 手牌种类上限爆牌：超种类的新牌进坟场 */
function enforceHandLimit(state, hand) {  const kinds = Object.keys(hand);
  while (kinds.length > SOLO_CONST.HAND_KIND_LIMIT) {
    // 移除最后一个新种类（简单策略：保留先入的种类，新种类爆牌）
    const overflowId = kinds[kinds.length - 1];
    addToAgg(state.combat.grave, overflowId, hand[overflowId]);
    delete hand[overflowId];
    kinds.pop();
  }
}

function refillPoker(state) {
  const c = state.combat;
  if (c.pokerDeck.length < SOLO_CONST.POKER_DRAW) {
    c.pokerDeck = shuffleDeck(createFullDeck(1));
  }
}

// ---- 创建战斗 ----

/** 开始一场战斗 */
export function startCombat(state, enemyKey) {
  const enemy = SOLO_ENEMIES[enemyKey];
  state.combat = {
    enemyKey,
    enemyName: enemy.name,
    enemyHp: enemy.hp,
    enemyMaxHp: enemy.hp,
    enemyShield: 0,
    enemyBuff: enemy.buff || null,
    enemySpirit: 0,
    enemyNextActionDrain: 0, // 冰锥 debuff
    enemyNextShieldPen: 0, // 破甲 debuff（下回合敌方护盾获取 -2）
    playerPile: shuffleDeck(expandDeck(state.player.deck)),
    playerHand: {},
    playerGrave: {},
    enemyPile: shuffleDeck(expandDeck(enemy.deck)),
    enemyHand: {},
    enemyGrave: {},
    pokerDeck: shuffleDeck(createFullDeck(1)),
    pendingPoker: null,
    actionPoints: 0,
    drawCount: 0,
    playsThisTurn: 0,
    playedQueue: [], // 最近打出的牌（最多 6 种）：[{cardId, count, side:'player'|'enemy'}]
    playerShield: 0,
    fightingSpirit: 0,
    round: 0,
    phase: "pick-poker", // pick-poker → draw-skill → play → enemy → won/lost
    log: [],
  };
  state.devLog.info(LOG_TYPE.SOLO_NODE, `战斗开始：${enemy.name}`, {
    enemyKey,
    enemyHp: enemy.hp,
    enemyBuff: enemy.buff || null,
    playerHp: state.player.hp,
    playerDeck: { ...state.player.deck },
  });
  startPlayerTurn(state);
}

// ---- 玩家回合 ----

/** 回合开始：抽 3 张扑克等待玩家选 2 张 */
export function startPlayerTurn(state) {
  const c = state.combat;
  if (!c || c.phase === "won" || c.phase === "lost") return;
  refillPoker(state);
  const { drawn, remaining } = drawCards(c.pokerDeck, SOLO_CONST.POKER_DRAW);
  c.pokerDeck = remaining; // 更新牌堆（drawCards 返回新数组，原数组不变）
  c.pendingPoker = drawn;
  c.playsThisTurn = 0;
  c.enemyNextActionDrain = 0;
  c.enemyNextShieldPen = 0;
  c.phase = "pick-poker";
}

/**
 * 玩家从 3 张扑克中选 2 张作行动力，剩 1 张作抽牌数。
 * @param {number} actionIdxA/B - 行动力扑克下标
 * @param {number} drawIdx - 抽牌数扑克下标
 */
export function pickPoker(state, actionIdxA, actionIdxB, drawIdx) {
  const c = state.combat;
  if (!c || c.phase !== "pick-poker") return { ok: false, reason: "时机不对" };
  const poker = c.pendingPoker;
  if (!poker || poker.length !== 3) return { ok: false, reason: "扑克未就绪" };
  const idxs = [actionIdxA, actionIdxB, drawIdx];
  if (new Set(idxs).size !== 3 || idxs.some((i) => i < 0 || i > 2)) {
    return { ok: false, reason: "选择非法" };
  }
  let ap = poker[actionIdxA].value + poker[actionIdxB].value;
  // 玛薇卡斗志：每 5 层行动力 +1
  ap += Math.floor(c.fightingSpirit / SOLO_CONST.SPIRIT_PER_ACTION);
  c.actionPoints = ap;
  c.drawCount = poker[drawIdx].value; // 1-13 直接抽
  c.pendingPoker = null;
  c.phase = "draw-skill";
  state.devLog.debug(LOG_TYPE.SOLO_POKER_PICK, "选牌：行动力+抽牌数", {
    actionCards: [poker[actionIdxA].rank + poker[actionIdxA].suit, poker[actionIdxB].rank + poker[actionIdxB].suit],
    drawCard: poker[drawIdx].rank + poker[drawIdx].suit,
    actionPoints: ap,
    spirit: c.fightingSpirit,
    drawCount: c.drawCount,
  });
  drawSkill(state);
  return { ok: true, actionPoints: ap, drawCount: c.drawCount };
}

/** 按抽牌数抽技能卡进手牌 */
export function drawSkill(state) {
  const c = state.combat;
  if (c.phase !== "draw-skill") return;
  drawIntoPile(state, c.playerPile, c.playerHand, c.playerGrave, c.drawCount);
  enforceHandLimit(state, c.playerHand);
  state.devLog.debug(LOG_TYPE.SOLO_SKILL_DRAW, "抽取技能卡", {
    drawCount: c.drawCount,
    hand: { ...c.playerHand },
    pileLeft: c.playerPile.length,
  });
  c.phase = "play";
}

/**
 * 打出技能卡（同名牌可一次打 count 张）
 */
export function playCard(state, cardId, count = 1) {
  const c = state.combat;
  if (!c || c.phase !== "play") {
    state.devLog?.warn(LOG_TYPE.SOLO_CARD_PLAY, "出牌失败：非出牌阶段", {
      cardId,
      count,
      phase: c?.phase ?? null,
    });
    return { ok: false, reason: "非出牌阶段" };
  }
  const card = SOLO_CARDS[cardId];
  if (!card) {
    state.devLog?.warn(LOG_TYPE.SOLO_CARD_PLAY, "出牌失败：无此卡", { cardId });
    return { ok: false, reason: "无此卡" };
  }
  const held = c.playerHand[cardId] || 0;
  if (held < count) {
    state.devLog?.warn(LOG_TYPE.SOLO_CARD_PLAY, "出牌失败：手牌不足", {
      cardId,
      count,
      held,
    });
    return { ok: false, reason: "手牌不足" };
  }
  const cost = card.cost * count;
  if (c.actionPoints < cost) {
    state.devLog?.warn(LOG_TYPE.SOLO_CARD_PLAY, "出牌失败：行动力不足", {
      cardId,
      count,
      cost,
      actionPoints: c.actionPoints,
    });
    return { ok: false, reason: "行动力不足" };
  }

  c.actionPoints -= cost;
  c.playsThisTurn += 1;
  removeFromAgg(c.playerHand, cardId, count);
  addToAgg(c.playerGrave, cardId, count);
  pushPlayedQueue(c, cardId, count, "player"); // 记录到最近打出队列
  state.devLog.info(LOG_TYPE.SOLO_CARD_PLAY, `打出 ${SOLO_CARDS[cardId].name}×${count}`, {
    cardId,
    count,
    cost,
    actionPointsLeft: c.actionPoints,
    playsThisTurn: c.playsThisTurn,
    spirit: c.fightingSpirit,
    playerHp: state.player.hp,
    playerShield: c.playerShield,
  });

  const stats = getCardStats(state, cardId); // 含升级加成
  const attr = state.player.attrs;

  if (card.type === "physical" || card.type === "magic") {
    // 攻击/治疗：攻击卡可多段（连击 hits）
    const dmg = card.base + attr[card.type === "physical" ? "str" : "mag"];
    const hits = card.hits || 1;
    for (let i = 0; i < count * hits; i++) {
      damageEnemy(state, dmg, stats.armorPen || 0);
      if (c.phase === "won") break;
    }
    if (card.heal) healSelf(state, card.base + attr.mag, count);
    if (card.actionDrain) c.enemyNextActionDrain = card.actionDrain;
  } else if (card.type === "defense") {
    const shield = card.base + attr.def;
    c.playerShield += shield * count;
    if (card.actionRefund) c.actionPoints += card.actionRefund;
  } else if (card.type === "utility") {
    if (card.fightingSpirit) {
      c.fightingSpirit += card.fightingSpirit * count;
    }
    if (card.drawBonus) {
      // 专注：立即补抽 drawBonus 张
      drawIntoPile(
        state,
        c.playerPile,
        c.playerHand,
        c.playerGrave,
        card.drawBonus * count,
      );
      enforceHandLimit(state, c.playerHand);
    }
  }

  if (c.phase !== "won" && c.phase !== "lost") checkVictory(state);
  return { ok: true };
}

/** 结束玩家回合 → 敌方回合 */
export function endTurn(state) {
  const c = state.combat;
  if (!c || c.phase !== "play") return { ok: false };
  runEnemyTurn(state);
  return { ok: true };
}

// ---- 伤害结算 ----

/** 对敌方造成伤害：先扣护盾（破盾量 → 斗志），剩余扣 HP */
function damageEnemy(state, dmg, pen = 0) {
  const c = state.combat;
  if (c.phase === "won") return;
  let d = dmg;
  // 破甲：穿透 pen 点护盾（直接伤 HP）
  const penDmg = Math.min(d, pen);
  c.enemyHp -= penDmg;
  d -= penDmg;
  // 扣护盾
  const shieldDmg = Math.min(c.enemyShield, d);
  c.enemyShield -= shieldDmg;
  d -= shieldDmg;
  // 斗志：对护盾造成伤害 → 玛薇卡斗志 += 破盾量
  if (shieldDmg > 0) c.fightingSpirit += shieldDmg;
  // 剩余扣 HP
  c.enemyHp -= d;
  if (c.enemyHp < 0) c.enemyHp = 0;
  state.devLog.debug(LOG_TYPE.SOLO_DAMAGE, "对敌方造成伤害", {
    dmg,
    pen,
    shieldDmg,
    enemyShieldLeft: c.enemyShield,
    hpDmg: d + penDmg,
    enemyHp: c.enemyHp,
    spiritGain: shieldDmg,
    spirit: c.fightingSpirit,
  });
}

function healSelf(state, amount, count) {
  const c = state.combat;
  state.player.hp = Math.min(
    state.player.maxHp,
    state.player.hp + amount * count,
  );
}

/** 对玩家造成伤害（敌方攻击）：先扣玩家护盾，首领破盾攒斗志 */
function damagePlayer(state, dmg) {
  const c = state.combat;
  if (c.phase === "lost") return;
  let d = dmg;
  const shieldDmg = Math.min(c.playerShield, d);
  c.playerShield -= shieldDmg;
  d -= shieldDmg;
  // 首领斗志：破玩家盾攒斗志
  if (shieldDmg > 0 && c.enemyBuff === "fightingSpirit") {
    c.enemySpirit += shieldDmg;
  }
  state.player.hp -= d;
  if (state.player.hp < 0) state.player.hp = 0;
  state.devLog.debug(LOG_TYPE.SOLO_DAMAGE, `敌方攻击：${c.enemyName} -${dmg}`, {
    dmg,
    shieldDmg,
    playerShieldLeft: c.playerShield,
    hpDmg: d,
    playerHp: state.player.hp,
    enemySpirit: c.enemySpirit,
  });
  if (state.player.hp <= 0) endCombat(state, "lost");
}

// ---- 敌方 AI 回合 ----

/** 敌方回合：平衡选牌 → 随机出牌（行动力上限 7） */
/**
 * 敌方回合开始：抽扑克定行动力/抽牌数、抽技能卡（一次性准备）。
 * phase: play → enemy-announce
 */
export function startEnemyTurn(state) {
  const c = state.combat;
  if (!c || c.phase !== "play") return;
  c.phase = "enemy-announce";

  // 1. AI 抽 3 张扑克，选 2 张最大作行动力（平衡：保行动力）
  refillPoker(state);
  const { drawn, remaining } = drawCards(c.pokerDeck, SOLO_CONST.POKER_DRAW);
  c.pokerDeck = remaining; // 更新牌堆
  const sorted = [...drawn].sort((a, b) => b.value - a.value);
  let ap = sorted[0].value + sorted[1].value;
  const drawCount = sorted[2] ? sorted[2].value : 1;
  // 首领斗志：每 5 层行动力 +1
  ap += Math.floor(c.enemySpirit / SOLO_CONST.SPIRIT_PER_ACTION);
  // 冰锥 debuff：敌方下回合行动力 -4
  ap -= c.enemyNextActionDrain || 0;
  if (ap < 0) ap = 0;
  // 记录敌方行动力/抽牌数（供 UI 面板显示）
  c.enemyActionPoints = ap;
  c.enemyDrawCount = drawCount;
  c.enemySpent = 0;
  c.enemyPendingPlay = null;

  // 2. AI 抽技能卡
  drawIntoPile(state, c.enemyPile, c.enemyHand, c.enemyGrave, drawCount);
  enforceHandLimit(state, c.enemyHand);
  state.devLog.debug(LOG_TYPE.SOLO_ENEMY_TURN, `敌方回合开始：${c.enemyName}`, {
    round: c.round + 1,
    actionPoints: ap,
    drawCount,
    spirit: c.enemySpirit,
    hand: { ...c.enemyHand },
    enemyHp: c.enemyHp,
    enemyShield: c.enemyShield,
  });
}

/**
 * 敌方宣布要打出的牌（供 UI 高亮 + 1.5s 延迟）。
 * 出牌：从所有可出的攻击/防御卡中**纯随机**均匀选取；
 * 直到行动力不足或手牌打空才结束回合（无消耗上限）。
 * 返回 { playing, cardId, count }；playing=false 表示出牌结束（已回玩家回合）。
 */
export function enemyAnnounce(state) {
  const c = state.combat;
  if (!c || c.phase !== "enemy-announce") return { playing: false };
  if (c.phase === "lost" || c.phase === "won") return { playing: false };

  // 所有可出的牌（攻击+防御，纯随机均匀选取）
  const playable = Object.keys(c.enemyHand).filter((id) => {
    const card = SOLO_CARDS[id];
    return (
      card &&
      card.type !== "utility" &&
      c.enemyHand[id] > 0 &&
      card.cost <= c.enemyActionPoints
    );
  });
  // 行动力不足或手牌无可用卡 → 结束敌方回合
  if (playable.length === 0) {
    finishEnemyTurn(state);
    return { playing: false };
  }
  const id = playable[Math.floor(Math.random() * playable.length)];
  const card = SOLO_CARDS[id];
  // 打出数量：行动力允许范围内的全部持有数（同名牌一次打出，直观）
  const maxCount = Math.min(
    c.enemyHand[id],
    Math.floor(c.enemyActionPoints / card.cost),
  );
  const count = maxCount;
  c.enemyPendingPlay = { cardId: id, count, cost: card.cost * count };
  c.phase = "enemy-resolve"; // 等待 1.5s 后 enemyResolve 结算
  state.devLog.debug(LOG_TYPE.SOLO_ENEMY_TURN, `敌方宣布打出 ${card.name}×${count}`, {
    cardId: id,
    count,
    cost: card.cost * count,
    actionPointsLeft: c.enemyActionPoints,
  });
  return { playing: true, cardId: id, count };
}

/** 结算敌方宣布的牌（1.5s 延迟后调用） */
export function enemyResolve(state) {
  const c = state.combat;
  if (!c || c.phase !== "enemy-resolve" || !c.enemyPendingPlay) return;
  const { cardId, count, cost } = c.enemyPendingPlay;
  const card = SOLO_CARDS[cardId];
  c.enemyActionPoints -= cost;
  c.enemySpent += cost;
  removeFromAgg(c.enemyHand, cardId, count);
  addToAgg(c.enemyGrave, cardId, count);
  pushPlayedQueue(c, cardId, count, "enemy"); // 记录到最近打出队列（敌方，黄色）

  state.devLog.debug(LOG_TYPE.SOLO_ENEMY_TURN, `敌方打出 ${card.name}×${count}`, {
    dmg: card.base,
    count,
    actionPointsLeft: c.enemyActionPoints,
    spentTotal: c.enemySpent,
  });

  if (card.type === "physical" || card.type === "magic") {
    const dmg = card.base; // 敌方无属性修正，强度靠数值+牌组
    const hits = card.hits || 1;
    for (let i = 0; i < count * hits; i++) {
      damagePlayer(state, dmg);
      if (c.phase === "lost") break;
    }
  } else if (card.type === "defense") {
    let shield = card.base;
    if (c.enemyNextShieldPen > 0) shield = Math.max(0, shield - c.enemyNextShieldPen);
    c.enemyShield += shield * count;
  }
  c.enemyPendingPlay = null;
  // 若结算中玩家死亡/敌方已败（phase 已切终态），保持终态，不再继续宣布
  if (c.phase !== "lost" && c.phase !== "won") {
    c.phase = "enemy-announce"; // 继续宣布下一张
  }
}

/** 敌方回合结束：回合推进、平局判定、回玩家回合 */
function finishEnemyTurn(state) {
  const c = state.combat;
  c.enemyPendingPlay = null;
  c.round += 1;
  if (c.round >= SOLO_CONST.TURN_LIMIT) {
    // 平局：HP 比例高者胜，相同玩家败
    const pRatio = state.player.hp / state.player.maxHp;
    const eRatio = c.enemyHp / c.enemyMaxHp;
    if (eRatio > pRatio) endCombat(state, "won");
    else endCombat(state, "lost");
    return;
  }
  if (c.phase !== "lost" && c.phase !== "won") startPlayerTurn(state);
}

// ---- 战斗结束 ----

function checkVictory(state) {
  const c = state.combat;
  if (c.enemyHp <= 0) endCombat(state, "won");
}

/** 战斗结束：发放奖励 / 失败 / 推进节点 */
function endCombat(state, result) {
  const c = state.combat;
  if (!c || c.phase === "won" || c.phase === "lost") return;
  c.phase = result;
  if (result === "won") {
    // 奖励
    const reward = awardBattleReward(state, c.enemyKey);
    c.lastReward = reward;
    state.log.push(`击败 ${c.enemyName}，+${reward.gold} 金币 +${reward.exp} 经验`);
    state.devLog.info(LOG_TYPE.SOLO_END, `战斗胜利：${c.enemyName}`, {
      result,
      gold: reward.gold,
      exp: reward.exp,
      rarity: reward.rarity,
      attrPoint: reward.attrPoint || 0,
      roundUsed: c.round,
      playerHp: state.player.hp,
      spirit: c.fightingSpirit,
      level: state.player.level,
    });
  } else {
    state.gameOver = true;
    state.log.push(`败于 ${c.enemyName}，单机模式结束`);
    state.devLog.warn(LOG_TYPE.SOLO_END, `战斗失败：${c.enemyName}`, {
      result,
      roundUsed: c.round,
      playerHp: state.player.hp,
      enemyHp: c.enemyHp,
    });
  }
}

/** 战斗胜利后领取卡牌候选（3 选 1）。推进节点由控制器完成（goNext） */
export function claimCardReward(state, cardId) {
  const c = state.combat;
  if (!c || c.phase !== "won" || !c.lastReward) return { ok: false };
  if (!SOLO_CARDS[cardId]) return { ok: false, reason: "无此卡" };
  // 加卡 + 首领额外属性点
  addCardsToDeck(state, cardId);
  if (c.lastReward.attrPoint > 0) {
    state.player.pendingAttrPoints += c.lastReward.attrPoint;
  }
  c.lastReward.claimedCard = cardId; // 保留奖励信息供 UI 显示，标记已领
  // 通关判定：当前节点是最后一节点（首领）
  if (state.nodeIndex >= state.mapNodes.length - 1) {
    state.victory = true;
    state.gameOver = true;
  }
  return { ok: true };
}

function addCardsToDeck(state, cardId) {
  state.player.deck[cardId] = (state.player.deck[cardId] || 0) + 1;
}
