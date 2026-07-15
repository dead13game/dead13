<template>
  <div
    class="card"
    :class="[
      `card--${color}`,
      {
        'card--face-down': !card?.faceUp && !alwaysFaceUp,
        'card--joker': card?.isJoker,
        'card--empty': !card,
      },
    ]"
  >
    <template v-if="card">
      <template v-if="card.faceUp || alwaysFaceUp">
        <div class="card__corner card__corner--top">
          <span class="card__rank">{{ rankDisplay }}</span>
          <span v-if="!card.isJoker" class="card__suit">{{ card.suit }}</span>
        </div>
        <div class="card__center">
          <span v-if="card.isBigJoker" class="card__joker-icon"></span>
          <span v-else-if="card.isJoker" class="card__joker-icon"></span>
          <span v-else class="card__rank-big">{{ card.rank }}</span>
        </div>
        <div class="card__corner card__corner--bottom">
          <span class="card__rank">{{ rankDisplay }}</span>
          <span v-if="!card.isJoker" class="card__suit">{{ card.suit }}</span>
        </div>
        <div v-if="showValue" class="card__value-badge">{{ card.value }}</div>
      </template>
      <template v-else>
        <div class="card__back">
          <div class="card__back-pattern">
            <span></span>
          </div>
        </div>
      </template>
    </template>
    <template v-else>
      <div class="card__empty-slot">
        <span>—</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  card: { type: Object, default: null },
  alwaysFaceUp: { type: Boolean, default: false },
  showValue: { type: Boolean, default: false },
  size: { type: String, default: "normal" }, // small, normal, large
});

const rankDisplay = computed(() => {
  if (!props.card) return "";
  if (props.card.isBigJoker) return "君";
  if (props.card.isJoker) return "影";
  return props.card.rank;
});

const color = computed(() => {
  if (!props.card) return "black";
  if (props.card.isJoker) return "joker";
  if (props.card.suit === "♥" || props.card.suit === "♦") return "red";
  return "black";
});
</script>

<style scoped>
.card {
  width: 64px;
  height: 96px;
  border-radius: 8px;
  background: #fff;
  border: 2px solid #ddd;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: "Georgia", serif;
  user-select: none;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  flex-shrink: 0;
}

.card:hover:not(.card--empty) {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.card--face-down {
  background: linear-gradient(135deg, #1a237e, #283593);
  border-color: #0d1b5e;
}

.card--joker {
  border-color: #8b4513;
  background: linear-gradient(135deg, #fff8e1, #ffe0b2);
}

.card--red .card__rank,
.card--red .card__suit {
  color: #d32f2f;
}

.card--black .card__rank,
.card--black .card__suit {
  color: #1a1a1a;
}

.card--joker .card__rank,
.card--joker .card__suit {
  color: #8b4513;
}

.card--empty {
  border: 2px dashed #ccc;
  background: #fafafa;
}

/* 左上/右下角 */
.card__corner {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

.card__corner--top {
  top: 4px;
  left: 5px;
}

.card__corner--bottom {
  bottom: 4px;
  right: 5px;
  transform: rotate(180deg);
}

.card__rank {
  font-size: 12px;
  font-weight: bold;
}

.card__suit {
  font-size: 10px;
}

/* 中央大字 */
.card__center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.card__rank-big {
  font-size: 28px;
  font-weight: bold;
}

.card__joker-icon {
  font-size: 28px;
}

/* 点数标签 */
.card__value-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.card:hover .card__value-badge {
  opacity: 1;
}

/* 牌背 */
.card__back {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card__back-pattern {
  width: 44px;
  height: 64px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card__back-pattern span {
  color: rgba(255, 255, 255, 0.5);
  font-size: 20px;
}

/* 空位 */
.card__empty-slot {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
  font-size: 16px;
}
</style>

<style>
/* 全局：翻牌动画（用于其他组件传入的 card-flip-in） */
.card-flip-in {
  animation: cardFlip 0.4s ease-out;
}

@keyframes cardFlip {
  0% {
    transform: rotateY(90deg) scale(0.8);
    opacity: 0;
  }
  50% {
    transform: rotateY(-10deg) scale(1.05);
    opacity: 1;
  }
  100% {
    transform: rotateY(0deg) scale(1);
    opacity: 1;
  }
}
</style>
