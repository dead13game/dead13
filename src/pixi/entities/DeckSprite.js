import { Container, Graphics, Text } from 'pixi.js'
import { CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS, COLORS } from '../core/constants.js'

/**
 * 牌堆精灵 — 显示堆叠效果 + 牌数
 */
export class DeckSprite extends Container {
  constructor(label = '牌库') {
    super()
    this.count = 0
    this.label = label

    // 底层卡片（堆叠偏移效果）
    this.layer1 = new Graphics()
    this.layer2 = new Graphics()
    this.layer3 = new Graphics()

    // 空牌堆虚线框
    this.emptyBox = new Graphics()

    // 牌数标签
    this.countText = new Text({
      text: '0张',
      style: { fontSize: 10, fill: 0x888888, fontFamily: 'sans-serif' }
    })
    this.countText.anchor.set(0.5)
    this.countText.position.set(CARD_WIDTH / 2, CARD_HEIGHT + 10)

    // 标题
    this.labelText = new Text({
      text: label,
      style: { fontSize: 11, fill: 0x666666, fontFamily: 'sans-serif' }
    })
    this.labelText.anchor.set(0.5)
    this.labelText.position.set(CARD_WIDTH / 2, CARD_HEIGHT + 24)

    this.addChild(this.layer3)
    this.addChild(this.layer2)
    this.addChild(this.layer1)
    this.addChild(this.emptyBox)
    this.addChild(this.countText)
    this.addChild(this.labelText)

    this._render()
  }

  /** 设置牌数 */
  setCount(n) {
    this.count = n
    this._render()
  }

  _render() {
    if (this.count > 0) {
      // 堆叠效果
      this._drawCardBack(this.layer1, 0, 0)
      this.layer1.visible = true

      if (this.count > 1) {
        this._drawCardBack(this.layer2, 3, 3)
        this.layer2.visible = true
      } else {
        this.layer2.visible = false
      }

      if (this.count > 2) {
        this._drawCardBack(this.layer3, 6, 6)
        this.layer3.visible = true
      } else {
        this.layer3.visible = false
      }

      this.emptyBox.visible = false
      this.countText.text = `${this.count}张`
    } else {
      // 空牌堆
      this.layer1.visible = false
      this.layer2.visible = false
      this.layer3.visible = false

      this.emptyBox.clear()
      this.emptyBox.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS)
      this.emptyBox.stroke({ width: 2, color: 0x444444, alpha: 0.3 })
      this.emptyBox.visible = true

      this.countText.text = '空'
    }
  }

  _drawCardBack(g, offsetX, offsetY) {
    g.clear()
    g.position.set(offsetX, offsetY)
    g.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS)
    g.fill(COLORS.CARD_BACK)
    g.stroke({ width: 2, color: COLORS.CARD_BACK_BORDER })
    // 装饰
    g.roundRect(10, 14, CARD_WIDTH - 20, CARD_HEIGHT - 28, 4)
    g.stroke({ width: 1.5, color: 0x3949ab })
  }
}
