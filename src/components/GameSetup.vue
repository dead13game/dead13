<template>
  <div class="app__start">
    <div class="start-card">
      <div class="start-card__icon"></div>
      <h2 class="start-card__title">选角开战</h2>
      <p class="start-card__desc">2-8人 · 选择神明角色 · 活到最后</p>

      <div class="start-card__setup">
        <div class="setup-row">
          <label>玩家人数：</label>
          <select
            :value="playerCount"
            @change="$emit('update:playerCount', Number($event.target.value))"
            class="setup-select"
          >
            <option v-for="n in 7" :key="n" :value="n + 1">
              {{ n + 1 }} 人
            </option>
          </select>
        </div>

        <div class="setup-row">
          <label>天气系统：</label>
          <label class="toggle-label">
            <input
              type="checkbox"
              :checked="useWeather"
              @change="$emit('update:useWeather', $event.target.checked)"
            />
            启用
          </label>
        </div>

        <p class="triple-hint">💡 连续点击角色头像3次查看技能详情</p>

        <div v-for="i in playerCount" :key="'setup-' + i" class="setup-player">
          <div class="setup-player__header">
            <label>玩家 {{ i }}</label>
            <input
              :value="playerNames[i - 1]"
              @input="$emit('update:playerName', i - 1, $event.target.value)"
              class="setup-input"
              :placeholder="'玩家 ' + i"
              maxlength="10"
            />
          </div>
          <div class="setup-player__chars">
            <div
              v-for="char in availableChars(i - 1)"
              :key="char.id"
              class="char-card"
              :class="{ 'char-card--selected': playerChars[i - 1] === char.id }"
              @click="onCharCardClick(i - 1, char.id)"
            >
              <div class="char-card__img-wrap">
                <img
                  v-if="char.icon"
                  :src="char.icon"
                  :alt="char.name"
                  class="char-card__img"
                />
                <span v-else class="char-card__placeholder">{{
                  char.name
                }}</span>
              </div>
              <div class="char-card__info">
                <span class="char-card__name">{{ char.name }}</span>
                <span class="char-card__hp">HP {{ char.hp }}</span>
              </div>
            </div>
          </div>
          <div v-if="playerChars[i - 1]" class="setup-player__skill">
            技能：{{ charById(playerChars[i - 1])?.skillName }}
            <template
              v-if="charById(playerChars[i - 1])?.skillType === 'passive'"
              >（被动）</template
            >
            <template
              v-else-if="charById(playerChars[i - 1])?.id === 'caiyueang'"
              >（读档3次）</template
            >
            <template v-else
              >（{{ charById(playerChars[i - 1])?.maxUses }}次）</template
            >
          </div>

          <div class="ai-controls">
            <label class="ai-toggle">
              <input
                type="checkbox"
                :checked="aiSlots[i - 1]"
                @change="
                  $emit(
                    'update:aiSlots',
                    aiSlots.map((v, j) => (j === i - 1 ? !v : v)),
                  )
                "
              />
              <span>AI</span>
            </label>
            <select
              v-if="aiSlots[i - 1]"
              :value="aiDifficulties[i - 1]"
              @change="
                $emit(
                  'update:aiDifficulties',
                  aiDifficulties.map((v, j) =>
                    j === i - 1 ? $event.target.value : v,
                  ),
                )
              "
              class="ai-difficulty-select"
            >
              <option value="easy">简单</option>
              <option value="skilled">熟练</option>
              <option value="hell">地狱</option>
            </select>
          </div>
        </div>
      </div>

      <button
        class="start-btn"
        :disabled="!allSelected"
        @click="$emit('startGame')"
      >
        开始游戏
      </button>

      <div class="start-card__rules">
        <details>
          <summary>快速规则 v2.0</summary>
          <div class="rules-content">
            <p><strong>目标</strong>：活到最后一人。</p>
            <p><strong>角色</strong>：7位神明，固定血量和专属技能。</p>
            <p><strong>行动</strong>：攻击/防御/赌命/释放技能。</p>
            <p><strong>和平</strong>：第1-2回合不能攻击。</p>
            <p><strong>行动顺序</strong>：按当前血量从小到大。</p>
            <p><strong>段位</strong>：可选积分系统（未来扩展）。</p>
          </div>
        </details>
      </div>
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

defineProps({
  playerCount: { type: Number, required: true },
  playerNames: { type: Array, required: true },
  playerChars: { type: Array, required: true },
  useWeather: { type: Boolean, default: false },
  allSelected: { type: Boolean, default: false },
  availableChars: { type: Function, required: true },
  aiSlots: {
    type: Array,
    default: () => [false, false, false, false, false, false, false, false],
  },
  aiDifficulties: {
    type: Array,
    default: () => [
      "easy",
      "easy",
      "easy",
      "easy",
      "easy",
      "easy",
      "easy",
      "easy",
    ],
  },
});

const emit = defineEmits([
  "update:playerCount",
  "update:useWeather",
  "update:playerName",
  "selectChar",
  "startGame",
  "update:aiSlots",
  "update:aiDifficulties",
]);

const charMap = computed(() => {
  const map = {};
  CHARACTERS.forEach((c) => {
    map[c.id] = c;
  });
  return map;
});
function charById(id) {
  return charMap.value[id];
}

// ---- 三连击技能详情 ----
const skillPopupCharId = ref(null);
const clickTracker = ref({});

const popupChar = computed(() =>
  skillPopupCharId.value ? charById(skillPopupCharId.value) : null,
);

function onCharCardClick(playerIdx, charId) {
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
  emit("selectChar", playerIdx, charId);
}
</script>

<style scoped>
.app__start {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.start-card {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  max-width: 700px;
  width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
@media (min-width: 500px) {
  .start-card {
    padding: 24px;
  }
}
.start-card__icon {
  font-size: 48px;
  text-align: center;
  margin-bottom: 4px;
}
.start-card__title {
  font-size: 20px;
  text-align: center;
  margin-bottom: 4px;
}
.start-card__desc {
  text-align: center;
  color: #757575;
  font-size: 13px;
  margin-bottom: 16px;
}

.setup-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.setup-row label {
  font-size: 13px;
  color: #616161;
  min-width: 80px;
  text-align: right;
}
.toggle-label {
  font-size: 13px;
  color: #616161;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.setup-select,
.setup-input {
  padding: 6px 10px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}
.setup-select:focus,
.setup-input:focus {
  border-color: #1976d2;
}
.setup-select {
  flex: 0;
  min-width: 72px;
}
.setup-input {
  flex: 1;
}

.setup-player {
  background: #f5f5f5;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
}
.setup-player__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.setup-player__header label {
  font-weight: bold;
  font-size: 13px;
  min-width: 60px;
}
.setup-player__chars {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
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
@media (hover: hover) {
  .char-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-color: #90caf9;
  }
}
.char-card--selected {
  border-color: #1976d2;
  box-shadow:
    0 0 0 2px rgba(25, 118, 210, 0.3),
    0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(-3px);
}
.char-card__img-wrap {
  width: 100%;
  aspect-ratio: 13/15;
  max-height: 150px;
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
  font-size: 18px;
  font-weight: bold;
  color: #9e9e9e;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.char-card__info {
  padding: 6px 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #eee;
}
.char-card__name {
  font-size: 13px;
  font-weight: bold;
}
.char-card__hp {
  font-size: 12px;
  color: #e53935;
  font-weight: bold;
}
.setup-player__skill {
  font-size: 11px;
  color: #616161;
  margin-top: 4px;
  padding-left: 2px;
}

.start-btn {
  display: block;
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #e53935, #d32f2f);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 12px;
}
.start-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
@media (hover: hover) {
  .start-btn:not(:disabled):hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(229, 57, 53, 0.4);
  }
}

.start-card__rules {
  font-size: 13px;
}
.start-card__rules summary {
  cursor: pointer;
  color: #1976d2;
  font-weight: bold;
  font-size: 13px;
}
.rules-content {
  margin-top: 8px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  line-height: 1.7;
}
.rules-content p {
  color: #616161;
  font-size: 12px;
}

.ai-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.ai-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
}
.ai-difficulty-select {
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #555;
  background: #333;
  color: #fff;
}

/* 移动端：角色卡片更紧凑，4 张/行 */
@media (max-width: 500px) {
  .app__start {
    padding: 8px;
  }
  .start-card {
    padding: 12px;
    border-radius: 12px;
  }
  .start-card__title {
    font-size: 17px;
  }
  .start-card__desc {
    font-size: 11px;
    margin-bottom: 12px;
  }
  .setup-player {
    padding: 8px;
  }
  .setup-player__chars {
    gap: 6px;
  }
  .char-card {
    flex: 1 0 75px;
    max-width: 110px;
    min-width: 70px;
    border-radius: 8px;
    border-width: 1.5px;
  }
  .char-card__img-wrap {
    aspect-ratio: 3/4;
    max-height: 100px;
  }
  .char-card__name {
    font-size: 11px;
  }
  .char-card__hp {
    font-size: 10px;
  }
  .char-card__info {
    padding: 4px 6px;
  }
  .char-card__placeholder {
    font-size: 14px;
  }
  .setup-row label {
    min-width: 60px;
    font-size: 12px;
  }
}

/* 三连击提示 */
.triple-hint {
  text-align: center;
  font-size: 12px;
  color: #9e9e9e;
  margin-bottom: 8px;
  padding: 4px 0;
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
