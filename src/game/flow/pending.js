// 待决问题(pending)— 取代「step 字符串 + 路由 flag」
//
// 旧实现的问题:同一个 step 被多个角色共用,再靠 state.pendingFurinaTarget /
// state._aimiliyaFreeze / state._fenjinHeal 三个 flag 消歧,消费方(三个 Shell +
// ActionBar + AI)各自再 if/else 一遍。
//
// 新模型:pending 是一个可序列化的数据对象,谁在问、问什么、可选项是什么全在里面。
// step 退化为派生量,只为兼容 UI 模板与动画 watcher 而保持原有字符串。

import { STEP } from "../core/constants.js";

export const PENDING = {
  ACTION: "action", // 该谁行动(旧 pickAction)
  TARGET: "target", // 选一个目标
  GAMBLE: "gambleSetup", // 赌命选陷阱/诱饵
  SCRY: "scryOrder", // 纳西妲重排
  LINIYA: "liniya", // 莉奈娅:子技能 + 目标
  SAVE_OR_LOAD: "saveOrLoad", // 菜月昴
};

/**
 * @param {object} spec
 * @param {string} spec.type    PENDING.*
 * @param {string} spec.purpose 语义标签,如 "attack" / "skill:aimiliya.freeze"
 * @param {number} spec.asker   发起者 uid
 * @param {number[]} [spec.options] 可选目标 uid
 * @param {object} [spec.data]  额外数据(牌、子技能等)
 */
export function createPending({ type, purpose, asker, options, data }) {
  return {
    type,
    purpose,
    asker,
    options: options ? [...options] : [],
    data: data ?? null,
  };
}

/** pending → 旧 step 字符串(UI/动画兼容层) */
export function stepOf(pending) {
  if (!pending) return STEP.PICK_ACTION;
  switch (pending.type) {
    case PENDING.GAMBLE:
      return STEP.GAMBLE_PICK;
    case PENDING.SCRY:
      return STEP.SKILL_NAHIDA;
    case PENDING.LINIYA:
      return STEP.LINIYA_PICK;
    case PENDING.SAVE_OR_LOAD:
      return STEP.CAIYUEANG_PICK;
    case PENDING.TARGET:
      if (pending.purpose === "attack") return STEP.ATTACK_SHOW_CARD;
      if (pending.purpose === "ally") return STEP.ALLY_PICK;
      return STEP.SKILL_PICK_TARGET;
    case PENDING.ACTION:
      return STEP.PICK_ACTION;
    default:
      return STEP.PICK_ACTION;
  }
}

/**
 * 设置 pending 并同步派生 step。
 * 这是唯一允许写 state.step 的地方 —— 旧实现有 30+ 处直接赋值。
 */
export function setPending(state, pending) {
  state.pending = pending;
  state.step = state.gameOver ? STEP.PICK_ACTION : stepOf(pending);
  return pending;
}

export function clearPending(state) {
  state.pending = null;
  state.step = STEP.PICK_ACTION;
}

/** 当前 pending 是否由某人发起(即「轮到谁作答」) */
export function isAsking(state, uid) {
  return !!state.pending && state.pending.asker === uid;
}

/**
 * 校验一个「答案」是否合法。
 * 注意:答案与作答者是两回事 —— 目标可以是任何存活玩家,不要求等于 asker。
 */
export function isValidAnswer(state, answer) {
  if (!state.pending) return false;
  const p = state.pending;
  if (p.options.length === 0) return true; // 无选项约束(如赌命、排序)
  return p.options.includes(answer);
}

/** 便捷构造:向 asker 索要一个目标 */
export function askTarget({ asker, purpose, options, data }) {
  return createPending({
    type: PENDING.TARGET,
    purpose,
    asker,
    options,
    data,
  });
}
