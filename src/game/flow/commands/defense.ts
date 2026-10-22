// 命令层 · defense — 由 flow/commands.js 拆分而来（纯搬运，行为不变）
import { display } from "../../core/cards.js";
import { CAT } from "../../core/log.js";
import { PENDING } from "../pending.js";
import { DEFENSE_MODIFIERS, collectModifiers, reduceModifiers } from "../../rules/modifiers.js";
import { friendlyTargets, isFriendly, unitByUid } from "../../core/units.js";
import { defenseModifiersOf, defenseHooks } from "../../characters/index.js";
import { resetAttackStreak } from "../../characters/helpers.js";

export function defense(ctx) {
  const state = ctx.state;
  if (state.pending) {
    ctx.devWarn(CAT.ANOMALY, `防御在非预期步骤执行: ${state.step}`);
    return false;
  }
  const player = ctx.players.current();
  if (player.relations.consecutiveGambles > 0) {
    player.relations.consecutiveGambles = 0;
  }
  resetAttackStreak(player);

  ctx.deck.ensure(1);
  const card = ctx.deck.draw(1)[0];
  if (!card) {
    // KB-8:牌库+墓地双空时旧实现会崩;这里保持"不崩但记录"的最小防御
    ctx.devError(CAT.ANOMALY, "牌库耗尽,无法防御");
    return false;
  }
  card.value = card.value;
  card.faceUp = false;
  ctx.drawEvent([card], {
    kind: "defense",
    actorUid: player.uid,
    hidden: true,
  });
  ctx.sound("defense");

  const rules = state.mode?.rules ?? {};
  if (rules.supportDefense) {
    ctx.ask({
      type: PENDING.TARGET,
      purpose: "defense.support",
      asker: player.uid,
      options: friendlyTargets(state, player).map((u) => u.uid),
      data: { card },
    });
    ctx.log(`${player.name} 执行防御，选择防御目标`);
    return true;
  }

  placeDefenseCard(ctx, player, player, card);
  runDefenseHooks(ctx, player);
  ctx.turn.pass();
  return true;
}

/** 把一张防御牌放进目标防御区（加成按「执行防御者」计算） */
export function placeDefenseCard(ctx, actor, target, card) {
  const originalValue = card.value;
  const env = { kind: "defense", source: actor, target };
  const { total } = reduceModifiers(
    ctx,
    originalValue,
    collectModifiers(DEFENSE_MODIFIERS, defenseModifiersOf(actor.characterId)),
    env,
  );

  card.defenseValue = total;
  card.maxDefenseValue = total;
  card.value = originalValue;
  card.faceUp = false;
  card.ownerUid = actor.uid;
  target.defensePile.push(card);

  const who = target.uid === actor.uid ? "自己" : target.name;
  ctx.log(`${actor.name} 为${who}防御`);
  ctx.dev(
    CAT.DEFENSE,
    `${actor.name} 防御(${who}): ${display(card)} ${originalValue}→${total}`,
    {
      cardId: card.id,
      originalValue,
      finalValue: total,
      defCount: target.defensePile.length,
      ownerUid: actor.uid,
      targetUid: target.uid,
      bonuses: {
        trade: ctx.state.currentWeather === "trade" ? 2 : 0,
        fullMoon:
          actor.characterId === 7 && actor.char.moonPhase === 1 ? 3 : 0,
        alliance:
          actor.relations.allyUid !== null &&
          actor.relations.allianceTurns > 0 &&
          actor.relations.betrayalPenalty <= 0
            ? 2
            : 0,
      },
    },
  );
  return card;
}

/** 防御支援：把已抽到的牌放进指定友方单位/塔 */
export function defenseTarget(ctx, targetUid) {
  const state = ctx.state;
  const pending = state.pending;
  if (!pending || pending.purpose !== "defense.support") return false;
  const actor = ctx.players.current();
  const target = unitByUid(state, targetUid);
  if (!target?.alive) return false;
  if (!isFriendly(actor, target)) {
    ctx.log("只能给己方角色或己方塔防御");
    return false;
  }

  const card = pending.data?.card;
  if (!card) return false;
  placeDefenseCard(ctx, actor, target, card);
  state.pending = null;
  runDefenseHooks(ctx, actor);
  if (!state.gameOver) ctx.turn.pass();
  return true;
}

/** 防御后的角色钩子（沃雅妮莎领唱 / 砂狼白子无人机拿盾） */
export function runDefenseHooks(ctx, actor) {
  for (const hook of defenseHooks()) {
    if (hook.id !== actor.characterId) continue;
    hook.run(ctx, actor);
  }
}

// ════════════════════════════════════════
//  赌命
// ════════════════════════════════════════
