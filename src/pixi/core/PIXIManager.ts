import { Application, Container, Graphics } from "pixi.js";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "./constants.js";
import { TableLayout } from "../layout/TableLayout.js";
import { DeckSprite } from "../entities/DeckSprite.js";
import { PlayerTableSprite } from "../entities/PlayerTableSprite.js";
import { CardSprite } from "../entities/CardSprite.js";
import { ParticleSystem } from "../effects/ParticleSystem.js";
import { GENERIC_EFFECTS, SKILL_EFFECTS } from "../effects/SkillEffects.js";
import type { Card } from "../../game/types.js";
import type { PlayerView } from "../../game/view.js";

/** PIXIManager.init 的可选项 */
export interface PIXIManagerOptions {
  width?: number;
  height?: number;
}

declare global {
  interface Window {
    /** PIXI Application 调试句柄：供 Playwright/控制台读取内部状态 */
    __PIXI_APP__?: Application;
  }
}

/**
 * PixiJS 管理器 — Application 生命周期 + 场景树 + 粒子
 */
export class PIXIManager {
  app: Application | null;
  layout: TableLayout | null;
  deck: DeckSprite | null;
  playerTables: PlayerTableSprite[];
  centerContainer: Container | null;
  particles: ParticleSystem | null;
  _pendingCard: CardSprite | null;
  _stars: Graphics | null;
  _options: PIXIManagerOptions;

  constructor() {
    this.app = null;
    this.layout = null;
    this.deck = null;
    this.playerTables = [];
    // 场景容器在 buildScene() 里创建（桥接层用可选链访问，null 与 undefined 等价）
    this.centerContainer = null;
    this.particles = null;
    this._pendingCard = null;
    this._stars = null;
    this._options = {};
  }

  /** 初始化 PIXI Application */
  async init(
    canvas: HTMLCanvasElement,
    options: PIXIManagerOptions = {},
  ): Promise<void> {
    this._options = options;
    const app = new Application();
    this.app = app;
    await app.init({
      canvas,
      width: options.width || CANVAS_WIDTH,
      height: options.height || CANVAS_HEIGHT,
      backgroundColor: 0x1a1a2e, // 稍亮的背景，区别于 CSS 背景
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2), // 移动端限制2x防止GPU过载
      autoDensity: true,
    });

    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;

    // 暴露 PIXI Application 到 window，供 Playwright/调试工具读取内部状态
    window.__PIXI_APP__ = app;

    // 星空背景
    this._createStarfield();

    // 粒子系统
    this.particles = new ParticleSystem(app.stage, 200);
    this.particles.attach(app.ticker);
  }

  /** 创建星空背景 */
  _createStarfield(): void {
    const app = this.app;
    // 只在 init() 之后调用；这里的判空仅用于类型收窄
    if (!app) return;

    // 移除旧星空
    if (this._stars) {
      app.stage.removeChild(this._stars);
      this._stars.destroy();
    }
    const w = app.renderer.width;
    const h = app.renderer.height;
    const stars = new Graphics();
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = Math.random() * 1.5 + 0.5;
      const alpha = Math.random() * 0.4 + 0.1;
      stars.circle(x, y, r);
      stars.fill({ color: 0xffffff, alpha });
    }
    this._stars = stars;
    app.stage.addChildAt(stars, 0);
  }

  /** 根据当前游戏状态构建场景 */
  buildScene(players: PlayerView[], deckCount: number): void {
    if (!this.app) return;
    const app = this.app;

    // 清空 stage（但保留星空背景层）
    const stars = this._stars;
    app.stage.removeChildren();
    if (stars) app.stage.addChild(stars);

    // 布局 — 使用 canvas 实际 CSS 像素尺寸（autoDensity 已处理 DPR 缩放）
    const logicalW = app.renderer.width;
    const logicalH = app.renderer.height;
    const layout = new TableLayout(players.length, logicalW, logicalH);
    this.layout = layout;

    // 牌库精灵
    const deck = new DeckSprite("牌库");
    const dp = layout.deckPos;
    deck.position.set(dp.x, dp.y);
    deck.setCount(deckCount);
    app.stage.addChild(deck);
    this.deck = deck;

    // 各玩家桌面
    this.playerTables = [];
    players.forEach((player, i) => {
      const pos = layout.getPlayerPos(i);
      const table = new PlayerTableSprite(player, layout);
      table.position.set(pos.x, pos.y);
      table.sync(player);
      app.stage.addChild(table);
      this.playerTables.push(table);
    });

    console.log("[pixi] scene built", {
      players: players.length,
      deckCount,
      width: logicalW,
      height: logicalH,
      portrait: logicalW < logicalH,
      tableSize: layout.playerTableSize,
      tables: this.playerTables.length,
    });

    // 桌中央（攻击牌展示位）
    const centerContainer = new Container();
    centerContainer.position.set(layout.centerPos.x, layout.centerPos.y);
    app.stage.addChild(centerContainer);
    this.centerContainer = centerContainer;
  }

  /** 更新单个玩家 */
  updatePlayer(index: number, player: PlayerView, isCurrent: boolean): void {
    const table = this.playerTables[index];
    if (table) {
      table.sync(player);
      table.setCurrent(isCurrent);
      table.setAlive(player.alive);
    }
  }

  /** 更新所有玩家 */
  updateAllPlayers(players: PlayerView[], currentIndex: number): void {
    if (this.playerTables.length !== players.length) {
      this.buildScene(players, this.deck?.count || 0);
      return;
    }
    players.forEach((p, i) => {
      this.updatePlayer(i, p, i === currentIndex);
    });
  }

  /** 更新牌库数量 */
  updateDeckCount(count: number): void {
    if (this.deck) this.deck.setCount(count);
  }

  /** 在桌中央展示攻击牌（初始放在牌库位置供动画飞行） */
  showCenterCard(cardData: Card | null, extraCards: Card[] = []): void {
    // buildScene() 之后 centerContainer 必然存在，`!` 仅做类型收窄
    const center = this.centerContainer!;
    center.removeChildren();
    this._pendingCard = null;

    // 牌库和中央的世界坐标差
    const dp = this.layout?.deckPos || { x: 450, y: 350 };
    const cp = this.layout?.centerPos || { x: 450, y: 240 };
    // 将牌放在牌库位置（相对于 centerContainer 的偏移）
    const ox = dp.x - cp.x;
    const oy = dp.y - cp.y;

    const makeSprite = (c: Card, offsetX = 0): CardSprite => {
      const sprite = new CardSprite(c, { showValue: false });
      sprite.position.set(ox + offsetX, oy);
      sprite.faceUp = false; // 先背面
      sprite._updateDisplay();
      sprite.scale.set(0.4);
      sprite.alpha = 0;
      center.addChild(sprite);
      return sprite;
    };

    if (extraCards.length > 0) {
      extraCards.forEach((c, i) => {
        const sprite = makeSprite(c, i * 40 - 20);
        if (i === 0) this._pendingCard = sprite;
      });
    } else if (cardData) {
      this._pendingCard = makeSprite(cardData);
    }
  }

  /** 隐藏桌中央的卡牌 */
  hideCenterCard(): void {
    // buildScene() 之后 centerContainer 必然存在，`!` 仅做类型收窄
    this.centerContainer!.removeChildren();
    this._pendingCard = null;
  }

  /** 获取桌中央卡牌精灵（用于 GSAP 动画） */
  get pendingCardSprite(): CardSprite | null {
    return this._pendingCard;
  }

  /** 获取指定玩家的桌面容器 */
  getPlayerTable(index: number): PlayerTableSprite | undefined {
    return this.playerTables[index];
  }

  /** 窗口大小变化 */
  resize(w: number, h: number): void {
    if (this.app) {
      this.app.renderer.resize(w, h);
      if (this.layout) {
        this.layout.resize(w, h);
        this._relayout();
      }
    }
  }

  /** 强制重建布局：用当前视口尺寸 resize + 重新摆放所有元素 */
  rebuildLayout(): void {
    if (!this.app) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.app.renderer.resize(w, h);
    if (this.layout) {
      this.layout.resize(w, h);
      this._relayout();
    }
  }

  /** 根据当前布局重新摆放元素 */
  _relayout(): void {
    if (!this.layout) return;
    const layout = this.layout;

    // 牌库
    const dp = layout.deckPos;
    if (this.deck) this.deck.position.set(dp.x, dp.y);

    // 玩家桌面
    this.playerTables.forEach((table, i) => {
      const pp = layout.getPlayerPos(i);
      table.position.set(pp.x, pp.y);
    });

    // 中央
    const cp = layout.centerPos;
    if (this.centerContainer) this.centerContainer.position.set(cp.x, cp.y);
  }

  /** 触发粒子效果 */
  emitParticles(
    x: number,
    y: number,
    effectKey: string,
    characterId: number | null = null,
  ): void {
    if (!this.particles) return;
    let config = GENERIC_EFFECTS[effectKey] || GENERIC_EFFECTS.hit;
    if (characterId && SKILL_EFFECTS[characterId]) {
      config = SKILL_EFFECTS[characterId][effectKey] || config;
    }
    this.particles.emit(x, y, config);
  }

  /** 获取玩家桌面中心坐标 */
  getPlayerCenter(index: number): { x: number; y: number } {
    const table = this.playerTables[index];
    if (!table || !this.layout) return { x: 400, y: 180 };
    const pos = this.layout.getPlayerPos(index);
    const size = this.layout.playerTableSize;
    return { x: pos.x + size.width / 2, y: pos.y + size.height / 2 };
  }

  /** 销毁 */
  destroy(): void {
    if (this.particles) {
      this.particles.destroy();
      this.particles = null;
    }
    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }
  }
}
