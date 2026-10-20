// 联赛（3V3）单场模式适配器
//
// 与经典/比赛模式的差别（全部在这条 rules 里，不再靠「context 是否存在」隐式切换）：
//   - 每场固定 4 回合和平期（DC-1：修正旧实现「首场 4 回合、后续 0 回合」的时序 bug）
//   - 禁用结盟/背刺（DC-2）
//   - 围攻计数（同回合第 2 次受击伤害减半）
//   - 允许攻击队友的拦截仍生效（teamId 相同直接拒绝）
//   - 回合上限 + 劣势方防御补给

import { CAT } from "../core/log.js";

export const LEAGUE_MATCH_RULES = {
  peaceRounds: 4,
  attackGate: "round",
  attackMinRound: 4,
  alliance: false, // DC-2
  allyMinPlayers: 99,
  besiege: true,
  blockAllyAttack: false,
};

/** 劣势方防御补给:双方存活人数不等时,劣势方每人获得 X 张防御牌,X=人数差 */
export function computeDefenseReinforcement(players) {
  if (!Array.isArray(players)) return null;
  const alive = players.filter((p) => p && p.alive);
  const team0 = alive.filter((p) => p.teamId === 0).length;
  const team1 = alive.filter((p) => p.teamId === 1).length;
  if (team0 === team1 || team0 === 0 || team1 === 0) return null;
  return { weakerTeamId: team0 < team1 ? 0 : 1, diff: Math.abs(team0 - team1) };
}

/**
 * @param {object} opts
 * @param {number} [opts.playerTeamId]
 * @param {number} opts.maxRounds       回合上限(超出即结算)
 * @param {object} [opts.cardBonus]     { 0: {attackBonus, defenseBonus}, 1: {...} }
 * @param {object} [opts.hooks]         onPlayerDeath / onTeamWipe / onRoundLimit / onNewRound
 */
export function createLeagueMatchMode({
  playerTeamId = 0,
  maxRounds = 20,
  cardBonus = null,
  hooks = {},
} = {}) {
  const info = {
    playerTeamId,
    maxRounds,
    deathOrder: [],
    guard: false,
    currentRound: 1,
  };

  return {
    id: "league",
    rules: { ...LEAGUE_MATCH_RULES },
    cardBonus,
    info,

    /** 新回合:同步回合数 → 上限判定 → (未超限)劣势方补给 */
    onNewRound(ctx, round) {
      info.currentRound = Math.min(round, info.maxRounds);
      hooks.onNewRound?.(info.currentRound);

      if (round > info.maxRounds) {
        ctx.dev(CAT.STATE, `联赛回合上限: 第${round}回合 > ${info.maxRounds}`);
        hooks.onRoundLimit?.();
        ctx.state.turn.suspend = true;
        return "halt";
      }

      const reinforcement = computeDefenseReinforcement(ctx.state.players);
      if (reinforcement) {
        const { weakerTeamId, diff } = reinforcement;
        ctx.deck.ensure(diff);
        const drawn = ctx.deck.draw(diff);
        for (const p of ctx.state.players) {
          if (p.alive && p.teamId === weakerTeamId) {
            drawn.forEach((c) => {
              p.defensePile.push({ ...c, faceUp: false });
            });
          }
        }
        const teamName = weakerTeamId === 0 ? "玩家队" : "对手队";
        ctx.log(`劣势方补给：${teamName} 每人获得 ${diff} 张防御牌`);
        ctx.dev(
          CAT.STATE,
          `劣势方防御补给: ${teamName} 每人 +${diff} 张防御牌（人数差 ${diff}）`,
          { weakerTeamId, diff },
        );
      }
      return undefined;
    },

    /** 每次致死都记一条,供积分/死亡顺序结算 */
    onPlayerDeath(ctx, player) {
      info.deathOrder.push(player.index);
      hooks.onPlayerDeath?.(player.index, player);
    },

    /** 结束判定:只剩一支队伍存活 */
    checkGameOver(ctx) {
      const alive = ctx.players.alive();
      if (alive.length === 0) return undefined;
      const teamsAlive = new Set(alive.map((p) => p.teamId));
      if (teamsAlive.size > 1) return undefined;
      if (info.guard) return undefined;
      info.guard = true;

      const survivingTeam = [...teamsAlive][0];
      ctx.dev(CAT.STATE, `联赛团队团灭: 只剩队伍${survivingTeam}存活`, {
        round: ctx.state.round,
        alivePlayers: alive.map((p) => p.name),
      });
      hooks.onTeamWipe?.(survivingTeam);
      ctx.state.turn.suspend = true;
      return survivingTeam;
    },
  };
}
