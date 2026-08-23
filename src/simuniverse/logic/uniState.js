// 模拟宇宙状态机 — 位面/层推进 / 区域生成 / 货币 / 队伍 / 存档
// 纯逻辑层，零依赖（设计文档 docs/simuniverse-design.md v0.1）

import { CHARACTERS } from "../../game/constants.js";
import { createGameLogger, LOG_TYPE } from "../../game/gameLogger.js";
import {
  UNI_CONST,
  NORMAL_POOL,
  REGION_META,
  REGION_REWARD,
  getPlane,
  getLayerType,
  planeMult,
  BATTLE_WAVES,
  ELITE_BATTLE,
  TRANSFORM_WAVES,
  ODDITY_EFFECTS,
  ODDITY_SHARDS,
  ODDITY_STRENGTHEN_COUNT,
  UNI_SKILLS,
  CAIYUEANG_MAX_LOADS,
} from "./uniConstants.js";
import { createShopStock, resetWorkbench } from "./uniShop.js";
import { rollEvent } from "./uniEvents.js";
import {
  CURIO_FX,
  CURIOS,
  EQUATIONS,
  gainBlessing,
  rollBlessing,
  rollCurio,
  gainCurio,
  loseRandomBlessing,
  loseRandomCurio,
  gainEquation,
  rollEquation,
  breakCurio,
  loseCurio,
  curioVal,
} from "./uniBuffs.js";

/** 默认队伍（前 4 个角色，便于测试；正式开局由 UI 选角） */
export const DEFAULT_TEAM_IDS = [1, 2, 3, 4];

/** 从数组中随机取 1 个 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---- 队伍 ----

/** 创建 4 人队伍（HP 基准 = 经典模式角色数值，CHARACTERS[id].hp） */
export function createTeam(charIds) {
  return charIds.map((id, index) => {
    const data = CHARACTERS[id];
    const t = {
      index,
      charId: id,
      name: data.name,
      hp: data.hp,
      maxHp: data.hp,
      shield: 0,
      alive: true,
      skillLevel: 1, // 1-10（菜月昴不可升级，恒 1）
      skillCooldown: 0,
      status: {
        lockedBy: null, // 被精英 B 锁定
        stunned: false, // 停一回合（首领 B）
        puppet: null, // 傀儡控制（首领 C）
        healCut: 0, // 减疗%（首领 B）
        dot: 0, // 持续伤害
        dotTurns: 0,
        defensePile: [], // 防御牌堆
        // 技能被动/状态（M3）：由 uniSkills 初始化与同步
        atkBonus: 0, // 少女：普攻伤害 +N
        defBonus: 0, // 少女：防御额外护盾 +N
        spirit: 0, // 玛薇卡：斗志
        spiritCap: 0, // 斗志上限（0 = 无斗志）
        dmgBuffPct: 0, // 芙宁娜：增伤%（持续回合）
        dmgBuffTurns: 0,
        maxHpBuffPct: 0, // 风堇：生命上限临时提升%
        maxHpBuffTurns: 0,
        origMaxHp: data.hp, // 风堇 buff 还原基准
      },
      buffs: [], // 祝福效果引用（M5 填充）
    };
    return t;
  });
}

// ---- 创建 ----

/** 创建模拟宇宙状态 */
export function createUniState(charIds = DEFAULT_TEAM_IDS) {
  const state = {
    floor: 1,
    plane: 1,
    region: null, // 当前区域 { type, ... }
    pendingChoice: null, // 普通层 2 选 1：{ options: [typeA, typeB] }
    team: createTeam(charIds),
    shards: UNI_CONST.START_SHARDS,
    // 成长系统（M5 启用；M1 先占位保持结构）
    blessings: [], // { id, star, enhanced }
    curios: [],
    equations: [],
    heat: 0, // 造物调试台热量（首领层重置为 5）
    overwritePrice: UNI_CONST.OVERWRITE_BASE, // 覆写价格（每层重置，不跨层累计）
    savepoints: [], // 菜月昴读档快照（M3 启用）
    caiyueangLoads: 0, // 已用读档次数
    gameOver: false,
    victory: false,
    log: [],
    soundQueue: [],
    // 事件系统状态（M4）
    pendingBlessingPicks: null, // 祝福三选一待选队列 [{candidates, starRange}]
    pendingEventReward: null, // 事件战斗胜利后奖励 { shards, blessingPick, blessingStars, skillUpTarget }
    items: { medkit: 0 }, // 急救包（战斗开始自动回 10%）
    planeMaxHpBoost: 0, // 本位面生命上限加成%（生命结晶 A）
    nextBattleBuffs: {}, // 下次战斗 buff（战术手册/防护卷轴/附魔武器）
    tempSkillBoost: 0, // 下次战斗技能等级 +N（经验卷轴 C，战斗结束失效）
    jarBrain: 0, // 罐中脑充能（0-100，SMR杏仁核等充能）
    uniFirstUltUsed: false, // 阈下知觉：首次终结技标记
    // 被动技能指定队友（火神/少女 8-10 级）：{ mav: [idx...], shao: [idx...] }；null = 默认自动补足
    passiveAssign: { mav: null, shao: null },
  };
  state.devLog = createGameLogger(() => state);
  state.devLog.info(LOG_TYPE.UNI_INIT, "模拟宇宙开始", {
    team: state.team.map((t) => `${t.name}(Lv${t.skillLevel})`),
    floor: state.floor,
    plane: state.plane,
  });
  // 第 1 层固定战斗（新手引导）
  state.region = generateRegion(state, getLayerType(state.floor));
  syncPassives(state);
  recordSavepoint(state);
  return state;
}

// ---- 被动技能同步（少女/玛薇卡，等级变化时调用）----

/** 技能受益成员：拥有者必含；有指定列表时优先取指定（按序补足），否则按队伍 index 升序补足 */
function beneficiaryTeam(state, ownerIdx, count, assign) {
  const set = [ownerIdx];
  if (Array.isArray(assign)) {
    for (const i of assign) {
      if (set.length >= count) break;
      if (!set.includes(i)) set.push(i);
    }
  }
  for (let i = 0; i < state.team.length && set.length < count; i++) {
    if (!set.includes(i)) set.push(i);
  }
  return set;
}

/**
 * 指定被动技能受益队友（火神/少女 8-10 级）。
 * @param {string} who 'mav'（火神斗志）| 'shao'（少女攻防）
 * @param {number[]} memberIdxList 除拥有者外要享受加成队友的 index 数组
 */
export function setPassiveAssign(state, who, memberIdxList = []) {
  state.passiveAssign = state.passiveAssign || { mav: null, shao: null };
  const valid = memberIdxList.filter((i) => i >= 0 && i < state.team.length);
  state.passiveAssign[who] = valid.length ? valid : null;
  syncPassives(state);
  return { ok: true, assign: state.passiveAssign[who] };
}

/** 同步被动技能状态（玛薇卡斗志 / 少女攻防加成），等级变化后调用 */
export function syncPassives(state) {
  const team = state.team;
  // 玛薇卡（6）：斗志上限 + 受益人数
  const mav = team.find((t) => t.charId === 6);
  if (mav) {
    const sk = UNI_SKILLS[6];
    const lv = Math.min(mav.skillLevel, 10);
    const cap = sk.values[lv - 1];
    const benef = beneficiaryTeam(state, mav.index, sk.team[lv - 1], state.passiveAssign?.mav);
    team.forEach((t) => {
      if (benef.includes(t.index)) {
        t.status.spiritCap = cap;
      } else {
        t.status.spiritCap = 0;
        t.status.spirit = 0;
      }
    });
  }
  // 哥伦比娅（7）：攻击/防御加成 + 受益人数
  const shao = team.find((t) => t.charId === 7);
  if (shao) {
    const sk = UNI_SKILLS[7];
    const lv = Math.min(shao.skillLevel, 10);
    const val = sk.values[lv - 1];
    const benef = beneficiaryTeam(state, shao.index, sk.team[lv - 1], state.passiveAssign?.shao);
    team.forEach((t) => {
      const on = benef.includes(t.index);
      t.status.atkBonus = on ? val : 0;
      t.status.defBonus = on ? val : 0;
    });
  }
}

// ---- 菜月昴存档点（死亡回归）----

/** 记录本层存档点（层内容确定后调用） */
export function recordSavepoint(state) {
  state.savepoint = serializeUni(state);
}

/** 菜月昴死亡回归：全灭时回滚到本层开始前（最多 3 次） */
export function tryCaiyueangRevive(state) {
  if (!state.team.some((t) => t.charId === 11)) return false;
  if (state.caiyueangLoads >= CAIYUEANG_MAX_LOADS) return false;
  if (!state.savepoint) return false;
  const snapshot = JSON.parse(JSON.stringify(state.savepoint));
  Object.assign(state, snapshot);
  state.caiyueangLoads += 1;
  state.gameOver = false;
  state.victory = false;
  state.combat = null; // 回到本层开始前（未开战）
  state.soundQueue = [];
  state.devLog = createGameLogger(() => state);
  state.log.push(`菜月昴发动死亡回归（${state.caiyueangLoads}/${CAIYUEANG_MAX_LOADS}）`);
  state.devLog.info(LOG_TYPE.UNI_REVIVE, "菜月昴死亡回归", {
    loads: state.caiyueangLoads,
    floor: state.floor,
  });
  return true;
}

// ---- 区域生成 ----

/**
 * 生成区域内容。
 * 特殊层（boss/transform/rest/oddity/battle 首层）直接生成；
 * 普通层先走 rollNormalChoice → 玩家 2 选 1 → chooseNormalContent。
 */
export function generateRegion(state, type) {
  const meta = REGION_META[type];
  if (!meta) return null;
  let region = { type, name: meta.name, icon: meta.icon };
  if (type === "battle") region.waves = BATTLE_WAVES; // 普通战斗 3 波×3（M2 生成敌人）
  else if (type === "elite") region.waves = ELITE_BATTLE; // 精英 3 个
  else if (type === "transform") region.waves = TRANSFORM_WAVES; // 转化 3 波
  else if (type === "boss") region.waves = [{ kind: "boss", count: 1 }]; // 首领 1 个
  else if (type === "event" || type === "reward" || type === "adventure") {
    // 按类型池抽取具体事件；事件区域 2 个事件依次处理（第九框架①第一个②第二个）
    if (type === "event") {
      region.eventIds = [rollEvent("event"), rollEvent("event")];
      region.eventIdx = 0;
    } else {
      region.eventId = rollEvent(type);
    }
  }
  return region;
}

/** 普通层：从抽取池随机抽 2 个内容供玩家 2 选 1 */
export function rollNormalChoice(state) {
  const options = [pick(NORMAL_POOL), pick(NORMAL_POOL)];
  state.pendingChoice = { options };
  state.devLog.debug(LOG_TYPE.UNI_CHOOSE, "普通层抽取 2 个内容", {
    floor: state.floor,
    options,
    labels: options.map((o) => `${REGION_META[o].icon}${REGION_META[o].name}`),
  });
  return options;
}

/** 普通层 2 选 1：idx 0/1，选中的成为本层内容，剩余舍弃 */
export function chooseNormalContent(state, idx) {
  const pc = state.pendingChoice;
  if (!pc || ![0, 1].includes(idx)) return { ok: false, reason: "无候选内容" };
  const type = pc.options[idx];
  state.combat = null; // 进入本层内容：清空上一场战斗残留
  state.region = generateRegion(state, type);
  state.pendingChoice = null;
  state.devLog.info(LOG_TYPE.UNI_CHOOSE, `本层内容：${REGION_META[type].name}`, {
    floor: state.floor,
    chosen: type,
    dropped: pc.options[1 - idx],
  });
  enterRegion(state);
  return { ok: true, type };
}

/**
 * 进入区域时立即生效的效果：
 * 财富 +300 碎片；休整全队回满；首领重置热量与覆写价格；商店生成商品。
 * 奇物区域钩子：永动咕咕钟（-4% 碎片）、监督之眼（-50）、和平的代价（商店 +150）。
 */
export function enterRegion(state) {
  const r = state.region;
  if (!r) return;
  // 约定：覆写价格递增每层重置，不跨层累计
  state.overwritePrice = UNI_CONST.OVERWRITE_BASE;
  // 奇物：永动咕咕钟（每进入下一区域 -4%）
  if (hasCurio(state, "yongdong")) {
    const loss = Math.ceil(state.shards * ((CURIO_FX.yongdong?.shardsPct || 4) / 100));
    state.shards = Math.max(0, state.shards - loss);
    state.log.push(`永动咕咕钟：失去 ${loss} 宇宙碎片`);
  }
  // 奇物：监督之眼（进入区域 -50）
  if (hasCurio(state, "eye")) {
    state.shards = Math.max(0, state.shards - (CURIO_FX.eye?.cost || 50));
    state.log.push("监督之眼：失去碎片");
  }
  // 奇物：有形幸运（碎片 <250 补足 250）
  if (hasCurio(state, "luck") && state.shards < 250) {
    addShards(state, (CURIO_FX.luck?.floor || 250) - state.shards);
    state.log.push("有形幸运：宇宙碎片补足");
  }
  if (r.type === "fortune") {
    addShards(state, REGION_REWARD.fortune.shards);
    // 奇物：和平的代价只对商店生效，这里不触发
  } else if (r.type === "rest") {
    for (const t of state.team) {
      if (t.alive) t.hp = t.maxHp;
    }
    state.devLog.info(LOG_TYPE.UNI_REGION, "休整：全队回满", {
      floor: state.floor,
      hp: state.team.filter((t) => t.alive).map((t) => t.hp),
    });
  } else if (r.type === "boss") {
    resetWorkbench(state); // 热量 = 5，覆写价格重置
    state.devLog.info(LOG_TYPE.UNI_REGION, "进入首领层：造物调试台重置", {
      floor: state.floor,
      heat: state.heat,
    });
  } else if (r.type === "shop") {
    createShopStock(state);
    // 奇物：和平的代价（进入商店 +150）
    if (hasCurio(state, "heping")) {
      addShards(state, CURIO_FX.heping?.gain || 150);
      state.log.push("和平的代价：+碎片");
    }
  } else if (r.type === "oddity") {
    // 奇遇：随机一个效果（工作台/800碎片/强化 8 个随机祝福）
    const effect = pick(ODDITY_EFFECTS);
    r.oddityEffect = effect;
    if (effect === "shards") {
      addShards(state, ODDITY_SHARDS);
    } else if (effect === "workbench") {
      state.heat = UNI_CONST.BOSS_HEAT; // 可进行一次造物调试台
    } else if (effect === "strengthen") {
      // 强化 8 个随机祝福（效果 ×2）
      const boosted = strengthenRandomBlessings(state, ODDITY_STRENGTHEN_COUNT);
      r.boostedCount = boosted;
    }
    state.devLog.info(LOG_TYPE.UNI_REGION, "奇遇", {
      floor: state.floor,
      effect,
      shards: state.shards,
      boosted: r.boostedCount || 0,
    });
  }
  // 奇物区域钩子（各类奇物进入区域时触发）
  applyCurioRegionHooks(state, r);
}

/** 奇物进入区域钩子 */
function applyCurioRegionHooks(state, r) {
  const battleLike = ["battle", "elite", "boss", "transform"].includes(r.type);
  const softLike = ["event", "reward", "adventure", "fortune"].includes(r.type);
  // 祭献投枪：战斗类 +35 / 软性类 -35（连续进入额外 +35）
  if (hasCurio(state, "jixian")) {
    if (battleLike) {
      addShards(state, curioVal(state, "jixian", "battleGain") + (state.lastRegionType === r.type ? curioVal(state, "jixian", "chainGain") : 0));
    } else if (softLike) {
      addShards(state, -curioVal(state, "jixian", "softLoss"));
    }
  }
  // 鲁珀特帝国机械齿轮：+50，超过 750 损毁并 -750
  if (hasCurio(state, "lubeite")) {
    addShards(state, curioVal(state, "lubeite", "gain"));
    if (state.shards > (CURIO_FX.lubeite?.cap || 750)) {
      breakCurio(state, "lubeite");
      addShards(state, -(CURIO_FX.lubeite?.penalty || 750));
      state.log.push("鲁珀特帝国机械齿轮损毁");
    }
  }
  // 分裂金币：+5% 碎片
  if (hasCurio(state, "fenlie_jb")) {
    addShards(state, Math.ceil(state.shards * (curioVal(state, "fenlie_jb", "shardsPct") / 100)));
  }
  // 终端卫士：事件区域 +75 碎片（触发 3 次后损毁）
  if (hasCurio(state, "zhongduan") && r.type === "event") {
    const z = state.curios.find((c) => c.id === "zhongduan");
    z.count = (z.count || 0) + 1;
    addShards(state, curioVal(state, "zhongduan", "gain"));
    state.log.push(`终端卫士：+${curioVal(state, "zhongduan", "gain")} 碎片`);
    if (z.count >= (CURIO_FX.zhongduan?.triggers || 3)) {
      breakCurio(state, "zhongduan");
      state.log.push("终端卫士：已损毁");
    }
  }
  // 大饼干：进入新位面时获得 1 个 1-2 星祝福（触发 2 次后损毁）
  if (hasCurio(state, "dabinggan") && state.plane > (state.dabingganPlane || 1)) {
    state.dabingganPlane = state.plane;
    const d = state.curios.find((c) => c.id === "dabinggan");
    d.count = (d.count || 0) + 1;
    const count = curioVal(state, "dabinggan", "count");
    for (let i = 0; i < count; i++) {
      const id = rollBlessing(...(CURIO_FX.dabinggan?.starRange || [1, 2]));
      if (id) gainBlessing(state, id, { silent: true });
    }
    state.log.push(`大饼干：进入新位面，获得 ${count} 个 1-2 星祝福`);
    if (d.count >= (CURIO_FX.dabinggan?.triggers || 2)) breakCurio(state, "dabinggan");
  }
  // 昨天的重量：+35，碎片减少次数累计 3 次损毁（减少次数由 addShards 负增量统计）
  if (hasCurio(state, "zuotian")) {
    addShards(state, curioVal(state, "zuotian", "gain"));
  }
  // 睡眠和死亡：碎片 ≤10 损毁 +400
  if (hasCurio(state, "shui") && state.shards <= (CURIO_FX.shui?.shardsMax || 10)) {
    breakCurio(state, "shui");
    addShards(state, curioVal(state, "shui", "gain"));
    state.log.push("睡眠和死亡：损毁并 +400 碎片");
  }
  // 无爱之尘：奇物 ≥4 失去自身与其他 3 个随机奇物 + 1 方程
  if (hasCurio(state, "wulian") && state.curios.length >= (CURIO_FX.wulian?.minCurios || 4)) {
    loseCurio(state, "wulian");
    for (let i = 0; i < (CURIO_FX.wulian?.loseCount || 3) && state.curios.length > 0; i++) loseRandomCurio(state);
    const eq = rollEquation(1, 3);
    if (eq) gainEquation(state, eq);
  }
  // 临时赌资：累计 5 区域损毁 -450
  if (hasCurio(state, "linji")) {
    state.linjiRegions = (state.linjiRegions || 0) + 1;
    if (state.linjiRegions >= (CURIO_FX.linji?.regions || 5)) {
      breakCurio(state, "linji");
      addShards(state, -(CURIO_FX.linji?.penalty || 450));
      state.log.push("临时赌资：损毁并 -450 碎片");
    }
  }
  // 海绵王：全队 -80% 当前生命，生命上限 +10%（4 次损毁）
  if (hasCurio(state, "haimian")) {
    for (const t of state.team) {
      if (!t.alive) continue;
      t.hp = Math.max(1, Math.ceil(t.hp * (1 - (CURIO_FX.haimian?.hpCut || 0.8))));
      t.maxHp = Math.ceil(t.maxHp * (1 + curioVal(state, "haimian", "maxHpMult") / 100));
    }
    state.haimianCount = (state.haimianCount || 0) + 1;
    if (state.haimianCount >= (CURIO_FX.haimian?.triggers || 4)) breakCurio(state, "haimian");
  }
  // 菠萝：累计 3 区域损毁 -99% 生命
  if (hasCurio(state, "bobo")) {
    state.boboCount = (state.boboCount || 0) + 1;
    if (state.boboCount >= 3) {
      breakCurio(state, "bobo");
      for (const t of state.team) t.hp = Math.max(1, Math.ceil(t.hp * 0.01));
      state.log.push("菠萝：损毁，全队损失 99% 生命");
    }
  }
  // 量子大乐透：进入区域 10% 概率获得负面奇物，10% 概率损毁（损毁时 +400）
  if (hasCurio(state, "liangzi")) {
    const roll = Math.random();
    if (roll < 0.1) {
      const negPool = Object.values(CURIOS).filter((c) => c.negative);
      if (negPool.length) gainCurio(state, negPool[Math.floor(Math.random() * negPool.length)].id, { silent: true });
    } else if (roll < 0.2) {
      breakCurio(state, "liangzi");
      addShards(state, curioVal(state, "liangzi", "gain"));
      state.log.push("量子大乐透：损毁并 +400 碎片");
    }
  }
  // 银河大乐透：进入区域 10% 概率获得奇物，10% 概率损毁并全队 -99% 当前生命
  if (hasCurio(state, "yinhe")) {
    const roll = Math.random();
    if (roll < 0.1) {
      const id = rollCurio(false, 1, 3);
      if (id) gainCurio(state, id, { silent: true });
    } else if (roll < 0.2) {
      breakCurio(state, "yinhe");
      const hpPct = curioVal(state, "yinhe", "hpPct");
      for (const t of state.team) t.hp = Math.max(1, Math.ceil(t.hp * (1 - hpPct / 100)));
      state.log.push(`银河大乐透：损毁，全队损失 ${hpPct}% 当前生命`);
    }
  }
  // 采矿吸尘器（大型）：进入冒险/财富区域获得 1-2 星祝福（触发 5 次后损毁）
  if (hasCurio(state, "caikuang") && (r.type === "adventure" || r.type === "fortune")) {
    const c = state.curios.find((x) => x.id === "caikuang");
    c.count = (c.count || 0) + 1;
    const count = curioVal(state, "caikuang", "count");
    for (let i = 0; i < count; i++) {
      const id = rollBlessing(...(CURIO_FX.caikuang?.starRange || [1, 2]));
      if (id) gainBlessing(state, id, { silent: true });
    }
    state.log.push(`采矿吸尘器：+${count} 个 1-2 星祝福`);
    if (c.count >= (CURIO_FX.caikuang?.triggers || 5)) breakCurio(state, "caikuang");
  }
  // 失金爪锚：5 区域后损毁；碎片 <500 时失去 5 个随机祝福后损毁
  if (hasCurio(state, "shijin")) {
    const sj = state.curios.find((x) => x.id === "shijin");
    if (state.shards < (CURIO_FX.shijin?.minShards || 500)) {
      for (let i = 0; i < 5 && state.blessings.length; i++) loseRandomBlessing(state);
      breakCurio(state, "shijin");
      state.log.push("失金爪锚：碎片不足 500，失去 5 个祝福并损毁");
    } else {
      sj.regions = (sj.regions || 0) + 1;
      if (sj.regions >= (CURIO_FX.shijin?.regions || 5)) breakCurio(state, "shijin");
    }
  }
  // 有形幸运：碎片 <250 补足 250
  if (hasCurio(state, "luck") && state.shards < curioVal(state, "luck", "floor")) {
    addShards(state, curioVal(state, "luck", "floor") - state.shards);
    state.log.push("有形幸运：宇宙碎片补足");
  }
  // 水上书：回满 + 复活死亡角色（满血复活）
  if (hasCurio(state, "shuishang")) {
    for (const t of state.team) {
      t.hp = t.maxHp;
      if (!t.alive) {
        t.alive = true;
        t.hp = t.maxHp;
      }
      t.status.stunned = false;
      t.status.puppet = null;
    }
    state.log.push("水上书：全队回满并复活（满血）");
  }
  // 和平的代价：进入商店 +150
  if (hasCurio(state, "heping") && r.type === "shop") {
    addShards(state, curioVal(state, "heping", "gain"));
    state.log.push("和平的代价：+碎片");
  }
  // 纯美之袍：战斗类区域 +10% 碎片
  if (hasCurio(state, "chunmei_pao") && battleLike) {
    addShards(state, Math.ceil(state.shards * ((CURIO_FX.chunmei_pao?.shardsPct || 10) / 100)));
  }
  // 快乐电视机：连续同区域 -25 碎片 -1 奇物
  if (hasCurio(state, "kuaile") && state.lastRegionType === r.type) {
    addShards(state, -(CURIO_FX.kuaile?.cost || 25));
    loseRandomCurio(state);
  }
  // 记忆轮：每次进入任意区域时，将所有方程替换为随机相同星级方程
  if (hasCurio(state, "jiyi")) {
    state.equations = state.equations.map((e) => {
      const pool = Object.values(EQUATIONS).filter((x) => x.star === e.star && x.id !== e.id);
      if (!pool.length) return e;
      const next = pool[Math.floor(Math.random() * pool.length)];
      return { id: next.id, star: next.star, enhanced: e.enhanced || 1 };
    });
    state.log.push("记忆轮：方程置换为随机同星级方程");
  }
  // 瘟疫巢都：随机失去 2 个负面奇物，获得 2 个随机祝福；每失去 1 个负面奇物，战斗伤害 +10%
  if (hasCurio(state, "wenyi")) {
    const negs = state.curios.filter((c) => c.negative && !c.broken);
    const lostCount = Math.min(2, negs.length);
    for (let i = 0; i < lostCount; i++) {
      loseCurio(state, negs[i].id, true);
    }
    state.wenyiLost = (state.wenyiLost || 0) + lostCount;
    for (let i = 0; i < 2; i++) {
      const id = rollBlessing(1, 3);
      if (id) gainBlessing(state, id, { silent: true });
    }
    if (lostCount > 0) state.log.push(`瘟疫巢都：失去 ${lostCount} 个负面奇物，获得 2 个祝福`);
  }
  // 记录上次区域类型（连续区域判定）
  state.lastRegionType = r.type;
}

/** 随机强化 N 个祝福（heatEnhanced ×2），返回实际强化数 */
function strengthenRandomBlessings(state, n) {
  const idxs = state.blessings.map((_, i) => i);
  // 洗牌取前 n 个
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  const chosen = idxs.slice(0, Math.min(n, idxs.length));
  for (const i of chosen) {
    state.blessings[i].heatEnhanced = (state.blessings[i].heatEnhanced || 1) * 2;
  }
  state.log.push(`奇遇：强化了 ${chosen.length} 个随机祝福（效果 ×2）`);
  return chosen.length;
}

// ---- 层推进 ----

/** 当前层是否为普通层（需 2 选 1） */
export function isNormalFloor(state) {
  return getLayerType(state.floor) === "normal";
}

/**
 * 推进到下一层：生成新区域。
 * 返回 { type } 供 UI 判断（normal 表示需先 2 选 1）。
 */
export function advanceFloor(state) {
  if (state.gameOver) return null;
  state.combat = null; // 进入新层：清空上一场战斗残留（防止 enterCurrentMode 误判为战斗中/直接胜利）
  state.floor += 1;
  state.plane = getPlane(state.floor);
  state.region = null;
  state.pendingChoice = null;
  const type = getLayerType(state.floor);
  if (type === "normal") {
    rollNormalChoice(state);
  } else {
    state.region = generateRegion(state, type);
    enterRegion(state);
  }
  recordSavepoint(state);
  state.devLog.info(LOG_TYPE.UNI_FLOOR, `进入第 ${state.floor} 层（位面 ${state.plane}）`, {
    floor: state.floor,
    plane: state.plane,
    type,
    mult: planeMult(state.plane),
  });
  return { type, region: state.region };
}

// ---- 货币 ----

/** 持有指定奇物（已损毁的不算持有） */
export function hasCurio(state, id) {
  return state.curios?.some((c) => c.id === id && !c.broken);
}

/** 获得碎片（受奇物修正：铸铁齿轮指环 +30% / 机动指环 -50% / 天才八卦 +50%） */
export function addShards(state, n) {
  if (n > 0) {
    if (hasCurio(state, "zhutie")) n = Math.ceil(n * curioVal(state, "zhutie", "shardsMult"));
    if (hasCurio(state, "jidong")) n = Math.ceil(n * (1 - (CURIO_FX.jidong?.shardsCut || 0.5)));
    if (hasCurio(state, "tiancai")) n = Math.ceil(n * curioVal(state, "tiancai", "shardsMult"));
  }
  state.shards = Math.max(0, state.shards + n);
  // 昨天的重量：碎片减少次数累计 3 次损毁（所有减少碎片的行为都计数）
  if (n < 0 && hasCurio(state, "zuotian")) {
    state.shardsShrinkCount = (state.shardsShrinkCount || 0) + 1;
    if (state.shardsShrinkCount >= (CURIO_FX.zuotian?.triggers || 3)) {
      breakCurio(state, "zuotian");
      state.log.push("昨天的重量：碎片减少 3 次，已损毁");
    }
  }
  if (n !== 0) {
    state.devLog.debug(LOG_TYPE.UNI_SHARDS, "宇宙碎片变化", {
      delta: n,
      shards: state.shards,
      floor: state.floor,
    });
  }
  return state.shards;
}

export function spendShards(state, n) {
  if (state.shards < n) return false;
  state.shards -= n;
  // 昨天的重量：碎片减少次数累计（商店/覆写/事件花费都算）
  if (hasCurio(state, "zuotian")) {
    state.shardsShrinkCount = (state.shardsShrinkCount || 0) + 1;
    if (state.shardsShrinkCount >= (CURIO_FX.zuotian?.triggers || 3)) {
      breakCurio(state, "zuotian");
      state.log.push("昨天的重量：碎片减少 3 次，已损毁");
    }
  }
  state.devLog.debug(LOG_TYPE.UNI_SHARDS, "宇宙碎片消耗", {
    delta: -n,
    shards: state.shards,
  });
  return true;
}

// ---- 复活（休整，§6.5）----

/** 休整复活：花费 150 碎片复活 1 名死亡角色 */
export function reviveAtRest(state, charIndex) {
  const t = state.team[charIndex];
  if (!t || t.alive) return { ok: false, reason: "目标未死亡" };
  if (!spendShards(state, UNI_CONST.RESURRECT_COST)) {
    return { ok: false, reason: "宇宙碎片不足" };
  }
  t.alive = true;
  t.hp = Math.max(1, Math.ceil(t.maxHp * 0.5)); // 复活后 50% 生命（最低 1）
  t.status.defensePile = [];
  t.status.stunned = false;
  t.status.puppet = null;
  t.status.lockedBy = null;
  state.devLog.info(LOG_TYPE.UNI_REVIVE, `${t.name} 复活`, {
    charIndex,
    cost: UNI_CONST.RESURRECT_COST,
    hp: t.hp,
    shards: state.shards,
  });
  return { ok: true, cost: UNI_CONST.RESURRECT_COST, hp: t.hp };
}

// ---- 存档 ----

export function serializeUni(state) {
  return JSON.parse(JSON.stringify(state));
}

export function deserializeUni(state, data) {
  if (!data) return false;
  Object.assign(state, JSON.parse(JSON.stringify(data)));
  state.devLog = createGameLogger(() => state);
  return true;
}

// 供外部使用的常量/工具 re-export
export { CHARACTERS };
export { getPlane, getLayerType };
