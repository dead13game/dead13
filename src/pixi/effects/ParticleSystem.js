import { Graphics, Container } from "pixi.js";

/**
 * 轻量粒子系统 — 基于 Graphics.circle() + 逐帧更新
 * 粒子上限可控，适合卡牌游戏的特效需求
 */
export class ParticleSystem {
  constructor(container, maxParticles = 150) {
    this.container = container;
    this.max = maxParticles;
    this.particles = [];
    this._ticker = null;
  }

  /** 连接到 PIXI Application ticker */
  attach(ticker) {
    this._ticker = ticker;
    ticker.add(this._update, this);
  }

  detach() {
    if (this._ticker) {
      this._ticker.remove(this._update, this);
      this._ticker = null;
    }
  }

  /**
   * 在指定位置发射粒子
   * @param {number} x
   * @param {number} y
   * @param {object} opts - { color, count, speed, spread, lifetime, size, gravity }
   */
  emit(x, y, opts = {}) {
    const {
      color = 0xffd54f,
      count = 15,
      speed = 200,
      spread = 180,
      lifetime = 0.8,
      size = 4,
      gravity = 300,
    } = opts;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.max) {
        // 回收最老的粒子
        const old = this.particles.shift();
        this.container.removeChild(old.g);
        old.g.destroy();
      }

      const g = new Graphics();
      g.circle(0, 0, size * (0.5 + Math.random()));
      g.fill(color);
      g.position.set(x, y);
      this.container.addChild(g);

      const angle = (Math.random() - 0.5) * spread * (Math.PI / 180);
      const spd = speed * (0.5 + Math.random());
      this.particles.push({
        g,
        vx: Math.cos(angle) * spd * (Math.random() - 0.5),
        vy: -Math.random() * spd,
        life: lifetime * (0.7 + Math.random() * 0.3),
        maxLife: lifetime,
        gravity: gravity * (0.8 + Math.random() * 0.4),
      });
    }
  }

  /** 每帧更新 */
  _update(ticker) {
    const dt = ticker.deltaMS / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += p.gravity * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.life -= dt;
      p.g.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.container.removeChild(p.g);
        p.g.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  /** 清除所有粒子 */
  clear() {
    for (const p of this.particles) {
      this.container.removeChild(p.g);
      p.g.destroy();
    }
    this.particles = [];
  }

  destroy() {
    this.detach();
    this.clear();
  }
}
