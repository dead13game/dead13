<template>
  <canvas ref="canvasRef" class="pixi-canvas"></canvas>
</template>

<script setup>
import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue'
import { PIXIManager } from './core/PIXIManager.js'

const props = defineProps({
  state: { type: Object, required: true }
})

const canvasRef = ref(null)
const manager = shallowRef(null)

let resizeObserver = null

onMounted(async () => {
  const canvas = canvasRef.value
  // 初始尺寸匹配视口
  const w = window.innerWidth
  const h = window.innerHeight

  const mgr = new PIXIManager()
  await mgr.init(canvas, { width: w, height: h })

  // 初始构建场景
  mgr.buildScene(props.state.players, props.state.deck.length)

  // 窗口缩放
  resizeObserver = new ResizeObserver(() => {
    const rw = window.innerWidth
    const rh = window.innerHeight
    if (mgr) mgr.resize(rw, rh)
  })
  resizeObserver.observe(document.body)

  manager.value = mgr
})

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect()
  if (manager.value) manager.value.destroy()
})

defineExpose({ manager })
</script>

<style scoped>
.pixi-canvas {
  display: block;
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
}
</style>
