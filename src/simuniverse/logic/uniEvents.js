// 模拟宇宙事件系统 — 分支事件 / 奖励 / 冒险
// 纯逻辑层，零依赖（设计文档 docs/simuniverse-design.md §7 + 需求文档第七框架）

import { LOG_TYPE } from "../../game/gameLogger.js";
import { addShards, spendShards, syncPassives } from "./uniState.js";
import {
  rollBlessing,
  rollBlessingCandidates,
  gainBlessing,
  loseRandomBlessing,
  rollCurio,
  gainCurio,
  loseRandomCurio,
  rollEquation,
  gainEquation,
  BLESSINGS,
} from "./uniBuffs.js";
import { UNI_SKILLS } from "./uniConstants.js";

/** 防御牌 ↔ 护盾简化换算：1 张防御牌 = 2 点护盾（全队） */
const DEF_CARD_SHIELD = 2;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 治疗全队（百分比，受祝福回复加成与减疗影响——简化：事件治疗不吃减疗） */
function healTeamPct(state, pct, floorMode = false) {
  let healed = 0;
  for (const t of state.team) {
    if (!t.alive) continue;
    const amount = floorMode
      ? Math.ceil((t.maxHp * pct) / 100)
      : Math.floor((t.maxHp * pct) / 100);
    t.hp = Math.min(t.maxHp, t.hp + amount);
    healed += amount;
  }
  return healed;
}

/** 全队损失生命上限百分比的血量（最低减为 1） */
function loseTeamHpPct(state, pct) {
  for (const t of state.team) {
    if (!t.alive) continue;
    const loss = Math.floor((t.maxHp * pct) / 100);
    t.hp = Math.max(1, t.hp - loss);
  }
}

/** 全队获得/失去防御牌（±N 张，加入/移出 defensePile，与战斗内防御牌机制一致） */
function teamDefenseCards(state, n) {
  if (n >= 0) {
    for (const t of state.team) {
      if (!t.alive) continue;
      for (let i = 0; i < n; i++) {
        t.status.defensePile.push({ value: DEF_CARD_SHIELD, rank: "?", suit: "♠" });
      }
    }
    return n;
  }
  // 失去 |n| 张防御牌（从防御堆末尾移除）
  for (const t of state.team) {
    if (!t.alive) continue;
    for (let i = 0; i < -n && t.status.defensePile.length > 0; i++) {
      t.status.defensePile.pop();
    }
  }
  return n;
}

/** 提升角色技能等级（n 级，上限 10），同步被动 */
export function applySkillUp(state, charIndex, n) {
  const t = state.team[charIndex];
  if (!t) return { ok: false, reason: "无此角色" };
  if (t.charId === 11) return { ok: false, reason: "菜月昴不可升级" };
  const before = t.skillLevel;
  t.skillLevel = Math.min(10, t.skillLevel + n);
  syncPassives(state);
  state.log.push(`${t.name} 技能等级 +${t.skillLevel - before}（Lv${t.skillLevel}）`);
  return { ok: true, leveled: t.skillLevel - before };
}

/** 随机一名可升级角色技能 +1 */
function randomSkillUp(state, n = 1) {
  const upgradable = state.team.filter((t) => t.alive && t.charId !== 11);
  if (!upgradable.length) return null;
  const t = pick(upgradable);
  return applySkillUp(state, t.index, n);
}

// ================= 事件定义（需求文档第七框架） =================
// 选项效果字段：
//   shards: ±宇宙碎片；healPct: 全队回复%；loseHpPct: 全队损失生命上限%
//   blessingCount: 随机祝福数；blessingPick: 三选一次数（starRange）
//   curioCount: 随机奇物数（excludeNegative）；equationStar: 获得该星级方程
//   defenseCards: ±防御牌张数；skillUpRandom: 随机角色升级；skillUpTarget: 需选角色（返回 needSkillTarget）
//   loseBlessing: 失去随机祝福数；loseCurio: 失去随机奇物数
//   battle: 事件战斗 { kind, count, reward: { blessingPick, blessingStars, shards } }
//   buff: 下次战斗 buff（M5 接入）；medkit: 急救包；planeMaxHp: 本位面生命上限%
//   requireShards: 需要花费碎片（不足选项不可选/自动失败）

export const UNI_EVENTS = {
  caravan: {
    id: "caravan",
    title: "迷途商队",
    desc: "你遇到一支迷路的商队，商人们神色疲惫，货物散落一地。",
    options: [
      { text: "指引方向", effects: { blessingPick: 1, blessingStars: [1, 3] } },
      {
        text: "护送他们",
        effects: {
          battle: { kind: "normal", count: 3, reward: { blessingPick: 2, blessingStars: [1, 3] } },
        },
      },
      { text: "搜刮货物", effects: { shards: 100, defenseCards: -1 } },
    ],
  },
  plague: {
    id: "plague",
    title: "瘟疫村庄",
    desc: "一个村庄正遭受瘟疫侵袭，村口燃着苍白的火焰。",
    options: [
      { text: "提供医疗援助", effects: { healPct: 15, blessingPick: 1, blessingStars: [1, 3] } },
      { text: "封锁村庄", effects: { shards: 150 } },
    ],
  },
  watchtower: {
    id: "watchtower",
    title: "废弃哨塔",
    desc: "一座废弃的哨塔矗立在路边，顶层似乎有东西在发光。",
    options: [
      { text: "攀登哨塔", effects: { skillUpRandom: 1 } },
      { text: "搜索底层", effects: { shards: 100 } },
      { text: "绕行", effects: {} },
    ],
  },
  abyss: {
    id: "abyss",
    title: "深渊裂缝",
    desc: "一道裂缝正在吞噬周围的地面，裂缝深处传来低沉的轰鸣。",
    options: [
      {
        text: "调查裂缝",
        effects: {
          battle: { kind: "elite", count: 2, reward: { skillUpTarget: 2 } },
        },
      },
      { text: "封住裂缝", effects: { shards: 150, defenseCards: -3 } },
      { text: "无视", effects: {} },
    ],
  },
  tablet: {
    id: "tablet",
    title: "古老石碑",
    desc: "石碑上刻着看不懂的符文，在月光下泛着微光。",
    options: [
      { text: "解读符文", effects: { blessingCount: 2 } },
      { text: "触摸石碑", effects: { blessingCount: 1 } },
      { text: "标记位置", effects: {} },
    ],
  },
  ghostship: {
    id: "ghostship",
    title: "幽灵船",
    desc: "一艘废弃的战舰搁浅在岸边，船身散发着诡异的光芒。",
    options: [
      { text: "搜索船舱", effects: { blessingCount: 1, defenseCards: -1 } },
      { text: "烧毁船只", effects: { shards: 150, defenseCards: -1 } },
      { text: "快速离开", effects: {} },
    ],
  },
  spring: {
    id: "spring",
    title: "幻象之泉",
    desc: "泉水倒映出你内心最渴望的东西。",
    options: [
      { text: "饮用泉水", effects: { blessingCount: 10 } },
      { text: "观察倒影", effects: { curioCount: 5, excludeNegative: true } },
      { text: "破坏泉水", effects: { shards: 800 } },
    ],
  },
  gate: {
    id: "gate",
    title: "封印之门",
    desc: "一扇刻满符文的门挡住了去路。",
    options: [
      {
        text: "暴力破门",
        effects: {
          battle: { kind: "elite", count: 2, reward: { shards: 250, blessingPick: 1, blessingStars: [3, 3] } },
        },
      },
      { text: "解读符文", effects: { requireShards: 150, blessingCount: 3, blessingStars: [1, 2] } },
      { text: "绕路", effects: {} },
    ],
  },
  altar: {
    id: "altar",
    title: "古代祭坛",
    desc: "祭坛上有一件正在发光的物品。",
    options: [
      {
        text: "取走物品",
        effects: { equationStar: 3, curioCount: 2, loseHpPct: 60 },
      },
      { text: "献祭物品", effects: { loseBlessing: 2, shards: 300 } },
      { text: "祈祷", effects: { loseCurio: 1, healPct: 50 } },
    ],
  },
};

// ================= 奖励事件（需求文档第七框架） =================

export const UNI_REWARDS = {
  medkit: {
    id: "medkit",
    title: "医疗补给",
    desc: "你发现了一箱完好的医疗物资。",
    options: [
      { text: "快速恢复", effects: { healPct: 20 } },
      { text: "储备药品", effects: { medkit: 2 } },
      { text: "消毒物资", effects: { healPct: 100, loseHpAfter3: 50 } },
    ],
  },
  potion: {
    id: "potion",
    title: "强化药剂",
    desc: "桌上摆着三瓶不同颜色的药剂。",
    options: [
      { text: "红色药剂", effects: { blessingCount: 2 } },
      { text: "蓝色药剂", effects: { curioCount: 2, excludeNegative: true } },
      { text: "绿色药剂", effects: { healPct: 40, ceil: true } },
    ],
  },
  manual: {
    id: "manual",
    title: "战术手册",
    desc: "一本残留着战斗笔记的手册。",
    options: [
      { text: "进攻战术", effects: { buff: "atkUp" } },
      { text: "防守战术", effects: { buff: "defUp" } },
      { text: "速攻战术", effects: { buff: "enemyStun" } },
    ],
  },
  scroll: {
    id: "scroll",
    title: "防护卷轴",
    desc: "卷轴上的符文隐隐发光。",
    options: [
      { text: "护盾符文", effects: { defenseCards: 5 } },
      { text: "反伤符文", effects: { buff: "reflect" } },
      { text: "免疫符文", effects: { buff: "immuneFirst" } },
    ],
  },
  expScroll: {
    id: "expScroll",
    title: "经验卷轴",
    desc: "卷轴记载着战斗的感悟。",
    options: [
      { text: "专注研读", effects: { skillUpTarget: 2 } },
      { text: "分享经验", effects: { skillUpAll: 1 } },
      { text: "实战转化", effects: { tempSkillBoost: 3 } },
    ],
  },
  weapon: {
    id: "weapon",
    title: "附魔武器",
    desc: "刀刃上流淌着微弱的光芒。",
    options: [
      { text: "火焰附魔", effects: { buff: "dmgUp50" } },
      { text: "精炼材料", effects: { shards: 250 } },
    ],
  },
  crystal: {
    id: "crystal",
    title: "生命结晶",
    desc: "晶石在手心散发着温度。",
    options: [
      { text: "吸收能量", effects: { planeMaxHp: 20 } },
      { text: "转化力量", effects: { healPct: 30, blessingCount: 2 } },
      { text: "交换物品", effects: { shards: 200 } },
    ],
  },
  box: {
    id: "box",
    title: "神秘箱子",
    desc: "一个锁着的箱子，上面刻着一行字：「选择你的代价」。",
    options: [
      { text: "打开箱子", effects: { blessingCount: 2, blessingStars: [3, 3] } },
      { text: "砸开箱子", effects: { shards: 500, loseAllDefense: true } },
      { text: "放弃箱子", effects: { shards: 200 } },
    ],
  },
};

// ================= 冒险事件（需求文档第七框架） =================

export const UNI_ADVENTURES = {
  dice: {
    id: "dice",
    title: "骰子游戏",
    desc: "商人拿出骰子，邀请你玩一局。",
    options: [
      { text: "保守：投入 60 碎片", effects: { gamble: { cost: 60, mult: 20 } } },
      { text: "正常：投入 90 碎片", effects: { gamble: { cost: 90, mult: 30 } } },
      { text: "豪赌：投入 150 碎片", effects: { gamble: { cost: 150, mult: 50 } } },
    ],
  },
  cards: {
    id: "cards",
    title: "翻牌",
    desc: "三张牌扣在桌子上，抽一张。",
    options: [
      { text: "抽一张", effects: { fortuneCard: true } },
    ],
  },
  lottery: {
    id: "lottery",
    title: "抽签",
    desc: "10 支签放在一个竹筒里（1 大吉 / 2 中吉 / 4 小吉 / 3 凶）。",
    options: [
      { text: "抽一支（25 碎片）", effects: { lottery: { cost: 25, count: 1 } } },
      { text: "抽三支取最好（100 碎片）", effects: { lottery: { cost: 100, count: 3 } } },
      { text: "放弃", effects: {} },
    ],
  },
};

/** 事件池（普通层事件类型抽取用） */
export const EVENT_POOL = { ...UNI_EVENTS, ...UNI_REWARDS, ...UNI_ADVENTURES };

/** 按事件 id 取事件定义 */
export function getEventDef(eventId) {
  return EVENT_POOL[eventId] || null;
}

/** 按区域类型随机抽 1 个具体事件（type: event/reward/adventure） */
export function rollEvent(type) {
  const pool =
    type === "reward" ? UNI_REWARDS : type === "adventure" ? UNI_ADVENTURES : UNI_EVENTS;
  const ids = Object.keys(pool);
  return pick(ids);
}

// ================= 选项应用 =================

/**
 * 应用事件选项。
 * @returns {object} { ok, outcome: { text, effects }, needSkillTarget, battle, pendingReward, gamble, lottery, eventId }
 */
export function applyEventOption(state, eventId, optionIdx) {
  const ev = getEventDef(eventId);
  if (!ev || !ev.options[optionIdx]) return { ok: false, reason: "无此选项" };
  const opt = ev.options[optionIdx];
  const fx = opt.effects || {};
  const outcome = { text: opt.text, fx };

  // 花费检查（不足时视为选择失败，无惩罚）
  if (fx.requireShards && !spendShards(state, fx.requireShards)) {
    outcome.failed = "碎片不足";
    return { ok: true, outcome, eventId, eventTitle: ev.title };
  }

  // 货币
  if (fx.shards) addShards(state, fx.shards);

  // 血量
  if (fx.healPct) healTeamPct(state, fx.healPct, fx.ceil);
  if (fx.loseHpPct) loseTeamHpPct(state, fx.loseHpPct);
  if (fx.loseHpAfter3) {
    // 医疗补给 C：回满，3 层之后损失 50%（当前层 ≤ 2 不扣）
    if (state.floor <= 2) {
      healTeamPct(state, 100);
    } else {
      healTeamPct(state, 100);
      loseTeamHpPct(state, fx.loseHpAfter3);
    }
  }

  // 防御牌（±）
  if (fx.defenseCards) teamDefenseCards(state, fx.defenseCards);
  if (fx.loseAllDefense) {
    for (const t of state.team) t.status.defensePile = [];
  }

  // 祝福
  if (fx.blessingCount) {
    const starRange = fx.blessingStars || [1, 3];
    for (let i = 0; i < fx.blessingCount; i++) {
      const id = rollBlessing(starRange[0], starRange[1]);
      if (id) gainBlessing(state, id, { silent: true });
    }
  }
  // 祝福三选一：入待选队列（UI 逐次展示）
  if (fx.blessingPick) {
    const starRange = fx.blessingStars || [1, 3];
    const picks = [];
    for (let i = 0; i < fx.blessingPick; i++) {
      picks.push({
        candidates: rollBlessingCandidates(3, starRange[0], starRange[1]),
        starRange,
      });
    }
    state.pendingBlessingPicks = (state.pendingBlessingPicks || []).concat(picks);
    outcome.pendingPicks = picks.length;
  }

  // 奇物
  if (fx.curioCount) {
    for (let i = 0; i < fx.curioCount; i++) {
      const id = rollCurio(fx.excludeNegative);
      if (id) gainCurio(state, id, { silent: true });
    }
  }

  // 方程
  if (fx.equationStar) {
    const id = rollEquation(fx.equationStar, fx.equationStar);
    if (id) gainEquation(state, id);
  }

  // 失去祝福/奇物
  if (fx.loseBlessing) {
    for (let i = 0; i < fx.loseBlessing; i++) loseRandomBlessing(state);
  }
  if (fx.loseCurio) {
    for (let i = 0; i < fx.loseCurio; i++) loseRandomCurio(state);
  }

  // 技能升级
  if (fx.skillUpRandom) {
    randomSkillUp(state, fx.skillUpRandom);
  }
  if (fx.skillUpTarget) {
    outcome.needSkillTarget = fx.skillUpTarget; // UI 选角色后调 applySkillUp
  }
  if (fx.skillUpAll) {
    for (const t of state.team) {
      if (t.alive && t.charId !== 11) applySkillUp(state, t.index, fx.skillUpAll);
    }
  }
  if (fx.tempSkillBoost) {
    state.tempSkillBoost = fx.tempSkillBoost; // 下次战斗技能等级 +N，战斗结束失效
  }

  // 急救包 / 位面生命上限
  if (fx.medkit) {
    state.items.medkit = (state.items.medkit || 0) + fx.medkit;
  }
  if (fx.planeMaxHp) {
    state.planeMaxHpBoost = fx.planeMaxHp;
    for (const t of state.team) {
      t.maxHp = Math.ceil((t.maxHp * (100 + fx.planeMaxHp)) / 100);
    }
  }

  // 下次战斗 buff（M5 完整接入，先存标记）
  if (fx.buff) {
    state.nextBattleBuffs[fx.buff] = true;
  }

  // 事件战斗
  if (fx.battle) {
    const b = fx.battle;
    state.pendingEventReward = b.reward || null;
    outcome.battle = {
      waves: [{ kind: b.kind, count: b.count }],
      desc: `${b.kind === "elite" ? "精英" : "普通"}敌人 ×${b.count}`,
    };
  }

  // 冒险
  if (fx.gamble) {
    outcome.gamble = runGamble(state, fx.gamble);
  }
  if (fx.fortuneCard) {
    outcome.fortuneCard = runFortuneCard(state);
  }
  if (fx.lottery) {
    outcome.lottery = runLottery(state, fx.lottery);
  }

  // 事件扣血致死
  if (state.team.every((t) => !t.alive)) {
    state.gameOver = true;
  }

  state.devLog.info(LOG_TYPE.UNI_REGION, `事件：${ev.title} → ${opt.text}`, {
    eventId,
    optionIdx,
    shards: state.shards,
    blessings: state.blessings.length,
    curios: state.curios.length,
    outcome,
  });
  return { ok: true, outcome, eventId, eventTitle: ev.title };
}

/** 处理祝福三选一的选择 */
export function chooseBlessingPick(state, pickedId) {
  const queue = state.pendingBlessingPicks || [];
  const cur = queue[0];
  if (!cur) return { ok: false, reason: "无可选祝福" };
  if (!cur.candidates.includes(pickedId)) return { ok: false, reason: "非法选择" };
  gainBlessing(state, pickedId);
  queue.shift();
  if (queue.length === 0) state.pendingBlessingPicks = null;
  return { ok: true, remaining: queue.length };
}

/** 骰子游戏：投入 → 掷 1-6 → 收入 = 点数 × 倍数 */
function runGamble(state, g) {
  if (!spendShards(state, g.cost)) return { failed: "碎片不足" };
  const point = Math.floor(Math.random() * 6) + 1;
  const gain = point * g.mult;
  addShards(state, gain);
  state.log.push(`骰子掷出 ${point} 点，获得 ${gain} 碎片（投入 ${g.cost}）`);
  return { point, gain, cost: g.cost };
}

/** 翻牌：40% 2 祝福 / 30% 2 奇物(含负面) / 30% 1 方程 */
function runFortuneCard(state) {
  const r = Math.random();
  if (r < 0.4) {
    for (let i = 0; i < 2; i++) {
      const id = rollBlessing(1, 3);
      if (id) gainBlessing(state, id, { silent: true });
    }
    return { kind: "blessing", count: 2 };
  }
  if (r < 0.7) {
    for (let i = 0; i < 2; i++) {
      const id = rollCurio(false);
      if (id) gainCurio(state, id, { silent: true });
    }
    return { kind: "curio", count: 2 };
  }
  const id = rollEquation(1, 3);
  if (id) gainEquation(state, id);
  return { kind: "equation", count: 1 };
}

/** 抽签：大吉(3×3星祝福)/中吉(1加权奇物)/小吉(2×1~2星祝福)/凶(损失20%生命上限) */
function drawLotteryOne(state) {
  const r = Math.random();
  if (r < 0.1) {
    for (let i = 0; i < 3; i++) {
      const id = rollBlessing(3, 3);
      if (id) gainBlessing(state, id, { silent: true });
    }
    return { level: 4, name: "大吉" };
  }
  if (r < 0.3) {
    const id = rollCurio(false);
    if (id) gainCurio(state, id, { silent: true });
    return { level: 3, name: "中吉" };
  }
  if (r < 0.7) {
    for (let i = 0; i < 2; i++) {
      const id = rollBlessing(1, 2);
      if (id) gainBlessing(state, id, { silent: true });
    }
    return { level: 2, name: "小吉" };
  }
  loseTeamHpPct(state, 20);
  return { level: 1, name: "凶" };
}

function runLottery(state, lot) {
  if (!spendShards(state, lot.cost)) return { failed: "碎片不足" };
  let best = null;
  const draws = [];
  for (let i = 0; i < lot.count; i++) {
    const d = drawLotteryOne(state);
    draws.push(d);
    if (!best || d.level > best.level) best = d;
  }
  state.log.push(`抽签：${draws.map((d) => d.name).join("、")}（取${best.name}）`);
  return { cost: lot.cost, draws, best: best.name };
}

/** 重置事件相关临时状态（每层进入时调用，由 uniState 触发） */
export function resetEventTemp(state) {
  // 事件战斗奖励挂起在战斗胜利后消费
}
