import { Container, Graphics, Text } from 'pixi.js'
import gsap from 'gsap'
import { CARD_WIDTH, CARD_HEIGHT, COLORS } from '../core/constants.js'
import { CardSprite } from './CardSprite.js'

/**
 * 玩家桌面精灵 — 角色信息 + 防御牌 + 陷阱
 */
export class PlayerTableSprite extends Container {
  constructor(player, layout) {
    super()
    this.playerIndex = player.index
    this.playerData = player
    this._layout = layout
    this._defSprites = []
    this._trapSprite = null
    this._baitSprite = null

    this._build()
  }

  _build() {
    const size = this._layout.playerTableSize

    // 背景
    this.bg = new Graphics()
    this.bg.roundRect(0, 0, size.width, size.height, 10)
    this.bg.fill({ color: 0xffffff, alpha: 0.95 })
    this.bg.stroke({ width: 2, color: COLORS.CARD_BORDER })
    this.addChild(this.bg)

    // 玩家名
    this.nameText = new Text({
      text: this.playerData.name || '',
      style: { fontSize: 13, fontWeight: 'bold', fill: 0x333333, fontFamily: 'sans-serif' }
    })
    this.nameText.position.set(8, 6)
    this.addChild(this.nameText)

    // 角色名 + 技能
    this.charText = new Text({
      text: `${this.playerData.characterName} · ${this.playerData.skillName}`,
      style: { fontSize: 9, fill: 0x666666, fontFamily: 'sans-serif' }
    })
    this.charText.position.set(8, 20)
    this.addChild(this.charText)

    // 状态标签行
    this.statusText = new Text({
      text: '',
      style: { fontSize: 8, fill: 0xe65100, fontWeight: 'bold', fontFamily: 'sans-serif' }
    })
    this.statusText.position.set(8, 32)
    this.addChild(this.statusText)

    // HP 条背景（右边留空给数字）
    this.hpBarBg = new Graphics()
    this.hpBarBg.roundRect(8, 38, size.width - 50, 12, 6)
    this.hpBarBg.fill(0xe0e0e0)
    this.addChild(this.hpBarBg)

    // HP 条填充
    this.hpBarFill = new Graphics()
    this.addChild(this.hpBarFill)

    // HP 文字（放在血条右侧）
    this.hpText = new Text({
      text: '',
      style: { fontSize: 9, fill: 0x333333, fontWeight: 'bold', fontFamily: 'sans-serif' }
    })
    this.hpText.position.set(size.width - 8, 38)
    this.hpText.anchor.set(1, 0)
    this.addChild(this.hpText)

    // 阵亡标记
    this.deadMark = new Text({
      text: '阵亡',
      style: { fontSize: 28, fill: 0xc62828, fontWeight: 'bold', fontFamily: 'sans-serif' }
    })
    this.deadMark.anchor.set(0.5)
    this.deadMark.position.set(size.width / 2, size.height / 2)
    this.deadMark.visible = false
    this.addChild(this.deadMark)

    // 防御区标签
    this.defLabel = new Text({
      text: '防御',
      style: { fontSize: 9, fill: 0x999999, fontFamily: 'sans-serif' }
    })
    this.defLabel.position.set(8, 58)
    this.addChild(this.defLabel)

    // 防御牌容器
    this.defContainer = new Container()
    this.defContainer.position.set(8, 68)
    this.addChild(this.defContainer)

    // 陷阱/诱饵区（按实际缩放宽度计算位置）
    const cardScale = 0.7
    const trapAreaW = CARD_WIDTH * cardScale * 2 + 4  // 两张牌+间距
    const trapX = size.width - trapAreaW - 14

    this.trapLabel = new Text({
      text: '陷阱',
      style: { fontSize: 9, fill: 0x999999, fontFamily: 'sans-serif' }
    })
    this.trapLabel.position.set(trapX, 58)
    this.addChild(this.trapLabel)

    this.trapContainer = new Container()
    this.trapContainer.position.set(trapX, 68)
    this.addChild(this.trapContainer)

    // 选中标识
    this.highlight = new Graphics()
    this.highlight.visible = false
    this.addChild(this.highlight)

    this._updateHP()
  }

  /** 更新整个玩家状态 */
  sync(player) {
    this.playerData = player
    this._updateHP()
    this._syncDefenses(player.defensePile)
    this._syncTrap(player.trap, player.bait)
    this._updateHighlight()
    this._updateStatus(player)
  }

  _updateHP() {
    const p = this.playerData
    const size = this._layout.playerTableSize
    const barWidth = size.width - 50  // 右边留空给文字
    const targetRatio = p.maxHp > 0 ? Math.max(0, p.hp / p.maxHp) : 0
    const color = targetRatio < 0.3 ? COLORS.HP_BAR_DAMAGE : COLORS.HP_BAR_FILL

    const proxy = { w: this._hpBarWidth ?? barWidth * targetRatio }
    this._hpBarWidth = proxy.w
    gsap.killTweensOf(proxy)
    gsap.to(proxy, {
      w: barWidth * targetRatio,
      duration: 0.4,
      ease: 'power2.out',
      onUpdate: () => {
        this._hpBarWidth = proxy.w
        this.hpBarFill.clear()
        if (proxy.w > 0.5) {
          this.hpBarFill.roundRect(8, 38, proxy.w, 12, 6)
          this.hpBarFill.fill(color)
        }
      }
    })

    this.hpText.text = `HP ${p.hp}/${p.maxHp}`
  }

  _syncDefenses(defensePile) {
    this.defContainer.removeChildren()
    this._defSprites = []

    if (defensePile.length === 0) {
      const empty = new CardSprite(null)
      empty.scale.set(0.7)
      this.defContainer.addChild(empty)
      return
    }

    // 每列最多几张（基于桌面高度和卡牌偏移）
    const cardH = CARD_HEIGHT * 0.7  // 缩放后卡高
    const gap = 14                    // 叠放间距
    const areaH = this._layout.playerTableSize.height - 68 - 10  // 可用高度
    const perCol = Math.max(1, Math.floor((areaH - cardH) / gap) + 1)

    defensePile.forEach((card, i) => {
      const col = Math.floor(i / perCol)
      const row = i % perCol
      const sprite = new CardSprite(card, { showValue: true })
      sprite.scale.set(0.7)
      // 列偏移（每列宽 = 缩放卡宽 + 间距）
      sprite.position.set(col * (CARD_WIDTH * 0.7 + 6), row * gap)
      this.defContainer.addChild(sprite)
      this._defSprites.push(sprite)
    })
  }

  _syncTrap(trap, bait) {
    this.trapContainer.removeChildren()

    // 暗牌（陷阱）
    const trapCard = new CardSprite(trap, { showValue: false })
    trapCard.scale.set(0.7)
    trapCard.position.set(0, 0)
    if (trap) trapCard.faceUp = false  // 陷阱总是背面
    this.trapContainer.addChild(trapCard)

    // 明牌（诱饵）
    const baitCard = new CardSprite(bait, { showValue: false })
    baitCard.scale.set(0.7)
    baitCard.position.set(CARD_WIDTH * 0.7 + 4, 0)
    if (bait) baitCard.faceUp = true
    this.trapContainer.addChild(baitCard)
  }

  _updateHighlight() {
    const size = this._layout.playerTableSize
    this.highlight.clear()
    if (this._isCurrent) {
      // 外层发光
      this.highlight.roundRect(-4, -4, size.width + 8, size.height + 8, 14)
      this.highlight.stroke({ width: 6, color: 0x1976d2, alpha: 0.3 })
      // 内层边框
      this.highlight.roundRect(-2, -2, size.width + 4, size.height + 4, 12)
      this.highlight.stroke({ width: 2, color: 0x42a5f5 })
      this.highlight.visible = true
    } else {
      this.highlight.visible = false
    }
  }

  /** 设置是否为当前行动玩家 */
  setCurrent(v) {
    this._isCurrent = v
    this._updateHighlight()
    // 呼吸动画
    if (v) {
      gsap.killTweensOf(this.highlight)
      this.highlight.alpha = 1
      gsap.to(this.highlight, {
        alpha: 0.3,
        duration: 1.2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      })
    } else {
      gsap.killTweensOf(this.highlight)
      this.highlight.alpha = 1
    }
  }

  /** 设置玩家存活状态 */
  setAlive(v) {
    this.deadMark.visible = !v
    if (!v) {
      this.alpha = 0.55
      // 背景变灰
      this.bg.alpha = 0.6
    } else {
      this.alpha = 1
      this.bg.alpha = 1
    }
  }

  /** 状态文本 */
  _updateStatus(player) {
    const tags = []
    if (player.frozenBy !== null) tags.push('冻结')
    if (player.stealTarget?.turns > 0) tags.push(`偷取中(${player.stealTarget.turns})`)
    if (player.dotTarget?.turns > 0) tags.push(`DoT(${player.dotTarget.turns})`)
    if (player.savepoint) tags.push('已存档')
    if (player.fightingSpirit > 0) tags.push(`斗志${player.fightingSpirit}`)
    if (player.extraAction) tags.push('+1行动')
    if (player.ignoreTrapThisTurn) tags.push('无视陷阱')
    this.statusText.text = tags.join(' · ')
  }
}
