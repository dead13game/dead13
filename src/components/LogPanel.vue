<template>
  <div class="log-panel" ref="logRef">
    <div class="log-title"> 战报</div>
    <div class="log-entries">
      <div v-for="(msg, idx) in messages" :key="idx" class="log-entry">{{ msg }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  messages: { type: Array, required: true }
})

const logRef = ref(null)

watch(() => props.messages.length, async () => {
  await nextTick()
  if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight
})
</script>

<style scoped>
.log-panel {
  background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; padding: 10px; max-height: 160px; overflow-y: auto; font-size: 11px;
  color: rgba(255,255,255,0.7);
}
.log-title { font-weight: bold; margin-bottom: 4px; color: rgba(255,255,255,0.5); }
.log-entry { line-height: 1.5; }

/* 移动端：压缩日志区高度 */
@media (max-width: 500px) {
  .log-panel {
    max-height: 80px;
    padding: 6px 8px;
    font-size: 10px;
  }
  .log-title { font-size: 10px; }
  .log-entry { line-height: 1.3; }
}

</style>
