<template>
  <canvas ref="canvasRef" class="pixi-canvas" :class="{ 'pixi-canvas--scroll': scrollMode }" :style="scrollMode ? { height: scrollH + 'px' } : {}"></canvas>
</template>

<script setup>
import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue'
import { PIXIManager } from './core/PIXIManager.js'

const props = defineProps({
  state: { type: Object, required: true }
})

const canvasRef = ref(null)
const manager = shallowRef(null)
const scrollMode = ref(false)
const scrollH = ref(0)

let resizeObserver = null

onMounted(async () => {
  const canvas = canvasRef.value
  const w = window.innerWidth
  const h = window.innerHeight

  const mgr = new PIXIManager()
  await mgr.init(canvas, { width: w, height: h })
  mgr.buildScene(props.state.players, props.state.deck.length)

  // 竖屏内容溢出 → canvas 加高，页面可滚动
  const totalH = mgr.layout?.totalHeight || h
  const bottomBarH = 200 // 底部 UI 栏预留高度
  const neededH = totalH + bottomBarH
  if (w < h && neededH > h) {
    mgr.resize(w, neededH)
    scrollMode.value = true
    scrollH.value = neededH
  }

  // 窗口缩放
  resizeObserver = new ResizeObserver(() => {
    const rw = window.innerWidth
    const rh = window.innerHeight
    if (mgr) mgr.resize(rw, rh)
  })
  resizeObserver.observe(document.body)

  manager.value = mgr

  // 首帧后自动重排
  requestAnimationFrame(() => {
    requestAnimationFrame(() => mgr.rebuildLayout())
  })
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
  z-index: 1;
  pointer-events: none;
}

/* 竖屏溢出：canvas 改为 absolute，页面可滚动 */
.pixi-canvas--scroll {
  position: absolute;
  height: auto;
}
</style>
