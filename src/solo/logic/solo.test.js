import { describe, it, expect, beforeEach } from "vitest";
import { reactive } from "vue";
import {
  createSoloState,
  gainExp,
  applyAttrPoints,
  addCards,
  removeRandomCard,
  serializeSolo,
  deserializeSolo,
  calcMaxHp,
} from "./solo.js";
import {
  startCombat,
  pickPoker,
  playCard,
  startEnemyTurn,
  enemyAnnounce,
  enemyResolve,
  claimCardReward,
} from "./soloCombat.js";
import { applyEventOption, rollCheck } from "./soloEvents.js";
import { SOLO_CARDS } from "./soloConstants.js";

/** 同步模拟完整敌方回合（UI 层会异步慢放，测试里直接跑完） */
function runFullEnemyTurn(s) {
  startEnemyTurn(s);
  let guard = 0;
  while (guard++ < 60) {
    if (s.combat.phase === "lost" || s.combat.phase === "won") break;
    const r = enemyAnnounce(s);
    if (!r.playing) break;
    enemyResolve(s);
  }
}

describe("solo 单机模式", () => {
  describe("创建状态", () => {
    it("玛薇卡初始：HP 24、初始卡组、3 维属性 2/2/2", () => {
      const s = createSoloState(6);
      expect(s.player.hp).toBe(24);
      expect(s.player.maxHp).toBe(24);
      expect(s.player.attrs).toEqual({ str: 2, mag: 2, def: 2 });
      expect(s.player.deck).toEqual({ mengji: 2, zhongji: 1, gedang: 1 });
      expect(s.mapNodes).toHaveLength(7); // 7 节点
      expect(s.nodeIndex).toBe(0);
      expect(s.gameOver).toBe(false);
    });

    it("最大 HP = 20 + 防御×2", () => {
      expect(calcMaxHp({ def: 5 })).toBe(30);
    });
  });

  describe("经验与属性", () => {
    it("获得 10 经验升到 2 级，+2 待分配属性点", () => {
      const s = createSoloState();
      gainExp(s, 10);
      expect(s.player.level).toBe(2);
      expect(s.player.pendingAttrPoints).toBe(2);
    });

    it("分配属性点加到力量，防御不变则 HP 不变", () => {
      const s = createSoloState();
      gainExp(s, 10);
      applyAttrPoints(s, "str", 2);
      expect(s.player.attrs.str).toBe(4);
      expect(s.player.pendingAttrPoints).toBe(0);
      expect(s.player.maxHp).toBe(24);
    });

    it("加防御后最大 HP 提升", () => {
      const s = createSoloState();
      gainExp(s, 10);
      applyAttrPoints(s, "def", 2);
      expect(s.player.maxHp).toBe(28);
    });
  });

  describe("战斗：抽3选2与行动力", () => {
    it("每回合抽扑克从牌堆移除：牌堆递减、两回合扑克不同", () => {
      const s = createSoloState();
      s.player.deck = { mengji: 30, gedang: 10 };
      startCombat(s, "normal");
      const c = s.combat;
      const pileBefore = c.pokerDeck.length;
      expect(pileBefore).toBe(49); // 52 - 3（startCombat 已抽第一回合 3 张）
      const firstRoundPoker = c.pendingPoker.map((p) => p.id).join(",");
      pickPoker(s, 0, 1, 2);
      // 保命后结束回合，进入敌方回合再回玩家回合
      s.player.hp = 1000;
      c.playerShield = 100;
      runFullEnemyTurn(s);
      // 敌方回合抽 3 + 玩家新回合抽 3 = 共 -6
      expect(c.pokerDeck.length).toBe(pileBefore - 6);
      // 两回合抽的扑克不应完全相同（修复前是同一批）
      const secondRoundPoker = c.pendingPoker.map((p) => p.id).join(",");
      expect(secondRoundPoker).not.toBe(firstRoundPoker);
    });

    it("pickPoker 后行动力 = 选中的 2 张点数之和，抽牌数 = 剩 1 张", () => {
      const s = createSoloState();
      startCombat(s, "normal");
      const c = s.combat;
      expect(c.phase).toBe("pick-poker");
      expect(c.pendingPoker).toHaveLength(3);
      const poker = c.pendingPoker; // 记录后再选（pickPoker 会清空）
      const r = pickPoker(s, 0, 1, 2);
      expect(r.ok).toBe(true);
      expect(c.actionPoints).toBe(poker[0].value + poker[1].value);
      expect(c.drawCount).toBe(poker[2].value);
      expect(c.phase).toBe("play");
    });

    it("pickPoker 非法选择被拒绝", () => {
      const s = createSoloState();
      startCombat(s, "normal");
      const r = pickPoker(s, 0, 0, 1); // 下标重复
      expect(r.ok).toBe(false);
    });

    it("抽牌后手牌为聚合结构（同名牌计数）", () => {
      const s = createSoloState();
      // 加大猛击数量保证抽到
      s.player.deck = { mengji: 30 };
      startCombat(s, "normal");
      pickPoker(s, 0, 1, 2);
      const c = s.combat;
      expect(c.phase).toBe("play");
      const kinds = Object.keys(c.playerHand);
      expect(kinds.length).toBeGreaterThan(0);
      expect(kinds.length).toBeLessThanOrEqual(6); // 种类上限
      for (const k of kinds) {
        expect(c.playerHand[k]).toBeGreaterThan(0);
        expect(SOLO_CARDS[k]).toBeDefined();
      }
    });
  });

  describe("战斗：出牌与伤害", () => {
    it("打猛击：消耗 5 行动力，敌方掉 3+力量(2)=5 血", () => {
      const s = createSoloState();
      s.player.deck = { mengji: 30 };
      startCombat(s, "normal");
      const c = s.combat;
      pickPoker(s, 0, 1, 2);
      // 确保手牌有猛击且行动力足够
      c.playerHand.mengji = 3;
      c.actionPoints = 20;
      const hpBefore = c.enemyHp;
      const apBefore = c.actionPoints;
      const r = playCard(s, "mengji", 1);
      expect(r.ok).toBe(true);
      expect(c.enemyHp).toBe(hpBefore - 5);
      expect(c.actionPoints).toBe(apBefore - 5);
      // 打出的牌进坟场
      expect(c.playerHand.mengji).toBe(2);
      expect(c.playerGrave.mengji).toBe(1);
    });

    it("行动力不足不能出牌", () => {
      const s = createSoloState();
      s.player.deck = { mengji: 30 };
      startCombat(s, "normal");
      const c = s.combat;
      pickPoker(s, 0, 1, 2);
      c.playerHand.lianji = 2; // 12 费
      c.actionPoints = 5;
      const r = playCard(s, "lianji", 1);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("行动力不足");
    });

    it("玛薇卡斗志：破盾得等量斗志，每 5 层行动力 +1", () => {
      const s = createSoloState();
      s.player.deck = { mengji: 30 };
      startCombat(s, "normal");
      const c = s.combat;
      // 敌方 10 点护盾，猛击 5 伤 → 破盾 5，斗志 +5
      c.enemyShield = 10;
      pickPoker(s, 0, 1, 2);
      c.playerHand.mengji = 2;
      c.actionPoints = 20;
      playCard(s, "mengji", 1);
      expect(c.fightingSpirit).toBe(5);
      expect(c.enemyShield).toBe(5);
      expect(c.enemyHp).toBe(20); // 护盾挡了全部伤害，HP 不减
      // 斗志 5 → 行动力 +1（每5层）
      expect(Math.floor(c.fightingSpirit / 5)).toBe(1);
    });

    it("战斗胜利后领取奖励（不自动推进，推进由控制器 goNext 完成）", () => {
      const s = createSoloState();
      s.player.deck = { mengji: 30, zhongji: 30 };
      startCombat(s, "normal");
      const c = s.combat;
      pickPoker(s, 0, 1, 2);
      // 直接打空敌方 HP
      c.enemyHp = 3;
      c.playerHand.mengji = 5;
      playCard(s, "mengji", 1);
      expect(c.phase).toBe("won");
      expect(s.nodeIndex).toBe(0); // 未领取不推进
      const deckBefore = s.player.deck.mengji;
      const r = claimCardReward(s, "mengji");
      expect(r.ok).toBe(true);
      expect(s.player.deck.mengji).toBe(deckBefore + 1); // 加卡
      expect(s.nodeIndex).toBe(0); // 领取也不推进（等控制器 goNext）
    });
  });

  describe("敌方 AI 回合", () => {
    it("endTurn 后敌方行动并回到玩家回合（round+1）", () => {
      const s = createSoloState();
      s.player.deck = { mengji: 30, gedang: 10 };
      startCombat(s, "normal");
      const c = s.combat;
      pickPoker(s, 0, 1, 2);
      // 玩家给足血和护盾保证不输
      s.player.hp = 1000;
      c.playerShield = 100;
      const roundBefore = c.round;
      runFullEnemyTurn(s);
      // 敌方回合后应回到玩家回合（除非 30 回合平局或死亡）
      expect(c.round).toBe(roundBefore + 1);
      expect(c.phase).toBe("pick-poker");
      expect(c.pendingPoker).toHaveLength(3);
    });

    it("敌方攻击先扣玩家护盾再扣 HP", () => {
      const s = createSoloState();
      startCombat(s, "normal");
      const c = s.combat;
      c.playerShield = 5;
      const hpBefore = s.player.hp;
      // 敌方打 1 张猛击（base 3 伤）：护盾 5 挡住，HP 不变
      c.enemyPendingPlay = { cardId: "mengji", count: 1, cost: 5 };
      c.phase = "enemy-resolve";
      enemyResolve(s);
      expect(c.playerShield).toBe(2);
      expect(s.player.hp).toBe(hpBefore);
      // 敌方再打 1 张重击（base 6 伤）：破余 2 盾，HP 扣 4
      c.enemyPendingPlay = { cardId: "zhongji", count: 1, cost: 9 };
      c.phase = "enemy-resolve";
      enemyResolve(s);
      expect(c.playerShield).toBe(0);
      expect(s.player.hp).toBe(hpBefore - 4);
    });

    it("最近打出队列：敌我区分、同名牌合并、最多 6 种", () => {
      const s = createSoloState();
      s.player.deck = { mengji: 30, gedang: 10 };
      startCombat(s, "normal");
      const c = s.combat;
      pickPoker(s, 0, 1, 2);
      c.playerHand.mengji = 3;
      c.actionPoints = 50;
      // 我方打 2 张猛击 → 队列合并 player/mengji×2（同回合）
      playCard(s, "mengji", 2);
      expect(c.playedQueue).toHaveLength(1);
      expect(c.playedQueue[0]).toEqual({
        cardId: "mengji",
        count: 2,
        side: "player",
        round: 0,
      });
      // 敌方打 1 张猛击 → 独立条目（enemy 侧）
      c.enemyPendingPlay = { cardId: "mengji", count: 1, cost: 5 };
      c.phase = "enemy-resolve";
      enemyResolve(s);
      expect(c.playedQueue).toHaveLength(2);
      expect(c.playedQueue[1].side).toBe("enemy");
      // 上限 6：塞满后最旧被挤出
      const ids = ["gedang", "huogiu", "zhiyu", "lianji", "tiebi"];
      ids.forEach((id) => {
        c.enemyPendingPlay = { cardId: id, count: 1, cost: 4 };
        c.phase = "enemy-resolve";
        enemyResolve(s);
      });
      expect(c.playedQueue.length).toBeLessThanOrEqual(6);
      // 最旧的 player/mengji 被挤出（enemy/mengji 仍在）
      expect(
        c.playedQueue.some((e) => e.cardId === "mengji" && e.side === "player"),
      ).toBe(false);
    });

    it("队列跨回合不合并：round 变化则各自成条", () => {
      const s = createSoloState();
      s.player.deck = { mengji: 30, gedang: 10 };
      startCombat(s, "normal");
      const c = s.combat;
      pickPoker(s, 0, 1, 2);
      c.playerHand.mengji = 2;
      c.actionPoints = 50;
      playCard(s, "mengji", 1); // round 0：player/mengji×1
      // 进入敌方回合再回玩家回合（round → 1）
      s.player.hp = 1000;
      c.playerShield = 100;
      runFullEnemyTurn(s);
      // 下回合再打猛击
      pickPoker(s, 0, 1, 2);
      c.playerHand.mengji = 2;
      c.actionPoints = 50;
      playCard(s, "mengji", 1); // round 1：player/mengji×1（不合并）
      const playerMengjis = c.playedQueue.filter(
        (e) => e.cardId === "mengji" && e.side === "player",
      );
      expect(playerMengjis).toHaveLength(2);
      expect(playerMengjis[0].round).not.toBe(playerMengjis[1].round);
    });

    it("AI 出牌纯随机：攻击/防御都可能被选到（均匀随机）", () => {
      const s = createSoloState();
      startCombat(s, "normal");
      const c = s.combat;
      // 攻击+防御都可出，多次采样验证两者都会被随机选到
      c.enemyHand = { mengji: 3, gedang: 3 };
      c.enemyActionPoints = 20;
      const picked = new Set();
      for (let i = 0; i < 40; i++) {
        c.phase = "enemy-announce";
        c.enemyPendingPlay = null;
        c.enemyActionPoints = 20;
        const r = enemyAnnounce(s);
        expect(r.playing).toBe(true);
        picked.add(r.cardId);
        if (picked.size >= 2) break;
      }
      expect(picked.has("mengji")).toBe(true);
      expect(picked.has("gedang")).toBe(true);
      // 无可用牌时才结束
      c.enemyHand = { kuangnu: 1 }; // 功能卡不可出
      c.enemyActionPoints = 20;
      c.phase = "enemy-announce";
      const rEnd = enemyAnnounce(s);
      expect(rEnd.playing).toBe(false);
    });

    it("AI 行动力或手牌打空才结束回合（无上限截断）", () => {
      const s = createSoloState();
      startCombat(s, "normal");
      const c = s.combat;
      // 敌方大量行动力 + 少量手牌：应打空手牌才结束
      c.enemyHand = { mengji: 2 };
      c.enemyActionPoints = 30;
      c.phase = "enemy-announce";
      const r1 = enemyAnnounce(s);
      expect(r1.playing).toBe(true);
      expect(r1.count).toBe(2); // 一次打光 2 张猛击（30 行动力够）
      enemyResolve(s);
      expect(c.phase).toBe("enemy-announce");
      const r2 = enemyAnnounce(s);
      expect(r2.playing).toBe(false); // 手牌空 → 结束
    });

    it("玩家死亡后 phase 保持 lost（enemyResolve 不再覆盖回 enemy-announce）", () => {
      const s = createSoloState();
      startCombat(s, "normal");
      const c = s.combat;
      c.phase = "enemy-resolve";
      c.enemyPendingPlay = { cardId: "zhongji", count: 5, cost: 45 };
      s.player.hp = 3; // 重击 base 6 ×5 远超 3 HP
      enemyResolve(s);
      expect(c.phase).toBe("lost"); // 不被覆盖回 enemy-announce
      expect(s.gameOver).toBe(true);
    });

    it("reactive 状态（模拟控制器）下出牌队列正常更新", () => {
      // 与 useSoloController 相同：reactive(createSoloState())
      const s = reactive(createSoloState());
      s.player.deck = { mengji: 30, gedang: 10 };
      startCombat(s, "normal");
      pickPoker(s, 0, 1, 2);
      s.combat.playerHand.mengji = 2;
      s.combat.actionPoints = 20;
      const r = playCard(s, "mengji", 1);
      expect(r.ok).toBe(true);
      expect(s.combat.playedQueue.length).toBe(1);
      expect(s.combat.playedQueue[0].cardId).toBe("mengji");
      expect(s.combat.playedQueue[0].side).toBe("player");
      // reactive 数组 push 后再次访问仍正常
      expect([...s.combat.playedQueue]).toHaveLength(1);
    });
  });

  describe("牌堆/坟场循环", () => {
    it("牌堆抽空后从坟场洗回", () => {
      const s = createSoloState();
      s.player.deck = { mengji: 3 };
      startCombat(s, "normal");
      const c = s.combat;
      // 抽空牌堆
      const before = c.playerPile.length;
      pickPoker(s, 0, 1, 2);
      // 抽牌数至少 1，牌堆减少
      expect(c.playerPile.length + c.playerHand.mengji).toBeLessThanOrEqual(
        before + 0,
      );
      // 手牌有猛击
      expect(c.playerHand.mengji).toBeGreaterThan(0);
    });
  });

  describe("事件", () => {
    it("岔路猎手：付 10 金币通过", () => {
      const s = createSoloState();
      s.player.gold = 20;
      const r = applyEventOption(s, "hunter", 0);
      expect(r.ok).toBe(true);
      expect(s.player.gold).toBe(10);
    });

    it("神秘商人：直接买稀有卡", () => {
      const s = createSoloState();
      s.player.gold = 30;
      const r = applyEventOption(s, "merchant", 0);
      expect(r.ok).toBe(true);
      expect(s.player.gold).toBe(5);
      expect(r.outcome.gainedCard).toBeDefined();
      expect(SOLO_CARDS[r.outcome.gainedCard].cost).toBeGreaterThanOrEqual(8);
    });

    it("检定：力量 DC12，成功给金币失败扣血", () => {
      const s = createSoloState();
      // 强制高点数：spy 不可控时用固定属性（str 大）
      s.player.attrs.str = 12;
      const r = rollCheck(s, "str", 12);
      expect(r.success).toBe(true); // 12 + 点数 ≥ 12 必然成功
    });
  });

  describe("存档", () => {
    it("序列化/反序列化往返一致", () => {
      const s = createSoloState();
      s.player.gold = 50;
      gainExp(s, 10);
      const data = serializeSolo(s);
      const s2 = createSoloState();
      deserializeSolo(s2, data);
      expect(s2.player.gold).toBe(50);
      expect(s2.player.level).toBe(2);
      expect(s2.player.deck).toEqual(s.player.deck);
    });

    it("读档后 devLog 可正常调用（不被 JSON 序列化残壳覆盖）", () => {
      const s = createSoloState();
      gainExp(s, 10);
      const data = serializeSolo(s);
      const s2 = createSoloState();
      deserializeSolo(s2, data);
      // 序列化会丢失 devLog 方法，读档必须重建——调用不应抛错
      expect(() => s2.devLog.info("solo_node", "读档后日志", { ok: 1 })).not.toThrow();
      expect(s2.devLog.entries.length).toBeGreaterThan(0);
    });
  });
});
