import { describe, it, expect } from "vitest";

import {
  createDeck,
  createFullDeck,
  shuffle,
  draw,
  reshuffleFromGrave,
  display,
} from "./cards.js";
import { createRng, createSeededRng } from "./rng.js";
import {
  createPlayer,
  createPlayerDefaults,
  alivePlayers,
  playerByUid,
  playerByIndex,
  currentPlayer,
} from "./player.js";

describe("core/cards", () => {
  it("一副牌 52 张且 id 唯一", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    expect(deck.find((c) => c.id === "♠-K").value).toBe(13);
  });

  it("两副牌 104 张", () => {
    expect(createFullDeck(2)).toHaveLength(104);
  });

  it("同 seed 洗牌结果一致,且只是置换", () => {
    const deck = createFullDeck(1);
    const a = shuffle(deck, createSeededRng(7));
    const b = shuffle(deck, createSeededRng(7));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(a.map((c) => c.id).sort()).toEqual(deck.map((c) => c.id).sort());
    expect(deck[0].id).toBe("♠-A"); // 原数组未被修改
  });

  it("抽牌从牌堆顶(数组尾部)pop", () => {
    const deck = createDeck();
    const { drawn, remaining } = draw(deck, 3);
    expect(drawn.map((c) => c.id)).toEqual(["♣-K", "♣-Q", "♣-J"]);
    expect(remaining).toHaveLength(49);
    expect(deck).toHaveLength(52); // 不可变
  });

  it("抽牌数超过牌堆长度时只返回现有牌", () => {
    const { drawn, remaining } = draw(createDeck().slice(0, 2), 5);
    expect(drawn).toHaveLength(2);
    expect(remaining).toHaveLength(0);
  });

  it("墓地重构可排除指定 id", () => {
    const grave = [
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ];
    const out = reshuffleFromGrave(grave, createSeededRng(1), ["a"]);
    expect(out.map((c) => c.id)).toEqual(["b"]);
  });

  it("牌面文案", () => {
    expect(display({ rank: "A", suit: "♠" })).toBe("A♠");
    expect(display(null)).toBe("无牌");
  });
});

describe("core/rng", () => {
  it("默认源可用,next 落在 [0,1)", () => {
    const rng = createRng(() => 0.5);
    expect(rng.next()).toBe(0.5);
    expect(rng.int(10)).toBe(5);
    expect(rng.pick(["a", "b"])).toBe("b");
    expect(rng.chance(0.6)).toBe(true);
  });

  it("空数组 pick 返回 undefined", () => {
    expect(createSeededRng(3).pick([])).toBeUndefined();
  });
});

describe("core/player", () => {
  const meta = { hp: 11, maxUses: 3, loadMaxUses: 0 };

  it("工厂按角色数据初始化,默认名沿用旧格式", () => {
    const p = createPlayer({
      uid: 1,
      index: 2,
      characterId: 1,
      meta,
    });
    expect(p.name).toBe("玩家 3");
    expect(p.hp).toBe(11);
    expect(p.maxHp).toBe(11);
    expect(p.resources.skillUses).toBe(3);
    expect(p.resources.loadUses).toBe(0);
    expect(p.resources.holyWordUses).toBe(2);
    expect(p.relations.attackedThisRound).toBe(0);
    expect(p.alive).toBe(true);
  });

  it("charState 深拷贝,不共享引用", () => {
    const p = createPlayer({
      uid: 1,
      index: 0,
      characterId: 7,
      meta,
      charState: { moonPhase: 0 },
    });
    p.char.moonPhase = 2;
    expect(
      createPlayer({
        uid: 2,
        index: 0,
        characterId: 7,
        meta,
        charState: { moonPhase: 0 },
      }).char.moonPhase,
    ).toBe(0);
  });

  it("JSON 往返不丢字段(存档前提)", () => {
    const p = createPlayer({ uid: 3, index: 1, characterId: 6, meta, teamId: 0 });
    const back = JSON.parse(JSON.stringify(p));
    expect(back).toEqual(p);
    expect(back).not.toEqual(createPlayerDefaults()); // 完整性旁证
  });

  it("查询函数按 uid / index 区分", () => {
    const state = {
      currentPlayerIndex: 0,
      players: [
        createPlayer({ uid: 10, index: 1, characterId: 1, meta }),
        createPlayer({ uid: 11, index: 0, characterId: 2, meta, name: "B" }),
      ],
    };
    expect(playerByUid(state, 11).name).toBe("B");
    expect(playerByIndex(state, 1).uid).toBe(10);
    expect(currentPlayer(state).uid).toBe(10);
    expect(alivePlayers(state)).toHaveLength(2);
  });
});
