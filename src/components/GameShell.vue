<template>
  <div class="game-shell">
    <!-- PixiJS Canvas 层 -->
    <div class="game-shell__canvas-layer" ref="canvasLayerRef">
      <GameCanvas ref="gameCanvasRef" :state="state" />
    </div>

    <!-- 顶部信息栏 -->
    <div class="game-shell__top-bar">
      <span class="phase-badge" :class="'phase-badge--' + state.phase">{{ phaseLabel }}</span>
      <span class="top-info">第{{ state.round }}回合</span>
      <span v-if="state.phase === 'peace'" class="peace-hint">和平</span>
      <span class="top-info">牌库 {{ state.deck.length }}</span>
      <span class="top-info top-info--grave">墓地 {{ state.grave.length }}</span>
      <span v-if="state.useWeather && weather" class="weather-tag">{{ weather.name }}</span>
      <span v-if="state.useWeather && nextWeather" class="weather-next">下回合: {{ nextWeather.name }}</span>
    </div>

    <!-- 底部 UI 栏 -->
    <div class="game-shell__bottom-bar">
      <ActionBar
        v-if="!state.gameOver"
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
        v-if="state.gameOver"
        :winner="winner"
        @restart="$emit('restart')"
      />

      <LogPanel :messages="state.messageLog" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import GameCanvas from '../pixi/GameCanvas.vue'
import ActionBar from './ActionBar.vue'
import LogPanel from './LogPanel.vue'
import GameOverPanel from './GameOverPanel.vue'
import { usePixiSync } from '../bridge/usePixiSync.js'
import { useAnimationFlow } from '../bridge/useAnimationFlow.js'
import {
  startAttack, executeAttack, executeDefense,
  executeGamble, executeSkill, getCurrentWeather,
  executeRaidenSkill, executeFurinaSwap,
  executeFenjinSkill, executeLiniyaSkill,
  executeAimiliyaSkill, executeCaiyueangSave, executeCaiyueangLoad,
  startAlly, executeAlly, executeBetray, getNextWeather
} from '../game/gameState.js'

const props = defineProps({
  state: { type: Object, required: true }
})
const emit = defineEmits(['restart'])

const gameCanvasRef = ref(null)
const canvasLayerRef = ref(null)

function getManager() {
  return gameCanvasRef.value?.manager ?? null
}

const phaseLabel = computed(() => ({
  setup: '准备中', peace: '和平',
  normal: '战斗中', gameOver: '结束'
}[props.state.phase] || props.state.phase))

const winner = computed(() =>
  props.state.winnerIndex >= 0
    ? props.state.players.find(p => p.index === props.state.winnerIndex)
    : null
)

const weather = computed(() => getCurrentWeather(props.state))
const nextWeather = computed(() => getNextWeather(props.state))

// 同步 PixiJS
usePixiSync(props.state, getManager)

// 动画流
const { animating, flyToTarget, defenseDraw, gambleDraw } = useAnimationFlow(props.state, getManager)

// Canvas 初始化
let initCheck = null
onMounted(() => {
  initCheck = setInterval(() => {
    const m = getManager()
    if (m && props.state.players.length > 0) {
      m.buildScene(props.state.players, props.state.deck.length)
      clearInterval(initCheck)
    }
  }, 100)
})

onBeforeUnmount(() => {
  if (initCheck) clearInterval(initCheck)
})

// ── 事件处理（动画→游戏逻辑）──

function onAttack() {
  if (animating.value) return
  startAttack(props.state)
}

async function onDefense() {
  if (animating.value) return
  const pIdx = props.state.currentPlayerIndex
  await defenseDraw(pIdx)
  executeDefense(props.state)
}

async function onGamble() {
  if (animating.value) return
  await gambleDraw()
  executeGamble(props.state)
}

function onSkill() {
  if (animating.value) return
  executeSkill(props.state)
}

async function onTarget(idx) {
  if (animating.value) return
  await flyToTarget(idx)
  executeAttack(props.state, idx)
}

async function onSkillTarget(idx) {
  if (animating.value) return
  if (props.state.pendingFurinaTarget) {
    executeFurinaSwap(props.state, idx)
  } else if (props.state._aimiliyaFreeze) {
    executeAimiliyaSkill(props.state, idx)
  } else if (props.state._fenjinHeal !== undefined) {
    // 风堇技能
    await flyToTarget(idx)
    executeFenjinSkill(props.state, idx)
  } else {
    // 雷电技能
    await flyToTarget(idx)
    executeRaidenSkill(props.state, idx)
  }
}

function onLiniyaSkill(idx, sub) {
  if (animating.value) return
  executeLiniyaSkill(props.state, idx, sub)
}

function onCaiyueangSave() {
  if (animating.value) return
  executeCaiyueangSave(props.state)
}

function onCaiyueangLoad() {
  if (animating.value) return
  executeCaiyueangLoad(props.state)
}

function onAlly() {
  if (animating.value) return
  startAlly(props.state)
}

function onBetray() {
  if (animating.value) return
  executeBetray(props.state)
}

function onAllyInvite(idx) {
  if (animating.value) return
  executeAlly(props.state, idx)
}

function cancelPick() {
  props.state.step = 'pickAction'
  props.state.pendingFurinaTarget = false
  props.state._aimiliyaFreeze = null
  props.state._fenjinHeal = null
  props.state._liniyaSubSkill = null
  props.state._caiyueangMode = null
}
</script>

<style scoped>
.game-shell {
  height: 100vh;
  overflow: hidden;
}

/* Canvas 层 — 占据中间所有可用空间 */
.game-shell__canvas-layer {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 1;
  pointer-events: none;
}
.game-shell__canvas-layer canvas {
  pointer-events: none;
}

/* 顶部信息栏 — 固定在顶部 */
.game-shell__top-bar {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
}

.phase-badge {
  font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 4px;
}
.phase-badge--peace { background: #e8f5e9; color: #2e7d32; }
.phase-badge--normal { background: #fff3e0; color: #e65100; }
.phase-badge--gameOver { background: #fce4ec; color: #c62828; }

.top-info { font-size: 12px; color: rgba(255,255,255,0.7); }
.top-info--grave { color: rgba(255,255,255,0.4); }
.peace-hint { font-size: 11px; color: #81c784; }
.weather-tag { font-size: 11px; background: rgba(255,213,79,0.15); color: #ffd54f; padding: 2px 8px; border-radius: 4px; }
.weather-next { font-size: 10px; color: rgba(255,255,255,0.35); }

/* 底部 UI — 固定在底部 */
.game-shell__bottom-bar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 20;
  padding: 8px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  max-height: 45vh;
  overflow-y: auto;
}
</style>
