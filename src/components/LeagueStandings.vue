<template>
  <div class="league-standings">
    <div class="league-standings__card">
      <h2>📊 联赛积分榜</h2>
      <p class="league-standings__round">
        第 {{ currentRound }} / {{ totalRounds }} 轮
      </p>

      <table class="standings-table">
        <thead>
          <tr>
            <th class="col-rank">#</th>
            <th class="col-team">球队</th>
            <th class="col-stat">已赛</th>
            <th class="col-stat">胜</th>
            <th class="col-stat">平</th>
            <th class="col-stat">负</th>
            <th class="col-pts">积分</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(team, idx) in standings"
            :key="team.teamId"
            :class="{
              'standings-row--player': team.isPlayer,
              'standings-row--top': idx === 0,
            }"
          >
            <td class="col-rank">{{ idx + 1 }}</td>
            <td class="col-team">
              <span class="team-emoji">{{ team.emoji }}</span>
              {{ team.name }}
              <span v-if="team.isPlayer" class="player-badge">👈</span>
            </td>
            <td class="col-stat">{{ team.played }}</td>
            <td class="col-stat">{{ team.wins }}</td>
            <td class="col-stat">{{ team.draws }}</td>
            <td class="col-stat">{{ team.losses }}</td>
            <td class="col-pts">
              <strong>{{ team.points }}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="league-standings__actions">
        <button class="league-btn" @click="$emit('continue')">
          {{ isFinished ? "查看最终排名" : "继续下一轮" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  standings: { type: Array, required: true },
  currentRound: { type: Number, default: 1 },
  totalRounds: { type: Number, default: 18 },
  isFinished: { type: Boolean, default: false },
});

defineEmits(["continue"]);
</script>

<style scoped>
.league-standings {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 20px;
  min-height: 100vh;
}
.league-standings__card {
  background: rgba(10, 15, 40, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 24px 28px;
  max-width: 700px;
  width: 100%;
  color: #e0e0e0;
}
.league-standings__card h2 {
  text-align: center;
  margin: 0 0 4px;
}
.league-standings__round {
  text-align: center;
  color: #ffd700;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
}

.standings-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.standings-table th {
  background: rgba(255, 255, 255, 0.06);
  padding: 10px 8px;
  text-align: center;
  font-size: 12px;
  color: #aaa;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
.standings-table td {
  padding: 10px 8px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.col-rank {
  width: 32px;
}
.col-team {
  text-align: left;
}
.col-stat {
  width: 42px;
}
.col-pts {
  width: 52px;
}

.team-emoji {
  margin-right: 6px;
}
.player-badge {
  margin-left: 4px;
}

.standings-row--player {
  background: rgba(79, 195, 247, 0.08);
}
.standings-row--player td {
  color: #4fc3f7;
  font-weight: 600;
}
.standings-row--top td {
  border-top: 1px solid rgba(255, 215, 0, 0.3);
}

.league-standings__actions {
  text-align: center;
  margin-top: 20px;
}
.league-btn {
  padding: 12px 32px;
  background: linear-gradient(135deg, #1a6b3c, #0d4a25);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.league-btn:hover {
  background: linear-gradient(135deg, #1e8a4d, #135e30);
}
</style>
