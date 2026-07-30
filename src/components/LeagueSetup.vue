<template>
  <div class="league-setup">
    <div class="league-setup__card">
      <div class="league-setup__banner">🏅</div>
      <h2 class="league-setup__title">联赛模式</h2>
      <p class="league-setup__desc">10队双循环 · 18轮 · 3v3对战</p>

      <!-- 球队选择 -->
      <div class="league-setup__row">
        <label>选择球队：</label>
      </div>
      <div class="league-setup__teams">
        <div
          v-for="team in teams"
          :key="team.id"
          class="league-team-card"
          :class="{
            'league-team-card--selected': selectedTeamId === team.id,
            'league-team-card--tier1': team.tier === 1,
            'league-team-card--tier2': team.tier === 2,
            'league-team-card--tier3': team.tier === 3,
          }"
          @click="$emit('update:selectedTeamId', team.id)"
        >
          <span class="league-team-card__emoji">{{ team.emoji }}</span>
          <span class="league-team-card__name">{{ team.name }}</span>
          <span class="league-team-card__tier">{{ tierLabel(team.tier) }}</span>
        </div>
      </div>

      <!-- 等级说明 -->
      <div class="league-setup__tier-info">
        <div class="tier-info-item tier-info-item--1">
          🏆 一流球队（争冠级）：曼城、利物浦、阿森纳、曼联
        </div>
        <div class="tier-info-item tier-info-item--2">
          ⚔️ 二流球队（欧战级）：切尔西、热刺、纽卡斯尔联
        </div>
        <div class="tier-info-item tier-info-item--3">
          🛡️ 末流球队（保级级）：埃弗顿、西汉姆联、狼队
        </div>
      </div>

      <!-- 卡牌加成说明 -->
      <div class="league-setup__bonus-info" v-if="selectedTeamId">
        <h4>📋 卡牌加成规则</h4>
        <ul>
          <li>一流 vs 二流：一流攻击牌+2</li>
          <li>一流 vs 末流：一流攻击牌+2 防御牌+2</li>
          <li>二流 vs 末流：二流攻击牌+2</li>
          <li>同等级：无加成</li>
          <li>主场：攻击牌额外+1</li>
        </ul>
      </div>

      <!-- AI难度 -->
      <div class="league-setup__row">
        <label>AI难度：</label>
        <select
          class="league-setup__select"
          :value="difficulty"
          @change="$emit('update:difficulty', $event.target.value)"
        >
          <option value="easy">简单</option>
          <option value="skilled">熟练</option>
          <option value="hell">地狱</option>
        </select>
      </div>

      <!-- 开始按钮 -->
      <button
        class="league-setup__start"
        :disabled="!selectedTeamId"
        @click="$emit('start')"
      >
        ⚽ 开始联赛
      </button>
      <p v-if="!selectedTeamId" class="league-setup__hint">请先选择一支球队</p>
    </div>
  </div>
</template>

<script setup>
import { LEAGUE_TEAMS, TIER_LABELS } from "../game/leagueConstants.js";

defineProps({
  selectedTeamId: { type: Number, default: null },
  difficulty: { type: String, default: "skilled" },
});

defineEmits(["update:selectedTeamId", "update:difficulty", "start"]);

const teams = LEAGUE_TEAMS.filter(Boolean); // 去掉 null 占位

function tierLabel(tier) {
  return TIER_LABELS[tier] || "";
}
</script>

<style scoped>
.league-setup {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 20px;
  min-height: 100vh;
}
.league-setup__card {
  background: rgba(10, 15, 40, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 28px 32px;
  max-width: 720px;
  width: 100%;
  color: #e0e0e0;
}
.league-setup__banner {
  font-size: 48px;
  text-align: center;
}
.league-setup__title {
  text-align: center;
  font-size: 24px;
  margin: 8px 0;
}
.league-setup__desc {
  text-align: center;
  color: #888;
  font-size: 13px;
  margin-bottom: 20px;
}

.league-setup__row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 14px 0;
}
.league-setup__row label {
  font-weight: 600;
  font-size: 14px;
}
.league-setup__select {
  background: rgba(255, 255, 255, 0.08);
  color: #e0e0e0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 14px;
}

/* 球队卡片网格 */
.league-setup__teams {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin: 16px 0;
}
.league-team-card {
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 12px 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}
.league-team-card:hover {
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-2px);
}
.league-team-card--selected {
  border-color: #ffd700;
  background: rgba(255, 215, 0, 0.12);
  box-shadow: 0 0 12px rgba(255, 215, 0, 0.3);
}
.league-team-card--tier1 {
  border-left: 3px solid #ffd700;
}
.league-team-card--tier2 {
  border-left: 3px solid #c0c0c0;
}
.league-team-card--tier3 {
  border-left: 3px solid #cd7f32;
}
.league-team-card__emoji {
  font-size: 24px;
  display: block;
}
.league-team-card__name {
  font-size: 13px;
  font-weight: 600;
  display: block;
  margin-top: 4px;
}
.league-team-card__tier {
  font-size: 10px;
  color: #999;
  display: block;
  margin-top: 2px;
}

/* 等级说明 */
.league-setup__tier-info {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 10px 14px;
  margin: 14px 0;
  font-size: 12px;
  line-height: 1.7;
}
.tier-info-item--1 {
  color: #ffd700;
}
.tier-info-item--2 {
  color: #c0c0c0;
}
.tier-info-item--3 {
  color: #cd7f32;
}

/* 加成说明 */
.league-setup__bonus-info {
  background: rgba(100, 180, 255, 0.08);
  border: 1px solid rgba(100, 180, 255, 0.2);
  border-radius: 8px;
  padding: 10px 14px;
  margin: 14px 0;
  font-size: 12px;
}
.league-setup__bonus-info h4 {
  margin: 0 0 6px;
}
.league-setup__bonus-info ul {
  margin: 0;
  padding-left: 18px;
}
.league-setup__bonus-info li {
  margin: 2px 0;
}

.league-setup__start {
  display: block;
  width: 100%;
  padding: 14px;
  margin-top: 20px;
  background: linear-gradient(135deg, #1a6b3c, #0d4a25);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.league-setup__start:hover:not(:disabled) {
  background: linear-gradient(135deg, #1e8a4d, #135e30);
  transform: translateY(-1px);
}
.league-setup__start:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.league-setup__hint {
  text-align: center;
  color: #ff9800;
  font-size: 12px;
  margin-top: 8px;
}
</style>
