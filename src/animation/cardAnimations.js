import gsap from 'gsap'

/**
 * 卡牌动画工具 — GSAP 补间直接操作 PixiJS 对象属性
 * PixiJS Container 的 x/y/alpha/scale 均为可读写属性，GSAP 可直接驱动
 */

/** 卡牌从当前位置飞到目标点 */
export function flyTo(sprite, toX, toY, duration = 0.5, ease = 'back.out(1.2)') {
  return gsap.to(sprite, { x: toX, y: toY, duration, ease })
}

/** 卡牌从起始点飞到目标点（先跳到起点再飞） */
export function flyFromTo(sprite, fromX, fromY, toX, toY, duration = 0.5, ease = 'back.out(1.2)') {
  sprite.x = fromX
  sprite.y = fromY
  sprite.alpha = 0.3
  sprite.scale.set(0.6)
  return gsap.to(sprite, {
    x: toX, y: toY,
    alpha: 1,
    scaleX: 1, scaleY: 1,
    duration,
    ease
  })
}

/** 翻转卡牌（通过 scale.x 模拟） */
export function flipToFront(sprite, duration = 0.4) {
  return gsap.timeline()
    .to(sprite.scale, {
      x: 0,
      duration: duration * 0.4,
      ease: 'power2.in',
      onComplete: () => {
        if (sprite.faceUp !== undefined) {
          sprite.faceUp = true
          sprite._updateDisplay()
        }
      }
    })
    .to(sprite.scale, {
      x: 1,
      duration: duration * 0.6,
      ease: 'back.out(1.4)'
    })
}

/** 弹出（从 0 放大到 1） */
export function popIn(sprite, duration = 0.35) {
  sprite.scale.set(0)
  return gsap.to(sprite.scale, { x: 1, y: 1, duration, ease: 'back.out(1.7)' })
}

/** 淡出 + 缩小 */
export function fadeOutSmall(sprite, duration = 0.3) {
  return gsap.to(sprite, {
    alpha: 0, scaleX: 0.3, scaleY: 0.3,
    duration, ease: 'power2.in'
  })
}

/** 抖动（受击反馈） */
export function shake(sprite, intensity = 5, duration = 0.25) {
  const ox = sprite.x, oy = sprite.y
  const tl = gsap.timeline()
  for (let i = 0; i < 3; i++) {
    tl.to(sprite, { x: ox + intensity, duration: duration / 6, ease: 'power2.inOut' })
    tl.to(sprite, { x: ox - intensity, duration: duration / 6, ease: 'power2.inOut' })
  }
  tl.to(sprite, { x: ox, y: oy, duration: duration / 6 })
  return tl
}

/** 闪白（受伤反馈） */
export function flash(sprite, duration = 0.4) {
  return gsap.fromTo(sprite, { alpha: 0.35 }, { alpha: 1, duration, ease: 'power2.out' })
}
