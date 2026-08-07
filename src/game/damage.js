import { PHASE } from "./constants.js";
import { cardDisplay } from "./deck.js";
import { CAT } from "./gameLogger.js";
import { recordSound } from "./soundEvents.js";

/** 解除双方的联盟关系 */
export function dissolveAlliance(state, player) {
  const ally = state.players.find(
    (p) => p.index === player.relations.allyIndex,
  );
  if (ally) {
    ally.relations.allyIndex = null;
    ally.relations.allianceTurns = 0;
  }
  player.relations.allyIndex = null;
  player.relations.allianceTurns = 0;
}

/** 对一名玩家造成伤害（处理防御结算、扣血、死亡） */
export function applyDamage(state, player, damage) {
  const hpBefore = player.hp;
  const defCountBefore = player.defensePile.length;

  // 赌命惩罚：有 gamblePenalty 的角色受到的伤害+1
  if (player.relations.gamblePenalty) {
    damage += 1;
    state.devLog.info(CAT.GAMBLE, `赌命惩罚: ${player.name} 额外受到1点伤害`, {
      playerName: player.name,
      finalDamage: damage,
    });
  }

  let remaining = damage;

  state.devLog.debug(CAT.DAMAGE, `对 ${player.name} 造成 ${damage} 伤害`, {
    hpBefore,
    defCount: defCountBefore,
    damage,
  });

  // 防御判定
  // 使用 defenseValue 跟踪剩余防御值，不修改 card.value（保留原始牌面值）
  while (remaining > 0 && player.defensePile.length > 0) {
    const top = player.defensePile[player.defensePile.length - 1];
    const defenseValue = top.defenseValue ?? top.value;
    if (!top.faceUp) top.faceUp = true;

    if (defenseValue >= remaining) {
      top.defenseValue = defenseValue - remaining;
      remaining = 0;
      if (top.defenseValue === 0) {
        player.defensePile.pop();
        if (!top.isShield) state.grave.push(top);
        state.messageLog.push(`${player.name} 防御牌抵消`);
        state.devLog.debug(CAT.DAMAGE, `防御牌 ${cardDisplay(top)} 完全消耗`, {
          value: defenseValue,
        });
      } else {
        state.messageLog.push(`${player.name} 残盾 ${top.defenseValue}点`);
        state.devLog.debug(CAT.DAMAGE, `防御牌 ${cardDisplay(top)} 残盾`, {
          before: defenseValue,
          after: top.defenseValue,
        });
      }
    } else {
      remaining -= defenseValue;
      recordSound(state, "shield_break");
      state.messageLog.push(`${player.name} 防御牌 ${cardDisplay(top)} 被击穿`);
      state.devLog.debug(CAT.DAMAGE, `防御牌 ${cardDisplay(top)} 被击穿`, {
        value: defenseValue,
        remainingAfter: remaining,
      });
      player.defensePile.pop();
      if (!top.isShield) state.grave.push(top);
    }
  }

  // 扣血
  if (remaining > 0) {
    player.hp -= remaining;
    state.messageLog.push(`${player.name} HP ${player.hp}`);

    if (player.hp < 0) {
      state.devLog.warn(
        CAT.ANOMALY,
        `${player.name} HP 为负值 ${player.hp}，已修正为0`,
      );
      player.hp = 0;
    }

    if (remaining > damage) {
      state.devLog.error(
        CAT.ANOMALY,
        `剩余伤害(${remaining}) > 初始伤害(${damage})`,
        {
          player: player.name,
          remaining,
          damage,
          defCountBefore,
        },
      );
    }

    state.devLog.hpChange(
      player.index,
      player.name,
      hpBefore,
      player.hp,
      player.hp - hpBefore,
      "damage",
      { remaining },
    );

    if (player.hp <= 0) {
      player.alive = false;
      player.hp = 0;
      recordSound(state, "kill");
      state.messageLog.push(`${player.name} 阵亡`);
      state.devLog.info(CAT.STATE, `${player.name} 阵亡`, {
        round: state.round,
        hpBeforeDeath: hpBefore,
      });

      // 丢弃所有牌入墓地（护盾牌除外）
      [...player.defensePile, player.trap, player.bait]
        .filter(Boolean)
        .filter((c) => !c.isShield)
        .forEach((c) => state.grave.push(c));
      player.defensePile = [];
      player.trap = null;
      player.bait = null;
      dissolveAlliance(state, player);

      // 联赛模式：每次死亡都通知控制器记录死亡顺序
      if (state.leagueContext) {
        state.leagueContext.onPlayerDeath(player.index);
      }

      checkGameOver(state);
      return remaining;
    }
  }

  return remaining;
}

/** 存活玩家 */
export function alivePlayers(state) {
  return state.players.filter((p) => p.alive);
}

/** 检查游戏结束 */
export function checkGameOver(state) {
  const alive = alivePlayers(state);

  // 联赛模式：只做团灭检测（个人死亡已在 applyDamage 中通知）
  if (state.leagueContext) {
    if (alive.length === 0) return;
    const teamsAlive = new Set(alive.map((p) => p.teamId));
    if (teamsAlive.size <= 1) {
      if (state._elimGuard) return;
      state._elimGuard = true;
      const survivingTeam = [...teamsAlive][0];
      state.devLog.info(
        CAT.STATE,
        `联赛团队团灭: 只剩队伍${survivingTeam}存活`,
        { round: state.round, alivePlayers: alive.map((p) => p.name) },
      );
      state.leagueContext.onTeamWipe(survivingTeam);
      state._elimPaused = true;
    }
    return;
  }

  if (alive.length <= 1) {
    // 比赛模式：不结束游戏，交给 matchContext 处理
    if (state.matchContext) {
      if (state._elimGuard) return;
      state._elimGuard = true;
      const deadIdx = state.players.findIndex((p) => !p.alive);
      const killerIdx = alive[0]?.index ?? -1;
      state.devLog.info(
        CAT.STATE,
        `比赛淘汰: 玩家${deadIdx}被击杀，击杀者${killerIdx}`,
        {
          deadIdx,
          killerIdx,
          round: state.round,
          alivePlayers: alive.map((p) => p.name),
        },
      );
      state.matchContext.onPlayerEliminated(deadIdx, killerIdx, state.round);
      state._elimPaused = true;
      return;
    }
    state.gameOver = true;
    state.winnerIndex = alive[0]?.index ?? -1;
    state.phase = PHASE.GAME_OVER;
    if (alive.length === 1) {
      state.messageLog.push(`${alive[0].name} 获胜`);
    } else {
      state.messageLog.push("全员阵亡");
    }
  }
}
