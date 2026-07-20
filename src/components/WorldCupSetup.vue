<template>
  <div class="wc-setup">
    <div class="wc-setup__card">
      <div class="wc-setup__banner">🏆</div>
      <h2 class="wc-setup__title">世界杯模式</h2>
      <p class="wc-setup__desc">1v1 · 小组赛→淘汰赛 · 90回合制</p>

      <!-- 队名 -->
      <div class="wc-setup__row">
        <label>队名：</label>
        <input
          :value="teamName"
          @input="$emit('update:teamName', $event.target.value)"
          class="wc-setup__input"
          placeholder="输入你的队名"
          maxlength="12"
        />
      </div>

      <div class="wc-setup__row">
        <label>对手：</label>
        <label class="wc-setup__toggle">
          <input
            type="checkbox"
            :checked="useAI"
            @change="$emit('update:useAI', $event.target.checked)"
          />
          AI自动（关闭=手动操控对手）
        </label>
      </div>

      <div class="wc-setup__row" v-if="useAI">
        <label>AI难度：</label>
        <select
          class="wc-setup__select"
          :value="difficulty"
          @change="$emit('update:difficulty', $event.target.value)"
        >
          <option value="easy">简单</option>
          <option value="skilled">熟练</option>
          <option value="hell">地狱</option>
        </select>
      </div>

      <div class="wc-setup__row">
        <label>天气：</label>
        <label class="wc-setup__toggle">
          <input
            type="checkbox"
            :checked="useWeather"
            @change="$emit('update:useWeather', $event.target.checked)"
          />
          启用天气系统
        </label>
      </div>

      <!-- 小组信息 -->
      <div class="wc-setup__group-info">
        <h3>🇦 组（A组）</h3>
        <div class="wc-setup__group-list">
          <div class="wc-setup__group-team wc-setup__group-team--player">
            <span class="wc-setup__group-emoji">⭐</span>
            <span>{{ teamName || "你的队伍" }}</span>
          </div>
          <div v-for="(t, i) in aiTeams" :key="i" class="wc-setup__group-team">
            <span class="wc-setup__group-emoji">{{ t.emoji }}</span>
            <span>{{ t.name }}</span>
          </div>
        </div>
      </div>

      <!-- 首发角色选择 -->
      <div class="wc-setup__chars">
        <p class="triple-hint">💡 连续点击角色头像3次查看技能详情</p>
        <h3>选择首发角色：</h3>
        <div class="wc-setup__char-grid">
          <div
            v-for="char in chars"
            :key="char.id"
            class="char-card"
            :class="{ 'char-card--selected': selectedChar === char.id }"
            @click="onCharCardClick(char.id)"
          >
            <div class="char-card__img-wrap">
              <img
                v-if="char.icon"
                :src="char.icon"
                :alt="char.name"
                class="char-card__img"
              />
              <span v-else class="char-card__placeholder">{{ char.name }}</span>
            </div>
            <div class="char-card__info">
              <span class="char-card__name">{{ char.name }}</span>
              <span class="char-card__hp">HP {{ char.hp }}</span>
            </div>
            <div class="char-card__skill">
              {{ char.skillName }}
              <template v-if="char.skillType === 'passive'">（被动）</template>
              <template v-else>（{{ char.maxUses }}次）</template>
            </div>
          </div>
        </div>
      </div>

      <button
        class="wc-setup__btn"
        :disabled="!teamName.trim() || !selectedChar"
        @click="$emit('start')"
      >
        开始世界杯之旅 ⚽
      </button>
    </div>
  </div>

  <!-- 技能详情弹窗 -->
  <Transition name="popup-fade">
    <div
      v-if="popupChar"
      class="skill-overlay"
      @click.self="skillPopupCharId = null"
    >
      <div class="skill-modal">
        <button class="skill-modal__close" @click="skillPopupCharId = null">
          ✕
        </button>
        <div class="skill-modal__header">
          <img
            v-if="popupChar.icon"
            :src="popupChar.icon"
            :alt="popupChar.name"
            class="skill-modal__icon"
          />
          <div class="skill-modal__title-group">
            <h3 class="skill-modal__name">{{ popupChar.name }}</h3>
            <span class="skill-modal__title">{{ popupChar.title }}</span>
          </div>
        </div>
        <div class="skill-modal__body">
          <div class="skill-modal__skill-row">
            <span class="skill-modal__skill-name">{{
              popupChar.skillName
            }}</span>
            <span class="skill-modal__skill-type">{{
              popupChar.skillType === "passive" ? "被动技能" : "主动技能"
            }}</span>
          </div>
          <p class="skill-modal__desc">{{ popupChar.skillDesc }}</p>
          <div class="skill-modal__stat">
            <span>❤️ HP {{ popupChar.hp }}</span>
            <span v-if="popupChar.skillType === 'active'">
              ⚡
              {{
                popupChar.id === "caiyueang"
                  ? "读档3次"
                  : popupChar.maxUses + "次"
              }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref } from "vue";
import { CHARACTERS } from "../game/constants.js";
import { AI_TEAM_NAMES, TEAM_EMOJIS } from "../game/worldCupConstants.js";

const props = defineProps({
  teamName: { type: String, default: "" },
  selectedChar: { type: String, default: "" },
  aiTeamNames: { type: Array, default: () => [] },
  useAI: { type: Boolean, default: true },
  useWeather: { type: Boolean, default: false },
  difficulty: { type: String, default: "easy" },
});

const emit = defineEmits([
  "update:teamName",
  "update:selectedChar",
  "update:useAI",
  "update:useWeather",
  "update:difficulty",
  "start",
]);

const chars = CHARACTERS;

const aiTeams = computed(() =>
  props.aiTeamNames.map((name) => ({
    name,
    emoji: TEAM_EMOJIS[AI_TEAM_NAMES.indexOf(name)] || "🏳️",
  })),
);

// ---- 三连击技能详情 ----
const skillPopupCharId = ref(null);
const clickTracker = ref({});

const popupChar = computed(() =>
  skillPopupCharId.value
    ? chars.find((c) => c.id === skillPopupCharId.value)
    : null,
);

function onCharCardClick(charId) {
  // 三连击检测
  const now = Date.now();
  const track = clickTracker.value[charId] || { count: 0, lastTime: 0 };
  if (now - track.lastTime > 500) {
    track.count = 1;
  } else {
    track.count += 1;
  }
  track.lastTime = now;
  clickTracker.value[charId] = track;

  if (track.count >= 3) {
    track.count = 0;
    // 切换/关闭弹窗
    skillPopupCharId.value = skillPopupCharId.value === charId ? null : charId;
    return; // 不触发选择
  }

  // 正常选择角色
  emit("update:selectedChar", charId);
}
</script>

<style scoped>
.wc-setup {
  display: flex;
  justify-content: center;
  padding: 16px;
}
.wc-setup__card {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  max-width: 700px;
  width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
.wc-setup__banner {
  font-size: 48px;
  text-align: center;
  margin-bottom: 4px;
}
.wc-setup__title {
  font-size: 22px;
  text-align: center;
  margin-bottom: 4px;
  background: linear-gradient(135deg, #ff8f00, #e53935);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.wc-setup__desc {
  text-align: center;
  color: #757575;
  font-size: 13px;
  margin-bottom: 16px;
}
.wc-setup__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.wc-setup__row label {
  font-size: 14px;
  font-weight: bold;
  min-width: 50px;
}
.wc-setup__input {
  flex: 1;
  padding: 8px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s;
}
.wc-setup__input:focus {
  border-color: #e53935;
}
.wc-setup__select {
  flex: 1;
  padding: 8px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.2s;
}
.wc-setup__select:focus {
  border-color: #e53935;
}
.wc-setup__group-info {
  background: #f5f5f5;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 16px;
}
.wc-setup__group-info h3 {
  font-size: 14px;
  margin-bottom: 8px;
  color: #333;
}
.wc-setup__group-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wc-setup__group-team {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #fff;
  border-radius: 6px;
  font-size: 14px;
}
.wc-setup__group-team--player {
  border: 2px solid #e53935;
  font-weight: bold;
}
.wc-setup__group-emoji {
  font-size: 18px;
}
.wc-setup__chars h3 {
  font-size: 14px;
  margin-bottom: 8px;
  color: #333;
}
.wc-setup__char-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.char-card {
  width: 130px;
  background: #fff;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s;
  flex: 1 0 110px;
  max-width: 150px;
  min-width: 100px;
}
.char-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-color: #90caf9;
}
.char-card--selected {
  border-color: #e53935;
  box-shadow:
    0 0 0 2px rgba(229, 57, 53, 0.3),
    0 4px 12px rgba(0, 0, 0, 0.15);
}
.char-card__img-wrap {
  width: 100%;
  aspect-ratio: 13/15;
  max-height: 130px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
}
.char-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.char-card__placeholder {
  font-size: 16px;
  font-weight: bold;
  color: #9e9e9e;
}
.char-card__info {
  padding: 4px 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.char-card__name {
  font-size: 12px;
  font-weight: bold;
}
.char-card__hp {
  font-size: 11px;
  color: #e53935;
  font-weight: bold;
}
.char-card__skill {
  font-size: 10px;
  color: #757575;
  padding: 0 8px 6px;
  line-height: 1.3;
}
.wc-setup__btn {
  display: block;
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #ff8f00, #e53935);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 17px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}
.wc-setup__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.wc-setup__btn:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(229, 57, 53, 0.4);
}
@media (max-width: 500px) {
  .wc-setup {
    padding: 8px;
  }
  .wc-setup__card {
    padding: 14px;
  }
  .char-card {
    flex: 1 0 75px;
    max-width: 110px;
    min-width: 70px;
  }
}

/* 三连击提示 */
.triple-hint {
  text-align: center;
  font-size: 12px;
  color: #9e9e9e;
  margin-bottom: 4px;
}

/* 技能详情弹窗 */
.skill-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.skill-modal {
  background: #1a1a2e;
  border-radius: 14px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
  color: #e0e0e0;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  position: relative;
}
.skill-modal__close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  color: #9e9e9e;
  font-size: 20px;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}
.skill-modal__close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.skill-modal__header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}
.skill-modal__icon {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.15);
}
.skill-modal__title-group {
  flex: 1;
}
.skill-modal__name {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
  margin: 0;
}
.skill-modal__title {
  font-size: 13px;
  color: #ffab00;
  display: block;
  margin-top: 2px;
}
.skill-modal__body {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 14px;
}
.skill-modal__skill-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.skill-modal__skill-name {
  font-size: 16px;
  font-weight: bold;
  color: #64b5f6;
}
.skill-modal__skill-type {
  font-size: 11px;
  color: #9e9e9e;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
}
.skill-modal__desc {
  font-size: 13px;
  line-height: 1.7;
  color: #cfcfcf;
  margin-bottom: 14px;
}
.skill-modal__stat {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #bdbdbd;
}

/* 弹窗过渡 */
.popup-fade-enter-active {
  transition: opacity 0.25s ease;
}
.popup-fade-leave-active {
  transition: opacity 0.2s ease;
}
.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
}
</style>
