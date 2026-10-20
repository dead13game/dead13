// 加成管道 — 顺序即规则
//
// 为什么必须是「有序列表」而不是「一个函数里写一堆 if」:
//   - 加法之间可交换,但乘法/除法/取整不可交换
//   - 旧实现的顺序是:加法群 → 陷阱判定 → 角斗士 ×1.5(ceil) → 围攻 ÷2(ceil) → 联盟平摊(-2 后 /3,floor)
//   - 顺序一变,同样的攻击可能差 1 点血
//
// 因此这里的 priority 是规则的一部分,改动必须同步改差分基线。

import { CAT } from "../core/log.js";
import { applyArtifactBoost } from "./artifacts.js";

export const PRIORITY = {
  LEAGUE: 10,
  WEATHER: 20,
  MOON: 30,
  SPIRIT: 40,
  LINIYA: 50,
  ALLIANCE: 60,
  BETRAYAL: 70,
  ARTIFACT: 80,
  BESIEGE: 90,
};

/** 联赛卡牌加成(兼容旧存档的平铺格式) */
export function teamCardBonus(state, teamId) {
  const cb = state.leagueContext?.cardBonus;
  if (!cb) return null;
  if (cb[teamId] && typeof cb[teamId] === "object") return cb[teamId];
  if (teamId === 0 && typeof cb.attackBonus === "number") return cb;
  return null;
}

/** 联盟加成前置条件:有盟友、盟约未到期、自己不在背刺惩罚中 */
function hasActiveAlliance(p) {
  return (
    p.relations.allyUid !== null &&
    p.relations.allianceTurns > 0 &&
    p.relations.betrayalPenalty <= 0
  );
}

// ── 攻击:加法群(顺序与旧 executeAttack 完全一致)──

export const ATTACK_MODIFIERS = [
  {
    id: "league.attack",
    priority: PRIORITY.LEAGUE,
    apply(ctx, env, value) {
      const bonus = teamCardBonus(ctx.state, env.source.teamId)?.attackBonus || 0;
      if (bonus <= 0) return value;
      ctx.log(`联赛攻击加成+${bonus}`);
      ctx.devDebug(CAT.ATTACK, `联赛攻击加成 +${bonus} → ${value + bonus}`);
      return value + bonus;
    },
  },
  {
    id: "weather.sun",
    priority: PRIORITY.WEATHER,
    apply(ctx, env, value) {
      if (ctx.state.currentWeather !== "sun") return value;
      ctx.log("烈日当空");
      ctx.devDebug(CAT.WEATHER, `烈日当空 +2 → ${value + 2}`);
      return value + 2;
    },
  },
  {
    id: "moon.waxing",
    priority: PRIORITY.MOON,
    apply(ctx, env, value) {
      if (env.source.characterId !== 7 || env.source.char.moonPhase !== 0) return value;
      ctx.log("弦月加持");
      ctx.devDebug(CAT.SKILL, `弦月加持 +4 → ${value + 4}`);
      return value + 4;
    },
  },
  {
    id: "spirit",
    priority: PRIORITY.SPIRIT,
    apply(ctx, env, value) {
      const spirit = env.source.char.fightingSpirit || 0;
      if (env.source.characterId !== 6 || spirit <= 0) return value;
      ctx.log(`斗志 ${spirit}层`);
      ctx.devDebug(CAT.SKILL, `玛薇卡斗志 +${spirit} → ${value + spirit}`);
      return value + spirit;
    },
  },
  {
    id: "liniya.bonus",
    priority: PRIORITY.LINIYA,
    apply(ctx, env, value) {
      if (env.source.characterId !== 9) return value;
      const bonus = env.source.effects.damageBonus[env.target.uid] || 0;
      if (bonus <= 0) return value;
      ctx.log(`永久伤害+${bonus}`);
      ctx.devDebug(CAT.SKILL, `莉奈娅永久伤害 +${bonus} → ${value + bonus}`);
      return value + bonus;
    },
  },
  {
    id: "ally.attack",
    priority: PRIORITY.ALLIANCE,
    apply(ctx, env, value) {
      if (!hasActiveAlliance(env.source)) return value;
      ctx.log("联盟攻击+2");
      ctx.devDebug(CAT.ALLIANCE, `联盟攻击 +2 → ${value + 2}`);
      return value + 2;
    },
  },
  {
    id: "betrayal.penalty",
    priority: PRIORITY.BETRAYAL,
    apply(ctx, env, value) {
      if (env.target.uid === env.source.uid) return value;
      if (env.target.relations.betrayalPenalty <= 0) return value;
      ctx.log("惩罚背刺者+2");
      ctx.devDebug(CAT.ALLIANCE, `背刺惩罚 +2 → ${value + 2}`);
      return value + 2;
    },
  },
];

// ── 攻击:陷阱判定之后的两段 ──
// artifact 只在陷阱未触发时生效;besiege(围攻减半)无论陷阱是否击破都生效。

export const POST_TRAP_MODIFIERS = [
  {
    id: "artifact.boost",
    priority: PRIORITY.ARTIFACT,
    apply(ctx, env, value) {
      if (env.trapTriggered) return value;
      if (!env.source.artifact.active || !env.source.artifact.id) return value;
      return applyArtifactBoost(ctx, env.source, value).value;
    },
  },
  {
    id: "besiege.halving",
    priority: PRIORITY.BESIEGE,
    apply(ctx, env, value) {
      if (!env.besieged) return value;
      const after = Math.max(1, Math.ceil(value / 2));
      ctx.log(`围攻减半：${value} → ${after} 点`);
      ctx.dev(
        CAT.ATTACK,
        `围攻惩罚减半: ${env.target.name} 受击伤害 ${value} → ${after}`,
        { targetIndex: env.target.index, before: value, after },
      );
      return after;
    },
  },
];

// ── 防御:顺序与旧 executeDefense 一致 ──

export const DEFENSE_MODIFIERS = [
  {
    id: "weather.trade",
    priority: PRIORITY.WEATHER,
    apply(ctx, env, value) {
      if (ctx.state.currentWeather !== "trade") return value;
      ctx.devDebug(CAT.WEATHER, `黑市交易 +2 → ${value + 2}`);
      return value + 2;
    },
  },
  {
    id: "league.defense",
    priority: PRIORITY.LEAGUE,
    apply(ctx, env, value) {
      const bonus = teamCardBonus(ctx.state, env.source.teamId)?.defenseBonus || 0;
      if (bonus <= 0) return value;
      ctx.devDebug(CAT.ATTACK, `联赛防御加成 +${bonus} → ${value + bonus}`);
      return value + bonus;
    },
  },
  {
    id: "moon.full",
    priority: PRIORITY.MOON,
    apply(ctx, env, value) {
      if (env.source.characterId !== 7 || env.source.char.moonPhase !== 1) return value;
      ctx.devDebug(CAT.SKILL, `满月 +3 → ${value + 3}`);
      return value + 3;
    },
  },
  {
    id: "ally.defense",
    priority: PRIORITY.ALLIANCE,
    apply(ctx, env, value) {
      if (!hasActiveAlliance(env.source)) return value;
      ctx.log("联盟防御+2");
      ctx.devDebug(CAT.ALLIANCE, `联盟防御 +2 → ${value + 2}`);
      return value + 2;
    },
  },
];

/** 合并「基础管道 + 角色自定义管道」并按优先级排序(稳定排序) */
export function collectModifiers(base, extra = []) {
  return [...base, ...extra].sort((a, b) => a.priority - b.priority);
}

/**
 * 依次应用管道。
 * @returns {{ total: number, steps: Array<{id, before, after}> }}
 */
export function reduceModifiers(ctx, value, mods, env) {
  let current = value;
  const steps = [];
  for (const mod of mods) {
    const before = current;
    current = mod.apply(ctx, env, current);
    if (current !== before) steps.push({ id: mod.id, before, after: current });
  }
  return { total: current, steps };
}
