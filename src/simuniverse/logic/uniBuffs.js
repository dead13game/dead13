// 模拟宇宙祝福系统 — 数据表 + 效果注册 + 强化规则 + 修正聚合
// 纯逻辑层，零依赖（设计文档 docs/simuniverse-design.md §9）
// 第一版基础池（M5 与用户确认名单后可扩充；奇物/方程在 M5）

import { LOG_TYPE } from "../../game/gameLogger.js";
import { EQUATION_DUPE_SHARDS } from "./uniConstants.js";

/** 祝福数据表（六命运，第一版 18 个：12×1星 + 4×2星 + 2×3星） */
export const BLESSINGS = {
  // ── 1 星 ──
  shaojie: { id: "shaojie", name: "构筑·哨戒", star: 1, fate: "存护", desc: "进入战斗时，所有角色获得抵消自身生命上限 16% 伤害的护盾" },
  mihe: { id: "mihe", name: "构筑·弥合", star: 1, fate: "存护", desc: "角色受到攻击时，获得等同于本次损失生命值 18% 的护盾" },
  fayu: { id: "fayu", name: "法雨", star: 1, fate: "丰饶", desc: "每拥有 1 个丰饶的祝福，角色生命上限提高 2 点（最多叠加 6 层）" },
  huisheng: { id: "huisheng", name: "回生", star: 1, fate: "丰饶", desc: "角色提供治疗后，回复等同于自身生命上限 12% 的生命值" },
  huiguang: { id: "huiguang", name: "回光效应", star: 1, fate: "丰饶", desc: "受到致命攻击时不会阵亡，回复至生命上限 1%（全队单场一次）" },
  weixing: { id: "weixing", name: "哨戒卫星", star: 1, fate: "毁灭", desc: "生命 ≤50% 时获得生命上限 20% 的护盾（每名角色单场一次）" },
  jiemo: { id: "jiemo", name: "结膜", star: 1, fate: "存护", desc: "角色施放普攻后，获得 3 张防御牌" },
  yanchi: { id: "yanchi", name: "延迟衍射的烛光", star: 1, fate: "智识", desc: "角色施放群攻技能后，造成的伤害提高 10%，持续 2 回合" },
  huagai: { id: "huagai", name: "金属斑驳的华盖", star: 1, fate: "智识", desc: "角色施放群攻技能后，获得 2 张防御牌" },
  luoke: { id: "luoke", name: "感知：螺壳的纹理", star: 1, fate: "存护", desc: "我方获得的护盾量提高 10%" },
  jifeng: { id: "jifeng", name: "感知：季风的故事", star: 1, fate: "繁育", desc: "我方全体造成的伤害提高 10%" },
  chaoxi: { id: "chaoxi", name: "感知：潮汐的故事", star: 1, fate: "丰饶", desc: "我方全体目标的回复量提高 10%" },
  chuanzhi: { id: "chuanzhi", name: "传质次星", star: 1, fate: "毁灭", desc: "生命降低或护盾减少后，生命上限提高 20%，持续 2 回合" },
  jianti: { id: "jianti", name: "晶体偏振的灯塔", star: 1, fate: "智识", desc: "我方目标开大后，生命上限提高 20%，持续 2 回合" },
  guangxue: { id: "guangxue", name: "光学引导的透镜", star: 1, fate: "智识", desc: "施放终结技时，回复等同于生命上限 20% 的生命值" },
  hongkuai: { id: "hongkuai", name: "宏块抹除的航路", star: 1, fate: "智识", desc: "我方目标施放终结技造成的伤害提高 20%" },
  chubei: { id: "chubei", name: "储备度规", star: 1, fate: "存护", desc: "进入战斗时，获得已损失生命值 36% 的护盾" },
  yanshou: { id: "yanshou", name: "延寿", star: 1, fate: "丰饶", desc: "进入战斗时，回复自身生命上限 24% 的生命值" },
  jianding: { id: "jianding", name: "构筑·坚定", star: 1, fate: "存护", desc: "持有护盾的角色受到的伤害降低 16%" },
  ganlu: { id: "ganlu", name: "甘露", star: 1, fate: "丰饶", desc: "角色的回复量提高 12%" },
  rangzai: { id: "rangzai", name: "禳灾", star: 1, fate: "丰饶", desc: "角色接受治疗后，获得 3 张防御牌" },
  juhuo: { id: "juhuo", name: "引燃的炬火", star: 1, fate: "智识", desc: "角色开大后的下一次攻击造成的伤害提高 50%" },
  luoqi: { id: "luoqi", name: "线圈编织的罗琦", star: 1, fate: "智识", desc: "角色开大后，回复等同于生命上限 16% 的生命值" },
  hongyi: { id: "hongyi", name: "轨道红移", star: 1, fate: "毁灭", desc: "角色生命上限提高 16%" },
  penliu: { id: "penliu", name: "双极喷流", star: 1, fate: "毁灭", desc: "我方目标受到的伤害降低 10%" },
  shouzhao: { id: "shouzhao", name: "感知：兽爪的形状", star: 1, fate: "繁育", desc: "我方全体造成的伤害提高 12%" },
  xuansi: { id: "xuansi", name: "悬丝", star: 1, fate: "繁育", desc: "角色普攻的伤害提高 30%" },
  gongpin: { id: "gongpin", name: "虚妄供品", star: 1, fate: "虚无", desc: "敌方目标每受到一次持续伤害，我方全体回复各自 2% 生命上限" },
  qingxu: { id: "qingxu", name: "情绪舍离", star: 1, fate: "虚无", desc: "敌方每承受 1 个持续伤害状态，受到的伤害提高 3%（最多 4 层）" },
  // ── 2 星 ──
  qiebian: { id: "qiebian", name: "星间构筑·切变结构", star: 2, fate: "存护", desc: "反震伤害提高 10%，并对相邻目标造成主目标 25% 的反震伤害" },
  huikui: { id: "huikui", name: "星间构筑·回馈庇护", star: 2, fate: "存护", desc: "回合结束时，有 80% 概率获得生命上限 15% 的护盾" },
  lingzhu: { id: "lingzhu", name: "星间构筑·四棱锥体", star: 2, fate: "存护", desc: "角色提供的护盾量提高 30%" },
  yagong: { id: "yagong", name: "星间构筑·亚共晶体", star: 2, fate: "存护", desc: "为我方提供护盾时，自身获得原护盾量 24% 的护盾（持续 2 回合）" },
  baoguang: { id: "baoguang", name: "宝光烛日月", star: 2, fate: "丰饶", desc: "提供治疗时，双方造成的伤害提高 20%，持续 1 回合" },
  yanli: { id: "yanli", name: "厌离邪秽苦", star: 2, fate: "繁育", desc: "施放攻击后，对目标造成其当前生命值 30% 的附加伤害" },
  mingche: { id: "mingche", name: "明澈琉璃身", star: 2, fate: "繁育", desc: "当前生命值等于生命上限时，受到的伤害降低 36%" },
  bore: { id: "bore", name: "大愿般若船", star: 2, fate: "丰饶", desc: "接受治疗后，额外回复等同于回复量 30% 的生命值" },
  yundi: { id: "yundi", name: "云镝逐步离", star: 2, fate: "繁育", desc: "每 30 回合后当前角色行动提前 100%（不可连续触发）" },
  feihong: { id: "feihong", name: "飞虹诛凿齿", star: 2, fate: "丰饶", desc: "消灭敌方目标后，回复自身生命上限 48%" },
  zainan: { id: "zainan", name: "灾难性共振", star: 2, fate: "毁灭", desc: "攻击时若处于战意效果，消耗当前生命 10%，对目标造成已损失生命 60% 的附加伤害" },
  yuzhao: { id: "yuzhao", name: "预兆性景深", star: 2, fate: "毁灭", desc: "每有 1 层战意，受到的伤害降低 1%" },
  baofa: { id: "baofa", name: "破坏性爆发", star: 2, fate: "毁灭", desc: "当前生命值百分比小于 50% 时，造成的伤害提高 40%" },
  shanbian: { id: "shanbian", name: "戒律性闪变", star: 2, fate: "丰饶", desc: "受到攻击后若生命小于 35%，回复生命上限 12%（单次行动最多 36%）" },
  weihai: { id: "weihai", name: "危害性余光", star: 2, fate: "智识", desc: "开大后，获得已损失生命值 25% 的护盾" },
  luonao: { id: "luonao", name: "裸脑质", star: 2, fate: "繁育", desc: "普攻伤害会对随机相邻单体造成原伤害 30% 的伤害" },
  cuihua: { id: "cuihua", name: "催化剂", star: 2, fate: "智识", desc: "终结技未施放攻击时，全队伤害提高 20% 持续 1 回合（最多叠加 3 次）" },
  yuxia: { id: "yuxia", name: "分析·阈下知觉", star: 2, fate: "智识", desc: "首次终结技伤害提高 50%" },
  chilun: { id: "chilun", name: "齿轮啮合的王座", star: 2, fate: "智识", desc: "每有 1 个「智识」祝福，终结技伤害提高 5%（最多 5 次）" },
  fangshe: { id: "fangshe", name: "放射性衰变", star: 2, fate: "毁灭", desc: "生命百分比低于 50% 时，受到的伤害降低 10%，回复量提高 20%" },
  feijian: { id: "feijian", name: "飞溅蛊", star: 2, fate: "繁育", desc: "普攻伤害会对相邻目标造成原伤害 10% 的伤害" },
  beiju: { id: "beiju", name: "悲剧讲座", star: 2, fate: "虚无", desc: "每次造成的持续伤害提高 1 点" },
  yiyi: { id: "yiyi", name: "意义质询", star: 2, fate: "虚无", desc: "陷入持续伤害状态的敌方目标造成的伤害降低 3 点" },
  // ── 3 星 ──
  shenxing: { id: "shenxing", name: "神性构筑·谐振传递", star: 3, fate: "存护", desc: "施放攻击时，对目标造成自身当前护盾量 100% 的反震伤害" },
  yifajie: { id: "yifajie", name: "丰饶众生，一法界心", star: 3, fate: "丰饶", desc: "角色提供治疗时，接受目标以外的队友回复回复量 30% 的生命" },
  fanwu: { id: "fanwu", name: "反物质费逆方程", star: 3, fate: "毁灭", desc: "生命小于 50% 时，视作拥有 16 层战意（伤害 +16%、受伤 -16%）" },
  huanyu: { id: "huanyu", name: "寰宇热寂特征数", star: 3, fate: "毁灭", desc: "受到攻击或消耗生命后获得 4 层战意，回合结束时失去 4 层" },
  yanmie: { id: "yanmie", name: "湮灭回归不等式", star: 3, fate: "繁育", desc: "受到攻击时，所受到的伤害由我方全体承担" },
  xingren: { id: "xingren", name: "SMR -2型杏仁核", star: 3, fate: "智识", desc: "使敌方目标受到致命伤害时，为「罐中脑」充能 50%" },
  richu: { id: "richu", name: "日出之前", star: 3, fate: "虚无", desc: "我方每次造成持续伤害时，回复等同于造成的持续伤害点数的生命" },
};

/** 命运列表（事件/商店按命运筛选用） */
export const FATES = ["存护", "丰饶", "智识", "毁灭", "繁育", "虚无"];

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
      t.maxHp = Math.floor(t.maxHp * 1.16);
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
  return removed;
}

/** 失去指定祝福（按数组下标） */
export function loseBlessingAt(state, idx) {
  if (idx < 0 || idx >= state.blessings.length) return null;
  const [removed] = state.blessings.splice(idx, 1);
  return removed;
}

/** 祝福强化倍数（重复获得 × enhanced，热量强化 × heatEnhanced） */
export function blessingMult(state, id) {
  const b = state.blessings.find((x) => x.id === id);
  return b ? (b.enhanced || 1) * (b.heatEnhanced || 1) : 0;
}

/**
 * 聚合所有祝福修正（M5 加入奇物/方程后扩展）。
 * @returns {{ atkMult, atkNormalMult, dmgTakenMult, healMult, shieldMult, maxHpMult }}
 */
export function getUniModifiers(state) {
  const mods = {
    atkMult: 0, // 全伤害 %
    atkNormalMult: 0, // 普攻额外 %
    dmgTakenMult: 0, // 受伤 %（正 = 减伤）
    healMult: 0,
    shieldMult: 0,
    maxHpMult: 0,
  };
  if (!state.blessings?.length) return mods;
  // 命运计数（法雨/齿轮王座）
  const fateCount = (f) => state.blessings.filter((b) => BLESSINGS[b.id]?.fate === f).length;
  const zhishuCount = fateCount("智识");
  const fengraoCount = fateCount("丰饶");
  for (const b of state.blessings) {
    const m = blessingMult(state, b.id);
    switch (b.id) {
      case "shouzhao": mods.atkMult += 12 * m; break;
      case "jifeng": mods.atkMult += 10 * m; break;
      case "hongkuai": mods.atkMult += 20 * m; break; // 终结技伤害（简化并入全伤害）
      case "chilun": mods.atkMult += 5 * Math.min(zhishuCount, 5) * m; break;
      case "xuansi": mods.atkNormalMult += 30 * m; break;
      case "penliu": mods.dmgTakenMult += 10 * m; break;
      case "fangshe":
        mods.dmgTakenMult += 10 * m; // 生命<50% 时（动态修正见 memberDmgTakenMods 兜底，这里给满值）
        break;
      case "ganlu": mods.healMult += 12 * m; break;
      case "chaoxi": mods.healMult += 10 * m; break;
      case "luoke": mods.shieldMult += 10 * m; break;
      case "lingzhu": mods.shieldMult += 30 * m; break;
      case "hongyi": mods.maxHpMult += 16 * m; break;
      case "fayu": mods.maxHpMult += 2 * Math.min(fengraoCount, 6) * m; break; // 每丰饶祝福 +2%（近似点数）
      case "qingxu": {
        // 敌方每持 1 个持续伤害状态，受伤 +3%（最多 4 层）
        const dotCount = state.combat?.enemies?.filter((e) => e.alive && e.dotTurns > 0).length ?? 0;
        mods.atkMult += 3 * Math.min(dotCount, 4) * m;
        break;
      }
      default:
        break;
    }
  }
  return mods;
}

/** 按成员血量/护盾/战意动态计算的额外攻击修正 */
export function memberAtkMods(state, memberIdx) {
  const t = state.team[memberIdx];
  if (!t) return 0;
  let extra = 0;
  if (blessingMult(state, "baofa") > 0 && t.hp / t.maxHp < 0.5) {
    extra += 40 * blessingMult(state, "baofa");
  }
  if (blessingMult(state, "fanwu") > 0 && t.hp / t.maxHp < 0.5) {
    extra += 16 * blessingMult(state, "fanwu");
  }
  // 战意：每层伤害 +1%
  extra += (t.status.zhandu || 0) * 1;
  return extra;
}

/** 按成员血量动态计算的受伤减伤 */
export function memberDmgTakenMods(state, memberIdx) {
  const t = state.team[memberIdx];
  if (!t) return 0;
  let extra = 0;
  if (blessingMult(state, "fanwu") > 0 && t.hp / t.maxHp < 0.5) {
    extra += 16 * blessingMult(state, "fanwu");
  }
  // 预兆性景深/战意：每层受伤 -1%
  extra += (t.status.zhandu || 0) * 1;
  // 明澈琉璃身：满血受伤 -36%
  if (blessingMult(state, "mingche") > 0 && t.hp >= t.maxHp) {
    extra += 36 * blessingMult(state, "mingche");
  }
  // 构筑·坚定：持盾受伤 -16%
  if (blessingMult(state, "jianding") > 0 && (t.shield > 0 || t.status.defensePile.length > 0)) {
    extra += 16 * blessingMult(state, "jianding");
  }
  // 放射性衰变：生命<50% 受伤 -10%（补偿 getUniModifiers 的满值）
  if (blessingMult(state, "fangshe") > 0 && t.hp / t.maxHp >= 0.5) {
    extra -= 10 * blessingMult(state, "fangshe");
  }
  return extra;
}

// ---- 事件钩子（需要结算上下文） ----

/** 战斗开始钩子：构筑·哨戒 → 全员 16% 生命上限护盾；储备度规 → 已损失 36% 护盾；延寿 → 回 24% */
export function triggerOnCombatStart(state) {
  const m1 = blessingMult(state, "shaojie");
  if (m1 > 0) {
    for (const t of state.team) {
      if (!t.alive) continue;
      t.shield += Math.floor(t.maxHp * 0.16 * m1);
    }
  }
  const m2 = blessingMult(state, "chubei");
  if (m2 > 0) {
    for (const t of state.team) {
      if (!t.alive) continue;
      t.shield += Math.floor((t.maxHp - t.hp) * 0.36 * m2);
    }
  }
  const m3 = blessingMult(state, "yanshou");
  if (m3 > 0) {
    for (const t of state.team) {
      if (!t.alive) continue;
      t.hp = Math.min(t.maxHp, t.hp + Math.floor(t.maxHp * 0.24 * m3));
    }
  }
}

/** 受到伤害后钩子：弥合回盾 / 戒律性闪变残血回复 / 传质次星生命上限 / 寰宇热寂战意 / 哨戒卫星半血护盾 */
export function triggerOnDamaged(state, memberIdx, hpLoss) {
  const t = state.team[memberIdx];
  if (!t) return;
  const m1 = blessingMult(state, "mihe");
  if (m1 > 0 && hpLoss > 0) {
    t.shield += Math.floor(hpLoss * 0.18 * m1);
  }
  const m2 = blessingMult(state, "shanbian");
  if (m2 > 0) {
    if (t.hp / t.maxHp < 0.35) {
      t.hp = Math.min(t.maxHp, t.hp + Math.floor(t.maxHp * 0.12 * m2));
    }
  }
  // 传质次星：生命上限 +20% 持续 2 回合
  const m3 = blessingMult(state, "chuanzhi");
  if (m3 > 0) {
    t.maxHp = Math.floor(t.maxHp * (1 + 0.2 * m3));
    t.status.maxHpBuffTurns = 2;
  }
  // 寰宇热寂特征数：受击获得 4 层战意（回合结束失去）
  const m4 = blessingMult(state, "huanyu");
  if (m4 > 0 && hpLoss > 0) {
    t.status.zhandu = (t.status.zhandu || 0) + 4 * m4;
  }
  // 哨戒卫星：生命 ≤50% 单场一次 20% 护盾
  const m5 = blessingMult(state, "weixing");
  if (m5 > 0 && t.hp / t.maxHp <= 0.5 && !t.status.weixingUsed) {
    t.status.weixingUsed = true;
    t.shield += Math.floor(t.maxHp * 0.2 * m5);
  }
}

/** 接受治疗后钩子：禳灾防御牌 / 大愿般若船额外回复 / 宝光烛日月双方增伤 */
export function triggerOnHeal(state, memberIdx, healAmount = 0) {
  const t = state.team[memberIdx];
  if (!t) return;
  const m1 = blessingMult(state, "rangzai");
  if (m1 > 0) {
    for (let i = 0; i < 3 * m1; i++) {
      t.status.defensePile.push({ value: 2, rank: "盾", suit: "♦" });
    }
  }
  const m2 = blessingMult(state, "bore");
  if (m2 > 0 && healAmount > 0) {
    t.hp = Math.min(t.maxHp, t.hp + Math.floor(healAmount * 0.3 * m2));
  }
  const m3 = blessingMult(state, "baoguang");
  if (m3 > 0) {
    t.status.dmgBuffPct = Math.max(t.status.dmgBuffPct || 0, 20 * m3);
    t.status.dmgBuffTurns = 1;
  }
}

/** 消灭敌人后钩子：飞虹诛凿齿回血 / SMR杏仁核罐中脑充能 */
export function triggerOnKill(state, memberIdx) {
  const m1 = blessingMult(state, "feihong");
  if (m1 > 0) {
    const t = state.team[memberIdx];
    t.hp = Math.min(t.maxHp, t.hp + Math.floor(t.maxHp * 0.48 * m1));
  }
  const m2 = blessingMult(state, "xingren");
  if (m2 > 0) {
    chargeJarBrain(state, 50 * m2);
  }
}

/** 开大后钩子：炬火/罗琦/光学透镜/危害性余光/晶体灯塔/阈下知觉/催化剂 */
export function triggerAfterSkill(state, charIndex) {
  const t = state.team[charIndex];
  if (!t) return;
  const m1 = blessingMult(state, "juhuo");
  if (m1 > 0) {
    t.status.nextAttackBoost = 50 * m1;
  }
  const m2 = blessingMult(state, "luoqi");
  if (m2 > 0) {
    t.hp = Math.min(t.maxHp, t.hp + Math.floor(t.maxHp * 0.16 * m2));
  }
  const m3 = blessingMult(state, "guangxue");
  if (m3 > 0) {
    t.hp = Math.min(t.maxHp, t.hp + Math.floor(t.maxHp * 0.2 * m3));
  }
  const m4 = blessingMult(state, "weihai");
  if (m4 > 0) {
    t.shield += Math.floor((t.maxHp - t.hp) * 0.25 * m4);
  }
  const m5 = blessingMult(state, "jianti");
  if (m5 > 0) {
    t.maxHp = Math.floor(t.maxHp * (1 + 0.2 * m5));
    t.status.maxHpBuffTurns = 2;
  }
  // 阈下知觉：首次终结技伤害 +50%（简化为下次攻击加成）
  const m6 = blessingMult(state, "yuxia");
  if (m6 > 0 && !state.uniFirstUltUsed) {
    state.uniFirstUltUsed = true;
    t.status.nextAttackBoost = (t.status.nextAttackBoost || 0) + 50 * m6;
  }
  // 催化剂：终结技后全队伤害 +20%（1 回合，最多 3 层）
  const m7 = blessingMult(state, "cuihua");
  if (m7 > 0) {
    for (const x of state.team) {
      x.status.dmgBuffPct = Math.min((x.status.dmgBuffPct || 0) + 20 * m7, 60 * m7);
      x.status.dmgBuffTurns = 1;
    }
  }
  // 罐中脑满 100%：开大后额外增强（简化：下次攻击 +100%，清零）
  if ((state.jarBrain || 0) >= 100) {
    t.status.nextAttackBoost = (t.status.nextAttackBoost || 0) + 100;
    state.jarBrain = 0;
    state.log.push("罐中脑能量释放：下次攻击伤害 +100%");
  }
}

/** 攻击后钩子：结膜防御牌 / 厌离邪秽苦附加伤害 / 神性谐振反震 / 灾难性共振 / 裸脑质·飞溅蛊溅射 */
export function triggerOnAttackAfter(state, memberIdx, targetEnemyId, baseDmg) {
  const t = state.team[memberIdx];
  if (!t) return;
  const c = state.combat;
  if (!c) return;
  const target = c.enemies.find((e) => e.id === targetEnemyId && e.alive);
  if (!target) return;
  // 结膜：普攻后 3 张防御牌
  const m1 = blessingMult(state, "jiemo");
  if (m1 > 0) {
    for (let i = 0; i < 3 * m1; i++) {
      t.status.defensePile.push({ value: 2, rank: "盾", suit: "♦" });
    }
  }
  // 厌离邪秽苦：对目标造成其当前生命 30% 附加伤害
  const m2 = blessingMult(state, "yanli");
  if (m2 > 0) {
    const extra = Math.floor(target.hp * 0.3 * m2);
    if (extra > 0) c._pendingExtra = (c._pendingExtra || 0) + extra;
  }
  // 神性谐振：对目标造成自身护盾量 100% 反震
  const m3 = blessingMult(state, "shenxing");
  if (m3 > 0 && t.shield > 0) {
    c._pendingExtra = (c._pendingExtra || 0) + Math.floor(t.shield * m3);
  }
  // 灾难性共振：战意 >0 时消耗 10% 当前生命，附加已损失 60%
  const m4 = blessingMult(state, "zainan");
  if (m4 > 0 && (t.status.zhandu || 0) > 0) {
    const cost = Math.floor(t.hp * 0.1);
    t.hp -= cost;
    const lost = t.maxHp - t.hp;
    c._pendingExtra = (c._pendingExtra || 0) + Math.floor(lost * 0.6 * m4);
  }
  // 裸脑质/飞溅蛊：普攻溅射随机相邻敌人
  const splash = blessingMult(state, "luonao") * 30 + blessingMult(state, "feijian") * 10;
  if (splash > 0) {
    const others = c.enemies.filter((e) => e.alive && e.id !== targetEnemyId);
    if (others.length > 0) {
      const vic = others[Math.floor(Math.random() * others.length)];
      c._pendingSplash = (c._pendingSplash || 0) + Math.floor(baseDmg * (splash / 100));
      c._splashTarget = vic.id;
    }
  }
}

/** 回合结束钩子：回馈庇护 80% 护盾 / 寰宇热寂失去战意 */
export function triggerOnEndTurn(state) {
  const m1 = blessingMult(state, "huikui");
  if (m1 > 0 && Math.random() < 0.8) {
    for (const t of state.team) {
      if (!t.alive) continue;
      t.shield += Math.floor(t.maxHp * 0.15 * m1);
    }
  }
  const m2 = blessingMult(state, "huanyu");
  if (m2 > 0) {
    for (const t of state.team) {
      t.status.zhandu = Math.max(0, (t.status.zhandu || 0) - 4 * m2);
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
  // 无限递归的代码：生命上限 +20%
  if (state.curios?.some((x) => x.id === "wuxian")) {
    for (const t of state.team) {
      t.maxHp = Math.floor(t.maxHp * 1.2);
      t.hp = Math.min(t.hp, t.maxHp);
    }
  }
  // 精确优雅的代码：防御/攻击/生命上限 +35%
  if (state.curios?.some((x) => x.id === "jingque")) {
    for (const t of state.team) {
      t.maxHp = Math.floor(t.maxHp * 1.35);
      t.status.atkBonus = (t.status.atkBonus || 0) + 5;
    }
  }
  // 永不停嘴的羊皮卷：敌方全体受 30% 生命上限固定伤害
  if (state.curios?.some((x) => x.id === "sheep")) {
    for (const e of c.enemies) {
      if (e.alive) {
        e.hp = Math.max(0, e.hp - Math.floor(e.maxHp * 0.3));
        if (e.hp <= 0) {
          e.alive = false;
          state.log.push(`羊皮卷：击败 ${e.name}`);
        }
      }
    }
  }
  // 博士之袍：拥有 3 星方程 → 全队伤害 +25%
  if (state.curios?.some((x) => x.id === "boshi") && state.equations?.some((e) => e.star === 3)) {
    for (const t of state.team) {
      t.status.dmgBuffPct = (t.status.dmgBuffPct || 0) + 25;
      t.status.dmgBuffTurns = 1;
    }
  }
  // 有梦-0110：全队伤害 +50%
  if (state.curios?.some((x) => x.id === "youmeng")) {
    for (const t of state.team) {
      t.status.dmgBuffPct = (t.status.dmgBuffPct || 0) + 50;
      t.status.dmgBuffTurns = 1;
    }
  }
  // 黑森林咕咕钟：随机 1 名我方目标被攻击概率大幅提高（简化：标记 5 回合）
  if (state.curios?.some((x) => x.id === "heisenlin")) {
    const alive = state.team.filter((t) => t.alive);
    if (alive.length) {
      const target = alive[Math.floor(Math.random() * alive.length)];
      target.status.taunt = 5;
      state.log.push(`黑森林咕咕钟：${target.name} 被标记为集火目标`);
    }
  }
}

/** 战斗胜利奇物钩子：埋点土（3/6/9 场）/ 阿阮袋 / 降维骰子 */
export function triggerCurioOnWin(state) {
  // 埋点土：3/6/9 场胜利 +50/150/250，9 场损毁
  const maidi = state.curios?.find((x) => x.id === "maidi");
  if (maidi) {
    maidi.wins = (maidi.wins || 0) + 1;
    const w = maidi.wins;
    let gain = 0;
    if (w === 3) gain = 50;
    else if (w === 6) gain = 150;
    else if (w >= 9) gain = 250;
    if (gain > 0) {
      state.shards += gain;
      state.log.push(`埋点土：+${gain} 碎片`);
    }
    if (w >= 9) {
      state.curios = state.curios.filter((x) => x.id !== "maidi");
      state.log.push("埋点土：损毁");
    }
  }
  // 阿阮袋：2 次战斗后损毁
  const aruan = state.curios?.find((x) => x.id === "aruan");
  if (aruan) {
    aruan.wins = (aruan.wins || 0) + 1;
    if (aruan.wins >= 2) {
      state.curios = state.curios.filter((x) => x.id !== "aruan");
      state.log.push("阿阮袋：损毁");
    }
  }
  // 降维骰子：2 次战斗后损毁
  const jiangwei = state.curios?.find((x) => x.id === "jiangwei");
  if (jiangwei) {
    jiangwei.wins = (jiangwei.wins || 0) + 1;
    if (jiangwei.wins >= 2) {
      state.curios = state.curios.filter((x) => x.id !== "jiangwei");
      state.log.push("降维骰子：损毁");
    }
  }
}

/** 敌方持续伤害结算后钩子：虚妄供品 → 全队回 2% 生命上限 */
export function triggerOnEnemyDot(state) {
  const m = blessingMult(state, "gongpin");
  if (m > 0) {
    for (const t of state.team) {
      if (!t.alive) continue;
      t.hp = Math.min(t.maxHp, t.hp + Math.floor(t.maxHp * 0.02 * m));
    }
  }
}

/** 治疗扩散（丰饶众生，一法界心）：治疗某成员时其他存活成员回 30% */
export function applyHealSpread(state, healerIdx, amount) {
  const m = blessingMult(state, "yifajie");
  if (m <= 0) return 0;
  let spread = 0;
  for (const t of state.team) {
    if (!t.alive || t.index === healerIdx) continue;
    const heal = Math.floor(amount * 0.3 * m);
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

/** 随机 1 个奇物（excludeNegative 排除负面） */
export function rollCurio(excludeNegative = false) {
  const pool = Object.values(CURIOS).filter((c) => !excludeNegative || !c.negative);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/** 获得奇物：已有则强化（×2、×3…）；部分奇物获得时立即生效 */
export function gainCurio(state, id, opts = {}) {
  const c = CURIOS[id];
  if (!c) return { ok: false, reason: "无此奇物" };
  const exist = state.curios.find((x) => x.id === id);
  if (exist) {
    exist.enhanced = (exist.enhanced || 1) + 1;
    state.log.push(`奇物「${c.name}」强化至 ×${exist.enhanced}`);
    return { ok: true, enhanced: exist.enhanced, silent: opts.silent };
  }
  state.curios.push({ id, star: c.star, enhanced: 1, broken: false });
  if (!opts.silent) state.log.push(`获得奇物「${c.name}」`);
  // 时空棱镜：所有角色技能等级 +2（最多 10 级）
  if (id === "lens") {
    for (const t of state.team) {
      if (t.charId !== 11) t.skillLevel = Math.min(10, t.skillLevel + 2);
    }
    state.log.push("时空棱镜：全队技能等级 +2");
  }
  // 分裂银币：立即获得当前碎片 40%
  if (id === "silver") {
    const gain = Math.floor(state.shards * 0.4);
    state.shards += gain;
    state.log.push(`分裂银币：+${gain} 宇宙碎片`);
  }
  // 失金爪锚：+500
  if (id === "shijin") {
    state.shards += 500;
    state.log.push("失金爪锚：+500 宇宙碎片");
  }
  // 临时赌资：+300
  if (id === "linji") {
    state.shards += 300;
    state.log.push("临时赌资：+300 宇宙碎片");
  }
  // 自适应礼品盒：失去全部碎片，获得 10%-200% 随机
  if (id === "adaptive") {
    const lost = state.shards;
    const pct = 0.1 + Math.random() * 1.9;
    state.shards = Math.floor(lost * pct);
    state.log.push(`自适应礼品盒：失去 ${lost}，获得 ${state.shards}`);
  }
  // 暗海碎饵：15% / -10% 随机
  if (id === "anhai") {
    if (Math.random() < 0.5) {
      state.shards += Math.floor(state.shards * 0.15);
    } else {
      state.shards = Math.max(0, state.shards - Math.floor(state.shards * 0.1));
    }
  }
  // 万象无常骰：强化 2 个随机祝福
  if (id === "wanxiang") {
    for (let i = 0; i < 2 && state.blessings.length; i++) {
      const b = state.blessings[Math.floor(Math.random() * state.blessings.length)];
      b.heatEnhanced = (b.heatEnhanced || 1) * 2;
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
  // 阿阮袋：3 个随机祝福
  if (id === "aruan" || id === "chuiyu" || id === "kaituo") {
    for (let i = 0; i < (id === "aruan" ? 3 : 1); i++) {
      const b = rollBlessing(1, 3);
      if (b) gainBlessing(state, b, { silent: true });
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
  // 楼梯上的水母：失去全部祝福转碎片（每星级 80）
  if (id === "louti") {
    const starSum = state.blessings.reduce((a, b) => a + (b.star || 1) * (b.enhanced || 1), 0);
    state.blessings = [];
    state.shards += starSum * 80;
    state.log.push(`楼梯上的水母：祝福转 ${starSum * 80} 碎片`);
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
  // 绝对自灭药膏：+2 随机祝福 -2 随机祝福
  if (id === "juedui") {
    for (let i = 0; i < 2; i++) {
      const b = rollBlessing(1, 3);
      if (b) gainBlessing(state, b, { silent: true });
    }
    for (let i = 0; i < 2 && state.blessings.length; i++) {
      state.blessings.splice(Math.floor(Math.random() * state.blessings.length), 1);
    }
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
  // 监督之眼：失去时获得 1 个随机 3 星奇物
  if (removed.id === "eye") {
    const pool = Object.values(CURIOS).filter((c) => c.star === 3);
    if (pool.length) {
      const next = pool[Math.floor(Math.random() * pool.length)];
      gainCurio(state, next.id);
    }
  }
  // 真实机兵：失去奇物时 +75 碎片
  if (state.curios.some((c) => c.id === "zhenshi")) {
    state.shards += 75;
    state.log.push("真实机兵：+75 碎片");
  }
  return removed;
}

// ================= 方程（第一版基础池，效果 M5 完整接入） =================

/** 方程数据表（4 个：1×1星 + 2×2星 + 1×3星） */
export const EQUATIONS = {
  shouzu: { id: "shouzu", name: "受诅教师", star: 1, fate: "毁灭", desc: "每消灭 1 名敌人，本场战斗伤害 +20%（最多 3 层）" },
  huanxin: { id: "huanxin", name: "换心魔", star: 1, fate: "毁灭", desc: "生命上限 +40%；进入战斗对敌全体造成第一位角色生命上限 20% 的伤害" },
  chitu: { id: "chitu", name: "吃土绑架犯", star: 2, fate: "繁育", desc: "附加伤害和真实伤害的倍率提高 60%" },
  zhedi: { id: "zhedi", name: "蛰虫帝", star: 2, fate: "繁育", desc: "施放终结技后，对随机敌人造成其 10% 生命上限的伤害" },
  pingguo: { id: "pingguo", name: "苹果！苹果！", star: 3, fate: "智识", desc: "每 3 回合结束后对敌方全体造成 2000% 基础伤害" },
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
      t.maxHp = Math.floor(t.maxHp * 1.4);
      t.hp = Math.min(t.hp, t.maxHp);
    }
    state.log.push("换心魔：全队生命上限 +40%");
  }
  return { ok: true, star: eq.star, silent: opts.silent };
}
