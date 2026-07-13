import { CARD_WIDTH, CARD_HEIGHT } from '../core/constants.js'

/**
 * 牌桌布局引擎 — 自适应 Canvas 尺寸
 */
export class TableLayout {
  constructor(playerCount, width = 1000, height = 650) {
    this.playerCount = playerCount
    this.width = width
    this.height = height
  }

  /** 更新画布尺寸 */
  resize(w, h) {
    this.width = w
    this.height = h
  }

  /** 更新玩家数 */
  setPlayerCount(n) {
    this.playerCount = n
  }

  /** 牌库位置（画面中上部，靠近玩家区） */
  get deckPos() {
    return {
      x: this.width / 2 - CARD_WIDTH / 2,
      y: this.height * 0.38
    }
  }

  /** 墓地位置 */
  get gravePos() {
    const dp = this.deckPos
    return { x: dp.x + CARD_WIDTH + 20, y: dp.y }
  }

  /** 桌中央（攻击牌展示，牌库上方） */
  get centerPos() {
    const dp = this.deckPos
    return { x: dp.x, y: dp.y - CARD_HEIGHT - 30 }
  }

  /** 各玩家桌面左上角坐标（水平排列在画布上方 1/3 处） */
  getPlayerPos(index) {
    const pw = this.playerTableSize.width
    const gap = Math.max(16, (this.width - this.playerCount * pw) / (this.playerCount + 1))
    const totalW = this.playerCount * pw + (this.playerCount - 1) * gap
    const startX = (this.width - totalW) / 2

    return {
      x: startX + index * (pw + gap),
      y: Math.max(10, this.height * 0.08)
    }
  }

  /** 玩家桌面尺寸 */
  get playerTableSize() {
    return { width: 260, height: 280 }
  }
}
