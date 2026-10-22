// 单机模式控制器 — 状态创建 / 节点流程 / 战斗操作 / 商店营地 / 存档
// 桥接：UI 组件 ↔ 纯逻辑层（solo.js / soloCombat.js / soloEvents.js）

import { reactive, ref } from "vue";
import type { Ref } from "vue";
import type {
  SoloActionResult,
  SoloAttrKey,
  SoloEventResult,
  SoloMapNode,
  SoloNodeType,
  SoloPickPokerResult,
  SoloShopResult,
  SoloState,
} from "./logic/types.js";
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
 * 界面状态。
 * map(地图/节点选择) | battle(战斗) | reward(胜利领卡) | event | shop | camp | gameover
 */
export type SoloUiMode = "map" | "battle" | "reward" | "event" | "shop" | "camp" | "gameover";

/** 「前往下一节点（类型）」按钮所需信息 */
export interface SoloNextNodeInfo {
  type: SoloNodeType;
  label: string;
}

/** 回血结果（成功时附带实付价格与实际回复量） */
export interface SoloHealResult extends SoloShopResult {
  healed?: number;
}

/**
 * 单机控制器对外接口。
 * App.vue 持有本对象并作为 `:solo` 传给 SoloShell，两边都按此接口对齐。
 */
export interface SoloController {
  /** 单机存档状态（reactive，UI 只读渲染） */
  soloState: SoloState;
  /** 是否已开始一局（false 时 App.vue 显示主菜单） */
  soloStarted: Ref<boolean>;
  /** 当前界面 */
  uiMode: Ref<SoloUiMode>;
  /** 战斗操作失败提示 */
  battleMsg: Ref<string>;
  /** 事件结算结果（展示后点「前往下一节点」） */
  eventResult: Ref<SoloEventResult | null>;
  /** 战斗奖励是否已领 */
  rewardClaimed: Ref<boolean>;

  /** 开始一局（默认角色玛薇卡） */
  initSolo: (charId?: number) => void;
  quitSolo: () => void;

  /** 进入当前节点 */
  enterNode: () => void;
  /** 非战斗节点完成后推进并进入下一节点 */
  completeNode: () => void;
  /** 下一节点信息（null = 已是最后 / 无节点） */
  nextNodeInfo: () => SoloNextNodeInfo | null;
  /** 事件/奖励结算后前往下一节点 */
  goNext: () => void;

  /** 抽 3 选 2：两张行动力 + 一张抽牌数 */
  doPickPoker: (idxA: number, idxB: number, idxC: number) => SoloPickPokerResult;
  /** 出牌（同名牌可一次打出 count 张） */
  doPlayCard: (cardId: string, count?: number) => SoloActionResult;
  /** 结束回合（进入敌方慢放行动） */
  doEndTurn: () => void;
  /** 战斗胜利领卡（3 选 1） */
  claimReward: (cardId: string) => SoloActionResult;

  /** 结算事件选项（含扑克检定） */
  resolveEventOption: (optionIdx: number) => SoloEventResult;

  /** 商店在售卡表 */
  shopCatalogList: () => string[];
  doShopBuy: (cardId: string) => SoloShopResult;
  doShopRemove: (cardId: string) => SoloShopResult;
  doShopHeal: () => SoloHealResult;
  doShopUpgrade: (cardId: string) => SoloShopResult;

  /** 营地：回满血 / 升级一张卡 */
  doCampHeal: () => SoloHealResult;
  doCampUpgrade: (cardId: string) => SoloShopResult;

  /** 分配 1 点属性（str / mag / def） */
  doApplyAttr: (attr: SoloAttrKey) => boolean;

  /** 存档（键名 dead13_solo_save） */
  saveSolo: () => boolean;
  /** 读档，返回是否成功 */
  loadSolo: () => boolean;
  /** 是否存在单机存档 */
  hasSoloSave: () => boolean;
  clearSoloSave: () => void;
}

/**
 * 单机模式控制器
 * uiMode: map(地图/节点选择) | battle(战斗) | reward(胜利领卡) | event | shop | camp | gameover
 */
export function useSoloController(): SoloController {
  const soloState: SoloState = reactive(createSoloState(DEFAULT_CHAR_ID));
  const soloStarted = ref<boolean>(false);
  const uiMode = ref<SoloUiMode>("map");
  const battleMsg = ref<string>("");
  const eventResult = ref<SoloEventResult | null>(null); // 事件结算结果（展示后点"前往下一节点"）
  const rewardClaimed = ref<boolean>(false); // 战斗奖励是否已领

  // ---- 开始 / 退出 ----

  function initSolo(charId: number = DEFAULT_CHAR_ID): void {
    Object.assign(soloState, createSoloState(charId));
    soloStarted.value = true;
    uiMode.value = "map";
    eventResult.value = null;
    rewardClaimed.value = false;
    battleMsg.value = "";
  }

  function quitSolo(): void {
    soloStarted.value = false;
    uiMode.value = "map";
  }

  // ---- 节点流程 ----

  /** 进入当前节点 */
  function enterNode(): void {
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
      startCombat(soloState, node.enemy ?? "");
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
  function completeNode(): void {
    eventResult.value = null;
    rewardClaimed.value = false;
    if (soloState.gameOver) {
      uiMode.value = "gameover";
      return;
    }
    advanceNode(soloState);
    enterNode();
  }

  /** 节点文案（战斗节点带敌人名） */
  function nodeLabel(n: SoloMapNode): string {
    if (n.type === "battle") {
      const enemy = SOLO_ENEMIES[n.enemy ?? ""];
      return `⚔️ 战斗（${enemy?.name || "敌人"}）`;
    }
    return `${NODE_META[n.type]?.icon || ""}${NODE_META[n.type]?.name || n.type}`;
  }

  /** 下一节点信息（"前往下一节点（类型）"按钮用） */
  function nextNodeInfo(): SoloNextNodeInfo | null {
    const n = soloState.mapNodes[soloState.nodeIndex + 1];
    if (!n) return null;
    return { type: n.type, label: nodeLabel(n) };
  }

  /** 前往下一节点（事件/奖励结算后） */
  function goNext(): void {
    completeNode();
  }

  // ---- 战斗操作 ----

  function doPickPoker(idxA: number, idxB: number, idxC: number): SoloPickPokerResult {
    const r = pickPoker(soloState, idxA, idxB, idxC);
    battleMsg.value = r.ok ? "" : r.reason || "";
    return r;
  }

  function doPlayCard(cardId: string, count = 1): SoloActionResult {
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

  function doEndTurn(): void {
    startEnemyTurn(soloState);
    scheduleEnemy();
  }

  // AI 出牌慢放：宣布 → 延迟 1.5s → 结算 → 下一张
  function scheduleEnemy(): void {
    const step = (): void => {
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
  function claimReward(cardId: string): SoloActionResult {
    const r = claimCardReward(soloState, cardId);
    if (!r.ok) return r;
    rewardClaimed.value = true;
    if (soloState.victory || soloState.gameOver) {
      uiMode.value = "gameover";
    }
    return r;
  }

  // ---- 事件 ----

  function resolveEventOption(optionIdx: number): SoloEventResult {
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

  function shopCatalogList(): string[] {
    return shopCatalog(soloState);
  }

  function doShopBuy(cardId: string): SoloShopResult {
    const r = shopBuy(soloState, cardId);
    return r;
  }

  function doShopRemove(cardId: string): SoloShopResult {
    const price = shopRemovePrice(soloState);
    if (!spendGold(soloState, price)) return { ok: false, reason: "金币不足" };
    removeCard(soloState, cardId);
    return { ok: true, price };
  }

  function doShopHeal(): SoloHealResult {
    const need = soloState.player.maxHp - soloState.player.hp;
    if (need <= 0) return { ok: false, reason: "HP 已满" };
    const price = shopHealPrice(need);
    if (!spendGold(soloState, price)) return { ok: false, reason: "金币不足" };
    healPlayer(soloState, need);
    return { ok: true, price, healed: need };
  }

  function doShopUpgrade(cardId: string): SoloShopResult {
    const price = shopUpgradePrice();
    if (!spendGold(soloState, price)) return { ok: false, reason: "金币不足" };
    upgradeCard(soloState, cardId);
    return { ok: true, price };
  }

  // ---- 营地 ----

  function doCampHeal(): SoloHealResult {
    const need = soloState.player.maxHp - soloState.player.hp;
    if (need <= 0) return { ok: false, reason: "HP 已满" };
    const price = shopHealPrice(need);
    if (!spendGold(soloState, price)) return { ok: false, reason: "金币不足" };
    healPlayer(soloState, need);
    return { ok: true, price, healed: need };
  }

  function doCampUpgrade(cardId: string): SoloShopResult {
    const price = shopUpgradePrice();
    if (!spendGold(soloState, price)) return { ok: false, reason: "金币不足" };
    upgradeCard(soloState, cardId);
    return { ok: true, price };
  }

  // ---- 属性点 ----

  function doApplyAttr(attr: SoloAttrKey): boolean {
    return applyAttrPoints(soloState, attr, 1);
  }

  // ---- 存档 ----

  function saveSolo(): boolean {
    const data = serializeSolo(soloState);
    localStorage.setItem("dead13_solo_save", JSON.stringify(data));
    return true;
  }

  /** 是否存在单机存档 */
  function hasSoloSave(): boolean {
    return !!localStorage.getItem("dead13_solo_save");
  }

  function loadSolo(): boolean {
    const raw = localStorage.getItem("dead13_solo_save");
    if (!raw) return false;
    try {
      const data: unknown = JSON.parse(raw);
      deserializeSolo(soloState, data);
      soloStarted.value = true;
      battleMsg.value = "";
      eventResult.value = null;
      rewardClaimed.value = false;
      soloState.soundQueue = []; // 清空存档残留的音效队列，避免读档瞬间重播
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

  function clearSoloSave(): void {
    localStorage.removeItem("dead13_solo_save");
  }

  const controller: SoloController = {
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
  return controller;
}
