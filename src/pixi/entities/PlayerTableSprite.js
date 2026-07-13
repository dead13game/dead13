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

    // HP 条背景
    this.hpBarBg = new Graphics()
    this.hpBarBg.roundRect(8, 38, size.width - 16, 12, 6)
    this.hpBarBg.fill(0xe0e0e0)
    this.addChild(this.hpBarBg)

    // HP 条填充
    this.hpBarFill = new Graphics()
    this.addChild(this.hpBarFill)

    // HP 文字
    this.hpText = new Text({
      text: '',
      style: { fontSize: 9, fill: 0xffffff, fontWeight: 'bold', fontFamily: 'sans-serif' }
    })
    this.hpText.position.set(size.width / 2, 40)
    this.hpText.anchor.set(0.5, 0)
    this.addChild(this.hpText)

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

    // 陷阱/诱饵区
    this.trapLabel = new Text({
      text: '陷阱',
      style: { fontSize: 9, fill: 0x999999, fontFamily: 'sans-serif' }
    })
    this.trapLabel.position.set(size.width - CARD_WIDTH * 2 - 14, 58)
    this.addChild(this.trapLabel)

    this.trapContainer = new Container()
    this.trapContainer.position.set(size.width - CARD_WIDTH * 2 - 14, 68)
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
    const barWidth = size.width - 16
    const targetRatio = p.maxHp > 0 ? Math.max(0, p.hp / p.maxHp) : 0
    const color = targetRatio < 0.3 ? COLORS.HP_BAR_DAMAGE : COLORS.HP_BAR_FILL

    // GSAP 平滑过渡
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

    this.hpText.text = `${p.hp}/${p.maxHp}`
  }

  _syncDefenses(defensePile) {
    // 清除旧的
    this.defContainer.removeChildren()
    this._defSprites = []

    const offset = this._layout.defenseCardOffset
    defensePile.forEach((card, i) => {
      const sprite = new CardSprite(card, { showValue: true })
      sprite.position.set(0, -i * 16)
      // 缩小防御牌
      sprite.scale.set(0.7)
      this.defContainer.addChild(sprite)
      this._defSprites.push(sprite)
    })

    // 空位
    if (defensePile.length === 0) {
      const empty = new CardSprite(null)
      empty.scale.set(0.7)
      this.defContainer.addChild(empty)
    }
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
      this.highlight.roundRect(-2, -2, size.width + 4, size.height + 4, 12)
      this.highlight.stroke({ width: 3, color: COLORS.CURRENT_PLAYER_GLOW })
      this.highlight.visible = true
    } else {
      this.highlight.visible = false
    }
  }

  /** 设置是否为当前行动玩家 */
  setCurrent(v) {
    this._isCurrent = v
    this._updateHighlight()
  }

  /** 设置玩家存活状态 */
  setAlive(v) {
    this.alpha = v ? 1 : 0.4
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
