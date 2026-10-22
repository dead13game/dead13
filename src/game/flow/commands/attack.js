// 命令层 · attack — 由 flow/commands.js 拆分而来（纯搬运，行为不变）
import { PHASE } from "../../core/constants.js";
import { display } from "../../core/cards.js";
import { CAT } from "../../core/log.js";
import { PENDING } from "../pending.js";
import { ATTACK_MODIFIERS, POST_TRAP_MODIFIERS, collectModifiers, reduceModifiers } from "../../rules/modifiers.js";
import { applyDamage } from "../../rules/damage.js";
import { resolveTrap } from "../../rules/trap.js";
import { splitAllianceDamage } from "../../rules/alliance.js";
import { recordDefenseBreak } from "../../rules/artifacts.js";
import { attackTargets as kernelAttackTargets, isFriendly, unitByUid } from "../../core/units.js";
import { attackModifiersOf, damageDealtHooks } from "../../characters/index.js";
import { isIdle } from "./query.js";
import { ally } from "./ally.js";

// ════════════════════════════════════════
//  攻击
// ════════════════════════════════════════

export function attack(ctx) {
  const state = ctx.state;
  if (!isIdle(ctx)) return false;
  const player = ctx.players.current();

  if (player.relations.consecutiveGambles > 0) {
    player.relations.consecutiveGambles = 0;
  }

  const rules = state.mode?.rules ?? {};
  const gate = rules.attackGate ?? "round";
  const minRound = rules.attackMinRound ?? 4;
  const canAttack =
    gate === "phase" ? state.phase !== PHASE.PEACE : state.round >= minRound;

  if (!canAttack) {
    if (state.phase === PHASE.PEACE) ctx.log("和平阶段禁止攻击");
    else ctx.log(`第${minRound}回合后才能攻击`);
    return false;
  }

  // 橘雪梨「调查」：普通攻击被替换为调查，不抽攻击牌
  if (player.characterId === 14) {
    ctx.sound("attack");
    ctx.log(`${player.name} 展开调查`);
    ctx.ask({
      type: PENDING.TARGET,
      purpose: "attack:investigate",
      asker: player.uid,
      options: attackUids(ctx, player),
    });
    return true;
  }

  ctx.deck.ensure(1);
  const card = ctx.deck.draw(1)[0];
  if (!card) {
    // 理论上 ensure 已补牌;保底避免 undefined 崩溃
    ctx.devError(CAT.ANOMALY, "牌库耗尽,无法攻击");
    return false;
  }
  card.faceUp = false;
  ctx.drawEvent([card], { kind: "attack", actorUid: player.uid });

  ctx.sound("attack");
  state.pendingAttackCard = card;
  ctx.log(`${player.name} 攻击 摸出${display(card)}`);
  ctx.dev(CAT.ATTACK, `${player.name} 攻击抽牌: ${display(card)} (${card.value})`, {
    cardId: card.id,
    value: card.value,
    deckRemaining: state.deck.length,
  });

  ctx.ask({
    type: PENDING.TARGET,
    purpose: "attack",
    asker: player.uid,
    options: attackUids(ctx, player),
    data: { source: "attack", cards: [card], total: card.value },
  });
  return true;
}

/** 攻击/调查可选目标：敌方英雄 + 敌方召唤物 + 当前可拆的塔 */
export function attackUids(ctx, player) {
  return kernelAttackTargets(ctx.state, player).map((u) => u.uid);
}

export function attackTarget(ctx, targetUid) {
  const state = ctx.state;
  const pending = state.pending;
  if (!pending) return false;
  if (pending.purpose !== "attack" && pending.purpose !== "attack:investigate") {
    return false;
  }

  const attacker = ctx.players.current();
  const target = unitByUid(state, targetUid);
  if (!target?.alive) return false;

  const rules = state.mode?.rules ?? {};

  // 经典:不能攻击盟友(只能背刺)
  if (rules.blockAllyAttack && attacker.relations.allyUid === target.uid) {
    ctx.log("不能攻击盟友，请使用背刺");
    ctx.devWarn(CAT.ANOMALY, `${attacker.name} 尝试攻击盟友 ${target.name}`);
    resetAttackPending(ctx);
    return false;
  }

  // 队友（团战/联赛）不能攻击
  if (isFriendly(attacker, target)) {
    ctx.log("不能攻击队友");
    ctx.devWarn(CAT.ANOMALY, `${attacker.name} 尝试攻击队友 ${target.name}`);
    resetAttackPending(ctx);
    return false;
  }

  if (pending.purpose === "attack:investigate") {
    return resolveInvestigateTarget(ctx, attacker, target);
  }

  // 围攻计数(联赛/团战)：本回合第 2 次起伤害减半。
  // 补充说明：塔也吃围攻减半；无人机不算。
  const isBesieged = countBesiege(ctx, target, rules);

  // 薇斯纳：连续攻击计数（在结算前 +1，用于本次连击倍数）
  if (attacker.characterId === 16) {
    attacker.char.attackStreak = (attacker.char.attackStreak ?? 0) + 1;
    ctx.devDebug(
      CAT.ATTACK,
      `薇斯纳连续攻击 ${attacker.char.attackStreak} 次`,
      { streak: attacker.char.attackStreak },
    );
  }

  const cards = pending.data?.cards ?? [];
  const baseCardValue = state.pendingAttackCard?.value ?? cards[0]?.value ?? 0;
  const baseValue = pending.data?.total ?? baseCardValue;

  if (pending.data?.source === "venti") {
    ctx.log(
      `${attacker.name} 千风之诗 ${display(cards[0])} ${display(cards[1])}`,
    );
    ctx.dev(
      CAT.ATTACK,
      `温迪双卡攻击: ${display(cards[0])}+${display(cards[1])}=${baseValue}`,
    );
  } else {
    ctx.log(`${attacker.name} 攻击 ${target.name}`);
  }

  // 兼容字段先清掉(动画桥接依赖 pendingAttackCard → null 触发收牌动画)
  state.pendingAttackCard = null;
  state.pendingVentiCards = null;

  ctx.dev(CAT.ATTACK, `${attacker.name} → ${target.name}，基础伤害=${baseValue}`, {
    attackerHp: attacker.hp,
    targetHp: target.hp,
    targetDefCount: target.defensePile.length,
    targetHasTrap: !!target.trap,
  });

  const env = {
    kind: "attack",
    source: attacker,
    target,
    trapTriggered: false,
    besieged: false,
  };

  const pre = reduceModifiers(
    ctx,
    baseValue,
    collectModifiers(ATTACK_MODIFIERS, attackModifiersOf(attacker.characterId)),
    env,
  );
  let attackValue = pre.total;

  ctx.devDebug(CAT.DAMAGE, `攻击值修正完毕: ${baseCardValue} → ${attackValue}`, {
    baseValue: baseCardValue,
    finalValue: attackValue,
    delta: attackValue - baseCardValue,
  });

  // 陷阱判定
  const hadTrap = !!target.trap;
  const trap = resolveTrap(ctx, { attacker, target, value: attackValue });
  if (trap.outcome === "reflect" || trap.outcome === "tie") {
    ctx.deck.discard(...cards);
    if (!state.gameOver) ctx.turn.pass();
    return true;
  }
  // 旧实现的 `trapTriggered` 只在「反弹/平局」置真,而那两条分支立即返回;
  // 击破陷阱时它仍是 false —— 也就是说不阻断圣遗物加成、围攻减半与联盟平摊。
  const trapTriggered = false;

  // 陷阱之后:圣遗物加成 → 围攻减半
  const post = reduceModifiers(
    ctx,
    attackValue,
    collectModifiers(POST_TRAP_MODIFIERS),
    { source: attacker, target, trapTriggered, besieged: isBesieged },
  );
  attackValue = post.total;

  // 联盟平摊:先给盟友结算,再给目标结算(顺序与旧实现一致)
  let allyHit = null;
  if (!trapTriggered) {
    const split = splitAllianceDamage(ctx, { attacker, target, value: attackValue });
    if (split) {
      attackValue = split.value;
      allyHit = split;
    }
  }

  if (allyHit) {
    applyDamage(ctx, { target: allyHit.ally, amount: allyHit.allyValue });
  }

  const targetHpBeforeApply = target.hp;
  const beforeDefense = target.defensePile.length;
  applyDamage(ctx, { target, amount: attackValue });
  const actualHpLost = targetHpBeforeApply - target.hp;
  const defenseConsumed = beforeDefense - target.defensePile.length;

  recordDefenseBreak(ctx, attacker, defenseConsumed);

  if (actualHpLost > 0 && actualHpLost !== attackValue && !trapTriggered) {
    const wasOverkill = targetHpBeforeApply + defenseConsumed < attackValue;
    if (!wasOverkill && defenseConsumed === 0) {
      ctx.devWarn(CAT.ANOMALY, `伤害偏差: 攻击值=${attackValue} 但HP减少=${actualHpLost}`, {
        attackValue,
        actualHpLost,
        delta: attackValue - actualHpLost,
        defConsumed: defenseConsumed,
        hasAlly: target.relations.allyUid !== null,
      });
    }
  }

  // 只在「目标完全没有防御牌」时才可能是异常;防御吸收导致的低伤害是合法的(KB-4)
  if (
    baseCardValue >= 10 &&
    actualHpLost <= 3 &&
    !trapTriggered &&
    target.alive &&
    beforeDefense === 0
  ) {
    ctx.devWarn(
      CAT.ANOMALY,
      `高值卡低伤害: 基础${baseCardValue} 仅造成${actualHpLost}点伤害`,
      {
        cardValue: baseCardValue,
        attackValue,
        actualHpLost,
        targetDef: beforeDefense,
      },
    );
  }

  // 角色钩子:斗志 / 联盟击杀奖励 / 风堇被动
  runDamageDealtHooks(ctx, {
    attacker,
    target,
    attackValue,
    defenseConsumed,
    trapTriggered,
    hadTrap,
    actualHpLost,
  });

  ctx.dev(
    CAT.ATTACK,
    `攻击结算完毕: ${attacker.name}→${target.name}，目标HP: ${targetHpBeforeApply}→${target.hp}`,
    {
      attackerHp: attacker.hp,
      targetHp: target.hp,
      targetAlive: target.alive,
      actualHpLost,
      trapTriggered,
    },
  );

  ctx.deck.discard(...cards);
  attacker.effects.ignoreTrapThisTurn = false;
  state.pending = null;
  if (!state.gameOver) ctx.turn.pass();
  return true;
}

export function resetAttackPending(ctx) {
  const state = ctx.state;
  state.pendingAttackCard = null;
  state.pendingVentiCards = null;
  ctx.clearPending();
}

/** 围攻计数：同一目标本回合第 2 次及以后受攻击 → 减半（塔也吃，无人机不吃） */
export function countBesiege(ctx, target, rules) {
  if (!rules.besiege) return false;
  const kind = target.kind ?? "hero";
  if (kind !== "hero" && kind !== "tower") return false;
  target.relations.attackedThisRound =
    (target.relations.attackedThisRound || 0) + 1;
  const count = target.relations.attackedThisRound;
  if (count >= 2) {
    ctx.log(`${target.name} 被围攻（本回合第${count}次受击，伤害减半）`);
    ctx.dev(CAT.ATTACK, `围攻惩罚: ${target.name} 本回合第${count}次受击`, {
      targetIndex: target.index,
      attackedThisRound: count,
    });
    return true;
  }
  ctx.devDebug(CAT.ATTACK, `围攻计数: ${target.name} 本回合第1次受击`, {
    targetIndex: target.index,
  });
  return false;
}

/**
 * 橘雪梨「调查」的目标结算：
 *   - 有陷阱 → 询问猜测点数（由角色插件 onAnswer 结算）
 *   - 无陷阱 → 7 点普攻（吃天气/圣遗物，无视陷阱）
 */
export function resolveInvestigateTarget(ctx, attacker, target) {
  const state = ctx.state;
  const rules = state.mode?.rules ?? {};
  const isBesieged = countBesiege(ctx, target, rules);
  state.pendingAttackCard = null;

  if (target.trap) {
    ctx.ask({
      type: PENDING.TARGET,
      purpose: "investigate:guess",
      asker: attacker.uid,
      options: Array.from({ length: 13 }, (_, i) => i + 1),
      data: { targetUid: target.uid, besieged: isBesieged },
    });
    ctx.log(`${attacker.name} 调查 ${target.name}：猜测陷阱点数`);
    return true;
  }

  ctx.log(`${attacker.name} 调查 ${target.name}（无陷阱，造成7点伤害）`);
  const env = {
    kind: "attack",
    source: attacker,
    target,
    trapTriggered: false,
    besieged: isBesieged,
  };
  let value = reduceModifiers(
    ctx,
    7,
    collectModifiers(ATTACK_MODIFIERS, attackModifiersOf(attacker.characterId)),
    env,
  ).total;
  value = reduceModifiers(
    ctx,
    value,
    collectModifiers(POST_TRAP_MODIFIERS),
    env,
  ).total;

  const beforeDef = target.defensePile.length;
  const hpBefore = target.hp;
  applyDamage(ctx, { target, amount: value });
  const defenseConsumed = beforeDef - target.defensePile.length;
  recordDefenseBreak(ctx, attacker, defenseConsumed);
  runDamageDealtHooks(ctx, {
    attacker,
    target,
    attackValue: value,
    defenseConsumed,
    trapTriggered: false,
    hadTrap: false,
    actualHpLost: hpBefore - target.hp,
  });
  ctx.log(`${attacker.name} 调查命中 ${target.name} ${value}点`);
  state.pending = null;
  if (!state.gameOver) ctx.turn.pass();
  return true;
}

/** 按优先级运行「命中后」钩子;联盟击杀奖励插在斗志与风堇被动之间 */
export function runDamageDealtHooks(ctx, env) {
  const hooks = [
    ...damageDealtHooks(),
    {
      id: "rules.allyKillBonus",
      priority: 15,
      run(c, e) {
        if (e.target.alive) return;
        if (e.attacker.relations.allyUid === null) return;
        const ally = c.players.byUid(e.attacker.relations.allyUid);
        if (!ally?.alive) return;
        ally.relations.allyKillBonus = true;
        c.log(`${ally.name} 获得联盟击杀奖励`);
        c.dev(CAT.ALLIANCE, `${ally.name} 获得联盟击杀奖励`, {
          attacker: e.attacker.name,
          killed: e.target.name,
        });
      },
    },
  ].sort((a, b) => a.priority - b.priority);

  for (const hook of hooks) hook.run(ctx, env);
}

// ════════════════════════════════════════
//  防御
// ════════════════════════════════════════
