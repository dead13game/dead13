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

/** 奇物数据表（8 个：2 负面 + 4×1星 + 2×2星） */
export const CURIOS = {
  // 负面
  posui: { id: "posui", name: "破碎咕咕钟", star: 0, negative: true, desc: "战斗胜利后获得的宇宙碎片降低 25%" },
  yongdong: { id: "yongdong", name: "永动咕咕钟", star: 0, negative: true, desc: "每进入下一区域，失去 4% 当前持有的宇宙碎片" },
  // 1 星
  club: { id: "club", name: "俱乐部券", star: 1, desc: "战斗胜利后获得宇宙碎片提高 40%" },
  cheese: { id: "cheese", name: "香涎干酪", star: 1, desc: "战斗胜利后，全队回复 100% 生命" },
  eye: { id: "eye", name: "监督之眼", star: 1, desc: "进入区域后失去 50 宇宙碎片；失去该奇物时获得 1 个随机 3 星奇物" },
  peace: { id: "peace", name: "和平的代价", star: 1, desc: "进入商店区域时获得 150 宇宙碎片" },
  // 2 星
  fujiao: { id: "fujiao", name: "福灵胶", star: 2, desc: "战斗胜利后额外获得 1 个 3 星祝福（1 次后损毁）" },
  lens: { id: "lens", name: "时空棱镜", star: 2, desc: "所有角色技能等级提高 2 级" },
  luck: { id: "luck", name: "有形幸运", star: 2, desc: "进入区域时，若宇宙碎片小于 250，补足为 250" },
  silver: { id: "silver", name: "分裂银币", star: 2, desc: "立即获得当前持有宇宙碎片 40% 的宇宙碎片" },
};

/** 随机 1 个奇物（excludeNegative 排除负面） */
export function rollCurio(excludeNegative = false) {
  const pool = Object.values(CURIOS).filter((c) => !excludeNegative || !c.negative);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/** 获得奇物：已有则强化（×2、×3…） */
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
