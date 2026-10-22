<template>
  <span class="team-badge" :class="'team-badge--' + (size || 'md')">
    <img
      v-if="src"
      :src="src"
      :alt="team?.name || ''"
      class="team-badge__img"
      @error="src = null"
    />
    <span v-else class="team-badge__emoji">{{ team?.emoji || "" }}</span>
  </span>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { LEAGUE_TEAMS, getTeamBadge } from "../game/leagueConstants.js";

interface Props {
  /** 球队 id（1-10），查 LEAGUE_TEAMS */
  teamId?: number | null;
  /** 尺寸：sm / md / lg */
  size?: string;
}

const props = withDefaults(defineProps<Props>(), {
  teamId: null,
  size: "md",
});

const team = computed(() =>
  props.teamId != null ? LEAGUE_TEAMS[props.teamId] : null,
);

// 队标路径；图片加载失败（src=null）时回退显示 emoji
const src = ref<string | null>(null);
watch(
  () => props.teamId,
  (id) => {
    src.value = getTeamBadge(id);
  },
  { immediate: true },
);
</script>

<style scoped>
.team-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}
.team-badge__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
}
.team-badge__emoji {
  line-height: 1;
}
/* 尺寸 */
.team-badge--sm {
  width: 20px;
  height: 20px;
  font-size: 14px;
}
.team-badge--md {
  width: 28px;
  height: 28px;
  font-size: 18px;
}
.team-badge--lg {
  width: 44px;
  height: 44px;
  font-size: 26px;
}
</style>
