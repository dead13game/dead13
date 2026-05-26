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

      <!-- 天气 -->
      <div v-if="state.useWeather && weatherInfo" class="weather-badge" :title="weatherInfo.desc">
        {{ weatherInfo.name }}
      </div>
    </div>

    <!-- 玩家区域 -->
    <div class="game-board__players">
      <PlayerArea
        v-for="player in state.players"
        :key="player.index"
        :player="player"
        :isCurrent="player === currentP"
      />
    </div>

    <!-- 行动区 -->
    <div v-if="!state.gameOver" class="game-board__actions">
      <!-- 普通行动选择 -->
      <template v-if="state.step === 'pickAction'">
        <div class="action-row">
          <button class="ab ab--atk" :disabled="state.phase==='peace'" @click="onAttack">攻击</button>
          <button class="ab ab--def" @click="onDefense">防御</button>
          <button class="ab ab--gamble" @click="onGamble">赌命</button>
          <button
            v-if="canSkill"
            class="ab ab--skill"
            :disabled="!canSkill"
            :title="currentP.skillDesc"
            @click="onSkill"
          >{{ currentP.skillName }}({{ currentP.skillUses }})</button>
        </div>
      </template>

      <!-- 攻击：展示抽到的牌 + 选目标 -->
      <template v-else-if="state.step === 'attackShowCard'">
        <div class="attack-show">
          <div class="action-hint">摸到的攻击牌：</div>
          <div class="attack-show__cards">
            <template v-if="ventiCards">
              <Card v-for="(c, i) in ventiCards" :key="'v' + i" :card="c" :alwaysFaceUp="true" class="card-deck-fly" />
            </template>
            <Card v-else-if="pendingAttackCard" :key="'atk-' + pendingAttackCard.id" :card="pendingAttackCard" class="card-deck-fly" />
          </div>
          <div class="attack-show__total" v-if="ventiCards">
            <span class="action-hint">千风之诗 合计点数：{{ pendingAttackCard?.value || 0 }}</span>
          </div>
          <div class="action-hint">选择攻击目标：</div>
          <div class="action-row">
            <button v-for="p in aliveTargets" :key="p.index" class="ab ab--target" @click="onTarget(p.index)">
              {{ p.name }}
            </button>
          </div>
        </div>
      </template>

      <!-- 选目标（旧流程保留） -->
      <template v-else-if="state.step === 'pickTarget'">
        <span class="action-hint"> 选择攻击目标：</span>
        <div class="action-row">
          <button v-for="p in aliveTargets" :key="p.index" class="ab ab--target" @click="onTarget(p.index)">
            {{ p.name }}
          </button>
          <button class="ab ab--cancel" @click="cancelPick">取消</button>
        </div>
      </template>

      <!-- 技能选目标（雷电将军） -->
      <template v-else-if="state.step === 'skillPickTarget'">
        <span class="action-hint"> 选择技能目标：</span>
        <div class="action-row">
          <button v-for="p in aliveTargets" :key="p.index" class="ab ab--skill-target" @click="onSkillTarget(p.index)">
            {{ p.name }}
          </button>
          <button class="ab ab--cancel" @click="cancelPick">取消</button>
        </div>
      </template>

      <!-- 赌命选牌 -->
      <template v-else-if="state.step === 'gamblePick'">
        <div class="gamble-area">
          <span class="action-hint"> 选择陷阱牌（盖放）和诱饵牌（明放）：</span>
          <div class="gamble-cards">
            <div
              v-for="(card, idx) in pendingGamble?.drawnCards"
              :key="'gc-' + idx"
              class="gamble-card"
              :class="{
                'gamble-card--picked-trap': gambleTrapIdx === idx,
                'gamble-card--picked-bait': gambleBaitIdx === idx
              }"
            >
              <Card :card="card" :alwaysFaceUp="true" class="card-deck-fly" />
              <div class="gamble-card__btns">
                <button
                  class="tiny-btn tiny-btn--trap"
                  :class="{ active: gambleTrapIdx === idx }"
                  @click="gambleTrapIdx = idx"
                >陷阱</button>
                <button
                  class="tiny-btn tiny-btn--bait"
                  :class="{ active: gambleBaitIdx === idx }"
                  @click="gambleBaitIdx = idx"
                >诱饵</button>
              </div>
            </div>
          </div>
          <div class="action-row">
            <button class="ab ab--confirm" :disabled="gambleTrapIdx < 0 || gambleBaitIdx < 0 || gambleTrapIdx === gambleBaitIdx" @click="onGambleConfirm">
               确定
            </button>
          </div>
        </div>
      </template>

      <!-- 纳西妲看牌 -->
      <template v-else-if="state.step === 'skillNahida'">
        <div class="scry-area">
          <span class="action-hint">
            {{ nahidaStepLabel }}
          </span>
          <div class="gamble-cards">
            <div
              v-for="(card, idx) in state.scryCards"
              :key="'scry-' + idx"
              class="gamble-card scry-card"
              :class="{
                'scry-card--placed1': nahidaOrder[0] === idx,
                'scry-card--placed2': nahidaOrder[1] === idx,
                'scry-card--placed3': nahidaOrder[2] === idx
              }"
              @click="onNahidaClick(idx)"
            >
              <Card :card="card" :alwaysFaceUp="true" class="card-flip-in" />
              <span class="scry-idx">
                <template v-if="nahidaOrder[0] === idx">①顶</template>
                <template v-else-if="nahidaOrder[1] === idx">②中</template>
                <template v-else-if="nahidaOrder[2] === idx">③底</template>
                <template v-else>—</template>
              </span>
            </div>
          </div>
          <div class="action-row">
            <button class="ab ab--confirm" :disabled="nahidaOrder.length < 3" @click="onNahidaConfirm">确定顺序</button>
            <button class="ab ab--cancel" @click="resetNahida">重选</button>
          </div>
        </div>
      </template>
    </div>

    <!-- 游戏结束 -->
    <div v-if="state.gameOver" class="game-over">
      <div class="game-over__banner">
        <div class="game-over__icon"></div>
        <div class="game-over__text">
          <div class="game-over__title">游戏结束！</div>
          <div class="game-over__winner">{{ winner?.name }} 获胜！</div>
        </div>
      </div>
      <button class="ab ab--restart" @click="$emit('restart')"> 再来一局</button>
    </div>

    <!-- 牌堆 -->
    <div class="deck-area">
      <div v-if="state.deck.length > 0" class="deck-stack">
        <div class="deck-card-layer deck-card-layer--1"></div>
        <div class="deck-card-layer deck-card-layer--2"></div>
        <div class="deck-card-layer deck-card-layer--3"></div>
        <span class="deck-count">{{ state.deck.length }}张</span>
      </div>
      <div v-else class="deck-stack deck-stack--empty">
        <span>空</span>
      </div>
      <span class="deck-label">牌库</span>
    </div>

    <!-- 战报 -->
    <div class="log-panel" ref="logRef">
      <div class="log-title"> 战报</div>
      <div class="log-entries">
        <div v-for="(msg, idx) in state.messageLog" :key="idx" class="log-entry">{{ msg }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import Card from './Card.vue'
import PlayerArea from './PlayerArea.vue'
import { cardDisplay } from '../game/deck.js'
import { CHARACTERS } from '../game/constants.js'
import {
  currentPlayer, startAttack, executeAttack, executeDefense,
  executeGamble, submitGamble,
  executeSkill, getCurrentWeather, canUseSkill,
  executeRaidenSkill, submitNahidaScry, cancelAttack
} from '../game/gameState.js'

const props = defineProps({ state: { type: Object, required: true } })
const emit = defineEmits(['restart'])
const logRef = ref(null)

// 赌命选牌
const gambleTrapIdx = ref(-1)
const gambleBaitIdx = ref(-1)
// 纳西妲选牌
const nahidaOrder = ref([])

const currentP = computed(() => currentPlayer(props.state))
const phaseLabel = computed(() => ({
  setup: '准备中', peace: '和平',
  normal: '战斗中', gameOver: '结束'
}[props.state.phase] || props.state.phase))
const aliveTargets = computed(() =>
  props.state.players.filter(p => p.alive && p !== currentP.value)
)
const pendingGamble = computed(() => props.state.pendingGamble)
const pendingAttackCard = computed(() => props.state.pendingAttackCard)
const ventiCards = computed(() => props.state.pendingVentiCards)
const winner = computed(() =>
  props.state.winnerIndex >= 0
    ? props.state.players.find(p => p.index === props.state.winnerIndex)
    : null
)
const weatherInfo = computed(() => getCurrentWeather(props.state))
const canSkill = computed(() => canUseSkill(props.state, currentP.value))

const nahidaStepLabel = computed(() => {
  const steps = ['点击选择最上面的牌', '点击选择中间的牌', '点击选择底部的牌']
  const i = nahidaOrder.value.length
  return i >= 3 ? '三张牌顺序已选好' : steps[i]
})

watch(() => props.state.messageLog.length, async () => {
  await nextTick()
  if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight
})

function onAttack() { startAttack(props.state) }
function onDefense() { executeDefense(props.state) }
function onGamble() {
  gambleTrapIdx.value = -1
  gambleBaitIdx.value = -1
  executeGamble(props.state)
}
function onSkill() { executeSkill(props.state) }
function onCancelAttack() { cancelAttack(props.state) }
function onTarget(idx) { executeAttack(props.state, idx) }
function onSkillTarget(idx) { executeRaidenSkill(props.state, idx) }
function onGambleConfirm() {
  if (gambleTrapIdx.value >= 0 && gambleBaitIdx.value >= 0 && gambleTrapIdx.value !== gambleBaitIdx.value) {
    submitGamble(props.state, gambleTrapIdx.value, gambleBaitIdx.value)
  }
}
function onNahidaConfirm() {
  if (nahidaOrder.value.length === 3) {
    submitNahidaScry(props.state, nahidaOrder.value)
  }
}
function onNahidaClick(idx) {
  if (nahidaOrder.value.includes(idx)) return
  nahidaOrder.value.push(idx)
}
function resetNahida() {
  nahidaOrder.value = []
}
function cancelPick() {
  props.state.step = 'pickAction'
  gambleTrapIdx.value = -1
  gambleBaitIdx.value = -1
  nahidaOrder.value = []
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

/* 玩家区域 */
.game-board__players { display: flex; gap: 8px; flex-wrap: wrap; }

/* 行动按钮 */
.game-board__actions { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.action-row { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.action-hint { font-size: 13px; color: rgba(255,255,255,0.7); font-weight: bold; text-align: center; }

.ab {
  padding: 7px 16px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: bold; cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
}
.ab:disabled { opacity: 0.35; cursor: not-allowed; }
.ab:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 3px 8px rgba(0,0,0,0.2); }
.ab--atk { background: #e53935; color: #fff; }
.ab--def { background: #43a047; color: #fff; }
.ab--gamble { background: #fb8c00; color: #fff; }
.ab--skill { background: linear-gradient(135deg, #7b1fa2, #6a1b9a); color: #fff; }
.ab--target { background: #1565C0; color: #fff; }
.ab--skill-target { background: #e65100; color: #fff; }
.ab--cancel { background: #616161; color: #fff; font-size: 12px; }
.ab--confirm { background: #2e7d32; color: #fff; }
.ab--swap { background: #1565C0; color: #fff; }
.ab--restart { background: #1565C0; color: #fff; font-size: 15px; padding: 10px 28px; margin-top: 8px; }

.attack-show { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.attack-show__cards { display: flex; gap: 6px; justify-content: center; }
.attack-show__total { margin-top: -4px; }

/* 赌命选牌 */
.gamble-area { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.gamble-cards { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.gamble-card {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 6px; border-radius: 8px; background: rgba(255,255,255,0.05); transition: background 0.15s;
}
.gamble-card--picked-trap { background: rgba(251,140,0,0.25); outline: 2px solid #fb8c00; }
.gamble-card--picked-bait { background: rgba(67,160,71,0.25); outline: 2px solid #43a047; }
.gamble-card__btns { display: flex; gap: 4px; }
.tiny-btn {
  padding: 3px 8px; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;
  background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); font-size: 10px; cursor: pointer;
  transition: all 0.15s;
}
.tiny-btn.active { border-color: #fff; color: #fff; font-weight: bold; }
.tiny-btn--trap.active { background: #fb8c00; border-color: #fb8c00; }
.tiny-btn--bait.active { background: #43a047; border-color: #43a047; }

/* 纳西妲看牌 */
.scry-area { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.scry-idx { font-size: 10px; color: rgba(255,255,255,0.5); }
.scry-card {
  cursor: pointer;
  transition: all 0.15s;
}
.scry-card:hover { background: rgba(255,255,255,0.08); }
.scry-card--placed1 { outline: 2px solid #ff6f00; background: rgba(255,111,0,0.2); }
.scry-card--placed2 { outline: 2px solid #1565c0; background: rgba(21,101,192,0.2); }
.scry-card--placed3 { outline: 2px solid #43a047; background: rgba(67,160,71,0.2); }

/* 游戏结束 */
.game-over {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 24px; background: linear-gradient(135deg, #fff8e1, #fff3e0);
  border-radius: 16px; border: 2px solid #ffb300;
}
.game-over__banner { display: flex; align-items: center; gap: 12px; }
.game-over__icon { font-size: 40px; }
.game-over__title { font-size: 22px; font-weight: bold; color: #333; }
.game-over__winner { font-size: 16px; color: #e65100; font-weight: bold; }

/* 战报 */
.log-panel {
  background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; padding: 10px; max-height: 160px; overflow-y: auto; font-size: 11px;
  color: rgba(255,255,255,0.7);
}
.log-title { font-weight: bold; margin-bottom: 4px; color: rgba(255,255,255,0.5); }
.log-entry { line-height: 1.5; }

/* 牌堆 */
.deck-area {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
}
.deck-stack {
  position: relative;
  width: 64px;
  height: 90px;
  cursor: default;
}
.deck-card-layer {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(135deg, #1a237e, #283593);
  border: 2px solid #0d1b5e;
}
.deck-card-layer--1 { top: 0; left: 0; }
.deck-card-layer--2 { top: 3px; left: 3px; transform: rotate(3deg); }
.deck-card-layer--3 { top: 6px; left: 6px; transform: rotate(6deg); }
.deck-count {
  position: absolute;
  bottom: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: rgba(255,255,255,0.5);
  white-space: nowrap;
}
.deck-stack--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 90px;
  border: 2px dashed rgba(255,255,255,0.2);
  border-radius: 6px;
  color: rgba(255,255,255,0.2);
  font-size: 12px;
}
.deck-label {
  font-size: 11px;
  color: rgba(255,255,255,0.4);
}

</style>

<style>
/* 全局动画（Transition 类名无 scoped hash） */
.card-deck-fly {
  animation: flyAndFlip 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes flyAndFlip {
  0% {
    transform: translateY(200px) rotateY(180deg) scale(0.3);
    opacity: 0;
  }
  40% {
    transform: translateY(-20px) rotateY(180deg) scale(1.1);
    opacity: 1;
  }
  60% {
    transform: translateY(5px) rotateY(90deg) scale(1);
  }
  80% {
    transform: translateY(-3px) rotateY(10deg) scale(1);
  }
  100% {
    transform: translateY(0) rotateY(0deg) scale(1);
    opacity: 1;
  }
}
</style>
