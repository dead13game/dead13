import { describe, it, expect } from "vitest";
import { TableLayout } from "../layout/TableLayout.js";

// 辅助函数：CARD_WIDTH / CARD_HEIGHT 来自 pixi/core/constants
const CARD_W = 100;
const CARD_H = 140;

describe("TableLayout", () => {
  describe("横屏布局", () => {
    it("2人单行：2个桌面水平排列，Y相同", () => {
      const layout = new TableLayout(2, 1024, 650);
      expect(layout.getPlayerPos(0).y).toBe(layout.getPlayerPos(1).y);
      expect(layout.getPlayerPos(0).x).not.toBe(layout.getPlayerPos(1).x);
      expect(layout.playerTableSize).toEqual({ width: 260, height: 280 });
    });

    it("4人单行：4个桌面水平排列，尺寸260×280", () => {
      const layout = new TableLayout(4, 1200, 700);
      for (let i = 0; i < 4; i++) {
        expect(layout.getPlayerPos(i).y).toBe(layout.getPlayerPos(0).y);
      }
      expect(layout.playerTableSize).toEqual({ width: 260, height: 280 });
    });

    it("5人双行：5个桌面分2行，尺寸230×200", () => {
      const layout = new TableLayout(5, 1024, 650);
      expect(layout.playerTableSize).toEqual({ width: 230, height: 200 });
      // 前3个在第一行，后2个在第二行（perRow = ceil(5/2) = 3）
      expect(layout.getPlayerPos(0).y).toBe(layout.getPlayerPos(1).y);
      expect(layout.getPlayerPos(3).y).toBeGreaterThan(
        layout.getPlayerPos(0).y,
      );
    });

    it("8人双行：8个桌面分2行，尺寸230×200", () => {
      const layout = new TableLayout(8, 1400, 800);
      expect(layout.playerTableSize).toEqual({ width: 230, height: 200 });
      const row0y = layout.getPlayerPos(0).y;
      const row1y = layout.getPlayerPos(4).y;
      expect(row1y).toBeGreaterThan(row0y);
    });

    it("牌库在屏幕中央偏下", () => {
      const layout = new TableLayout(4, 1024, 650);
      expect(layout.deckPos.y).toBeCloseTo(650 * 0.45, -1);
      expect(layout.centerPos.y).toBeLessThan(layout.deckPos.y);
    });
  });

  describe("竖屏布局", () => {
    it("2人2列：2个桌面在固定2列中排列", () => {
      const layout = new TableLayout(2, 375, 812);
      expect(layout.getPlayerPos(0).y).toBe(layout.getPlayerPos(1).y);
      // 不同列
      expect(layout.getPlayerPos(0).x).not.toBe(layout.getPlayerPos(1).x);
    });

    it("4人2×2：第一行Y相同，第二行Y更大", () => {
      const layout = new TableLayout(4, 375, 812);
      expect(layout.getPlayerPos(0).y).toBe(layout.getPlayerPos(1).y);
      expect(layout.getPlayerPos(2).y).toBeGreaterThan(
        layout.getPlayerPos(0).y,
      );
    });

    it("6人2×3：6个桌面在2列3行中", () => {
      const layout = new TableLayout(6, 375, 812);
      const row0y = layout.getPlayerPos(0).y;
      const row1y = layout.getPlayerPos(2).y;
      const row2y = layout.getPlayerPos(4).y;
      expect(row1y).toBeGreaterThan(row0y);
      expect(row2y).toBeGreaterThan(row1y);
    });

    it("8人2×4：8个桌面在2列4行中", () => {
      const layout = new TableLayout(8, 375, 812);
      expect(layout.playerTableSize.width).toBeGreaterThan(0);
      expect(layout.playerTableSize.height).toBeGreaterThan(0);
      // 8个位置都在可视范围内
      for (let i = 0; i < 8; i++) {
        const pos = layout.getPlayerPos(i);
        expect(pos.y).toBeGreaterThanOrEqual(50);
      }
    });

    it("顶部偏移52px（避开信息栏）", () => {
      const layout = new TableLayout(2, 375, 812);
      expect(layout.getPlayerPos(0).y).toBeGreaterThanOrEqual(52);
    });

    it("牌库在所有牌桌下方", () => {
      const layout = new TableLayout(4, 375, 812);
      const maxTableBottom = Math.max(
        ...Array.from({ length: 4 }, (_, i) => {
          const pos = layout.getPlayerPos(i);
          return pos.y + layout.playerTableSize.height;
        }),
      );
      expect(layout.deckPos.y).toBeGreaterThan(maxTableBottom);
    });

    it("totalHeight > canvas 高度（需要滚动）", () => {
      const layout = new TableLayout(6, 375, 600);
      expect(layout.totalHeight).toBeGreaterThan(600);
    });
  });

  describe("resize() 重新计算", () => {
    it("横→竖切换后更新所有位置", () => {
      const layout = new TableLayout(4, 1024, 650);
      const landscapeY = layout.getPlayerPos(0).y;

      layout.resize(375, 812);
      const portraitY = layout.getPlayerPos(0).y;

      // 竖屏时顶部52px偏移，横屏时靠上
      expect(portraitY).not.toBe(landscapeY);
    });
  });

  describe("setPlayerCount() 重新计算", () => {
    it("4人→8人增加桌面数", () => {
      const layout = new TableLayout(4, 1024, 650);
      layout.setPlayerCount(8);

      // 8人双行
      expect(layout.playerTableSize).toEqual({ width: 230, height: 200 });
    });
  });
});
