// 模拟宇宙动态视觉层 — PIXI 粒子 / 伤害飘字 / 震屏 / 发牌轨迹 / 氛围
// 只做视觉：不依赖游戏逻辑，坐标由 UniShell 传入（DOM 元素中心 → canvas 坐标）

import { Application, Container, Graphics, Text } from "pixi.js";
import { ParticleSystem } from "../pixi/effects/ParticleSystem.js";
import gsap from "gsap";

const MAX_DPI = 2; // 移动端 3x 屏 GPU 过载，限制 2x（与经典模式一致）

/**
 * 模拟宇宙特效渲染器
 * 用法：await fx.init(canvas, w, h) → fx.burst(x,y,color) / fx.floatText(...) ...
 */
export class UniEffects {
  constructor() {
    this.app = null;
    this.particles = null; // 特效粒子
    this.ambient = null; // 常驻氛围粒子
    this.textLayer = null;
    this.flashLayer = null;
    this._ambientTimer = null;
    this._destroyed = false;
    this._queue = []; // init 未完成时的特效调用缓存（避免丢失开场伤害）
  }

  /** init 未就绪时缓存调用，就绪后重放 */
  _whenReady(fn) {
    if (this.app) fn();
    else this._queue.push(fn);
  }

  /** init 完成后重放缓存的调用 */
  _flush() {
    const q = this._queue;
    this._queue = [];
    for (const fn of q) {
      try { fn(); } catch { /* 重放失败忽略 */ }
    }
  }

  /** 初始化 PIXI Application（透明背景，覆盖战斗区，不拦截点击） */
  async init(canvas, width, height) {
    this.app = new Application();
    await this.app.init({
      canvas,
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, MAX_DPI),
      autoDensity: true,
    });
    this.app.stage.eventMode = "static";
    // 特效层不拦截 DOM 点击
    canvas.style.pointerEvents = "none";

    // 特效粒子层
    this.particles = new ParticleSystem(this.app.stage, 260);
    this.particles.attach(this.app.ticker);

    // 氛围尘埃层（独立系统，低密度常驻）
    this.ambient = new ParticleSystem(this.app.stage, 40);
    this.ambient.attach(this.app.ticker);

    // 飘字层
    this.textLayer = new Container();
    this.app.stage.addChild(this.textLayer);

    // 全屏闪光层
    this.flashLayer = new Graphics();
    this.flashLayer.rect(0, 0, width, height).fill(0xffffff);
    this.flashLayer.alpha = 0;
    this.flashLayer.interactive = false;
    this.app.stage.addChild(this.flashLayer);

    // 常驻氛围：每 700ms 在随机位置飘一粒微尘
    this._ambientTimer = setInterval(() => {
      if (this._destroyed || !this.app) return;
      this.ambient.emit(
        Math.random() * width,
        Math.random() * height,
        { color: 0xd8c89a, count: 1, speed: 6, spread: 40, lifetime: 3.2, size: 1.4, gravity: -4 },
      );
    }, 700);
    this._flush();
    return this;
  }

  /** 画布尺寸变化（战斗区 resize） */
  resize(width, height) {
    if (!this.app) return;
    this.app.renderer.resize(width, height);
    this.flashLayer.clear();
    this.flashLayer.rect(0, 0, width, height).fill(0xffffff);
  }

  /** 粒子爆发（打击/技能/护盾） */
  burst(x, y, opts = {}) {
    this._whenReady(() => this._burst(x, y, opts));
  }
  _burst(x, y, opts) {
    if (!this.particles) return;
    this.particles.emit(x, y, opts);
  }

  /**
   * 伤害/治疗飘字（上浮 + 淡出）
   * @param {string|number} text
   * @param {number} x
   * @param {number} y
   * @param {object} opts - { color, size, crit }
   */
  floatText(text, x, y, opts = {}) {
    this._whenReady(() => this._floatText(text, x, y, opts));
  }
  _floatText(text, x, y, opts) {
    if (!this.app) return;
    const { color = 0xffd9a0, size = 26, crit = false } = opts;
    const t = new Text({
      text: String(text),
      style: {
        fontFamily: "Georgia, serif",
        fontSize: crit ? size * 1.5 : size,
        fontWeight: "bold",
        fill: color,
        stroke: { color: 0x1a1008, width: 4 },
      },
    });
    t.anchor.set(0.5, 0.5);
    t.position.set(x, y);
    t.alpha = 0;
    this.textLayer.addChild(t);
    gsap.to(t, {
      y: y - (crit ? 56 : 40),
      alpha: 1,
      duration: 0.18,
      ease: "power1.out",
      onComplete: () => {
        gsap.to(t, { alpha: 0, y: t.y - 14, duration: 0.55, delay: 0.25, onComplete: () => t.destroy() });
      },
    });
  }

  /** 全屏闪光（击杀 / 首领狂暴） */
  flash(color = 0xffe9b8, alpha = 0.35, duration = 0.25) {
    this._whenReady(() => this._flash(color, alpha, duration));
  }
  _flash(color, alpha, duration) {
    if (!this.app) return;
    this.flashLayer.tint = color;
    gsap.to(this.flashLayer, { alpha, duration: 0.05, onComplete: () => {
      gsap.to(this.flashLayer, { alpha: 0, duration, delay: 0.05 });
    }});
  }

  /** 屏幕震动（受击反馈） */
  shake(intensity = 10, duration = 0.3) {
    this._whenReady(() => this._shake(intensity, duration));
  }
  _shake(intensity, duration) {
    if (!this.app) return;
    const stage = this.app.stage;
    gsap.killTweensOf(stage);
    const seq = [];
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      seq.push({
        x: (Math.random() - 0.5) * intensity * 2,
        y: (Math.random() - 0.5) * intensity * 2,
        duration: duration / steps,
        ease: "power1.out",
      });
    }
    seq.push({ x: 0, y: 0, duration: duration / steps, ease: "power1.out" });
    gsap.timeline()
      .to(stage, seq[0])
      .to(stage, seq[1]).to(stage, seq[2]).to(stage, seq[3]).to(stage, seq[4]).to(stage, seq[5])
      .to(stage, seq[6]);
  }

  /** 命中帧停（hitstop）：暂停 PIXI 渲染若干毫秒制造打击感 */
  hitstop(ms = 70) {
    this._whenReady(() => {
      if (!this.app) return;
      this.app.ticker.stop();
      setTimeout(() => this.app?.ticker.start(), ms);
    });
  }

  /** 冲击波圆环：从目标点扩散 */
  impactRing(x, y, color = 0xfff0c0, size = 30) {
    this._whenReady(() => {
      if (!this.app) return;
      const g = new Graphics();
      g.circle(0, 0, size).stroke({ width: 3, color });
      g.position.set(x, y);
      g.alpha = 0.9;
      this.app.stage.addChild(g);
      gsap.timeline()
        .to(g, { scale: 2.4, alpha: 0, duration: 0.32, ease: "power2.out", onComplete: () => g.destroy() });
    });
  }

  /** 目标点白闪（命中高光） */
  hitFlash(x, y, color = 0xffffff) {
    this._whenReady(() => {
      if (!this.app) return;
      const g = new Graphics();
      g.circle(0, 0, 16).fill(color);
      g.position.set(x, y);
      g.alpha = 0;
      this.app.stage.addChild(g);
      gsap.timeline()
        .to(g, { alpha: 0.85, scale: 1.6, duration: 0.06 })
        .to(g, { alpha: 0, scale: 2.2, duration: 0.18, onComplete: () => g.destroy() });
    });
  }

  /** 护盾/治疗增益飘字（绿色 / 蓝色，带 + 前缀） */
  gainFloat(text, x, y, color = 0x9fd0ff) {
    this.floatText(`+${text}`, x, y, { color, size: 22 });
  }

  /**
   * 发牌轨迹：从起点（牌堆）飞一个光点到目标
   * @param {{x:number,y:number}} from
   * @param {{x:number,y:number}} to
   * @param {number} color
   */
  deployCard(from, to, color = 0xf5eeda) {
    this._whenReady(() => this._deployCard(from, to, color));
  }
  _deployCard(from, to, color) {
    if (!this.app) return;
    const g = new Graphics();
    g.circle(0, 0, 7).fill(color);
    g.position.set(from.x, from.y);
    g.alpha = 0.9;
    this.app.stage.addChild(g);
    const mx = (from.x + to.x) / 2 + (Math.random() - 0.5) * 60;
    const my = Math.min(from.y, to.y) - 40;
    gsap.timeline()
      .to(g, { alpha: 1, duration: 0.05 })
      .to(g, {
        x: to.x,
        y: to.y,
        duration: 0.32,
        ease: "power2.out",
      })
      .to(g, { alpha: 0, scale: 0.4, duration: 0.15, onComplete: () => g.destroy() });
  }

  /** 销毁（组件卸载时调用） */
  destroy() {
    this._destroyed = true;
    if (this._ambientTimer) clearInterval(this._ambientTimer);
    this.ambient?.destroy();
    this.particles?.destroy();
    if (this.textLayer) {
      for (const c of [...this.textLayer.children]) c.destroy();
      this.textLayer.destroy();
    }
    if (this.flashLayer) this.flashLayer.destroy();
    this.app?.destroy(true, { children: true });
    this.app = null;
  }
}

/** 创建实例（供 UniShell 使用） */
export function createUniEffects() {
  return new UniEffects();
}
