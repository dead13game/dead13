<template>
  <Transition name="opening">
    <div v-if="visible" class="opening" @click="skip">
      <video
        ref="videoRef"
        class="opening__video"
        src="/amine.mp4"
        autoplay
        muted
        playsinline
        webkit-playsinline
        preload="auto"
        @ended="onEnd"
        @loadeddata="onReady"
        @error="onEnd"
      />
      <div class="opening__hint" v-if="ready">点击任意位置跳过</div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted } from "vue";

const emit = defineEmits(["done"]);
const videoRef = ref(null);
const visible = ref(true);
const ready = ref(false);

function onReady() {
  ready.value = true;
}

function onEnd() {
  visible.value = false;
  setTimeout(() => emit("done"), 600);
}

function skip() {
  if (!ready.value) return;
  visible.value = false;
  setTimeout(() => emit("done"), 600);
}

onMounted(() => {
  // 超时保护（视频 13 秒 + 缓冲余量）
  setTimeout(() => {
    if (visible.value) {
      visible.value = false;
      setTimeout(() => emit("done"), 600);
    }
  }, 15000);
});
</script>

<style scoped>
.opening {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.opening__video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.opening__hint {
  position: absolute;
  bottom: max(40px, env(safe-area-inset-bottom, 40px));
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  animation: hintPulse 2s ease-in-out infinite;
}

/* 移动端：增大跳过提示，避开底部安全区 */
@media (max-width: 500px) {
  .opening__hint {
    bottom: max(60px, calc(env(safe-area-inset-bottom, 40px) + 20px));
    font-size: 16px;
    padding: 12px 24px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 24px;
  }
}
@keyframes hintPulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

.opening-enter-active {
  transition: opacity 0.6s;
}
.opening-leave-active {
  transition: opacity 0.8s;
}
.opening-enter-from {
  opacity: 0;
}
.opening-leave-to {
  opacity: 0;
}
</style>
