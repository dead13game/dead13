import { CARD_WIDTH, CARD_HEIGHT } from '../core/constants.js'

/**
 * 牌桌布局引擎 — 自适应 Canvas 尺寸
 * 2-4人单行, 5-8人两行
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
  }

  setPlayerCount(n) {
    this.playerCount = n
    this._updateMode()
  }

  _updateMode() {
    this._doubleRow = this.playerCount >= 5
  }

  /** 牌库位置 */
  get deckPos() {
    return {
      x: this.width / 2 - CARD_WIDTH / 2,
      y: this.height * 0.45
    }
  }

  /** 墓地位置 */
  get gravePos() {
    const dp = this.deckPos
    return { x: dp.x + CARD_WIDTH + 20, y: dp.y }
  }

  /** 桌中央（攻击牌展示） */
  get centerPos() {
    const dp = this.deckPos
    return { x: dp.x, y: dp.y - CARD_HEIGHT - 40 }
  }

  /** 玩家桌面尺寸 */
  get playerTableSize() {
    if (this._doubleRow) return { width: 190, height: 200 }
    return { width: 260, height: 280 }
  }

  /** 各玩家桌面坐标 */
  getPlayerPos(index) {
    const size = this.playerTableSize

    if (this._doubleRow) {
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

    // 单行
    const gap = Math.max(16, (this.width - this.playerCount * size.width) / (this.playerCount + 1))
    const totalW = this.playerCount * size.width + (this.playerCount - 1) * gap
    const startX = (this.width - totalW) / 2
    return {
      x: startX + index * (size.width + gap),
      y: Math.max(10, this.height * 0.08)
    }
  }
}
