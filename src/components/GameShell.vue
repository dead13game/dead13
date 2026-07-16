<template>
  <div class="game-shell">
    <GameCanvas ref="gameCanvasRef" :state="state" />

    <!-- 顶部信息栏（正常模式） -->
    <div v-if="!worldCupMode" class="game-shell__top-bar">
      <span class="phase-badge" :class="'phase-badge--' + state.phase">{{
        phaseLabel
      }}</span>
      <span class="top-info">第{{ state.round }}回合</span>
      <span v-if="state.phase === 'peace'" class="peace-hint">和平</span>
      <span class="top-info">牌库 {{ state.deck.length }}</span>
      <span class="top-info top-info--grave"
        >墓地 {{ state.grave.length }}</span
      >
      <span v-if="state.useWeather && weather" class="weather-tag">{{
        weather.name
      }}</span>
      <span v-if="state.useWeather && nextWeather" class="weather-next"
        >下回合: {{ nextWeather.name }}</span
      >
      <button class="relayout-btn" @click="onRelayout" title="重新排版">
        ⟳
      </button>
    </div>

    <!-- 底部 UI 栏 -->
    <div class="game-shell__bottom-bar">
      <ActionBar
        v-if="!state.gameOver || worldCupMode"
        :state="state"
        :disabled="animating"
        @attack="onAttack"
        @defense="onDefense"
        @gamble="onGamble"
        @skill="onSkill"
        @target="onTarget"
        @skillTarget="onSkillTarget"
        @liniyaSkill="onLiniyaSkill"
        @caiyueangSave="onCaiyueangSave"
        @caiyueangLoad="onCaiyueangLoad"
        @ally="onAlly"
        @betray="onBetray"
        @allyInvite="onAllyInvite"
        @cancel="cancelPick"
      />

      <GameOverPanel
        v-if="state.gameOver && !worldCupMode"
        :winner="winner"
        @restart="$emit('restart')"
      />

      <LogPanel :messages="state.messageLog" />
    </div>

    <!-- 开发日志面板（Ctrl+Shift+D 切换） -->
    <DevLogPanel ref="devLogRef" :entries="state.devLog.entries" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from "vue";
import GameCanvas from "../pixi/GameCanvas.vue";
import ActionBar from "./ActionBar.vue";
import LogPanel from "./LogPanel.vue";
import GameOverPanel from "./GameOverPanel.vue";
import DevLogPanel from "./DevLogPanel.vue";
import { usePixiSync } from "../bridge/usePixiSync.js";
import { useAnimationFlow } from "../bridge/useAnimationFlow.js";
import {
  isAiPlayer,
  decideTopAction,
  decideTarget,
  decideGamblePick,
  decideNahidaOrder,
  decideLiniyaChoice,
  decideCaiyueangChoice,
} from "../game/ai.js";
import {
  startAttack,
  executeAttack,
  executeDefense,
  executeGamble,
  submitGamble,
  executeSkill,
  getCurrentWeather,
  executeRaidenSkill,
  executeFurinaSwap,
  executeFenjinSkill,
  executeLiniyaSkill,
  executeAimiliyaSkill,
  submitNahidaScry,
  executeCaiyueangSave,
  executeCaiyueangLoad,
  startAlly,
  executeAlly,
  executeBetray,
  getNextWeather,
} from "../game/gameState.js";

const props = defineProps({
  state: { type: Object, required: true },
  worldCupMode: { type: Boolean, default: false },
});
const emit = defineEmits(["restart"]);

const gameCanvasRef = ref(null);
const devLogRef = ref(null);

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
    })[props.state.phase] || props.state.phase,
);

const winner = computed(() =>
  props.state.winnerIndex >= 0
    ? props.state.players.find((p) => p.index === props.state.winnerIndex)
    : null,
);

const weather = computed(() => getCurrentWeather(props.state));
const nextWeather = computed(() => getNextWeather(props.state));

// 同步 PixiJS
usePixiSync(props.state, getManager);

// 动画流
const { animating, flyToTarget, defenseDraw, gambleDraw } = useAnimationFlow(
  props.state,
  getManager,
);

// ── 事件处理（动画→游戏逻辑）──

function onAttack() {
  if (animating.value) return;
  startAttack(props.state);
}

async function onDefense() {
  if (animating.value) return;
  const pIdx = props.state.currentPlayerIndex;
  await defenseDraw(pIdx);
  executeDefense(props.state);
}

async function onGamble() {
  if (animating.value) return;
  await gambleDraw();
  executeGamble(props.state);
}

function onSkill() {
  if (animating.value) return;
  executeSkill(props.state);
}

async function onTarget(idx) {
  if (animating.value) return;
  await flyToTarget(idx);
  executeAttack(props.state, idx);
}

async function onSkillTarget(idx) {
  if (animating.value) return;
  if (props.state.pendingFurinaTarget) {
    executeFurinaSwap(props.state, idx);
  } else if (props.state._aimiliyaFreeze) {
    executeAimiliyaSkill(props.state, idx);
  } else if (props.state._fenjinHeal !== undefined) {
    // 风堇技能
    await flyToTarget(idx);
    executeFenjinSkill(props.state, idx);
  } else {
    // 雷电技能
    await flyToTarget(idx);
    executeRaidenSkill(props.state, idx);
  }
}

function onLiniyaSkill(idx, sub) {
  if (animating.value) return;
  executeLiniyaSkill(props.state, idx, sub);
}

function onCaiyueangSave() {
  if (animating.value) return;
  executeCaiyueangSave(props.state);
}

function onCaiyueangLoad() {
  if (animating.value) return;
  executeCaiyueangLoad(props.state);
}

function onAlly() {
  if (animating.value) return;
  startAlly(props.state);
}

function onBetray() {
  if (animating.value) return;
  executeBetray(props.state);
}

function onAllyInvite(idx) {
  if (animating.value) return;
  executeAlly(props.state, idx);
}

function cancelPick() {
  props.state.step = "pickAction";
  props.state.pendingFurinaTarget = false;
  props.state._aimiliyaFreeze = null;
  props.state._fenjinHeal = null;
  props.state._liniyaSubSkill = null;
  props.state._caiyueangMode = null;
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
  const p = props.state.players[props.state.currentPlayerIndex];
  return p?.alive && isAiPlayer(p);
}

function scheduleAI() {
  if (props.worldCupMode) return; // 世界杯模式由 WorldCupShell 自行调度
  if (aiTimer) clearTimeout(aiTimer);
  const state = props.state;
  if (!state || state.gameOver || state.phase === "setup") return;
  if (state.players.filter((p) => !p.alive).length > 0) return;
  if (state.step !== "pickAction" || !isAITurn()) return;
  aiTimer = setTimeout(aiAct, 600 + Math.random() * 600);
}

function aiAct() {
  const state = props.state;
  if (state.step === "pickAction") {
    const decision = decideTopAction(state);
    executeTopAction(decision);
  } else {
    executeMiddleStep();
  }

  // 300ms 保底回退：如果卡住了强制防御
  aiTimer = setTimeout(() => {
    if (state.step !== "pickAction") return;
    if (!isAITurn() || state.gameOver) return;
    if (state.players.some((p) => !p.alive)) return;
    executeDefense(state);
  }, 300);
}

function executeTopAction(decision) {
  const state = props.state;
  switch (decision.action) {
    case "attack": {
      startAttack(state);
      aiTimer = setTimeout(() => {
        if (state.step === "attackShowCard") {
          const t = decideTarget(state, { action: "attack" });
          executeAttack(state, t.targetIndex);
        }
      }, 500);
      break;
    }
    case "defense":
      executeDefense(state);
      break;
    case "gamble": {
      state._skipAnim = true;
      executeGamble(state);
      aiTimer = setTimeout(() => {
        if (state.step === "gamblePick" && state.pendingGamble) {
          const g = decideGamblePick(state, state.pendingGamble.drawnCards);
          submitGamble(state, g.trapIdx, g.baitIdx);
        }
        state._skipAnim = false;
      }, 400);
      break;
    }
    case "skill": {
      executeSkill(state);
      aiTimer = setTimeout(() => executeMiddleStep(), 400);
      break;
    }
  }
}

function executeMiddleStep() {
  const state = props.state;
  const s = state.step;
  if (s === "pickAction") return;

  if (s === "attackShowCard") {
    const t = decideTarget(state, { action: "attack" });
    executeAttack(state, t.targetIndex);
  } else if (s === "gamblePick") {
    if (state.pendingGamble) {
      const g = decideGamblePick(state, state.pendingGamble.drawnCards);
      submitGamble(state, g.trapIdx, g.baitIdx);
    }
    state._skipAnim = false;
  } else if (s === "skillPickTarget") {
    let ctx = { action: "skill" };
    if (state.pendingFurinaTarget) ctx.characterId = "furina";
    else if (state._aimiliyaFreeze) ctx.characterId = "aimiliya";
    else if (state._fenjinHeal !== undefined) ctx.characterId = "fenjin";
    else ctx.characterId = "raiden";

    const t = decideTarget(state, ctx);
    if (state.pendingFurinaTarget) {
      executeFurinaSwap(state, t.targetIndex);
    } else if (state._aimiliyaFreeze) {
      executeAimiliyaSkill(state, t.targetIndex);
    } else if (state._fenjinHeal !== undefined) {
      executeFenjinSkill(state, t.targetIndex);
    } else {
      executeRaidenSkill(state, t.targetIndex);
    }
  } else if (s === "skillNahida") {
    const order = decideNahidaOrder(state, state.scryCards);
    submitNahidaScry(state, order);
  } else if (s === "liniyaPick") {
    const d = decideLiniyaChoice(state);
    executeLiniyaSkill(state, d.targetIndex, d.subSkill);
  } else if (s === "caiyueangPick") {
    const d = decideCaiyueangChoice(state);
    if (d.choice === "save") executeCaiyueangSave(state);
    else executeCaiyueangLoad(state);
  } else if (s === "allyPick") {
    const t = decideTarget(state, { action: "ally" });
    executeAlly(state, t.targetIndex);
  } else {
    state.step = "pickAction";
    executeDefense(state);
  }
}

// AI 回合调度 watch
watch(
  () => props.state?.currentPlayerIndex,
  () => scheduleAI(),
);
watch(
  () => props.state?.step,
  (newStep) => {
    if (newStep !== "pickAction" && isAITurn() && !props.state.gameOver) {
      if (aiTimer) clearTimeout(aiTimer);
      aiTimer = setTimeout(aiAct, 400);
    }
  },
);

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
