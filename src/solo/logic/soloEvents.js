// 单机事件 — 文本 / 选项 / 扑克检定
// 纯逻辑层，零依赖（设计文档 §6.2）

import { createFullDeck, shuffleDeck, drawCards } from "../../game/deck.js";
import { LOG_TYPE } from "../../game/gameLogger.js";
import { addGold, healPlayer, removeRandomCard, addCards } from "./solo.js";
import { SOLO_CARDS } from "./soloConstants.js";

/**
 * 事件定义：
 * options[].type: 'fixed' 直接生效 | 'check' 扑克检定
 * check 项: attr(str/mag/def) + dc；success/fail 为各自结果
 * 结果字段: gold(±) / hp(±) / removeRandom(1) / addRareCard(1) / addCard(cardId)
 */
export const SOLO_EVENTS = {
  hunter: {
    id: "hunter",
    title: "岔路猎手",
    desc: "一名猎手拦住去路：\"要么付过路费，要么和我比试力气，绕路也行——你自己选。\"",
    options: [
      {
        text: "付 10 金币通过",
        type: "fixed",
        gold: -10,
        note: "安稳通过",
      },
      {
        text: "比试力量（检定·力量 DC12）",
        type: "check",
        attr: "str",
        dc: 12,
        success: { gold: 5, note: "你赢了！免费通过还得了 5 金" },
        fail: { hp: -5, note: "被推搡了一下，扣 5 HP" },
      },
      {
        text: "绕路，随机删 1 张卡",
        type: "fixed",
        removeRandom: 1,
        note: "绕远路，代价是丢掉一张卡",
      },
    ],
  },
  merchant: {
    id: "merchant",
    title: "神秘商人",
    desc: "黑市商人兜售一张稀有法术卡，但价格看起来有些可疑……",
    options: [
      {
        text: "花 25 金币直接买",
        type: "fixed",
        addRareCard: 1,
        gold: -25,
        note: "买到一张随机稀有卡",
      },
      {
        text: "砍价（检定·法力 DC13）",
        type: "check",
        attr: "mag",
        dc: 13,
        success: { addRareCard: 1, gold: -15, note: "谈成了！15 金成交" },
        fail: { addRareCard: 1, gold: -25, note: "谈崩了，原价 25 金" },
      },
      {
        text: "不买，得 5 金币",
        type: "fixed",
        gold: 5,
        note: "商人赏识你的谨慎",
      },
    ],
  },
};

/**
 * 扑克检定：抽 1 张扑克（点数 1-13）+ 属性修正 vs DC；
 * ♥ 花色检定失败时可重抽 1 次（§3.1）。
 */
export function rollCheck(state, attr, dc) {
  const deck = shuffleDeck(createFullDeck(1));
  const card = drawCards(deck, 1).drawn[0];
  let total = card.value + state.player.attrs[attr];
  let rerolled = false;
  if (card.suit === "♥" && total < dc) {
    const second = drawCards(deck, 1).drawn[0];
    if (second) {
      total = second.value + state.player.attrs[attr];
      rerolled = true;
    }
  }
  return { success: total >= dc, total, card, rerolled };
}

/** 应用事件选项结果（含检定），返回结果摘要 */
export function applyEventOption(state, eventId, optionIdx) {
  const ev = SOLO_EVENTS[eventId];
  if (!ev || !ev.options[optionIdx]) return { ok: false };
  const opt = ev.options[optionIdx];

  let outcome = opt;
  let check = null;
  if (opt.type === "check") {
    check = rollCheck(state, opt.attr, opt.dc);
    outcome = check.success ? opt.success : opt.fail;
  }

  // 应用效果
  if (outcome.gold) addGold(state, outcome.gold);
  if (outcome.hp) {
    if (outcome.hp < 0) {
      state.player.hp = Math.max(0, state.player.hp + outcome.hp);
    } else {
      healPlayer(state, outcome.hp);
    }
  }
  if (outcome.removeRandom) {
    const removed = removeRandomCard(state);
    outcome.removedCard = removed;
  }
  if (outcome.addRareCard) {
    const rareIds = Object.keys(SOLO_CARDS).filter(
      (id) => SOLO_CARDS[id].cost >= 8,
    );
    const picked = rareIds[Math.floor(Math.random() * rareIds.length)];
    addCards(state, picked, 1);
    outcome.gainedCard = picked;
  }
  if (outcome.addCard) {
    addCards(state, outcome.addCard, 1);
    outcome.gainedCard = outcome.addCard;
  }

  // 事件扣血致死判定
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.gameOver = true;
    outcome.dead = true;
  }

  // 事件日志（含检定详情）
  state.devLog.info(LOG_TYPE.SOLO_EVENT, `事件：${ev.title} → ${opt.text}`, {
    eventId,
    optionIdx,
    check: check
      ? { attr: opt.attr, dc: opt.dc, total: check.total, success: check.success, rerolled: check.rerolled, card: check.card?.rank + check.card?.suit }
      : null,
    outcome: {
      gold: outcome.gold || 0,
      hp: outcome.hp || 0,
      removedCard: outcome.removedCard || null,
      gainedCard: outcome.gainedCard || null,
      dead: outcome.dead || false,
    },
    playerHp: state.player.hp,
    gold: state.player.gold,
  });

  return { ok: true, option: opt, check, outcome };
}
