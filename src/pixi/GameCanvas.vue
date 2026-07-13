<template>
  <div class="game-canvas" ref="wrapperRef">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, inject } from 'vue'
import { PIXIManager } from './core/PIXIManager.js'

const props = defineProps({
  state: { type: Object, required: true }
})

const wrapperRef = ref(null)
const canvasRef = ref(null)
const pixiKey = Symbol('pixi')

let manager = null
let resizeObserver = null

onMounted(async () => {
  manager = new PIXIManager()
  await manager.init(canvasRef.value)

  // 初始构建场景
  manager.buildScene(props.state.players, props.state.deck.length)

  // 窗口大小自适应
  resizeObserver = new ResizeObserver(() => {
    if (wrapperRef.value && manager) {
      const rect = wrapperRef.value.getBoundingClientRect()
      manager.resize(rect.width, rect.height)
    }
  })
  resizeObserver.observe(wrapperRef.value)

  // 通过 provide 暴露 manager（需要在 setup 中）
  // 这里改用 emit 通知父组件
})

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect()
  if (manager) manager.destroy()
})

// 暴露 manager 给父组件使用
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
