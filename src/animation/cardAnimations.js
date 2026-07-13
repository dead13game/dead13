import gsap from 'gsap'

/**
 * 卡牌动画工具 — 注意：PixiJS scale 通过 sprite.scale.x / sprite.scale.y 访问
 */

/** 飞到目标点 + 放大（并行） */
export function flyFromTo(sprite, fromX, fromY, toX, toY, duration = 0.5, ease = 'back.out(1.2)') {
  sprite.x = fromX
  sprite.y = fromY
  sprite.alpha = 0.3
  sprite.scale.set(0.5)
  const tl = gsap.timeline()
  tl.to(sprite, { x: toX, y: toY, alpha: 1, duration, ease }, 0)
  tl.to(sprite.scale, { x: 1, y: 1, duration, ease }, 0)
  return tl
}

/** 翻转（scale.x: 1→0→1，中间切换面） */
export function flipToFront(sprite, duration = 0.4) {
  return gsap.timeline()
    .to(sprite.scale, {
      x: 0, duration: duration * 0.45, ease: 'power2.in',
      onComplete: () => {
        sprite.faceUp = true
        if (sprite._updateDisplay) sprite._updateDisplay()
      }
    })
    .to(sprite.scale, {
      x: 1, duration: duration * 0.55, ease: 'back.out(1.3)'
    })
}

/** 弹出 scale(0→1) */
export function popIn(sprite, duration = 0.35) {
  sprite.scale.set(0)
  return gsap.to(sprite.scale, { x: 1, y: 1, duration, ease: 'back.out(1.7)' })
}

/** 淡出 + 缩到 scale(0.3) */
export function fadeOutSmall(sprite, duration = 0.35) {
  const tl = gsap.timeline()
  tl.to(sprite, { alpha: 0, duration, ease: 'power2.in' }, 0)
  tl.to(sprite.scale, { x: 0.3, y: 0.3, duration, ease: 'power2.in' }, 0)
  return tl
}

/** 弹出（先设 scale=0，再飞到 1）+ alpha 淡入 */
export function popAndFadeIn(sprite, duration = 0.4) {
  sprite.scale.set(0.3)
  sprite.alpha = 0
  return gsap.timeline()
    .to(sprite, { alpha: 1, duration }, 0)
    .to(sprite.scale, { x: 1, y: 1, duration, ease: 'back.out(1.5)' }, 0)
}

/** 抖动 */
export function shake(sprite, intensity = 4, duration = 0.2) {
  const ox = sprite.x, oy = sprite.y
  return gsap.timeline()
    .to(sprite, { x: ox + intensity, duration: 0.05, ease: 'power2.inOut' })
    .to(sprite, { x: ox - intensity, duration: 0.05, ease: 'power2.inOut' })
    .to(sprite, { x: ox + intensity / 2, duration: 0.04, ease: 'power2.inOut' })
    .to(sprite, { x: ox, duration: 0.04, ease: 'power2.inOut' })
}

/** 闪白 */
export function flash(sprite, duration = 0.4) {
  return gsap.fromTo(sprite, { alpha: 0.25 }, { alpha: 1, duration, ease: 'power2.out' })
}
