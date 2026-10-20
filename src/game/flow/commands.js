// 命令层 — 玩家/AI 的每一个动作都从这里进
//
// 约定:
//   - 每个 handler 自己决定「是否结束行动」(pass / extra),命令层不统一收尾。
//     这与旧实现一致(每个技能函数内部自己调 endAction)。
//   - 所有加成先过 rules/modifiers 管道,再进 rules/damage 结算。

import { PHASE, STEP } from "../core/constants.js";
import { display } from "../core/cards.js";
import { CAT } from "../core/log.js";
import { PENDING } from "./pending.js";

import {
  ATTACK_MODIFIERS,
  DEFENSE_MODIFIERS,
  POST_TRAP_MODIFIERS,
  collectModifiers,
  reduceModifiers,
} from "../rules/modifiers.js";
import { applyDamage, dissolveAlliance } from "../rules/damage.js";
import { resolveTrap } from "../rules/trap.js";
import {
  allianceTargets,
  canFormAlliance,
  formAlliance,
  splitAllianceDamage,
} from "../rules/alliance.js";
import { executeHolyWord, recordDefenseBreak } from "../rules/artifacts.js";

import {
  attackModifiersOf,
  defenseModifiersOf,
  damageDealtHooks,
  getCharData,
  getCharacter,
} from "../characters/index.js";
import { otherAliveUids } from "../characters/helpers.js";

// ════════════════════════════════════════
//  查询
// ════════════════════════════════════════

/** 主动技能可用性(对齐旧 canUseSkill) */
export function canUseSkill(ctx, player) {
  const meta = getCharData(player);
  if (!meta || meta.skillType !== "active") return false;
  const def = getCharacter(player.characterId);
  if (!def?.canUse) return false;
  return def.canUse(ctx, player);
}

/** 是否处于行动步(旧 state.step === "pickAction") */
export function isIdle(ctx) {
  return ctx.state.pending == null && !ctx.state.gameOver;
}

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

  ctx.deck.ensure(1);
  const card = ctx.deck.draw(1)[0];
  card.faceUp = false;

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
    options: otherAliveUids(ctx, player),
    data: { source: "attack", cards: [card], total: card.value },
  });
  return true;
}

export function attackTarget(ctx, targetUid) {
  const state = ctx.state;
  const pending = state.pending;
  if (!pending || pending.purpose !== "attack") return false;

  const attacker = ctx.players.current();
  const target = ctx.players.byUid(targetUid);
  if (!target?.alive) return false;

  const rules = state.mode?.rules ?? {};

  // 经典:不能攻击盟友(只能背刺)
  if (rules.blockAllyAttack && attacker.relations.allyUid === target.uid) {
    ctx.log("不能攻击盟友，请使用背刺");
    ctx.devWarn(CAT.ANOMALY, `${attacker.name} 尝试攻击盟友 ${target.name}`);
    resetAttackPending(ctx);
    return false;
  }

  // 联赛:不能攻击队友
  if (attacker.teamId >= 0 && attacker.teamId === target.teamId) {
    ctx.log("不能攻击队友");
    ctx.devWarn(CAT.ANOMALY, `${attacker.name} 尝试攻击队友 ${target.name}`);
    resetAttackPending(ctx);
    return false;
  }

  // 围攻计数(联赛规则 v3.0):本回合第 2 次起伤害减半
  let isBesieged = false;
  if (rules.besiege && target.teamId >= 0) {
    target.relations.attackedThisRound =
      (target.relations.attackedThisRound || 0) + 1;
    isBesieged = target.relations.attackedThisRound >= 2;
    if (isBesieged) {
      ctx.log(
        `${target.name} 被围攻（本回合第${target.relations.attackedThisRound}次受击，伤害减半）`,
      );
      ctx.dev(
        CAT.ATTACK,
        `围攻惩罚: ${target.name} 本回合第${target.relations.attackedThisRound}次受击，伤害减半`,
        {
          targetIndex: target.index,
          attackedThisRound: target.relations.attackedThisRound,
        },
      );
    } else {
      ctx.devDebug(
        CAT.ATTACK,
        `围攻计数: ${target.name} 本回合第1次受击（不受影响）`,
        {
          targetIndex: target.index,
          attackedThisRound: target.relations.attackedThisRound,
        },
      );
    }
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

  if (baseCardValue >= 10 && actualHpLost <= 3 && !trapTriggered && target.alive) {
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

function resetAttackPending(ctx) {
  const state = ctx.state;
  state.pendingAttackCard = null;
  state.pendingVentiCards = null;
  ctx.clearPending();
}

/** 按优先级运行「命中后」钩子;联盟击杀奖励插在斗志与风堇被动之间 */
function runDamageDealtHooks(ctx, env) {
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

  ctx.deck.ensure(1);
  const card = ctx.deck.draw(1)[0];
  if (!card) {
    // KB-8:牌库+墓地双空时旧实现会崩;这里保持"不崩但记录"的最小防御
    ctx.devError(CAT.ANOMALY, "牌库耗尽,无法防御");
    return false;
  }

  const originalValue = card.value;
  ctx.sound("defense");

  const env = { kind: "defense", source: player, target: null };
  const { total } = reduceModifiers(
    ctx,
    originalValue,
    collectModifiers(DEFENSE_MODIFIERS, defenseModifiersOf(player.characterId)),
    env,
  );

  card.defenseValue = total;
  card.value = originalValue;
  card.faceUp = false;
  player.defensePile.push(card);

  ctx.log(`${player.name} 执行防御`);
  ctx.dev(
    CAT.DEFENSE,
    `${player.name} 防御: ${display(card)} ${originalValue}→${total}`,
    {
      cardId: card.id,
      originalValue,
      finalValue: total,
      defCount: player.defensePile.length,
      bonuses: {
        trade: state.currentWeather === "trade" ? 2 : 0,
        fullMoon:
          player.characterId === 7 && player.char.moonPhase === 1 ? 3 : 0,
        alliance:
          player.relations.allyUid !== null &&
          player.relations.allianceTurns > 0 &&
          player.relations.betrayalPenalty <= 0
            ? 2
            : 0,
      },
    },
  );

  ctx.turn.pass();
  return true;
}

// ════════════════════════════════════════
//  赌命
// ════════════════════════════════════════

export function gamble(ctx) {
  const state = ctx.state;
  if (!isIdle(ctx)) return false;
  const player = ctx.players.current();

  ctx.deck.ensure(1);

  let drawCount = 2;
  if (player.characterId === 7 && player.char.moonPhase === 2) drawCount = 3;
  if (state.currentWeather === "wind") drawCount += 1;

  const drawn = ctx.deck.draw(drawCount).map((c) => ({ ...c, faceUp: true }));

  ctx.sound("gamble");
  ctx.log(`${player.name} 执行赌命`);
  ctx.dev(
    CAT.GAMBLE,
    `${player.name} 赌命抽${drawn.length}张: ${drawn.map(display).join(" ")}`,
    {
      drawCount,
      cards: drawn.map((c) => ({ display: display(c), value: c.value })),
      bonuses: {
        newMoon: player.characterId === 7 && player.char.moonPhase === 2,
        wind: state.currentWeather === "wind",
      },
    },
  );

  player.relations.consecutiveGambles =
    (player.relations.consecutiveGambles || 0) + 1;
  ctx.dev(
    CAT.GAMBLE,
    `${player.name} 连续赌命 ${player.relations.consecutiveGambles} 次`,
    { consecutiveGambles: player.relations.consecutiveGambles },
  );

  if (
    player.relations.consecutiveGambles >= 3 &&
    !player.relations.gamblePenalty
  ) {
    player.relations.gamblePenalty = true;
    ctx.log(`${player.name} 连续赌命3次，被标记惩罚！受到的伤害+1`);
    ctx.dev(CAT.GAMBLE, `赌命惩罚开始: ${player.name}`, {
      consecutiveGambles: player.relations.consecutiveGambles,
    });
  }

  // 兼容字段(动画桥接与 ActionBar 读它)
  state.pendingGamble = { drawnCards: drawn };
  ctx.ask({
    type: PENDING.GAMBLE,
    purpose: "gamble",
    asker: player.uid,
    data: { cards: drawn },
  });
  return true;
}

export function gambleSubmit(ctx, trapIdx, baitIdx) {
  const state = ctx.state;
  const pending = state.pending;
  if (!pending || pending.type !== PENDING.GAMBLE) return false;
  if (trapIdx === baitIdx) return false;

  const player = ctx.players.current();
  const cards = pending.data.cards;
  const trapCard = cards[trapIdx];
  const baitCard = cards[baitIdx];
  if (!trapCard || !baitCard) return false;

  if (player.trap) state.grave.push(player.trap);
  if (player.bait) state.grave.push(player.bait);

  trapCard.faceUp = false;
  player.trap = trapCard;
  baitCard.faceUp = true;
  player.bait = baitCard;

  cards.forEach((c, i) => {
    if (i !== trapIdx && i !== baitIdx) state.grave.push(c);
  });

  ctx.log(`${player.name} 设陷阱 诱饵${display(baitCard)}`);
  ctx.dev(
    CAT.GAMBLE,
    `${player.name} 设陷阱: 陷阱=${display(trapCard)}(${trapCard.value}) 诱饵=${display(baitCard)}(${baitCard.value})`,
    {
      trapValue: trapCard.value,
      baitValue: baitCard.value,
      discarded: cards
        .filter((_, i) => i !== trapIdx && i !== baitIdx)
        .map(display),
    },
  );

  state.pendingGamble = null;
  ctx.turn.pass();
  return true;
}

// ════════════════════════════════════════
//  技能
// ════════════════════════════════════════

export function skill(ctx) {
  const state = ctx.state;
  if (!isIdle(ctx)) return false;
  const player = ctx.players.current();

  if (!canUseSkill(ctx, player)) {
    ctx.devWarn(
      CAT.ANOMALY,
      `${player.name} 尝试使用技能但 canUseSkill=false`,
      {
        skillUses: player.resources.skillUses,
        skillType: getCharData(player)?.skillType,
        weather: state.currentWeather,
        step: state.step,
      },
    );
    return false;
  }

  if (player.relations.consecutiveGambles > 0) {
    player.relations.consecutiveGambles = 0;
  }

  ctx.sound("skill");
  ctx.dev(CAT.SKILL, `${player.name} 释放技能: ${getCharData(player).skillName}`, {
    characterId: player.characterId,
    skillUsesBefore: player.resources.skillUses,
  });

  const def = getCharacter(player.characterId);
  def.use(ctx, player);
  return true;
}

/** 作答:把 pending 交给发起者的插件处理 */
export function skillAnswer(ctx, answer) {
  const state = ctx.state;
  const pending = state.pending;
  if (!pending) return false;

  const asker = ctx.players.byUid(pending.asker);
  if (!asker) return false;
  const def = getCharacter(asker.characterId);
  if (!def?.onAnswer) return false;

  def.onAnswer(ctx, asker, pending, answer);
  return true;
}

// ════════════════════════════════════════
//  结盟 / 背刺
// ════════════════════════════════════════

export function ally(ctx) {
  const state = ctx.state;
  if (!isIdle(ctx)) return false;
  const player = ctx.players.current();

  if (state.phase === PHASE.PEACE) return false;
  if (state.mode?.rules?.alliance === false) return false;
  if (state.players.length < (state.mode?.rules?.allyMinPlayers ?? 4)) {
    ctx.log("仅4人局及以上可结盟");
    return false;
  }

  if (player.relations.consecutiveGambles > 0) {
    player.relations.consecutiveGambles = 0;
  }

  if (player.relations.allyUid !== null) {
    ctx.log("已有盟友，不可再结盟");
    return false;
  }
  if (player.relations.betrayalPenalty > 0) {
    ctx.log(`背刺惩罚中，${player.relations.betrayalPenalty}回合内不可结盟`);
    return false;
  }

  const options = allianceTargets(ctx, player).map((t) => t.uid);
  ctx.ask({
    type: PENDING.TARGET,
    purpose: "ally",
    asker: player.uid,
    options,
  });
  ctx.log(`${player.name} 选择结盟目标`);
  return true;
}

export function allyTarget(ctx, targetUid) {
  const state = ctx.state;
  const pending = state.pending;
  if (!pending || pending.purpose !== "ally") return false;

  const player = ctx.players.current();
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

export function betray(ctx) {
  const state = ctx.state;
  if (!isIdle(ctx)) return false;
  const player = ctx.players.current();

  if (player.relations.consecutiveGambles > 0) {
    player.relations.consecutiveGambles = 0;
  }
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
//  圣言自明 / 取消
// ════════════════════════════════════════

export function holyWord(ctx) {
  return executeHolyWord(ctx);
}

/** 取消当前待决(替代 UI 直接改 step + 手清私有 flag,顺带修掉 KB-2) */
export function cancel(ctx) {
  const state = ctx.state;
  state.pendingAttackCard = null;
  state.pendingVentiCards = null;
  state.pendingGamble = null;
  state.scryCards = null;
  ctx.clearPending();
  return true;
}

// ════════════════════════════════════════
//  分发
// ════════════════════════════════════════

const HANDLERS = {
  attack: (ctx) => attack(ctx),
  attackTarget: (ctx, cmd) => attackTarget(ctx, cmd.targetUid),
  defense: (ctx) => defense(ctx),
  gamble: (ctx) => gamble(ctx),
  gambleSubmit: (ctx, cmd) => gambleSubmit(ctx, cmd.trapIdx, cmd.baitIdx),
  skill: (ctx) => skill(ctx),
  skillAnswer: (ctx, cmd) => skillAnswer(ctx, cmd.answer),
  ally: (ctx) => ally(ctx),
  allyTarget: (ctx, cmd) => allyTarget(ctx, cmd.targetUid),
  betray: (ctx) => betray(ctx),
  holyWord: (ctx) => holyWord(ctx),
  cancel: (ctx) => cancel(ctx),
};

export function dispatch(ctx, command) {
  const handler = HANDLERS[command.type];
  if (!handler) throw new Error(`commands: 未知命令 ${command.type}`);
  return handler(ctx, command);
}
