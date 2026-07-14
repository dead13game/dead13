import { CARD_WIDTH, CARD_HEIGHT } from '../core/constants.js'

/**
 * 牌桌布局引擎 — 自适应 Canvas 尺寸
 * 横屏: 2-4人单行, 5-8人两行
 * 竖屏: 根据人数自动 1-2 列网格
 */
export class TableLayout {
  constructor(playerCount, width = 1000, height = 650) {
    this.playerCount = playerCount
    this.width = width
    this.height = height
    this._updateMode()
  }

  resize(w, h) {
    this.width = w
    this.height = h
    this._portrait = w < h
  }

  setPlayerCount(n) {
    this.playerCount = n
    this._updateMode()
  }

  _updateMode() {
    this._doubleRow = this.playerCount >= 5
    this._portrait = this.width < this.height
  }

  /** 牌库位置 */
  get deckPos() {
    if (this._portrait) {
      // 竖屏：牌库放在屏幕下方 1/3 区域中央
      return {
        x: this.width / 2 - CARD_WIDTH / 2,
        y: this.height * 0.82
      }
    }
    return {
      x: this.width / 2 - CARD_WIDTH / 2,
      y: this.height * 0.45
    }
  }

  /** 墓地位置 */
  get gravePos() {
    const dp = this.deckPos
    if (this._portrait) {
      return { x: dp.x + CARD_WIDTH + 20, y: dp.y }
    }
    return { x: dp.x + CARD_WIDTH + 20, y: dp.y }
  }

  /** 桌中央（攻击牌展示） */
  get centerPos() {
    const dp = this.deckPos
    if (this._portrait) {
      return { x: dp.x, y: dp.y - CARD_HEIGHT - 40 }
    }
    return { x: dp.x, y: dp.y - CARD_HEIGHT - 40 }
  }

  /** 玩家桌面尺寸 */
  get playerTableSize() {
    if (this._portrait) {
      return this._portraitPlayerSize()
    }
    if (this._doubleRow) return { width: 230, height: 200 }
    return { width: 260, height: 280 }
  }

  /** 竖屏自适应桌面尺寸 */
  _portraitPlayerSize() {
    // 2-3人单列，4人+ 用2列
    const cols = this.playerCount <= 3 ? 1 : 2
    const rows = Math.ceil(this.playerCount / cols)

    // 玩家区域占上部 65%，下部 35% 留给牌库/中央
    const availW = (this.width - 32) / cols
    const availH = (this.height * 0.65) / rows

    // 相对标准桌面尺寸 (260×280) 的缩放
    const scaleW = availW / 260
    const scaleH = availH / 280
    const scale = Math.min(1, scaleW, scaleH)

    const w = Math.max(130, 260 * scale)
    const h = Math.max(160, 280 * scale)
    return { width: Math.round(w), height: Math.round(h) }
  }

  /** 各玩家桌面坐标 */
  getPlayerPos(index) {
    const size = this.playerTableSize

    if (this._portrait) {
      return this._portraitPos(index, size)
    }

    if (this._doubleRow) {
      return this._landscapeGridPos(index, size)
    }

    // 横屏单行
    const gap = Math.max(16, (this.width - this.playerCount * size.width) / (this.playerCount + 1))
    const totalW = this.playerCount * size.width + (this.playerCount - 1) * gap
    const startX = (this.width - totalW) / 2
    return {
      x: startX + index * (size.width + gap),
      y: Math.max(10, this.height * 0.08)
    }
  }

  /** 竖屏位置 */
  _portraitPos(index, size) {
    const cols = this.playerCount <= 3 ? 1 : 2
    const rows = Math.ceil(this.playerCount / cols)
    const col = index % cols
    const row = Math.floor(index / cols)

    const totalW = cols * size.width
    const gapX = Math.max(12, (this.width - totalW) / (cols + 1))
    const gapY = Math.max(8, (this.height * 0.65 - rows * size.height) / (rows + 1))

    return {
      x: gapX + col * (size.width + gapX),
      y: gapY + row * (size.height + gapY)
    }
  }

  /** 横屏双行位置 */
  _landscapeGridPos(index, size) {
    const perRow = Math.ceil(this.playerCount / 2)
    const row = Math.floor(index / perRow)
    const col = index % perRow
    const gapX = Math.max(12, (this.width - perRow * size.width) / (perRow + 1))
    const totalW = perRow * size.width + (perRow - 1) * gapX
    const startX = (this.width - totalW) / 2
    const gapY = 16
    return {
      x: startX + col * (size.width + gapX),
      y: this.height * 0.06 + row * (size.height + gapY)
    }
  }
}
