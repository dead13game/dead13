import { PHASE } from "../core/constants.js";
import { display } from "../core/cards.js";
import { PENDING } from "../flow/pending.js";
import { baseCanUse, withTurnGate, enemyTargetUids } from "./helpers.js";

// 温迪 · 千风之诗:攻击时抽 2 张,点数相加作为本次攻击总伤害(第 10 回合解锁)
export default {
  id: 1,
  meta: {
    id: 1,
    name: "温迪",
    title: "风神·巴巴托斯",
    icon: "./images/温迪.jpg",
    hp: 11,
    speed: 10,
    skillName: "千风之诗",
    skillType: "active",
    skillDesc: "攻击时抽2张牌，点数相加作为本次攻击的总伤害（第10回合解锁）",
    maxUses: 3,
    loadMaxUses: 0,
  },
  stateSchema: {},

  canUse: baseCanUse,
  canUseNow: withTurnGate(baseCanUse, { minRound: 10, requireNormal: true }),

  use(ctx, player) {
    const { state } = ctx;
    if (state.phase === PHASE.PEACE) {
      ctx.log("和平阶段禁止攻击");
      return;
    }
    if (state.round < 10) {
      ctx.log("第10回合后才能使用");
      return;
    }

    ctx.deck.ensure(2);
    const cards = ctx.deck.draw(2).map((c) => ({ ...c, faceUp: false }));
    ctx.drawEvent(cards, { kind: "venti", actorUid: player.uid });
    const total = cards[0].value + cards[1].value;
    player.resources.skillUses--;

    // 兼容字段:UI 的中央牌与双卡展示直接读它们(P6 再收敛)
    state.pendingVentiCards = cards;
    state.pendingAttackCard = { ...cards[0], value: total, faceUp: true };

    ctx.log(
      `${player.name} 千风之诗 ${display(cards[0])} ${display(cards[1])}`,
    );
    cards.forEach((c) => {
      c.faceUp = true;
    });

    ctx.ask({
      type: PENDING.TARGET,
      purpose: "attack",
      asker: player.uid,
      options: enemyTargetUids(ctx, player),
      data: { source: "venti", cards, total },
    });
  },
};
