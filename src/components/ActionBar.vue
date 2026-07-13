<template>
  <div class="action-bar">
    <!-- 普通行动选择 -->
    <template v-if="state.step === 'pickAction'">
      <div class="action-row">
        <button class="ab ab--atk" :disabled="disabled || state.phase==='peace'" @click="$emit('attack')">攻击</button>
        <button class="ab ab--def" :disabled="disabled" @click="$emit('defense')">防御</button>
        <button class="ab ab--gamble" :disabled="disabled" @click="$emit('gamble')">赌命</button>
        <button
          v-if="canAlly"
          class="ab ab--ally"
          :disabled="disabled"
          @click="$emit('ally')"
        >结盟</button>
        <button
          v-if="canBetray"
          class="ab ab--betray"
          :disabled="disabled"
          @click="$emit('betray')"
        >背刺</button>
        <button
          v-if="canSkill"
          class="ab ab--skill"
          :disabled="disabled"
          :title="currentPlayerVal.skillDesc"
          @click="$emit('skill')"
        >{{ currentPlayerVal.skillName }}{{ skillLabel }}</button>
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
          <button v-for="p in aliveTargets" :key="p.index" class="ab ab--target" :disabled="disabled" @click="$emit('target', p.index)">
            {{ p.name }}
          </button>
        </div>
      </div>
    </template>

    <!-- 技能选目标（雷电/芙宁娜/风堇/爱蜜莉雅） -->
    <template v-else-if="state.step === 'skillPickTarget'">
      <span class="action-hint">{{
        state.pendingFurinaTarget ? '选择要交换陷阱的目标：' :
        state._aimiliyaFreeze ? '选择要冻结的目标：' :
        '选择技能目标：'
      }}</span>
      <div class="action-row">
        <button v-for="p in aliveTargets" :key="p.index" class="ab ab--skill-target" :disabled="disabled" @click="$emit('skillTarget', p.index)">
          {{ p.name }}
        </button>
        <button class="ab ab--cancel" :disabled="disabled" @click="$emit('cancel')">取消</button>
      </div>
    </template>

    <!-- 莉奈娅选择子技能 -->
    <template v-else-if="state.step === 'liniyaPick'">
      <span class="action-hint">莉奈娅 — 选择子技能和目标：</span>
      <div class="action-row">
        <button
          v-for="p in aliveTargets"
          :key="'s1-' + p.index"
          class="ab ab--gamble"
          :disabled="disabled"
          @click="$emit('liniyaSkill', p.index, 1)"
        >偷取 {{ p.name }} (3回合)</button>
        <button
          v-for="p in aliveTargets"
          :key="'s2-' + p.index"
          class="ab ab--skill-target"
          :disabled="disabled"
          @click="$emit('liniyaSkill', p.index, 2)"
        >DoT {{ p.name }} (5回合)</button>
        <button class="ab ab--cancel" :disabled="disabled" @click="$emit('cancel')">取消</button>
      </div>
    </template>

    <!-- 结盟选目标 -->
    <template v-else-if="state.step === 'allyPick'">
      <span class="action-hint">选择结盟目标：</span>
      <div class="action-row">
        <button v-for="p in allianceTargets" :key="p.index" class="ab ab--ally" :disabled="disabled" @click="$emit('allyInvite', p.index)">
          {{ p.name }}
        </button>
        <button class="ab ab--cancel" :disabled="disabled" @click="$emit('cancel')">取消</button>
      </div>
    </template>

    <!-- 菜月昴选择存档/读档 -->
    <template v-else-if="state.step === 'caiyueangPick'">
      <span class="action-hint">菜月昴 — 死亡回归：</span>
      <div class="action-row">
        <button class="ab ab--def" :disabled="disabled" @click="$emit('caiyueangSave')">存档</button>
        <button class="ab ab--skill" :disabled="disabled || (currentPlayerVal.loadUses <= 0 && !currentPlayerVal.savepoint)" @click="$emit('caiyueangLoad')">读档({{ currentPlayerVal.loadUses }})</button>
        <button class="ab ab--cancel" :disabled="disabled" @click="$emit('cancel')">取消</button>
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
                :disabled="disabled"
                @click="gambleTrapIdx = idx"
              >陷阱</button>
              <button
                class="tiny-btn tiny-btn--bait"
                :class="{ active: gambleBaitIdx === idx }"
                :disabled="disabled"
                @click="gambleBaitIdx = idx"
              >诱饵</button>
            </div>
          </div>
        </div>
        <div class="action-row">
          <button
            class="ab ab--confirm"
            :disabled="disabled || gambleTrapIdx < 0 || gambleBaitIdx < 0 || gambleTrapIdx === gambleBaitIdx"
            @click="onGambleConfirm"
          > 确定</button>
        </div>
      </div>
    </template>

    <!-- 纳西妲看牌排序 -->
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
            :class="{ 'scry-card--selected': nahidaOrder.includes(idx) }"
            @click="onNahidaClick(idx)"
          >
            <Card :card="card" :alwaysFaceUp="true" class="card-flip-in" />
            <span class="scry-idx">
              <template v-if="nahidaOrder.includes(idx)">
                {{ nahidaOrder.indexOf(idx) + 1 }}
              </template>
              <template v-else>—</template>
            </span>
          </div>
        </div>
        <div class="action-row">
          <button class="ab ab--confirm" :disabled="disabled || nahidaOrder.length < nahidaTotalCards" @click="onNahidaConfirm">确定顺序</button>
          <button class="ab ab--cancel" :disabled="disabled" @click="resetNahida">重选</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import Card from './Card.vue'
import { currentPlayer, canUseSkill, submitGamble, submitNahidaScry, getAllianceTargets } from '../game/gameState.js'

const props = defineProps({
  state: { type: Object, required: true },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits([
  'attack', 'defense', 'gamble', 'skill',
  'target', 'skillTarget', 'cancel',
  'liniyaSkill', 'caiyueangSave', 'caiyueangLoad',
  'ally', 'betray', 'allyInvite'
])

// 赌命选牌
const gambleTrapIdx = ref(-1)
const gambleBaitIdx = ref(-1)
// 纳西妲选牌
const nahidaOrder = ref([])

const currentPlayerVal = computed(() => currentPlayer(props.state))
const canSkill = computed(() => canUseSkill(props.state, currentPlayerVal.value))
const skillLabel = computed(() => {
  const p = currentPlayerVal.value
  if (!p) return ''
  if (p.characterId === 'caiyueang') return `(读档${p.loadUses})`
  if (p.skillUses === Infinity) return '被动'
  return `(${p.skillUses})`
})
const canAlly = computed(() => {
  const p = currentPlayerVal.value
  return props.state.players.length >= 4 &&
    props.state.phase !== 'peace' &&
    p.allyIndex === null &&
    p.betrayalPenalty <= 0
})
const canBetray = computed(() => {
  const p = currentPlayerVal.value
  return props.state.phase !== 'peace' &&
    p.allyIndex !== null
})
const allianceTargets = computed(() => getAllianceTargets(props.state))
const pendingGamble = computed(() => props.state.pendingGamble)
const pendingAttackCard = computed(() => props.state.pendingAttackCard)
const ventiCards = computed(() => props.state.pendingVentiCards)
const nahidaTotalCards = computed(() => props.state.scryCards?.length || 5)

const aliveTargets = computed(() =>
  props.state.players.filter(p => p.alive && p !== currentPlayerVal.value)
)

const nahidaStepLabel = computed(() => {
  const total = nahidaTotalCards.value
  const i = nahidaOrder.value.length
  if (i >= total) return '所有牌顺序已选好'
  return `点击选择第 ${i + 1} 张牌（共${total}张，从顶部到底部）`
})

// 重置纳西妲选牌当进入 skillNahida 步骤时
watch(() => props.state.step, (newStep) => {
  if (newStep === 'skillNahida') {
    nahidaOrder.value = []
  }
})

function onGambleConfirm() {
  if (gambleTrapIdx.value >= 0 && gambleBaitIdx.value >= 0 && gambleTrapIdx.value !== gambleBaitIdx.value) {
    submitGamble(props.state, gambleTrapIdx.value, gambleBaitIdx.value)
  }
}

function onNahidaClick(idx) {
  if (nahidaOrder.value.includes(idx)) return
  nahidaOrder.value.push(idx)
}

function onNahidaConfirm() {
  const total = nahidaTotalCards.value
  if (nahidaOrder.value.length === total) {
    submitNahidaScry(props.state, nahidaOrder.value)
  }
}

function resetNahida() {
  nahidaOrder.value = []
}
</script>

<style scoped>
.action-bar { display: flex; flex-direction: column; gap: 8px; align-items: center; }
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
.ab--ally { background: #00acc1; color: #fff; }
.ab--betray { background: #b71c1c; color: #fff; }
.ab--skill { background: linear-gradient(135deg, #7b1fa2, #6a1b9a); color: #fff; }
.ab--target { background: #1565C0; color: #fff; }
.ab--skill-target { background: #e65100; color: #fff; }
.ab--cancel { background: #616161; color: #fff; font-size: 12px; }
.ab--confirm { background: #2e7d32; color: #fff; }

.attack-show { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.attack-show__cards { display: flex; gap: 6px; justify-content: center; }
.attack-show__total { margin-top: -4px; }

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

.scry-area { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.scry-idx { font-size: 10px; color: rgba(255,255,255,0.5); }
.scry-card { cursor: pointer; transition: all 0.15s; }
.scry-card:hover { background: rgba(255,255,255,0.08); }
.scry-card--selected { outline: 2px solid #ffd54f; background: rgba(255,213,79,0.15); }
</style>
