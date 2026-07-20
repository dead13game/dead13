import { STEP } from "./constants.js";

let _currentPlayer, _addLog, _endAction, _checkGameOver;

export function _injectCaiyueangDeps(
  currentPlayerFn,
  addLogFn,
  endActionFn,
  checkGameOverFn,
) {
  _currentPlayer = currentPlayerFn;
  _addLog = addLogFn;
  _endAction = endActionFn;
  _checkGameOver = checkGameOverFn;
}

function currentPlayer(state) {
  return _currentPlayer(state);
}
function addLog(state, msg) {
  _addLog(state, msg);
}
function endAction(state) {
  _endAction(state);
}
function checkGameOver(state) {
  _checkGameOver(state);
}

// ===== 深拷贝（用于存档） =====

function deepCloneState(state) {
  return {
    players: state.players.map((p) => ({
      index: p.index,
      name: p.name,
      characterId: p.characterId,
      characterName: p.characterName,
      characterTitle: p.characterTitle,
      characterIcon: p.characterIcon,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      defensePile: p.defensePile.map((c) => ({ ...c })),
      trap: p.trap ? { ...p.trap } : null,
      bait: p.bait ? { ...p.bait } : null,
      skillUses: p.skillUses,
      skillName: p.skillName,
      skillDesc: p.skillDesc,
      skillType: p.skillType,
      maxUses: p.maxUses,
      fightingSpirit: p.fightingSpirit,
      moonPhase: p.moonPhase,
      ignoreTrapThisTurn: p.ignoreTrapThisTurn,
      extraAction: p.extraAction,
      loadUses: p.loadUses,
      loadMaxUses: p.loadMaxUses,
      allyIndex: p.allyIndex,
      allianceTurns: p.allianceTurns,
      betrayalPenalty: p.betrayalPenalty,
      allyKillBonus: p.allyKillBonus,
      stealTarget: p.stealTarget ? { ...p.stealTarget } : null,
      dotTarget: p.dotTarget ? { ...p.dotTarget } : null,
      damageBonus: { ...p.damageBonus },
      frozenBy: p.frozenBy,
      savepoint: null,
    })),
    deck: state.deck.map((c) => ({ ...c })),
    grave: state.grave.map((c) => ({ ...c })),
    currentPlayerIndex: state.currentPlayerIndex,
    phase: state.phase,
    step: state.step,
    round: state.round,
    currentWeather: state.currentWeather,
    peaceRounds: state.peaceRounds,
  };
}

// ===== 从存档恢复 =====

function restoreState(state, sp) {
  sp.players.forEach((savedPlayer, i) => {
    Object.assign(state.players[i], savedPlayer);
    state.players[i].defensePile = savedPlayer.defensePile.map((c) => ({
      ...c,
    }));
    state.players[i].trap = savedPlayer.trap ? { ...savedPlayer.trap } : null;
    state.players[i].bait = savedPlayer.bait ? { ...savedPlayer.bait } : null;
    state.players[i].stealTarget = savedPlayer.stealTarget
      ? { ...savedPlayer.stealTarget }
      : null;
    state.players[i].dotTarget = savedPlayer.dotTarget
      ? { ...savedPlayer.dotTarget }
      : null;
    state.players[i].damageBonus = { ...savedPlayer.damageBonus };
    state.players[i].loadUses = savedPlayer.loadUses;
    state.players[i].loadMaxUses = savedPlayer.loadMaxUses;
    state.players[i].allyIndex = savedPlayer.allyIndex;
    state.players[i].allianceTurns = savedPlayer.allianceTurns;
    state.players[i].betrayalPenalty = savedPlayer.betrayalPenalty;
    state.players[i].allyKillBonus = savedPlayer.allyKillBonus;
  });
  state.deck = sp.deck.map((c) => ({ ...c }));
  state.grave = sp.grave.map((c) => ({ ...c }));
  state.currentPlayerIndex = sp.currentPlayerIndex;
  state.phase = sp.phase;
  state.step = STEP.PICK_ACTION;
  state.round = sp.round;
  state.currentWeather = sp.currentWeather;
  state.peaceRounds = sp.peaceRounds;
  checkGameOver(state);
}

// ===== 菜月昴·死亡回归 =====

export function executeSkillCaiyueangEntry(state) {
  const player = currentPlayer(state);
  state._caiyueangMode = true;
  state.step = STEP.CAIYUEANG_PICK;
  addLog(state, `${player.name} 死亡回归 — 选择存档或读档`);
}

export function executeCaiyueangSave(state) {
  const player = currentPlayer(state);
  player.savepoint = deepCloneState(state);
  state._caiyueangMode = null;
  state.endTurn = false;
  addLog(state, `${player.name} 存档完成`);
  endAction(state);
}

export function executeCaiyueangLoad(state) {
  const player = currentPlayer(state);
  if (!player.savepoint) {
    addLog(state, "没有存档点可以回溯");
    state._caiyueangMode = null;
    state.step = STEP.PICK_ACTION;
    return;
  }
  if (player.loadUses <= 0) {
    addLog(state, "读档次数已用完");
    state._caiyueangMode = null;
    state.step = STEP.PICK_ACTION;
    return;
  }
  const subaruIdx = player.index;
  restoreState(state, player.savepoint);
  const subaru = state.players[subaruIdx];
  subaru.loadUses--;
  state.endTurn = false;
  addLog(
    state,
    `${subaru.name} 死亡回归！回溯到存档点（剩余读档${subaru.loadUses}次）`,
  );
  state._caiyueangMode = null;
  endAction(state);
}
