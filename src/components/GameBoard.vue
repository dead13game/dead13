<template>
  <div class="game-board">
    <!-- 顶部信息栏 -->
    <div class="game-board__info-bar">
      <div class="game-board__phase">
        <span class="phase-badge" :class="`phase-badge--${state.phase}`">{{ phaseLabel }}</span>
        <span class="round-info">第{{ state.round }}回合</span>
        <span v-if="state.phase === 'peace'" class="peace-hint">和平</span>
      </div>

      <div class="game-board__decks">
        <span class="deck-badge">牌库 {{ state.deck.length }}</span>
        <span class="deck-badge deck-badge--grave">{{ state.grave.length }}</span>
      </div>

      <div v-if="state.useWeather && weatherInfo" class="weather-badge" :title="weatherInfo.desc">
        {{ weatherInfo.name }}
      </div>
    </div>

    <!-- 玩家区域由 PixiJS Canvas 渲染 -->

    <!-- 行动区 -->
    <ActionBar
      v-if="!state.gameOver"
      :state="state"
      @attack="onAttack"
      @defense="onDefense"
      @gamble="onGamble"
      @skill="onSkill"
      @target="onTarget"
      @skillTarget="onSkillTarget"
      @cancel="cancelPick"
    />

    <!-- 游戏结束 -->
    <GameOverPanel
      v-if="state.gameOver"
      :winner="winner"
      @restart="$emit('restart')"
    />

    <!-- 牌堆由 PixiJS Canvas 渲染 -->

    <!-- 战报 -->
    <LogPanel :messages="state.messageLog" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import ActionBar from './ActionBar.vue'
import GameOverPanel from './GameOverPanel.vue'
import LogPanel from './LogPanel.vue'
import {
  startAttack, executeAttack, executeDefense,
  executeGamble,
  executeSkill, getCurrentWeather,
  executeRaidenSkill, executeFurinaSwap
} from '../game/gameState.js'

const props = defineProps({ state: { type: Object, required: true } })
defineEmits(['restart'])

const phaseLabel = computed(() => ({
  setup: '准备中', peace: '和平',
  normal: '战斗中', gameOver: '结束'
}[props.state.phase] || props.state.phase))

const winner = computed(() =>
  props.state.winnerIndex >= 0
    ? props.state.players.find(p => p.index === props.state.winnerIndex)
    : null
)

const weatherInfo = computed(() => getCurrentWeather(props.state))

// 事件处理
function onAttack() { startAttack(props.state) }
function onDefense() { executeDefense(props.state) }
function onGamble() { executeGamble(props.state) }
function onSkill() { executeSkill(props.state) }
function onTarget(idx) { executeAttack(props.state, idx) }
function onSkillTarget(idx) {
  if (props.state.pendingFurinaTarget) {
    executeFurinaSwap(props.state, idx)
  } else {
    executeRaidenSkill(props.state, idx)
  }
}
function cancelPick() {
  props.state.step = 'pickAction'
  props.state.pendingFurinaTarget = false
}
</script>

<style scoped>
.game-board { display: flex; flex-direction: column; gap: 10px; max-width: 1000px; margin: 0 auto; padding: 12px; }

/* 信息栏 */
.game-board__info-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.phase-badge { font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 6px; }
.phase-badge--peace { background: #e8f5e9; color: #2e7d32; }
.phase-badge--normal { background: #fff3e0; color: #e65100; }
.phase-badge--gameOver { background: #fce4ec; color: #c62828; }
.round-info { font-size: 12px; color: rgba(255,255,255,0.6); }
.peace-hint { font-size: 11px; color: #81c784; }
.deck-badge { font-size: 12px; background: rgba(255,255,255,0.1); color: #fff; padding: 2px 8px; border-radius: 4px; }
.deck-badge--grave { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.5); }
.weather-badge { font-size: 11px; background: rgba(255,255,255,0.1); color: #ffd54f; padding: 2px 8px; border-radius: 4px; margin-left: auto; }
</style>
