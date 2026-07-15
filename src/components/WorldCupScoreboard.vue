<template>
  <div class="wc-sb">
    <!-- 比赛阶段 -->
    <span class="wc-sb__stage">{{ stageLabel }}</span>

    <!-- 比分 -->
    <div class="wc-sb__score">
      <span class="wc-sb__team-name wc-sb__team-name--home">
        ⭐ {{ playerName }}
      </span>
      <span class="wc-sb__score-num">{{ score[0] }} : {{ score[1] }}</span>
      <span class="wc-sb__team-name wc-sb__team-name--away">
        {{ opponentName }}
      </span>
    </div>

    <!-- 回合 + 换人 -->
    <div class="wc-sb__info">
      <span class="wc-sb__round">
        {{ isGroupStage ? "小组赛" : `${matchRound}/${maxRounds} 回合` }}
        <template v-if="isExtraTime"> 🔥加时</template>
      </span>
      <button
        v-if="showSubBtn"
        class="wc-sb__sub-btn"
        :disabled="!canSub"
        @click="$emit('substitute')"
      >
        换人({{ subsLeft }})
      </button>
    </div>

    <!-- 点球比分 -->
    <div v-if="penaltyActive" class="wc-sb__penalty">
      点球大战 {{ penalty?.playerScore || 0 }} :
      {{ penalty?.opponentScore || 0 }}
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { MATCH_CONFIG } from "../game/worldCupConstants.js";

const props = defineProps({
  playerName: { type: String, default: "玩家" },
  opponentName: { type: String, default: "对手" },
  score: { type: Array, default: () => [0, 0] },
  matchRound: { type: Number, default: 1 },
  maxRounds: { type: Number, default: 90 },
  isGroupStage: { type: Boolean, default: false },
  isExtraTime: { type: Boolean, default: false },
  subsLeft: { type: Number, default: 3 },
  canSub: { type: Boolean, default: false },
  stageLabel: { type: String, default: "" },
  penalty: { type: Object, default: null },
});

defineEmits(["substitute"]);

const showSubBtn = computed(() => !props.isGroupStage && props.subsLeft >= 0);
const penaltyActive = computed(() => props.penalty !== null);
</script>

<style scoped>
.wc-sb {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  background: linear-gradient(
    135deg,
    rgba(8, 8, 30, 0.95),
    rgba(20, 10, 40, 0.95)
  );
  padding: 6px 16px;
  padding-top: max(6px, env(safe-area-inset-top));
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  border-bottom: 2px solid #e53935;
}
.wc-sb__stage {
  font-size: 11px;
  font-weight: bold;
  background: #e53935;
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}
.wc-sb__score {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  justify-content: center;
  min-width: 200px;
}
.wc-sb__team-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wc-sb__team-name--home {
  text-align: right;
  color: #ffd54f;
  font-weight: bold;
}
.wc-sb__team-name--away {
  text-align: left;
}
.wc-sb__score-num {
  font-size: 22px;
  font-weight: bold;
  color: #fff;
  font-variant-numeric: tabular-nums;
  min-width: 60px;
  text-align: center;
}
.wc-sb__info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wc-sb__round {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
}
.wc-sb__sub-btn {
  background: rgba(255, 213, 79, 0.15);
  border: 1px solid rgba(255, 213, 79, 0.3);
  color: #ffd54f;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.wc-sb__sub-btn:hover:not(:disabled) {
  background: rgba(255, 213, 79, 0.25);
}
.wc-sb__sub-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.wc-sb__penalty {
  width: 100%;
  text-align: center;
  font-size: 14px;
  font-weight: bold;
  color: #ffd54f;
  padding: 4px 0 2px;
}
@media (max-width: 500px) {
  .wc-sb {
    gap: 6px;
    padding: 6px 10px;
  }
  .wc-sb__team-name {
    font-size: 11px;
    max-width: 60px;
  }
  .wc-sb__score-num {
    font-size: 18px;
    min-width: 50px;
  }
}
</style>
