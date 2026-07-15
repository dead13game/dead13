import { CARD_WIDTH, CARD_HEIGHT } from "../core/constants.js";

/**
 * 牌桌布局引擎 — 自适应 Canvas 尺寸
 *
 * 横屏 (宽>高): 2-4人单行, 5-8人双行 — 牌库/中央区在中间
 * 竖屏 (高>宽): 固定 2 列网格 — 牌库/中央区在所有牌桌下方
 *
 * 所有位置在 resize/构造时预计算并缓存，getter 零开销。
 */
export class TableLayout {
  constructor(playerCount, width = 1000, height = 650) {
    this.playerCount = playerCount;
    this.width = width;
    this.height = height;
    this._updateMode();
    this._computeAll();
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this._portrait = w < h;
    this._computeAll();
  }

  setPlayerCount(n) {
    this.playerCount = n;
    this._updateMode();
    this._computeAll();
  }

  _updateMode() {
    this._portrait = this.width < this.height;
    this._doubleRow = this.playerCount >= 5; // 仅横屏使用
  }

  /** 一次性预计算所有布局值 */
  _computeAll() {
    if (this._portrait) {
      this._computePortrait();
    } else {
      this._computeLandscape();
    }
    console.log("[layout] computed", {
      portrait: this._portrait,
      players: this.playerCount,
      canvas: { w: this.width, h: this.height },
      tableSize: this._playerSize,
      deckPos: this._deckPos,
      totalHeight: this._totalHeight,
    });
  }

  // ════════════════════════════════════
  //  竖屏布局（手机）
  // ════════════════════════════════════

  _computePortrait() {
    const cols = 2; // 固定 2 列
    const rows = Math.ceil(this.playerCount / cols);
    const gapX = 12;
    const gapY = 10;

    // 为顶部信息栏和底部 UI 栏留空间
    const topOffset = 52; // 顶部栏高度 + safe-area
    const bottomPad = 24; // 底部额外留白

    // 桌面尺寸：宽度按视口均分，高度保持 260:280 比例
    const availW = (this.width - gapX * (cols + 1)) / cols;
    const tableW = Math.round(Math.min(260, availW));
    const tableH = Math.round(tableW * (280 / 260));
    this._playerSize = { width: tableW, height: tableH };

    // 牌桌网格坐标（从上到下，从左到右，顶部留空给信息栏）
    this._playerPositions = [];
    for (let i = 0; i < this.playerCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const totalW = cols * tableW + (cols - 1) * gapX;
      const startX = (this.width - totalW) / 2;
      this._playerPositions.push({
        x: startX + col * (tableW + gapX),
        y: topOffset + gapY + row * (tableH + gapY),
      });
    }

    // 牌库/中央/墓地：放在最后一排牌桌下方
    const tablesBottom = topOffset + gapY + rows * tableH + (rows - 1) * gapY;
    const deckY = tablesBottom + 24;

    this._deckPos = {
      x: this.width / 2 - CARD_WIDTH / 2,
      y: deckY,
    };
    this._gravePos = {
      x: this._deckPos.x + CARD_WIDTH + 20,
      y: deckY,
    };
    this._centerPos = {
      x: this._deckPos.x,
      y: deckY - CARD_HEIGHT - 16,
    };

    // 总高度 = 内容 + 底部留白（避开底部 UI 栏）
    this._totalHeight = deckY + CARD_HEIGHT + bottomPad;
  }

  // ════════════════════════════════════
  //  横屏布局（电脑）— 保持现有逻辑
  // ════════════════════════════════════

  _computeLandscape() {
    // 桌面尺寸
    if (this._doubleRow) {
      this._playerSize = { width: 230, height: 200 };
    } else {
      this._playerSize = { width: 260, height: 280 };
    }

    // 牌库位置（屏幕中央偏下）
    this._deckPos = {
      x: this.width / 2 - CARD_WIDTH / 2,
      y: this.height * 0.45,
    };
    this._gravePos = {
      x: this._deckPos.x + CARD_WIDTH + 20,
      y: this._deckPos.y,
    };
    this._centerPos = {
      x: this._deckPos.x,
      y: this._deckPos.y - CARD_HEIGHT - 40,
    };

    // 玩家坐标
    this._playerPositions = [];
    for (let i = 0; i < this.playerCount; i++) {
      if (this._doubleRow) {
        this._playerPositions.push(this._calcLandscapeGridPos(i));
      } else {
        this._playerPositions.push(this._calcLandscapeSingleRow(i));
      }
    }

    this._totalHeight = this.height;
  }

  _calcLandscapeSingleRow(index) {
    const size = this._playerSize;
    const gap = Math.max(
      16,
      (this.width - this.playerCount * size.width) / (this.playerCount + 1),
    );
    const totalW = this.playerCount * size.width + (this.playerCount - 1) * gap;
    const startX = (this.width - totalW) / 2;
    return {
      x: startX + index * (size.width + gap),
      y: Math.max(10, this.height * 0.08),
    };
  }

  _calcLandscapeGridPos(index) {
    const size = this._playerSize;
    const perRow = Math.ceil(this.playerCount / 2);
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    const gapX = Math.max(
      12,
      (this.width - perRow * size.width) / (perRow + 1),
    );
    const totalW = perRow * size.width + (perRow - 1) * gapX;
    const startX = (this.width - totalW) / 2;
    const gapY = 16;
    return {
      x: startX + col * (size.width + gapX),
      y: this.height * 0.06 + row * (size.height + gapY),
    };
  }

  // ════════════════════════════════════
  //  公共 getter
  // ════════════════════════════════════

  get deckPos() {
    return this._deckPos;
  }
  get gravePos() {
    return this._gravePos;
  }
  get centerPos() {
    return this._centerPos;
  }
  get playerTableSize() {
    return this._playerSize;
  }
  get totalHeight() {
    return this._totalHeight;
  }

  getPlayerPos(index) {
    return this._playerPositions[index] || { x: 0, y: 0 };
  }
}
