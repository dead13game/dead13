import { CHARACTERS } from "./constants.js";
import { PHASE, STEP } from "./constants.js";
import { CAT } from "./gameLogger.js";
import { checkGameOver } from "./damage.js";

/**
 * 序列化当前游戏状态为可 JSON 存储的纯对象。
 * Vue 层调用后自行写入 localStorage。
 * @returns {Object} 可 JSON.stringify 的存档数据
 */
export function serializeGameState(state) {
  const data = {
    version: 2,
    players: state.players.map((p) => ({
      index: p.index,
      name: p.name,
      characterId: p.characterId,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      defensePile: p.defensePile.map((c) => ({ ...c })),
      trap: p.trap ? { ...p.trap } : null,
      bait: p.bait ? { ...p.bait } : null,
      skillUses: p.skillUses,
      fightingSpirit: p.fightingSpirit,
      moonPhase: p.moonPhase,
      loadUses: p.loadUses,
      statusEffects: {
        frozenBy: p.statusEffects.frozenBy,
        stealTarget: p.statusEffects.stealTarget
          ? { ...p.statusEffects.stealTarget }
          : null,
        dotTarget: p.statusEffects.dotTarget
          ? { ...p.statusEffects.dotTarget }
          : null,
        damageBonus: { ...p.statusEffects.damageBonus },
        ignoreTrapThisTurn: p.statusEffects.ignoreTrapThisTurn,
        extraAction: p.statusEffects.extraAction,
        savepoint: null, // 存档点不序列化
      },
      relations: {
        allyIndex: p.relations.allyIndex,
        allianceTurns: p.relations.allianceTurns,
        betrayalPenalty: p.relations.betrayalPenalty,
        allyKillBonus: p.relations.allyKillBonus,
        consecutiveGambles: p.relations.consecutiveGambles,
        gamblePenalty: p.relations.gamblePenalty,
      },
      isAI: p.isAI,
      aiDifficulty: p.aiDifficulty,
      teamId: p.teamId ?? -1,
      // 圣遗物字段
      artifactId: p.artifactId,
      breakCount: p.breakCount ?? 0,
      holyWordUses: p.holyWordUses ?? 2,
      artifactActive: p.artifactActive ?? false,
      artifactRoundsLeft: p.artifactRoundsLeft ?? 0,
    })),
    deck: state.deck.map((c) => ({ ...c })),
    grave: state.grave.map((c) => ({ ...c })),
    weatherDeck: state.weatherDeck.map((c) => ({ ...c })),
    currentPlayerIndex: state.currentPlayerIndex,
    phase: state.phase,
    step: state.step,
    round: state.round,
    peaceRounds: state.peaceRounds,
    currentWeather: state.currentWeather,
    nextWeather: state.nextWeather,
    useWeather: state.useWeather,
  };

  state.devLog?.info(CAT.STATE, "游戏存档完成", {
    round: data.round,
    phase: data.phase,
    playerCount: data.players.length,
    aliveCount: data.players.filter((p) => p.alive).length,
  });

  return data;
}

/**
 * 从存档数据恢复游戏状态。
 * state 必须是已通过 createGameState() 创建的响应式对象。
 * @returns {boolean} 是否成功恢复
 */
export function deserializeGameState(state, saveData) {
  if (!saveData || !saveData.players || !Array.isArray(saveData.players)) {
    return false;
  }

  // 1. 恢复玩家
  state.players = saveData.players.map((sp) => {
    const charData = CHARACTERS[sp.characterId];
    const se = sp.statusEffects || {};
    const rel = sp.relations || {};
    return {
      index: sp.index,
      name: sp.name,
      characterId: sp.characterId,
      hp: sp.hp,
      maxHp: sp.maxHp,
      alive: sp.alive,
      defensePile: (sp.defensePile || []).map((c) => ({ ...c })),
      trap: sp.trap ? { ...sp.trap } : null,
      bait: sp.bait ? { ...sp.bait } : null,
      skillUses: sp.skillUses ?? charData?.maxUses ?? 0,
      fightingSpirit: sp.fightingSpirit ?? 0,
      moonPhase: sp.moonPhase ?? 0,
      loadUses: sp.loadUses ?? charData?.loadMaxUses ?? 0,
      statusEffects: {
        frozenBy: se.frozenBy ?? null,
        stealTarget: se.stealTarget ? { ...se.stealTarget } : null,
        dotTarget: se.dotTarget ? { ...se.dotTarget } : null,
        damageBonus: { ...(se.damageBonus || {}) },
        ignoreTrapThisTurn: se.ignoreTrapThisTurn ?? false,
        extraAction: se.extraAction ?? false,
        savepoint: null,
      },
      relations: {
        allyIndex: rel.allyIndex ?? null,
        allianceTurns: rel.allianceTurns ?? 0,
        betrayalPenalty: rel.betrayalPenalty ?? 0,
        allyKillBonus: rel.allyKillBonus ?? false,
        consecutiveGambles: rel.consecutiveGambles ?? 0,
        gamblePenalty: rel.gamblePenalty ?? false,
      },
      isAI: sp.isAI ?? false,
      aiDifficulty: sp.aiDifficulty ?? null,
      teamId: sp.teamId ?? -1,
      // 圣遗物字段
      artifactId: sp.artifactId ?? null,
      breakCount: sp.breakCount ?? 0,
      holyWordUses: sp.holyWordUses ?? 2,
      artifactActive: sp.artifactActive ?? false,
      artifactRoundsLeft: sp.artifactRoundsLeft ?? 0,
    };
  });

  // 2. 恢复牌堆
  state.deck = (saveData.deck || []).map((c) => ({ ...c }));
  state.grave = (saveData.grave || []).map((c) => ({ ...c }));
  state.weatherDeck = (saveData.weatherDeck || []).map((c) => ({ ...c }));

  // 3. 恢复回合/阶段
  state.currentPlayerIndex = saveData.currentPlayerIndex ?? 0;
  state.phase = saveData.phase ?? PHASE.PEACE;
  state.step = STEP.PICK_ACTION;
  state.round = saveData.round ?? 1;
  state.peaceRounds = saveData.peaceRounds ?? 4;
  state.currentWeather = saveData.currentWeather ?? null;
  state.nextWeather = saveData.nextWeather ?? null;
  state.useWeather = saveData.useWeather ?? false;

  // 4. 重置临时状态（必须全部覆盖，防止上一局残留字段影响读档行为）
  state.endTurn = true;
  state.gameOver = false;
  state.winnerIndex = -1;
  state.messageLog = [`游戏已读取存档（第${state.round}回合）`];
  state.scryCards = null;
  state.pendingAttackCard = null;
  state.pendingVentiCards = null;
  state._elimGuard = false;
  state._elimPaused = false;
  state._gameJustReset = false;
  state._peaceStartRound = 0;
  state._skipAnim = false;
  state.pendingFurinaTarget = false;
  state._aimiliyaFreeze = null;
  delete state._fenjinHeal;
  state._liniyaSubSkill = null;
  if (state._caiyueangMode !== undefined) {
    state._caiyueangMode = null;
  }
  state.pendingGamble = null;

  // 5. 校验游戏状态
  checkGameOver(state);

  state.devLog?.info(CAT.STATE, "游戏读档完成", {
    round: state.round,
    phase: state.phase,
    currentPlayer: state.players[state.currentPlayerIndex]?.name,
    players: state.players.map((p) => ({
      name: p.name,
      hp: p.hp,
      alive: p.alive,
      defCount: p.defensePile.length,
    })),
  });

  return true;
}
