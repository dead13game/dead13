// PixiJS 画布与布局常量

/** 画布逻辑尺寸（会根据窗口缩放） */
export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 650;

/** 卡牌尺寸 */
export const CARD_WIDTH = 64;
export const CARD_HEIGHT = 96;
export const CARD_RADIUS = 8;

/** 舞台 zIndex 层级 */
export const LAYER = {
  BACKGROUND: 0,
  TABLE: 10,
  CARDS: 20,
  EFFECTS: 30,
  OVERLAY: 40,
};

/** 颜色常量 */
export const COLORS = {
  BACKGROUND: 0x0a0a2e,
  CARD_WHITE: 0xffffff,
  CARD_BORDER: 0xdddddd,
  CARD_BACK: 0x1a237e,
  CARD_BACK_BORDER: 0x0d1b5e,
  SUIT_RED: 0xd32f2f,
  SUIT_BLACK: 0x1a1a1a,
  HP_BAR_BG: 0xe0e0e0,
  HP_BAR_FILL: 0x43a047,
  HP_BAR_DAMAGE: 0xe53935,
  DEFENSE_SLOT: 0xcccccc,
  EMPTY_SLOT_BG: 0xfafafa,
  CURRENT_PLAYER_GLOW: 0x1976d2,
  TRAP_GLOW: 0xfb8c00,
  BAIT_GLOW: 0x43a047,
};
