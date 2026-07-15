import { drawCards, cardDisplay } from "./deck.js";
import { applyDamage, dissolveAlliance } from "./damage.js";
import { CAT } from "./gameLogger.js";

let _currentPlayer, _addLog, _ensureDeck, _endAction;

export function _injectAllianceDeps(
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

// ===== 结盟 =====

export function startAlly(state) {
  if (state.phase === "peace") return;
  if (state.players.length < 4) {
    addLog(state, "仅4人局及以上可结盟");
    return;
  }
  const player = currentPlayer(state);
  if (player.allyIndex !== null) {
    addLog(state, "已有盟友，不可再结盟");
    return;
  }
  if (player.betrayalPenalty > 0) {
    addLog(state, `背刺惩罚中，${player.betrayalPenalty}回合内不可结盟`);
    return;
  }
  state.step = "allyPick";
  addLog(state, `${player.name} 选择结盟目标`);
}

export function executeAlly(state, targetIdx) {
  const player = currentPlayer(state);
  const target = state.players.find((p) => p.index === targetIdx);
  if (!target?.alive) return;
  if (target.allyIndex !== null) {
    addLog(state, `${target.name} 已有盟友`);
    return;
  }
  player.allyIndex = targetIdx;
  player.allianceTurns = 5;
  target.allyIndex = player.index;
  target.allianceTurns = 5;
  addLog(state, `${player.name} 与 ${target.name} 结盟（5回合）`);
  state.devLog.info(
    CAT.ALLIANCE,
    `${player.name} ↔ ${target.name} 结盟（5回合）`,
    { players: [player.name, target.name], turns: 5, round: state.round },
  );
  state.step = "pickAction";
  endAction(state);
}

// ===== 背刺 =====

export function executeBetray(state) {
  const player = currentPlayer(state);
  if (player.allyIndex === null) {
    addLog(state, "没有盟友可以背刺");
    return;
  }
  const ally = state.players.find((p) => p.index === player.allyIndex);
  if (!ally?.alive) return;

  ensureDeck(state);
  const r = drawCards(state.deck, 1);
  const card = r.drawn[0];
  state.deck = r.remaining;
  card.faceUp = true;

  let dmg = card.value + 4;
  addLog(
    state,
    `${player.name} 背刺 ${ally.name}！${cardDisplay(card)} +4 = ${dmg}`,
  );
  state.devLog.info(
    CAT.ALLIANCE,
    `${player.name} 背刺 ${ally.name}: ${cardDisplay(card)}+4=${dmg}`,
    { cardValue: card.value, totalDamage: dmg, allyHpBefore: ally.hp },
  );

  applyDamage(state, ally, dmg);

  // 惩罚
  for (const c of player.defensePile) c.faceUp = true;
  if (player.trap) player.trap.faceUp = true;
  if (player.bait) player.bait.faceUp = true;
  player.betrayalPenalty = 10;
  player.allianceTurns = 0;
  dissolveAlliance(state, player);

  // 击杀奖励
  if (!ally.alive) {
    player.hp = player.maxHp;
    for (let i = 0; i < 2; i++) {
      ensureDeck(state);
      const rr = drawCards(state.deck, 1);
      state.deck = rr.remaining;
      rr.drawn[0].faceUp = false;
      player.defensePile.push(rr.drawn[0]);
    }
    addLog(state, `${player.name} 击杀盟友！回满血+2防御`);
  }

  addLog(
    state,
    `${player.name} 背刺惩罚：10回合不可结盟，防御/陷阱全明，被打伤害+2`,
  );
  state.grave.push(card);
  state.step = "pickAction";
  endAction(state);
}

// ===== 工具函数 =====

export function getAllianceTargets(state) {
  const player = currentPlayer(state);
  return state.players.filter(
    (p) =>
      p.alive &&
      p.index !== player.index &&
      p.allyIndex === null &&
      p.betrayalPenalty <= 0,
  );
}

export function getAlly(state, player) {
  if (player.allyIndex === null) return null;
  return state.players.find((p) => p.index === player.allyIndex) || null;
}
