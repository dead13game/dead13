// 模拟宇宙角色 PVE 技能 — 等级 1-10 查表 / 冷却 / 菜月昴读档
// 纯逻辑层，零依赖（设计文档 docs/simuniverse-design.md §8）

import { UNI_SKILLS, LINIYA_SHIELD_VALUE } from "./uniConstants.js";
import { drawPoker, damageEnemy, grantExtraAction } from "./uniCombat.js";
import { getUniModifiers, triggerAfterSkill, blessingMult, blessingVal, BLESSINGS } from "./uniBuffs.js";
import { LOG_TYPE } from "../../game/gameLogger.js";
import { recordSound } from "../../game/soundEvents.js";
/** 技能等级取值（数组按等级 1-10，越界取末项） */
function val(arr, lv) {
  if (!arr) return 0;
  return arr[Math.min(lv, arr.length) - 1];
}

/** 有效技能等级（含经验卷轴 C 的临时提升，战斗结束失效） */
function effectiveLevel(state, t) {
  return Math.min(10, t.skillLevel + (state.tempSkillBoost || 0));
}

/** 当前行动角色是否可用大招（冷却/被动/死亡） */
export function canUseUniSkill(state, charIndex) {
  const t = state.team[charIndex];
  if (!t || !t.alive) return { ok: false, reason: "无法行动" };
  const sk = UNI_SKILLS[t.charId];
  if (!sk || sk.type !== "active") return { ok: false, reason: "被动技能" };
  if (t.skillCooldown > 0) return { ok: false, reason: `冷却 ${t.skillCooldown} 回合` };
  return { ok: true };
}

/** 技能展示信息（UI 用） */
export function getSkillInfo(state, charIndex) {
  const t = state.team[charIndex];
  if (!t) return null;
  const sk = UNI_SKILLS[t.charId];
  if (!sk) return null;
  const lv = effectiveLevel(state, t);
  return {
    name: sk.name,
    type: sk.type,
    level: lv,
    cooldown: t.skillCooldown,
    cdTotal: sk.cd ? val(sk.cd, lv) : null,
    value: sk.values ? val(sk.values, lv) : null,
    extra: sk.heal
      ? { heal: val(sk.heal, lv) }
      : sk.dot
        ? { dot: val(sk.dot, lv), dotTurns: val(sk.dotTurns, lv) }
        : null,
  };
}

/**
 * 执行大招。
 * @param {object} state
 * @param {number} charIndex 施放角色（必须是当前行动角色）
 * @param {object} payload { targetIdx: 敌方 id, members: [纳西妲立即行动的人], branch: 'shield'|'dot' (莉奈娅) }
 */
export function executeUniSkill(state, charIndex, payload = {}) {
  const c = state.combat;
  const t = state.team[charIndex];
  if (!t || !t.alive) return { ok: false, reason: "无法行动" };
  if (c.activeIdx !== charIndex) return { ok: false, reason: "非当前行动角色" };
  const sk = UNI_SKILLS[t.charId];
  if (!sk || sk.type !== "active") return { ok: false, reason: "被动技能" };
  if (t.skillCooldown > 0) return { ok: false, reason: `冷却 ${t.skillCooldown} 回合` };

  const lv = effectiveLevel(state, t);
  // 阈下知觉：首次终结技（doSkill 前设置，使加成作用于本次开大伤害）
  const yuxiaFx = BLESSINGS.yuxia?.fx;
  let yuxiaBoost = 0;
  if (yuxiaFx && blessingMult(state, "yuxia") > 0 && !state.uniFirstUltUsed) {
    state.uniFirstUltUsed = true;
    yuxiaBoost = blessingVal(state, "yuxia", "atkPct");
    t.status.nextSkillBoost = (t.status.nextSkillBoost || 0) + yuxiaBoost;
  }
  const effect = doSkill(state, t, sk, lv, payload);
  if (!effect.ok && yuxiaBoost > 0) {
    // 施放失败：回滚首次终结技标记
    state.uniFirstUltUsed = false;
    t.status.nextSkillBoost = Math.max(0, (t.status.nextSkillBoost || 0) - yuxiaBoost);
    return effect;
  }
  if (!effect.ok) return effect;

  // 冷却置满（含开大当回合，之后每回合 -1）
  t.skillCooldown = val(sk.cd, lv) || 0;
  // 祝福：引燃的炬火（下次攻击+50%）/ 线圈编织的罗琦（回 16%）
  triggerAfterSkill(state, charIndex);
  // 方程：蛰虫帝（施放终结技后对随机敌人造成 10% 生命上限伤害）
  if (state.equations?.some((e) => e.id === "zhedi")) {
    const aliveEnemies = c.enemies.filter((e) => e.alive);
    if (aliveEnemies.length > 0) {
      const victim = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
      const dmg = Math.ceil(t.maxHp * 0.1);
      damageEnemy(state, victim.id, dmg, charIndex);
    }
  }
  recordSound(state, "skill");
  state.devLog.info(LOG_TYPE.SKILL_USE, `${t.name} 施放 ${sk.name}`, {
    charId: t.charId,
    skillLevel: lv,
    effect: effect.summary,
  });
  // 技能可能直接结束战斗（如打死最后一波）
  if (c.phase === "won" || c.phase === "lost") return { ok: true, effect };
  return { ok: true, effect };
}

/** 各角色技能实现 */
/** 终结技（角色技能）伤害加成：常驻 skillDmgMult + 一次性 nextSkillBoost（阈下知觉），一次性标记消耗 */
function skillDmgMult(state, t) {
  const mods = getUniModifiers(state);
  const oneShot = t.status.nextSkillBoost || 0;
  if (t.status.nextSkillBoost) t.status.nextSkillBoost = 0;
  return mods.skillDmgMult + oneShot;
}

function doSkill(state, t, sk, lv, payload) {
  const c = state.combat;
  switch (t.charId) {
    case 1: {
      // 温迪：爆发 n 张牌（1-9 级 2~10 张，10 级 10 张）伤害 = 牌面和 - 2
      const n = val(sk.values, lv);
      if (payload.targetIdx == null) return { ok: false, reason: "需要目标" };
      const cards = drawPoker(state, n);
      const dmg = Math.max(0, Math.ceil((cards.reduce((s, p) => s + p.value, 0) - 2) * (1 + skillDmgMult(state, t) / 100)));
      damageEnemy(state, payload.targetIdx, dmg, t.index);
      state.log.push(`${t.name} 爆发 ${n} 张牌（${dmg} 伤害）`);
      return { ok: true, summary: { cards: n, dmg } };
    }
    case 2: {
      // 钟离：全队护盾（乘祝福护盾加成）
      const shield = val(sk.values, lv);
      const mods = getUniModifiers(state);
      const gain = Math.ceil(shield * (1 + mods.shieldMult / 100));
      for (const m of state.team) if (m.alive) m.shield += gain;
      state.log.push(`${t.name} 全队 +${gain} 护盾`);
      return { ok: true, summary: { shield: gain } };
    }
    case 3: {
      // 雷电将军：单体伤害
      if (payload.targetIdx == null) return { ok: false, reason: "需要目标" };
      const dmg = Math.ceil(val(sk.values, lv) * (1 + skillDmgMult(state, t) / 100));
      damageEnemy(state, payload.targetIdx, dmg, t.index);
      state.log.push(`${t.name} 对目标造成 ${dmg} 伤害`);
      return { ok: true, summary: { dmg } };
    }
    case 4: {
      // 纳西妲：指定 1-4 人立即行动
      const count = val(sk.values, lv);
      const members = (payload.members || []).slice(0, count);
      if (members.length === 0) return { ok: false, reason: "需要选择角色" };
      let granted = 0;
      for (const idx of members) {
        if (grantExtraAction(state, idx)) granted += 1;
      }
      state.log.push(`${t.name} 让 ${members.length} 名角色立即行动`);
      return { ok: true, summary: { granted, members } };
    }
    case 5: {
      // 芙宁娜：全队增伤%（3 回合）+ 治疗自身生命上限%（乘祝福回复加成）
      const pct = val(sk.values, lv);
      const healPct = val(sk.heal, lv);
      const mods = getUniModifiers(state);
      const healBase = Math.ceil((t.maxHp * healPct) / 100);
      const healAmount = Math.ceil(healBase * (1 + mods.healMult / 100));
      for (const m of state.team) {
        if (!m.alive) continue;
        m.status.dmgBuffPct = Math.max(m.status.dmgBuffPct || 0, pct);
        m.status.dmgBuffTurns = 3;
        let amount = healAmount;
        if (m.status.healCut > 0) amount = Math.ceil(amount * (1 - m.status.healCut));
        m.hp = Math.min(m.maxHp, m.hp + amount);
      }
      state.log.push(`${t.name} 全队增伤 ${pct}%（3 回合），治疗 ${healAmount}`);
      return { ok: true, summary: { pct, healAmount } };
    }
    case 6:
    case 7:
      return { ok: false, reason: "被动技能" };
    case 8: {
      // 风堇：全队生命上限 +%（3 回合）→ 回满 → 回复量 10% 伤害
      const pct = val(sk.values, lv);
      let totalHealed = 0;
      for (const m of state.team) {
        if (!m.alive) continue;
        m.status.origMaxHp = m.maxHp;
        const newMax = Math.ceil((m.maxHp * (100 + pct)) / 100);
        m.status.maxHpBuffPct = pct;
        m.status.maxHpBuffTurns = 3;
        totalHealed += newMax - m.hp;
        m.maxHp = newMax;
        m.hp = newMax; // 回满
      }
      const bonusDmg = Math.ceil(totalHealed * 0.1);
      if (bonusDmg > 0) {
        const targets = c.enemies.filter((e) => e.alive);
        if (targets.length > 0) {
          const victim = targets[Math.floor(Math.random() * targets.length)];
          damageEnemy(state, victim.id, Math.ceil(bonusDmg * (1 + skillDmgMult(state, t) / 100)), t.index);
        }
      }
      state.log.push(`${t.name} 全队生命上限 +${pct}% 并回满（附加 ${bonusDmg} 伤害）`);
      return { ok: true, summary: { pct, totalHealed, bonusDmg } };
    }
    case 9: {
      // 莉奈娅：一技能 全队 N 张盾 / 二技能 dot
      const branch = payload.branch || "shield";
      const n = val(sk.values, lv);
      if (branch === "dot") {
        const dot = val(sk.dot, lv);
        const turns = val(sk.dotTurns, lv);
        if (turns > 0) {
          // 6-10 级：持续 dot
          for (const e of c.enemies) {
            if (!e.alive) continue;
            e.dotDmg = dot;
            e.dotTurns = turns;
          }
          state.log.push(`${t.name} 全体敌人受 ${dot} 点持续伤害（${turns} 回合）`);
          return { ok: true, summary: { branch: "dot", dot, turns } };
        }
        // 1-5 级：立即伤害
        for (const e of c.enemies) {
          if (e.alive) damageEnemy(state, e.id, Math.ceil(dot * (1 + skillDmgMult(state, t) / 100)), t.index);
        }
        state.log.push(`${t.name} 全体敌人受 ${dot} 点伤害`);
        return { ok: true, summary: { branch: "dot", dot, turns: 0 } };
      }
      // 盾：全队获得 N 张盾（每张值 LINIYA_SHIELD_VALUE，乘祝福护盾加成）
      const mods = getUniModifiers(state);
      const shield = Math.ceil(n * LINIYA_SHIELD_VALUE * (1 + mods.shieldMult / 100));
      for (const m of state.team) if (m.alive) m.shield += shield;
      state.log.push(`${t.name} 全队 +${n} 张盾（${shield} 护盾）`);
      return { ok: true, summary: { branch: "shield", shields: n, shield } };
    }
    case 10: {
      // 爱蜜莉雅：敌方停 N 回合
      const turns = val(sk.values, lv);
      for (const e of c.enemies) {
        if (!e.alive) continue;
        e.stunnedTurns = Math.max(e.stunnedTurns || 0, turns);
      }
      state.log.push(`${t.name} 敌方全体停 ${turns} 回合`);
      return { ok: true, summary: { turns } };
    }
    case 11:
      return { ok: false, reason: "被动技能（死亡回归）" };
    case 12: {
      // myracler(开发者)：对敌方全体造成 1000 点伤害（冷却 0）
      const dmg = Math.ceil(val(sk.values, lv) * (1 + skillDmgMult(state, t) / 100));
      for (const e of c.enemies) {
        if (e.alive) damageEnemy(state, e.id, dmg, t.index);
      }
      state.log.push(`${t.name} 开发者指令：对敌方全体造成 ${dmg} 伤害`);
      return { ok: true, summary: { dmg, targets: c.enemies.filter((e) => e.alive).length } };
    }
    default:
      return { ok: false, reason: "未知角色" };
  }
}
