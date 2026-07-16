<template>
  <div class="wc-sub">
    <div class="wc-sub__header">
      <h3>🔄 {{ subTitle }}</h3>
      <span class="wc-sub__remaining">剩余 {{ subsLeft }} 次</span>
    </div>
    <p class="wc-sub__current">
      当前：<strong>{{ currentCharName }}</strong>
    </p>
    <div class="wc-sub__grid">
      <div
        v-for="char in availableChars"
        :key="char.id"
        class="wc-sub__char"
        :class="{
          'wc-sub__char--selected': picked === char.id,
          'wc-sub__char--current': char.id === currentCharId,
          'wc-sub__char--blocked': char.id === opponentCharId,
        }"
        @click="char.id !== opponentCharId && (picked = char.id)"
      >
        <div class="wc-sub__char-img-wrap">
          <img
            v-if="char.icon"
            :src="char.icon"
            :alt="char.name"
            class="wc-sub__char-img"
          />
          <span v-else>{{ char.name }}</span>
        </div>
        <span class="wc-sub__char-name">{{ char.name }}</span>
        <span
          v-if="char.id === opponentCharId"
          class="wc-sub__char-blocked-hint"
          >对手使用中</span
        >
        <span class="wc-sub__char-hp">HP {{ char.hp }}</span>
      </div>
    </div>
    <div class="wc-sub__actions">
      <button
        class="wc-sub__btn wc-sub__btn--confirm"
        :disabled="
          !picked || picked === currentCharId || picked === opponentCharId
        "
        @click="$emit('confirm', picked)"
      >
        确认换人
      </button>
      <button class="wc-sub__btn wc-sub__btn--skip" @click="$emit('skip')">
        跳过换人
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { CHARACTERS } from "../game/constants.js";

const props = defineProps({
  currentCharId: { type: String, required: true },
  currentCharName: { type: String, default: "" },
  opponentCharId: { type: String, default: "" },
  subsLeft: { type: Number, default: 3 },
  subTitle: { type: String, default: "换人" },
});

defineEmits(["confirm", "skip"]);

const picked = ref("");

// 所有可用角色（排除当前角色）
const availableChars = CHARACTERS;
</script>

<style scoped>
.wc-sub {
  background: #1a1a2e;
  border-radius: 16px;
  padding: 16px;
  color: #fff;
  max-width: 500px;
  width: 100%;
}
.wc-sub__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.wc-sub__header h3 {
  font-size: 16px;
  margin: 0;
}
.wc-sub__remaining {
  font-size: 12px;
  color: #ffd54f;
}
.wc-sub__current {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 12px;
}
.wc-sub__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 16px;
}
.wc-sub__char {
  width: 80px;
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 6px;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
}
.wc-sub__char:hover {
  background: rgba(255, 255, 255, 0.15);
}
.wc-sub__char--selected {
  border-color: #ffd54f;
  background: rgba(255, 213, 79, 0.15);
}
.wc-sub__char--current {
  border-color: rgba(255, 255, 255, 0.2);
  opacity: 0.5;
  cursor: default;
}
.wc-sub__char--blocked {
  border-color: #ef5350;
  opacity: 0.5;
  cursor: not-allowed;
}
.wc-sub__char-blocked-hint {
  display: block;
  font-size: 9px;
  color: #ef5350;
  margin-top: 2px;
}
.wc-sub__char-img-wrap {
  width: 60px;
  height: 70px;
  overflow: hidden;
  border-radius: 4px;
  margin: 0 auto 4px;
  background: #333;
}
.wc-sub__char-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.wc-sub__char-name {
  display: block;
  font-size: 11px;
  font-weight: bold;
}
.wc-sub__char-hp {
  display: block;
  font-size: 10px;
  color: #ef5350;
}
.wc-sub__actions {
  display: flex;
  gap: 8px;
}
.wc-sub__btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.15s;
}
.wc-sub__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.wc-sub__btn--confirm {
  background: linear-gradient(135deg, #ffd54f, #ff8f00);
  color: #1a1a2e;
}
.wc-sub__btn--confirm:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 143, 0, 0.3);
}
.wc-sub__btn--skip {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}
.wc-sub__btn--skip:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
