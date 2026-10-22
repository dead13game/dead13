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
        <span class="chip chip--shield" title="防御牌张数（不公开每张点数）">
          🛡 {{ defenseCount }} 张
        </span>
        <span
          v-if="residualShield !== null"
          class="chip chip--residual"
          title="最新一张防御牌是残盾，仅显示剩余值"
        >
          残盾 {{ residualShield }}
        </span>
        <span v-if="unit.trap" class="chip chip--trap" title="显示诱饵点数，真正的陷阱牌隐藏">
          陷阱 {{ unit.trap.decoyValue ?? unit.bait?.value ?? "?" }}
        </span>
        <span v-if="drone" class="chip chip--drone" title="无人机（防御牌张数）">
          🛸 {{ drone.hp }}HP
          <em v-if="drone.defCount">/🛡{{ drone.defCount }}张</em>
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

<script setup lang="ts">
import { computed } from "vue";
import type { CharacterMeta } from "../game/types.js";
import type { PlayerView } from "../game/view.js";

/**
 * 英雄/塔/召唤物的视图对象。
 * `respawnRound` 是旧模板字段，当前 `buildView` 的 PlayerView 不产出它
 * （运行时恒 undefined，模板原样保留），故在此以可选字段声明。
 */
interface BrawlUnitView extends PlayerView {
  respawnRound?: number;
}

interface Props {
  unit: BrawlUnitView;
  charData?: CharacterMeta | null;
  current?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  charData: null,
  current: false,
});

const hpPct = computed(() =>
  Math.max(0, Math.min(100, (props.unit.hp / Math.max(1, props.unit.maxHp)) * 100)),
);

const defenseCount = computed(
  () => props.unit.defensePile?.length ?? 0,
);

/** 只公开「最新一张」残盾的剩余值；完整防御牌只显示张数 */
const residualShield = computed(() => {
  const pile = props.unit.defensePile || [];
  const top = pile[pile.length - 1];
  if (!top) return null;
  const current = top.defenseValue;
  if (current == null) return null;
  const base = top.maxDefenseValue ?? top.value ?? current;
  return current < base ? current : null;
});

const initial = computed(
  () => (props.charData?.name || props.unit.name || "?").slice(0, 1),
);

const frozen = computed(() => {
  const f = props.unit.statusEffects?.frozenBy;
  return f !== null && f !== undefined;
});

const skillUses = computed(() => props.unit.skillUses ?? 0);
const drone = computed(() => props.unit.statusEffects?.drone ?? null);

const chips = computed<string[]>(() => {
  const u = props.unit;
  const out: string[] = [];
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

<style scoped src="./brawl/hero-card.css"></style>
