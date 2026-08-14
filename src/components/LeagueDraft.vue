<template>
  <div class="league-draft">
    <div class="league-draft__card">
      <h2>⚔️ 3v3 选人</h2>
      <p class="league-draft__info">
        {{
          draftStage === "player"
            ? "你的回合：选择第 " + (playerPicks.length + 1) + " 名角色"
            : "对手正在选择..."
        }}
      </p>

      <!-- 双方已选角色 -->
      <div class="league-draft__teams">
        <div class="draft-team draft-team--player">
          <h4>⭐ {{ playerTeamName }}（你的队伍）</h4>
          <div class="draft-team__chars">
            <div
              v-for="(charId, i) in playerPicks"
              :key="'p' + i"
              class="draft-char-tag draft-char-tag--player"
            >
              {{ getCharName(charId) }}
            </div>
            <div
              v-if="playerPicks.length === 0"
              class="draft-char-tag draft-char-tag--empty"
            >
              待选择...
            </div>
          </div>
        </div>
        <div class="draft-vs">VS</div>
        <div class="draft-team draft-team--opponent">
          <h4>{{ opponentTeamName }}</h4>
          <div class="draft-team__chars">
            <div
              v-for="(charId, i) in opponentPicks"
              :key="'o' + i"
              class="draft-char-tag draft-char-tag--opponent"
            >
              {{ getCharName(charId) }}
            </div>
            <div
              v-if="opponentPicks.length === 0 && draftStage !== 'done'"
              class="draft-char-tag draft-char-tag--empty"
            >
              待选择...
            </div>
          </div>
        </div>
      </div>

      <!-- 角色选择网格 -->
      <div class="league-draft__chars" v-if="draftStage !== 'done'">
        <h4>选择角色：</h4>
        <div class="draft-char-grid">
          <div
            v-for="char in availableChars"
            :key="char.id"
            class="draft-char-card"
            :class="{ 'draft-char-card--taken': isCharTaken(char.id) }"
            @click="
              draftStage === 'player' &&
              !isCharTaken(char.id) &&
              onPickChar(char.id)
            "
          >
            <span class="draft-char-card__emoji">{{ char.emoji || "👤" }}</span>
            <span class="draft-char-card__name">{{ char.name }}</span>
            <span class="draft-char-card__hp">HP:{{ char.hp }}</span>
          </div>
        </div>
      </div>

      <!-- 选人完成 -->
      <div v-if="draftStage === 'done'" class="league-draft__done">
        <p>选人完成！准备开始比赛</p>
        <button class="league-draft__start-btn" @click="onStartMatch">
          ⚔️ 开始比赛
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import SoundManager from "../audio/SoundManager.js";
import { CHARACTERS } from "../game/constants.js";

const props = defineProps({
  playerTeamName: { type: String, default: "你的队伍" },
  opponentTeamName: { type: String, default: "对手" },
});

const emit = defineEmits(["draftComplete"]);

// 选人状态
const playerPicks = ref([]);
const opponentPicks = ref([]);
const draftStage = ref("player"); // 'player' | 'opponent' | 'done'

const allChars = Object.values(CHARACTERS).filter((c) => c.id !== 12); // 开发者角色仅模拟宇宙可选
const availableChars = computed(() => allChars);

function isCharTaken(charId) {
  return (
    playerPicks.value.includes(charId) || opponentPicks.value.includes(charId)
  );
}

function getCharName(charId) {
  return CHARACTERS[charId]?.name || "???";
}

function onPickChar(charId) {
  if (draftStage.value !== "player" || isCharTaken(charId)) return;

  SoundManager.play("click"); // 选角点击音效
  playerPicks.value.push(charId);

  if (playerPicks.value.length >= 3) {
    // 玩家选完3个，AI自动补选
    aiPickAll();
    draftStage.value = "done";
    emit("draftComplete", {
      playerChars: [...playerPicks.value],
      opponentChars: [...opponentPicks.value],
    });
    return;
  }
  // AI选一个
  draftStage.value = "opponent";
  setTimeout(() => {
    aiPickOne();
    draftStage.value = "player";
  }, 400);
}

// 开始比赛（选角点击音效）
function onStartMatch() {
  SoundManager.play("click");
  emit("startMatch");
}

function aiPickOne() {
  const remaining = allChars.filter((c) => !isCharTaken(c.id));
  if (remaining.length > 0) {
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    opponentPicks.value.push(pick.id);
  }
}

function aiPickAll() {
  while (opponentPicks.value.length < 3) {
    aiPickOne();
  }
}

/** 获取最终选人结果 */
function getDraftResult() {
  return {
    playerChars: [...playerPicks.value],
    opponentChars: [...opponentPicks.value],
  };
}

defineExpose({ getDraftResult });
</script>

<style scoped>
.league-draft {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 20px;
  min-height: 100vh;
}
.league-draft__card {
  background: rgba(10, 15, 40, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 24px 28px;
  max-width: 680px;
  width: 100%;
  color: #e0e0e0;
}
.league-draft__card h2 {
  text-align: center;
  margin: 0 0 4px;
}
.league-draft__info {
  text-align: center;
  color: #ffd700;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
}

/* 双方已选 */
.league-draft__teams {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.draft-team {
  flex: 1;
}
.draft-team h4 {
  font-size: 13px;
  margin: 0 0 8px;
}
.draft-team--player h4 {
  color: #4fc3f7;
}
.draft-team--opponent h4 {
  color: #ef5350;
}
.draft-vs {
  font-size: 20px;
  font-weight: 800;
  color: #ffd700;
  padding-top: 20px;
}
.draft-team__chars {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.draft-char-tag {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
}
.draft-char-tag--player {
  background: rgba(79, 195, 247, 0.18);
  border: 1px solid rgba(79, 195, 247, 0.4);
  color: #4fc3f7;
}
.draft-char-tag--opponent {
  background: rgba(239, 83, 80, 0.18);
  border: 1px solid rgba(239, 83, 80, 0.4);
  color: #ef5350;
}
.draft-char-tag--empty {
  background: rgba(255, 255, 255, 0.04);
  color: #666;
  border: 1px dashed rgba(255, 255, 255, 0.1);
}

/* 角色选择网格 */
.league-draft__chars h4 {
  font-size: 13px;
  margin: 0 0 10px;
}
.draft-char-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.draft-char-card {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 10px 6px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
}
.draft-char-card:hover:not(.draft-char-card--taken) {
  background: rgba(255, 255, 255, 0.14);
  transform: translateY(-2px);
}
.draft-char-card--taken {
  opacity: 0.3;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.02);
}
.draft-char-card__emoji {
  font-size: 22px;
  display: block;
}
.draft-char-card__name {
  font-size: 12px;
  font-weight: 600;
  display: block;
  margin-top: 2px;
}
.draft-char-card__hp {
  font-size: 10px;
  color: #888;
  display: block;
  margin-top: 1px;
}

.league-draft__done {
  text-align: center;
  padding: 20px 0;
}
.league-draft__done p {
  font-size: 16px;
  margin-bottom: 14px;
}
.league-draft__start-btn {
  padding: 14px 40px;
  background: linear-gradient(135deg, #1a6b3c, #0d4a25);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}
.league-draft__start-btn:hover {
  background: linear-gradient(135deg, #1e8a4d, #135e30);
}
</style>
