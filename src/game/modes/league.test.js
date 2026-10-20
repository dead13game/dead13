import { describe, it, expect, vi } from "vitest";

import { createGameState, initGame } from "../flow/setup.js";
import { createContext } from "../flow/context.js";
import { attachTurnEngine } from "../flow/turn.js";
import { createSeededRng } from "../core/rng.js";
import { ally } from "../flow/commands.js";
import { createLeagueMatchMode, computeDefenseReinforcement } from "./league.js";
import { createWorldCupMatchMode } from "./worldcup.js";

function makeLeague(opts = {}) {
  const hooks = {
    onPlayerDeath: vi.fn(),
    onTeamWipe: vi.fn(),
    onRoundLimit: vi.fn(),
    onNewRound: vi.fn(),
    ...(opts.hooks ?? {}),
  };
  const mode = createLeagueMatchMode({
    maxRounds: opts.maxRounds ?? 20,
    cardBonus: opts.cardBonus ?? { 0: { attackBonus: 2, defenseBonus: 1 }, 1: { attackBonus: 0, defenseBonus: 0 } },
    hooks,
  });
  const state = createGameState();
  initGame(state, {
    chars: opts.chars ?? [1, 2, 3, 4, 5, 6],
    weather: false,
    startRound: 1,
    deckCount: 3,
    teamIds: [0, 0, 0, 1, 1, 1],
    mode,
  });
  const ctx = createContext(state, { rng: createSeededRng(11), mode });
  attachTurnEngine(ctx);
  return { state, mode, ctx, hooks };
}

describe("modes/league — 规则修正 DC-1/DC-2", () => {
  it("每场都从 4 回合和平期开始(不再依赖 context 安装时机)", () => {
    const { state, mode } = makeLeague();
    expect(mode.rules.peaceRounds).toBe(4);
    expect(state.phase).toBe("peace");
    expect(state.peaceRounds).toBe(4);

    // 模拟第二场:同样从 initGame 进场,依旧和平期
    const second = makeLeague();
    expect(second.state.phase).toBe("peace");
  });

  it("禁用结盟:6 人局也无法结盟", () => {
    const { ctx } = makeLeague();
    expect(ally(ctx)).toBe(false);
    expect(ctx.state.pending).toBeNull();
    expect(ctx.state.step).toBe("pickAction");
  });

  it("允许攻击队友的拦截仍在:同队玩家不可互相攻击", () => {
    const { ctx, state } = makeLeague();
    state.phase = "normal";
    state.round = 5;
    const attacker = state.players.find((p) => p.teamId === 0);
    const mate = state.players.find((p) => p.teamId === 0 && p.uid !== attacker.uid);
    state.currentPlayerIndex = attacker.index;
    // 直接把攻击 pending 摆好,验证拦截
    state.pending = { type: "target", purpose: "attack", asker: attacker.uid, options: [], data: { cards: [], total: 5 } };
    state.pendingAttackCard = { id: "x", value: 5, rank: "5", suit: "♠" };
    return import("../flow/commands.js").then(({ attackTarget }) => {
      const ok = attackTarget(ctx, mate.uid);
      expect(ok).toBe(false);
      expect(state.messageLog).toContain("不能攻击队友");
    });
  });
});

describe("modes/league — 回合补给与结算", () => {
  it("劣势方补给:人数差 2 → 劣势方每名存活者 +2 张防御牌", () => {
    const { ctx, state } = makeLeague();
    // 击杀玩家队两人 → 1v3,劣势方 = 玩家队(teamId 0)
    const team0 = state.players.filter((p) => p.teamId === 0);
    team0[0].alive = false;
    team0[1].alive = false;

    mode_onNewRound(ctx, state.round + 1);

    const aliveTeam0 = state.players.filter((p) => p.teamId === 0 && p.alive);
    expect(aliveTeam0).toHaveLength(1);
    expect(aliveTeam0.every((p) => p.defensePile.length === 2)).toBe(true);
    const aliveTeam1 = state.players.filter((p) => p.teamId === 1 && p.alive);
    expect(aliveTeam1.every((p) => p.defensePile.length === 0)).toBe(true);
    expect(state.messageLog.some((m) => m.includes("劣势方补给"))).toBe(true);
  });

  it("回合超过上限 → 回调 onRoundLimit + 暂停 + halt", () => {
    const { ctx, mode, hooks } = makeLeague({ maxRounds: 20 });
    expect(mode.onNewRound(ctx, 21)).toBe("halt");
    expect(hooks.onRoundLimit).toHaveBeenCalledOnce();
    expect(ctx.state.turn.suspend).toBe(true);
    expect(mode.info.currentRound).toBe(20);
  });

  it("队伍团灭 → onTeamWipe(存活队) + 暂停;重复调用只触发一次", () => {
    const { ctx, mode, state, hooks } = makeLeague();
    state.players.filter((p) => p.teamId === 1).forEach((p) => (p.alive = false));
    mode.checkGameOver(ctx);
    mode.checkGameOver(ctx);
    expect(hooks.onTeamWipe).toHaveBeenCalledOnce();
    expect(hooks.onTeamWipe).toHaveBeenCalledWith(0);
    expect(state.turn.suspend).toBe(true);
  });

  it("每次致死都记录死亡顺序", () => {
    const { ctx, mode, state, hooks } = makeLeague();
    const victim = state.players.find((p) => p.teamId === 1);
    mode.onPlayerDeath(ctx, victim);
    expect(hooks.onPlayerDeath).toHaveBeenCalledWith(victim.index, victim);
    expect(mode.info.deathOrder).toEqual([victim.index]);
  });

  it("卡牌加成按 teamId 读取(供攻击/防御管道使用)", () => {
    const { mode } = makeLeague();
    expect(mode.cardBonus[0].attackBonus).toBe(2);
    expect(mode.cardBonus[1].defenseBonus).toBe(0);
  });
});

describe("modes/league — 补给计算", () => {
  it("人数相等或任一方团灭时不补给", () => {
    expect(computeDefenseReinforcement([])).toBeNull();
    expect(
      computeDefenseReinforcement([
        { alive: true, teamId: 0 },
        { alive: true, teamId: 1 },
      ]),
    ).toBeNull();
    expect(
      computeDefenseReinforcement([
        { alive: true, teamId: 0 },
        { alive: false, teamId: 1 },
      ]),
    ).toBeNull();
  });

  it("人数差即为补给张数", () => {
    const players = [
      { alive: true, teamId: 0 },
      { alive: true, teamId: 0 },
      { alive: true, teamId: 0 },
      { alive: true, teamId: 1 },
      { alive: false, teamId: 1 },
      { alive: false, teamId: 1 },
    ];
    expect(computeDefenseReinforcement(players)).toEqual({
      weakerTeamId: 1,
      diff: 2,
    });
  });
});

describe("modes/worldcup — 小组赛/淘汰赛差异", () => {
  it("小组赛平局直接结束并回报 result", () => {
    const onGroupResult = vi.fn();
    const mode = createWorldCupMatchMode({
      isGroupStage: true,
      playerCharId: 1,
      opponentCharId: 2,
      hooks: { onGroupResult },
    });
    const state = createGameState();
    initGame(state, {
      chars: [1, 2],
      startRound: 1,
      mode,
      forcePeace: true,
    });
    const ctx = createContext(state, { rng: createSeededRng(3), mode });
    attachTurnEngine(ctx);

    mode.match.score = [1, 0];
    state.round = 90;
    state.players.find((p) => p.characterId === 1).alive = false;
    mode.checkGameOver(ctx);

    expect(mode.match.matchOver).toBe(true);
    expect(mode.match.winner).toBeNull();
    expect(onGroupResult).toHaveBeenCalledWith("draw");
  });

  it("id 标记为 worldcup,便于控制器分流", () => {
    expect(
      createWorldCupMatchMode({ playerCharId: 1, opponentCharId: 2 }).id,
    ).toBe("worldcup");
  });
});

// 便于测试直接驱动回合开始
function mode_onNewRound(ctx, round) {
  return ctx.mode.onNewRound(ctx, round);
}
