import { Container, Graphics, Text, Sprite, Texture, Rectangle } from "pixi.js";
import gsap from "gsap";
import { CARD_WIDTH, CARD_HEIGHT, COLORS } from "../core/constants.js";
import { CardSprite } from "./CardSprite.js";

/**
 * 玩家桌面精灵 — 角色信息 + 防御牌 + 陷阱
 *
 * 根据桌面宽度自动切换布局模式：
 *   ≥200px: 桌面模式 — 防御区与陷阱区左右排列
 *   <200px: 紧凑模式 — 防御区与陷阱区上下排列，卡牌缩小
 */
export class PlayerTableSprite extends Container {
  constructor(player, layout) {
    super();
    this.playerIndex = player.index;
    this.playerData = player;
    this._layout = layout;
    this._defSprites = [];
    this._trapSprite = null;
    this._baitSprite = null;

    this._build();
  }

  /** 是否为紧凑模式（窄桌面） */
  get _compact() {
    return this._layout.playerTableSize.width < 200;
  }

  _build() {
    const size = this._layout.playerTableSize;
    const compact = this._compact;

    // 卡牌缩放比
    const cardS = compact ? 0.45 : 0.7;

    // ── 背景 ──
    this.bg = new Graphics();
    this.bg.roundRect(0, 0, size.width, size.height, 10);
    this.bg.fill({ color: 0xffffff, alpha: 0.95 });
    this.bg.stroke({ width: 2, color: COLORS.CARD_BORDER });
    this.addChild(this.bg);

    // ── 字体大小 ──
    const fsName = compact ? 10 : 13;
    const fsChar = compact ? 7 : 9;
    const fsStatus = compact ? 6 : 8;
    const fsLabel = compact ? 7 : 9;
    const fsHp = compact ? 7 : 9;

    // ── 玩家名 ──
    this.nameText = new Text({
      text: this.playerData.name || "",
      style: {
        fontSize: fsName,
        fontWeight: "bold",
        fill: 0x333333,
        fontFamily: "sans-serif",
      },
    });
    this.nameText.position.set(8, compact ? 3 : 6);
    this.addChild(this.nameText);

    // ── 角色名 + 技能 ──
    this.charText = new Text({
      text: `${this.playerData.characterName} · ${this.playerData.skillName}`,
      style: { fontSize: fsChar, fill: 0x666666, fontFamily: "sans-serif" },
    });
    this.charText.position.set(8, compact ? 13 : 20);
    this.addChild(this.charText);

    // ── 状态标签行 ──
    this.statusText = new Text({
      text: "",
      style: {
        fontSize: fsStatus,
        fill: 0xe65100,
        fontWeight: "bold",
        fontFamily: "sans-serif",
      },
    });
    this.statusText.position.set(8, compact ? 22 : 32);
    this.addChild(this.statusText);

    // ── HP 条 ──
    const hpY = compact ? 32 : 38;
    const hpBarW = size.width - 50;
    const hpBarH = compact ? 8 : 12;
    const hpRadius = compact ? 4 : 6;

    this.hpBarBg = new Graphics();
    this.hpBarBg.roundRect(8, hpY, hpBarW, hpBarH, hpRadius);
    this.hpBarBg.fill(0xe0e0e0);
    this.addChild(this.hpBarBg);

    this.hpBarFill = new Graphics();
    this.addChild(this.hpBarFill);

    this.hpText = new Text({
      text: "",
      style: {
        fontSize: fsHp,
        fill: 0x333333,
        fontWeight: "bold",
        fontFamily: "sans-serif",
      },
    });
    this.hpText.anchor.set(1, 0);
    this.hpText.position.set(size.width - 8, hpY);
    this.addChild(this.hpText);

    // ── 阵亡标记 ──
    this.deadMark = new Text({
      text: "阵亡",
      style: {
        fontSize: compact ? 20 : 28,
        fill: 0xc62828,
        fontWeight: "bold",
        fontFamily: "sans-serif",
      },
    });
    this.deadMark.anchor.set(0.5);
    this.deadMark.position.set(size.width / 2, size.height / 2);
    this.deadMark.visible = false;
    this.addChild(this.deadMark);

    // ── 防御区 ──
    const defY = compact ? hpY + hpBarH + 6 : 58;

    this.defLabel = new Text({
      text: "防御",
      style: { fontSize: fsLabel, fill: 0x999999, fontFamily: "sans-serif" },
    });
    this.defLabel.position.set(8, defY);
    this.addChild(this.defLabel);

    this.defContainer = new Container();
    this.defContainer.position.set(8, defY + (compact ? 8 : 10));
    this.addChild(this.defContainer);

    // ── 陷阱/诱饵区（始终在右侧，与防御并列）──
    const trapAreaW = CARD_WIDTH * cardS * 2 + 4;
    const trapX = size.width - trapAreaW - 14;

    this.trapLabel = new Text({
      text: "陷阱",
      style: { fontSize: fsLabel, fill: 0x999999, fontFamily: "sans-serif" },
    });
    this.trapLabel.position.set(trapX, defY);
    this.addChild(this.trapLabel);

    this.trapContainer = new Container();
    this.trapContainer.position.set(trapX, defY + 10);
    this.addChild(this.trapContainer);

    // ── 选中标识 ──
    this.highlight = new Graphics();
    this.highlight.visible = false;
    this.addChild(this.highlight);

    // ── 角色立绘：防御预留列与陷阱区之间的间隙 × 陷阱行下方 ──
    const colStep = CARD_WIDTH * cardS + (compact ? 4 : 6); // 防御列偏移
    const defRight = 8 + colStep * 2; // 防御 col0 + 预留 col1
    const gap = compact ? 4 : 8;
    const portraitX = Math.round((defRight + gap + trapX) / 2); // 防御右端和陷阱左端的中间
    const portraitW = size.width - portraitX - gap; // 直到右边缘
    const trapBottom = this.trapContainer.y + CARD_HEIGHT * cardS; // 陷阱只有一行
    const portraitY = trapBottom + gap;
    const portraitH = size.height - portraitY - (compact ? 4 : 8);

    if (portraitW > 8 && portraitH > 8) {
      this._portraitRect = {
        x: portraitX,
        y: portraitY,
        w: portraitW,
        h: portraitH,
      };
      this._loadPortrait();
    }

    this._updateHP();
  }

  _loadPortrait() {
    const r = this._portraitRect;
    const path = this.playerData.characterIcon;
    if (!path) {
      this._drawPortraitPlaceholder(r);
      return;
    }

    const img = new Image();
    img.src = path;
    const setup = () => {
      if (!img.width) {
        this._drawPortraitPlaceholder(r);
        return;
      }

      // 宽度撑满，高度超出则上下裁剪（通过 texture.frame）
      const scale = r.w / img.width;
      const tex = Texture.from(img);
      const showH = Math.min(img.height, r.h / scale); // 可见的图像高度（像素）
      const cropTop = (img.height - showH) / 2; // 从图像顶部裁掉多少
      tex.frame = new Rectangle(0, cropTop, img.width, showH);
      tex.updateUvs();

      const sprite = new Sprite(tex);
      sprite.width = r.w;
      sprite.height = r.h;
      sprite.position.set(r.x, r.y);

      // 边框
      const border = new Graphics();
      border.roundRect(r.x, r.y, r.w, r.h, 4);
      border.stroke({ width: 1.5, color: 0x999999 });
      this.addChild(sprite);
      this.addChild(border);
    };
    if (img.complete) {
      setup();
    } else {
      img.onload = setup;
      img.onerror = () => this._drawPortraitPlaceholder(r);
    }
  }

  _drawPortraitPlaceholder(r) {
    const g = new Graphics();
    g.roundRect(r.x, r.y, r.w, r.h, 3);
    g.fill({ color: 0xd0d0d0, alpha: 0.5 });
    g.stroke({ width: 1, color: 0xbbbbbb });
    this.addChild(g);
  }

  /** 更新整个玩家状态 */
  sync(player) {
    const charChanged = this.playerData?.characterId !== player.characterId;
    this.playerData = player;
    // 角色变了（换人）→ 刷新立绘和文字
    if (charChanged) {
      this.charText.text = `${player.characterName} · ${player.skillName}`;
      this._loadPortrait();
    }
    this._updateHP();
    this._syncDefenses(player.defensePile);
    this._syncTrap(player.trap, player.bait);
    this._updateHighlight();
    this._updateStatus(player);
  }

  _updateHP() {
    const p = this.playerData;
    const size = this._layout.playerTableSize;
    const compact = this._compact;
    const barWidth = size.width - 50;
    const hpY = compact ? 32 : 38;
    const hpBarH = compact ? 8 : 12;
    const hpRadius = compact ? 4 : 6;
    const targetRatio = p.maxHp > 0 ? Math.max(0, p.hp / p.maxHp) : 0;
    const color = targetRatio < 0.3 ? COLORS.HP_BAR_DAMAGE : COLORS.HP_BAR_FILL;

    const proxy = { w: this._hpBarWidth ?? barWidth * targetRatio };
    this._hpBarWidth = proxy.w;
    gsap.killTweensOf(proxy);
    gsap.to(proxy, {
      w: barWidth * targetRatio,
      duration: 0.4,
      ease: "power2.out",
      onUpdate: () => {
        this._hpBarWidth = proxy.w;
        this.hpBarFill.clear();
        if (proxy.w > 0.5) {
          this.hpBarFill.roundRect(8, hpY, proxy.w, hpBarH, hpRadius);
          this.hpBarFill.fill(color);
        }
      },
    });

    this.hpText.text = `HP ${p.hp}/${p.maxHp}`;
  }

  _syncDefenses(defensePile) {
    this.defContainer.removeChildren();
    this._defSprites = [];

    const cardS = this._compact ? 0.45 : 0.7;

    if (defensePile.length === 0) {
      const empty = new CardSprite(null);
      empty.scale.set(cardS);
      this.defContainer.addChild(empty);
      return;
    }

    const cardH = CARD_HEIGHT * cardS;
    const gap = this._compact ? 8 : 14;
    const areaH =
      this._layout.playerTableSize.height - this.defContainer.y - 10;
    const perCol = Math.max(1, Math.floor((areaH - cardH) / gap) + 1);

    defensePile.forEach((card, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const sprite = new CardSprite(card, { showValue: true });
      sprite.scale.set(cardS);
      sprite.position.set(col * (CARD_WIDTH * cardS + 4), row * gap);
      this.defContainer.addChild(sprite);
      this._defSprites.push(sprite);
    });
  }

  _syncTrap(trap, bait) {
    this.trapContainer.removeChildren();

    const cardS = this._compact ? 0.45 : 0.7;

    const trapCard = new CardSprite(trap, { showValue: false });
    trapCard.scale.set(cardS);
    trapCard.position.set(0, 0);
    if (trap) trapCard.faceUp = false;
    this.trapContainer.addChild(trapCard);

    const baitCard = new CardSprite(bait, { showValue: false });
    baitCard.scale.set(cardS);
    baitCard.position.set(CARD_WIDTH * cardS + 4, 0);
    if (bait) baitCard.faceUp = true;
    this.trapContainer.addChild(baitCard);
  }

  _updateHighlight() {
    const size = this._layout.playerTableSize;
    this.highlight.clear();
    if (this._isCurrent) {
      this.highlight.roundRect(-4, -4, size.width + 8, size.height + 8, 14);
      this.highlight.stroke({ width: 6, color: 0x1976d2, alpha: 0.3 });
      this.highlight.roundRect(-2, -2, size.width + 4, size.height + 4, 12);
      this.highlight.stroke({ width: 2, color: 0x42a5f5 });
      this.highlight.visible = true;
    } else {
      this.highlight.visible = false;
    }
  }

  setCurrent(v) {
    this._isCurrent = v;
    this._updateHighlight();
    if (v) {
      gsap.killTweensOf(this.highlight);
      this.highlight.alpha = 1;
      gsap.to(this.highlight, {
        alpha: 0.3,
        duration: 1.2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    } else {
      gsap.killTweensOf(this.highlight);
      this.highlight.alpha = 1;
    }
  }

  setAlive(v) {
    this.deadMark.visible = !v;
    if (!v) {
      this.alpha = 0.55;
      this.bg.alpha = 0.6;
    } else {
      this.alpha = 1;
      this.bg.alpha = 1;
    }
  }

  _updateStatus(player) {
    const tags = [];
    if (player.frozenBy !== null) tags.push("冻结");
    if (player.allyIndex !== null && player.allianceTurns > 0)
      tags.push(`联盟(${player.allianceTurns})`);
    if (player.betrayalPenalty > 0)
      tags.push(`背刺惩罚(${player.betrayalPenalty})`);
    if (player.stealTarget?.turns > 0)
      tags.push(`偷取中(${player.stealTarget.turns})`);
    if (player.dotTarget?.turns > 0)
      tags.push(`DoT(${player.dotTarget.turns})`);
    if (player.savepoint) tags.push("已存档");
    if (player.fightingSpirit > 0) tags.push(`斗志${player.fightingSpirit}`);
    if (player.extraAction) tags.push("+1行动");
    if (player.ignoreTrapThisTurn) tags.push("无视陷阱");
    this.statusText.text = tags.join(" · ");
  }
}
