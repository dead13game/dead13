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

export const BRAWL_RULES = {
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

/** 复活：满状态 + 3 张防御牌（被动叠层/技能次数/圣遗物全部重置） */
function reviveHero(ctx, p) {
  const state = ctx.state;
  const meta = CHARACTERS[p.characterId];
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
  p.revivedThisRound = true;

  ctx.deck.ensure(3);
  const cards = ctx.deck.draw(3);
  cards.forEach((c) => {
    c.faceUp = false;
    c.ownerUid = p.uid;
    c.defenseValue = c.value;
    p.defensePile.push(c);
  });
  ctx.log(`${p.name} 复活（获得 3 张防御牌，本回合第一个行动）`);
  ctx.dev(CAT.STATE, `${p.name} 复活`, {
    round: state.round,
    hp: p.hp,
    defense: p.defensePile.length,
  });
}

/** 每回合行动顺序：复活者优先，其余按当前 HP 升序，同血随机 */
export function orderBrawlHeroes(ctx) {
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
    p.revivedThisRound = false;
  });
  ctx.devDebug(
    CAT.STATE,
    `团战行动顺序: ${state.players.map((p) => `${p.name}(${p.hp})`).join(" → ")}`,
  );
}

/** 劣势方补给：人数差 X，劣势方每个英雄 +X 张防御牌 */
function reinforceWeakerTeam(ctx) {
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
      p.defensePile.push({
        ...c,
        faceUp: false,
        ownerUid: p.uid,
        defenseValue: c.value,
      });
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
function towersAttack(ctx) {
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

function destroyedTowers(state, team) {
  return towersOf(state, team).filter((t) => !t.alive).length;
}

function totalHp(state, team) {
  const heroes = state.players.filter((p) => p.teamId === team);
  const towers = towersOf(state, team);
  return (
    heroes.reduce((s, p) => s + Math.max(0, p.hp), 0) +
    towers.reduce((s, t) => s + Math.max(0, t.hp), 0)
  );
}

export function createBrawlMode({
  maxRounds = BRAWL_RULES.maxRounds,
  respawnRounds = BRAWL_RULES.respawnRounds,
  playerTeamId = 0,
} = {}) {
  const info = {
    playerTeamId,
    maxRounds,
    respawnRounds,
    winnerTeam: null,
    result: null,
    guard: false,
  };

  function endGame(ctx, winnerTeam, reason, detail = {}) {
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

  function checkGameOver(ctx) {
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

  function finishByTiebreak(ctx) {
    const state = ctx.state;
    // 拆塔数 = 拆掉「敌方」塔的数量
    const d0 = destroyedTowers(state, 1);
    const d1 = destroyedTowers(state, 0);
    const h0 = teamAliveHeroes(state, 0).length;
    const h1 = teamAliveHeroes(state, 1).length;
    const hp0 = totalHp(state, 0);
    const hp1 = totalHp(state, 1);
    let winner = null;
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

  return {
    id: "brawl",
    rules: {
      ...BRAWL_RULES,
      maxRounds,
      respawnRounds,
    },
    info,

    /** 每回合开始：复活 → 劣势补给 → 行动排序 */
    onNewRound(ctx, round) {
      const state = ctx.state;
      if (state.gameOver) return "halt";

      for (const p of state.players) {
        if (!p.alive && p.respawnRound && round >= p.respawnRound) {
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
    onRoundEnd(ctx, round) {
      const state = ctx.state;
      if (state.gameOver) return "halt";
      // 和平期：塔群待命，不造成伤害
      if (state.phase === PHASE.PEACE) {
        ctx.log(`和平期 · 塔群待命（${round}/${BRAWL_RULES.peaceRounds}）`);
        return undefined;
      }
      towersAttack(ctx);
      if (state.gameOver) return "halt";
      if (round >= info.maxRounds) {
        finishByTiebreak(ctx);
        return "halt";
      }
      return undefined;
    },

    onPlayerDeath(ctx, unit) {
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
    filterPending(ctx, pending) {
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
}

/** 团战开局排序（第 1 回合没有 onNewRound，需要手动排一次） */
export function initBrawlOrder(ctx) {
  orderBrawlHeroes(ctx);
}
