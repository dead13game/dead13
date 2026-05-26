<template>
  <div class="pa" :class="{ 'pa--current': isCurrent, 'pa--dead': !player.alive }">
    <!-- 头部 -->
    <div class="pa__header">
      <span class="pa__name">{{ player.name }}</span>
      <div v-if="player.alive" class="pa__hp-bar">
        <div class="pa__hp-fill" :style="{ width: hpPct + '%' }"></div>
        <span class="pa__hp-text">{{ player.hp }}/{{ player.maxHp }}</span>
      </div>
      <span v-else class="pa__dead"></span>
      <span v-if="isCurrent && player.alive" class="pa__turn"></span>
    </div>

    <!-- 角色信息 -->
    <div v-if="player.alive" class="pa__body">
      <div class="pa__char-info" :title="player.skillDesc ? player.skillName + '：' + player.skillDesc : player.characterTitle + ' · ' + player.skillName">
        <span class="pa__skill-name">{{ player.skillName }}</span>
        <span v-if="player.skillType === 'active'" class="pa__skill-uses">
          ({{ player.skillUses }}/{{ player.maxUses }})
        </span>
      </div>

      <!-- 卡牌区 -->
      <div class="pa__cards">
        <!-- 角色卡 -->
        <div class="pa__slot">
          <div class="pa__label">角色</div>
          <div class="pa__char-portrait">
            <img v-if="charData?.icon" :src="charData.icon" :alt="player.characterName" class="pa__char-img" />
          </div>
        </div>

        <!-- 防御区 -->
        <div class="pa__slot">
          <div class="pa__label">防御({{ player.defensePile.length }})</div>
          <div class="pa__def-pile">
            <Card
              v-for="(c, i) in player.defensePile"
              :key="c.id + '-' + i"
              :card="c"
              :showValue="true"
            />
            <Card v-if="player.defensePile.length === 0" :card="null" />
          </div>
        </div>

        <!-- 陷阱区 -->
        <div class="pa__slot">
          <div class="pa__label">陷阱</div>
          <div class="pa__trap-row">
            <div class="pa__trap-item">
              <div class="pa__minilabel">暗</div>
              <Card :card="player.trap" :alwaysFaceUp="player.trap?.faceUp" />
            </div>
            <div class="pa__trap-item">
              <div class="pa__minilabel">明</div>
              <Card :card="player.bait" :alwaysFaceUp="true" />
            </div>
          </div>
        </div>

        <!-- 特殊状态 -->
        <div class="pa__status">
          <div v-if="player.characterId === 'mavuika' && player.fightingSpirit > 0" class="pa__tag pa__tag--spirit">
            {{ player.fightingSpirit }}
          </div>
          <div v-if="player.characterId === 'columbina'" class="pa__tag" :class="moonClass">
            {{ moonIcon }}
          </div>
          <div v-if="player.extraAction" class="pa__tag pa__tag--extra">+1行动</div>
          <div v-if="player.ignoreTrapThisTurn" class="pa__tag pa__tag--ignore">无视陷阱</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Card from './Card.vue'
import { CHARACTERS } from '../game/constants.js'

const props = defineProps({
  player: { type: Object, required: true },
  isCurrent: { type: Boolean, default: false }
})

const charData = computed(() => CHARACTERS.find(c => c.id === props.player.characterId))

const hpPct = computed(() => props.player.maxHp > 0 ? Math.max(0, props.player.hp / props.player.maxHp * 100) : 0)

const moonIcon = computed(() => {
  const p = props.player
  if (p.moonPhase === 0) return '弦月'
  if (p.moonPhase === 1) return '满月'
  return '新月'
})
const moonClass = computed(() => {
  const p = props.player
  if (p.moonPhase === 0) return 'pa__tag--waxing'
  if (p.moonPhase === 1) return 'pa__tag--full'
  return 'pa__tag--new'
})
</script>

<style scoped>
.pa {
  background: #fff; border: 2px solid #e0e0e0; border-radius: 10px;
  padding: 8px; min-width: 200px; flex: 1;
  transition: border-color 0.3s, box-shadow 0.3s;
}
.pa--current { border-color: #1976D2; box-shadow: 0 0 0 2px rgba(25,118,210,0.15); background: #e3f2fd; }
.pa--dead { opacity: 0.4; background: #fafafa; }

.pa__header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.pa__name { font-weight: bold; font-size: 13px; }
.pa__hp-bar { position: relative; width: 72px; height: 14px; background: #e0e0e0; border-radius: 7px; overflow: hidden; flex-shrink: 0; }
.pa__hp-fill { position: absolute; left: 0; top: 0; height: 100%; background: linear-gradient(90deg, #e53935, #43a047); transition: width 0.4s; border-radius: 7px; }
.pa__hp-text { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #fff; font-weight: bold; text-shadow: 0 0 2px rgba(0,0,0,0.5); z-index: 1; }
.pa__dead { font-size: 16px; }
.pa__turn { font-size: 11px; color: #1976D2; font-weight: bold; }

.pa__body { }
.pa__char-info { font-size: 10px; color: #616161; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; }
.pa__skill-name { font-weight: bold; }
.pa__skill-uses { color: #9e9e9e; }

.pa__cards { display: flex; gap: 6px; align-items: flex-start; flex-wrap: nowrap; }
.pa__slot { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.pa__label { font-size: 9px; color: #9e9e9e; white-space: nowrap; }

.pa__char-portrait {
  width: 52px; height: 62px; border-radius: 6px; overflow: hidden;
  border: 2px solid #9fa8da;
}
.pa__char-img {
  width: 100%; height: 100%; object-fit: cover;
}

.pa__def-pile { display: flex; flex-direction: column-reverse; align-items: center; gap: 2px; }
.pa__trap-row { display: flex; gap: 3px; }
.pa__trap-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.pa__minilabel { font-size: 8px; color: #bdbdbd; }

.pa__status { display: flex; flex-direction: column; gap: 3px; align-self: center; }
.pa__tag {
  font-size: 9px; font-weight: bold; padding: 2px 5px; border-radius: 3px;
  writing-mode: vertical-lr; letter-spacing: 1px;
}
.pa__tag--spirit { background: #fff3e0; color: #e65100; }
.pa__tag--waxing { background: #e8eaf6; color: #3949ab; }
.pa__tag--full { background: #fff8e1; color: #f57f17; }
.pa__tag--new { background: #e0e0e0; color: #424242; }
.pa__tag--extra { background: #e8f5e9; color: #2e7d32; }
.pa__tag--ignore { background: #fce4ec; color: #c62828; }
</style>
