<template>
  <div class="wc-standings">
    <h3 class="wc-standings__title">🏆 {{ groupName }}组 积分榜</h3>
    <table class="wc-standings__table">
      <thead>
        <tr>
          <th>队伍</th>
          <th>赛</th>
          <th>胜</th>
          <th>平</th>
          <th>负</th>
          <th>进</th>
          <th>失</th>
          <th>分</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(t, i) in standings"
          :key="t.index"
          :class="{
            'wc-standings__row--player': t.isPlayer,
            'wc-standings__row--advance': i < 2,
          }"
        >
          <td class="wc-standings__team">
            <span class="wc-standings__emoji">{{ t.emoji }}</span>
            {{ t.name }}
          </td>
          <td>{{ t.played }}</td>
          <td>{{ t.wins }}</td>
          <td>{{ t.draws }}</td>
          <td>{{ t.losses }}</td>
          <td>{{ t.goalsFor }}</td>
          <td>{{ t.goalsAgainst }}</td>
          <td class="wc-standings__pts">{{ t.points }}</td>
        </tr>
      </tbody>
    </table>
    <p class="wc-standings__hint">
      <template v-if="playerRank <= 2">✅ 小组出线！进入淘汰赛</template>
      <template v-else>❌ 小组未出线，世界杯之旅结束</template>
    </p>
    <button class="wc-standings__btn" @click="$emit('continue')">
      {{ playerRank <= 2 ? "进入淘汰赛" : "返回" }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  groupName: { type: String, default: "A" },
  standings: { type: Array, default: () => [] },
  playerRank: { type: Number, default: 1 },
});
defineEmits(["continue"]);
</script>

<style scoped>
.wc-standings {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  max-width: 500px;
  margin: 80px auto 0;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
.wc-standings__title {
  font-size: 18px;
  text-align: center;
  margin-bottom: 12px;
  color: #333;
}
.wc-standings__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.wc-standings__table th {
  background: #f5f5f5;
  padding: 6px 4px;
  text-align: center;
  font-size: 11px;
  color: #757575;
}
.wc-standings__table th:first-child {
  text-align: left;
  padding-left: 8px;
}
.wc-standings__table td {
  padding: 8px 4px;
  text-align: center;
  border-bottom: 1px solid #f0f0f0;
}
.wc-standings__table td:first-child {
  text-align: left;
  padding-left: 8px;
}
.wc-standings__team {
  display: flex;
  align-items: center;
  gap: 4px;
}
.wc-standings__emoji {
  font-size: 16px;
}
.wc-standings__pts {
  font-weight: bold;
}
.wc-standings__row--player {
  background: #fff8e1;
  font-weight: bold;
}
.wc-standings__row--advance td {
  border-left: 3px solid #4caf50;
}
.wc-standings__hint {
  text-align: center;
  margin-top: 12px;
  font-size: 14px;
  font-weight: bold;
  color: #333;
}
.wc-standings__btn {
  display: block;
  width: 100%;
  padding: 12px;
  margin-top: 12px;
  background: linear-gradient(135deg, #ff8f00, #e53935);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}
.wc-standings__btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(229, 57, 53, 0.4);
}
</style>
