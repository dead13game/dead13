import { describe, it, expect } from "vitest";
import {
  createDeck,
  shuffleDeck,
  drawCards,
  reshuffleFromGrave,
} from "./deck.js";

describe("deck", () => {
  describe("createDeck()", () => {
    it("创建标准52张牌", () => {
      const deck = createDeck();
      expect(deck).toHaveLength(52);
    });

    it("每张牌有 suit, rank, value 属性", () => {
      const deck = createDeck();
      for (const card of deck) {
        expect(card).toHaveProperty("suit");
        expect(card).toHaveProperty("rank");
        expect(card).toHaveProperty("value");
      }
    });

    it("4种花色各13张", () => {
      const deck = createDeck();
      const suits = ["♠", "♥", "♦", "♣"];
      for (const suit of suits) {
        expect(deck.filter((c) => c.suit === suit)).toHaveLength(13);
      }
    });
  });

  describe("shuffleDeck()", () => {
    it("洗牌后保持52张", () => {
      const deck = createDeck();
      const shuffled = shuffleDeck([...deck]);
      expect(shuffled).toHaveLength(52);
    });

    it("洗牌后包含所有原始牌", () => {
      const deck = createDeck();
      const shuffled = shuffleDeck([...deck]);
      const originalKeys = deck.map((c) => `${c.suit}${c.rank}`).sort();
      const shuffledKeys = shuffled.map((c) => `${c.suit}${c.rank}`).sort();
      expect(shuffledKeys).toEqual(originalKeys);
    });
  });

  describe("drawCards()", () => {
    it("抽取指定数量的牌", () => {
      const deck = createDeck();
      const { drawn, remaining } = drawCards(deck, 5);
      expect(drawn).toHaveLength(5);
      expect(remaining).toHaveLength(47);
    });

    it("抽取的牌不在剩余牌堆中", () => {
      const deck = createDeck();
      const { drawn, remaining } = drawCards(deck, 1);
      const drawnKey = `${drawn[0].suit}${drawn[0].rank}`;
      expect(remaining.some((c) => `${c.suit}${c.rank}` === drawnKey)).toBe(
        false,
      );
    });
  });

  describe("reshuffleFromGrave()", () => {
    it("从墓地重构牌堆", () => {
      const grave = [
        { id: "♠-A", suit: "♠", rank: "A", value: 1 },
        { id: "♥-K", suit: "♥", rank: "K", value: 13 },
      ];
      const newDeck = reshuffleFromGrave(grave);
      expect(newDeck).toHaveLength(2);
    });

    it("洗牌后墓地牌全在新牌堆中", () => {
      const grave = createDeck().slice(0, 10);
      const newDeck = reshuffleFromGrave(grave);
      expect(newDeck).toHaveLength(10);
    });
  });
});
