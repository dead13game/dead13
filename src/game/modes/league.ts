// 联赛（3V3）单场模式适配器
//
// 与经典/比赛模式的差别（全部在这条 rules 里，不再靠「context 是否存在」隐式切换）：
//   - 每场固定 4 回合和平期（DC-1：修正旧实现「首场 4 回合、后续 0 回合」的时序 bug）
//   - 禁用结盟/背刺（DC-2）
//   - 围攻计数（同回合第 2 次受击伤害减半）
//   - 允许攻击队友的拦截仍生效（teamId 相同直接拒绝）
//   - 回合上限 + 劣势方防御补给

import { CAT } from "../core/log.js";
import type { Ctx, ModeAdapter, ModeRules, Player } from "../types.js";

/** 联赛单场规则（字段与 DC-1 / DC-2 修正一一对应） */
export interface LeagueRules extends ModeRules {
  peaceRounds: number;
  attackGate: "round";
  attackMinRound: number;
  alliance: boolean;
  allyMinPlayers: number;
  besiege: boolean;
  blockAllyAttack: boolean;
}

export const LEAGUE_MATCH_RULES: LeagueRules = {
  peaceRounds: 4,
  attackGate: "round",
  attackMinRound: 4,
  alliance: false, // DC-2
  allyMinPlayers: 99,
  besiege: true,
  blockAllyAttack: false,
};

/** 一张卡牌的加成（按队伍查表） */
export interface LeagueCardBonus {
  attackBonus: number;
  defenseBonus: number;
}

/** 按 teamId 索引的卡牌加成表（攻击/防御管道读取） */
export type LeagueCardBonusTable = Record<number, LeagueCardBonus>;

/** 劣势方判定只需要这两个字段，测试可以传最小对象 */
export interface ReinforcementPlayer {
  alive: boolean;
  teamId: number;
}

export interface DefenseReinforcement {
  weakerTeamId: number;
  diff: number;
}

/** 劣势方防御补给:双方存活人数不等时,劣势方每人获得 X 张防御牌,X=人数差 */
export function computeDefenseReinforcement(
  players: readonly ReinforcementPlayer[] | null | undefined,
): DefenseReinforcement | null {
  if (!Array.isArray(players)) return null;
  const alive = players.filter((p) => p && p.alive);
  const team0 = alive.filter((p) => p.teamId === 0).length;
  const team1 = alive.filter((p) => p.teamId === 1).length;
  if (team0 === team1 || team0 === 0 || team1 === 0) return null;
  return { weakerTeamId: team0 < team1 ? 0 : 1, diff: Math.abs(team0 - team1) };
}

/** 联赛模式的生命周期回调（控制器/UI 传入，纯数据，不反向引用内核状态） */
export interface LeagueModeHooks {
  onPlayerDeath?(index: number, player: Player): void;
  onTeamWipe?(survivingTeam: number): void;
  onRoundLimit?(): void;
  onNewRound?(round: number): void;
}

/** 联赛模式的运行时信息（数据对象，供积分/UI 读取） */
export interface LeagueModeInfo {
  playerTeamId: number;
  maxRounds: number;
  deathOrder: number[];
  guard: boolean;
  currentRound: number;
}

export interface LeagueModeOptions {
  playerTeamId?: number;
  /** 回合上限(超出即结算) */
  maxRounds?: number;
  /** { 0: {attackBonus, defenseBonus}, 1: {...} } */
  cardBonus?: LeagueCardBonusTable | null;
  hooks?: LeagueModeHooks;
}

/**
 * 联赛模式适配器。
 *
 * 为什么没有直接 `extends ModeAdapter` 带上 info / cardBonus：
 * ModeAdapter 把这两个成员声明成旧的方法签名，而运行时它们是数据对象
 * （UI 读 mode.info、加成管道按 teamId 查 mode.cardBonus）。
 * 声明成方法会让整个 adapter 不再可赋值给 ModeAdapter（见 types.ts 的类型债），
 * 所以这里 Omit 掉；需要精确形状的消费方用 LeagueModeRuntime 局部收窄。
 */
export interface LeagueMode extends Omit<ModeAdapter, "info" | "cardBonus"> {
  rules: LeagueRules;
  onNewRound(ctx: Ctx, round?: number): "halt" | undefined;
  onPlayerDeath(ctx: Ctx, player: Player): void;
  checkGameOver(ctx: Ctx): number | undefined;
}

/** 联赛 adapter 的完整运行时形状：info / cardBonus 是数据对象 */
export interface LeagueModeRuntime extends LeagueMode {
  info: LeagueModeInfo;
  cardBonus: LeagueCardBonusTable | null;
}

export function createLeagueMatchMode({
  playerTeamId = 0,
  maxRounds = 20,
  cardBonus = null,
  hooks = {},
}: LeagueModeOptions = {}): LeagueMode {
  const info: LeagueModeInfo = {
    playerTeamId,
    maxRounds,
    deathOrder: [],
    guard: false,
    currentRound: 1,
  };

  const mode = {
    id: "league",
    rules: { ...LEAGUE_MATCH_RULES },
    cardBonus,
    info,

    /** 新回合:同步回合数 → 上限判定 → (未超限)劣势方补给 */
    onNewRound(ctx: Ctx, round?: number) {
      // 内核（flow/turn.ts）总是传 round；单参调用时落到当前回合计
      const roundNo = round ?? ctx.state.round;
      info.currentRound = Math.min(roundNo, info.maxRounds);
      hooks.onNewRound?.(info.currentRound);

      if (roundNo > info.maxRounds) {
        ctx.dev(CAT.STATE, `联赛回合上限: 第${roundNo}回合 > ${info.maxRounds}`);
        hooks.onRoundLimit?.();
        ctx.state.turn.suspend = true;
        return "halt";
      }

      // 围攻计数清零(本回合受击次数)。
      // 旧实现在 gameState.nextPlayer 的 leagueContext 分支里做,迁移时漏掉会导致
      // 从第 2 次攻击起整场都被判"围攻减半"。
      for (const p of ctx.state.players) {
        if (p.alive) p.relations.attackedThisRound = 0;
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
    onPlayerDeath(ctx: Ctx, player: Player) {
      info.deathOrder.push(player.index);
      hooks.onPlayerDeath?.(player.index, player);
    },

    /** 结束判定:只剩一支队伍存活 */
    checkGameOver(ctx: Ctx): number | undefined {
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

  // 用变量返回：info / cardBonus 是模式自有的数据字段，不在 LeagueMode 的声明里
  return mode;
}
