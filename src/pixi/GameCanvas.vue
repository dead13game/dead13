<template>
  <div class="game-canvas" ref="wrapperRef">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup>
import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue'
import { PIXIManager } from './core/PIXIManager.js'

const props = defineProps({
  state: { type: Object, required: true }
})

const wrapperRef = ref(null)
const canvasRef = ref(null)
const manager = shallowRef(null)

let resizeObserver = null

onMounted(async () => {
  const mgr = new PIXIManager()
  await mgr.init(canvasRef.value)

  // 初始构建场景
  mgr.buildScene(props.state.players, props.state.deck.length)

  // 窗口大小自适应
  resizeObserver = new ResizeObserver(() => {
    if (wrapperRef.value && mgr) {
      const rect = wrapperRef.value.getBoundingClientRect()
      mgr.resize(rect.width, rect.height)
    }
  })
  resizeObserver.observe(wrapperRef.value)

  // 将实例写入 ref，父组件通过 defineExpose 即可访问
  manager.value = mgr
})

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect()
  if (manager.value) manager.value.destroy()
})

defineExpose({ manager })
</script>

<style scoped>
.game-canvas {
  width: 100%;
  height: 100%;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
