import { reactive } from "vue";
import {
  PHASE,
  STEP,
  CHARACTERS,
  MOON_NAMES,
  getCharData,
} from "./constants.js";
import {
  createFullDeck,
  shuffleDeck,
  drawCards,
  reshuffleFromGrave,
  cardDisplay,
} from "./deck.js";
import { createGameLogger, CAT } from "./gameLogger.js";

import { createPlayer } from "./player.js";
import { serializeGameState, deserializeGameState } from "./serialize.js";
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

import { computeDefenseReinforcement } from "./league.js";

import {
  startAttack,
  executeAttack,
  executeDefense,
  _injectCombatDeps,
} from "./combat.js";
import { executeGamble, submitGamble, _injectGambleDeps } from "./gamble.js";

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

import {
  executeHolyWord,
  canUseHolyWord,
  applyArtifactDamageBoost,
  recordTrapBreak,
  recordDefenseBreak,
  tickArtifactRounds,
  getArtifactData,
  ARTIFACTS,
  _injectArtifactsDeps,
} from "./artifacts.js";

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
_injectGambleDeps(currentPlayer, addLog, ensureDeck, endAction);
_injectSkillsDeps(currentPlayer, addLog, ensureDeck, endAction);
_injectAllianceDeps(currentPlayer, addLog, ensureDeck, endAction);
_injectCaiyueangDeps(currentPlayer, addLog, endAction, checkGameOver);
_injectArtifactsDeps(currentPlayer, addLog, endAction);

// ════════════════════════════════════
//  状态创建
// ════════════════════════════════════

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
    leagueContext: null,
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
  deckCount = 2,
  teamIds = null,
) {
  const savedMatchContext = state.matchContext;
  const savedLeagueContext = state.leagueContext;
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
    leagueContext: savedLeagueContext,
    devLog: savedDevLog,
    _elimGuard: false,
    _elimPaused: false,
    _peaceStartRound: 0,
  });

  savedDevLog.clear();

  state.deck = shuffleDeck(createFullDeck(deckCount));

  playerChars.forEach((charId, i) => {
    const charData = CHARACTERS[charId];
    if (charData) {
      const teamId = teamIds ? teamIds[i] : undefined;
      state.players.push(createPlayer(i, charData, undefined, teamId));
    }
  });

  // 按 speed 降序排列（数字大=行动快），同速按 index 升序
  state.players.sort((a, b) => {
    const sa = CHARACTERS[a.characterId]?.speed ?? 5;
    const sb = CHARACTERS[b.characterId]?.speed ?? 5;
    if (sa !== sb) return sb - sa;
    return a.index - b.index;
  });
  state.players.forEach((p, i) => {
    p.index = i;
  });

  if (useWeather) {
    setupWeatherDeck(state);
  }

  // 联赛模式：无和平期，直接进入战斗
  if (state.leagueContext) {
    state.phase = PHASE.NORMAL;
    state.peaceRounds = 0;
  } else {
    state.phase = PHASE.PEACE;
    state.peaceRounds = 4;
  }
  state.round = startingRound;
  state.step = STEP.PICK_ACTION;

  if (startingRound > state.peaceRounds) {
    state.phase = PHASE.NORMAL;
  }

  addLog(state, "亡命十三街开始");
  addLog(
    state,
    `角色：${state.players.map((p) => getCharData(p).name).join(" · ")}`,
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
        char: getCharData(p).name,
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

    // 不再每回合重排行动顺序 — 游戏开始时已按 speed 排好，后续回合依此顺序执行
    // 重置当前指针到第一个存活玩家
    next = 0;
    while (next < state.players.length && !state.players[next].alive) {
      next++;
    }

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
      if (p.alive && p.characterId === 7) {
        // 哥伦比娅
        p.moonPhase = (p.moonPhase + 1) % 3;
        addLog(state, `哥伦比娅月相 ${MOON_NAMES[p.moonPhase]}`);
      }
    }

    // 圣遗物效果回合递减
    tickArtifactRounds(state);

    // 比赛模式：通知新回合（用于回合上限检查等）
    if (state.matchContext?.onNewRound) {
      state.matchContext.onNewRound(state.round);
    }

    // 联赛模式：通知新回合 + 回合上限检测
    if (state.leagueContext?.onNewRound) {
      state.leagueContext.onNewRound(state.round);
    }
    if (
      state.leagueContext?.maxRounds &&
      state.round > state.leagueContext.maxRounds
    ) {
      state.leagueContext.onRoundLimit();
      state._elimPaused = true;
      return;
    }

    // 3V3 联赛（规则v3.0）：新回合开始，所有玩家行动之前
    if (state.leagueContext) {
      // 1) 清零围攻计数（本回合受击次数）
      for (const p of state.players) {
        if (p.alive) p.attackedThisRound = 0;
      }

      // 2) 劣势方防御补给：存活人数少的一方每人获得 X 张防御牌（X=人数差）
      //    从牌库顶抽 X 张，盖置到防御区顶部，不消耗行动次数；人数相等时不触发
      const reinforcement = computeDefenseReinforcement(state.players);
      if (reinforcement) {
        const { weakerTeamId, diff } = reinforcement;
        ensureDeck(state, diff);
        const r = drawCards(state.deck, diff);
        state.deck = r.remaining;
        for (const p of state.players) {
          if (p.alive && p.teamId === weakerTeamId) {
            r.drawn.forEach((c) => {
              p.defensePile.push({ ...c, faceUp: false });
            });
          }
        }
        const teamName = weakerTeamId === 0 ? "玩家队" : "对手队";
        addLog(state, `劣势方补给：${teamName} 每人获得 ${diff} 张防御牌`);
        state.devLog.info(
          CAT.STATE,
          `劣势方防御补给: ${teamName} 每人 +${diff} 张防御牌（人数差 ${diff}）`,
          { weakerTeamId, diff },
        );
      }
    }

    // 联盟/背刺回合处理
    for (const p of state.players) {
      if (!p.alive) continue;
      if (p.relations.allianceTurns > 0) {
        p.relations.allianceTurns--;
        if (p.relations.allianceTurns <= 0) {
          dissolveAlliance(state, p);
          addLog(state, `${p.name} 联盟到期`);
        }
      }
      if (p.relations.betrayalPenalty > 0) {
        p.relations.betrayalPenalty--;
        if (p.relations.betrayalPenalty <= 0) {
          addLog(state, `${p.name} 背刺惩罚结束`);
        }
      }
      if (p.relations.allyKillBonus && p.relations.allyIndex !== null) {
        p.relations.allyKillBonus = false;
        addLog(state, `${p.name} 盟友击杀奖励：立即执行一次防御或赌命`);
        state.endTurn = false;
      }
    }

    // 莉奈娅被动
    for (const p of state.players) {
      if (!p.alive) continue;

      if (p.statusEffects.dotTarget && p.statusEffects.dotTarget.turns > 0) {
        const target = state.players.find(
          (t) => t.index === p.statusEffects.dotTarget.idx,
        );
        if (target?.alive) {
          addLog(state, `${target.name} 受到莉奈娅DoT 5点伤害（无视陷阱）`);
          state.devLog.info(
            CAT.DAMAGE,
            `莉奈娅DoT: ${p.name} → ${target.name} 5点伤害`,
            {
              remaining: p.statusEffects.dotTarget.turns - 1,
            },
          );
          applyDamage(state, target, 5);
          p.statusEffects.dotTarget.turns--;
          if (p.statusEffects.dotTarget.turns <= 0)
            p.statusEffects.dotTarget = null;
        } else {
          p.statusEffects.dotTarget = null;
        }
      }

      if (
        p.statusEffects.stealTarget &&
        p.statusEffects.stealTarget.turns > 0
      ) {
        const target = state.players.find(
          (t) => t.index === p.statusEffects.stealTarget.idx,
        );
        if (target?.alive && target.defensePile.length > 0) {
          const stolen = target.defensePile.pop();
          stolen.faceUp = true;
          p.defensePile.push(stolen);
          addLog(state, `${p.name} 偷取了 ${target.name} 的防御牌`);
        }
        p.statusEffects.stealTarget.turns--;
        if (p.statusEffects.stealTarget.turns <= 0)
          p.statusEffects.stealTarget = null;
      }
    }

    checkGameOver(state);
  }

  if (!state.gameOver && state.players[next]?.alive) {
    state.currentPlayerIndex = next;
    const p = currentPlayer(state);

    if (p.statusEffects.frozenBy !== null) {
      addLog(state, `${p.name} 被冻结，跳过行动`);
      state.devLog.info(CAT.STATE, `${p.name} 被冻结，跳过行动`);
      p.statusEffects.frozenBy = null;
      nextPlayer(state, _depth + 1);
      return;
    }

    state.step = STEP.PICK_ACTION;
    p.statusEffects.ignoreTrapThisTurn = false;
    addLog(state, `当前 ${p.name} 行动`);
    state.devLog.debug(CAT.STATE, `轮到 ${p.name} 行动`, {
      hp: p.hp,
      defCount: p.defensePile.length,
      hasTrap: !!p.trap,
      skillUses: p.skillUses,
      allyIndex: p.relations.allyIndex,
    });
  }
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
  // artifacts.js
  executeHolyWord,
  canUseHolyWord,
  applyArtifactDamageBoost,
  recordTrapBreak,
  recordDefenseBreak,
  getArtifactData,
  ARTIFACTS,
  // serialize.js
  serializeGameState,
  deserializeGameState,
};
