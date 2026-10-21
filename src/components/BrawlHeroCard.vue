<template>
  <article
    class="hero-card"
    :class="[
      `hero-card--team${unit.teamId}`,
      {
        'hero-card--current': current,
        'hero-card--dead': !unit.alive,
        'hero-card--frozen': frozen,
      },
    ]"
  >
    <div class="hero-card__art">
      <img
        v-if="charData?.icon"
        class="hero-card__img"
        :src="charData.icon"
        :alt="charData.name"
        loading="lazy"
      />
      <div v-else class="hero-card__fallback">
        <span>{{ initial }}</span>
      </div>
      <div class="hero-card__vignette"></div>
      <div class="hero-card__shine"></div>

      <div class="hero-card__top">
        <span class="hero-card__team-dot"></span>
        <span class="hero-card__title">{{ charData?.title || "亡命十三街" }}</span>
      </div>

      <div class="hero-card__hp">
        <div class="hero-card__hpbar">
          <i
            :class="{ 'hp-mid': hpPct < 60, 'hp-low': hpPct < 30 }"
            :style="{ width: hpPct + '%' }"
          ></i>
        </div>
        <span class="hero-card__hptext">{{ unit.hp }}<em>/{{ unit.maxHp }}</em></span>
      </div>

      <div v-if="frozen" class="hero-card__frost">❄</div>
      <div v-if="current" class="hero-card__turn-ribbon">行动中</div>
    </div>

    <div class="hero-card__body">
      <div class="hero-card__name-row">
        <h3>{{ charData?.name || unit.name }}</h3>
        <span v-if="unit.artifactId != null" class="hero-card__artifact">
          {{ unit.artifactId === 1 ? "⚔" : "🎵" }}
        </span>
      </div>
      <p class="hero-card__skill">
        {{ charData?.skillName || "技能" }}
        <span v-if="skillUses !== Infinity">· {{ skillUses }} 次</span>
        <span v-else-if="charData?.skillType === 'passive'">· 被动</span>
        <span v-else>· 无限</span>
      </p>

      <div class="hero-card__stats">
        <span class="chip chip--shield" title="防御区总护盾">
          🛡 {{ shieldTotal }}
        </span>
        <span v-if="unit.defensePile?.length" class="chip chip--cards">
          {{ unit.defensePile.length }} 张
        </span>
        <span v-if="unit.trap" class="chip chip--trap" title="显示诱饵点数，真正的陷阱牌隐藏">
          陷阱 {{ unit.bait?.value ?? "?" }}
        </span>
        <span v-if="drone" class="chip chip--drone" title="无人机">
          🛸 {{ drone.hp }}HP
          <em v-if="drone.defCount">/🛡{{ drone.defCount }}</em>
        </span>
      </div>

      <div v-if="chips.length" class="hero-card__tags">
        <span v-for="c in chips" :key="c" class="tag">{{ c }}</span>
      </div>
    </div>

    <div v-if="!unit.alive" class="hero-card__dead">
      <span class="hero-card__dead-label">阵 亡</span>
      <em v-if="unit.respawnRound">第 {{ unit.respawnRound }} 回合复活</em>
      <em v-else>本局不再复活</em>
    </div>
  </article>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  unit: { type: Object, required: true },
  charData: { type: Object, default: null },
  current: { type: Boolean, default: false },
});

const hpPct = computed(() =>
  Math.max(0, Math.min(100, (props.unit.hp / Math.max(1, props.unit.maxHp)) * 100)),
);

const shieldTotal = computed(() =>
  (props.unit.defensePile || []).reduce(
    (s, c) => s + (c.defenseValue ?? c.value ?? 0),
    0,
  ),
);

const initial = computed(
  () => (props.charData?.name || props.unit.name || "?").slice(0, 1),
);

const frozen = computed(() => {
  const f = props.unit.statusEffects?.frozenBy;
  return f !== null && f !== undefined;
});

const skillUses = computed(() => props.unit.skillUses ?? 0);
const drone = computed(() => props.unit.statusEffects?.drone ?? null);

const chips = computed(() => {
  const u = props.unit;
  const out = [];
  if (u.chorus > 0) out.push(`领唱 ${u.chorus}`);
  if (u.attackStreak > 0) out.push(`连击 ${u.attackStreak}`);
  if (u.fightingSpirit > 0) out.push(`斗志 ${u.fightingSpirit}`);
  if (u.moonPhase === 0 && u.characterId === 7) out.push("弦月");
  if (u.moonPhase === 1 && u.characterId === 7) out.push("满月");
  if (u.moonPhase === 2 && u.characterId === 7) out.push("新月");
  if (u.artifactActive) out.push(`圣遗物 ${u.artifactRoundsLeft}`);
  if (u.statusEffects?.savepoint) out.push("已存档");
  if (u.statusEffects?.ignoreTrapThisTurn) out.push("无视陷阱");
  return out;
});
</script>

<style scoped>
.hero-card {
  --team: #4fc3f7;
  --team-soft: rgba(79, 195, 247, 0.16);
  position: relative;
  width: 196px;
  min-height: 246px;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(160deg, #1b2342 0%, #0d1226 60%, #0a0f1f 100%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 10px 26px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transform: translateZ(0);
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease,
    border-color 0.25s ease;
}
.hero-card--team1 {
  --team: #ff6b6b;
  --team-soft: rgba(255, 107, 107, 0.16);
}
.hero-card:hover {
  transform: translateY(-4px);
}
.hero-card--current {
  border-color: rgba(255, 213, 79, 0.9);
  box-shadow:
    0 0 0 1px rgba(255, 213, 79, 0.6),
    0 0 32px rgba(255, 213, 79, 0.35),
    0 16px 40px rgba(0, 0, 0, 0.55);
  transform: translateY(-6px) scale(1.02);
  animation: heroPulse 2.2s ease-in-out infinite;
}
@keyframes heroPulse {
  0%,
  100% {
    box-shadow:
      0 0 0 1px rgba(255, 213, 79, 0.55),
      0 0 26px rgba(255, 213, 79, 0.28),
      0 16px 40px rgba(0, 0, 0, 0.55);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(255, 213, 79, 0.95),
      0 0 44px rgba(255, 213, 79, 0.45),
      0 16px 40px rgba(0, 0, 0, 0.55);
  }
}

.hero-card__art {
  position: relative;
  height: 146px;
  overflow: hidden;
  background: radial-gradient(circle at 50% 20%, var(--team-soft), transparent 70%);
}
.hero-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  display: block;
  filter: saturate(1.05) contrast(1.02);
  transform: scale(1.02);
}
.hero-card__fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 64px;
  font-weight: 900;
  color: var(--team);
  background:
    radial-gradient(circle at 30% 20%, var(--team-soft), transparent 60%),
    linear-gradient(135deg, #182040, #0a0f1f);
}
.hero-card__vignette {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to top, #0d1226 2%, transparent 42%),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.45), transparent 35%);
  pointer-events: none;
}
.hero-card__shine {
  position: absolute;
  inset: -40% -60%;
  background: linear-gradient(
    115deg,
    transparent 35%,
    rgba(255, 255, 255, 0.12) 48%,
    transparent 60%
  );
  transform: translateX(-30%) rotate(0.001deg);
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}
.hero-card:hover .hero-card__shine {
  opacity: 1;
  animation: shineSweep 1.1s ease;
}
@keyframes shineSweep {
  from {
    transform: translateX(-45%);
  }
  to {
    transform: translateX(45%);
  }
}

.hero-card__top {
  position: absolute;
  top: 8px;
  left: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.hero-card__team-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--team);
  box-shadow: 0 0 10px var(--team);
  flex: none;
}
.hero-card__title {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.7);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hero-card__hp {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.hero-card__hpbar {
  position: relative;
  flex: 1;
  height: 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.18);
  overflow: hidden;
}
.hero-card__hpbar i {
  position: absolute;
  inset: 0 auto 0 0;
  display: block;
  border-radius: 999px;
  background: linear-gradient(90deg, #00c853, #69f0ae);
  box-shadow: 0 0 10px rgba(0, 200, 83, 0.45);
  transition: width 0.35s ease;
}
.hero-card__hpbar i.hp-mid {
  background: linear-gradient(90deg, #ff8f00, #ffd54f);
  box-shadow: 0 0 10px rgba(255, 179, 0, 0.45);
}
.hero-card__hpbar i.hp-low {
  background: linear-gradient(90deg, #c62828, #ff5252);
  box-shadow: 0 0 10px rgba(255, 82, 82, 0.55);
}
.hero-card__hptext {
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 4px #000;
  font-variant-numeric: tabular-nums;
}
.hero-card__hptext em {
  font-style: normal;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.55);
}

.hero-card__frost {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 70px;
  color: rgba(160, 230, 255, 0.9);
  background: radial-gradient(circle, rgba(120, 210, 255, 0.28), transparent 65%);
  text-shadow: 0 0 24px #7fd8ff;
  animation: frostBreath 2.4s ease-in-out infinite;
}
@keyframes frostBreath {
  0%,
  100% {
    opacity: 0.65;
  }
  50% {
    opacity: 1;
  }
}
.hero-card__turn-ribbon {
  position: absolute;
  top: 10px;
  right: -28px;
  width: 106px;
  transform: rotate(38deg);
  text-align: center;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #241a00;
  background: linear-gradient(90deg, #ffd54f, #ffb300);
  box-shadow: 0 2px 10px rgba(255, 179, 0, 0.5);
}

.hero-card__body {
  padding: 6px 10px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.hero-card__name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.hero-card__name-row h3 {
  margin: 0;
  font-size: 16px;
  letter-spacing: 0.04em;
  color: #fff;
}
.hero-card__artifact {
  font-size: 12px;
  opacity: 0.85;
}
.hero-card__skill {
  margin: 2px 0 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hero-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  border: 1px solid transparent;
}
.chip--shield {
  color: #90caf9;
  background: rgba(79, 195, 247, 0.12);
  border-color: rgba(79, 195, 247, 0.28);
}
.chip--cards {
  color: rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.06);
}
.chip--trap {
  color: #e1a7ff;
  background: rgba(186, 104, 200, 0.14);
  border-color: rgba(186, 104, 200, 0.35);
}
.chip--drone {
  color: #ffd54f;
  background: rgba(255, 213, 79, 0.12);
  border-color: rgba(255, 213, 79, 0.3);
}
.chip--drone em {
  font-style: normal;
  opacity: 0.7;
}
.hero-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.tag {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 9px;
  color: #ffe082;
  background: rgba(255, 213, 79, 0.1);
  border: 1px solid rgba(255, 213, 79, 0.22);
}

.hero-card--dead .hero-card__art,
.hero-card--dead .hero-card__body {
  filter: grayscale(0.9) brightness(0.5);
}
.hero-card__dead {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(4, 6, 14, 0.62);
  backdrop-filter: blur(1px);
}
.hero-card__dead-label {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: 0.3em;
  color: #ff5252;
  text-shadow: 0 0 18px rgba(255, 82, 82, 0.6);
  transform: rotate(-6deg);
}
.hero-card__dead em {
  font-style: normal;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.65);
}

@media (max-width: 720px) {
  .hero-card {
    width: 152px;
    min-height: 226px;
  }
  .hero-card__art {
    height: 132px;
  }
  .hero-card__name-row h3 {
    font-size: 13px;
  }
  .hero-card__skill {
    font-size: 10px;
  }
  .hero-card__dead-label {
    font-size: 19px;
  }
}

@media (max-width: 480px) {
  .hero-card {
    width: 116px;
    min-height: 186px;
    border-radius: 12px;
  }
  .hero-card__art {
    height: 98px;
  }
  .hero-card__top {
    top: 5px;
    left: 6px;
    right: 6px;
  }
  .hero-card__title {
    font-size: 8px;
  }
  .hero-card__hp {
    left: 6px;
    right: 6px;
    bottom: 5px;
    gap: 4px;
  }
  .hero-card__hpbar {
    height: 7px;
  }
  .hero-card__hptext {
    font-size: 9px;
  }
  .hero-card__hptext em {
    font-size: 7px;
  }
  .hero-card__body {
    padding: 4px 7px 6px;
  }
  .hero-card__name-row h3 {
    font-size: 11px;
  }
  .hero-card__skill {
    font-size: 8px;
    margin: 0 0 4px;
  }
  .chip {
    padding: 1px 4px;
    font-size: 8px;
  }
  .hero-card__tags {
    margin-top: 3px;
  }
  .tag {
    font-size: 7px;
  }
  .hero-card__turn-ribbon {
    width: 78px;
    right: -24px;
    top: 7px;
    font-size: 7px;
  }
  .hero-card__dead-label {
    font-size: 14px;
    letter-spacing: 0.18em;
  }
  .hero-card__dead em {
    font-size: 8px;
  }
}
</style>
