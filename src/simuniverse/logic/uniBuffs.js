// 模拟宇宙祝福系统 — 数据表 + 效果注册 + 强化规则 + 修正聚合
// 纯逻辑层，零依赖（设计文档 docs/simuniverse-design.md §9）
// 第一版基础池（M5 与用户确认名单后可扩充；奇物/方程在 M5）

import { LOG_TYPE } from "../../game/gameLogger.js";
import { EQUATION_DUPE_SHARDS } from "./uniConstants.js";

/** 祝福数据表（六命运，第一版 18 个：12×1星 + 4×2星 + 2×3星） */
export const BLESSINGS = {
  // ── 1 星 ──
  shaojie: { id: "shaojie", name: "构筑·哨戒", star: 1, fate: "存护", desc: "进入战斗时，所有角色获得抵消自身生命上限 16% 伤害的护盾", fx: { shieldPct: 16 }, lv: { shieldPct: [16, 32, 48, 64] } },
  mihe: { id: "mihe", name: "构筑·弥合", star: 1, fate: "存护", desc: "角色受到攻击时，获得等同于本次损失生命值 18% 的护盾", fx: { shieldPct: 18 }, lv: { shieldPct: [18, 36, 54, 72] } },
  fayu: { id: "fayu", name: "法雨", star: 1, fate: "丰饶", desc: "每拥有 1 个丰饶的祝福，角色生命上限提高 2 点（最多叠加 6 层）", fx: { maxHpPer: 2, maxStacks: 6 }, lv: { maxHpPer: [2, 4, 6, 8] } },
  huisheng: { id: "huisheng", name: "回生", star: 1, fate: "丰饶", desc: "角色提供治疗后，回复等同于自身生命上限 12% 的生命值", fx: { healPct: 12 }, lv: { healPct: [12, 16, 20, 24] } },
  huiguang: { id: "huiguang", name: "回光效应", star: 1, fate: "丰饶", desc: "受到致命攻击时不会阵亡，回复至生命上限 1%（全队单场一次）", fx: { revivePct: 1 }, lv: { revivePct: [1, 6, 11, 16] } },
  weixing: { id: "weixing", name: "哨戒卫星", star: 1, fate: "毁灭", desc: "生命 ≤50% 时获得生命上限 20% 的护盾（每名角色单场一次）", fx: { shieldPct: 20, hpBelow: 50 }, lv: { shieldPct: [20, 30, 40, 50] } },
  jiemo: { id: "jiemo", name: "结膜", star: 1, fate: "存护", desc: "角色施放普攻后，获得 3 张防御牌", fx: { defCards: 3 }, lv: { defCards: [3, 4, 5, 6] } },
  yanchi: { id: "yanchi", name: "延迟衍射的烛光", star: 1, fate: "智识", desc: "角色施放群攻技能后，造成的伤害提高 10%，持续 2 回合", fx: { atkPct: 10, turns: 2 }, lv: { atkPct: [10, 20, 30, 40] } },
  huagai: { id: "huagai", name: "金属斑驳的华盖", star: 1, fate: "智识", desc: "角色施放群攻技能后，获得 2 张防御牌", fx: { defCards: 2 }, lv: { defCards: [2, 3, 4, 5] } },
  luoke: { id: "luoke", name: "感知：螺壳的纹理", star: 1, fate: "存护", desc: "我方获得的护盾量提高 10%", fx: { shieldMult: 10 }, lv: { shieldMult: [10, 20, 30, 40] } },
  jifeng: { id: "jifeng", name: "感知：季风的故事", star: 1, fate: "繁育", desc: "我方全体造成的伤害提高 10%", fx: { atkMult: 10 }, lv: { atkMult: [10, 14, 18, 22] } },
  chaoxi: { id: "chaoxi", name: "感知：潮汐的故事", star: 1, fate: "丰饶", desc: "我方全体目标的回复量提高 10%", fx: { healMult: 10 }, lv: { healMult: [10, 20, 30, 40] } },
  chuanzhi: { id: "chuanzhi", name: "传质次星", star: 1, fate: "毁灭", desc: "生命降低或护盾减少后，生命上限提高 20%，持续 2 回合", fx: { maxHpPct: 20, turns: 2 }, lv: { maxHpPct: [20, 24, 28, 32] } },
  jianti: { id: "jianti", name: "晶体偏振的灯塔", star: 1, fate: "智识", desc: "我方目标开大后，生命上限提高 20%，持续 2 回合", fx: { maxHpPct: 20, turns: 2 }, lv: { maxHpPct: [20, 30, 40, 50] } },
  guangxue: { id: "guangxue", name: "光学引导的透镜", star: 1, fate: "智识", desc: "施放终结技时，回复等同于生命上限 20% 的生命值", fx: { healPct: 20 }, lv: { healPct: [20, 24, 28, 32] } },
  hongkuai: { id: "hongkuai", name: "宏块抹除的航路", star: 1, fate: "智识", desc: "我方目标施放终结技造成的伤害提高 20%", fx: { atkMult: 20 }, lv: { atkMult: [20, 30, 40, 50] } },
  chubei: { id: "chubei", name: "储备度规", star: 1, fate: "存护", desc: "进入战斗时，获得已损失生命值 36% 的护盾", fx: { shieldPct: 36 }, lv: { shieldPct: [36, 40, 44, 48] } },
  yanshou: { id: "yanshou", name: "延寿", star: 1, fate: "丰饶", desc: "进入战斗时，回复自身生命上限 24% 的生命值", fx: { healPct: 24 }, lv: { healPct: [24, 28, 32, 36] } },
  jianding: { id: "jianding", name: "构筑·坚定", star: 1, fate: "存护", desc: "持有护盾的角色受到的伤害降低 16%", fx: { dmgTakenPct: 16 }, lv: { dmgTakenPct: [16, 18, 20, 22] }, cap: 50 },
  ganlu: { id: "ganlu", name: "甘露", star: 1, fate: "丰饶", desc: "角色的回复量提高 12%", fx: { healMult: 12 }, lv: { healMult: [12, 24, 36, 48] } },
  rangzai: { id: "rangzai", name: "禳灾", star: 1, fate: "丰饶", desc: "角色接受治疗后，获得 2 张防御牌", fx: { defCards: 3 }, lv: { defCards: [2, 3, 4, 5] } },
  juhuo: { id: "juhuo", name: "引燃的炬火", star: 1, fate: "智识", desc: "角色开大后的下一次攻击造成的伤害提高 20%", fx: { atkPct: 50 }, lv: { atkPct: [20, 30, 40, 50] } },
  luoqi: { id: "luoqi", name: "线圈编织的罗琦", star: 1, fate: "智识", desc: "角色开大后，回复等同于生命上限 16% 的生命值", fx: { healPct: 16 }, lv: { healPct: [16, 20, 24, 28] } },
  hongyi: { id: "hongyi", name: "轨道红移", star: 1, fate: "毁灭", desc: "角色生命上限提高 16%", fx: { maxHpMult: 16 }, lv: { maxHpMult: [16, 32, 48, 64] } },
  penliu: { id: "penliu", name: "双极喷流", star: 1, fate: "毁灭", desc: "我方目标受到的伤害降低 10%", fx: { dmgTakenPct: 10 }, lv: { dmgTakenPct: [10, 12, 14, 16] }, cap: 50 },
  shouzhao: { id: "shouzhao", name: "感知：兽爪的形状", star: 1, fate: "繁育", desc: "我方全体造成的伤害提高 12%", fx: { atkMult: 12 }, lv: { atkMult: [12, 16, 20, 24] } },
  xuansi: { id: "xuansi", name: "悬丝", star: 1, fate: "繁育", desc: "角色普攻的伤害提高 30%", fx: { atkMult: 30 }, lv: { atkMult: [30, 40, 50, 60] } },
  gongpin: { id: "gongpin", name: "虚妄供品", star: 1, fate: "虚无", desc: "敌方目标每受到一次持续伤害，我方全体回复各自 2% 生命上限", fx: { healPct: 2 }, lv: { healPct: [2, 4, 6, 8] } },
  qingxu: { id: "qingxu", name: "情绪舍离", star: 1, fate: "虚无", desc: "敌方每承受 1 个持续伤害状态，受到的伤害提高 3%（最多 4 层）", fx: { atkPerDot: 3, maxDot: 4 }, lv: { atkPerDot: [3, 6, 9, 12] } },
  // ── 2 星 ──
  qiebian: { id: "qiebian", name: "星间构筑·切变结构", star: 2, fate: "存护", desc: "反震伤害提高 10%，并对相邻目标造成主目标 25% 的反震伤害", fx: { reflectPct: 10, splashPct: 25 }, lv: { reflectPct: [10, 14, 18, 22] } },
  huikui: { id: "huikui", name: "星间构筑·回馈庇护", star: 2, fate: "存护", desc: "回合结束时，有 80% 概率获得生命上限 15% 的护盾", fx: { shieldPct: 15, chance: 0.8 }, lv: { shieldPct: [15, 18, 21, 24] } },
  lingzhu: { id: "lingzhu", name: "星间构筑·四棱锥体", star: 2, fate: "存护", desc: "角色提供的护盾量提高 30%", fx: { shieldMult: 30 }, lv: { shieldMult: [30, 40, 50, 60] } },
  yagong: { id: "yagong", name: "星间构筑·亚共晶体", star: 2, fate: "存护", desc: "为我方提供护盾时，自身获得原护盾量 24% 的护盾（持续 2 回合）", fx: { shieldPct: 24 }, lv: { shieldPct: [24, 27, 30, 33] } },
  baoguang: { id: "baoguang", name: "宝光烛日月", star: 2, fate: "丰饶", desc: "提供治疗时，双方造成的伤害提高 20%，持续 1 回合", fx: { atkPct: 20, turns: 1 }, lv: { atkPct: [20, 24, 28, 32] } },
  yanli: { id: "yanli", name: "厌离邪秽苦", star: 2, fate: "繁育", desc: "施放攻击后，对目标造成其当前生命值 30% 的附加伤害", fx: { hpPct: 30 }, lv: { hpPct: [30, 33, 36, 39] } },
  mingche: { id: "mingche", name: "明澈琉璃身", star: 2, fate: "繁育", desc: "当前生命值等于生命上限时，受到的伤害降低 36%", fx: { dmgTakenPct: 36 }, lv: { dmgTakenPct: [36, 38, 40, 42] }, cap: 50 },
  bore: { id: "bore", name: "大愿般若船", star: 2, fate: "丰饶", desc: "接受治疗后，额外回复等同于回复量 30% 的生命值", fx: { healPct: 30 }, lv: { healPct: [30, 35, 40, 45] } },
  yundi: { id: "yundi", name: "云镝逐步离", star: 2, fate: "繁育", desc: "我方全体每经过 20 回合后，所有角色行动提前 100%", fx: { every: 30 }, lv: { every: [20, 18, 16, 14] }, min: 6 },
  feihong: { id: "feihong", name: "飞虹诛凿齿", star: 2, fate: "丰饶", desc: "消灭敌方目标后，回复自身生命上限 30%", fx: { healPct: 48 }, lv: { healPct: [30, 33, 36, 39] } },
  zainan: { id: "zainan", name: "灾难性共振", star: 2, fate: "毁灭", desc: "攻击时若处于战意效果，消耗当前生命 10%，对目标造成已损失生命 60% 的附加伤害", fx: { costPct: 10, dmgPct: 60 }, lv: { dmgPct: [60, 64, 68, 72] } },
  yuzhao: { id: "yuzhao", name: "预兆性景深", star: 2, fate: "毁灭", desc: "每有 1 层战意，受到的伤害降低 1%", fx: { dmgTakenPer: 1 }, lv: { dmgTakenPer: [1, 2, 3, 4] }, cap: 15 },
  baofa: { id: "baofa", name: "破坏性爆发", star: 2, fate: "毁灭", desc: "当前生命值百分比小于 50% 时，造成的伤害提高 20%", fx: { atkPct: 40, hpBelow: 50 }, lv: { atkPct: [20, 24, 28, 32] } },
  shanbian: { id: "shanbian", name: "戒律性闪变", star: 2, fate: "丰饶", desc: "受到攻击后若生命小于 35%，回复生命上限 12%（单次行动最多 36%）", fx: { healPct: 12, capPct: 36, hpBelow: 35 }, lv: { hpBelow: [35, 37, 39, 41] }, cap: 60 },
  weihai: { id: "weihai", name: "危害性余光", star: 2, fate: "智识", desc: "开大后，获得已损失生命值 25% 的护盾", fx: { shieldPct: 25 }, lv: { shieldPct: [25, 30, 35, 40] } },
  luonao: { id: "luonao", name: "裸脑质", star: 2, fate: "繁育", desc: "普攻伤害会对随机相邻单体造成原伤害 30% 的伤害", fx: { splashPct: 30 }, lv: { splashPct: [30, 32, 34, 36] }, cap: 60 },
  cuihua: { id: "cuihua", name: "催化剂", star: 2, fate: "智识", desc: "终结技未施放攻击时，全队伤害提高 20% 持续 1 回合（最多叠加 3 次）", fx: { atkPct: 20, cap: 60, turns: 1 }, lv: { atkPct: [20, 24, 28, 32] } },
  yuxia: { id: "yuxia", name: "分析·阈下知觉", star: 2, fate: "智识", desc: "首次终结技伤害提高 30%", fx: { atkPct: 50 }, lv: { atkPct: [30, 34, 38, 42] } },
  chilun: { id: "chilun", name: "齿轮啮合的王座", star: 2, fate: "智识", desc: "每有 1 个「智识」祝福，终结技伤害提高 5%（最多 5 次）", fx: { atkPer: 5, max: 5 }, lv: { atkPer: [5, 6, 7, 8] } },
  fangshe: { id: "fangshe", name: "放射性衰变", star: 2, fate: "毁灭", desc: "生命百分比低于 50% 时，受到的伤害降低 10%，回复量提高 20%", fx: { dmgTakenPct: 10, healMultPct: 20, hpBelow: 50 }, lv: { healMultPct: [20, 24, 28, 32] } },
  feijian: { id: "feijian", name: "飞溅蛊", star: 2, fate: "繁育", desc: "普攻伤害会对相邻目标造成原伤害 10% 的伤害", fx: { splashPct: 10 }, lv: { splashPct: [10, 14, 18, 22] }, cap: 60 },
  beiju: { id: "beiju", name: "悲剧讲座", star: 2, fate: "虚无", desc: "敌方目标受到的持续伤害提高 20%", fx: { dotFlat: 1 }, lv: { dotPct: [20, 24, 28, 32] } },
  yiyi: { id: "yiyi", name: "意义质询", star: 2, fate: "虚无", desc: "陷入持续伤害状态的敌方目标造成的伤害降低 3 点", fx: { dmgCut: 3 }, lv: { dmgCut: [3, 4, 5, 6] } },
  // ── 3 星 ──
  shenxing: { id: "shenxing", name: "神性构筑·谐振传递", star: 3, fate: "存护", desc: "施放攻击时，对受到攻击的敌方目标造成自身当前护盾量 50% 的反震伤害", fx: { shieldPct: 50 }, lv: { shieldPct: [50, 60, 70, 80] } },
  yifajie: { id: "yifajie", name: "丰饶众生，一法界心", star: 3, fate: "丰饶", desc: "角色提供治疗时，我方全体目标额外回复等同于回复量 30% 的生命值", fx: { spreadPct: 30 }, lv: { spreadPct: [30, 35, 40, 45] } },
  fanwu: { id: "fanwu", name: "反物质费逆方程", star: 3, fate: "毁灭", desc: "当前生命值百分比小于 50% 时，视作拥有 16 层战意效果", fx: { zhandu: 16, hpBelow: 50 }, lv: { zhandu: [16, 18, 20, 22] } },
  huanyu: { id: "huanyu", name: "寰宇热寂特征数", star: 3, fate: "毁灭", desc: "角色受到攻击或消耗生命值后，获得 4 层战意效果", fx: { zhandu: 4 }, lv: { zhandu: [4, 5, 6, 7] } },
  yanmie: { id: "yanmie", name: "湮灭回归不等式", star: 3, fate: "繁育", desc: "受到攻击时，角色所受到的伤害由我方全体平均分摊（强化后效果不变）", fx: {} },
  xingren: { id: "xingren", name: "SMR -2型杏仁核", star: 3, fate: "智识", desc: "使敌方目标受到致命伤害时，为「罐中脑」充能 50%", fx: { jarBrain: 50 }, lv: { jarBrain: [50, 52, 54, 56] } },
  richu: { id: "richu", name: "日出之前", star: 3, fate: "虚无", desc: "我方每次造成持续伤害时，回复等同于造成的持续伤害点数的生命值（强化后效果不变）", fx: {} },
};

/** 命运列表（事件/商店按命运筛选用） */
export const FATES = ["存护", "丰饶", "智识", "毁灭", "繁育", "虚无"];

/**
 * 方程是否已展开：当前祝福命途统计满足 EQUATIONS[id].require
 * （文档「6记忆4智识」等组合需求；未满足 = 未展开，方程无效果）
 */
export function isEquationUnlocked(state, id) {
  const eq = EQUATIONS[id];
  if (!eq || !eq.require) return true; // 无需求 → 视为已展开
  const counts = {};
  for (const b of state.blessings || []) {
    const fate = BLESSINGS[b.id]?.fate;
    if (fate) counts[fate] = (counts[fate] || 0) + 1;
  }
  return Object.entries(eq.require).every(([f, n]) => (counts[f] || 0) >= n);
}

/** 随机取 1 个 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 按星级过滤祝福池 */
export function blessingPool(minStar = 1, maxStar = 3) {
  return Object.values(BLESSINGS).filter(
    (b) => b.star >= minStar && b.star <= maxStar,
  );
}

/** 获得 1 个随机祝福 id（不含已有? 允许重复走强化） */
export function rollBlessing(minStar = 1, maxStar = 3) {
  const pool = blessingPool(minStar, maxStar);
  return pool.length ? pick(pool).id : null;
}

/** 生成「祝福三选一」候选（不重复） */
export function rollBlessingCandidates(count = 3, minStar = 1, maxStar = 3) {
  const pool = blessingPool(minStar, maxStar);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((b) => b.id);
}

/** 获得祝福：已有则强化（×2、×3…），记录日志 */
export function gainBlessing(state, id, opts = {}) {
  const b = BLESSINGS[id];
  if (!b) return { ok: false, reason: "无此祝福" };
  const exist = state.blessings.find((x) => x.id === id);
  if (exist) {
    exist.enhanced = (exist.enhanced || 1) + 1;
    state.log.push(`祝福「${b.name}」强化至 ×${exist.enhanced}`);
    state.devLog.info(LOG_TYPE.UNI_REGION, "祝福强化", {
      id,
      enhanced: exist.enhanced,
      star: b.star,
      silent: !!opts.silent,
    });
    return { ok: true, enhanced: exist.enhanced, star: b.star, silent: opts.silent };
  }
  state.blessings.push({ id, star: b.star, enhanced: 1 });
  if (!opts.silent) {
    state.log.push(`获得祝福「${b.name}」(${b.star}星·${b.fate})`);
  }
  // 轨道红移：生命上限 +16%/层（一次性提升当前 maxHp）
  if (id === "hongyi") {
    for (const t of state.team) {
      t.maxHp = Math.ceil(t.maxHp * 1.16);
      t.hp = Math.min(t.hp, t.maxHp);
    }
  }
  state.devLog.info(LOG_TYPE.UNI_REGION, "获得祝福", {
    id,
    star: b.star,
    fate: b.fate,
    silent: !!opts.silent,
  });
  return { ok: true, star: b.star, silent: opts.silent };
}

/** 随机失去 1 个祝福（事件选项用），返回失去的祝福 */
export function loseRandomBlessing(state) {
  if (state.blessings.length === 0) return null;
  const idx = Math.floor(Math.random() * state.blessings.length);
  const [removed] = state.blessings.splice(idx, 1);
  state.log.push(`失去祝福「${BLESSINGS[removed.id]?.name ?? removed.id}」`);
  // 精神感应餐叉：失去祝福时获得 50 宇宙碎片（强化 +10/级）
  if (state.curios?.some((c) => c.id === "jingshen" && !c.broken)) {
    state.shards += curioVal(state, "jingshen", "gain");
    state.log.push("精神感应餐叉：+50 碎片");
  }
  return removed;
}

/** 失去指定祝福（按数组下标） */
export function loseBlessingAt(state, idx) {
  if (idx < 0 || idx >= state.blessings.length) return null;
  const [removed] = state.blessings.splice(idx, 1);
  // 精神感应餐叉：失去祝福时获得 50 宇宙碎片
  if (state.curios?.some((c) => c.id === "jingshen" && !c.broken)) {
    state.shards += curioVal(state, "jingshen", "gain");
    state.log.push("精神感应餐叉：+50 碎片");
  }
  return removed;
}

/** 祝福强化倍数（重复获得 × enhanced，热量强化 × heatEnhanced） */
export function blessingMult(state, id) {
  const b = state.blessings.find((x) => x.id === id);
  return b ? (b.enhanced || 1) * (b.heatEnhanced || 1) : 0;
}

/** 祝福强化等级（1 级起：enhanced + heatEnhanced - 1，重复/热量强化各 +1 级） */
export function blessingLevel(state, id) {
  const b = state.blessings.find((x) => x.id === id);
  if (!b) return 0;
  return Math.max(1, (b.enhanced || 1) + (b.heatEnhanced || 1) - 1);
}

/**
 * 祝福强化后数值：按等级查 BLESSINGS[id].lv[field] 表；
 * 等级超出表长时按等差步长延伸（文档序列为等差数列）；
 * 无 lv 表则回退 fx[field]；受 fx.cap（上限）/ fx.min（下限）约束。
 */
export function blessingVal(state, id, field) {
  const def = BLESSINGS[id];
  if (!def) return 0;
  const lv = blessingLevel(state, id);
  const table = def.lv?.[field];
  let v = 0;
  if (table && table.length > 0) {
    if (lv <= table.length) {
      v = table[lv - 1];
    } else {
      // 超出表长：按等差步长继续延伸（如 双极喷流 10→12→14→16→18…直到 cap）
      const step = table.length >= 2 ? table[1] - table[0] : 0;
      v = table[table.length - 1] + step * (lv - table.length);
    }
  } else {
    v = def.fx?.[field] || 0;
  }
  if (def.fx?.cap != null || def.cap != null) v = Math.min(v, def.fx?.cap ?? def.cap);
  if (def.fx?.min != null || def.min != null) v = Math.max(v, def.fx?.min ?? def.min);
  return v;
}

/**
 * 聚合所有祝福修正（数据表 fx 驱动，数值只存于 BLESSINGS.fx）。
 * @returns {{ atkMult, atkNormalMult, skillDmgMult, dmgTakenMult, healMult, shieldMult, maxHpMult }}
 */
export function getUniModifiers(state) {
  const mods = {
    atkMult: 0, // 全伤害 %
    atkNormalMult: 0, // 普攻额外 %
    skillDmgMult: 0, // 终结技（角色技能）专属伤害 %
    dmgTakenMult: 0, // 受伤 %（正 = 减伤）
    healMult: 0,
    shieldMult: 0,
    maxHpMult: 0,
  };
  if (!state.blessings?.length) {
    return applyCurioStarMods(state, mods); // 无祝福仍应用奇物（赐福残晶）
  }
  const fateCount = (f) => state.blessings.filter((b) => BLESSINGS[b.id]?.fate === f).length;
  const zhishuCount = fateCount("智识");
  const fengraoCount = fateCount("丰饶");
  // 分裂咕咕钟：角色攻击力降低 5%（每复制体再 -5%）
  const fenlieC = state.curios?.find((c) => c.id === "fenlie");
  if (fenlieC && !fenlieC.broken) {
    mods.atkMult -= 5 * (fenlieC.enhanced || 1);
  }
  // 家族缘结：每有 1 个已损毁的奇物，进入战斗时我方全体造成的伤害提高 30%
  const jiazuC = state.curios?.find((c) => c.id === "jiazu");
  if (jiazuC && !jiazuC.broken) {
    const brokenCount = state.curios.filter((c) => c.broken).length;
    mods.atkMult += (CURIO_FX.jiazu?.atkPerBroken || 30) * brokenCount;
  }
  // 虚高一丈：每有 1 个 1/2/3 星奇物，战斗伤害 +3%/6%/20%
  const xugaoC = state.curios?.find((c) => c.id === "xugao");
  if (xugaoC && !xugaoC.broken) {
    const atkByStar = CURIO_FX.xugao?.atkByStar || [3, 6, 20];
    for (const c of state.curios) {
      if (c.broken) continue;
      mods.atkMult += atkByStar[c.star - 1] || 0;
    }
  }
  // 瘟疫巢都：每通过「区域失去负面奇物」失去 1 个，战斗伤害 +10%
  const wenyiC = state.curios?.find((c) => c.id === "wenyi");
  if (wenyiC && !wenyiC.broken) {
    mods.atkMult += (state.wenyiLost || 0) * curioVal(state, "wenyi", "atkPerLost");
  }
  for (const b of state.blessings) {
    const fx = BLESSINGS[b.id]?.fx;
    if (!fx) continue;
    switch (b.id) {
      case "shouzhao": mods.atkMult += blessingVal(state, b.id, "atkMult"); break;
      case "jifeng": mods.atkMult += blessingVal(state, b.id, "atkMult"); break;
      case "hongkuai": mods.skillDmgMult += blessingVal(state, b.id, "atkMult"); break; // 终结技伤害
      case "chilun": mods.skillDmgMult += blessingVal(state, b.id, "atkPer") * Math.min(zhishuCount, fx.max || 5); break; // 终结技伤害
      case "ruchong": mods.atkMult += (fx.atkMult || 0); break; // 蠕行之蛇：敌方受伤 +10%（方程）
      case "xingqiu":
        mods.atkMult += (fx.atkMult || 0); // 行星碰碰车（方程）
        if (state.combat?.enemies?.some((e) => e.alive && e.dotTurns > 0)) {
          mods.atkMult += (fx.dotAtkMult || 0);
        }
        break;
      case "chitu": mods.atkMult += (fx.atkMult || 0); break; // 吃土绑架犯（方程）
      case "xuansi": mods.atkNormalMult += blessingVal(state, b.id, "atkMult"); break;
      case "penliu": mods.dmgTakenMult += blessingVal(state, b.id, "dmgTakenPct"); break;
      case "fangshe":
        mods.dmgTakenMult += (fx.dmgTakenPct || 0); // 生命<50%（动态修正兜底，这里给满值）
        mods.healMult += blessingVal(state, b.id, "healMultPct");
        break;
      case "ganlu": mods.healMult += blessingVal(state, b.id, "healMult"); break;
      case "chaoxi": mods.healMult += blessingVal(state, b.id, "healMult"); break;
      case "luoke": mods.shieldMult += blessingVal(state, b.id, "shieldMult"); break;
      case "lingzhu": mods.shieldMult += blessingVal(state, b.id, "shieldMult"); break;
      case "hongyi": mods.maxHpMult += blessingVal(state, b.id, "maxHpMult"); break;
      case "fayu": mods.maxHpMult += blessingVal(state, b.id, "maxHpPer") * Math.min(fengraoCount, fx.maxStacks || 6); break;
      case "qingxu": {
        const dotCount = state.combat?.enemies?.filter((e) => e.alive && e.dotTurns > 0).length ?? 0;
        mods.atkMult += blessingVal(state, b.id, "atkPerDot") * Math.min(dotCount, fx.maxDot || 4);
        break;
      }
      default:
        break;
    }
  }
  // 奇物：赐福残晶系列（星级 = 祝福星数和 + 方程星数和）
  return applyCurioStarMods(state, mods);
}

/** 赐福残晶：浪漫(普攻)/理性(终结技)/纷争(对精英→简化全伤害)，每星级 +2.5% */
function applyCurioStarMods(state, mods) {
  const starTotal =
    (state.blessings || []).reduce((a, b) => a + b.star, 0) +
    (state.equations || []).reduce((a, e) => a + e.star, 0);
  if (state.curios?.some((c) => c.id === "canjing_lm")) {
    mods.atkNormalMult += (CURIO_FX.canjing_lm?.atkPerStar || 2.5) * starTotal; // 普攻
  }
  if (state.curios?.some((c) => c.id === "canjing_lx")) {
    mods.skillDmgMult += (CURIO_FX.canjing_lx?.atkPerStar || 2.5) * starTotal; // 终结技
  }
  if (state.curios?.some((c) => c.id === "canjing_fz")) {
    mods.atkMult += (CURIO_FX.canjing_fz?.atkPerStar || 2.5) * starTotal; // 对精英（简化并入全伤害）
  }
  return mods;
}

/** 按成员血量/护盾/战意动态计算的额外攻击修正（数据表 fx 驱动） */
export function memberAtkMods(state, memberIdx) {
  const t = state.team[memberIdx];
  if (!t) return 0;
  let extra = 0;
  const baofaFx = BLESSINGS.baofa?.fx;
  if (baofaFx && blessingMult(state, "baofa") > 0 && t.hp / t.maxHp < (baofaFx.hpBelow || 50) / 100) {
    extra += blessingVal(state, "baofa", "atkPct");
  }
  const fanwuFx = BLESSINGS.fanwu?.fx;
  if (fanwuFx && blessingMult(state, "fanwu") > 0 && t.hp / t.maxHp < (fanwuFx.hpBelow || 50) / 100) {
    extra += blessingVal(state, "fanwu", "zhandu"); // 每层战意 = 1% 伤害
  }
  // 战意：每层伤害 +1%
  extra += (t.status.zhandu || 0) * 1;
  return extra;
}

/** 按成员血量动态计算的受伤减伤（数据表 fx 驱动） */
export function memberDmgTakenMods(state, memberIdx) {
  const t = state.team[memberIdx];
  if (!t) return 0;
  let extra = 0;
  // 预兆性景深：每有 1 层战意，受到的伤害降低 1%（战意本身不减伤，仅此祝福提供）
  const yuzhaoFx = BLESSINGS.yuzhao?.fx;
  if (yuzhaoFx && blessingMult(state, "yuzhao") > 0) {
    extra += (t.status.zhandu || 0) * blessingVal(state, "yuzhao", "dmgTakenPer");
  }
  // 明澈琉璃身：满血受伤 -36%
  const mingcheFx = BLESSINGS.mingche?.fx;
  if (mingcheFx && blessingMult(state, "mingche") > 0 && t.hp >= t.maxHp) {
    extra += blessingVal(state, "mingche", "dmgTakenPct");
  }
  // 构筑·坚定：持盾受伤 -16%
  const jiandingFx = BLESSINGS.jianding?.fx;
  if (jiandingFx && blessingMult(state, "jianding") > 0 && (t.shield > 0 || t.status.defensePile.length > 0)) {
    extra += blessingVal(state, "jianding", "dmgTakenPct");
  }
  // 放射性衰变：生命 ≥50% 时补偿（getUniModifiers 给了满值）
  const fangsheFx = BLESSINGS.fangshe?.fx;
  if (fangsheFx && blessingMult(state, "fangshe") > 0 && t.hp / t.maxHp >= (fangsheFx.hpBelow || 50) / 100) {
    extra -= blessingVal(state, "fangshe", "dmgTakenPct");
  }
  return extra;
}

// ---- 事件钩子（需要结算上下文） ----

/** 战斗开始钩子：哨戒/储备度规/延寿（数值均读 BLESSINGS.fx） */
export function triggerOnCombatStart(state) {
  for (const t of state.team) {
    if (!t.alive) continue;
    const shaojie = BLESSINGS.shaojie?.fx?.shieldPct || 0;
    if (blessingMult(state, "shaojie") > 0) {
      t.shield += Math.ceil((t.maxHp * blessingVal(state, "shaojie", "shieldPct")) / 100);
    }
    const chubei = BLESSINGS.chubei?.fx?.shieldPct || 0;
    if (blessingMult(state, "chubei") > 0) {
      t.shield += Math.ceil(((t.maxHp - t.hp) * blessingVal(state, "chubei", "shieldPct")) / 100);
    }
    const yanshou = BLESSINGS.yanshou?.fx?.healPct || 0;
    if (blessingMult(state, "yanshou") > 0) {
      t.hp = Math.min(t.maxHp, t.hp + Math.ceil((t.maxHp * blessingVal(state, "yanshou", "healPct")) / 100));
    }
  }
}

/** 受到伤害后钩子（弥合/闪变/传质/热寂/卫星/冰霜巨人，数值均读 fx） */
export function triggerOnDamaged(state, memberIdx, hpLoss) {
  const t = state.team[memberIdx];
  if (!t) return;
  const mihe = BLESSINGS.mihe?.fx?.shieldPct || 0;
  if (mihe && blessingMult(state, "mihe") > 0 && hpLoss > 0) {
    t.shield += Math.ceil((hpLoss * blessingVal(state, "mihe", "shieldPct")) / 100);
  }
  const shanbianFx = BLESSINGS.shanbian?.fx;
  if (shanbianFx && blessingMult(state, "shanbian") > 0 && t.hp / t.maxHp < (shanbianFx.hpBelow || 35) / 100) {
    t.hp = Math.min(t.maxHp, t.hp + Math.ceil((t.maxHp * blessingVal(state, "shanbian", "healPct")) / 100));
  }
  const chuanzhiFx = BLESSINGS.chuanzhi?.fx;
  if (chuanzhiFx && blessingMult(state, "chuanzhi") > 0) {
    t.maxHp = Math.ceil(t.maxHp * (1 + blessingVal(state, "chuanzhi", "maxHpPct") / 100));
    t.status.maxHpBuffTurns = chuanzhiFx.turns || 2;
  }
  const huanyuFx = BLESSINGS.huanyu?.fx;
  if (huanyuFx && blessingMult(state, "huanyu") > 0 && hpLoss > 0) {
    t.status.zhandu = (t.status.zhandu || 0) + blessingVal(state, "huanyu", "zhandu");
  }
  const weixingFx = BLESSINGS.weixing?.fx;
  if (weixingFx && blessingMult(state, "weixing") > 0 && t.hp / t.maxHp <= (weixingFx.hpBelow || 50) / 100 && !t.status.weixingUsed) {
    t.status.weixingUsed = true;
    t.shield += Math.ceil((t.maxHp * blessingVal(state, "weixing", "shieldPct")) / 100);
  }
  // 方程：冰霜巨人
  const bingkuangFx = EQUATIONS.bingkuang?.fx;
  if (bingkuangFx && state.equations?.some((e) => e.id === "bingkuang") && hpLoss > 0 && t.hp / t.maxHp < (bingkuangFx.hpBelow || 40) / 100) {
    if ((t.status.zhandu || 0) >= (bingkuangFx.zhanduCost || 5)) {
      t.status.zhandu -= bingkuangFx.zhanduCost;
      t.hp = Math.min(t.maxHp, t.hp + Math.ceil((t.maxHp * bingkuangFx.healPct) / 100));
      t.status.dmgBuffPct = (t.status.dmgBuffPct || 0) + (bingkuangFx.atkPct || 150);
      t.status.dmgBuffTurns = bingkuangFx.turns || 2;
      state.log.push("冰霜巨人：消耗战意，回复并强化");
    }
  }
}

/** 接受治疗后钩子（禳灾/般若船/宝光，数值读 fx） */
export function triggerOnHeal(state, memberIdx, healAmount = 0) {
  const t = state.team[memberIdx];
  if (!t) return;
  const rangzai = BLESSINGS.rangzai?.fx?.defCards || 0;
  if (rangzai && blessingMult(state, "rangzai") > 0) {
    for (let i = 0; i < blessingVal(state, "rangzai", "defCards"); i++) {
      t.status.defensePile.push({ value: 2, rank: "盾", suit: "♦" });
    }
  }
  const boreFx = BLESSINGS.bore?.fx;
  if (boreFx && blessingMult(state, "bore") > 0 && healAmount > 0) {
    t.hp = Math.min(t.maxHp, t.hp + Math.ceil((healAmount * blessingVal(state, "bore", "healPct")) / 100));
  }
  const baoguangFx = BLESSINGS.baoguang?.fx;
  if (baoguangFx && blessingMult(state, "baoguang") > 0) {
    t.status.dmgBuffPct = Math.max(t.status.dmgBuffPct || 0, baoguangFx.atkPct || 20);
    t.status.dmgBuffTurns = baoguangFx.turns || 1;
  }
}

/** 消灭敌人后钩子（飞虹/SMR杏仁核，数值读 fx） */
export function triggerOnKill(state, memberIdx) {
  const feihongFx = BLESSINGS.feihong?.fx;
  if (feihongFx && blessingMult(state, "feihong") > 0) {
    const t = state.team[memberIdx];
    t.hp = Math.min(t.maxHp, t.hp + Math.ceil((t.maxHp * blessingVal(state, "feihong", "healPct")) / 100));
  }
  const xingrenFx = BLESSINGS.xingren?.fx;
  if (xingrenFx && blessingMult(state, "xingren") > 0) {
    chargeJarBrain(state, blessingVal(state, "xingren", "jarBrain"));
  }
}

/** 开大后钩子（炬火/罗琦/透镜/余光/灯塔/阈下/催化剂/罐中脑，数值读 fx） */
export function triggerAfterSkill(state, charIndex) {
  const t = state.team[charIndex];
  if (!t) return;
  const juhuoFx = BLESSINGS.juhuo?.fx;
  if (juhuoFx && blessingMult(state, "juhuo") > 0) {
    t.status.nextAttackBoost = blessingVal(state, "juhuo", "atkPct");
  }
  const luoqiFx = BLESSINGS.luoqi?.fx;
  if (luoqiFx && blessingMult(state, "luoqi") > 0) {
    t.hp = Math.min(t.maxHp, t.hp + Math.ceil((t.maxHp * blessingVal(state, "luoqi", "healPct")) / 100));
  }
  const guangxueFx = BLESSINGS.guangxue?.fx;
  if (guangxueFx && blessingMult(state, "guangxue") > 0) {
    t.hp = Math.min(t.maxHp, t.hp + Math.ceil((t.maxHp * blessingVal(state, "guangxue", "healPct")) / 100));
  }
  const weihaiFx = BLESSINGS.weihai?.fx;
  if (weihaiFx && blessingMult(state, "weihai") > 0) {
    t.shield += Math.ceil(((t.maxHp - t.hp) * blessingVal(state, "weihai", "shieldPct")) / 100);
  }
  const jiantiFx = BLESSINGS.jianti?.fx;
  if (jiantiFx && blessingMult(state, "jianti") > 0) {
    t.maxHp = Math.ceil(t.maxHp * (1 + blessingVal(state, "jianti", "maxHpPct") / 100));
    t.status.maxHpBuffTurns = jiantiFx.turns || 2;
  }
  // 延迟衍射的烛光：施放群攻技能（开大）后，造成的伤害 +10%，持续 2 回合
  const yanchiFx = BLESSINGS.yanchi?.fx;
  if (yanchiFx && blessingMult(state, "yanchi") > 0) {
    t.status.dmgBuffPct = (t.status.dmgBuffPct || 0) + blessingVal(state, "yanchi", "atkPct");
    t.status.dmgBuffTurns = Math.max(t.status.dmgBuffTurns || 0, yanchiFx.turns || 2);
  }
  // 催化剂：终结技后全队伤害 +20%（1 回合，最多 3 层）
  const cuihuaFx = BLESSINGS.cuihua?.fx;
  if (cuihuaFx && blessingMult(state, "cuihua") > 0) {
    for (const x of state.team) {
      x.status.dmgBuffPct = Math.min((x.status.dmgBuffPct || 0) + blessingVal(state, "cuihua", "atkPct"), blessingVal(state, "cuihua", "cap"));
      x.status.dmgBuffTurns = cuihuaFx.turns || 1;
    }
  }
  // 罐中脑：充能 ≥100% 时立即消耗 100% 充能，使当前行动角色施放大招后可再次激活大招（冷却清零）
  if ((state.jarBrain || 0) >= 100) {
    state.jarBrain = 0;
    if (t.skillCooldown > 0) {
      t.skillCooldown = 0;
      state.log.push("罐中脑能量释放：大招可再次激活");
    }
  }
}

/** 攻击后钩子（结膜/厌离/谐振/共振/裸脑质·飞溅蛊，数值读 fx） */
export function triggerOnAttackAfter(state, memberIdx, targetEnemyId, baseDmg) {
  const t = state.team[memberIdx];
  if (!t) return;
  const c = state.combat;
  if (!c) return;
  const target = c.enemies.find((e) => e.id === targetEnemyId && e.alive);
  if (!target) return;
  const jiemo = BLESSINGS.jiemo?.fx?.defCards || 0;
  if (jiemo && blessingMult(state, "jiemo") > 0) {
    const n = blessingVal(state, "jiemo", "defCards");
    for (let i = 0; i < n; i++) {
      t.status.defensePile.push({ value: 2, rank: "盾", suit: "♦" });
    }
    state.log.push(`结膜：${t.name} 普攻后获得 ${n} 张防御牌`);
  }
  const yanliFx = BLESSINGS.yanli?.fx;
  if (yanliFx && blessingMult(state, "yanli") > 0) {
    const extra = Math.ceil((target.hp * blessingVal(state, "yanli", "hpPct")) / 100);
    if (extra > 0) c._pendingExtra = (c._pendingExtra || 0) + extra;
  }
  const shenxingFx = BLESSINGS.shenxing?.fx;
  if (shenxingFx && blessingMult(state, "shenxing") > 0 && t.shield > 0) {
    c._pendingExtra = (c._pendingExtra || 0) + Math.ceil((t.shield * blessingVal(state, "shenxing", "shieldPct")) / 100);
  }
  const zainanFx = BLESSINGS.zainan?.fx;
  if (zainanFx && blessingMult(state, "zainan") > 0 && (t.status.zhandu || 0) > 0) {
    const cost = Math.ceil((t.hp * zainanFx.costPct) / 100);
    t.hp -= cost;
    const lost = t.maxHp - t.hp;
    c._pendingExtra = (c._pendingExtra || 0) + Math.ceil((lost * blessingVal(state, "zainan", "dmgPct")) / 100);
    // 寰宇热寂特征数：消耗生命值后获得战意
    const huanyuFx = BLESSINGS.huanyu?.fx;
    if (huanyuFx && blessingMult(state, "huanyu") > 0 && cost > 0) {
      t.status.zhandu = (t.status.zhandu || 0) + blessingVal(state, "huanyu", "zhandu");
    }
  }
  // 裸脑质/飞溅蛊：普攻溅射随机相邻敌人
  const luonao = BLESSINGS.luonao?.fx?.splashPct || 0;
  const feijian = BLESSINGS.feijian?.fx?.splashPct || 0;
  const splash = blessingVal(state, "luonao", "splashPct") + blessingVal(state, "feijian", "splashPct");
  if (splash > 0) {
    const others = c.enemies.filter((e) => e.alive && e.id !== targetEnemyId);
    if (others.length > 0) {
      const vic = others[Math.floor(Math.random() * others.length)];
      c._pendingSplash = (c._pendingSplash || 0) + Math.ceil((baseDmg * splash) / 100);
      c._splashTarget = vic.id;
    }
  }
}

/** 回合结束钩子（回馈庇护/寰宇热寂，数值读 fx） */
export function triggerOnEndTurn(state) {
  const huikuiFx = BLESSINGS.huikui?.fx;
  if (huikuiFx && blessingMult(state, "huikui") > 0 && Math.random() < (huikuiFx.chance || 0.8)) {
    for (const t of state.team) {
      if (!t.alive) continue;
      t.shield += Math.ceil((t.maxHp * blessingVal(state, "huikui", "shieldPct")) / 100);
    }
  }
}

/** 罐中脑充能（0-100 封顶） */
export function chargeJarBrain(state, n) {
  state.jarBrain = Math.min(100, (state.jarBrain || 0) + n);
}

/** 战斗开始奇物钩子：无限递归代码/羊皮卷/博士之袍/精确优雅代码/有梦/黑森林 */
export function triggerCurioOnCombatStart(state) {
  const c = state.combat;
  // 无限递归的代码：生命上限 +20%（强化 +4/级）
  if (state.curios?.some((x) => x.id === "wuxian")) {
    for (const t of state.team) {
      t.maxHp = Math.ceil(t.maxHp * (1 + curioVal(state, "wuxian", "maxHpMult") / 100));
      t.hp = Math.min(t.hp, t.maxHp);
    }
  }
  // 精确优雅的代码：生命上限 / 造成的伤害 / 护盾量 +35%（强化 +3/级）
  if (state.curios?.some((x) => x.id === "jingque")) {
    const pct = curioVal(state, "jingque", "atkDefHpPct");
    for (const t of state.team) {
      t.maxHp = Math.ceil(t.maxHp * (1 + pct / 100));
      t.hp = Math.min(t.hp, t.maxHp);
      t.status.dmgBuffPct = (t.status.dmgBuffPct || 0) + pct;
      t.status.dmgBuffTurns = 1;
      t.shield += Math.ceil((t.maxHp * pct) / 100); // 护盾量 +35%
    }
    state.log.push(`精确优雅的代码：全队生命上限/伤害/护盾 +${pct}%`);
  }
  // 永不停嘴的羊皮卷：敌方全体受 30% 生命上限固定伤害（强化 +2/级）
  if (state.curios?.some((x) => x.id === "sheep")) {
    for (const e of c.enemies) {
      if (e.alive) {
        e.hp = Math.max(0, e.hp - Math.ceil(e.maxHp * (curioVal(state, "sheep", "hpPct") / 100)));
        if (e.hp <= 0) {
          e.alive = false;
          state.log.push(`羊皮卷：击败 ${e.name}`);
        }
      }
    }
  }
  // 博士之袍：拥有已展开的 3 星方程 → 所有角色激活终结技 + 全队伤害 +25%（强化 +3/级）
  if (state.curios?.some((x) => x.id === "boshi") && state.equations?.some((e) => e.star === 3 && isEquationUnlocked(state, e.id))) {
    for (const t of state.team) {
      t.skillCooldown = 0; // 激活终结技
      t.status.dmgBuffPct = (t.status.dmgBuffPct || 0) + curioVal(state, "boshi", "atkMult");
      t.status.dmgBuffTurns = 1;
    }
  }
  // 有梦-0110：全队伤害 +50%（强化 +2/级）
  if (state.curios?.some((x) => x.id === "youmeng")) {
    for (const t of state.team) {
      t.status.dmgBuffPct = (t.status.dmgBuffPct || 0) + curioVal(state, "youmeng", "atkMult");
      t.status.dmgBuffTurns = 1;
    }
    // 「15 回合后受到的伤害提高 10%」：记录回合标记，由战斗层在回合 15+ 应用
    state.combat._youmengTurns = CURIO_FX.youmeng?.turns || 15;
  }
  // 纯美之袍：每拥有 100 宇宙碎片，全队伤害 +20%（强化 +2/级）
  if (state.curios?.some((x) => x.id === "chunmei_pao")) {
    const pct = Math.floor(state.shards / 100) * curioVal(state, "chunmei_pao", "atkPer100");
    if (pct > 0) {
      for (const t of state.team) {
        t.status.dmgBuffPct = (t.status.dmgBuffPct || 0) + pct;
        t.status.dmgBuffTurns = 1;
      }
      state.log.push(`纯美之袍：${Math.floor(state.shards / 100)}×100 碎片 → 全队伤害 +${pct}%`);
    }
  }
  // 黑森林咕咕钟：随机 1 名我方目标被攻击概率大幅提高（简化：标记 5 回合）
  if (state.curios?.some((x) => x.id === "heisenlin")) {
    const alive = state.team.filter((t) => t.alive);
    if (alive.length) {
      const target = alive[Math.floor(Math.random() * alive.length)];
      target.status.taunt = CURIO_FX.heisenlin?.tauntTurns || 5;
      state.log.push(`黑森林咕咕钟：${target.name} 被标记为集火目标`);
    }
  }
}

/** 战斗胜利奇物钩子：埋点土（3/6/9 场）/ 阿阮袋 / 降维骰子 */
export function triggerCurioOnWin(state) {
  // 埋点土：3/6/9 场胜利 +50/150/250，9 场损毁
  const maidi = state.curios?.find((x) => x.id === "maidi");
  if (maidi && !maidi.broken) {
    maidi.wins = (maidi.wins || 0) + 1;
    const w = maidi.wins;
    const pts = CURIO_FX.maidi?.winPoints || [3, 6, 9];
    const gs = CURIO_FX.maidi?.gains || [50, 150, 250];
    // 埋点土强化：所有数值每级递增 30（50→80→110…）
    const lvBonus = Math.max(0, (maidi.enhanced || 1) - 1) * 30;
    const gainsUp = gs.map((g) => g + lvBonus);
    let gain = 0;
    for (let i = 0; i < pts.length; i++) if (w >= pts[i]) gain = gainsUp[i];
    if (gain > 0) {
      state.shards += gain;
      state.log.push(`埋点土：+${gain} 碎片`);
    }
    if (w >= 9) {
      breakCurio(state, "maidi");
      state.log.push("埋点土：已损毁");
    }
  }
  // 暗海碎饵：每 3 场战斗后随机获得当前 15% 或失去当前 10% 碎片（强化 +3%/级，上限 50%）
  const anhai = state.curios?.find((x) => x.id === "anhai");
  if (anhai && !anhai.broken) {
    anhai.wins = (anhai.wins || 0) + 1;
    if (anhai.wins >= (CURIO_FX.anhai?.battles || 3)) {
      anhai.wins = 0;
      if (Math.random() < 0.5) {
        const pct = curioVal(state, "anhai", "gainPct");
        const gain = Math.ceil(state.shards * (pct / 100));
        state.shards += gain;
        state.log.push(`暗海碎饵：获得当前 ${pct}% 碎片（+${gain}）`);
      } else {
        const pct = curioVal(state, "anhai", "lossPct");
        const loss = Math.ceil(state.shards * (pct / 100));
        state.shards = Math.max(0, state.shards - loss);
        state.log.push(`暗海碎饵：失去当前 ${pct}% 碎片（-${loss}）`);
      }
    }
  }
  // 阿阮袋：2 次战斗后损毁
  const aruan = state.curios?.find((x) => x.id === "aruan");
  if (aruan && !aruan.broken) {
    aruan.wins = (aruan.wins || 0) + 1;
    if (aruan.wins >= (CURIO_FX.aruan?.triggers || 2)) {
      breakCurio(state, "aruan");
      state.log.push("阿阮袋：已损毁");
    }
  }
  // 降维骰子：2 次战斗后损毁
  const jiangwei = state.curios?.find((x) => x.id === "jiangwei");
  if (jiangwei && !jiangwei.broken) {
    jiangwei.wins = (jiangwei.wins || 0) + 1;
    if (jiangwei.wins >= (CURIO_FX.jiangwei?.triggers || 2)) {
      breakCurio(state, "jiangwei");
      state.log.push("降维骰子：已损毁");
    }
  }
  // 分裂咕咕钟：战斗胜利后 50% 概率再获得 1 个复制品（可叠加，最多 3 个）
  const fenlie = state.curios?.find((x) => x.id === "fenlie");
  if (fenlie && !fenlie.broken && (fenlie.enhanced || 1) < 3 && Math.random() < 0.5) {
    fenlie.enhanced = (fenlie.enhanced || 1) + 1;
    state.log.push(`分裂咕咕钟分裂出 1 个复制品（共 ${fenlie.enhanced} 个）`);
  }
}

/** 敌方持续伤害结算后钩子：虚妄供品 → 全队回 2%（数值读 fx） */
export function triggerOnEnemyDot(state) {
  const gongpinFx = BLESSINGS.gongpin?.fx;
  const m = blessingMult(state, "gongpin");
  if (gongpinFx && m > 0) {
    for (const t of state.team) {
      if (!t.alive) continue;
      t.hp = Math.min(t.maxHp, t.hp + Math.ceil((t.maxHp * gongpinFx.healPct) / 100 * m));
    }
  }
}

/** 治疗扩散（丰饶众生，一法界心）：提供治疗时我方全体目标额外回复回复量的 %（数值读 lv 表） */
export function applyHealSpread(state, healerIdx, amount) {
  if (blessingMult(state, "yifajie") <= 0 || !amount || amount <= 0) return 0;
  let spread = 0;
  for (const t of state.team) {
    if (!t.alive) continue;
    const heal = Math.ceil((amount * blessingVal(state, "yifajie", "spreadPct")) / 100);
    t.hp = Math.min(t.maxHp, t.hp + heal);
    spread += heal;
  }
  return spread;
}

// ================= 奇物（第一版基础池，效果 M5 完整接入） =================

/** 奇物数据表（全量：9 负面 + 27×1星 + 36×2星 + 7×3星） */
export const CURIOS = {
  // ── 负面 ──
  posui: { id: "posui", name: "破碎咕咕钟", star: 0, negative: true, desc: "战斗胜利后获得的宇宙碎片降低 25%；展开 1 个方程后损毁" },
  yongdong: { id: "yongdong", name: "永动咕咕钟", star: 0, negative: true, desc: "每进入下一区域，失去 4% 当前持有的宇宙碎片" },
  kuaile: { id: "kuaile", name: "快乐电视机", star: 0, negative: true, desc: "连续进入相同区域时，失去 25 碎片和 1 个随机 1-3 星奇物" },
  bobo: { id: "bobo", name: "菠萝", star: 0, negative: true, desc: "累计进入 3 个区域后损毁，使我方全体损失 99% 当前生命值" },
  gongsi: { id: "gongsi", name: "公司咕咕钟", star: 0, negative: true, desc: "商品价格提高 25%" },
  fenlie: { id: "fenlie", name: "分裂咕咕钟", star: 0, negative: true, desc: "角色攻击力降低 5%，战斗胜利后有概率分裂出 1 个复制体（最多 3 个）" },
  zhongdeng: { id: "zhongdeng", name: "中等念头群体机", star: 0, negative: true, desc: "商品价格提高 25%" },
  heisenlin: { id: "heisenlin", name: "黑森林咕咕钟", star: 0, negative: true, desc: "进入战斗时，随机 1 名我方目标被敌方攻击概率大幅提高，持续 5 回合" },
  bushu: { id: "bushu", name: "卜签咕咕钟", star: 0, negative: true, desc: "战斗胜利后选择祝福时，可选择的祝福选项减少 1 个" },
  // ── 1 星 ──
  zhongduan: { id: "zhongduan", name: "终端卫士", star: 1, desc: "失去区域时获得 75 宇宙碎片（触发 3 次后损毁）" },
  dabinggan: { id: "dabinggan", name: "大饼干", star: 1, desc: "区域升级时获得 1 个随机 1-2 星祝福（每个区域 1 次，触发 2 次后损毁）" },
  eye: { id: "eye", name: "监督之眼", star: 1, desc: "进入区域后失去 50 宇宙碎片；失去该奇物时获得 1 个随机 3 星奇物" },
  anhai: { id: "anhai", name: "暗海碎饵", star: 1, desc: "获得或每 3 场战斗后，随机获得当前 15% 或失去当前 10% 的宇宙碎片" },
  shui: { id: "shui", name: "睡眠和死亡", star: 1, desc: "进入区域时若碎片 ≤10，损毁并获得 400 宇宙碎片" },
  lieyang: { id: "lieyang", name: "烈阳之舞", star: 1, desc: "奇物损毁时，获得 30 宇宙碎片" },
  wulian: { id: "wulian", name: "无爱之尘", star: 1, desc: "进入区域时若奇物 ≥4，失去自身与其他 3 个随机奇物，获得 1 个 1-3 星方程" },
  wuxian: { id: "wuxian", name: "无限递归的代码", star: 1, desc: "进入战斗时，我方目标生命上限提高 20%" },
  zhutie: { id: "zhutie", name: "铸铁的齿轮指环", star: 1, desc: "获得宇宙碎片提高 30%，但商店售价与覆写消耗提高 30%" },
  adaptive: { id: "adaptive", name: "自适应礼品盒", star: 1, desc: "获得时失去所有碎片，然后随机获得失去值 10%-200% 的碎片" },
  jidong: { id: "jidong", name: "铸铁的机动指环", star: 1, desc: "获得碎片降低 50%，覆写消耗降低 100%，覆写次数上限降为 7" },
  liangzi: { id: "liangzi", name: "量子大乐透", star: 1, desc: "每次进入区域有小概率获得负面奇物，也有小概率损毁（损毁时 +400 碎片）" },
  jixian: { id: "jixian", name: "祭献投枪", star: 1, desc: "进入战斗/转化/精英/首领区域 +35 碎片；事件/奖励/冒险/财富区域 -35 碎片" },
  yinhe: { id: "yinhe", name: "银河大乐透", star: 1, desc: "进入区域后小概率获得奇物，也有小概率损毁并使全队损失 99% 当前生命" },
  linji: { id: "linji", name: "临时赌资", star: 1, desc: "立即获得 300 碎片，累计 5 个区域后损毁并失去 450 碎片" },
  heping: { id: "heping", name: "和平的代价", star: 1, desc: "进入商店区域时获得 150 宇宙碎片" },
  wanxiang: { id: "wanxiang", name: "万象无常骰", star: 1, desc: "获得后立即随机强化 2 个祝福" },
  boshi: { id: "boshi", name: "博士之袍", star: 1, desc: "进入战斗时若拥有已展开的 3 星方程，激活终结技并使伤害提高 25%" },
  club: { id: "club", name: "俱乐部券", star: 1, desc: "战斗胜利后获得宇宙碎片提高 40%" },
  sheep: { id: "sheep", name: "永不停嘴的羊皮卷", star: 1, desc: "进入战斗时，敌方全体受到各自生命上限 30% 的固定伤害" },
  cheese: { id: "cheese", name: "香涎干酪", star: 1, desc: "战斗胜利后，全队回复 100% 生命" },
  yueqian: { id: "yueqian", name: "跃迁复眼", star: 1, desc: "战斗胜利后选择祝福时，强化所有 1 星祝福" },
  zuotian: { id: "zuotian", name: "昨天的重量", star: 1, desc: "进入区域时获得 35 碎片，碎片减少累计 3 次后损毁" },
  juedui: { id: "juedui", name: "绝对自灭药膏", star: 1, desc: "立即获得 2 个方程所需祝福，失去 2 个方程不需要的祝福" },
  maidi: { id: "maidi", name: "埋点土", star: 1, desc: "获得 3/6/9 场战斗胜利后获得 50/150/250 碎片；9 场后损毁" },
  youmeng: { id: "youmeng", name: "有梦-0110", star: 1, desc: "进入战斗时全队伤害提高 50%；15 回合后受到的伤害提高 10%" },
  lubeite: { id: "lubeite", name: "鲁珀特帝国机械齿轮", star: 1, desc: "每次进入区域获得 50 碎片；碎片超过 750 时损毁并失去 750 碎片" },
  // ── 2 星 ──
  caikuang: { id: "caikuang", name: "采矿吸尘器（大型）", star: 2, desc: "进入重任/异堂区域后获得 1 个 1-2 星祝福（触发 5 次后损毁）" },
  canjing_lm: { id: "canjing_lm", name: "赐福残晶·浪漫", star: 2, desc: "祝福和方程每有 1 个星级，普攻伤害提高 2.5%" },
  canjing_lx: { id: "canjing_lx", name: "赐福残晶·理性", star: 2, desc: "祝福和方程每有 1 个星级，终结技伤害提高 2.5%" },
  canjing_fz: { id: "canjing_fz", name: "赐福残晶·纷争", star: 2, desc: "祝福和方程每有 1 个星级，对精英敌人伤害提高 2.5%" },
  shijin: { id: "shijin", name: "失金爪锚", star: 2, desc: "立即获得 500 碎片；5 个区域后损毁；碎片 <500 时失去 5 个随机祝福后损毁" },
  hepingxiang: { id: "hepingxiang", name: "和平箱", star: 2, desc: "展开 1 个 2 星及以上方程后获得 1 个随机祝福（最多 4 次）" },
  luck: { id: "luck", name: "有形幸运", star: 2, desc: "进入区域时，若宇宙碎片小于 250，补足为 250" },
  huacheng: { id: "huacheng", name: "化作尘泥", star: 2, desc: "在造物调试台中，额外获得 5 点可使用热量" },
  xile: { id: "xile", name: "喜乐熏香", star: 2, desc: "获得时获得 2 个随机方程；首领区域战斗时每有 1 个未展开方程，敌方生命与攻击 +40%" },
  haimian: { id: "haimian", name: "海绵王", star: 2, desc: "每进入一个区域全队损失 80% 当前生命，生命上限 +10%（4 次后损毁，上限加成保留）" },
  fuhua: { id: "fuhua", name: "腐化异木果实", star: 2, desc: "角色抵抗所有控制类负面效果，每次抵抗消耗 20% 生命上限的生命" },
  lixing: { id: "lixing", name: "理性的溃败", star: 2, desc: "获得时立即获得 3 个不同命运的随机 1 星祝福各 1 个" },
  renzao: { id: "renzao", name: "人造陨石球", star: 2, desc: "获得时立即获得 1-3 个拥有祝福数量最多的命运的祝福" },
  xugou: { id: "xugou", name: "虚构机兵", star: 2, desc: "角色回合开始时，回复其生命上限 20% 的生命值" },
  huanzhe: { id: "huanzhe", name: "患者面具", star: 2, desc: "将所有祝福替换为随机祝福，强化情况保留，有概率替换为更高稀有度" },
  tiancai: { id: "tiancai", name: "天才俱乐部普通八卦", star: 2, desc: "获得碎片时额外获得 50%，但战斗结束无法再获取祝福" },
  shanyao: { id: "shanyao", name: "闪耀的偏方三八面骰", star: 2, desc: "获得后将所有奇物替换为随机奇物" },
  fenlie_jb: { id: "fenlie_jb", name: "分裂金币", star: 2, desc: "每进入下一区域，获得当前持有碎片 5% 的碎片" },
  fujiao: { id: "fujiao", name: "福灵胶", star: 2, desc: "战斗胜利后额外获得 1 个 3 星祝福（1 次后损毁）" },
  jiangwei: { id: "jiangwei", name: "降维骰子", star: 2, desc: "战斗胜利后可额外选择 1 次祝福，但选项减少 1 个（2 次战斗后损毁）" },
  louti: { id: "louti", name: "「楼梯上的水母」", star: 2, desc: "失去所有祝福，按失去祝福的星级之和获得碎片（每星级 80 碎片）" },
  xiee: { id: "xiee", name: "邪恶机械卫星#900", star: 2, desc: "商品价格降低 25%" },
  kongwu: { id: "kongwu", name: "空无烛剪", star: 2, desc: "获得后随机修复最多 2 个已损毁的 1-3 星奇物，剩余次数恢复初始" },
  xinyang: { id: "xinyang", name: "信仰债券", star: 2, desc: "覆写祝福、覆写方程以及复活角色所需的碎片数量降低 30%" },
  kaituo: { id: "kaituo", name: "开拓火漆", star: 2, desc: "获得时随机获得每个命运的祝福各 1 个；获得方程时获得 3 个所需祝福（每区域 1 次）" },
  chuiyu: { id: "chuiyu", name: "垂语果实", star: 2, desc: "立即获得 1 个随机祝福；失去后再次获得并使奖励祝福 +1（最多 4 个）" },
  zhizun: { id: "zhizun", name: "至尊胶", star: 2, desc: "获得祝福时有 10% 概率再随机获得 1 个 1-2 星祝福（最多 5 个）" },
  jingshen: { id: "jingshen", name: "精神感应餐叉", star: 2, desc: "失去祝福时获得 50 宇宙碎片" },
  zhenshi: { id: "zhenshi", name: "真实机兵", star: 2, desc: "失去奇物时获得 75 宇宙碎片" },
  mori: { id: "mori", name: "末日复眼·先行版", star: 2, desc: "获得时获得 3 个拥有祝福数量最多的命运的祝福；覆写消耗提高 1000%" },
  wuren: { id: "wuren", name: "无人通讯", star: 2, desc: "奇物损毁时使其恢复如新（触发 2 次后损毁）" },
  aruan: { id: "aruan", name: "阿阮袋", star: 2, desc: "立即获得 3 个随机祝福；战斗胜利后选择祝福时选项变为 1（2 次战斗后损毁）" },
  chunmei: { id: "chunmei", name: "纯美骑士精神", star: 2, desc: "获得时获得 1 个随机方程" },
  silver: { id: "silver", name: "分裂银币", star: 2, desc: "立即获得当前持有宇宙碎片 40% 的宇宙碎片" },
  lens: { id: "lens", name: "时空棱镜", star: 2, desc: "所有角色技能等级提高 2 级" },
  shuishang: { id: "shuishang", name: "水上书", star: 2, desc: "进入区域时，全队回复全部生命，并重置所有无法战斗的角色" },
  // ── 3 星 ──
  jingque: { id: "jingque", name: "精确优雅的代码", star: 3, desc: "进入战斗时防御/攻击/生命上限 +35%，攻击后对随机目标造成 350% 攻击力的附加伤害" },
  xugao: { id: "xugao", name: "虚高一丈", star: 3, desc: "获得 1/2/3 星奇物时获得 20/40/120 碎片；每有 1 个 1/2/3 星奇物，战斗伤害 +3%/6%/20%" },
  yusi: { id: "yusi", name: "与死重逢", star: 3, desc: "立即获得 1 个当前无法展开的方程；每展开 1 个方程后获得 1 个随机无法展开方程（最多 3 个）；每有 1 个展开方程，全队伤害 +10%" },
  wenyi: { id: "wenyi", name: "瘟疫巢都", star: 3, desc: "立即获得 4 个随机负面奇物；进入区域时随机失去最多 2 个负面奇物并获得等量祝福；每因此失去 1 个负面奇物，战斗伤害 +10%" },
  jiyi: { id: "jiyi", name: "记忆轮", star: 3, desc: "立即获得 2 个随机方程；每进入区域时将方程置换为随机同星级方程；进入战斗时获得所有未展开方程的效果" },
  jiazu: { id: "jiazu", name: "家族缘结", star: 3, desc: "立即获得 2 个可损毁奇物；奇物损毁时获得 1 个可损毁奇物；每有 1 个已损毁奇物，战斗伤害 +30%" },
  chunmei_pao: { id: "chunmei_pao", name: "纯美之袍", star: 3, desc: "进入战斗时每有 100 碎片全队伤害 +20%；进入战斗/精英/首领区域时获得当前碎片 10% 的碎片" },
};

/** 奇物效果数值映射（集中声明，逻辑层只查表不硬编码） */
export const CURIO_FX = {
  posui: { shardsCut: 0.25 },
  yongdong: { shardsPct: 4 },
  kuaile: { cost: 25 },
  bobo: { regions: 3, hpPct: 99 },
  gongsi: { priceMult: 1.25 },
  zhongdeng: { priceMult: 1.25 },
  heisenlin: { tauntTurns: 5 },
  bushu: { optionCut: 1 },
  zhongduan: { gain: 75, triggers: 3, lv: { gain: [75, 85, 95, 105, 115, 125, 135, 145] } },
  dabinggan: { triggers: 2, starRange: [1, 2], lv: { count: [1, 2, 3, 4, 5, 6] } },
  eye: { cost: 50, gainStar: 3 },
  anhai: { gainPct: 15, lossPct: 10, battles: 3, lv: { gainPct: [15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51], lossPct: [10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46, 49] } },
  shui: { shardsMax: 10, gain: 400, lv: { gain: [400, 420, 440, 460, 480, 500] } },
  lieyang: { gain: 30, lv: { gain: [30, 35, 40, 45, 50, 55] } },
  wulian: { minCurios: 4, loseCount: 3 },
  wuxian: { maxHpMult: 20, lv: { maxHpMult: [20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80] } },
  zhutie: { shardsMult: 1.3, priceMult: 1.3, lv: { shardsMult: [1.3, 1.32, 1.34, 1.36, 1.38, 1.4, 1.42, 1.44, 1.46, 1.48] } },
  adaptive: { minPct: 10, maxPct: 200 },
  jidong: { shardsCut: 0.5, overwriteFree: true, overwriteCap: 7 },
  liangzi: { gain: 400, lv: { gain: [400, 450, 500, 550, 600, 650] } },
  jixian: { battleGain: 35, softLoss: 35, chainGain: 35, lv: { battleGain: [35, 40, 45, 50, 55], softLoss: [35, 40, 45, 50, 55], chainGain: [35, 40, 45, 50, 55] } },
  yinhe: { hpPct: 99, lv: { hpPct: [99, 94, 89, 84, 79, 74, 69, 64, 59] } },
  linji: { gain: 300, regions: 5, penalty: 450, lv: { gain: [300, 310, 320, 330, 340, 350] } },
  heping: { gain: 150, lv: { gain: [150, 160, 170, 180, 190, 200] } },
  wanxiang: { count: 2, lv: { count: [2, 3, 4, 5, 6] } },
  boshi: { atkMult: 25, needStar: 3, lv: { atkMult: [25, 28, 31, 34, 37, 40] } },
  club: { shardsMult: 1.4, lv: { shardsMult: [1.4, 1.42, 1.44, 1.46, 1.48, 1.5] } },
  sheep: { hpPct: 30, lv: { hpPct: [30, 32, 34, 36, 38, 40] } },
  cheese: { healPct: 100 },
  yueqian: {},
  zuotian: { gain: 35, triggers: 3, lv: { gain: [35, 45, 55, 65, 75, 85] } },
  juedui: { count: 2, lv: { count: [2, 3, 4, 5] } },
  maidi: { winPoints: [3, 6, 9], gains: [50, 150, 250] },
  youmeng: { atkMult: 50, turns: 15, laterDmgPct: 10, lv: { atkMult: [50, 52, 54, 56, 58, 60], laterDmgPct: [10, 12, 14, 16, 18, 20] } },
  lubeite: { gain: 50, cap: 750, penalty: 750, lv: { gain: [50, 60, 70, 80, 90, 100, 110, 120, 130, 140] } },
  caikuang: { triggers: 5, starRange: [1, 2], lv: { count: [1, 2, 3, 4, 5] } },
  canjing_lm: { atkPerStar: 2.5, lv: { atkPerStar: [2.5, 3, 3.5, 4, 4.5, 5] } },
  canjing_lx: { atkPerStar: 2.5, lv: { atkPerStar: [2.5, 3, 3.5, 4, 4.5, 5] } },
  canjing_fz: { atkPerStar: 2.5, lv: { atkPerStar: [2.5, 3, 3.5, 4, 4.5, 5] } },
  shijin: { gain: 500, regions: 5, minShards: 500, lv: { gain: [500, 520, 540, 560, 580, 600] } },
  hepingxiang: { maxTriggers: 4, minStar: 2, lv: { count: [1, 2, 3, 4, 5] } },
  luck: { floor: 250, lv: { floor: [250, 270, 290, 310, 330, 350] } },
  huacheng: { heat: 5, lv: { heat: [5, 6, 7, 8, 9, 10] } },
  xile: {},
  haimian: { hpCut: 0.8, maxHpMult: 10, triggers: 4, lv: { maxHpMult: [10, 12, 14, 16, 18, 20] } },
  fuhua: { hpCostPct: 20, lv: { hpCostPct: [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10] } },
  lixing: { count: 3 },
  renzao: { max: 3 },
  xugou: { healPct: 20, lv: { healPct: [20, 21, 22, 23, 24, 25] } },
  huanzhe: {},
  tiancai: { shardsMult: 1.5, lv: { shardsMult: [1.5, 1.52, 1.54, 1.56, 1.58, 1.6] } },
  shanyao: {},
  fenlie_jb: { shardsPct: 5, lv: { shardsPct: [5, 6, 7, 8, 9, 10] } },
  fujiao: { blessingStar: 3 },
  jiangwei: { triggers: 2, extraPick: 1 },
  louti: { shardsPerStar: 80, lv: { shardsPerStar: [80, 82, 84, 86, 88, 90] } },
  xiee: { priceCut: 0.75, lv: { priceCut: [0.75, 0.73, 0.71, 0.69, 0.67, 0.65, 0.63, 0.61, 0.59, 0.57, 0.55, 0.53, 0.51, 0.5] } },
  kongwu: { fixCount: 2, lv: { fixCount: [2, 3, 4, 5, 6] } },
  xinyang: { costCut: 0.7, lv: { costCut: [0.7, 0.68, 0.66, 0.64, 0.62, 0.6, 0.58, 0.56, 0.54, 0.52, 0.5] } },
  kaituo: {},
  chuiyu: { maxExtra: 4, lv: { count: [1, 2, 3, 4] } },
  zhizun: { chance: 0.1, maxExtra: 5, lv: { chance: [0.1, 0.12, 0.14, 0.16, 0.18, 0.2] } },
  jingshen: { gain: 50, lv: { gain: [50, 60, 70, 80, 90, 100] } },
  zhenshi: { gain: 75, lv: { gain: [75, 85, 95, 105, 115, 125] } },
  mori: { priceMult: 11, count: 2, lv: { count: [2, 3, 4, 5, 6] } },
  wuren: { triggers: 2, lv: { triggers: [2, 3, 4, 5] } },
  aruan: { triggers: 2, lv: { count: [3, 4, 5, 6] } },
  chunmei: { lv: { count: [1, 2, 3] } },
  silver: { shardsPct: 40, lv: { shardsPct: [40, 42, 44, 46, 48, 50] } },
  lens: { skillUp: 2, lv: { skillUp: [2, 3, 4, 5] } },
  shuishang: {},
  jingque: { atkDefHpPct: 35, lv: { atkDefHpPct: [35, 38, 41, 44, 47, 50] } },
  xugao: { shardsByStar: [20, 40, 120], atkByStar: [3, 6, 20] },
  yusi: { atkPerEquation: 10, lv: { atkPerEquation: [10, 14, 18, 22, 26, 30] } },
  wenyi: { negativeCount: 4, atkPerLost: 10, lv: { atkPerLost: [10, 14, 18, 22, 26, 30] } },
  jiyi: {},
  jiazu: { atkPerBroken: 30, lv: { atkPerBroken: [30, 33, 36, 39, 42, 45] } },
  chunmei_pao: { atkPer100: 20, shardsPct: 10, lv: { atkPer100: [20, 22, 24, 26, 28, 30] } },
};;


/** 随机 1 个奇物（excludeNegative 排除负面） */
export function rollCurio(excludeNegative = false, minStar = 1, maxStar = 3) {
  const pool = Object.values(CURIOS).filter(
    (c) => (!excludeNegative || !c.negative) && c.star >= minStar && c.star <= maxStar,
  );
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/** 获得奇物：已有未损毁则强化；已损毁则恢复如新重新获得；部分奇物获得时立即生效 */
export function gainCurio(state, id, opts = {}) {
  const c = CURIOS[id];
  if (!c) return { ok: false, reason: "无此奇物" };
  // 分裂咕咕钟：达到 3 个时无法再获得
  if (id === "fenlie") {
    const have = state.curios.find((x) => x.id === "fenlie");
    if (have && !have.broken && (have.enhanced || 1) >= 3) {
      return { ok: false, reason: "分裂咕咕钟已达上限（3 个）" };
    }
  }
  const exist = state.curios.find((x) => x.id === id);
  if (exist) {
    if (exist.broken) {
      // 已损毁 → 重新获得（恢复如新，可再次强化）
      exist.broken = false;
      exist.enhanced = 1;
      for (const k of Object.keys(exist)) {
        if (k !== "id" && k !== "star" && k !== "enhanced" && k !== "broken") delete exist[k];
      }
      if (!opts.silent) state.log.push(`奇物「${c.name}」重新获得（恢复如新）`);
      return { ok: true, reobtained: true, silent: opts.silent };
    }
    exist.enhanced = (exist.enhanced || 1) + 1;
    state.log.push(`奇物「${c.name}」强化至 ×${exist.enhanced}`);
    return { ok: true, enhanced: exist.enhanced, silent: opts.silent };
  }
  state.curios.push({ id, star: c.star, enhanced: 1, broken: false });
  if (!opts.silent) state.log.push(`获得奇物「${c.name}」`);
  // 空无烛剪：获得后随机修复 2 个已损毁奇物（剩余次数恢复初始）
  if (id === "kongwu") {
    const brokenIds = state.curios.filter((x) => x.broken).map((x) => x.id);
    const fixCount = Math.min(curioVal(state, "kongwu", "fixCount"), brokenIds.length);
    for (let i = 0; i < fixCount; i++) {
      const bid = brokenIds[i];
      const target = state.curios.find((x) => x.id === bid);
      if (target) {
        target.broken = false;
        target.enhanced = 1;
        for (const k of Object.keys(target)) {
          if (k !== "id" && k !== "star" && k !== "enhanced" && k !== "broken") delete target[k];
        }
        state.log.push(`空无烛剪：修复「${CURIOS[bid]?.name}」`);
      }
    }
  }
  // 虚高一丈：获得 1/2/3 星奇物时获得 20/40/120 碎片
  const xugao = state.curios.find((x) => x.id === "xugao");
  if (id !== "xugao" && xugao && !xugao.broken) {
    const shardsByStar = CURIO_FX.xugao?.shardsByStar || [20, 40, 120];
    const gain = shardsByStar[c.star - 1] || 0;
    if (gain > 0) {
      state.shards += gain;
      state.log.push(`虚高一丈：+${gain} 宇宙碎片`);
    }
  }
  // 时空棱镜：所有角色技能等级 +N（最多 5 级提升，最多 10 级）
  if (id === "lens") {
    const up = curioVal(state, "lens", "skillUp");
    for (const t of state.team) {
      if (t.charId !== 11) t.skillLevel = Math.min(10, t.skillLevel + up);
    }
    state.log.push(`时空棱镜：全队技能等级 +${up}`);
  }
  // 分裂银币：立即获得当前碎片 40%（强化 +2/级）
  if (id === "silver") {
    const gain = Math.ceil(state.shards * (curioVal(state, "silver", "shardsPct") / 100));
    state.shards += gain;
    state.log.push(`分裂银币：+${gain} 宇宙碎片`);
  }
  // 失金爪锚：+500（强化只强化立即获得）
  if (id === "shijin") {
    state.shards += curioVal(state, "shijin", "gain");
    state.log.push("失金爪锚：+碎片");
  }
  // 临时赌资：+300（强化 +10/级）
  if (id === "linji") {
    state.shards += curioVal(state, "linji", "gain");
    state.log.push("临时赌资：+碎片");
  }
  // 自适应礼品盒：失去全部碎片，获得 10%-200% 随机
  if (id === "adaptive") {
    const lost = state.shards;
    const minP = CURIO_FX.adaptive?.minPct || 10;
    const maxP = CURIO_FX.adaptive?.maxPct || 200;
    const pct = (minP + Math.random() * (maxP - minP)) / 100;
    state.shards = Math.ceil(lost * pct);
    state.log.push(`自适应礼品盒：失去 ${lost}，获得 ${state.shards}`);
  }
  // 万象无常骰：强化 N 个随机祝福（2→3→4→5）
  if (id === "wanxiang") {
    const count = curioVal(state, "wanxiang", "count");
    for (let i = 0; i < count && state.blessings.length; i++) {
      const b = state.blessings[Math.floor(Math.random() * state.blessings.length)];
      b.heatEnhanced = (b.heatEnhanced || 1) + 1;
    }
  }
  // 理性的溃败：3 个不同命运的 1 星祝福
  if (id === "lixing") {
    const fates = ["存护", "丰饶", "智识", "毁灭", "繁育", "虚无"];
    for (const f of fates) {
      const pool = Object.values(BLESSINGS).filter((b) => b.star === 1 && b.fate === f);
      if (pool.length) {
        const b = pool[Math.floor(Math.random() * pool.length)];
        gainBlessing(state, b.id, { silent: true });
      }
    }
  }
  // 纯美骑士精神：1 个随机方程
  if (id === "chunmei" || id === "yusi") {
    const eq = rollEquation(1, 3);
    if (eq) gainEquation(state, eq);
  }
  // 喜乐熏香：2 个随机方程
  if (id === "xile" || id === "jiyi") {
    for (let i = 0; i < 2; i++) {
      const eq = rollEquation(1, 3);
      if (eq) gainEquation(state, eq);
    }
  }
  // 阿阮袋（3→6 个）/ 垂语果实（1→4 个）：立即随机祝福；开拓火漆每命途 1 个
  if (id === "aruan" || id === "chuiyu" || id === "kaituo") {
    const count = id === "aruan" ? curioVal(state, "aruan", "count") : id === "chuiyu" ? curioVal(state, "chuiyu", "count") : 1;
    for (let i = 0; i < count; i++) {
      const b = rollBlessing(1, 3);
      if (b) gainBlessing(state, b, { silent: true });
    }
  }
  // 纯美骑士精神：获得 1-3 个随机方程（1→2→3）
  if (id === "chunmei") {
    const count = curioVal(state, "chunmei", "count");
    for (let i = 0; i < count; i++) {
      const eq = rollEquation(1, 3);
      if (eq) gainEquation(state, eq);
    }
  }
  // 开拓火漆：每个命运 1 个祝福
  if (id === "kaituo") {
    const fates = ["存护", "丰饶", "智识", "毁灭", "繁育", "虚无"];
    for (const f of fates) {
      const pool = Object.values(BLESSINGS).filter((b) => b.fate === f);
      if (pool.length) {
        const b = pool[Math.floor(Math.random() * pool.length)];
        gainBlessing(state, b.id, { silent: true });
      }
    }
  }
  // 楼梯上的水母：失去全部祝福转碎片（按星级之和，每星级 80；强化不重复计星）
  if (id === "louti") {
    const starSum = state.blessings.reduce((a, b) => a + (b.star || 1), 0);
    state.blessings = [];
    state.shards += starSum * curioVal(state, "louti", "shardsPerStar");
    state.log.push("楼梯上的水母：祝福转碎片");
  }
  // 患者面具：祝福全换（保留强化）
  if (id === "huanzhe") {
    state.blessings = state.blessings.map((b) => {
      const pool = blessingPool(1, 3);
      const next = pool[Math.floor(Math.random() * pool.length)];
      return { id: next.id, star: next.star, enhanced: b.enhanced || 1, heatEnhanced: b.heatEnhanced };
    });
  }
  // 闪耀骰：奇物全换
  if (id === "shanyao") {
    state.curios = state.curios.map((c) => {
      const pool = Object.values(CURIOS);
      const next = pool[Math.floor(Math.random() * pool.length)];
      return { id: next.id, star: next.star, enhanced: c.enhanced || 1, broken: false };
    });
  }
  // 绝对自灭药膏：+N 随机祝福 -N 随机祝福（2→3→4→5，最多 5）
  if (id === "juedui") {
    const count = curioVal(state, "juedui", "count");
    for (let i = 0; i < count; i++) {
      const b = rollBlessing(1, 3);
      if (b) gainBlessing(state, b, { silent: true });
    }
    for (let i = 0; i < count && state.blessings.length; i++) {
      state.blessings.splice(Math.floor(Math.random() * state.blessings.length), 1);
    }
  }
  // 末日复眼·先行版（2→6 个）/ 人造陨石球（1-3 个）：获得拥有祝福数量最多的命途的祝福
  if (id === "mori" || id === "renzao") {
    const count = id === "mori" ? curioVal(state, "mori", "count") : Math.max(1, Math.ceil(Math.random() * (CURIO_FX.renzao?.max || 3)));
    const fateCounts = {};
    for (const b of state.blessings) {
      const f = BLESSINGS[b.id]?.fate;
      if (f) fateCounts[f] = (fateCounts[f] || 0) + 1;
    }
    const maxCount = Object.keys(fateCounts).length ? Math.max(...Object.values(fateCounts)) : 0;
    const topFates = Object.entries(fateCounts).filter(([, n]) => n === maxCount).map(([f]) => f);
    const pool = Object.values(BLESSINGS).filter(
      (b) => (topFates.length ? topFates.includes(b.fate) : true) && !state.blessings.some((x) => x.id === b.id),
    );
    for (let i = 0; i < count && pool.length; i++) {
      const b = pool[Math.floor(Math.random() * pool.length)];
      gainBlessing(state, b.id, { silent: true });
      pool.splice(pool.indexOf(b), 1);
    }
    state.log.push(`${id === "mori" ? "末日复眼" : "人造陨石球"}：获得 ${Math.min(count, pool.length + (pool.length ? 0 : 0))} 个最多命途祝福`);
  }
  // 瘟疫巢都：4 个随机负面奇物
  if (id === "wenyi") {
    const negatives = Object.values(CURIOS).filter((c) => c.negative);
    for (let i = 0; i < 4 && negatives.length; i++) {
      const n = negatives[Math.floor(Math.random() * negatives.length)];
      if (!state.curios.some((x) => x.id === n.id)) gainCurio(state, n.id, { silent: true });
    }
  }
  return { ok: true, star: c.star, silent: opts.silent };
}

/** 随机失去 1 个奇物（事件用）；监督之眼失去时获得 1 个随机 3 星奇物 */
export function loseRandomCurio(state) {
  if (state.curios.length === 0) return null;
  const idx = Math.floor(Math.random() * state.curios.length);
  const [removed] = state.curios.splice(idx, 1);
  state.log.push(`失去奇物「${CURIOS[removed.id]?.name ?? removed.id}」`);
  // 真实机兵：失去奇物时 +75 碎片
  const zhenshi = state.curios.find((c) => c.id === "zhenshi");
  if (zhenshi && !zhenshi.broken) {
    state.shards += 75;
    state.log.push("真实机兵：+75 碎片");
  }
  // 监督之眼：失去时获得 1 个随机 3 星奇物
  if (removed.id === "eye") {
    const pool = Object.values(CURIOS).filter((c) => c.star === 3);
    if (pool.length) {
      const next = pool[Math.floor(Math.random() * pool.length)];
      gainCurio(state, next.id);
    }
  }
  return removed;
}

// ================= 奇物机制（损毁 / 失去 / 强化查表） =================

/**
 * 损毁奇物：效果消失但保留在背包（broken=true，UI 显示「已损毁」），后续可再次获得。
 * 触发「烈阳之舞」（损毁时 +30 碎片）与「无人通讯」（恢复如新）。
 */
export function breakCurio(state, id, silent = false) {
  const c = state.curios?.find((x) => x.id === id);
  if (!c || c.broken) return false;
  c.broken = true;
  if (!silent) state.log.push(`奇物「${CURIOS[id]?.name || id}」已损毁`);
  // 烈阳之舞：每次有奇物损毁时，获得 30 宇宙碎片
  const lieyangFx = CURIO_FX.lieyang;
  if (lieyangFx && !c.negative && state.curios.some((x) => x.id === "lieyang" && !x.broken)) {
    state.shards += lieyangFx.gain || 30;
    state.log.push("烈阳之舞：+30 宇宙碎片");
  }
  // 无人通讯：奇物损毁时使其恢复如新（触发 2 次后失去自身）
  const wuren = state.curios.find((x) => x.id === "wuren");
  if (wuren && !wuren.broken) {
    wuren.triggers = (wuren.triggers || 0) + 1;
    if (wuren.triggers >= (CURIO_FX.wuren?.triggers || 2)) {
      loseCurio(state, "wuren", true);
      state.log.push("无人通讯：次数用尽，失去自身");
    } else {
      c.broken = false; // 恢复如新
      state.log.push("无人通讯：奇物恢复如新");
      return true;
    }
  }
  // 家族缘结：奇物损毁时，再获得 1 个可损毁奇物（不递归触发）
  const jiazuFx = CURIO_FX.jiazu;
  if (jiazuFx && state.curios.some((x) => x.id === "jiazu" && !x.broken)) {
    const pool = Object.values(CURIOS).filter((x) => !x.negative && x.star >= 1 && x.star <= 3 && x.desc?.includes("损毁"));
    if (pool.length) {
      const next = pool[Math.floor(Math.random() * pool.length)];
      if (next.id !== id) gainCurio(state, next.id, { silent: true });
    }
  }
  return true;
}

/** 失去奇物：从背包移除（效果消失，可再次获得；触发真实机兵） */
export function loseCurio(state, id, silent = false) {
  const i = state.curios?.findIndex((x) => x.id === id);
  if (i == null || i < 0) return false;
  const [removed] = state.curios.splice(i, 1);
  if (!silent) state.log.push(`失去奇物「${CURIOS[id]?.name || id}」`);
  // 真实机兵：每次失去奇物时 +75 碎片（与失去几个无关；强化 +10/级）
  const zhenshi = state.curios.find((x) => x.id === "zhenshi");
  if (zhenshi && !zhenshi.broken) {
    state.shards += curioVal(state, "zhenshi", "gain");
    if (!silent) state.log.push("真实机兵：+碎片");
  }
  return true;
}

/** 奇物强化等级（1 级起，enhanced） */
export function curioLevel(state, id) {
  const c = state.curios?.find((x) => x.id === id && !x.broken);
  if (!c) return 0;
  return Math.max(1, c.enhanced || 1);
}

/**
 * 奇物强化后数值：CURIO_FX[id].lv[field] 序列查表（按 enhanced，超出按等差延伸）；
 * 无 lv 表回退 CURIO_FX[id][field]。
 */
export function curioVal(state, id, field) {
  const fx = CURIO_FX[id];
  if (!fx) return 0;
  const c = state.curios?.find((x) => x.id === id);
  if (!c || c.broken) return 0;
  const lv = Math.max(1, c.enhanced || 1);
  const table = fx.lv?.[field];
  if (table && table.length > 0) {
    if (lv <= table.length) return table[lv - 1];
    const step = table.length >= 2 ? table[1] - table[0] : 0;
    return table[table.length - 1] + step * (lv - table.length);
  }
  return fx[field] ?? 0;
}

// ================= 方程（第一版基础池，效果 M5 完整接入） =================

/** 方程数据表（全量：3×1星 + 5×2星 + 5×3星，fx = 数值参数） */
export const EQUATIONS = {
  shouzu: { id: "shouzu", name: "受诅教师", star: 1, fate: "毁灭", desc: "每消灭 1 名敌人，本场战斗伤害 +20%（最多 3 层）", fx: { atkPerKill: 20, maxStacks: 3 }, require: { "毁灭": 2, "智识": 2 } },
  huanxin: { id: "huanxin", name: "换心魔", star: 1, fate: "毁灭", desc: "生命上限 +40%；进入战斗对敌全体造成第一位角色生命上限 20% 的伤害", fx: { maxHpMult: 40, firstHpPct: 20 }, require: { "毁灭": 5 } },
  xingqiu: { id: "xingqiu", name: "行星碰碰车", star: 1, fate: "繁育", desc: "真实伤害提高 35%；敌方目标若处于持续伤害状态，额外提高 15%", fx: { atkMult: 5, dotAtkMult: 15 }, require: { "繁育": 2, "虚无": 2 } },
  chitu: { id: "chitu", name: "吃土绑架犯", star: 2, fate: "繁育", desc: "附加伤害和真实伤害的倍率提高 60%", fx: { atkMult: 10 }, require: { "繁育": 4, "毁灭": 2 } },
  zhedi: { id: "zhedi", name: "蛰虫帝", star: 2, fate: "繁育", desc: "施放终结技后，对随机敌人造成其 10% 生命上限的伤害", fx: { maxHpPct: 10 }, require: { "繁育": 4, "智识": 2 } },
  bingkuang: { id: "bingkuang", name: "冰霜巨人", star: 2, fate: "毁灭", desc: "受击后生命 <40% 时消耗 5 层战意，回复 25% 生命上限并使伤害提高 150% 持续 2 回合（每回合 1 次）", fx: { hpBelow: 40, zhanduCost: 5, healPct: 25, atkPct: 150, turns: 2 }, require: { "毁灭": 7 } },
  yiji: { id: "yiji", name: "遗迹魔法师", star: 2, fate: "智识", desc: "角色施放攻击后为「罐中脑」充能 8%", fx: { jarBrain: 8 }, require: { "智识": 4, "繁育": 2 } },
  chaoji: { id: "chaoji", name: "超级体育生", star: 2, fate: "智识", desc: "施放终结技后为「罐中脑」充能 30%；消灭敌方目标后充能 30%", fx: { jarBrainUlt: 30, jarBrainKill: 30 }, require: { "智识": 5 } },
  pingguo: { id: "pingguo", name: "苹果！苹果！", star: 3, fate: "毁灭", desc: "每 3 回合结束后对敌方全体造成 2000% 冰属性基础伤害", fx: { dmgMult: 20, every: 3 }, require: { "毁灭": 6, "智识": 4 } },
  xingzou: { id: "xingzou", name: "街道骑行官", star: 3, fate: "毁灭", desc: "我方累计发动 24 次攻击后，第一位角色获得额外回合（该回合攻击附加 160% 生命上限伤害）", fx: { every: 24, atkPct: 160 }, require: { "毁灭": 6, "繁育": 4 } },
  chumo: { id: "chumo", name: "除魔士", star: 3, fate: "智识", desc: "每 4 回合施放 1 次，使我方伤害提高 200%（该回合攻击后对 <25% 血敌人附加 20% 生命上限伤害）", fx: { every: 4, atkPct: 200, killHpPct: 25 }, require: { "智识": 6, "繁育": 4 } },
  mengmo: { id: "mengmo", name: "梦魔主", star: 3, fate: "毁灭", desc: "我方每次施放攻击，可造成各自生命上限与护盾之和 10% 的附加伤害", fx: { hpShieldPct: 10 }, require: { "毁灭": 10 } },
  ruchong: { id: "ruchong", name: "蠕行之蛇", star: 3, fate: "繁育", desc: "敌方全体受到的伤害提高 10%；第一回合我方额外造成原伤害 60% 的真实伤害", fx: { atkMult: 10, firstAtkMult: 60 }, require: { "繁育": 6, "虚无": 4 } },
};

/** 随机 1 个方程（minStar-maxStar） */
export function rollEquation(minStar = 1, maxStar = 3) {
  const pool = Object.values(EQUATIONS).filter((e) => e.star >= minStar && e.star <= maxStar);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/** 获得方程：重复 → 自动转化为宇宙碎片（文档注） */
export function gainEquation(state, id, opts = {}) {
  const eq = EQUATIONS[id];
  if (!eq) return { ok: false, reason: "无此方程" };
  if (state.equations.some((x) => x.id === id)) {
    const shards = EQUATION_DUPE_SHARDS[eq.star] || 0;
    state.shards += shards;
    state.log.push(`重复方程「${eq.name}」→ 转化为 ${shards} 宇宙碎片`);
    return { ok: true, dupe: true, shards, silent: opts.silent };
  }
  state.equations.push({ id, star: eq.star, enhanced: 1 });
  if (!opts.silent) state.log.push(`获得方程「${eq.name}」(${eq.star}星)`);
  // 换心魔：生命上限 +40%
  if (id === "huanxin") {
    for (const t of state.team) {
      t.maxHp = Math.ceil(t.maxHp * 1.4);
      t.hp = Math.min(t.hp, t.maxHp);
    }
    state.log.push("换心魔：全队生命上限 +40%");
  }
  // 破碎咕咕钟：展开 1 个方程后损毁
  if (state.curios?.some((c) => c.id === "posui" && !c.broken)) {
    const posui = state.curios.find((c) => c.id === "posui");
    posui.eqCount = (posui.eqCount || 0) + 1;
    if (posui.eqCount >= 1) {
      breakCurio(state, "posui");
      state.log.push("破碎咕咕钟：展开 1 个方程后损毁");
    }
  }
  // 和平箱：展开 1 个 2 星及以上方程后获得 1 个随机祝福（触发 4 次后损毁）
  if (eq.star >= 2 && state.curios?.some((c) => c.id === "hepingxiang" && !c.broken)) {
    const hp = state.curios.find((c) => c.id === "hepingxiang");
    const count = curioVal(state, "hepingxiang", "count");
    for (let i = 0; i < count; i++) {
      const b = rollBlessing(1, 3);
      if (b) gainBlessing(state, b, { silent: true });
    }
    hp.count2 = (hp.count2 || 0) + 1;
    state.log.push(`和平箱：展开方程，获得 ${count} 个随机祝福`);
    if (hp.count2 >= (CURIO_FX.hepingxiang?.maxTriggers || 4)) breakCurio(state, "hepingxiang");
  }
  // 与死重逢：每展开 1 个方程后获得 1 个随机方程（最多 3 个）；每有 1 个展开方程伤害 +10%
  if (state.curios?.some((c) => c.id === "yusi" && !c.broken)) {
    const ys = state.curios.find((c) => c.id === "yusi");
    ys.eqGain = (ys.eqGain || 0) + 1;
    if (ys.eqGain <= 3) {
      const next = rollEquation(1, 3);
      if (next && next !== id) {
        // 不递归触发（防无限）；用内部添加
        state.equations.push({ id: next, star: EQUATIONS[next].star, enhanced: 1 });
        state.log.push(`与死重逢：获得方程「${EQUATIONS[next].name}」`);
      }
    }
  }
  return { ok: true, star: eq.star, silent: opts.silent };
}
