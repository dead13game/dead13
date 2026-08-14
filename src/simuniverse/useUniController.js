// 模拟宇宙控制器 — 区域流程 / 战斗操作 / 事件 / 商店 / 工作台 / 存档
// 桥接：UniShell.vue ↔ 纯逻辑层（uniState / uniCombat / uniEvents / uniShop / uniSkills / uniBuffs）

import { reactive, ref } from "vue";
import {
  createUniState,
  advanceFloor,
  chooseNormalContent,
  enterRegion,
  reviveAtRest,
  serializeUni,
  deserializeUni,
  syncPassives,
} from "./logic/uniState.js";
import {
  startCombat,
  playerAttack,
  playerDefense,
  playerSkill,
  enemyAnnounce,
  enemyResolve,
  chooseThirdWave,
} from "./logic/uniCombat.js";
import {
  applyEventOption,
  chooseBlessingPick,
  applySkillUp,
  getEventDef,
} from "./logic/uniEvents.js";
import { shopBuy, heatStrengthen, overwriteBlessing, overwriteEquation } from "./logic/uniShop.js";
import { canUseUniSkill, getSkillInfo } from "./logic/uniSkills.js";
import { BLESSINGS, CURIOS, EQUATIONS } from "./logic/uniBuffs.js";
import { DEFAULT_TEAM_IDS } from "./logic/uniState.js";

const AI_PLAY_DELAY = 1200; // 敌人慢放延迟（ms）

/**
 * uiMode: choice(2选1) | battle | wave-clear | reward | event | event-result
 *          shop | rest | workbench(造物调试台) | oddity | fortune | gameover
 */
export function useUniController() {
  const uniState = reactive(createUniState(DEFAULT_TEAM_IDS));
  const uniStarted = ref(false);
  const uiMode = ref("charsel"); // 初始进入选角
  const battleMsg = ref("");
  const eventResult = ref(null); // 事件结算结果
  const skillTargetPending = ref(null); // { count } 需要选角色升级
  const selectedChars = ref([...DEFAULT_TEAM_IDS]); // 选角阶段已选角色
  const lastOutcome = ref(null);

  // ---- 开始 / 退出 ----

  /** 进入选角阶段（selectMode 调用） */
  function initUni() {
    uniStarted.value = true;
    uiMode.value = "charsel";
    selectedChars.value = [...DEFAULT_TEAM_IDS];
    battleMsg.value = "";
    eventResult.value = null;
  }

  /** 选角：勾选/取消 1 个角色（最多 4 个） */
  function toggleChar(charId) {
    const list = selectedChars.value;
    const idx = list.indexOf(charId);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      if (list.length >= 4) return false;
      list.push(charId);
    }
    return true;
  }

  /** 确认选角 → 正式开始（创建状态） */
  function startUni() {
    if (selectedChars.value.length !== 4) return { ok: false, reason: "需选 4 名角色" };
    Object.assign(uniState, createUniState(selectedChars.value));
    syncPassives(uniState);
    enterCurrentMode();
    return { ok: true };
  }

  function quitUni() {
    uniStarted.value = false;
  }

  /** 按当前区域类型切换 UI 模式 */
  function enterCurrentMode() {
    if (uniState.gameOver) {
      uiMode.value = "gameover";
      return;
    }
    const r = uniState.region;
    if (!r) {
      uiMode.value = "choice";
      return;
    }
    if (r.type === "normal" || uniState.pendingChoice) {
      uiMode.value = "choice";
    } else if (r.type === "battle" || r.type === "elite" || r.type === "transform") {
      // 战斗区域：未开战则自动开始（读档恢复战斗时不重启）
      if (!uniState.combat) startCombat(uniState);
      uiMode.value = "battle";
    } else if (r.type === "boss") {
      uiMode.value = "workbench"; // 首领战前造物调试台
    } else if (r.type === "event" || r.type === "reward" || r.type === "adventure") {
      uiMode.value = "event";
    } else if (r.type === "shop") {
      uiMode.value = "shop";
    } else if (r.type === "rest") {
      uiMode.value = "rest";
    } else if (r.type === "oddity") {
      uiMode.value = "oddity";
    } else if (r.type === "fortune") {
      uiMode.value = "fortune";
    } else {
      uiMode.value = "choice";
    }
  }

  // ---- 普通层 2 选 1 ----

  function doChooseContent(idx) {
    const r = chooseNormalContent(uniState, idx);
    if (!r.ok) return r;
    enterCurrentMode();
    return r;
  }

  // ---- 战斗 ----

  /** 从 workbench 或事件战斗进入战斗 */
  function startBattle() {
    startCombat(uniState);
    uiMode.value = "battle";
  }

  function doAttack(enemyId) {
    const r = playerAttack(uniState, enemyId);
    if (!r.ok) {
      battleMsg.value = r.reason || "无法攻击";
      return r;
    }
    battleMsg.value = "";
    afterPlayerAction();
    return r;
  }

  function doDefense() {
    const r = playerDefense(uniState);
    if (!r.ok) {
      battleMsg.value = r.reason || "无法防御";
      return r;
    }
    battleMsg.value = "";
    afterPlayerAction();
    return r;
  }

  function doSkill(targetId, payload) {
    const r = playerSkill(uniState, targetId, payload);
    if (!r.ok) {
      battleMsg.value = r.reason || "无法施放";
      return r;
    }
    battleMsg.value = "";
    afterPlayerAction();
    return r;
  }

  /** 玩家行动后：胜利/失败/第三波询问/敌人阶段 */
  function afterPlayerAction() {
    // 菜月昴死亡回归回滚后 combat 已清空 → 恢复到本层区域视图
    if (!uniState.combat) {
      enterCurrentMode();
      return;
    }
    const p = uniState.combat?.phase;
    if (p === "won") {
      uiMode.value = "reward";
      return;
    }
    if (p === "lost") {
      uiMode.value = uniState.gameOver ? "gameover" : "reward";
      return;
    }
    if (p === "wave-clear") {
      uiMode.value = "wave-clear";
      return;
    }
    if (p === "enemy-announce") {
      scheduleEnemy();
    }
  }

  /** 敌人慢放：宣布 → 延迟 → 结算 → 循环 */
  function scheduleEnemy() {
    const step = () => {
      // 菜月昴死亡回归回滚后 combat 清空 → 恢复区域视图
      if (!uniState.combat) {
        enterCurrentMode();
        return;
      }
      const phase = uniState.combat?.phase;
      if (phase === "won" || phase === "lost" || phase === "wave-clear") {
        if (phase === "won") uiMode.value = "reward";
        else if (phase === "lost") uiMode.value = uniState.gameOver ? "gameover" : "reward";
        else uiMode.value = "wave-clear";
        return;
      }
      const r = enemyAnnounce(uniState);
      if (!r.playing) {
        // 回合结束（finishEnemyTurn 已回玩家回合）
        battleMsg.value = "";
        return;
      }
      setTimeout(() => {
        enemyResolve(uniState);
        step();
      }, AI_PLAY_DELAY);
    };
    step();
  }

  /** 转化第三波选择 */
  function doThirdWave(go) {
    const r = chooseThirdWave(uniState, go);
    if (!r.ok) return r;
    if (uniState.combat?.phase === "won") {
      uiMode.value = "reward";
    } else {
      uiMode.value = "battle";
    }
    return r;
  }

  // ---- 事件 ----

  function doEventOption(optionIdx) {
    const r = applyEventOption(uniState, uniState.region.eventId, optionIdx);
    if (!r.ok) return r;
    eventResult.value = r;
    if (uniState.gameOver) {
      uiMode.value = "gameover";
      return r;
    }
    if (r.outcome?.battle) {
      // 事件战斗：进入战斗（pendingEventReward 已挂起）
      startBattle();
      return r;
    }
    if (r.outcome?.needSkillTarget) {
      skillTargetPending.value = r.outcome.needSkillTarget;
    }
    uiMode.value = "event-result";
    return r;
  }

  /** 事件「指定角色升级」选择 */
  function doSkillTarget(charIndex) {
    if (!skillTargetPending.value) return { ok: false };
    const r = applySkillUp(uniState, charIndex, skillTargetPending.value);
    if (r.ok) skillTargetPending.value = null;
    return r;
  }

  /** 祝福三选一选择（事件/战斗奖励队列） */
  function doBlessingPick(id) {
    const r = chooseBlessingPick(uniState, id);
    return r;
  }

  /** 当前待选祝福队列头 */
  function currentBlessingPick() {
    return uniState.pendingBlessingPicks?.[0] || null;
  }

  // ---- 商店 / 休整 / 工作台 ----

  function doShopBuy(type, idx) {
    return shopBuy(uniState, type, idx);
  }

  function doRevive(charIndex) {
    return reviveAtRest(uniState, charIndex);
  }

  function doHeatStrengthen(idx) {
    return heatStrengthen(uniState, idx);
  }

  function doOverwriteBlessing(idx) {
    return overwriteBlessing(uniState, idx);
  }

  function doOverwriteEquation(idx) {
    return overwriteEquation(uniState, idx);
  }

  // ---- 区域推进 ----

  /** 当前区域完成 → 下一区域 */
  function goNext() {
    eventResult.value = null;
    skillTargetPending.value = null;
    const r = advanceFloor(uniState);
    if (!r) {
      uiMode.value = "gameover";
      return;
    }
    enterCurrentMode();
    return r;
  }

  // ---- 工具查询 ----

  function getCurrentEvent() {
    const id = uniState.region?.eventId;
    return id ? getEventDef(id) : null;
  }

  function canSkill(charIndex) {
    return canUseUniSkill(uniState, charIndex);
  }

  function skillInfo(charIndex) {
    return getSkillInfo(uniState, charIndex);
  }

  function blessingName(id) {
    return BLESSINGS[id]?.name || id;
  }

  function curioName(id) {
    return CURIOS[id]?.name || id;
  }

  function equationName(id) {
    return EQUATIONS[id]?.name || id;
  }

  // ---- 存档 ----

  function saveUni() {
    const data = serializeUni(uniState);
    localStorage.setItem("dead13_uni_save", JSON.stringify(data));
    return true;
  }

  function hasUniSave() {
    return !!localStorage.getItem("dead13_uni_save");
  }

  function loadUni() {
    const raw = localStorage.getItem("dead13_uni_save");
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      deserializeUni(uniState, data);
      uniStarted.value = true;
      battleMsg.value = "";
      eventResult.value = null;
      uniState.soundQueue = [];
      enterCurrentMode();
      return true;
    } catch {
      return false;
    }
  }

  function clearUniSave() {
    localStorage.removeItem("dead13_uni_save");
  }

  return {
    uniState,
    uniStarted,
    uiMode,
    battleMsg,
    eventResult,
    skillTargetPending,
    selectedChars,
    initUni,
    toggleChar,
    startUni,
    quitUni,
    enterCurrentMode,
    doChooseContent,
    startBattle,
    doAttack,
    doDefense,
    doSkill,
    doThirdWave,
    doEventOption,
    doSkillTarget,
    doBlessingPick,
    currentBlessingPick,
    doShopBuy,
    doRevive,
    doHeatStrengthen,
    doOverwriteBlessing,
    doOverwriteEquation,
    goNext,
    getCurrentEvent,
    canSkill,
    skillInfo,
    blessingName,
    curioName,
    equationName,
    saveUni,
    loadUni,
    hasUniSave,
    clearUniSave,
  };
}
