// 模拟宇宙战斗结算 — 扑克牌行动 / 敌人模板 / 波次 / 转化及格线
// 纯逻辑层，零依赖（设计文档 docs/simuniverse-design.md §6）

import { createFullDeck, shuffleDeck, drawCards } from "../../game/deck.js";
import { CHARACTERS } from "../../game/constants.js";
import { LOG_TYPE } from "../../game/gameLogger.js";
import { recordSound } from "../../game/soundEvents.js";
import { addShards, tryCaiyueangRevive } from "./uniState.js";
import { executeUniSkill } from "./uniSkills.js";
import {
  getUniModifiers,
  memberAtkMods,
  memberDmgTakenMods,
  applyShieldGain,
  triggerOnCombatStart,
  triggerOnDamaged,
  triggerOnHeal,
  triggerOnKill,
  triggerOnEnemyDot,
  triggerOnAttackAfter,
  triggerOnEndTurn,
  triggerCurioOnCombatStart,
  triggerCurioOnWin,
  chargeJarBrain,
  breakCurio,
  curioVal,
  blessingMult,
  blessingVal,
  isEquationUnlocked,
  rollBlessingCandidates,
  rollBlessing,
  gainBlessing,
  rollEquation,
  gainEquation,
  EQUATIONS,
  CURIO_FX,
  BLESSINGS,
} from "./uniBuffs.js";
import {
  ENEMY_BASE,
  ENEMY_PATTERNS,
  planeMult,
  dmgMult,
  REGION_REWARD,
  TRANSFORM_ELITE_SHARDS,
  TRANSFORM_PASS_ROUND,
  ENEMY_DEBUFF_DOT,
  ENEMY_DEBUFF_DURATION,
  PUPPET_DMG,
  PUPPET_EVERY,
  BOSS_HEAL_CUT,
  ELITE_LOCK_DMG,
} from "./uniConstants.js";

const POKER_DRAW = 1; // 每次行动抽 1 张扑克（先选行动再抽牌）

// ---- 敌人 ----

/** 生成 1 个敌人（血量 × 位面倍数，pattern 随机） */
function createEnemy(state, kind, idx) {
  const base = ENEMY_BASE[kind];
  const mult = planeMult(state.plane);
  const hp = base.hp * mult;
  const patterns = Object.keys(ENEMY_PATTERNS[kind]);
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  return {
    id: idx,
    kind,
    name: kind === "boss" ? base.name : `${base.name}${idx + 1}`,
    pattern,
    hp,
    maxHp: hp,
    shield: 0,
    locked: [], // 精英 B 锁定目标（team index）
    round: 0, // 敌人自身轮次（精英 B/C 循环用）
    alive: true,
    stunnedTurns: 0, // 爱蜜莉雅冻结剩余回合
    dotDmg: 0, // 莉奈娅 dot 每回合伤害
    dotTurns: 0, // 莉奈娅 dot 剩余回合
  };
}

/** 生成当前波次敌人 */
export function spawnWave(state) {
  const c = state.combat;
  const cfg = c.waves[c.wave];
  if (!cfg) {
    // 无波次配置（异常区域）→ 直接胜利，避免卡死
    endCombat(state, "won");
    return;
  }
  c.enemies = [];
  for (let i = 0; i < cfg.count; i++) {
    c.enemies.push(createEnemy(state, cfg.kind, i));
  }
  state.devLog.info(LOG_TYPE.UNI_REGION, `第 ${c.wave + 1} 波敌人登场`, {
    kind: cfg.kind,
    count: cfg.count,
    mult: planeMult(state.plane),
    enemies: c.enemies.map((e) => `${e.name}(${e.hp})`),
  });
}

/** 波次敌人全灭检查（进场即死/羊皮卷等）：全灭则推进下一波或胜利，避免卡死 */
function checkWaveClear(state) {
  const c = state.combat;
  if (!c || c.phase === "won" || c.phase === "lost" || c.phase === "wave-clear") return;
  if (c.enemies.length > 0 && c.enemies.every((e) => !e.alive)) {
    if (c.wave >= c.waves.length - 1) {
      endCombat(state, "won");
    } else {
      nextWave(state);
    }
  }
}

// ---- 战斗开始 ----

/** 开始一场战斗（依据 state.region 类型） */
export function startCombat(state) {
  const r = state.region;
  const kind = r.type; // battle | elite | boss | transform
  state.combat = {
    kind,
    waves: r.waves || [],
    wave: 0,
    enemies: [],
    round: 0, // 已完成的玩家回合数（转化及格线按此计）
    turnCount: 0, // 本回合已行动玩家数
    actionOrder: [], // 本回合玩家行动顺序（team index）
    turnIdx: -1, // 当前行动玩家在 actionOrder 中的位置
    activeIdx: null, // 当前行动玩家的 team index
    pendingPoker: [], // 当前玩家抽的 2 张扑克
    pokerDeck: shuffleDeck(createFullDeck(1)),
    phase: "player-action",
    enemyQueue: [], // 待结算敌人行动 [{ enemyIdx, action, desc }]
    enemyPending: null, // 已 announce 待 resolve 的行动
    lastReward: null,
    waveClear: false, // 波次清空等待处理（转化第三波询问）
    buffs: Object.keys(state.nextBattleBuffs || {}), // 本次战斗 buff（事件奖励）
    immuneUsed: false, // 免疫符文：首次伤害无效
  };
  // 急救包：战斗开始自动回 10%（消耗 1 个）
  if (state.items?.medkit > 0) {
    state.items.medkit -= 1;
    for (const t of state.team) {
      if (!t.alive) continue;
      const healed = Math.ceil(t.maxHp * 0.1);
      t.hp = Math.min(t.maxHp, t.hp + healed);
      triggerOnHeal(state, t.index, healed);
    }
    state.log.push("使用急救包，全队回复 10% 生命");
  }
  spawnWave(state);
  checkWaveClear(state);
  if (state.combat.phase === "won" || state.combat.phase === "lost") {
    state.devLog.info(LOG_TYPE.UNI_INIT, `战斗开始即结束：${r.name}`, { result: state.combat.phase });
    return state.combat;
  }
  triggerOnCombatStart(state); // 祝福：构筑·哨戒
  triggerCurioOnCombatStart(state); // 奇物：战斗开始效果
  checkWaveClear(state); // 战斗开始奇物可能对敌人造成伤害（羊皮卷等）
  if (state.combat.phase === "won" || state.combat.phase === "lost") {
    state.devLog.info(LOG_TYPE.UNI_INIT, `战斗开始即结束：${r.name}`, { result: state.combat.phase });
    return state.combat;
  }
  startPlayerTurn(state);
  state.devLog.info(LOG_TYPE.UNI_INIT, `战斗开始：${r.name}`, {
    kind,
    floor: state.floor,
    plane: state.plane,
    waveCount: state.combat.waves.length,
  });
  return state.combat;
}

// ---- 玩家回合 ----

/** 回合开始：冷却/状态递减 → dot 结算 → 排行动顺序 → 第一名角色行动 */
export function startPlayerTurn(state) {
  const c = state.combat;
  if (!c || c.phase === "won" || c.phase === "lost") return;
  c.round += 1;
  // 进入玩家回合（dot 结算若触发 wave-clear/全灭会覆盖 phase，由下方检查拦截）
  c.phase = "player-action";
  // 技能冷却递减（开大当回合已置满，之后每回合 -1）
  for (const t of state.team) {
    if (t.skillCooldown > 0) t.skillCooldown -= 1;
    // 芙宁娜增伤持续回合
    if (t.status.dmgBuffTurns > 0) {
      t.status.dmgBuffTurns -= 1;
      if (t.status.dmgBuffTurns === 0) t.status.dmgBuffPct = 0;
    }
    // 风堇生命上限提升持续回合（到期还原）
    if (t.status.maxHpBuffTurns > 0) {
      t.status.maxHpBuffTurns -= 1;
      if (t.status.maxHpBuffTurns === 0) {
        t.maxHp = t.status.origMaxHp;
        t.hp = Math.min(t.hp, t.maxHp);
        t.status.maxHpBuffPct = 0;
      }
    }
  }
  // 方程：除魔士（每 4 回合开始时全队伤害 +200%，1 回合）
  const chumoFx = EQUATIONS.chumo?.fx;
  if (isEquationActive(state, "chumo") && chumoFx && c.round % (chumoFx.every || 4) === 0) {
    for (const t of state.team) {
      if (!t.alive) continue;
      t.status.dmgBuffPct = (t.status.dmgBuffPct || 0) + (chumoFx.atkPct || 200);
      t.status.dmgBuffTurns = 1;
    }
    state.log.push("除魔士：全队伤害 +200%（本回合）");
  }
  tickTeamDots(state);
  tickEnemyDots(state);
  // dot 结算可能清空波次（wave-clear）或全灭（lost）→ 不再继续本回合
  if (c.phase !== "player-action") return;
  // 奇物：虚构机兵（角色回合开始回复 20% 生命上限）
  if (hasCurio(state, "xugou")) {
    for (const t of state.team) {
      if (!t.alive) continue;
      t.hp = Math.min(t.maxHp, t.hp + Math.ceil(t.maxHp * 0.2));
    }
  }
  // speed 降序（同速按队伍 index），存活角色参与
  c.actionOrder = state.team
    .map((t, i) => ({ i, speed: CHARACTERS[t.charId].speed }))
    .filter((x) => state.team[x.i].alive)
    .sort((a, b) => b.speed - a.speed || a.i - b.i)
    .map((x) => x.i);
  // 云镝逐步离：每经过 N 回合，全队行动提前 100%（简化 = 本回合每人额外行动一次）
  if (blessingMult(state, "yundi") > 0 && c.round % (blessingVal(state, "yundi", "every") || 20) === 0) {
    c.actionOrder = [...c.actionOrder, ...c.actionOrder];
    state.log.push(`云镝：第 ${c.round} 回合全队行动提前 100%`);
  }
  c.turnCount = 0;
  c.turnIdx = -1;
  c.waveClear = false;
  state.devLog.debug(LOG_TYPE.UNI_FLOOR, `第 ${c.round} 回合`, {
    round: c.round,
    order: c.actionOrder.map((i) => state.team[i].name),
  });
  nextPlayerAction(state);
}

/** 轮到下一名角色行动（跳过被控/死亡角色） */
function nextPlayerAction(state) {
  const c = state.combat;
  c.turnIdx += 1;
  if (c.turnIdx >= c.actionOrder.length) {
    // 玩家阶段结束 → 敌人阶段（首领穿插已在 finishPlayerAction 处理）
    if (c.phase === "won" || c.phase === "lost") return;
    startEnemyPhase(state);
    return;
  }
  const idx = c.actionOrder[c.turnIdx];
  const t = state.team[idx];
  c.activeIdx = idx;
  if (!t.alive) {
    nextPlayerAction(state);
    return;
  }
  // 傀儡：行动时攻击队友
  if (t.status.puppet) {
    const victim = pickAliveMember(state, idx);
    if (victim !== null) {
      damageTeamMember(state, victim, PUPPET_DMG);
      state.devLog.warn(LOG_TYPE.UNI_REGION, `${t.name}（傀儡）攻击队友`, {
        victim: state.team[victim].name,
        dmg: PUPPET_DMG,
      });
    }
    t.status.puppet = null;
    finishPlayerAction(state);
    return;
  }
  // 眩晕：跳过本回合
  if (t.status.stunned) {
    t.status.stunned = false;
    state.devLog.debug(LOG_TYPE.UNI_REGION, `${t.name} 被眩晕跳过`, {});
    finishPlayerAction(state);
    return;
  }
  // 轮到角色：等待选择行动（先选行动，选定后抽 1 张牌结算）
  c.pendingPoker = [];
  c.phase = "player-action";
  state.devLog.debug(LOG_TYPE.UNI_REGION, `${t.name} 行动：选择行动`, {});
}

/** 从共享牌堆抽 n 张，抽空重建 */
export function drawPoker(state, n) {
  const c = state.combat;
  if (c.pokerDeck.length < n) {
    c.pokerDeck = shuffleDeck(createFullDeck(1));
  }
  const { drawn, remaining } = drawCards(c.pokerDeck, n);
  c.pokerDeck = remaining;
  return drawn;
}

/**
 * 统一抽牌入口：战斗内用战斗牌堆；战斗外（事件/区域层）用独立临时牌堆。
 * 所有「获得 N 张防御牌 → 点数进护盾」的效果都走这里，与防御行动机制一致。
 */
export function drawPokerUnified(state, n) {
  const c = state.combat;
  if (c?.pokerDeck) return drawPoker(state, n);
  const deck = shuffleDeck(createFullDeck(1));
  const { drawn } = drawCards(deck, n);
  return drawn;
}

// ---- 玩家三选一 ----

/** 普攻：先抽 1 张牌，伤害 = 牌面值（+各类修正），目标敌人 */
export function playerAttack(state, enemyIdx) {
  const c = state.combat;
  if (c.phase !== "player-action") {
    return { ok: false, reason: "非行动时机" };
  }
  const enemy = c.enemies.find((e) => e.id === enemyIdx && e.alive);
  if (!enemy) return { ok: false, reason: "目标无效" };
  // 先选行动后抽牌：若 UI 已抽牌展示则用已抽的，否则补抽 1 张
  if (!c.pendingPoker.length) c.pendingPoker = drawPoker(state, POKER_DRAW);
  const attacker = state.team[c.activeIdx];
  // 伤害修正：技能被动（少女 atkBonus / 芙宁娜 dmgBuffPct / 玛薇卡斗志）+ 祝福（atkMult/普攻/动态/炬火）
  const mods = getUniModifiers(state);
  const flat = attacker.status.atkBonus || 0;
  const pct = attacker.status.dmgBuffPct || 0;
  // 火神斗志：每层斗志使本次攻击伤害 +1（加算位置：牌面 + 少女加成 + 斗志 → 再乘增伤百分比）
  const spiritBonus = attacker.status.spirit || 0;
  const nextBoost = attacker.status.nextAttackBoost || 0;
  // 方程：受诅教师（每消灭 1 敌人本场伤害 +20%，最多 3 层）
  const shouzuFx = EQUATIONS.shouzu?.fx;
  const killStacks = isEquationActive(state, "shouzu") && shouzuFx ? Math.min(c.killStacks || 0, shouzuFx.maxStacks || 3) : 0;
  const raw = c.pendingPoker[0]?.value || 0; // 单牌面值即基础伤害
  const totalPct =
    pct +
    mods.atkMult +
    mods.atkNormalMult +
    memberAtkMods(state, c.activeIdx) +
    nextBoost +
    killStacks * (shouzuFx?.atkPerKill || 20) +
    (isEquationActive(state, "ruchong") && c.round === 1 ? (EQUATIONS.ruchong?.fx?.firstAtkMult || 60) : 0) +
    (c.buffs?.includes("atkUp") ? 30 : 0) +
    (c.buffs?.includes("dmgUp50") ? 50 : 0);
  const dmg = Math.max(0, Math.ceil((raw + flat + spiritBonus) * (1 + totalPct / 100)));
  if (attacker.status.nextAttackBoost) attacker.status.nextAttackBoost = 0; // 炬火一次性
  recordSound(state, "attack");
  // 方程：遗迹魔法师（攻击后罐中脑 +8%）
  if (isEquationActive(state, "yiji")) chargeJarBrain(state, EQUATIONS.yiji?.fx?.jarBrain || 8);
  const poker = c.pendingPoker[0];
  state.devLog.info(LOG_TYPE.UNI_REGION, `${attacker.name} 普攻 ${enemy.name}`, {
    enemyIdx,
    sourceIdx: c.activeIdx,
    card: poker ? poker.rank + poker.suit : "",
    raw,
    flat,
    pct,
    spiritBonus,
    dmg,
  });
  c.lastPoker = poker; // UI 展示最近抽牌
  c.lastPokerTarget = { type: "enemy", id: enemyIdx }; // 飞牌落点：攻击目标敌人
  c.pendingPoker = [];
  damageEnemy(state, enemyIdx, dmg, c.activeIdx);
  // 火神斗志：攻击命中造成伤害 → 攻击者 +1 层（上限内；单场不归零，战斗结束清零）
  gainSpirit(state, c.activeIdx);
  // 方程：梦魔主（攻击附加生命上限+护盾 10%）
  if (isEquationActive(state, "mengmo")) {
    c._pendingExtra = (c._pendingExtra || 0) + Math.ceil(((attacker.maxHp + attacker.shield) * (EQUATIONS.mengmo?.fx?.hpShieldPct || 10)) / 100);
  }
  // 方程：街道骑行官（累计 24 次攻击后第一位角色获得强化攻击）
  c.attackCount = (c.attackCount || 0) + 1;
  const xingzouFx = EQUATIONS.xingzou?.fx;
  if (isEquationActive(state, "xingzou") && xingzouFx && c.attackCount % (xingzouFx.every || 24) === 0) {
    const first = state.team.find((x) => x.alive);
    if (first) {
      first.status.nextAttackBoost = (first.status.nextAttackBoost || 0) + (xingzouFx.atkPct || 160);
      state.log.push("街道骑行官：第一位角色下一次攻击强化");
    }
  }
  // 攻击后祝福钩子（结膜/厌离邪秽苦/神性谐振/灾难性共振/裸脑质·飞溅蛊）
  triggerOnAttackAfter(state, c.activeIdx, enemyIdx, dmg);
  if (c._pendingExtra) {
    damageEnemy(state, enemyIdx, c._pendingExtra, c.activeIdx);
    c._pendingExtra = 0;
  }
  if (c._splashTarget != null) {
    damageEnemy(state, c._splashTarget, c._pendingSplash, c.activeIdx);
    c._pendingSplash = 0;
    c._splashTarget = null;
  }
  if (c.phase === "won" || c.phase === "lost") return { ok: true, dmg };
  finishPlayerAction(state);
  return { ok: true, dmg };
}

/** 防御：先抽 1 张牌，为指定目标（含自己）添加护盾 = 牌面值 */
export function playerDefense(state, targetIdx) {
  const c = state.combat;
  if (c.phase !== "player-action") {
    return { ok: false, reason: "非行动时机" };
  }
  const target = state.team[targetIdx];
  if (!target || !target.alive) return { ok: false, reason: "目标无效" };
  // 先选行动后抽牌：若 UI 已抽牌展示则用已抽的，否则补抽 1 张
  if (!c.pendingPoker.length) c.pendingPoker = drawPoker(state, POKER_DRAW);
  const poker = c.pendingPoker[0];
  const shield = poker?.value || 0;
  const actor = state.team[c.activeIdx];
  // 少女防御加成：防御者（少女被动受益者）额外护盾
  const defBonus = actor.status.defBonus || 0;
  // 统一护盾入口：螺壳/四棱锥体护盾量加成 + 亚共晶体（提供者回盾）
  const gained = applyShieldGain(state, actor.index, shield + defBonus);
  target.shield += gained;
  c.lastPoker = poker;
  c.lastPokerTarget = { type: "member", id: targetIdx }; // 飞牌落点：被加护盾的成员
  c.pendingPoker = [];
  recordSound(state, "defense");
  state.devLog.info(LOG_TYPE.UNI_REGION, `${actor.name} 为 ${target.name} 添加护盾`, {
    targetIdx,
    card: poker ? poker.rank + poker.suit : "",
    shield,
    defBonus,
    gained,
    targetShield: target.shield,
  });
  finishPlayerAction(state);
  return { ok: true, shield: gained };
}

/** 开大：执行角色 PVE 技能（uniSkills.js），成功后推进行动 */
export function playerSkill(state, targetIdx, payload = {}) {
  const r = executeUniSkill(state, state.combat.activeIdx, { targetIdx, ...payload });
  if (r.ok && state.combat?.phase === "player-action") {
    finishPlayerAction(state);
  }
  return r;
}

/**
 * 纳西妲：指定角色立即行动（插到当前行动者之后）。
 * 若目标已在本回合行动过，则不生效（返回 false）。
 */
export function grantExtraAction(state, memberIdx) {
  const c = state.combat;
  const t = state.team[memberIdx];
  if (!t || !t.alive) return false;
  if (t.status.stunned || t.status.puppet) return false;
  const remaining = c.actionOrder.slice(c.turnIdx + 1);
  // 目标不在剩余行动顺序 = 已行动过 → 不生效（禁止双动）
  if (!remaining.includes(memberIdx)) return false;
  // 目标仍在剩余队列 → 提到最前：删除目标原位置，插入当前行动者之后
  // （注意不能用 splice(turnIdx+1, 1) 删队首：那会顶掉下一名玩家而非目标）
  const pos = c.actionOrder.indexOf(memberIdx);
  c.actionOrder.splice(pos, 1);
  c.actionOrder.splice(c.turnIdx + 1, 0, memberIdx);
  return true;
}

/** 玩家行动完成：统计行动数 → 首领穿插 → 波次清空 → 下一名角色/敌人阶段 */
function finishPlayerAction(state) {
  const c = state.combat;
  c.turnCount += 1;
  // 首领穿插：前 2 名玩家行动后行动 1 次（interlude），剩余 2 名行动后行动 2 次（actions）
  if (c.kind === "boss") {
    const boss = c.enemies.find((e) => e.alive);
    if (boss) {
      // 首领 pattern 每回合轮转 A → B → C（三种技能都会用）
      const pattern = bossPattern(c.round);
      const tpl = ENEMY_PATTERNS.boss[pattern];
      if (c.turnCount === 2 && tpl.interlude) {
        queueEnemyAction(state, boss, { ...tpl.interlude }, `穿插·${tpl.interlude.type}`);
      } else if (c.turnCount === 4) {
        queueEnemyAction(state, boss, { ...tpl.actions[0] }, `行动1·${tpl.actions[0].type}`);
        queueEnemyAction(state, boss, { ...tpl.actions[1] }, `行动2·${tpl.actions[1].type}`);
      }
    }
  }
  // 波次清空检查（击杀最后敌人后推进）
  if (c.enemies.length > 0 && c.enemies.every((e) => !e.alive)) {
    if (c.kind === "transform" && c.wave === 1) {
      // 转化：两波已灭（及格）→ 询问是否挑战第三波
      c.waveClear = true;
      c.phase = "wave-clear";
      state.devLog.info(LOG_TYPE.UNI_REGION, "转化：两波已灭（及格）", {
        round: c.round,
      });
      return;
    }
    nextWave(state);
    if (c.phase === "won" || c.phase === "lost") return;
  }
  if (c.enemyQueue.length > 0) {
    c.phase = "enemy-announce";
    return; // 等控制器 enemyAnnounce → enemyResolve → 恢复玩家行动
  }
  nextPlayerAction(state);
}

/** 敌人行动入队 */
function queueEnemyAction(state, enemy, action, desc) {
  state.combat.enemyQueue.push({ enemyIdx: enemy.id, action, desc });
}

/** 首领技能轮转：第 1 回合 A，第 2 回合 B，第 3 回合 C，循环 */
function bossPattern(round) {
  return ["A", "B", "C"][(round - 1) % 3];
}

// ---- 敌人阶段 ----

/** 普通/精英敌人阶段：所有玩家行动后，每个存活敌人按模板入队 */
function startEnemyPhase(state) {
  const c = state.combat;
  if (c.phase === "won" || c.phase === "lost") return;
  // 速攻战术：敌方首回合不可行动
  if (c.buffs?.includes("enemyStun") && c.round === 1) {
    state.log.push("速攻战术：敌方首回合无法行动");
    finishEnemyTurn(state);
    return;
  }
  if (c.kind === "boss") {
    const boss = c.enemies.find((e) => e.alive);
    if (boss) boss.round += 1; // 首领自身轮次（傀儡间隔判定用）
    // 首领行动已穿插入队；若队列空（boss 已死）直接结束
    if (c.enemyQueue.length === 0) {
      finishEnemyTurn(state);
      return;
    }
    c.phase = "enemy-announce";
    return;
  }
  for (const e of c.enemies) {
    if (!e.alive) continue;
    e.round += 1;
    // 爱蜜莉雅冻结：停 N 回合（跳过行动）
    if (e.stunnedTurns > 0) {
      e.stunnedTurns -= 1;
      state.devLog.debug(LOG_TYPE.UNI_REGION, `${e.name} 被冻结跳过行动`, {
        stunnedTurnsLeft: e.stunnedTurns,
      });
      continue;
    }
    const tpl = ENEMY_PATTERNS[e.kind][e.pattern];
    if (!tpl) continue;
    const actions = resolvePatternActions(state, e, tpl);
    actions.forEach((a, i) => queueEnemyAction(state, e, a, `${tpl.name}#${i + 1}`));
  }
  c.phase = "enemy-announce";
  if (c.enemyQueue.length === 0) finishEnemyTurn(state);
}

/**
 * 生成敌人本回合的行动列表：
 * 普通：actions 全部 1 次；精英：actions 2 次（B/C 按轮次循环）。
 */
export function resolvePatternActions(state, enemy, tpl) {
  const actions = tpl.actions;
  if (enemy.kind === "elite" && tpl.special === "lock") {
    // B：单数回合锁定 ×2（新一轮清空旧目标），双数回合对锁定者 16 点 ×2
    if (enemy.round % 2 === 1) {
      enemy.locked = []; // 文档：第 3 回合循环重新锁定 → 清空上一周期目标
      return [{ type: "lock" }, { type: "lock" }];
    }
    return [
      { type: "hitLocked", dmg: ELITE_LOCK_DMG },
      { type: "hitLocked", dmg: ELITE_LOCK_DMG },
    ];
  }
  if (enemy.kind === "elite" && tpl.special === "cycle") {
    // C：单数回合 debuff ×2，双数回合全体 8 ×2
    if (enemy.round % 2 === 1) {
      return [{ type: "debuff" }, { type: "debuff" }];
    }
    return [{ type: "aoe", dmg: 8 }, { type: "aoe", dmg: 8 }];
  }
  return actions.map((a) => ({ ...a }));
}

/** 敌人宣布下一次行动（慢放第一步） */
export function enemyAnnounce(state) {
  const c = state.combat;
  if (!c || c.phase !== "enemy-announce") return { playing: false };
  if (c.enemyQueue.length === 0) {
    finishEnemyTurn(state);
    return { playing: false };
  }
  const next = c.enemyQueue[0];
  const enemy = c.enemies.find((e) => e.id === next.enemyIdx);
  if (!enemy || !enemy.alive) {
    c.enemyQueue.shift();
    return enemyAnnounce(state);
  }
  c.enemyPending = next;
  state.devLog.debug(LOG_TYPE.UNI_REGION, `${enemy.name} 准备行动`, {
    action: next.action,
    desc: next.desc,
  });
  return { playing: true, enemyName: enemy.name, action: next.action, desc: next.desc };
}

/** 结算敌人行动（慢放第二步） */
export function enemyResolve(state) {
  const c = state.combat;
  if (!c || c.phase !== "enemy-announce" || !c.enemyPending) return { ok: false };
  const { enemyIdx, action, desc } = c.enemyPending;
  const enemy = c.enemies.find((e) => e.id === enemyIdx);
  if (enemy && enemy.alive) {
    resolveEnemyAction(state, enemy, action);
  }
  c.enemyQueue.shift();
  c.enemyPending = null;
  if (c.phase === "won" || c.phase === "lost") return { ok: true, done: true };
  if (c.enemyQueue.length === 0) {
    if (c.turnCount >= c.actionOrder.length) {
      // 本回合所有玩家已行动 → 回合结束
      finishEnemyTurn(state);
    } else {
      // 首领穿插发生在玩家行动之间 → 继续剩余玩家行动
      nextPlayerAction(state);
    }
    return { ok: true, done: true };
  }
  c.phase = "enemy-announce";
  return { ok: true, done: false };
}

/** 结算单个敌人行动 */
function resolveEnemyAction(state, enemy, action) {
  const dmgMultNow = dmgMult(state.plane);
  const type = action.type;
  if (type === "single") {
    const target = pickAliveMember(state);
    if (target === null) return;
    // 意义质询：陷入持续伤害状态的敌人造成的伤害降低 3 点
    const yiyiCut = enemy.dotTurns > 0 ? blessingVal(state, "yiyi", "dmgCut") : 0;
    // 有梦-0110：15 回合后受到的伤害提高 10%
    const youmengUp = state.combat._youmengTurns && state.combat.round >= state.combat._youmengTurns ? (CURIO_FX.youmeng?.laterDmgPct || 10) : 0;
    const dmg = Math.max(0, Math.ceil(action.dmg * dmgMultNow * (1 + youmengUp / 100)) - yiyiCut);
    state.devLog.info(LOG_TYPE.UNI_REGION, `${enemy.name} 攻击 ${state.team[target].name}`, { dmg });
    damageTeamMember(state, target, dmg, enemy.id);
  } else if (type === "aoe") {
    // 意义质询：dot 敌人 AOE 伤害 -3
    const yiyiCut = enemy.dotTurns > 0 ? blessingVal(state, "yiyi", "dmgCut") : 0;
    const youmengUp = state.combat._youmengTurns && state.combat.round >= state.combat._youmengTurns ? (CURIO_FX.youmeng?.laterDmgPct || 10) : 0;
    const dmg = Math.max(0, Math.ceil(action.dmg * dmgMultNow * (1 + youmengUp / 100)) - yiyiCut);
    state.devLog.info(LOG_TYPE.UNI_REGION, `${enemy.name} 全体攻击`, { dmg });
    for (let i = 0; i < state.team.length; i++) {
      if (state.team[i].alive) damageTeamMember(state, i, dmg, enemy.id);
    }
  } else if (type === "shield") {
    const shield = Math.ceil(enemy.maxHp * (action.pct || 0.3));
    enemy.shield += shield;
    state.devLog.info(LOG_TYPE.UNI_REGION, `${enemy.name} 获得护盾`, { shield });
  } else if (type === "heal") {
    const heal = Math.ceil(enemy.maxHp * (action.pct || 0.1));
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
    state.devLog.info(LOG_TYPE.UNI_REGION, `${enemy.name} 恢复`, { heal, hp: enemy.hp });
  } else if (type === "lock") {
    const target = pickAliveMember(state);
    if (target !== null) enemy.locked.push(target);
    state.devLog.info(LOG_TYPE.UNI_REGION, `${enemy.name} 锁定 ${state.team[target]?.name ?? "?"}`, {
      locked: enemy.locked,
    });
  } else if (type === "hitLocked") {
    const dmg = action.dmg * dmgMultNow;
    for (const idx of enemy.locked) {
      if (state.team[idx]?.alive) {
        state.devLog.info(LOG_TYPE.UNI_REGION, `${enemy.name} 狙击 ${state.team[idx].name}`, { dmg });
        damageTeamMember(state, idx, dmg, enemy.id);
      }
    }
    if (enemy.locked.length === 0) {
      // 无锁定目标（如已死）：随机 1 人
      const target = pickAliveMember(state);
      if (target !== null) damageTeamMember(state, target, dmg, enemy.id);
    }
  } else if (type === "debuff") {
    const target = pickAliveMember(state);
    if (target === null) return;
    const t = state.team[target];
    t.status.dot = Math.max(t.status.dot, ENEMY_DEBUFF_DOT);
    t.status.dotTurns = ENEMY_DEBUFF_DURATION;
    state.devLog.info(LOG_TYPE.UNI_REGION, `${enemy.name} 对 ${t.name} 上 debuff`, {
      dot: ENEMY_DEBUFF_DOT,
      turns: ENEMY_DEBUFF_DURATION,
    });
  } else if (type === "healcut") {
    for (const t of state.team) {
      if (t.alive) t.status.healCut = BOSS_HEAL_CUT;
    }
    state.devLog.info(LOG_TYPE.UNI_REGION, `${enemy.name} 全体减疗 50%`, {});
  } else if (type === "stun") {
    const target = pickAliveMember(state);
    if (target === null) return;
    // 腐化异木果实：抵抗控制类负面效果（每次抵抗消耗 20% 生命上限）
    if (resistControl(state, state.team[target])) return;
    state.team[target].status.stunned = true;
    state.devLog.info(LOG_TYPE.UNI_REGION, `${enemy.name} 眩晕 ${state.team[target].name}`, {});
  } else if (type === "summon") {
    // 召唤 2 个普通敌人
    const mult = planeMult(state.plane);
    for (let i = 0; i < 2; i++) {
      const summoned = createEnemy(state, "normal", state.combat.enemies.length);
      state.combat.enemies.push(summoned);
    }
    state.devLog.info(LOG_TYPE.UNI_REGION, `${enemy.name} 召唤 2 个普通敌人`, {
      count: state.combat.enemies.length,
    });
  } else if (type === "puppet") {
    if (enemy.round % PUPPET_EVERY === 0 && enemy.round > 0) {
      const target = pickAliveMember(state);
      if (target === null) return;
      // 腐化异木果实：抵抗傀儡控制
      if (resistControl(state, state.team[target])) return;
      state.team[target].status.puppet = true;
      state.devLog.info(LOG_TYPE.UNI_REGION, `${enemy.name} 控制 ${state.team[target].name} 为傀儡`, {});
    } else {
      // 非傀儡回合：随机 1 人 6 点
      const target = pickAliveMember(state);
      if (target === null) return;
      const dmg = 6 * dmgMultNow;
      damageTeamMember(state, target, dmg, enemy.id);
    }
  }
  // 敌人行动可能把全队打死
  if (state.team.every((t) => !t.alive)) endCombat(state, "lost");
}

/** 随机选 1 名存活成员（排除 excludeIdx） */
function pickAliveMember(state, excludeIdx = -1) {
  const alive = state.team
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t.alive && x.i !== excludeIdx);
  if (alive.length === 0) return null;
  return alive[Math.floor(Math.random() * alive.length)].i;
}

/** 腐化异木果实：角色抵抗控制类负面状态（每次抵抗消耗自身生命上限 % 的生命） */
function resistControl(state, t) {
  const fuhua = state.curios?.find((c) => c.id === "fuhua");
  if (!fuhua || fuhua.broken) return false;
  const cost = Math.ceil(t.maxHp * (curioVal(state, "fuhua", "hpCostPct") / 100));
  t.hp = Math.max(1, t.hp - cost);
  state.log.push(`腐化异木果实：${t.name} 抵抗控制效果（消耗 ${cost} 生命）`);
  return true;
}

/** 火神斗志：拥有斗志的角色攻击命中后 +1 层（上限内；单场不归零，战斗结束清零） */
export function gainSpirit(state, memberIdx) {
  const t = state.team[memberIdx];
  if (!t?.status?.spiritCap) return;
  t.status.spirit = Math.min(t.status.spiritCap, t.status.spirit + 1);
}

// ---- 伤害结算 ----

/** 对敌人造成伤害：护盾先扣，剩余扣 HP；击杀发转化奖励；波次清空检查 */
export function damageEnemy(state, enemyIdx, dmg, sourceIdx = -1) {
  const c = state.combat;
  const enemy = c.enemies.find((e) => e.id === enemyIdx);
  if (!enemy || !enemy.alive) return;
  let d = dmg;
  const shieldDmg = Math.min(enemy.shield, d);
  enemy.shield -= shieldDmg;
  d -= shieldDmg;
  enemy.hp = Math.max(0, enemy.hp - d);
  c.lastDamage = { type: "enemy", idx: enemyIdx, dmg, seq: (c._dmgSeq || 0) + 1 };
  c._dmgSeq = c._dmgSeq || 0;
  state.devLog.debug(LOG_TYPE.UNI_REGION, `对 ${enemy.name} 造成伤害`, {
    enemyIdx,
    sourceIdx,
    dmg,
    shieldDmg,
    hpLeft: enemy.hp,
  });
  if (enemy.hp <= 0) {
    enemy.alive = false;
    recordSound(state, "kill");
    // 转化第三波精英：每消灭 1 个 +150 碎片
    if (c.kind === "transform" && enemy.kind === "elite") {
      addShards(state, TRANSFORM_ELITE_SHARDS);
      state.log.push(`消灭精英 ${enemy.name}，+${TRANSFORM_ELITE_SHARDS} 宇宙碎片`);
      state.devLog.info(LOG_TYPE.UNI_SHARDS, "转化第三波精英被消灭", {
        shards: state.shards,
      });
    }
    state.log.push(`击败 ${enemy.name}`);
    // 祝福：飞虹诛凿齿（消灭敌人回血）
    if (sourceIdx >= 0) triggerOnKill(state, sourceIdx);
    // 方程：受诅教师（本场伤害 +20%/层，最多 3）
    if (isEquationActive(state, "shouzu")) {
      c.killStacks = (c.killStacks || 0) + 1;
    }
    // 方程：超级体育生（消灭敌人罐中脑 +30%）
    if (isEquationActive(state, "chaoji")) chargeJarBrain(state, EQUATIONS.chaoji?.fx?.jarBrainKill || 30);
  }
}

/** 是否持有指定方程 */
function hasEquation(state, id) {
  return state.equations?.some((e) => e.id === id);
}

/** 方程是否生效：已持有且已展开（未展开的方程无效果） */
function isEquationActive(state, id) {
  return hasEquation(state, id) && isEquationUnlocked(state, id);
}

/** 是否持有指定奇物（已损毁的不算） */
function hasCurio(state, id) {
  return state.curios?.some((c) => c.id === id && !c.broken);
}

/** 推进到下一波；波次耗尽 → 胜利（不负责后续行动推进，由调用方处理） */
export function nextWave(state) {
  const c = state.combat;
  c.wave += 1;
  if (c.wave >= c.waves.length) {
    endCombat(state, "won");
    return;
  }
  spawnWave(state);
  checkWaveClear(state); // 新一波进场即全灭（羊皮卷等）→ 继续推进，避免卡死
}

/** 转化层：打完两波后玩家选择 撤退（及格保底）或 挑战第三波 */
export function chooseThirdWave(state, go) {
  const c = state.combat;
  if (!c || c.phase !== "wave-clear") return { ok: false, reason: "非第三波选择时机" };
  if (!go) {
    endCombat(state, "won");
    return { ok: true, go: false };
  }
  c.waveClear = false;
  nextWave(state);
  if (c.phase === "won" || c.phase === "lost") return { ok: true, go: true };
  // 继续推进：首领穿插队列优先，否则下一名玩家
  if (c.enemyQueue.length > 0) {
    c.phase = "enemy-announce";
  } else {
    nextPlayerAction(state);
  }
  return { ok: true, go: true };
}

/** 对我方成员造成伤害：独立护盾 → 防御牌 → 扣 HP → 死亡；sourceEnemyIdx 供切变结构反震定位攻击来源 */
function damageTeamMember(state, memberIdx, dmg, sourceEnemyIdx = -1) {
  const t = state.team[memberIdx];
  const c = state.combat;
  if (!t.alive) return;
  // 祝福减伤（双极喷流 / 反物质费逆方程）+ 战斗 buff（防守战术 -30%）
  const mods = getUniModifiers(state);
  let taken = Math.max(0, 1 - (mods.dmgTakenMult + memberDmgTakenMods(state, memberIdx)) / 100);
  if (c.buffs?.includes("defUp")) taken = Math.max(0, taken - 0.3);
  // 免疫符文：首次受到的伤害无效
  if (c.buffs?.includes("immuneFirst") && !c.immuneUsed) {
    c.immuneUsed = true;
    taken = 0;
    state.log.push("免疫符文生效：本次伤害无效");
  }
  const finalDmg = Math.max(0, Math.ceil(dmg * taken));
  let remaining = finalDmg;
  // 1. 护盾抵扣（防御行动/结膜/莉奈娅/钟离等统一进 shield）
  if (t.shield > 0) {
    const shieldDmg = Math.min(t.shield, remaining);
    t.shield -= shieldDmg;
    remaining -= shieldDmg;
    recordSound(state, "shield_break");
  }
  const hpDmg = Math.min(t.hp, remaining);
  // 湮灭回归不等式：HP 伤害由我方全体分担
  let finalHpDmg = hpDmg;
  if (blessingMult(state, "yanmie") > 0 && hpDmg > 0) {
    const alive = state.team.filter((x) => x.alive);
    if (alive.length > 1) {
      const share = Math.ceil(hpDmg / alive.length);
      for (const x of alive) {
        if (x === t) continue;
        x.hp = Math.max(0, x.hp - share);
        if (x.hp <= 0) {
          x.hp = 0;
          x.alive = false;
          state.log.push(`${x.name} 因伤害分担倒下`);
        }
      }
      finalHpDmg = share;
    }
  }
  t.hp -= finalHpDmg;
  if (remaining > 0) recordSound(state, "hit");
  c.lastDamage = { type: "member", idx: memberIdx, dmg: finalDmg, seq: (c._dmgSeq || 0) + 1 };
  c._dmgSeq = c._dmgSeq || 0;
  // 祝福：构筑·弥合（受击回盾）/ 戒律性闪变（残血回复）
  if (finalHpDmg > 0) triggerOnDamaged(state, memberIdx, finalHpDmg);
  // 切变结构：受击反震（主目标 = 攻击来源敌人），并对相邻敌人溅射
  if (sourceEnemyIdx >= 0 && blessingMult(state, "qiebian") > 0 && hpDmg > 0) {
    const source = c.enemies?.find((e) => e.id === sourceEnemyIdx);
    if (source && source.alive) {
      const reflectPct = blessingVal(state, "qiebian", "reflectPct");
      const splashPct = blessingVal(state, "qiebian", "splashPct");
      const mainReflect = Math.ceil(hpDmg * (1 + reflectPct / 100));
      damageEnemy(state, source.id, mainReflect, memberIdx);
      const srcIdx = c.enemies.findIndex((e) => e.id === sourceEnemyIdx);
      const neighbors = [c.enemies[srcIdx - 1], c.enemies[srcIdx + 1]].filter((e) => e && e.alive);
      const adjDmg = Math.ceil(mainReflect * (splashPct / 100));
      for (const nb of neighbors) damageEnemy(state, nb.id, adjDmg, memberIdx);
      state.log.push(`切变结构：反震 ${mainReflect} 伤害给 ${source.name}${neighbors.length ? `，溅射 ${adjDmg} 给相邻敌人` : ""}`);
    }
  }
  // 反伤符文：反弹 100% 伤害给随机敌人
  if (hpDmg > 0 && c.buffs?.includes("reflect")) {
    const aliveEnemies = c.enemies.filter((e) => e.alive);
    if (aliveEnemies.length > 0) {
      const victim = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
      damageEnemy(state, victim.id, hpDmg, memberIdx);
    }
  }
  state.devLog.debug(LOG_TYPE.UNI_REGION, `${t.name} 受到伤害`, {
    memberIdx,
    dmg,
    taken,
    shieldConsumed: dmg - remaining,
    hpDmg,
    hp: t.hp,
  });
  if (t.hp <= 0) {
    // 回光效应：受致命攻击免死，回复 1% 生命（全队单场一次）
    if (blessingMult(state, "huiguang") > 0 && !t.status.huiguangUsed) {
      t.status.huiguangUsed = true;
      t.hp = Math.max(1, Math.ceil(t.maxHp * 0.01));
      state.log.push(`回光效应：${t.name} 免于阵亡！`);
    } else {
      t.hp = 0;
      t.alive = false;
      state.log.push(`${t.name} 无法战斗`);
      state.devLog.warn(LOG_TYPE.UNI_REGION, `${t.name} 无法战斗`, { memberIdx });
    }
    if (state.team.every((x) => !x.alive)) {
      endCombat(state, "lost");
    }
  }
}

/** 我方 dot 结算（回合开始，无视防御牌） */
function tickTeamDots(state) {
  for (const t of state.team) {
    if (!t.alive || !t.status.dot) continue;
    t.hp = Math.max(0, t.hp - t.status.dot);
    state.devLog.debug(LOG_TYPE.UNI_REGION, `${t.name} 受持续伤害`, {
      dot: t.status.dot,
      hp: t.hp,
    });
    if (t.hp <= 0) {
      t.hp = 0;
      t.alive = false;
      state.log.push(`${t.name} 因持续伤害倒下`);
    }
  }
  if (state.team.every((x) => !x.alive)) endCombat(state, "lost");
}

/** 敌方 dot 结算（莉奈娅二技能，回合开始） */
function tickEnemyDots(state) {
  const c = state.combat;
  if (!c) return;
  let anyTicked = false;
  let totalDotDmg = 0;
  for (const e of c.enemies) {
    if (!e.alive || !e.dotTurns) continue;
    anyTicked = true;
    // 悲剧讲座：持续伤害 +1 点
    const dotDmg = e.dotDmg + (blessingMult(state, "beiju") > 0 ? Math.ceil(e.dotDmg * (blessingVal(state, "beiju", "dotPct") / 100)) : 0);
    totalDotDmg += dotDmg;
    e.hp = Math.max(0, e.hp - dotDmg);
    e.dotTurns -= 1;
    state.devLog.debug(LOG_TYPE.UNI_REGION, `${e.name} 受持续伤害`, {
      dot: dotDmg,
      hp: e.hp,
    });
    if (e.hp <= 0) {
      e.alive = false;
      recordSound(state, "kill");
      state.log.push(`击败 ${e.name}（持续伤害）`);
      if (c.kind === "transform" && e.kind === "elite") {
        addShards(state, TRANSFORM_ELITE_SHARDS);
        state.devLog.info(LOG_TYPE.UNI_SHARDS, "转化第三波精英被持续伤害消灭", {
          shards: state.shards,
        });
      }
    }
  }
  // 祝福：虚妄供品（敌方受持续伤害 → 全队回 2%）
  if (anyTicked) {
    triggerOnEnemyDot(state);
    // 日出之前：我方每次造成持续伤害时回复同等生命
    if (blessingMult(state, "richu") > 0 && totalDotDmg > 0) {
      for (const t of state.team) {
        if (!t.alive) continue;
        t.hp = Math.min(t.maxHp, t.hp + totalDotDmg);
      }
    }
  }
  if (c.enemies.length > 0 && c.enemies.every((e) => !e.alive)) {
    // 波次清空（dot 造成的全灭在回合开始处理）
    if (c.kind === "transform" && c.wave === 1) {
      c.waveClear = true;
      c.phase = "wave-clear";
      return;
    }
    nextWave(state);
  }
}

// ---- 回合推进 ----

/** 敌人阶段结束：转化及格线判定 → 下一玩家回合 */
function finishEnemyTurn(state) {
  const c = state.combat;
  if (!c || c.phase === "won" || c.phase === "lost") return;
  c.enemyQueue = [];
  c.enemyPending = null;
  // 祝福回合结束钩子：回馈庇护护盾 / 寰宇热寂失去战意
  triggerOnEndTurn(state);
  // 方程：苹果！苹果！（每 3 回合结束后对敌方全体造成 2000% 基础伤害，简化 = 20 × 伤害膨胀）
  const pingguoFx = EQUATIONS.pingguo?.fx;
  if (isEquationActive(state, "pingguo") && pingguoFx && c.round % (pingguoFx.every || 3) === 0) {
    const dmg = (pingguoFx.dmgMult || 20) * dmgMult(state.plane);
    for (const e of c.enemies) {
      if (e.alive) damageEnemy(state, e.id, dmg, -1);
    }
    state.log.push("苹果！苹果！：对敌方全体造成伤害");
  }
  // 转化及格线：第 20 回合结束仍未消灭两波 → 战斗失败
  if (c.kind === "transform" && c.round >= TRANSFORM_PASS_ROUND && c.wave < 2) {
    state.log.push(`转化：${c.round} 回合仍未消灭两波，战斗失败`);
    endCombat(state, "lost");
    return;
  }
  if (c.phase !== "won" && c.phase !== "lost") startPlayerTurn(state);
}

// ---- 战斗结束 ----

/** 战斗结束：胜利发奖（碎片按区域类型）/ 失败终局 */
function endCombat(state, result) {
  const c = state.combat;
  if (!c || c.phase === "won" || c.phase === "lost") return;
  c.phase = result;
  // 火神斗志：单场不归零，战斗结束后清零
  for (const t of state.team) {
    t.status.spirit = 0;
  }
  if (result === "won") {
    recordSound(state, "match_end");
    const reward = REGION_REWARD[c.kind];
    let shards = 0;
    // 事件战斗（pendingEventReward）只发事件自身奖励，不叠加区域基础奖励
    if (reward && !state.pendingEventReward) {
      shards = reward.shards || 0;
      // 奇物修正：破碎咕咕钟（-25%）/ 俱乐部券（+40%，强化 +2/级）
      if (hasCurio(state, "posui")) shards = Math.ceil(shards * 0.75);
      if (hasCurio(state, "club")) shards = Math.ceil(shards * curioVal(state, "club", "shardsMult"));
      addShards(state, shards);
    }
    // 奇物：香涎干酪（胜利后全队回满）
    if (hasCurio(state, "cheese")) {
      for (const t of state.team) if (t.alive) t.hp = t.maxHp;
      state.log.push("香涎干酪：全队回复满生命");
    }
    // 奇物：福灵胶（额外 1 个 3 星祝福，1 次后损毁）
    if (hasCurio(state, "fujiao")) {
      const id = rollBlessing(3, 3);
      if (id) gainBlessing(state, id);
      breakCurio(state, "fujiao");
      state.log.push("福灵胶使用后损毁");
    }
    c.lastReward = { shards, blessingPicks: reward?.blessingPicks || 0 };
    state.log.push(`战斗胜利${shards ? `，+${shards} 宇宙碎片` : ""}`);
    // 胜利后祝福三选一：按区域类型生成候选（battle 3×1-2星 / elite 3×2-3星 / boss 2×1-3星）
    // 事件战斗（pendingEventReward）只用事件自身奖励，不叠加区域基础奖励
    if (reward?.blessingPicks && !state.pendingEventReward) {
      // 天才俱乐部普通八卦：战斗结束后无法获得祝福 → 直接跳过
      if (hasCurio(state, "tiancai")) {
        state.log.push("天才俱乐部普通八卦：战斗结束后无法获得祝福");
      } else {
        let starRange = reward.blessingStars || [1, 3];
        let optionCount = 3;
        // 卜签咕咕钟：可选祝福选项减少 1 个（三选一 → 二选一）
        if (hasCurio(state, "bushu")) optionCount = 2;
        // 降维骰子：改为 4 次 1~2 星祝福二选一（2 次战斗后损毁）
        if (hasCurio(state, "jiangwei")) {
          starRange = [1, 2];
          optionCount = 2;
        }
        const picks = [];
        const pickTimes = hasCurio(state, "jiangwei") ? 4 : reward.blessingPicks;
        for (let i = 0; i < pickTimes; i++) {
          picks.push({
            candidates: rollBlessingCandidates(optionCount, starRange[0], starRange[1]),
            starRange,
          });
        }
        state.pendingBlessingPicks = (state.pendingBlessingPicks || []).concat(picks);
        state.log.push(`战斗胜利：可进行 ${pickTimes} 次祝福选择（${optionCount} 选 1）`);
      }
      // 阿阮袋：胜利后选祝福时无法选择，直接获得 3 个随机祝福（2 次战斗后损毁）
      if (hasCurio(state, "aruan")) {
        const count = curioVal(state, "aruan", "count");
        for (let i = 0; i < count; i++) {
          const id = rollBlessing(1, 3);
          if (id) gainBlessing(state, id);
        }
        state.log.push(`阿阮袋：直接获得 ${count} 个随机祝福`);
      }
    }
    // 胜利后方程奖励（首领 2 个 2~3 星方程）
    if (reward?.equations && !state.pendingEventReward) {
      const eqStarRange = reward.equationStars || [1, 3];
      let gained = 0;
      for (let i = 0; i < reward.equations; i++) {
        const eqId = rollEquation(eqStarRange[0], eqStarRange[1]);
        if (eqId && gainEquation(state, eqId).ok) gained += 1;
      }
      if (gained > 0) state.log.push(`战斗胜利：获得 ${gained} 个方程（${eqStarRange[0]}~${eqStarRange[1]} 星）`);
    }
    // 事件战斗奖励（迷途商队护送/深渊裂缝/封印之门等）
    if (state.pendingEventReward) {
      const r = state.pendingEventReward;
      if (r.shards) {
        addShards(state, r.shards);
        state.log.push(`事件奖励：+${r.shards} 宇宙碎片`);
      }
      if (r.blessingPick) {
        const starRange = r.blessingStars || [1, 3];
        const picks = [];
        for (let i = 0; i < r.blessingPick; i++) {
          picks.push({
            candidates: rollBlessingCandidates(3, starRange[0], starRange[1]),
            starRange,
          });
        }
        state.pendingBlessingPicks = (state.pendingBlessingPicks || []).concat(picks);
      }
      if (r.skillUpTarget) {
        // 无可升级角色（全灭只剩菜月昴等）→ 放弃该奖励，避免 reward 面板卡死
        const upgradable = state.team.some((t) => t.alive && t.charId !== 11);
        if (!upgradable) {
          state.log.push("无可升级角色，放弃技能升级奖励");
        } else {
          state.pendingSkillUpTarget = (state.pendingSkillUpTarget || 0) + r.skillUpTarget;
          state.log.push(`事件战斗胜利：可指定角色技能等级 +${r.skillUpTarget}`);
        }
      }
      if (r.skillUpAll) {
        for (const t of state.team) {
          if (t.alive && t.charId !== 11) {
            t.skillLevel = Math.min(10, t.skillLevel + r.skillUpAll);
          }
        }
        state.log.push(`事件战斗胜利：全队技能等级 +${r.skillUpAll}`);
      }
      state.pendingEventReward = null;
    }
    // 一次性 buff 与临时等级在战斗结束后失效
    state.tempSkillBoost = 0;
    state.nextBattleBuffs = {};
    // 奇物胜利钩子：埋点土/阿阮袋/降维骰子
    triggerCurioOnWin(state);
    state.devLog.info(LOG_TYPE.UNI_FLOOR, `战斗胜利：${c.kind}`, {
      result,
      shards,
      round: c.round,
      wave: c.wave + 1,
      floor: state.floor,
    });
  } else {
    recordSound(state, "lose");
    state.log.push("队伍全灭，模拟宇宙终局");
    state.devLog.warn(LOG_TYPE.UNI_GAMEOVER, "战斗失败", {
      result,
      round: c.round,
      floor: state.floor,
    });
    // 菜月昴死亡回归：队伍含菜月昴且读档次数未满 → 回滚本层开始前
    if (tryCaiyueangRevive(state)) {
      state.log.push("死亡回归发动，回到本层开始前");
      return;
    }
    state.gameOver = true;
  }
}

/** 外部查询：当前行动角色 */
export function currentActive(state) {
  const c = state.combat;
  if (!c) return null;
  return c.activeIdx != null ? state.team[c.activeIdx] : null;
}
