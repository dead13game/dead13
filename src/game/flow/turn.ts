// 回合引擎 — 旧的 nextPlayer / endAction 重写
//
// 关键语义(与旧实现逐行对齐):
//   - pass():  结束当前行动,推进到下一位。suspend 时消费暂停标志并原地不动。
//   - extra(): 当前玩家获得额外行动(旧 endTurn=false + endAction 的 else 分支)。
//   - 新人回合开始时按固定顺序跑:阶段切换 → 天气 → 早期钩子(月相) → 圣遗物计时
//     → 模式回调 → 联盟倒计时 → 晚期钩子(DoT/偷牌) → 结束判定。
//   - 冻结的玩家被跳过(递归推进)。

import { PHASE, STEP } from "../core/constants.js";
import { CAT } from "../core/log.js";
import { drawWeather, getCurrentWeather } from "../rules/weather.js";
import { tickArtifactRounds } from "../rules/artifacts.js";
import { dissolveAlliance } from "../rules/damage.js";
import { roundStartHooks, turnStartHooks } from "../characters/index.js";
import type { Ctx, GameState, ModeAdapter } from "../types.js";

/** 钩子分带:小于此优先级 = 结算前(月相),大于等于 = 结算后(DoT/偷牌) */
const EARLY_HOOKS = 50;

/**
 * 模式扩展点的「回合」形态。
 *
 * types.ts 的 ModeAdapter 只声明了单参回调（内核最早只需要 ctx），
 * 但 brawl / league / match 的实际实现都是 (ctx, round)，league 还返回 "halt"。
 * 这里按真实调用约定收窄一次，运行时调用方式不变。
 */
type ModeTurnHooks = ModeAdapter & {
  onNewRound?(ctx: Ctx, round: number): void | "halt";
  onRoundEnd?(ctx: Ctx, round: number): void | "halt";
};

/** state.mode 的回合回调视图（理由见 ModeTurnHooks） */
function turnHooksOf(state: GameState): ModeTurnHooks | null {
  return state.mode as ModeTurnHooks | null;
}

export function attachTurnEngine(ctx: Ctx): Ctx {
  ctx.attachEngine({
    pass: (c) => pass(c),
    extra: (c) => extra(c),
    next: (c) => nextPlayer(c, 0),
  });
  return ctx;
}

function pass(ctx: Ctx): void {
  const turn = ctx.state.turn;
  if (turn.suspend) {
    turn.suspend = null;
    return;
  }
  if (turn.resync) {
    turn.resync = false;
    resyncToNextAlive(ctx);
    return;
  }
  if (turn.extraAction) {
    turn.extraAction = false;
    extra(ctx);
    return;
  }
  nextPlayer(ctx, 0);
}

function extra(ctx: Ctx): void {
  const state = ctx.state;
  state.pending = null;
  state.step = STEP.PICK_ACTION;
  const p = ctx.players.current();
  if (!p) return;
  ctx.log(`${p.name} 获得额外行动`);
  ctx.devDebug(CAT.STATE, `${p.name} 获得额外行动`);
}

/** 旧 _gameJustReset 分支:跳过新回合逻辑,只把指针移到下一位存活者 */
function resyncToNextAlive(ctx: Ctx): void {
  const state = ctx.state;
  let next = state.currentPlayerIndex + 1;
  while (next < state.players.length && !state.players[next].alive) next++;
  if (next >= state.players.length) next = 0;
  while (next < state.players.length && !state.players[next].alive) next++;
  if (next < state.players.length && state.players[next]?.alive) {
    state.currentPlayerIndex = next;
    state.pending = null;
    state.step = STEP.PICK_ACTION;
  }
}

function nextPlayer(ctx: Ctx, depth: number): void {
  const state = ctx.state;
  if (depth > state.players.length) return;

  let next = state.currentPlayerIndex + 1;
  while (next < state.players.length && !state.players[next].alive) next++;

  if (next >= state.players.length || !state.players[next]?.alive) {
    // 一回合结束（所有英雄行动完）→ 模式回合结束钩子（团战塔行动 / 60 回合判定）
    const ended = turnHooksOf(state)?.onRoundEnd?.(ctx, state.round);
    if (ended === "halt" || state.gameOver) return;

    state.round++;
    next = 0;
    while (next < state.players.length && !state.players[next].alive) next++;

    const halted = roundStart(ctx);
    if (halted) return;

    next = 0;
    while (next < state.players.length && !state.players[next].alive) next++;
  }

  if (!state.gameOver && state.players[next]?.alive) {
    state.currentPlayerIndex = next;
    const p = ctx.players.current();
    // currentPlayerIndex 刚指向存活玩家，current() 必然存在；这里只做类型收窄
    if (!p) return;

    if (p.effects.frozenBy !== null) {
      ctx.log(`${p.name} 被冻结，跳过行动`);
      ctx.dev(CAT.STATE, `${p.name} 被冻结，跳过行动`);
      p.effects.frozenBy = null;
      nextPlayer(ctx, depth + 1);
      return;
    }

    state.pending = null;
    state.step = STEP.PICK_ACTION;
    p.effects.ignoreTrapThisTurn = false;
    state.turn.savedBy = null; // 新回合:菜月昴可以再次存档(KB-9)

    ctx.log(`当前 ${p.name} 行动`);
    ctx.devDebug(CAT.STATE, `轮到 ${p.name} 行动`, {
      hp: p.hp,
      defCount: p.defensePile.length,
      hasTrap: !!p.trap,
      skillUses: p.resources.skillUses,
      allyUid: p.relations.allyUid,
    });

    // 角色「轮到行动」钩子（砂狼白子的无人机在此攻击；无人机没有自己的回合）
    for (const hook of turnStartHooks()) {
      if (p.characterId !== hook.id) continue;
      hook.run(ctx, p);
    }
    if (state.gameOver) return;
  }
}

/**
 * 新回合开始。返回 true 表示模式要求立即中断(例如联赛回合上限),不再选中当前玩家。
 */
function roundStart(ctx: Ctx): boolean {
  const state = ctx.state;

  // 1) 阶段切换
  if (
    state.phase === PHASE.PEACE &&
    state.round > (state.peaceStartRound ?? 0) + state.peaceRounds
  ) {
    state.phase = PHASE.NORMAL;
    ctx.log(`第${state.round}回合 战斗开始`);
    ctx.dev(CAT.STATE, `阶段切换 PEACE → NORMAL（第${state.round}回合）`);
  } else {
    ctx.log(`------ 第${state.round}回合 ------`);
  }
  ctx.dev(CAT.STATE, `第${state.round}回合开始`, {
    phase: state.phase,
    aliveCount: ctx.players.alive().length,
  });

  // 2) 天气
  if (state.useWeather) {
    drawWeather(ctx);
    const w = getCurrentWeather(state);
    ctx.log(w?.name || "风和日丽");
    ctx.dev(CAT.WEATHER, `天气: ${w?.name || "风和日丽"}`, {
      weather: state.currentWeather,
      nextWeather: state.nextWeather,
    });

    if (state.currentWeather === "rain") {
      // 天气对场上所有单位生效：英雄 / 塔 / 无人机都掉一张防御牌
      for (const p of [
        ...state.players,
        ...(state.towers ?? []),
        ...(state.summons ?? []),
      ]) {
        if (p.alive && p.defensePile.length > 0) {
          const discarded = p.defensePile.pop();
          // 上面已判 length > 0，pop 必然有值；这里只做类型收窄
          if (!discarded) continue;
          if (!discarded.isShield) state.grave.push(discarded);
          ctx.log(`${p.name} 防御牌被暴雨冲走`);
          ctx.devDebug(CAT.WEATHER, `${p.name} 防御牌被暴雨冲走`, {
            card: discarded.id,
          });
        }
      }
    }
  }

  const hooks = roundStartHooks();
  const runBand = (predicate: (hook: (typeof hooks)[number]) => boolean) => {
    for (const hook of hooks) {
      if (!predicate(hook)) continue;
      for (const p of state.players) {
        if (!p.alive) continue;
        if (p.characterId !== hook.id) continue;
        hook.run(ctx, p);
      }
    }
  };

  // 3) 早期钩子(月相)
  runBand((h) => h.priority < EARLY_HOOKS);

  // 4) 圣遗物计时
  tickArtifactRounds(ctx);

  // 5) 模式回调(联赛回合上限会在此中断)
  const modeResult = turnHooksOf(state)?.onNewRound?.(ctx, state.round);
  if (modeResult === "halt") return true;

  // 6) 联盟 / 背刺倒计时
  for (const p of state.players) {
    if (!p.alive) continue;
    if (p.relations.allianceTurns > 0) {
      p.relations.allianceTurns--;
      if (p.relations.allianceTurns <= 0) {
        dissolveAlliance(ctx, p);
        ctx.log(`${p.name} 联盟到期`);
      }
    }
    if (p.relations.betrayalPenalty > 0) {
      p.relations.betrayalPenalty--;
      if (p.relations.betrayalPenalty <= 0) {
        ctx.log(`${p.name} 背刺惩罚结束`);
      }
    }
    if (p.relations.allyKillBonus && p.relations.allyUid !== null) {
      p.relations.allyKillBonus = false;
      ctx.log(`${p.name} 盟友击杀奖励：立即执行一次防御或赌命`);
      // 旧实现这里置 endTurn=false,实际获益的是「本回合第一个行动者」
      state.turn.extraAction = true;
    }
  }

  // 7) 晚期钩子(莉奈娅 DoT / 偷牌)
  runBand((h) => h.priority >= EARLY_HOOKS);

  // 8) 结束判定
  ctx.mode?.checkGameOver?.(ctx);

  return false;
}
