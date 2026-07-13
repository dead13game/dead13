import { watch, ref } from 'vue'
import gsap from 'gsap'

/**
 * 动画流 — 集中管理所有游戏动画
 *
 * 自动监听（state 变化触发）：
 *   攻击抽牌 → 牌库飞到中央 + 翻转
 *   攻击结束 → 飞入墓地
 *   防御被击穿 → 抖动 + 粒子
 *   HP 下降 → 闪白 + 粒子
 *   HP 归零 → 死亡爆炸
 *   技能使用 → 角色专属粒子
 *
 * 手动调用（在 game action 之前）：
 *   flyToTarget(idx) → 攻击牌飞向目标
 *   defenseDraw(idx) → 防御牌飞到防御区
 *   gambleDraw() → 赌命牌飞到中央展示
 */
export function useAnimationFlow(state, getManager) {
  const animating = ref(false)

  // ── 辅助 ──
  function mgr() { return getManager() }

  function deckWorld() {
    const d = mgr()?.layout?.deckPos
    return d || { x: 450, y: 350 }
  }
  function centerWorld() {
    const c = mgr()?.layout?.centerPos
    return c || { x: 450, y: 240 }
  }
  function graveWorld() {
    const g = mgr()?.layout?.gravePos
    return g || { x: 520, y: 380 }
  }
  function playerWorld(idx) {
    const p = mgr()?.getPlayerCenter(idx)
    return p || { x: 200 + idx * 240, y: 180 }
  }
  function playerTopRight(idx) {
    // 防御区大致位置（玩家桌面右上角）
    const p = mgr()?.layout?.getPlayerPos(idx)
    const s = mgr()?.layout?.playerTableSize
    return { x: (p?.x || 0) + (s?.width || 210) - 30, y: (p?.y || 0) + 80 }
  }

  // ════════════════════════════════════
  //  自动监听 — state 变化触发
  // ════════════════════════════════════

  // 攻击抽牌展示
  watch(
    () => state.step,
    (step, old) => {
      if (step === 'attackShowCard' && old === 'pickAction') _animDrawAttack()
    }
  )

  // 攻击牌清空 → 飞入墓地
  watch(
    () => state.pendingAttackCard,
    (card, old) => {
      if (!card && old && state.step === 'pickAction') _animToGrave()
    }
  )

  // 赌命展示
  watch(
    () => state.step,
    (step, old) => {
      if (step === 'gamblePick' && old === 'pickAction') _animGambleShow()
    }
  )

  // 防御被击穿
  watch(
    () => state.players.map(p => p.defensePile.length),
    (a, b) => {
      if (!b) return
      state.players.forEach((p, i) => {
        if (b[i] !== undefined && a[i] < b[i]) _defHit(i)
      })
    }
  )

  // HP 下降
  watch(
    () => state.players.map(p => p.hp),
    (a, b) => {
      if (!b) return
      state.players.forEach((p, i) => {
        if (b[i] !== undefined && a[i] < b[i]) {
          if (a[i] <= 0) _death(i)
          else _hurt(i)
        }
      })
    }
  )

  // 技能使用
  watch(
    () => state.players.map(p => p.skillUses),
    (a, b) => {
      if (!b) return
      state.players.forEach((p, i) => {
        if (b[i] !== undefined && a[i] < b[i]) _skillFx(i, p.characterId)
      })
    }
  )

  // ════════════════════════════════════
  //  动画实现
  // ════════════════════════════════════

  /** 攻击抽牌：牌库 → 中央弹出 + 翻转 */
  async function _animDrawAttack() {
    const m = mgr()
    if (!m) return
    animating.value = true
    await waitFrame(2)

    const cp = centerWorld()
    const children = [...(m.centerContainer?.children || [])]
    for (let i = 0; i < children.length; i++) {
      const s = children[i]
      const delay = i * 0.08
      // 弹出
      gsap.to(s, { alpha: 1, scaleX: 1, scaleY: 1, duration: 0.35, delay, ease: 'back.out(1.6)' })
      // 翻转（先缩到0换面再展开）
      gsap.to(s.scale, { x: 0, duration: 0.18, delay: delay + 0.4, ease: 'power2.in',
        onComplete() { s.faceUp = true; s._updateDisplay() } })
      gsap.to(s.scale, { x: 1, duration: 0.22, delay: delay + 0.58, ease: 'back.out(1.3)' })
    }
    // 等翻转完成
    await sleep((children.length - 1) * 80 + 850)
    animating.value = false
  }

  /** 攻击牌飞入墓地 */
  async function _animToGrave() {
    const m = mgr()
    if (!m) return
    animating.value = true
    await waitFrame(1)

    const gp = graveWorld()
    for (const s of [...(m.centerContainer?.children || [])]) {
      gsap.to(s, { x: gp.x - (m.centerContainer?.x || 0),
                    y: gp.y - (m.centerContainer?.y || 0),
                    alpha: 0, scaleX: 0.3, scaleY: 0.3,
                    duration: 0.4, ease: 'power2.in' })
    }
    await sleep(420)
    m.centerContainer?.removeChildren()
    animating.value = false
  }

  /** 赌命牌展示 */
  async function _animGambleShow() {
    const m = mgr()
    if (!m || !state.pendingGamble) return
    animating.value = true
    await waitFrame(2)

    // 赌命的抽牌存在 pendingGamble.drawnCards 中，但它们在 Vue 中渲染
    // 这里只做粒子效果示意
    const cp = centerWorld()
    m.emitParticles(cp.x + 32, cp.y + 48, 'trap')
    await sleep(300)
    animating.value = false
  }

  /** 防御被击穿 */
  function _defHit(idx) {
    const m = mgr()
    if (!m) return
    const t = m.getPlayerTable(idx)
    if (t) {
      const ox = t.x, oy = t.y
      gsap.timeline()
        .to(t, { x: ox + 5, duration: 0.07, ease: 'power2.inOut' })
        .to(t, { x: ox - 5, duration: 0.07, ease: 'power2.inOut' })
        .to(t, { x: ox + 3, duration: 0.05, ease: 'power2.inOut' })
        .to(t, { x: ox, duration: 0.05, ease: 'power2.inOut' })
    }
    const pos = playerWorld(idx)
    m.emitParticles(pos.x, pos.y + 20, 'shield')
  }

  /** 受伤 */
  function _hurt(idx) {
    const m = mgr()
    if (!m) return
    const t = m.getPlayerTable(idx)
    if (t) gsap.fromTo(t, { alpha: 0.3 }, { alpha: 1, duration: 0.4, ease: 'power2.out' })
    const pos = playerWorld(idx)
    m.emitParticles(pos.x, pos.y + 20, 'hit')
  }

  /** 死亡 */
  function _death(idx) {
    const m = mgr()
    if (!m) return
    const pos = playerWorld(idx)
    // 大爆炸粒子
    m.emitParticles(pos.x, pos.y, 'hit')
    m.emitParticles(pos.x - 20, pos.y, 'hit')
    m.emitParticles(pos.x + 20, pos.y, 'hit')
    // 桌面淡出
    const t = m.getPlayerTable(idx)
    if (t) gsap.to(t, { alpha: 0.3, duration: 0.6, ease: 'power2.in' })
  }

  /** 技能特效 */
  function _skillFx(idx, charId) {
    const m = mgr()
    if (!m) return
    const pos = playerWorld(idx)
    m.emitParticles(pos.x, pos.y, 'draw', charId)
  }

  // ════════════════════════════════════
  //  手动调用 — 在 game action 之前
  // ════════════════════════════════════

  /**
   * 攻击牌飞向目标 → 完成后调用 callback 执行攻击
   * 调用时机：用户选择攻击目标后
   */
  async function flyToTarget(targetIdx) {
    const m = mgr()
    if (!m) return
    animating.value = true
    await waitFrame(1)

    const tp = playerWorld(targetIdx)
    const sprites = [...(m.centerContainer?.children || [])]

    for (const s of sprites) {
      // 计算世界坐标 → 容器内偏移
      const wx = (m.centerContainer?.x || 0) + s.x
      const wy = (m.centerContainer?.y || 0) + s.y
      gsap.to(s, {
        x: tp.x - (m.centerContainer?.x || 0),
        y: tp.y - (m.centerContainer?.y || 0),
        scaleX: 0.6, scaleY: 0.6,
        duration: 0.45, ease: 'power2.in'
      })
    }

    await sleep(480)
    // 命中粒子
    m.emitParticles(tp.x, tp.y, 'hit')
    m.centerContainer?.removeChildren()
    animating.value = false
  }

  /**
   * 防御抽牌 → 牌从牌库飞到防御区
   * 调用时机：用户点击防御按钮后，executeDefense 之前
   */
  async function defenseDraw(playerIdx) {
    const m = mgr()
    if (!m) return
    animating.value = true
    await waitFrame(1)

    const dp = deckWorld()
    const tp = playerTopRight(playerIdx)

    // 创建临时飞行牌
    const { Graphics } = await import('pixi.js')
    const temp = new Graphics()
    temp.roundRect(0, 0, 64, 96, 8)
    temp.fill(0x1a237e)
    temp.stroke({ width: 2, color: 0x0d1b5e })
    temp.position.set(dp.x, dp.y)
    temp.scale.set(0.6)
    temp.alpha = 0.8
    m.app.stage.addChild(temp)

    gsap.to(temp, {
      x: tp.x, y: tp.y,
      scaleX: 0.35, scaleY: 0.35,
      alpha: 0,
      duration: 0.45, ease: 'power2.in'
    })

    await sleep(480)
    m.app.stage.removeChild(temp)
    temp.destroy()
    animating.value = false
  }

  /**
   * 赌命抽牌 → 牌从牌库飞到中央
   * 调用时机：用户点击赌命按钮后，executeGamble 之前
   */
  async function gambleDraw() {
    const m = mgr()
    if (!m) return
    animating.value = true
    await waitFrame(1)

    const dp = deckWorld()
    const cp = centerWorld()
    const { Graphics } = await import('pixi.js')

    // 2-3张牌依次飞出
    const count = 2 + (state.currentWeather === 'wind' ? 1 : 0)
    for (let i = 0; i < count; i++) {
      const temp = new Graphics()
      temp.roundRect(0, 0, 64, 96, 8)
      temp.fill(0xffffff)
      temp.stroke({ width: 2, color: 0xdddddd })
      temp.position.set(dp.x, dp.y)
      temp.scale.set(0.4)
      temp.alpha = 0
      m.app.stage.addChild(temp)

      gsap.to(temp, {
        x: cp.x + i * 80 - (count - 1) * 40,
        y: cp.y,
        scaleX: 1, scaleY: 1,
        alpha: 1,
        duration: 0.4, delay: i * 0.1,
        ease: 'back.out(1.4)',
        onComplete() {
          temp.destroy()
        }
      })
      await sleep(120)
    }

    await sleep(400)
    animating.value = false
  }

  return { animating, flyToTarget, defenseDraw, gambleDraw }
}

// ── 工具 ──
function waitFrame(n = 1) {
  return new Promise(r => {
    let c = 0
    const t = () => { if (++c >= n) r(); else requestAnimationFrame(t) }
    requestAnimationFrame(t)
  })
}
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}
