<template>
  <div class="league-round-result">
    <div class="league-round-result__card">
      <h2>📋 第 {{ round }} 轮结果</h2>

      <div class="round-matches">
        <div
          v-for="(match, idx) in matchResults"
          :key="idx"
          class="round-match"
          :class="{ 'round-match--player': match.isPlayer }"
        >
          <span class="round-match__team round-match__team--home">
            <TeamBadge :team-id="match.homeTeamId" size="sm" />
            {{ match.homeName }}
          </span>
          <span
            class="round-match__result"
            :class="'round-match__result--' + match.result"
          >
            {{ resultLabel(match.result) }}
          </span>
          <span class="round-match__team round-match__team--away">
            {{ match.awayName }}
            <TeamBadge :team-id="match.awayTeamId" size="sm" />
          </span>
          <span v-if="match.isPlayer" class="round-match__player-badge"
            >⚽ 你的比赛</span
          >
        </div>
      </div>

      <div class="league-round-result__actions">
        <button
          class="league-btn league-btn--standings"
          @click="$emit('viewStandings')"
        >
          📊 查看积分榜
        </button>
        <button class="league-btn" @click="$emit('continue')">
          {{ isLastRound ? "🏆 联赛结束" : "▶ 下一轮" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import TeamBadge from "./TeamBadge.vue";

defineProps({
  round: { type: Number, required: true },
  matchResults: { type: Array, required: true },
  // matchResults: [{ homeTeamId, homeName, awayTeamId, awayName, result: 'home'|'away'|'draw', isPlayer }]
  isLastRound: { type: Boolean, default: false },
});

defineEmits(["continue", "viewStandings"]);

function resultLabel(result) {
  switch (result) {
    case "home":
      return "胜";
    case "away":
      return "胜";
    case "draw":
      return "平";
    default:
      return "?";
  }
}
</script>

<style scoped>
.league-round-result {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 20px;
  min-height: 100vh;
}
.league-round-result__card {
  background: rgba(10, 15, 40, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 24px 28px;
  max-width: 600px;
  width: 100%;
  color: #e0e0e0;
}
.league-round-result__card h2 {
  text-align: center;
  margin: 0 0 16px;
}

.round-matches {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.round-match {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  font-size: 14px;
}
.round-match--player {
  background: rgba(255, 215, 0, 0.08);
  border: 1px solid rgba(255, 215, 0, 0.25);
}
.round-match__team {
  flex: 1;
}
.round-match__team--home {
  text-align: right;
}
.round-match__team--away {
  text-align: left;
}
.round-match__result {
  font-weight: 700;
  font-size: 13px;
  min-width: 28px;
  text-align: center;
  padding: 2px 8px;
  border-radius: 4px;
}
.round-match__result--home {
  color: #4caf50;
}
.round-match__result--away {
  color: #4caf50;
}
.round-match__result--draw {
  color: #ff9800;
}
.round-match__player-badge {
  font-size: 11px;
  color: #ffd700;
  white-space: nowrap;
}

.league-round-result__actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 20px;
}
.league-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #1a6b3c, #0d4a25);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.league-btn:hover {
  background: linear-gradient(135deg, #1e8a4d, #135e30);
}
.league-btn--standings {
  background: linear-gradient(135deg, #1565c0, #0d3b7a);
}
.league-btn--standings:hover {
  background: linear-gradient(135deg, #1976d2, #114a8f);
}
</style>
