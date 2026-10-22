// 3v3 团战推塔模式 — 纯规则适配器
//
// 规则来源：update_log/v3.5/团战.txt + 补充说明(1).txt
//   - 6 名英雄（每队 3 人）+ 每队 5 座塔（10 HP，按 1→5 顺序拆）
//   - 英雄阵亡 5 回合后满状态复活（3 张防御牌，当回合第一个行动）
//   - 每回合所有英雄行动完后，己方塔对敌方全体英雄+无人机造成伤害：
//     塔数 ≥3 → 2 点；<3 → 3 点
//   - 60 回合上限：拆塔数 → 存活英雄数 → 总血量（含塔）→ 平局
//   - 围攻：同一目标本回合第 2 次起攻击伤害减半（塔也吃，无人机不吃）
//   - 劣势补偿：人数差 X，劣势方每个英雄每回合 +X 防御牌（不含塔/无人机）

import { PHASE, STEP } from "../core/constants.js";
import { CAT } from "../core/log.js";
import { applyDamage } from "../rules/damage.js";
import {
  isEnemy,
  isFriendly,
  teamAliveHeroes,
  towersOf,
} from "../core/units.js";
import {
  characterStateFor,
  CHARACTERS,
} from "../characters/index.js";
import type {
  Card,
  CharacterMeta,
  Ctx,
  GameState,
  ModeAdapter,
  ModeRules,
  Pending,
  Player,
} from "../types.js";

/** 团战规则（v3.5 阈值全部显式声明，内核按字段读取） */
export interface BrawlRules extends ModeRules {
  peaceRounds: number;
  attackGate: "phase";
  attackMinRound: number;
  alliance: boolean;
  allyMinPlayers: number;
  besiege: boolean;
  blockAllyAttack: boolean;
  teamSkills: boolean;
  supportDefense: boolean;
  supportGamble: boolean;
  maxRounds: number;
  respawnRounds: number;
}

export const BRAWL_RULES: BrawlRules = {
  // v3.5：团战前 4 回合和平期（禁攻击，塔群待命）
  peaceRounds: 4,
  attackGate: "phase",
  attackMinRound: 5,
  alliance: false,
  allyMinPlayers: 99,
  besiege: true,
  blockAllyAttack: false,
  // v3.5 团战专属
  teamSkills: true,
  supportDefense: true,
  supportGamble: true,
  maxRounds: 60,
  respawnRounds: 5,
};

/** 结算附加信息（拆塔数/存活数/总血量等，写日志与 UI 用） */
export interface BrawlResult {
  winnerTeam: number | null;
  reason: string;
  [detail: string]: unknown;
}

/** 团战模式的运行时信息（数据对象，UI/测试直接读） */
export interface BrawlInfo {
  playerTeamId: number;
  maxRounds: number;
  respawnRounds: number;
  winnerTeam: number | null;
  result: BrawlResult | null;
  guard: boolean;
}

export interface BrawlModeOptions {
  maxRounds?: number;
  respawnRounds?: number;
  playerTeamId?: number;
}

/**
 * 防御区的牌在运行时还带这些字段（rules/damage.ts 读 defenseValue）；
 * 内核 Card 契约只声明牌面本身，这里补齐写入侧形状。
 */
type DefenseCard = Card & {
  ownerUid?: number | null;
  defenseValue?: number;
  maxDefenseValue?: number;
};

/** 复活：满状态 + 3 张防御牌（被动叠层/技能次数/圣遗物全部重置） */
function reviveHero(ctx: Ctx, p: Player) {
  const state = ctx.state;
  const meta: CharacterMeta | undefined = CHARACTERS[p.characterId];
  p.alive = true;
  p.maxHp = meta?.hp ?? p.maxHp;
  p.hp = p.maxHp;
  p.resources.skillUses = meta?.maxUses ?? 0;
  p.resources.loadUses = meta?.loadMaxUses ?? 0;
  p.resources.holyWordUses = meta?.holyWordUses ?? 2;
  p.resources.breakCount = 0;
  p.char = structuredClone(characterStateFor(p.characterId));
  p.effects = {
    frozenBy: null,
    stealTarget: null,
    dotTarget: null,
    damageBonus: {},
    ignoreTrapThisTurn: false,
    savepoint: null,
  };
  p.relations = {
    allyUid: null,
    allianceTurns: 0,
    betrayalPenalty: 0,
    allyKillBonus: false,
    consecutiveGambles: 0,
    gamblePenalty: false,
    attackedThisRound: 0,
  };
  p.artifact.active = false;
  p.artifact.roundsLeft = 0;
  p.defensePile = [];
  p.trap = null;
  p.bait = null;
  p.respawnRound = 0;
  // types.ts 把 revivedThisRound 声明成 number（注释语义是 boolean，中心契约笔误）；
  // 不改中心类型，用 Object.assign 写入布尔值（运行时与直接赋值等价）。
  Object.assign(p, { revivedThisRound: true });

  ctx.deck.ensure(3);
  const cards = ctx.deck.draw(3);
  cards.forEach((c) => {
    c.faceUp = false;
    // 原地写入防御字段（旧实现就是直接改这张牌并 push 同一引用）
    const card: DefenseCard = c;
    card.ownerUid = p.uid;
    card.defenseValue = c.value;
    card.maxDefenseValue = c.value;
    p.defensePile.push(card);
  });
  ctx.log(`${p.name} 复活（获得 3 张防御牌，本回合第一个行动）`);
  ctx.dev(CAT.STATE, `${p.name} 复活`, {
    round: state.round,
    hp: p.hp,
    defense: p.defensePile.length,
  });
}

/** 每回合行动顺序：复活者优先，其余按当前 HP 升序，同血随机 */
export function orderBrawlHeroes(ctx: Ctx) {
  const state = ctx.state;
  const keyed = state.players.map((p) => ({
    p,
    revive: p.revivedThisRound ? 0 : 1,
    hp: p.hp,
    tie: ctx.rng.next(),
  }));
  keyed.sort((a, b) => a.revive - b.revive || a.hp - b.hp || a.tie - b.tie);
  state.players.splice(0, state.players.length, ...keyed.map((k) => k.p));
  state.players.forEach((p, i) => {
    p.index = i;
    // 同上：revivedThisRound 的契约类型与运行时不符
    Object.assign(p, { revivedThisRound: false });
  });
  ctx.devDebug(
    CAT.STATE,
    `团战行动顺序: ${state.players.map((p) => `${p.name}(${p.hp})`).join(" → ")}`,
  );
}

/** 劣势方补给：人数差 X，劣势方每个英雄 +X 张防御牌 */
function reinforceWeakerTeam(ctx: Ctx) {
  const state = ctx.state;
  const c0 = teamAliveHeroes(state, 0).length;
  const c1 = teamAliveHeroes(state, 1).length;
  if (c0 === c1) return;
  const weaker = c0 < c1 ? 0 : 1;
  const diff = Math.abs(c0 - c1);
  for (const p of teamAliveHeroes(state, weaker)) {
    ctx.deck.ensure(diff);
    const cards = ctx.deck.draw(diff);
    cards.forEach((c) => {
      const card: DefenseCard = {
        ...c,
        faceUp: false,
        ownerUid: p.uid,
        defenseValue: c.value,
        maxDefenseValue: c.value,
      };
      p.defensePile.push(card);
    });
  }
  const name = weaker === 0 ? "我方" : "敌方";
  ctx.log(`${name}处于劣势，每人获得 ${diff} 张防御牌`);
  ctx.dev(CAT.STATE, `团战劣势补给: ${name} 每人 +${diff}`, {
    weaker,
    diff,
  });
}

/** 塔的回合结算：塔数 ≥3 → 2 点，<3 → 3 点；打敌方全体英雄 + 无人机 */
function towersAttack(ctx: Ctx) {
  const state = ctx.state;
  for (const team of [0, 1]) {
    const own = towersOf(state, team).filter((t) => t.alive).length;
    if (own === 0) continue;
    const damage = own >= 3 ? 2 : 3;
    const targets = [
      ...teamAliveHeroes(state, 1 - team),
      ...(state.summons ?? []).filter(
        (s) => s.alive && s.teamId === 1 - team,
      ),
    ];
    if (targets.length === 0) continue;
    ctx.log(
      `${team === 0 ? "我方" : "敌方"}塔群对${team === 0 ? "敌方" : "我方"}全体造成 ${damage} 点伤害（${own}座塔）`,
    );
    for (const u of targets) {
      if (!u.alive) continue;
      applyDamage(ctx, { target: u, amount: damage, cause: "tower" });
    }
    ctx.sound("hit");
  }
}

function destroyedTowers(state: GameState, team: number): number {
  return towersOf(state, team).filter((t) => !t.alive).length;
}

function totalHp(state: GameState, team: number): number {
  const heroes = state.players.filter((p) => p.teamId === team);
  const towers = towersOf(state, team);
  return (
    heroes.reduce((s, p) => s + Math.max(0, p.hp), 0) +
    towers.reduce((s, t) => s + Math.max(0, t.hp), 0)
  );
}

/**
 * 团战模式适配器。
 *
 * 与联赛同理：`info` 在 ModeAdapter 里是旧的方法签名，运行时是数据对象，
 * 这里 Omit 掉以保持可赋值给 ModeAdapter；精确形状见 BrawlModeRuntime。
 */
export interface BrawlMode extends Omit<ModeAdapter, "info"> {
  rules: BrawlRules;
  onNewRound(ctx: Ctx, round?: number): "halt" | undefined;
  onRoundEnd(ctx: Ctx, round?: number): "halt" | undefined;
  onPlayerDeath(ctx: Ctx, unit: Player): void;
  checkGameOver(ctx: Ctx): void;
  filterPending(ctx: Ctx, pending: Pending): Pending;
}

/** 团战 adapter 的完整运行时形状：info 是数据对象 */
export interface BrawlModeRuntime extends BrawlMode {
  info: BrawlInfo;
}

export function createBrawlMode({
  maxRounds = BRAWL_RULES.maxRounds,
  respawnRounds = BRAWL_RULES.respawnRounds,
  playerTeamId = 0,
}: BrawlModeOptions = {}): BrawlMode {
  const info: BrawlInfo = {
    playerTeamId,
    maxRounds,
    respawnRounds,
    winnerTeam: null,
    result: null,
    guard: false,
  };

  function endGame(
    ctx: Ctx,
    winnerTeam: number | null,
    reason: string,
    detail: Record<string, unknown> = {},
  ) {
    const state = ctx.state;
    if (state.gameOver) return;
    state.gameOver = true;
    state.phase = PHASE.GAME_OVER;
    state.step = STEP.PICK_ACTION;
    state.pending = null;
    state.winnerIndex =
      winnerTeam == null
        ? -1
        : (state.players.find((p) => p.teamId === winnerTeam)?.index ?? -1);
    info.winnerTeam = winnerTeam;
    info.result = { winnerTeam, reason, ...detail };
    const label = winnerTeam == null ? "平局" : winnerTeam === 0 ? "我方胜利" : "敌方胜利";
    ctx.log(`团战结束：${label}（${reason}）`);
    ctx.dev(CAT.STATE, `团战结束: ${label}`, { reason, ...detail });
  }

  function checkGameOver(ctx: Ctx) {
    const state = ctx.state;
    if (info.guard || state.gameOver) return;
    const t0 = towersOf(state, 0).filter((t) => t.alive).length;
    const t1 = towersOf(state, 1).filter((t) => t.alive).length;
    if (t0 === 0 && t1 === 0) {
      info.guard = true;
      endGame(ctx, null, "双方防御塔同归于尽");
      return;
    }
    if (t0 === 0 || t1 === 0) {
      info.guard = true;
      endGame(ctx, t0 === 0 ? 1 : 0, "拆光敌方防御塔");
    }
  }

  function finishByTiebreak(ctx: Ctx) {
    const state = ctx.state;
    // 拆塔数 = 拆掉「敌方」塔的数量
    const d0 = destroyedTowers(state, 1);
    const d1 = destroyedTowers(state, 0);
    const h0 = teamAliveHeroes(state, 0).length;
    const h1 = teamAliveHeroes(state, 1).length;
    const hp0 = totalHp(state, 0);
    const hp1 = totalHp(state, 1);
    let winner: number | null = null;
    let reason = "60回合判定：完全平局";
    if (d0 !== d1) {
      winner = d0 > d1 ? 0 : 1;
      reason = `60回合判定：拆塔数 ${d0}:${d1}`;
    } else if (h0 !== h1) {
      winner = h0 > h1 ? 0 : 1;
      reason = `60回合判定：存活人数 ${h0}:${h1}`;
    } else if (hp0 !== hp1) {
      winner = hp0 > hp1 ? 0 : 1;
      reason = `60回合判定：总血量 ${hp0}:${hp1}`;
    }
    info.guard = true;
    endGame(ctx, winner, reason, { d0, d1, h0, h1, hp0, hp1 });
  }

  const mode = {
    id: "brawl",
    rules: {
      ...BRAWL_RULES,
      maxRounds,
      respawnRounds,
    },
    info,

    /** 每回合开始：复活 → 劣势补给 → 行动排序 */
    onNewRound(ctx: Ctx, round?: number) {
      const state = ctx.state;
      if (state.gameOver) return "halt";
      // 内核（flow/turn.ts）总是传 round；单参调用时落到当前回合计
      const roundNo = round ?? state.round;

      for (const p of state.players) {
        if (!p.alive && p.respawnRound && roundNo >= p.respawnRound) {
          reviveHero(ctx, p);
        }
      }

      // 围攻计数清零（英雄 + 塔）
      for (const p of [
        ...state.players,
        ...(state.towers ?? []),
      ]) {
        if (p.alive) p.relations.attackedThisRound = 0;
      }

      reinforceWeakerTeam(ctx);
      orderBrawlHeroes(ctx);
      return undefined;
    },

    /** 所有英雄行动完：塔行动 → 60 回合判定 */
    onRoundEnd(ctx: Ctx, round?: number) {
      const state = ctx.state;
      if (state.gameOver) return "halt";
      const roundNo = round ?? state.round;
      // 和平期：塔群待命，不造成伤害
      if (state.phase === PHASE.PEACE) {
        ctx.log(`和平期 · 塔群待命（${roundNo}/${BRAWL_RULES.peaceRounds}）`);
        return undefined;
      }
      towersAttack(ctx);
      if (state.gameOver) return "halt";
      if (roundNo >= info.maxRounds) {
        finishByTiebreak(ctx);
        return "halt";
      }
      return undefined;
    },

    onPlayerDeath(ctx: Ctx, unit: Player) {
      const state = ctx.state;
      if (unit.kind === "tower") {
        checkGameOver(ctx);
        return;
      }
      if (unit.kind === "hero") {
        unit.respawnRound = state.round + info.respawnRounds;
        ctx.log(
          `${unit.name} 将在第 ${unit.respawnRound} 回合复活`,
        );
        ctx.dev(CAT.STATE, `${unit.name} 阵亡，${unit.respawnRound} 回合复活`, {
          round: state.round,
          respawnRound: unit.respawnRound,
        });
      }
    },

    checkGameOver,

    /** 团战目标过滤：攻击/打塔/支援/技能都按敌我与单位类型收敛 */
    filterPending(ctx: Ctx, pending: Pending): Pending {
      if (!pending) return pending;
      if (pending.purpose === "investigate:guess") return pending;
      if (!Array.isArray(pending.options) || pending.options.length === 0) {
        return pending;
      }
      const asker = ctx.units.byUid(pending.asker);
      if (!asker) return pending;

      const purpose = pending.purpose ?? "";
      if (purpose === "skill:liniya") return pending; // 子技能由插件自己处理

      pending.options = pending.options.filter((uid) => {
        const u = ctx.units.byUid(uid);
        if (!u || !u.alive) return false;
        if (purpose === "attack" || purpose === "attack:investigate") {
          return isEnemy(asker, u);
        }
        if (purpose === "defense.support" || purpose === "gamble:trap") {
          if (purpose === "gamble:trap" && u.kind === "drone") return false;
          return isFriendly(asker, u);
        }
        if (purpose === "attack:investigate") {
          return isEnemy(asker, u) && u.kind !== "tower";
        }
        if (purpose === "skill:aimiliya.freeze") {
          return isEnemy(asker, u) && u.kind === "hero";
        }
        if (purpose === "skill:zhongli") return isFriendly(asker, u);
        return true;
      });
      return pending;
    },
  };

  // 用变量返回：info 是模式自有的数据字段，不在 BrawlMode 的声明里
  return mode;
}

/** 团战开局排序（第 1 回合没有 onNewRound，需要手动排一次） */
export function initBrawlOrder(ctx: Ctx) {
  orderBrawlHeroes(ctx);
}
