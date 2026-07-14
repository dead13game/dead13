<template>
  <canvas ref="canvasRef" class="pixi-canvas" :class="{ 'pixi-canvas--scroll': scrollMode }" :style="canvasStyle"></canvas>
</template>

<script setup>
import { ref, shallowRef, computed, onMounted, onBeforeUnmount } from 'vue'
import { PIXIManager } from './core/PIXIManager.js'

const props = defineProps({
  state: { type: Object, required: true }
})

const canvasRef = ref(null)
const manager = shallowRef(null)
const scrollMode = ref(false)
const scrollH = ref(0)

// 当前 canvas 应该用的尺寸
function currentSize() {
  if (scrollMode.value) {
    return { w: window.innerWidth, h: scrollH.value }
  }
  return { w: window.innerWidth, h: window.innerHeight }
}

const canvasStyle = computed(() => {
  if (scrollMode.value) return { height: scrollH.value + 'px' }
  return {}
})

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
  const neededH = totalH + h  // 加一整屏高度，最后一行能滚到底部 UI 栏上方
  if (w < h && neededH > h) {
    scrollH.value = neededH
    scrollMode.value = true
    mgr.resize(w, neededH)
  }

  // 窗口缩放（保持滚动高度）
  resizeObserver = new ResizeObserver(() => {
    const size = currentSize()
    if (mgr) mgr.resize(size.w, size.h)
  })
  resizeObserver.observe(document.body)

  manager.value = mgr

  // 首帧后自动重排
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (scrollMode.value) {
        mgr.resize(window.innerWidth, scrollH.value)
      }
      mgr.rebuildLayout()
    })
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

/* 竖屏溢出：relative 占文档流 + 允许触屏纵向滚动 */
.pixi-canvas--scroll {
  position: relative;
  width: 100%;
  touch-action: pan-y;
}
</style>
