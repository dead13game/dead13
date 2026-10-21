<template>
  <div class="game-shell">
    <GameCanvas ref="gameCanvasRef" :state="view" />

    <!-- 顶部信息栏（正常模式） -->
    <div v-if="!worldCupMode && !leagueMode" class="game-shell__top-bar">
      <span class="phase-badge" :class="'phase-badge--' + view.phase">{{
        phaseLabel
      }}</span>
      <span class="top-info">第{{ view.round }}回合</span>
      <span v-if="view.phase === 'peace'" class="peace-hint">和平</span>
      <span class="top-info">牌库 {{ view.deck.length }}</span>
      <span class="top-info top-info--grave"
        >墓地 {{ view.grave.length }}</span
      >
      <span v-if="view.useWeather && weather" class="weather-tag">{{
        weather.name
      }}</span>
      <span v-if="view.useWeather && nextWeather" class="weather-next"
        >下回合: {{ nextWeather.name }}</span
      >
      <button class="relayout-btn" @click="onRelayout" title="重新排版">
        ⟳
      </button>
      <button class="save-quit-btn" @click="onSaveAndQuit" title="保存并退出">
        💾
      </button>
    </div>

    <!-- 底部 UI 栏 -->
    <div class="game-shell__bottom-bar">
      <ActionBar
        v-if="!view.gameOver || worldCupMode || leagueMode"
        :state="view"
        :disabled="animating"
        :league-mode="leagueMode"
        @attack="onAttack"
        @defense="onDefense"
        @gamble="onGamble"
        @skill="onSkill"
        @holyWord="onHolyWord"
        @target="onTarget"
        @skillTarget="onSkillTarget"
        @liniyaSkill="onLiniyaSkill"
        @caiyueangSave="onCaiyueangSave"
        @caiyueangLoad="onCaiyueangLoad"
        @ally="onAlly"
        @betray="onBetray"
        @allyInvite="onAllyInvite"
        @gambleSubmit="onGambleSubmit"
        @nahidaOrder="onNahidaOrder"
        @cancel="cancelPick"
      />

      <GameOverPanel
        v-if="view.gameOver && !worldCupMode && !leagueMode"
        :winner="winner"
        @restart="$emit('restart')"
      />

      <LogPanel :messages="view.messageLog" />
    </div>

    <!-- 开发日志面板（Ctrl+Shift+D 切换） -->
    <DevLogPanel ref="devLogRef" :entries="view.devLog.entries" />
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted, onUnmounted } from "vue";
import GameCanvas from "../pixi/GameCanvas.vue";
import ActionBar from "./ActionBar.vue";
import LogPanel from "./LogPanel.vue";
import GameOverPanel from "./GameOverPanel.vue";
import DevLogPanel from "./DevLogPanel.vue";
import { usePixiSync } from "../bridge/usePixiSync.js";
import { useAnimationFlow } from "../bridge/useAnimationFlow.js";
import { useSoundSync } from "../bridge/useSoundSync.js";
import {
  isAiPlayer,
  decideTopAction,
  decideTarget,
  decideGamblePick,
  decideNahidaOrder,
  decideLiniyaChoice,
  decideCaiyueangChoice,
} from "../game/ai/index.js";
import { dispatch, save } from "../game/api.js";
import { buildView } from "../game/view.js";

const props = defineProps({
  state: { type: Object, required: true },
  worldCupMode: { type: Boolean, default: false },
  leagueMode: { type: Boolean, default: false },
});
const emit = defineEmits(["restart", "saveAndQuit"]);

const gameCanvasRef = ref(null);
const devLogRef = ref(null);

/**
 * 只读 view-model:UI/子组件/PIXI 都读它,写操作统一走 dispatch。
 * 用 reactive 而不是 computed,是为了保持对象身份稳定(桥接层的 watcher 依赖它)。
 */
const view = reactive(buildView(props.state));
watch(
  () => props.state,
  () => Object.assign(view, buildView(props.state)),
  { deep: true },
);

function getManager() {
  return gameCanvasRef.value?.manager ?? null;
}

const phaseLabel = computed(
  () =>
    ({
      setup: "准备中",
      peace: "和平",
      normal: "战斗中",
      gameOver: "结束",
    })[view.phase] || view.phase,
);

const winner = computed(() =>
  view.winnerIndex >= 0
    ? view.players.find((p) => p.index === view.winnerIndex)
    : null,
);

const weather = computed(() => view.getCurrentWeather());
const nextWeather = computed(() => view.getNextWeather());

// 同步 PixiJS(视图是唯一数据源)
usePixiSync(view, getManager);

// 音效：监听 soundQueue → SoundManager 播放
useSoundSync(view);

// 动画流
const { animating, flyToTarget, defenseDraw, gambleDraw } = useAnimationFlow(
  props.state,
  getManager,
);

// ── 事件处理（动画 → 命令）──

/** 视图里的 index/uid → 内核身份 uid(命令一律用 uid；塔/无人机也在内) */
const findUnit = (x) => {
  const units = [
    ...props.state.players,
    ...(props.state.towers ?? []),
    ...(props.state.summons ?? []),
  ];
  return units.find((u) => u.uid === x) ?? units.find((u) => u.index === x) ?? null;
};
const uidAt = (x) => findUnit(x)?.uid ?? null;
const cast = (cmd) => dispatch(props.state, cmd);

function onAttack() {
  if (animating.value) return;
  cast({ type: "attack" });
}

async function onDefense() {
  if (animating.value) return;
  const pIdx = props.state.currentPlayerIndex;
  await defenseDraw(pIdx);
  cast({ type: "defense" });
}

async function onGamble() {
  if (animating.value) return;
  await gambleDraw();
  cast({ type: "gamble" });
}

function onSkill() {
  if (animating.value) return;
  cast({ type: "skill" });
}

function onHolyWord() {
  if (animating.value) return;
  cast({ type: "holyWord" });
}

async function onTarget(idx) {
  if (animating.value) return;
  if (findUnit(idx)?.kind === "hero") await flyToTarget(idx);
  cast({ type: "attackTarget", targetUid: uidAt(idx) });
}

async function onSkillTarget(idx) {
  if (animating.value) return;
  const purpose = view.pending?.purpose ?? "";
  // 调查猜点数：idx 就是 1-13
  if (purpose === "investigate:guess") {
    cast({ type: "skillAnswer", answer: idx });
    return;
  }
  // 团战：防御/陷阱支援目标
  if (purpose === "defense.support") {
    cast({ type: "defenseTarget", targetUid: uidAt(idx) });
    return;
  }
  if (purpose === "gamble:trap") {
    cast({ type: "gambleTarget", targetUid: uidAt(idx) });
    return;
  }
  // 与旧行为一致:只有风堇/雷神的技能目标会飞牌
  if (purpose === "skill:fenjin" || purpose === "skill:raiden") {
    await flyToTarget(idx);
  }
  cast({ type: "skillAnswer", answer: uidAt(idx) });
}

function onLiniyaSkill(idx, sub) {
  if (animating.value) return;
  cast({
    type: "skillAnswer",
    answer: { targetUid: uidAt(idx), subSkill: sub },
  });
}

function onCaiyueangSave() {
  if (animating.value) return;
  cast({ type: "skillAnswer", answer: { choice: "save" } });
}

function onCaiyueangLoad() {
  if (animating.value) return;
  cast({ type: "skillAnswer", answer: { choice: "load" } });
}

function onAlly() {
  if (animating.value) return;
  cast({ type: "ally" });
}

function onBetray() {
  if (animating.value) return;
  cast({ type: "betray" });
}

function onAllyInvite(idx) {
  if (animating.value) return;
  cast({ type: "allyTarget", targetUid: uidAt(idx) });
}

function onGambleSubmit(trapIdx, baitIdx) {
  if (animating.value) return;
  cast({ type: "gambleSubmit", trapIdx, baitIdx });
}

function onNahidaOrder(order) {
  if (animating.value) return;
  cast({ type: "skillAnswer", answer: order });
}

/** 取消待决:走内核命令,不再手改 step 与私有 flag(顺带修掉 KB-2) */
function cancelPick() {
  cast({ type: "cancel" });
}

function onSaveAndQuit() {
  const gameData = save(props.state);
  const saveData = {
    gameState: gameData,
    gameMode: props.worldCupMode ? "worldcup" : "normal",
  };
  emit("saveAndQuit", saveData);
}

function onRelayout() {
  const m = getManager();
  if (m) m.rebuildLayout();

  // 5 连击打开 DevLogPanel（1.5 秒内）
  relayoutClickCount++;
  if (relayoutClickTimer) clearTimeout(relayoutClickTimer);
  if (relayoutClickCount >= 5) {
    devLogRef.value?.toggleDevLog();
    relayoutClickCount = 0;
  } else {
    relayoutClickTimer = setTimeout(() => {
      relayoutClickCount = 0;
    }, 1500);
  }
}

let relayoutClickCount = 0;
let relayoutClickTimer = null;

/** 暴露给 WorldCupShell 的 toggleDevLog */
function toggleDevLog() {
  devLogRef.value?.toggleDevLog();
}

defineExpose({ toggleDevLog });

// ── AI 调度 ──
let aiTimer = null;

function isAITurn() {
  if (!props.state || props.state.gameOver) return false;
  const p = view.players[props.state.currentPlayerIndex];
  return !!p?.alive && !!p.isAI;
}

function scheduleAI() {
  if (props.worldCupMode || props.leagueMode) return; // 世界杯/联赛模式由上层 Shell 自行调度
  if (aiTimer) clearTimeout(aiTimer);
  const state = props.state;
  if (!state || state.gameOver || state.phase === "setup") return;
  if (state.players.filter((p) => !p.alive).length > 0) return;
  if (view.step !== "pickAction" || !isAITurn()) return;
  aiTimer = setTimeout(aiAct, 600 + Math.random() * 600);
}

function aiAct() {
  const state = props.state;
  if (view.step === "pickAction") {
    if (!isAITurn()) return;
    const decision = decideTopAction(view);
    executeTopAction(decision);
  } else {
    executeMiddleStep();
  }

  // 300ms 保底回退:如果卡住了强制防御
  aiTimer = setTimeout(() => {
    if (view.step !== "pickAction") return;
    if (!isAITurn() || state.gameOver) return;
    if (state.players.some((p) => !p.alive)) return;
    cast({ type: "defense" });
  }, 300);
}

function executeTopAction(decision) {
  const state = props.state;
  switch (decision.action) {
    case "attack": {
      cast({ type: "attack" });
      aiTimer = setTimeout(() => {
        if (view.step === "attackShowCard") {
          const t = decideTarget(view, { action: "attack" });
          cast({ type: "attackTarget", targetUid: uidAt(t.targetIndex) });
        }
      }, 500);
      break;
    }
    case "defense":
      cast({ type: "defense" });
      break;
    case "gamble": {
      cast({ type: "gamble" });
      aiTimer = setTimeout(() => {
        if (view.step === "gamblePick" && view.pendingGamble) {
          const g = decideGamblePick(view, view.pendingGamble.drawnCards);
          cast({
            type: "gambleSubmit",
            trapIdx: g.trapIdx,
            baitIdx: g.baitIdx,
          });
        }
      }, 400);
      break;
    }
    case "skill": {
      // 技能被内核拒绝(回合门槛/次数)时不要空转,直接转防御(KB-3)
      if (!view.players[view.currentPlayerIndex]?.canUseSkill) {
        cast({ type: "defense" });
        break;
      }
      cast({ type: "skill" });
      aiTimer = setTimeout(() => executeMiddleStep(), 400);
      break;
    }
    default:
      cast({ type: "defense" });
  }
  void state;
}

/** pending.purpose → 旧 AI 认识的技能标签 */
function skillTagOf(purpose) {
  if (purpose === "skill:furina") return "furina";
  if (purpose === "skill:aimiliya.freeze") return "aimiliya";
  if (purpose === "skill:fenjin") return "fenjin";
  return "raiden";
}

function executeMiddleStep() {
  const s = view.step;
  if (s === "pickAction") return;

  if (s === "attackShowCard") {
    const t = decideTarget(view, { action: "attack" });
    cast({ type: "attackTarget", targetUid: uidAt(t.targetIndex) });
  } else if (s === "gamblePick") {
    if (view.pendingGamble) {
      const g = decideGamblePick(view, view.pendingGamble.drawnCards);
      cast({ type: "gambleSubmit", trapIdx: g.trapIdx, baitIdx: g.baitIdx });
    }
  } else if (s === "skillPickTarget") {
    // 调查猜点数：AI 随机猜（简单 AI）
    if (view.pending?.purpose === "investigate:guess") {
      cast({ type: "skillAnswer", answer: 1 + Math.floor(Math.random() * 13) });
      return;
    }
    // 团战支援目标（AI 优先选自己）
    const purpose = view.pending?.purpose ?? "";
    if (purpose === "defense.support" || purpose === "gamble:trap") {
      const me = view.players[view.currentPlayerIndex];
      cast({ type: purpose === "defense.support" ? "defenseTarget" : "gambleTarget", targetUid: me?.uid ?? null });
      return;
    }
    const kind = skillTagOf(purpose);
    const t = decideTarget(view, { action: "skill", characterId: kind });
    cast({ type: "skillAnswer", answer: uidAt(t.targetIndex) });
  } else if (s === "skillNahida") {
    const order = decideNahidaOrder(view, view.scryCards);
    cast({ type: "skillAnswer", answer: order });
  } else if (s === "liniyaPick") {
    const d = decideLiniyaChoice(view);
    cast({
      type: "skillAnswer",
      answer: { targetUid: uidAt(d.targetIndex), subSkill: d.subSkill },
    });
  } else if (s === "caiyueangPick") {
    const d = decideCaiyueangChoice(view);
    cast({ type: "skillAnswer", answer: { choice: d.choice } });
  } else if (s === "allyPick") {
    const t = decideTarget(view, { action: "ally" });
    cast({ type: "allyTarget", targetUid: uidAt(t.targetIndex) });
  } else {
    cast({ type: "cancel" });
    cast({ type: "defense" });
  }
}

// AI 回合调度 watch
watch(
  () => view.currentPlayerIndex,
  () => scheduleAI(),
);
watch(
  () => view.step,
  (newStep) => {
    if (
      newStep !== "pickAction" &&
      isAITurn() &&
      !props.state.gameOver &&
      !props.worldCupMode
    ) {
      if (aiTimer) clearTimeout(aiTimer);
      aiTimer = setTimeout(aiAct, 400);
    }
  },
);

// 加载时自动触发 AI（读档后当前玩家若是 AI，watch 不会触发初始值）
onMounted(() => {
  if (isAITurn() && !props.worldCupMode) {
    scheduleAI();
  }
});

// 清理 AI timer
onUnmounted(() => {
  if (aiTimer) clearTimeout(aiTimer);
});
</script>

<style scoped>
.game-shell {
  min-height: 100vh;
  min-height: 100dvh;
}

/* 顶部信息栏 — 固定在顶部，适配刘海屏 */
.game-shell__top-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  padding-top: max(8px, env(safe-area-inset-top));
  background: rgba(8, 8, 30, 0.85);
}

.phase-badge {
  font-size: 11px;
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 4px;
}
.phase-badge--peace {
  background: #e8f5e9;
  color: #2e7d32;
}
.phase-badge--normal {
  background: #fff3e0;
  color: #e65100;
}
.phase-badge--gameOver {
  background: #fce4ec;
  color: #c62828;
}

.top-info {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}
.top-info--grave {
  color: rgba(255, 255, 255, 0.4);
}
.peace-hint {
  font-size: 11px;
  color: #81c784;
}
.weather-tag {
  font-size: 11px;
  background: rgba(255, 213, 79, 0.15);
  color: #ffd54f;
  padding: 2px 8px;
  border-radius: 4px;
}
.weather-next {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.35);
}
.relayout-btn {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.5);
  font-size: 16px;
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 10px;
  min-width: 44px;
  min-height: 44px;
  transition: all 0.15s;
}
@media (hover: hover) {
  .relayout-btn:hover {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }
}

.save-quit-btn {
  background: rgba(255, 215, 0, 0.12);
  border: 1px solid rgba(255, 215, 0, 0.25);
  color: rgba(255, 215, 0, 0.7);
  font-size: 14px;
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 8px;
  min-width: 44px;
  min-height: 44px;
  transition: all 0.15s;
}
@media (hover: hover) {
  .save-quit-btn:hover {
    background: rgba(255, 215, 0, 0.25);
    color: #ffd700;
  }
}

/* 底部 UI — 固定在底部，适配 Home Indicator */
.game-shell__bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 20;
  padding: 8px 16px 12px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(8, 8, 30, 0.85);
  max-height: 45vh;
  overflow-y: auto;
}

/* 移动端：缩小日志区，给牌桌更多空间 */
@media (max-width: 500px) and (orientation: portrait) {
  .game-shell__bottom-bar {
    padding: 6px 10px 8px;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
    gap: 5px;
    max-height: 40vh;
  }
}
</style>
