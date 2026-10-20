import { PENDING } from "../flow/pending.js";
import { CAT } from "../core/log.js";
import { baseCanUse } from "./helpers.js";

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
      data: { cards },
    });
    ctx.log(`${player.name} 释放智慧之殿堂`);
  },

  onAnswer(ctx, player, pending, order) {
    if (!Array.isArray(order)) return;
    const cards = order.map((i) => pending.data.cards[i]).filter(Boolean);
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
};
