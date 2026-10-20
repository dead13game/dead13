// 伤害结算 — 唯一副作用入口
//
// 职责边界(与旧 applyDamage 对齐):
//   防御牌消耗 → 扣血 → clamp → 死亡处理 → 入墓 → 解散联盟 → 模式回调
// 一切「加成」都不在这里,而在 rules/modifiers.js 里先算完。

import { CAT } from "../core/log.js";
import { display } from "../core/cards.js";

/** 解除双方联盟关系(双向冗余,两边都要清) */
export function dissolveAlliance(ctx, player) {
  if (player.relations.allyUid !== null) {
    const ally = ctx.players.byUid(player.relations.allyUid);
    if (ally) {
      ally.relations.allyUid = null;
      ally.relations.allianceTurns = 0;
    }
  }
  player.relations.allyUid = null;
  player.relations.allianceTurns = 0;
}

/**
 * 对一名玩家造成伤害。
 * @returns {{ remaining: number, absorbed: number, hpDelta: number, died: boolean }}
 */
export function applyDamage(ctx, { target, amount, cause = "damage" }) {
  const state = ctx.state;
  const hpBefore = target.hp;
  const defCountBefore = target.defensePile.length;
  let damage = amount;

  // 赌命惩罚:受到的伤害 +1
  if (target.relations.gamblePenalty) {
    damage += 1;
    ctx.dev(CAT.GAMBLE, `赌命惩罚: ${target.name} 额外受到1点伤害`, {
      playerName: target.name,
      finalDamage: damage,
    });
  }

  let remaining = damage;

  ctx.devDebug(CAT.DAMAGE, `对 ${target.name} 造成 ${damage} 伤害`, {
    hpBefore,
    defCount: defCountBefore,
    damage,
  });

  // 防御判定:用 defenseValue 跟踪剩余防御,不改牌面 value
  while (remaining > 0 && target.defensePile.length > 0) {
    const top = target.defensePile[target.defensePile.length - 1];
    const defenseValue = top.defenseValue ?? top.value;
    if (!top.faceUp) top.faceUp = true;

    if (defenseValue >= remaining) {
      top.defenseValue = defenseValue - remaining;
      remaining = 0;
      if (top.defenseValue === 0) {
        target.defensePile.pop();
        if (!top.isShield) state.grave.push(top);
        ctx.log(`${target.name} 防御牌抵消`);
        ctx.devDebug(CAT.DAMAGE, `防御牌 ${display(top)} 完全消耗`, {
          value: defenseValue,
        });
      } else {
        ctx.log(`${target.name} 残盾 ${top.defenseValue}点`);
        ctx.devDebug(CAT.DAMAGE, `防御牌 ${display(top)} 残盾`, {
          before: defenseValue,
          after: top.defenseValue,
        });
      }
    } else {
      remaining -= defenseValue;
      ctx.sound("shield_break");
      ctx.log(`${target.name} 防御牌 ${display(top)} 被击穿`);
      ctx.devDebug(CAT.DAMAGE, `防御牌 ${display(top)} 被击穿`, {
        value: defenseValue,
        remainingAfter: remaining,
      });
      target.defensePile.pop();
      if (!top.isShield) state.grave.push(top);
    }
  }

  const absorbed = damage - remaining;

  if (remaining > 0) {
    target.hp -= remaining;
    ctx.sound("hit");
    ctx.log(`${target.name} HP ${target.hp}`);

    if (target.hp < 0) {
      ctx.devWarn(CAT.ANOMALY, `${target.name} HP 为负值 ${target.hp}，已修正为0`);
      target.hp = 0;
    }

    if (remaining > damage) {
      ctx.devError(CAT.ANOMALY, `剩余伤害(${remaining}) > 初始伤害(${damage})`, {
        player: target.name,
        remaining,
        damage,
        defCountBefore,
      });
    }

    ctx.hpChange(
      target.index,
      target.name,
      hpBefore,
      target.hp,
      target.hp - hpBefore,
      cause,
      { remaining },
    );

    if (target.hp <= 0) {
      kill(ctx, target, { hpBefore });
      return {
        remaining,
        absorbed,
        hpDelta: target.hp - hpBefore,
        died: true,
      };
    }
  }

  return {
    remaining,
    absorbed,
    hpDelta: target.hp - hpBefore,
    died: false,
  };
}

/** 死亡处理:标记、入墓、解散联盟、通知模式 */
function kill(ctx, player, { hpBefore }) {
  const state = ctx.state;
  player.alive = false;
  player.hp = 0;
  ctx.sound("kill");
  ctx.log(`${player.name} 阵亡`);
  ctx.dev(CAT.STATE, `${player.name} 阵亡`, {
    round: state.round,
    hpBeforeDeath: hpBefore,
  });

  // 丢弃所有牌入墓地(护盾牌除外)
  [...player.defensePile, player.trap, player.bait]
    .filter(Boolean)
    .filter((c) => !c.isShield)
    .forEach((c) => state.grave.push(c));
  player.defensePile = [];
  player.trap = null;
  player.bait = null;
  dissolveAlliance(ctx, player);

  ctx.mode?.onPlayerDeath?.(ctx, player);
  ctx.mode?.checkGameOver?.(ctx);
}
