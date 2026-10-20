// 陷阱判定 — 三态(反弹 / 平局 / 击破)
//
// 旧实现把这段写在 executeAttack 里,和攻击加成、圣遗物、围攻交叉在一起,
// 顺序极难读。这里抽成纯流程,调用方只需按返回值决定后续。

import { CAT } from "../core/log.js";
import { display } from "../core/cards.js";
import { applyDamage } from "./damage.js";
import { applyArtifactBoost, recordTrapBreak } from "./artifacts.js";

/** 陷阱被触发后,目标的赌命惩罚周期结束 */
function clearGamblePenalty(ctx, target, reason) {
  if (!target.relations.gamblePenalty && target.relations.consecutiveGambles <= 0) {
    return;
  }
  target.relations.gamblePenalty = false;
  target.relations.consecutiveGambles = 0;
  ctx.log(`${target.name} 赌命惩罚结束（${reason}）`);
  ctx.dev(CAT.GAMBLE, `赌命惩罚结束: ${target.name}（${reason}）`);
}

/**
 * 结算陷阱。
 * @returns {{ outcome: 'none'|'reflect'|'tie'|'break', trapValue?: number }}
 */
export function resolveTrap(ctx, { attacker, target, value }) {
  if (!target.trap) return { outcome: "none" };
  if (attacker.effects.ignoreTrapThisTurn) return { outcome: "none" };

  const trapValue = target.trap.value;
  target.trap.faceUp = true;

  ctx.log(`${target.name} 触发陷阱`);
  ctx.dev(CAT.DAMAGE, `陷阱判定: 攻击值=${value} vs 陷阱值=${trapValue}`, {
    attackValue: value,
    trapValue,
    trapCard: display(target.trap),
  });

  if (value < trapValue) {
    ctx.sound("trap_reflect");
    ctx.log(`陷阱反弹 ${attacker.name}`);
    ctx.dev(CAT.DAMAGE, `陷阱反弹: ${attacker.name} 受到 ${trapValue} 伤害`);
    consumeTrap(ctx, target);
    applyDamage(ctx, { target: attacker, amount: trapValue });
    clearGamblePenalty(ctx, target, "陷阱反弹");
    return { outcome: "reflect", trapValue };
  }

  if (value === trapValue) {
    ctx.sound("trap_tie");
    ctx.log("陷阱平局双方受伤");
    ctx.dev(CAT.DAMAGE, `陷阱平局: 双方各受 ${trapValue} 伤害`);
    consumeTrap(ctx, target);
    recordTrapBreak(ctx, attacker);

    // 平局时目标受到的伤害同样吃圣遗物加成
    let targetDamage = trapValue;
    if (attacker.artifact.active && attacker.artifact.id) {
      targetDamage = applyArtifactBoost(ctx, attacker, trapValue).value;
    }
    applyDamage(ctx, { target: attacker, amount: trapValue });
    applyDamage(ctx, { target, amount: targetDamage });
    clearGamblePenalty(ctx, target, "陷阱平局");

    if (attacker.characterId === 6) {
      addSpirit(ctx, attacker, 1, "陷阱平局");
    }
    return { outcome: "tie", trapValue };
  }

  ctx.sound("trap_break");
  ctx.log("陷阱被破");
  ctx.dev(CAT.DAMAGE, `陷阱被破: ${value} > ${trapValue}`);
  recordTrapBreak(ctx, attacker);
  if (attacker.characterId === 6) {
    addSpirit(ctx, attacker, 1, "击破陷阱");
  }
  consumeTrap(ctx, target);
  clearGamblePenalty(ctx, target, "陷阱被破");
  return { outcome: "break", trapValue };
}

/** 陷阱与诱饵一起入墓并清空 */
function consumeTrap(ctx, target) {
  const state = ctx.state;
  state.grave.push(target.trap);
  if (target.bait) state.grave.push(target.bait);
  target.trap = null;
  target.bait = null;
}

/** 玛薇卡斗志(上限 5) */
function addSpirit(ctx, player, amount, reason) {
  player.char.fightingSpirit = Math.min(5, (player.char.fightingSpirit || 0) + amount);
  ctx.log(`斗志 ${player.char.fightingSpirit}层`);
  ctx.devDebug(
    CAT.SKILL,
    `玛薇卡斗志+${amount} → ${player.char.fightingSpirit} (${reason})`,
  );
}
