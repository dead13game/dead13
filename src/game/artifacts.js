// 圣遗物系统 — 纯逻辑层，零依赖

import { STEP } from "./constants.js";
import { CAT } from "./gameLogger.js";

// 这些函数从 gameState.js 注入（live binding）
let _currentPlayer, _addLog, _endAction;

export function _injectArtifactsDeps(currentPlayerFn, addLogFn, endActionFn) {
  _currentPlayer = currentPlayerFn;
  _addLog = addLogFn;
  _endAction = endActionFn;
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

// ===== 圣遗物数据 =====

export const ARTIFACTS = {
  1: {
    id: 1,
    name: "角斗士的终幕礼",
    desc: "你对其他玩家造成的伤害提高50%（向上取整）",
    type: "damage_boost", // 伤害加成
    damageMultiplier: 1.5, // +50%
  },
  2: {
    id: 2,
    name: "流浪大地的乐团",
    desc: "你的攻击有50%概率触发暴击，暴击时伤害×2",
    type: "crit", // 暴击
    critChance: 0.5, // 50%
    critMultiplier: 2, // ×2
  },
};

/** 根据 artifactId 获取圣遗物静态数据 */
export function getArtifactData(artifactId) {
  return ARTIFACTS[artifactId] || null;
}

// ===== 查询函数 =====

/** 检查玩家是否可以使用圣言自明 */
export function canUseHolyWord(state, player) {
  if (!player || !player.alive) return false;
  if (player.breakCount < 8) return false;
  if (player.holyWordUses <= 0) return false;
  // 圣遗物效果已激活时不能再次发动（避免叠加）
  if (player.artifactActive) return false;
  return state.step === STEP.PICK_ACTION;
}

// ===== 核心操作 =====

/**
 * 发动圣言自明
 * 消耗8次击破计数，获得一次额外行动，激活圣遗物效果2回合
 */
export function executeHolyWord(state) {
  if (state.step !== STEP.PICK_ACTION) return false;

  const p = currentPlayer(state);
  if (!canUseHolyWord(state, p)) {
    state.devLog.warn(CAT.SKILL, `${p.name} 尝试发动圣言自明但条件不满足`, {
      breakCount: p.breakCount,
      holyWordUses: p.holyWordUses,
      artifactActive: p.artifactActive,
    });
    return false;
  }

  p.breakCount -= 8;
  p.holyWordUses--;
  p.artifactActive = true;
  p.artifactRoundsLeft = 2;

  const artData = getArtifactData(p.artifactId);
  addLog(
    state,
    `${p.name} 发动圣言自明！圣遗物【${artData?.name || "未知"}】激活（${p.holyWordUses}次剩余）`,
  );
  state.devLog.info(CAT.SKILL, `${p.name} 圣言自明: 激活 ${artData?.name}`, {
    artifactId: p.artifactId,
    holyWordUsesRemaining: p.holyWordUses,
    breakCountRemaining: p.breakCount,
    roundsLeft: p.artifactRoundsLeft,
  });

  // 获得额外行动
  state.endTurn = false;
  state.step = STEP.PICK_ACTION;
  endAction(state);
  return true;
}

// ===== 伤害加成计算 =====

/**
 * 对攻击值应用圣遗物效果
 * 只在攻击者自己的回合内生效
 * @param {object} attacker — 攻击者 player 对象
 * @param {number} attackValue — 当前攻击值（已含全部加成）
 * @param {object} state — 游戏状态（用于日志）
 * @returns {{ value: number, crit: boolean }} 加成后的攻击值和是否暴击
 */
export function applyArtifactDamageBoost(attacker, attackValue, state) {
  if (!attacker.artifactActive || !attacker.artifactId) {
    return { value: attackValue, crit: false };
  }

  const artData = getArtifactData(attacker.artifactId);
  if (!artData) return { value: attackValue, crit: false };

  let finalValue = attackValue;

  if (artData.type === "damage_boost") {
    // 角斗士的终幕礼: +50% 向上取整
    const boost = Math.ceil(attackValue * (artData.damageMultiplier - 1));
    finalValue = attackValue + boost;
    addLog(state, `角斗士的终幕礼 +${boost}`);
    state.devLog.info(
      CAT.DAMAGE,
      `圣遗物伤害加成: ${attackValue} → ${finalValue} (角斗士 +${boost})`,
      { originalValue: attackValue, boostedValue: finalValue, boost },
    );
  } else if (artData.type === "crit") {
    // 流浪大地的乐团: 50% 暴击 ×2
    if (Math.random() < artData.critChance) {
      finalValue = attackValue * artData.critMultiplier;
      addLog(state, "流浪大地的乐团 暴击！伤害×2");
      state.devLog.info(
        CAT.DAMAGE,
        `圣遗物暴击: ${attackValue} → ${finalValue} (流浪大地的乐团)`,
        { originalValue: attackValue, critValue: finalValue },
      );
      return { value: finalValue, crit: true };
    }
  }

  return { value: finalValue, crit: false };
}

// ===== 击破计数 =====

/**
 * 记录陷阱击破（+2：陷阱有明暗两张牌）
 * @param {object} attacker — 攻击者 player 对象
 * @param {object} state — 游戏状态
 */
export function recordTrapBreak(attacker, state) {
  if (!attacker || !attacker.alive) return;
  // 只有选择了圣遗物的玩家才累计击破计数
  if (attacker.artifactId == null) return;
  attacker.breakCount += 2;
  state.devLog.debug(
    CAT.DAMAGE,
    `${attacker.name} 陷阱击破 +2 (总: ${attacker.breakCount})`,
    { breakCount: attacker.breakCount, artifactId: attacker.artifactId },
  );
}

/**
 * 记录防御牌击破（每张防御牌 +1）
 * @param {object} attacker — 攻击者 player 对象
 * @param {number} count — 击破的防御牌数量
 * @param {object} state — 游戏状态
 */
export function recordDefenseBreak(attacker, count, state) {
  if (!attacker || !attacker.alive || count <= 0) return;
  if (attacker.artifactId == null) return;
  attacker.breakCount += count;
  state.devLog.debug(
    CAT.DAMAGE,
    `${attacker.name} 防御击破 +${count} (总: ${attacker.breakCount})`,
    { breakCount: attacker.breakCount, artifactId: attacker.artifactId },
  );
}

// ===== 回合管理 =====

/**
 * 新回合开始时递减所有玩家的圣遗物剩余回合数
 * 应在 nextPlayer 新回合逻辑中调用
 */
export function tickArtifactRounds(state) {
  for (const p of state.players) {
    if (!p.alive || !p.artifactActive) continue;
    p.artifactRoundsLeft--;
    if (p.artifactRoundsLeft <= 0) {
      p.artifactActive = false;
      p.artifactRoundsLeft = 0;
      addLog(state, `${p.name} 的圣遗物效果已结束`);
      state.devLog.info(CAT.SKILL, `${p.name} 圣遗物效果结束`, {
        artifactId: p.artifactId,
      });
    }
  }
}
