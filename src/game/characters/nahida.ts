import { PENDING } from "../flow/pending.js";
import { CAT } from "../core/log.js";
import { baseCanUse } from "./helpers.js";
import type { Card, CharacterDef } from "../types.js";

// 纳西妲 · 智慧之殿堂:查看牌库顶 5 张任意重排,随后再行动一次
export default {
  id: 4,
  meta: {
    id: 4,
    name: "纳西妲",
    title: "草神·布耶尔",
    icon: "./images/纳西妲.jpg",
    hp: 12,
    speed: 9,
    skillName: "智慧之殿堂",
    skillType: "active",
    skillDesc: "查看牌库顶5张牌并按任意顺序放回，随后可再行动一次",
    maxUses: 3,
    loadMaxUses: 0,
  },
  stateSchema: {},

  canUse: baseCanUse,

  use(ctx, player) {
    ctx.deck.ensure(5);
    const cards = ctx.deck.draw(5).map((c) => ({ ...c, faceUp: true }));
    ctx.state.scryCards = cards;
    player.resources.skillUses--;

    ctx.ask({
      type: PENDING.SCRY,
      purpose: "skill:nahida",
      asker: player.uid,
      options: [],
      data: { cards },
    });
    ctx.log(`${player.name} 释放智慧之殿堂`);
  },

  onAnswer(ctx, player, pending, order) {
    if (!Array.isArray(order)) return;
    // 作答与 pending.data 都是命令层写入的外部形状（types.ts 的约定）：
    // 纳西妲的作答是「牌序索引数组」，data.cards 是本次查看的 5 张牌。
    // 收窄后直接索引，与迁移前 `pending.data.cards[i]` 的取值完全一致。
    const orderIds = order as number[];
    const data = pending.data as { cards: Card[] };
    const cards = orderIds.map((i) => data.cards[i]).filter(Boolean);
    cards.reverse();
    cards.forEach((c) => {
      c.faceUp = false;
    });
    ctx.state.deck.push(...cards);
    ctx.state.scryCards = null;

    ctx.log(`${player.name} 牌库顶重排`);
    ctx.devDebug(CAT.SKILL, `纳西妲重排 ${cards.length} 张`, {
      order,
    });
    ctx.turn.extra();
  },
} satisfies CharacterDef;
