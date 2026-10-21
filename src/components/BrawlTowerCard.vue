<template>
  <div
    class="tower-card"
    :class="[
      `tower-card--team${tower.teamId}`,
      {
        'tower-card--target': attackable && tower.alive,
        'tower-card--dead': !tower.alive,
        'tower-card--current': current,
      },
    ]"
  >
    <div class="tower-card__crest">
      <span class="tower-card__tower">🏯</span>
      <span class="tower-card__no">{{ tower.towerIndex }}</span>
    </div>
    <div class="tower-card__name">{{ tower.name }}</div>

    <div class="tower-card__pips">
      <i
        v-for="n in 10"
        :key="n"
        :class="{ on: n <= tower.hp, edge: n === tower.hp }"
      ></i>
    </div>

    <div class="tower-card__meta">
      <span class="tower-card__shield" title="防御牌张数（不公开点数）"
        >🛡 {{ defenseCount }}张</span
      >
      <span
        v-if="residualShield !== null"
        class="tower-card__residual"
        title="最新一张残盾"
        >残{{ residualShield }}</span
      >
      <span v-if="tower.trap" class="tower-card__trap" title="显示诱饵点数，真正的陷阱牌隐藏"
        >陷阱 {{ tower.trap.decoyValue ?? "?" }}</span
      >
    </div>

    <div v-if="attackable && tower.alive" class="tower-card__target-tag">
      可攻击
    </div>
    <div v-if="!tower.alive" class="tower-card__dead">已摧毁</div>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  tower: { type: Object, required: true },
  attackable: { type: Boolean, default: false },
  current: { type: Boolean, default: false },
});

const defenseCount = computed(
  () => props.tower.defensePile?.length ?? 0,
);

/** 只公开「最新一张」残盾的剩余值；完整防御牌只显示张数 */
const residualShield = computed(() => {
  const pile = props.tower.defensePile || [];
  const top = pile[pile.length - 1];
  if (!top) return null;
  const current = top.defenseValue;
  if (current == null) return null;
  const base = top.maxDefenseValue ?? top.value ?? current;
  return current < base ? current : null;
});
</script>

<style scoped>
.tower-card {
  --team: #4fc3f7;
  position: relative;
  width: 96px;
  padding: 6px 7px 8px;
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(30, 40, 76, 0.95), rgba(10, 14, 30, 0.95));
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  text-align: center;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}
.tower-card--team1 {
  --team: #ff6b6b;
  background:
    linear-gradient(180deg, rgba(58, 28, 40, 0.95), rgba(20, 10, 18, 0.95));
}
.tower-card__crest {
  position: relative;
  display: grid;
  place-items: center;
  height: 28px;
}
.tower-card__tower {
  font-size: 21px;
  filter: drop-shadow(0 0 8px var(--team));
}
.tower-card__no {
  position: absolute;
  right: 0;
  top: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 9px;
  font-weight: 900;
  color: #0a0f1f;
  background: var(--team);
}
.tower-card__name {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.82);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tower-card__pips {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 2px;
  margin: 4px 0 4px;
}
.tower-card__pips i {
  height: 6px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  transition: background 0.2s;
}
.tower-card__pips i.on {
  background: linear-gradient(90deg, #69f0ae, #00e676);
  box-shadow: 0 0 6px rgba(0, 230, 118, 0.5);
}
.tower-card__pips i.edge {
  background: #ffd54f;
  box-shadow: 0 0 8px rgba(255, 213, 79, 0.8);
}
.tower-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.6);
}
.tower-card__shield {
  color: #90caf9;
}
.tower-card__residual {
  color: #ffb74d;
  font-weight: 700;
}
.tower-card__trap {
  color: #e1a7ff;
}

.tower-card--target {
  border-color: rgba(255, 213, 79, 0.85);
  transform: translateY(-3px);
  animation: towerTarget 1.8s ease-in-out infinite;
}
@keyframes towerTarget {
  0%,
  100% {
    box-shadow:
      0 0 0 1px rgba(255, 213, 79, 0.45),
      0 0 16px rgba(255, 213, 79, 0.25);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(255, 213, 79, 0.95),
      0 0 26px rgba(255, 213, 79, 0.5);
  }
}
.tower-card__target-tag {
  position: absolute;
  left: 50%;
  bottom: -8px;
  transform: translateX(-50%);
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #241a00;
  background: linear-gradient(90deg, #ffe082, #ffb300);
  white-space: nowrap;
}
.tower-card--current {
  outline: 2px solid rgba(255, 213, 79, 0.8);
}
.tower-card--dead {
  filter: grayscale(1) brightness(0.45);
  transform: none;
  animation: none;
}
.tower-card__dead {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: rgba(255, 80, 80, 0.9);
  background: rgba(0, 0, 0, 0.35);
  border-radius: 12px;
  transform: rotate(-8deg);
}

@media (max-width: 720px) {
  .tower-card {
    width: 88px;
    padding: 6px;
  }
  .tower-card__tower {
    font-size: 20px;
  }
  .tower-card__name {
    font-size: 9px;
  }
}

@media (max-width: 480px) {
  .tower-card {
    width: 64px;
    padding: 4px;
    border-radius: 9px;
  }
  .tower-card__crest {
    height: 20px;
  }
  .tower-card__tower {
    font-size: 15px;
  }
  .tower-card__no {
    width: 12px;
    height: 12px;
    font-size: 7px;
  }
  .tower-card__name {
    font-size: 7px;
  }
  .tower-card__pips {
    gap: 1px;
    margin: 3px 0;
  }
  .tower-card__pips i {
    height: 4px;
  }
  .tower-card__meta {
    font-size: 7px;
  }
  .tower-card__target-tag {
    font-size: 6px;
    padding: 0 4px;
    bottom: -6px;
  }
}
</style>
