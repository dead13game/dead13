// 命令层 · ally — 由 flow/commands.js 拆分而来（纯搬运，行为不变）
import { PHASE } from "../../core/constants.js";
import { display } from "../../core/cards.js";
import { CAT } from "../../core/log.js";
import { PENDING } from "../pending.js";
import { applyDamage, dissolveAlliance } from "../../rules/damage.js";
import { allianceTargets, formAlliance } from "../../rules/alliance.js";
import { resetAttackStreak } from "../../characters/helpers.js";
import { currentPlayer, isIdle } from "./query.js";
import { askPending } from "./pending-data.js";
import type { Ctx, Player } from "../../types.js";

export function ally(ctx: Ctx): boolean {
  const state = ctx.state;
  if (!isIdle(ctx)) return false;
  const player = currentPlayer(ctx);

  if (state.phase === PHASE.PEACE) return false;
  if (state.mode?.rules?.alliance === false) return false;
  if (state.players.length < (state.mode?.rules?.allyMinPlayers ?? 4)) {
    ctx.log("仅4人局及以上可结盟");
    return false;
  }

  if (player.relations.consecutiveGambles > 0) {
    player.relations.consecutiveGambles = 0;
  }
  resetAttackStreak(player);

  if (player.relations.allyUid !== null) {
    ctx.log("已有盟友，不可再结盟");
    return false;
  }
  if (player.relations.betrayalPenalty > 0) {
    ctx.log(`背刺惩罚中，${player.relations.betrayalPenalty}回合内不可结盟`);
    return false;
  }

  const targets: Player[] = allianceTargets(ctx, player);
  const options = targets.map((t) => t.uid);
  askPending(ctx, {
    type: PENDING.TARGET,
    purpose: "ally",
    asker: player.uid,
    options,
  });
  ctx.log(`${player.name} 选择结盟目标`);
  return true;
}

export function allyTarget(ctx: Ctx, targetUid: number): boolean {
  const state = ctx.state;
  const pending = state.pending;
  if (!pending || pending.purpose !== "ally") return false;

  const player = currentPlayer(ctx);
  const target = ctx.players.byUid(targetUid);
  if (!target?.alive) return false;
  if (target.relations.allyUid !== null) {
    ctx.log(`${target.name} 已有盟友`);
    return false;
  }

  formAlliance(ctx, player, target);
  ctx.turn.pass();
  return true;
}

export function betray(ctx: Ctx): boolean {
  const state = ctx.state;
  if (!isIdle(ctx)) return false;
  const player = currentPlayer(ctx);

  if (player.relations.consecutiveGambles > 0) {
    player.relations.consecutiveGambles = 0;
  }
  resetAttackStreak(player);
  if (player.relations.allyUid === null) {
    ctx.log("没有盟友可以背刺");
    return false;
  }

  const ally = ctx.players.byUid(player.relations.allyUid);
  if (!ally?.alive) return false;

  ctx.deck.ensure(1);
  const card = ctx.deck.draw(1)[0];
  card.faceUp = true;

  const dmg = card.value + 4;
  ctx.log(`${player.name} 背刺 ${ally.name}！${display(card)} +4 = ${dmg}`);
  ctx.dev(CAT.ALLIANCE, `${player.name} 背刺 ${ally.name}: ${display(card)}+4=${dmg}`, {
    cardValue: card.value,
    totalDamage: dmg,
    allyHpBefore: ally.hp,
  });

  applyDamage(ctx, { target: ally, amount: dmg });

  // 惩罚:防御/陷阱全明,10 回合不可结盟,被打伤害 +2
  for (const c of player.defensePile) c.faceUp = true;
  if (player.trap) player.trap.faceUp = true;
  if (player.bait) player.bait.faceUp = true;
  player.relations.betrayalPenalty = 10;
  player.relations.allianceTurns = 0;
  dissolveAlliance(ctx, player);

  if (!ally.alive) {
    player.hp = player.maxHp;
    for (let i = 0; i < 2; i++) {
      ctx.deck.ensure(1);
      const extra = ctx.deck.draw(1)[0];
      if (!extra) break;
      extra.faceUp = false;
      player.defensePile.push(extra);
    }
    ctx.log(`${player.name} 击杀盟友！回满血+2防御`);
  }

  ctx.log(
    `${player.name} 背刺惩罚：10回合不可结盟，防御/陷阱全明，被打伤害+2`,
  );
  state.grave.push(card);
  if (!state.gameOver) ctx.turn.pass();
  return true;
}

// ════════════════════════════════════════
