import { Container, Graphics, Text } from 'pixi.js'
import { CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS, COLORS } from '../core/constants.js'

/**
 * 卡牌精灵 — 正/背面渲染 + 翻转动画
 */
export class CardSprite extends Container {
  /**
   * @param {Object|null} cardData - 牌数据 { suit, rank, value, faceUp }
   * @param {Object} options
   * @param {boolean} options.showValue - 是否在牌面显示点数标签
   */
  constructor(cardData, options = {}) {
    super()
    this.cardData = cardData
    this.faceUp = cardData?.faceUp ?? false
    this.showValue = options.showValue ?? false
    this._isEmpty = !cardData

    this._build()
    this._updateDisplay()
  }

  _build() {
    // 卡牌背景
    this.bg = new Graphics()
    this.bg.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS)
    this.addChild(this.bg)

    // 左上角 rank + suit
    this.topRank = new Text({
      text: '',
      style: { fontSize: 12, fontWeight: 'bold', fontFamily: 'Georgia, serif' }
    })
    this.topRank.position.set(5, 4)
    this.addChild(this.topRank)

    this.topSuit = new Text({
      text: '',
      style: { fontSize: 10, fontFamily: 'Georgia, serif' }
    })
    this.topSuit.position.set(5, 17)
    this.addChild(this.topSuit)

    // 中央大字
    this.centerRank = new Text({
      text: '',
      style: { fontSize: 28, fontWeight: 'bold', fontFamily: 'Georgia, serif' }
    })
    this.centerRank.anchor.set(0.5)
    this.centerRank.position.set(CARD_WIDTH / 2, CARD_HEIGHT / 2 - 4)
    this.addChild(this.centerRank)

    // 右下角（旋转180度）
    this.bottomRank = new Text({
      text: '',
      style: { fontSize: 12, fontWeight: 'bold', fontFamily: 'Georgia, serif' }
    })
    this.bottomRank.anchor.set(1, 1)
    this.bottomRank.rotation = Math.PI
    this.bottomRank.position.set(CARD_WIDTH - 5, CARD_HEIGHT - 4)
    this.addChild(this.bottomRank)

    this.bottomSuit = new Text({
      text: '',
      style: { fontSize: 10, fontFamily: 'Georgia, serif' }
    })
    this.bottomSuit.anchor.set(1, 1)
    this.bottomSuit.rotation = Math.PI
    this.bottomSuit.position.set(CARD_WIDTH - 5, CARD_HEIGHT - 17)
    this.addChild(this.bottomSuit)

    // 点数标签（残盾值）
    this.valueBadge = new Graphics()
    this.valueBadge.visible = false
    this.addChild(this.valueBadge)

    this.valueText = new Text({
      text: '',
      style: { fontSize: 10, fill: 0xffffff, fontFamily: 'sans-serif' }
    })
    this.valueText.anchor.set(0.5)
    this.valueText.position.set(CARD_WIDTH / 2, CARD_HEIGHT / 2 + 14)
    this.valueText.visible = false
    this.addChild(this.valueText)
  }

  /** 更新卡牌数据 */
  updateData(cardData, options = {}) {
    this.cardData = cardData
    this.faceUp = cardData?.faceUp ?? false
    this.showValue = options.showValue ?? this.showValue
    this._isEmpty = !cardData
    this._updateDisplay()
  }

  _updateDisplay() {
    if (this._isEmpty) {
      this._renderEmpty()
      return
    }

    const isRed = this.cardData.suit === '♥' || this.cardData.suit === '♦'
    const textColor = isRed ? COLORS.SUIT_RED : COLORS.SUIT_BLACK

    if (this.faceUp) {
      // 正面：白底
      this.bg.clear()
      this.bg.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS)
      this.bg.fill(COLORS.CARD_WHITE)
      this.bg.stroke({ width: 2, color: COLORS.CARD_BORDER })

      const rank = this.cardData.rank || '?'
      const suit = this.cardData.suit || ''

      this.topRank.text = rank
      this.topRank.style.fill = textColor
      this.topSuit.text = suit
      this.topSuit.style.fill = textColor

      this.centerRank.text = rank
      this.centerRank.style.fill = textColor

      this.bottomRank.text = rank
      this.bottomRank.style.fill = textColor
      this.bottomSuit.text = suit
      this.bottomSuit.style.fill = textColor

      this.topRank.visible = true
      this.topSuit.visible = true
      this.centerRank.visible = true
      this.bottomRank.visible = true
      this.bottomSuit.visible = true

      // 点数标签（残盾）
      if (this.showValue && this.cardData.value !== undefined) {
        this._drawValueBadge(this.cardData.value)
      } else {
        this.valueBadge.visible = false
        this.valueText.visible = false
      }
    } else {
      // 背面：蓝色图案
      this.bg.clear()
      this.bg.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS)
      this.bg.fill(COLORS.CARD_BACK)
      this.bg.stroke({ width: 2, color: COLORS.CARD_BACK_BORDER })

      // 中间装饰线框
      this.bg.roundRect(12, 16, CARD_WIDTH - 24, CARD_HEIGHT - 32, 4)
      this.bg.stroke({ width: 2, color: 0x3949ab })

      this.topRank.visible = false
      this.topSuit.visible = false
      this.centerRank.visible = false
      this.bottomRank.visible = false
      this.bottomSuit.visible = false
      this.valueBadge.visible = false
      this.valueText.visible = false
    }
  }

  _renderEmpty() {
    this.bg.clear()
    this.bg.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS)
    this.bg.fill(COLORS.EMPTY_SLOT_BG)
    this.bg.stroke({ width: 2, color: 0xcccccc })

    this.topRank.visible = false
    this.topSuit.visible = false
    this.centerRank.visible = false
    this.bottomRank.visible = false
    this.bottomSuit.visible = false
    this.valueBadge.visible = false
    this.valueText.visible = false

    // 虚线效果：画一个 —
    const dash = new Text({
      text: '—',
      style: { fontSize: 16, fill: 0xcccccc, fontFamily: 'sans-serif' }
    })
    dash.anchor.set(0.5)
    dash.position.set(CARD_WIDTH / 2, CARD_HEIGHT / 2)
    // 移除旧的 dash（如果有的话）
    if (this._dashText) this.removeChild(this._dashText)
    this._dashText = dash
    this.addChild(dash)
  }

  _drawValueBadge(value) {
    // 半透明背景
    this.valueBadge.clear()
    this.valueBadge.roundRect(
      CARD_WIDTH / 2 - 18, CARD_HEIGHT / 2 + 6, 36, 18, 4
    )
    this.valueBadge.fill({ color: 0x000000, alpha: 0.7 })
    this.valueBadge.visible = true

    this.valueText.text = String(value)
    this.valueText.visible = true
  }

  /** 设置翻转状态（不带动画，由外部 GSAP 驱动） */
  setFlipProgress(progress) {
    // progress: 0=正面, 1=背面, 0.5=侧面
    this.scale.x = Math.cos(progress * Math.PI)
    if (progress > 0.5 && this.faceUp !== false) {
      // 切换显示内容
    }
  }
}
