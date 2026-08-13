// 单机模式控制器 — 状态创建 / 节点流程 / 战斗操作 / 商店营地 / 存档
// 桥接：UI 组件 ↔ 纯逻辑层（solo.js / soloCombat.js / soloEvents.js）

import { reactive, ref } from "vue";
import { createSoloState, getCurrentNode, advanceNode, isSoloFinished } from "./logic/solo.js";
import {
  startCombat,
  pickPoker,
  playCard,
  startEnemyTurn,
  enemyAnnounce,
  enemyResolve,
  claimCardReward,
} from "./logic/soloCombat.js";
import { applyEventOption } from "./logic/soloEvents.js";
import { SOLO_CONST, SOLO_ENEMIES, DEFAULT_CHAR_ID, NODE_META } from "./logic/soloConstants.js";
import {
  shopCatalog,
  shopBuy,
  shopRemovePrice,
  shopHealPrice,
  shopUpgradePrice,
  removeCard,
  upgradeCard,
  spendGold,
  addGold,
  healPlayer,
  applyAttrPoints,
  serializeSolo,
  deserializeSolo,
} from "./logic/solo.js";

/**
 * 单机模式控制器
 * uiMode: map(地图/节点选择) | battle(战斗) | reward(胜利领卡) | event | shop | camp | gameover
 */
export function useSoloController() {
  const soloState = reactive(createSoloState(DEFAULT_CHAR_ID));
  const soloStarted = ref(false);
  const uiMode = ref("map");
  const battleMsg = ref("");
  const eventResult = ref(null); // 事件结算结果（展示后点"前往下一节点"）
  const rewardClaimed = ref(false); // 战斗奖励是否已领

  // ---- 开始 / 退出 ----

  function initSolo(charId = DEFAULT_CHAR_ID) {
    Object.assign(soloState, createSoloState(charId));
    soloStarted.value = true;
    uiMode.value = "map";
    eventResult.value = null;
    rewardClaimed.value = false;
    battleMsg.value = "";
  }

  function quitSolo() {
    soloStarted.value = false;
    uiMode.value = "map";
  }

  // ---- 节点流程 ----

  /** 进入当前节点 */
  function enterNode() {
    if (soloState.gameOver) {
      uiMode.value = "gameover";
      return;
    }
    const node = getCurrentNode(soloState);
    if (!node) {
      // 全部节点打完且非战斗：通关
      soloState.victory = true;
      soloState.gameOver = true;
      uiMode.value = "gameover";
      return;
    }
    if (node.type === "battle") {
      startCombat(soloState, node.enemy);
      uiMode.value = "battle";
    } else if (node.type === "event") {
      uiMode.value = "event";
    } else if (node.type === "shop") {
      uiMode.value = "shop";
    } else if (node.type === "camp") {
      uiMode.value = "camp";
    }
  }

  /** 非战斗节点完成后推进 */
  function completeNode() {
    eventResult.value = null;
    rewardClaimed.value = false;
    if (soloState.gameOver) {
      uiMode.value = "gameover";
      return;
    }
    advanceNode(soloState);
    enterNode();
  }

  /** 下一节点信息（"前往下一节点（类型）"按钮用） */
  function nextNodeInfo() {
    const n = soloState.mapNodes[soloState.nodeIndex + 1];
    if (!n) return null;
    return { type: n.type, label: nodeLabel(n) };
  }
  function nodeLabel(n) {
    if (n.type === "battle") {
      const enemy = SOLO_ENEMIES[n.enemy];
      return `⚔️ 战斗（${enemy?.name || "敌人"}）`;
    }
    return `${NODE_META[n.type]?.icon || ""}${NODE_META[n.type]?.name || n.type}`;
  }
  /** 前往下一节点（事件/奖励结算后） */
  function goNext() {
    completeNode();
  }

  // ---- 战斗操作 ----

  function doPickPoker(idxA, idxB, idxC) {
    const r = pickPoker(soloState, idxA, idxB, idxC);
    battleMsg.value = r.ok ? "" : r.reason || "";
    return r;
  }

  function doPlayCard(cardId, count = 1) {
    const r = playCard(soloState, cardId, count);
    if (!r.ok) {
      battleMsg.value = r.reason || "无法出牌";
      return r;
    }
    battleMsg.value = "";
    // 胜利或失败即时切界面
    const phase = soloState.combat?.phase;
    if (phase === "won") uiMode.value = "reward";
    else if (phase === "lost") uiMode.value = "gameover";
    return r;
  }

  function doEndTurn() {
    startEnemyTurn(soloState);
    scheduleEnemy();
  }

  // AI 出牌慢放：宣布 → 延迟 1.5s → 结算 → 下一张
  function scheduleEnemy() {
    const step = () => {
      const r = enemyAnnounce(soloState);
      const phase = soloState.combat?.phase;
      if (phase === "lost" || phase === "won") {
        uiMode.value = phase === "lost" ? "gameover" : "reward";
        return;
      }
      if (r.playing) {
        setTimeout(() => {
          enemyResolve(soloState);
          const p = soloState.combat?.phase;
          if (p === "lost") uiMode.value = "gameover";
          else if (p === "won") uiMode.value = "reward";
          else step(); // 继续宣布下一张
        }, SOLO_CONST.AI_PLAY_DELAY);
      } else {
        // 敌方回合结束（finishEnemyTurn 已回玩家回合）
        battleMsg.value = "";
      }
    };
    step();
  }

  /** 战斗胜利领卡（3 选 1），领卡后停在奖励界面等"前往下一节点" */
  function claimReward(cardId) {
    const r = claimCardReward(soloState, cardId);
    if (!r.ok) return r;
    rewardClaimed.value = true;
    if (soloState.victory || soloState.gameOver) {
      uiMode.value = "gameover";
    }
    return r;
  }

  // ---- 事件 ----

  function resolveEventOption(optionIdx) {
    const node = getCurrentNode(soloState);
    const eventId = node?.eventId;
    if (!eventId) return { ok: false };
    const r = applyEventOption(soloState, eventId, optionIdx);
    if (soloState.gameOver) {
      uiMode.value = "gameover";
      return r;
    }
    // 展示结算结果，玩家确认后点"前往下一节点"
    eventResult.value = r;
    return r;
  }

  // ---- 商店 ----

  function shopCatalogList() {
    return shopCatalog(soloState);
  }

  function doShopBuy(cardId) {
    const r = shopBuy(soloState, cardId);
    return r;
  }

  function doShopRemove(cardId) {
    const price = shopRemovePrice(soloState);
    if (!spendGold(soloState, price)) return { ok: false, reason: "金币不足" };
    removeCard(soloState, cardId);
    return { ok: true, price };
  }

  function doShopHeal() {
    const need = soloState.player.maxHp - soloState.player.hp;
    if (need <= 0) return { ok: false, reason: "HP 已满" };
    const price = shopHealPrice(need);
    if (!spendGold(soloState, price)) return { ok: false, reason: "金币不足" };
    healPlayer(soloState, need);
    return { ok: true, price, healed: need };
  }

  function doShopUpgrade(cardId) {
    const price = shopUpgradePrice();
    if (!spendGold(soloState, price)) return { ok: false, reason: "金币不足" };
    upgradeCard(soloState, cardId);
    return { ok: true, price };
  }

  // ---- 营地 ----

  function doCampHeal() {
    const need = soloState.player.maxHp - soloState.player.hp;
    if (need <= 0) return { ok: false, reason: "HP 已满" };
    const price = shopHealPrice(need);
    if (!spendGold(soloState, price)) return { ok: false, reason: "金币不足" };
    healPlayer(soloState, need);
    return { ok: true, price, healed: need };
  }

  function doCampUpgrade(cardId) {
    const price = shopUpgradePrice();
    if (!spendGold(soloState, price)) return { ok: false, reason: "金币不足" };
    upgradeCard(soloState, cardId);
    return { ok: true, price };
  }

  // ---- 属性点 ----

  function doApplyAttr(attr) {
    return applyAttrPoints(soloState, attr, 1);
  }

  // ---- 存档 ----

  function saveSolo() {
    const data = serializeSolo(soloState);
    localStorage.setItem("dead13_solo_save", JSON.stringify(data));
    return true;
  }

  /** 是否存在单机存档 */
  function hasSoloSave() {
    return !!localStorage.getItem("dead13_solo_save");
  }

  function loadSolo() {
    const raw = localStorage.getItem("dead13_solo_save");
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      deserializeSolo(soloState, data);
      soloStarted.value = true;
      battleMsg.value = "";
      eventResult.value = null;
      rewardClaimed.value = false;
      // 恢复到保存时的界面状态
      if (soloState.gameOver) {
        uiMode.value = "gameover";
      } else if (
        soloState.combat &&
        (soloState.combat.phase === "play" ||
          soloState.combat.phase === "pick-poker" ||
          soloState.combat.phase === "draw-skill")
      ) {
        uiMode.value = "battle"; // 战斗中读档 → 回到战斗
      } else if (soloState.combat?.phase === "won" && soloState.combat.lastReward) {
        uiMode.value = "reward"; // 战斗胜利未领卡
      } else {
        // 非战斗节点：按节点类型恢复
        const node = getCurrentNode(soloState);
        if (node?.type === "event") uiMode.value = "event";
        else if (node?.type === "shop") uiMode.value = "shop";
        else if (node?.type === "camp") uiMode.value = "camp";
        else uiMode.value = "map";
      }
      return true;
    } catch {
      return false;
    }
  }

  function clearSoloSave() {
    localStorage.removeItem("dead13_solo_save");
  }

  return {
    soloState,
    soloStarted,
    uiMode,
    battleMsg,
    eventResult,
    rewardClaimed,
    initSolo,
    quitSolo,
    enterNode,
    completeNode,
    nextNodeInfo,
    goNext,
    doPickPoker,
    doPlayCard,
    doEndTurn,
    claimReward,
    resolveEventOption,
    shopCatalogList,
    doShopBuy,
    doShopRemove,
    doShopHeal,
    doShopUpgrade,
    doCampHeal,
    doCampUpgrade,
    doApplyAttr,
    saveSolo,
    loadSolo,
    hasSoloSave,
    clearSoloSave,
  };
}
