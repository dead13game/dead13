import { reactive } from "vue";
import { PHASE, STEP, CHARACTERS, MOON_NAMES } from "./constants.js";
import {
  createFullDeck,
  shuffleDeck,
  drawCards,
  reshuffleFromGrave,
  cardDisplay,
} from "./deck.js";
import { createGameLogger, CAT } from "./gameLogger.js";

// ── 子模块 ──
import {
  applyDamage,
  dissolveAlliance,
  alivePlayers,
  checkGameOver,
} from "./damage.js";
import {
  setupWeatherDeck,
  drawWeather,
  getCurrentWeather,
  getNextWeather,
} from "./weather.js";

import {
  startAttack,
  executeAttack,
  executeDefense,
  executeGamble,
  submitGamble,
  _injectCombatDeps,
} from "./combat.js";

import {
  canUseSkill,
  executeSkill,
  executeRaidenSkill,
  executeFurinaSwap,
  executeFenjinSkill,
  executeLiniyaSkill,
  executeAimiliyaSkill,
  submitNahidaScry,
  executeSkillCaiyueang,
  _injectSkillsDeps,
} from "./skills.js";

import {
  startAlly,
  executeAlly,
  executeBetray,
  getAllianceTargets,
  _injectAllianceDeps,
} from "./alliance.js";

import {
  executeSkillCaiyueangEntry,
  executeCaiyueangSave,
  executeCaiyueangLoad,
  _injectCaiyueangDeps,
} from "./caiyueang.js";

// ════════════════════════════════════
//  工具函数（导出供子模块使用）
// ════════════════════════════════════

export function addLog(state, msg) {
  state.messageLog.push(msg);
}

export function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

export function ensureDeck(state, n = 1) {
  if (state.deck.length >= n) return;
  const graveCount = state.grave.length;
  state.deck = reshuffleFromGrave(state.grave);
  state.grave = [];
  addLog(state, "牌库重构");
  state.devLog.info(
    CAT.DECK,
    `牌库重构: 墓地${graveCount}张 → 牌库${state.deck.length}张`,
    { graveCount, deckCount: state.deck.length, round: state.round },
  );
}

/** 统一行动结束出口 */
export function endAction(state) {
  // Bug fix: 比赛模式阵亡后暂停，等待 UI 处理换人/重置（防止幽灵回合）
  if (state._elimPaused) {
    state._elimPaused = false;
    return;
  }
  // 比赛模式：游戏刚被重置（击杀→resetGameForNextLife），当前玩家已完成首次行动
  // 不再推进回合逻辑（已设好 round/phase），只需推进到下一个存活玩家，防止同一玩家连续行动
  if (state._gameJustReset) {
    state._gameJustReset = false;
    // 手动推进到下一个存活玩家，不触发 nextPlayer 的回合逻辑（天气、月相等）
    let next = state.currentPlayerIndex + 1;
    while (next < state.players.length && !state.players[next].alive) {
      next++;
    }
    if (next >= state.players.length) next = 0;
    while (next < state.players.length && !state.players[next].alive) {
      next++;
    }
    if (next < state.players.length && state.players[next]?.alive) {
      state.currentPlayerIndex = next;
      state.step = STEP.PICK_ACTION;
    }
    return;
  }
  if (state.endTurn) {
    state.endTurn = true;
    nextPlayer(state);
  } else {
    state.endTurn = true;
    state.step = STEP.PICK_ACTION;
    addLog(state, `${currentPlayer(state).name} 获得额外行动`);
    state.devLog.debug(CAT.STATE, `${currentPlayer(state).name} 获得额外行动`);
  }
}

// ── 依赖注入：让子模块能使用上述工具函数 ──
_injectCombatDeps(currentPlayer, addLog, ensureDeck, endAction);
_injectSkillsDeps(currentPlayer, addLog, ensureDeck, endAction);
_injectAllianceDeps(currentPlayer, addLog, ensureDeck, endAction);
_injectCaiyueangDeps(currentPlayer, addLog, endAction, checkGameOver);

// ════════════════════════════════════
//  状态创建
// ════════════════════════════════════

function createPlayer(index, charData, name) {
  return {
    index,
    name: name || `玩家 ${index + 1}`,
    characterId: charData.id,
    characterName: charData.name,
    characterTitle: charData.title,
    characterIcon: charData.icon,
    hp: charData.hp,
    maxHp: charData.hp,
    alive: true,
    defensePile: [],
    trap: null,
    bait: null,
    skillUses: charData.maxUses,
    skillName: charData.skillName,
    skillDesc: charData.skillDesc,
    skillType: charData.skillType,
    maxUses: charData.maxUses,
    fightingSpirit: 0,
    moonPhase: 0,
    ignoreTrapThisTurn: false,
    extraAction: false,
    loadUses: 3,
    loadMaxUses: 3,
    stealTarget: null,
    dotTarget: null,
    damageBonus: {},
    frozenBy: null,
    savepoint: null,
    isAI: false,
    aiDifficulty: null, // 'easy' | 'skilled' | 'hell'
    allyIndex: null,
    allianceTurns: 0,
    betrayalPenalty: 0,
    allyKillBonus: false,
    consecutiveGambles: 0,
    gamblePenalty: false,
  };
}

export function createGameState() {
  const state = reactive({
    players: [],
    currentPlayerIndex: 0,
    phase: PHASE.SETUP,
    step: STEP.PICK_ACTION,
    deck: [],
    grave: [],
    weatherDeck: [],
    currentWeather: null,
    nextWeather: null,
    round: 0,
    messageLog: [],
    gameOver: false,
    winnerIndex: -1,
    endTurn: true,
    scryCards: null,
    pendingAttackCard: null,
    pendingVentiCards: null,
    useWeather: false,
    matchContext: null,
    _skipAnim: false,
    _gameJustReset: false,
    _elimPaused: false,
    aiPeekDepth: 3, // 地狱AI偷看牌库深度
    devLog: null,
  });

  state.devLog = createGameLogger(() => state);
  return state;
}

// ════════════════════════════════════
//  游戏初始化
// ════════════════════════════════════

export function initGame(
  state,
  playerChars,
  useWeather = false,
  startingRound = 1,
) {
  const savedMatchContext = state.matchContext;
  const savedDevLog = state.devLog;

  Object.assign(state, {
    players: [],
    currentPlayerIndex: 0,
    phase: PHASE.SETUP,
    step: STEP.PICK_ACTION,
    deck: [],
    grave: [],
    weatherDeck: [],
    currentWeather: null,
    nextWeather: null,
    round: 0,
    messageLog: [],
    gameOver: false,
    winnerIndex: -1,
    scryCards: null,
    pendingAttackCard: null,
    pendingVentiCards: null,
    endTurn: true,
    useWeather,
    matchContext: savedMatchContext,
    devLog: savedDevLog,
    _elimGuard: false,
    _elimPaused: false,
    _peaceStartRound: 0,
  });

  savedDevLog.clear();

  state.deck = shuffleDeck(createFullDeck(2));

  playerChars.forEach((charId, i) => {
    const charData = CHARACTERS.find((c) => c.id === charId);
    if (charData) {
      state.players.push(createPlayer(i, charData));
    }
  });

  state.players.sort((a, b) => {
    if (a.hp !== b.hp) return a.hp - b.hp;
    return a.index - b.index;
  });
  state.players.forEach((p, i) => {
    p.index = i;
  });

  if (useWeather) {
    setupWeatherDeck(state);
  }

  state.phase = PHASE.PEACE;
  state.peaceRounds = 4;
  state.round = startingRound;
  state.step = STEP.PICK_ACTION;

  if (startingRound > state.peaceRounds) {
    state.phase = PHASE.NORMAL;
  }

  addLog(state, "亡命十三街开始");
  addLog(
    state,
    `角色：${state.players.map((p) => p.characterName).join(" · ")}`,
  );
  addLog(state, `行动顺序：${state.players.map((p) => p.name).join(" → ")}`);
  if (state.phase === PHASE.PEACE) {
    addLog(state, `和平发育（第1-${state.peaceRounds}回合禁止攻击）`);
  }

  state.devLog.info(
    CAT.STATE,
    `游戏初始化 ${state.players.length}人局，${state.useWeather ? "启用" : "无"}天气`,
    {
      players: state.players.map((p) => ({
        name: p.name,
        char: p.characterName,
        hp: p.hp,
      })),
      phase: state.phase,
      peaceRounds: state.peaceRounds,
      startingRound,
    },
  );
}

// ════════════════════════════════════
//  回合推进（核心循环）
// ════════════════════════════════════

function nextPlayer(state, _depth = 0) {
  if (_depth > state.players.length) return;
  let next = state.currentPlayerIndex + 1;
  while (next < state.players.length && !state.players[next].alive) {
    next++;
  }

  if (next >= state.players.length || !state.players[next]?.alive) {
    // 新回合
    state.round++;
    next = 0;
    while (next < state.players.length && !state.players[next].alive) {
      next++;
    }

    // 阶段切换
    if (
      state.phase === PHASE.PEACE &&
      state.round > (state._peaceStartRound ?? 0) + state.peaceRounds
    ) {
      state.phase = PHASE.NORMAL;
      addLog(state, `第${state.round}回合 战斗开始`);
      state.devLog.info(
        CAT.STATE,
        `阶段切换 PEACE → NORMAL（第${state.round}回合）`,
      );
    } else {
      addLog(state, `------ 第${state.round}回合 ------`);
    }
    state.devLog.info(CAT.STATE, `第${state.round}回合开始`, {
      phase: state.phase,
      aliveCount: alivePlayers(state).length,
    });

    // 天气
    if (state.useWeather) {
      drawWeather(state);
      const w = getCurrentWeather(state);
      addLog(state, w?.name || "风和日丽");
      state.devLog.info(CAT.WEATHER, `天气: ${w?.name || "风和日丽"}`, {
        weather: state.currentWeather,
        nextWeather: state.nextWeather,
      });
      if (state.currentWeather === "rain") {
        for (const p of state.players) {
          if (p.alive && p.defensePile.length > 0) {
            const discarded = p.defensePile.pop();
            state.grave.push(discarded);
            addLog(state, `${p.name} 防御牌被暴雨冲走`);
            state.devLog.debug(CAT.WEATHER, `${p.name} 防御牌被暴雨冲走`, {
              card: cardDisplay(discarded),
            });
          }
        }
      }
    }

    // 月相轮换
    for (const p of state.players) {
      if (p.alive && p.characterId === "columbina") {
        p.moonPhase = (p.moonPhase + 1) % 3;
        addLog(state, `哥伦比娅月相 ${MOON_NAMES[p.moonPhase]}`);
      }
    }

    // 比赛模式：通知新回合（用于回合上限检查等）
    if (state.matchContext?.onNewRound) {
      state.matchContext.onNewRound(state.round);
    }

    // 联盟/背刺回合处理
    for (const p of state.players) {
      if (!p.alive) continue;
      if (p.allianceTurns > 0) {
        p.allianceTurns--;
        if (p.allianceTurns <= 0) {
          dissolveAlliance(state, p);
          addLog(state, `${p.name} 联盟到期`);
        }
      }
      if (p.betrayalPenalty > 0) {
        p.betrayalPenalty--;
        if (p.betrayalPenalty <= 0) {
          addLog(state, `${p.name} 背刺惩罚结束`);
        }
      }
      if (p.allyKillBonus && p.allyIndex !== null) {
        p.allyKillBonus = false;
        addLog(state, `${p.name} 盟友击杀奖励：立即执行一次防御或赌命`);
        state.endTurn = false;
      }
    }

    // 莉奈娅被动
    for (const p of state.players) {
      if (!p.alive) continue;

      if (p.dotTarget && p.dotTarget.turns > 0) {
        const target = state.players.find((t) => t.index === p.dotTarget.idx);
        if (target?.alive) {
          addLog(state, `${target.name} 受到莉奈娅DoT 5点伤害（无视陷阱）`);
          state.devLog.info(
            CAT.DAMAGE,
            `莉奈娅DoT: ${p.name} → ${target.name} 5点伤害`,
            {
              remaining: p.dotTarget.turns - 1,
            },
          );
          applyDamage(state, target, 5);
          p.dotTarget.turns--;
          if (p.dotTarget.turns <= 0) p.dotTarget = null;
        } else {
          p.dotTarget = null;
        }
      }

      if (p.stealTarget && p.stealTarget.turns > 0) {
        const target = state.players.find((t) => t.index === p.stealTarget.idx);
        if (target?.alive && target.defensePile.length > 0) {
          const stolen = target.defensePile.pop();
          stolen.faceUp = true;
          p.defensePile.push(stolen);
          addLog(state, `${p.name} 偷取了 ${target.name} 的防御牌`);
        }
        p.stealTarget.turns--;
        if (p.stealTarget.turns <= 0) p.stealTarget = null;
      }
    }

    checkGameOver(state);
  }

  if (!state.gameOver && state.players[next]?.alive) {
    state.currentPlayerIndex = next;
    const p = currentPlayer(state);

    if (p.frozenBy !== null) {
      addLog(state, `${p.name} 被冻结，跳过行动`);
      state.devLog.info(CAT.STATE, `${p.name} 被冻结，跳过行动`);
      p.frozenBy = null;
      nextPlayer(state, _depth + 1);
      return;
    }

    state.step = STEP.PICK_ACTION;
    p.ignoreTrapThisTurn = false;
    addLog(state, `当前 ${p.name} 行动`);
    state.devLog.debug(CAT.STATE, `轮到 ${p.name} 行动`, {
      hp: p.hp,
      defCount: p.defensePile.length,
      hasTrap: !!p.trap,
      skillUses: p.skillUses,
      allyIndex: p.allyIndex,
    });
  }
}

// ════════════════════════════════════
//  游戏存档（手动持久化）
// ════════════════════════════════════

/**
 * 序列化当前游戏状态为可 JSON 存储的纯对象。
 * Vue 层调用后自行写入 localStorage。
 * @returns {Object} 可 JSON.stringify 的存档数据
 */
export function serializeGameState(state) {
  const data = {
    version: 1,
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
      maxUses: p.maxUses,
      fightingSpirit: p.fightingSpirit,
      moonPhase: p.moonPhase,
      ignoreTrapThisTurn: p.ignoreTrapThisTurn,
      extraAction: p.extraAction,
      loadUses: p.loadUses,
      loadMaxUses: p.loadMaxUses,
      stealTarget: p.stealTarget ? { ...p.stealTarget } : null,
      dotTarget: p.dotTarget ? { ...p.dotTarget } : null,
      damageBonus: { ...p.damageBonus },
      frozenBy: p.frozenBy,
      allyIndex: p.allyIndex,
      allianceTurns: p.allianceTurns,
      betrayalPenalty: p.betrayalPenalty,
      allyKillBonus: p.allyKillBonus,
      consecutiveGambles: p.consecutiveGambles,
      gamblePenalty: p.gamblePenalty,
      isAI: p.isAI,
      aiDifficulty: p.aiDifficulty,
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
    const charData = CHARACTERS.find((c) => c.id === sp.characterId);
    return {
      index: sp.index,
      name: sp.name,
      characterId: sp.characterId,
      characterName: sp.characterName,
      characterTitle: sp.characterTitle,
      characterIcon: sp.characterIcon,
      hp: sp.hp,
      maxHp: sp.maxHp,
      alive: sp.alive,
      defensePile: (sp.defensePile || []).map((c) => ({ ...c })),
      trap: sp.trap ? { ...sp.trap } : null,
      bait: sp.bait ? { ...sp.bait } : null,
      skillUses: sp.skillUses ?? charData?.maxUses ?? 0,
      skillName: sp.skillName ?? charData?.skillName ?? "",
      skillDesc: sp.skillDesc ?? charData?.skillDesc ?? "",
      skillType: sp.skillType ?? charData?.skillType ?? "",
      maxUses: sp.maxUses ?? charData?.maxUses ?? 0,
      fightingSpirit: sp.fightingSpirit ?? 0,
      moonPhase: sp.moonPhase ?? 0,
      ignoreTrapThisTurn: sp.ignoreTrapThisTurn ?? false,
      extraAction: sp.extraAction ?? false,
      loadUses: sp.loadUses ?? 3,
      loadMaxUses: sp.loadMaxUses ?? 3,
      stealTarget: sp.stealTarget ? { ...sp.stealTarget } : null,
      dotTarget: sp.dotTarget ? { ...sp.dotTarget } : null,
      damageBonus: { ...(sp.damageBonus || {}) },
      frozenBy: sp.frozenBy ?? null,
      savepoint: null,
      allyIndex: sp.allyIndex ?? null,
      allianceTurns: sp.allianceTurns ?? 0,
      betrayalPenalty: sp.betrayalPenalty ?? 0,
      allyKillBonus: sp.allyKillBonus ?? false,
      consecutiveGambles: sp.consecutiveGambles ?? 0,
      gamblePenalty: sp.gamblePenalty ?? false,
      isAI: sp.isAI ?? false,
      aiDifficulty: sp.aiDifficulty ?? null,
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

// ════════════════════════════════════
//  重新导出（向后兼容）
// ════════════════════════════════════

export {
  // damage.js
  applyDamage,
  dissolveAlliance,
  checkGameOver,
  alivePlayers,
  // weather.js
  getCurrentWeather,
  getNextWeather,
  // combat.js
  startAttack,
  executeAttack,
  executeDefense,
  executeGamble,
  submitGamble,
  // skills.js
  canUseSkill,
  executeSkill,
  executeRaidenSkill,
  executeFurinaSwap,
  executeFenjinSkill,
  executeLiniyaSkill,
  executeAimiliyaSkill,
  submitNahidaScry,
  executeSkillCaiyueang,
  // alliance.js
  startAlly,
  executeAlly,
  executeBetray,
  getAllianceTargets,
  // caiyueang.js
  executeCaiyueangSave,
  executeCaiyueangLoad,
};
