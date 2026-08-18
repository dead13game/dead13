class_name UniBuffs
## 模拟宇宙祝福/奇物/方程系统（从 src/simuniverse/logic/uniBuffs.js 移植）
## 数据表 + 效果注册 + 强化规则 + 修正聚合

const GameSoundEvents = preload("res://scripts/game/sound_events.gd")
const UniConstants = preload("res://scripts/game/uni_constants.gd")

# ── 1 星 ──
const BLESSINGS: Dictionary = {
	"shaojie": {"id": "shaojie", "name": "构筑·哨戒", "star": 1, "fate": "存护", "desc": "进入战斗时，所有角色获得抵消自身生命上限 16% 伤害的护盾", "fx": {"shieldPct": 16}, "lv": {"shieldPct": [16, 32, 48, 64]}},
	"mihe": {"id": "mihe", "name": "构筑·弥合", "star": 1, "fate": "存护", "desc": "角色受到攻击时，获得等同于本次损失生命值 18% 的护盾", "fx": {"shieldPct": 18}, "lv": {"shieldPct": [18, 36, 54, 72]}},
	"fayu": {"id": "fayu", "name": "法雨", "star": 1, "fate": "丰饶", "desc": "每拥有 1 个丰饶的祝福，角色生命上限提高 2 点（最多叠加 6 层）", "fx": {"maxHpPer": 2, "maxStacks": 6}, "lv": {"maxHpPer": [2, 4, 6, 8]}},
	"huisheng": {"id": "huisheng", "name": "回生", "star": 1, "fate": "丰饶", "desc": "角色提供治疗后，回复等同于自身生命上限 12% 的生命值", "fx": {"healPct": 12}, "lv": {"healPct": [12, 16, 20, 24]}},
	"huiguang": {"id": "huiguang", "name": "回光效应", "star": 1, "fate": "丰饶", "desc": "受到致命攻击时不会阵亡，回复至生命上限 1%（全队单场一次）", "fx": {"revivePct": 1}, "lv": {"revivePct": [1, 6, 11, 16]}},
	"weixing": {"id": "weixing", "name": "哨戒卫星", "star": 1, "fate": "毁灭", "desc": "生命 ≤50% 时获得生命上限 20% 的护盾（每名角色单场一次）", "fx": {"shieldPct": 20, "hpBelow": 50}, "lv": {"shieldPct": [20, 30, 40, 50]}},
	"jiemo": {"id": "jiemo", "name": "结膜", "star": 1, "fate": "存护", "desc": "角色施放普攻后，获得 3 张防御牌", "fx": {"defCards": 3}, "lv": {"defCards": [3, 4, 5, 6]}},
	"yanchi": {"id": "yanchi", "name": "延迟衍射的烛光", "star": 1, "fate": "智识", "desc": "角色施放群攻技能后，造成的伤害提高 10%，持续 2 回合", "fx": {"atkPct": 10, "turns": 2}, "lv": {"atkPct": [10, 20, 30, 40]}},
	"huagai": {"id": "huagai", "name": "金属斑驳的华盖", "star": 1, "fate": "智识", "desc": "角色施放群攻技能后，获得 2 张防御牌", "fx": {"defCards": 2}, "lv": {"defCards": [2, 3, 4, 5]}},
	"luoke": {"id": "luoke", "name": "感知：螺壳的纹理", "star": 1, "fate": "存护", "desc": "我方获得的护盾量提高 10%", "fx": {"shieldMult": 10}, "lv": {"shieldMult": [10, 20, 30, 40]}},
	"jifeng": {"id": "jifeng", "name": "感知：季风的故事", "star": 1, "fate": "繁育", "desc": "我方全体造成的伤害提高 10%", "fx": {"atkMult": 10}, "lv": {"atkMult": [10, 14, 18, 22]}},
	"chaoxi": {"id": "chaoxi", "name": "感知：潮汐的故事", "star": 1, "fate": "丰饶", "desc": "我方全体目标的回复量提高 10%", "fx": {"healMult": 10}, "lv": {"healMult": [10, 20, 30, 40]}},
	"chuanzhi": {"id": "chuanzhi", "name": "传质次星", "star": 1, "fate": "毁灭", "desc": "生命降低或护盾减少后，生命上限提高 20%，持续 2 回合", "fx": {"maxHpPct": 20, "turns": 2}, "lv": {"maxHpPct": [20, 24, 28, 32]}},
	"jianti": {"id": "jianti", "name": "晶体偏振的灯塔", "star": 1, "fate": "智识", "desc": "我方目标开大后，生命上限提高 20%，持续 2 回合", "fx": {"maxHpPct": 20, "turns": 2}, "lv": {"maxHpPct": [20, 30, 40, 50]}},
	"guangxue": {"id": "guangxue", "name": "光学引导的透镜", "star": 1, "fate": "智识", "desc": "施放终结技时，回复等同于生命上限 20% 的生命值", "fx": {"healPct": 20}, "lv": {"healPct": [20, 24, 28, 32]}},
	"hongkuai": {"id": "hongkuai", "name": "宏块抹除的航路", "star": 1, "fate": "智识", "desc": "我方目标施放终结技造成的伤害提高 20%", "fx": {"atkMult": 20}, "lv": {"atkMult": [20, 30, 40, 50]}},
	"chubei": {"id": "chubei", "name": "储备度规", "star": 1, "fate": "存护", "desc": "进入战斗时，获得已损失生命值 36% 的护盾", "fx": {"shieldPct": 36}, "lv": {"shieldPct": [36, 40, 44, 48]}},
	"yanshou": {"id": "yanshou", "name": "延寿", "star": 1, "fate": "丰饶", "desc": "进入战斗时，回复自身生命上限 24% 的生命值", "fx": {"healPct": 24}, "lv": {"healPct": [24, 28, 32, 36]}},
	"jianding": {"id": "jianding", "name": "构筑·坚定", "star": 1, "fate": "存护", "desc": "持有护盾的角色受到的伤害降低 16%", "fx": {"dmgTakenPct": 16}, "lv": {"dmgTakenPct": [16, 18, 20, 22]}, "cap": 50},
	"ganlu": {"id": "ganlu", "name": "甘露", "star": 1, "fate": "丰饶", "desc": "角色的回复量提高 12%", "fx": {"healMult": 12}, "lv": {"healMult": [12, 24, 36, 48]}},
	"rangzai": {"id": "rangzai", "name": "禳灾", "star": 1, "fate": "丰饶", "desc": "角色接受治疗后，获得 2 张防御牌", "fx": {"defCards": 3}, "lv": {"defCards": [2, 3, 4, 5]}},
	"juhuo": {"id": "juhuo", "name": "引燃的炬火", "star": 1, "fate": "智识", "desc": "角色开大后的下一次攻击造成的伤害提高 20%", "fx": {"atkPct": 50}, "lv": {"atkPct": [20, 30, 40, 50]}},
	"luoqi": {"id": "luoqi", "name": "线圈编织的罗琦", "star": 1, "fate": "智识", "desc": "角色开大后，回复等同于生命上限 16% 的生命值", "fx": {"healPct": 16}, "lv": {"healPct": [16, 20, 24, 28]}},
	"hongyi": {"id": "hongyi", "name": "轨道红移", "star": 1, "fate": "毁灭", "desc": "角色生命上限提高 16%", "fx": {"maxHpMult": 16}, "lv": {"maxHpMult": [16, 32, 48, 64]}},
	"penliu": {"id": "penliu", "name": "双极喷流", "star": 1, "fate": "毁灭", "desc": "我方目标受到的伤害降低 10%", "fx": {"dmgTakenPct": 10}, "lv": {"dmgTakenPct": [10, 12, 14, 16]}, "cap": 50},
	"shouzhao": {"id": "shouzhao", "name": "感知：兽爪的形状", "star": 1, "fate": "繁育", "desc": "我方全体造成的伤害提高 12%", "fx": {"atkMult": 12}, "lv": {"atkMult": [12, 16, 20, 24]}},
	"xuansi": {"id": "xuansi", "name": "悬丝", "star": 1, "fate": "繁育", "desc": "角色普攻的伤害提高 30%", "fx": {"atkMult": 30}, "lv": {"atkMult": [30, 40, 50, 60]}},
	"gongpin": {"id": "gongpin", "name": "虚妄供品", "star": 1, "fate": "虚无", "desc": "敌方目标每受到一次持续伤害，我方全体回复各自 2% 生命上限", "fx": {"healPct": 2}, "lv": {"healPct": [2, 4, 6, 8]}},
	"qingxu": {"id": "qingxu", "name": "情绪舍离", "star": 1, "fate": "虚无", "desc": "敌方每承受 1 个持续伤害状态，受到的伤害提高 3%（最多 4 层）", "fx": {"atkPerDot": 3, "maxDot": 4}, "lv": {"atkPerDot": [3, 6, 9, 12]}},
	# ── 2 星 ──
	"qiebian": {"id": "qiebian", "name": "星间构筑·切变结构", "star": 2, "fate": "存护", "desc": "反震伤害提高 10%，并对相邻目标造成主目标 25% 的反震伤害", "fx": {"reflectPct": 10, "splashPct": 25}, "lv": {"reflectPct": [10, 14, 18, 22]}},
	"huikui": {"id": "huikui", "name": "星间构筑·回馈庇护", "star": 2, "fate": "存护", "desc": "回合结束时，有 80% 概率获得生命上限 15% 的护盾", "fx": {"shieldPct": 15, "chance": 0.8}, "lv": {"shieldPct": [15, 18, 21, 24]}},
	"lingzhu": {"id": "lingzhu", "name": "星间构筑·四棱锥体", "star": 2, "fate": "存护", "desc": "角色提供的护盾量提高 30%", "fx": {"shieldMult": 30}, "lv": {"shieldMult": [30, 40, 50, 60]}},
	"yagong": {"id": "yagong", "name": "星间构筑·亚共晶体", "star": 2, "fate": "存护", "desc": "为我方提供护盾时，自身获得原护盾量 24% 的护盾（持续 2 回合）", "fx": {"shieldPct": 24}, "lv": {"shieldPct": [24, 27, 30, 33]}},
	"baoguang": {"id": "baoguang", "name": "宝光烛日月", "star": 2, "fate": "丰饶", "desc": "提供治疗时，双方造成的伤害提高 20%，持续 1 回合", "fx": {"atkPct": 20, "turns": 1}, "lv": {"atkPct": [20, 24, 28, 32]}},
	"yanli": {"id": "yanli", "name": "厌离邪秽苦", "star": 2, "fate": "繁育", "desc": "施放攻击后，对目标造成其当前生命值 30% 的附加伤害", "fx": {"hpPct": 30}, "lv": {"hpPct": [30, 33, 36, 39]}},
	"mingche": {"id": "mingche", "name": "明澈琉璃身", "star": 2, "fate": "繁育", "desc": "当前生命值等于生命上限时，受到的伤害降低 36%", "fx": {"dmgTakenPct": 36}, "lv": {"dmgTakenPct": [36, 38, 40, 42]}, "cap": 50},
	"bore": {"id": "bore", "name": "大愿般若船", "star": 2, "fate": "丰饶", "desc": "接受治疗后，额外回复等同于回复量 30% 的生命值", "fx": {"healPct": 30}, "lv": {"healPct": [30, 35, 40, 45]}},
	"yundi": {"id": "yundi", "name": "云镝逐步离", "star": 2, "fate": "繁育", "desc": "我方全体每经过 20 回合后，所有角色行动提前 100%", "fx": {"every": 30}, "lv": {"every": [20, 18, 16, 14]}, "min": 6},
	"feihong": {"id": "feihong", "name": "飞虹诛凿齿", "star": 2, "fate": "丰饶", "desc": "消灭敌方目标后，回复自身生命上限 30%", "fx": {"healPct": 48}, "lv": {"healPct": [30, 33, 36, 39]}},
	"zainan": {"id": "zainan", "name": "灾难性共振", "star": 2, "fate": "毁灭", "desc": "攻击时若处于战意效果，消耗当前生命 10%，对目标造成已损失生命 60% 的附加伤害", "fx": {"costPct": 10, "dmgPct": 60}, "lv": {"dmgPct": [60, 64, 68, 72]}},
	"yuzhao": {"id": "yuzhao", "name": "预兆性景深", "star": 2, "fate": "毁灭", "desc": "每有 1 层战意，受到的伤害降低 1%", "fx": {"dmgTakenPer": 1}, "lv": {"dmgTakenPer": [1, 2, 3, 4]}, "cap": 15},
	"baofa": {"id": "baofa", "name": "破坏性爆发", "star": 2, "fate": "毁灭", "desc": "当前生命值百分比小于 50% 时，造成的伤害提高 20%", "fx": {"atkPct": 40, "hpBelow": 50}, "lv": {"atkPct": [20, 24, 28, 32]}},
	"shanbian": {"id": "shanbian", "name": "戒律性闪变", "star": 2, "fate": "丰饶", "desc": "受到攻击后若生命小于 35%，回复生命上限 12%（单次行动最多 36%）", "fx": {"healPct": 12, "capPct": 36, "hpBelow": 35}, "lv": {"hpBelow": [35, 37, 39, 41]}, "cap": 60},
	"weihai": {"id": "weihai", "name": "危害性余光", "star": 2, "fate": "智识", "desc": "开大后，获得已损失生命值 25% 的护盾", "fx": {"shieldPct": 25}, "lv": {"shieldPct": [25, 30, 35, 40]}},
	"luonao": {"id": "luonao", "name": "裸脑质", "star": 2, "fate": "繁育", "desc": "普攻伤害会对随机相邻单体造成原伤害 30% 的伤害", "fx": {"splashPct": 30}, "lv": {"splashPct": [30, 32, 34, 36]}, "cap": 60},
	"cuihua": {"id": "cuihua", "name": "催化剂", "star": 2, "fate": "智识", "desc": "终结技未施放攻击时，全队伤害提高 20% 持续 1 回合（最多叠加 3 次）", "fx": {"atkPct": 20, "cap": 60, "turns": 1}, "lv": {"atkPct": [20, 24, 28, 32]}},
	"yuxia": {"id": "yuxia", "name": "分析·阈下知觉", "star": 2, "fate": "智识", "desc": "首次终结技伤害提高 30%", "fx": {"atkPct": 50}, "lv": {"atkPct": [30, 34, 38, 42]}},
	"chilun": {"id": "chilun", "name": "齿轮啮合的王座", "star": 2, "fate": "智识", "desc": "每有 1 个「智识」祝福，终结技伤害提高 5%（最多 5 次）", "fx": {"atkPer": 5, "max": 5}, "lv": {"atkPer": [5, 6, 7, 8]}},
	"fangshe": {"id": "fangshe", "name": "放射性衰变", "star": 2, "fate": "毁灭", "desc": "生命百分比低于 50% 时，受到的伤害降低 10%，回复量提高 20%", "fx": {"dmgTakenPct": 10, "healMultPct": 20, "hpBelow": 50}, "lv": {"healMultPct": [20, 24, 28, 32]}},
	"feijian": {"id": "feijian", "name": "飞溅蛊", "star": 2, "fate": "繁育", "desc": "普攻伤害会对相邻目标造成原伤害 10% 的伤害", "fx": {"splashPct": 10}, "lv": {"splashPct": [10, 14, 18, 22]}, "cap": 60},
	"beiju": {"id": "beiju", "name": "悲剧讲座", "star": 2, "fate": "虚无", "desc": "敌方目标受到的持续伤害提高 20%", "fx": {"dotFlat": 1}, "lv": {"dotPct": [20, 24, 28, 32]}},
	"yiyi": {"id": "yiyi", "name": "意义质询", "star": 2, "fate": "虚无", "desc": "陷入持续伤害状态的敌方目标造成的伤害降低 3 点", "fx": {"dmgCut": 3}, "lv": {"dmgCut": [3, 4, 5, 6]}},
	# ── 3 星 ──
	"shenxing": {"id": "shenxing", "name": "神性构筑·谐振传递", "star": 3, "fate": "存护", "desc": "施放攻击时，对受到攻击的敌方目标造成自身当前护盾量 50% 的反震伤害", "fx": {"shieldPct": 50}, "lv": {"shieldPct": [50, 60, 70, 80]}},
	"yifajie": {"id": "yifajie", "name": "丰饶众生，一法界心", "star": 3, "fate": "丰饶", "desc": "角色提供治疗时，我方全体目标额外回复等同于回复量 30% 的生命值", "fx": {"spreadPct": 30}, "lv": {"spreadPct": [30, 35, 40, 45]}},
	"fanwu": {"id": "fanwu", "name": "反物质费逆方程", "star": 3, "fate": "毁灭", "desc": "角色当前生命值百分比小于 50% 时，视作拥有 16 层战意效果（造成的伤害 +16%）", "fx": {"zhandu": 16, "hpBelow": 50}, "lv": {"zhandu": [16, 18, 20, 22]}},
	"huanyu": {"id": "huanyu", "name": "寰宇热寂特征数", "star": 3, "fate": "毁灭", "desc": "角色受到攻击或消耗生命值后，获得 4 层战意效果（回合结束时失去）", "fx": {"zhandu": 4}, "lv": {"zhandu": [4, 5, 6, 7]}},
	"yanmie": {"id": "yanmie", "name": "湮灭回归不等式", "star": 3, "fate": "繁育", "desc": "受到攻击时，角色所受到的伤害由我方全体平均分摊（强化后效果不变）", "fx": {}},
	"xingren": {"id": "xingren", "name": "SMR -2型杏仁核", "star": 3, "fate": "智识", "desc": "角色使敌方目标受到致命伤害时，为「罐中脑」充能 50%", "fx": {"jarBrain": 50}, "lv": {"jarBrain": [50, 52, 54, 56]}},
	"richu": {"id": "richu", "name": "日出之前", "star": 3, "fate": "虚无", "desc": "我方每次造成持续伤害时，回复等同于造成的持续伤害点数的生命值（强化后效果不变）", "fx": {}},
}

const FATES: Array = ["存护", "丰饶", "智识", "毁灭", "繁育", "虚无"]

# ================= 方程 =================

const EQUATIONS: Dictionary = {
	"shouzu": {"id": "shouzu", "name": "受诅教师", "star": 1, "fate": "毁灭", "desc": "每消灭 1 名敌人，本场战斗伤害 +20%（最多 3 层）", "fx": {"atkPerKill": 20, "maxStacks": 3}, "require": {"毁灭": 2, "智识": 2}},
	"huanxin": {"id": "huanxin", "name": "换心魔", "star": 1, "fate": "毁灭", "desc": "生命上限 +40%；进入战斗对敌全体造成第一位角色生命上限 20% 的伤害", "fx": {"maxHpMult": 40, "firstHpPct": 20}, "require": {"毁灭": 5}},
	"xingqiu": {"id": "xingqiu", "name": "行星碰碰车", "star": 1, "fate": "繁育", "desc": "真实伤害提高 35%；敌方目标若处于持续伤害状态，额外提高 15%", "fx": {"atkMult": 5, "dotAtkMult": 15}, "require": {"繁育": 2, "虚无": 2}},
	"chitu": {"id": "chitu", "name": "吃土绑架犯", "star": 2, "fate": "繁育", "desc": "附加伤害和真实伤害的倍率提高 60%", "fx": {"atkMult": 10}, "require": {"繁育": 4, "毁灭": 2}},
	"zhedi": {"id": "zhedi", "name": "蛰虫帝", "star": 2, "fate": "繁育", "desc": "施放终结技后，对随机敌人造成其 10% 生命上限的伤害", "fx": {"maxHpPct": 10}, "require": {"繁育": 4, "智识": 2}},
	"bingkuang": {"id": "bingkuang", "name": "冰霜巨人", "star": 2, "fate": "毁灭", "desc": "受击后生命 <40% 时消耗 5 层战意，回复 25% 生命上限并使伤害提高 150% 持续 2 回合（每回合 1 次）", "fx": {"hpBelow": 40, "zhanduCost": 5, "healPct": 25, "atkPct": 150, "turns": 2}, "require": {"毁灭": 7}},
	"yiji": {"id": "yiji", "name": "遗迹魔法师", "star": 2, "fate": "智识", "desc": "角色施放攻击后为「罐中脑」充能 8%", "fx": {"jarBrain": 8}, "require": {"智识": 4, "繁育": 2}},
	"chaoji": {"id": "chaoji", "name": "超级体育生", "star": 2, "fate": "智识", "desc": "施放终结技后为「罐中脑」充能 30%；消灭敌方目标后充能 30%", "fx": {"jarBrainUlt": 30, "jarBrainKill": 30}, "require": {"智识": 5}},
	"pingguo": {"id": "pingguo", "name": "苹果！苹果！", "star": 3, "fate": "毁灭", "desc": "每 3 回合结束后对敌方全体造成 2000% 冰属性基础伤害", "fx": {"dmgMult": 20, "every": 3}, "require": {"毁灭": 6, "智识": 4}},
	"xingzou": {"id": "xingzou", "name": "街道骑行官", "star": 3, "fate": "毁灭", "desc": "我方累计发动 24 次攻击后，第一位角色获得额外回合（该回合攻击附加 160% 生命上限伤害）", "fx": {"every": 24, "atkPct": 160}, "require": {"毁灭": 6, "繁育": 4}},
	"chumo": {"id": "chumo", "name": "除魔士", "star": 3, "fate": "智识", "desc": "每 4 回合施放 1 次，使我方伤害提高 200%（该回合攻击后对 <25% 血敌人附加 20% 生命上限伤害）", "fx": {"every": 4, "atkPct": 200, "killHpPct": 25}, "require": {"智识": 6, "繁育": 4}},
	"mengmo": {"id": "mengmo", "name": "梦魔主", "star": 3, "fate": "毁灭", "desc": "我方每次施放攻击，可造成各自生命上限与护盾之和 10% 的附加伤害", "fx": {"hpShieldPct": 10}, "require": {"毁灭": 10}},
	"ruchong": {"id": "ruchong", "name": "蠕行之蛇", "star": 3, "fate": "繁育", "desc": "敌方全体受到的伤害提高 10%；第一回合我方额外造成原伤害 60% 的真实伤害", "fx": {"atkMult": 10, "firstAtkMult": 60}, "require": {"繁育": 6, "虚无": 4}},
}

# ================= 奇物 =================

const CURIOS: Dictionary = {
	# ── 负面 ──
	"posui": {"id": "posui", "name": "破碎咕咕钟", "star": 0, "negative": true, "desc": "战斗胜利后获得的宇宙碎片降低 25%；展开 1 个方程后损毁"},
	"yongdong": {"id": "yongdong", "name": "永动咕咕钟", "star": 0, "negative": true, "desc": "每进入下一区域，失去 4% 当前持有的宇宙碎片"},
	"kuaile": {"id": "kuaile", "name": "快乐电视机", "star": 0, "negative": true, "desc": "连续进入相同区域时，失去 25 碎片和 1 个随机 1-3 星奇物"},
	"bobo": {"id": "bobo", "name": "菠萝", "star": 0, "negative": true, "desc": "累计进入 3 个区域后损毁，使我方全体损失 99% 当前生命值"},
	"gongsi": {"id": "gongsi", "name": "公司咕咕钟", "star": 0, "negative": true, "desc": "商品价格提高 25%"},
	"fenlie": {"id": "fenlie", "name": "分裂咕咕钟", "star": 0, "negative": true, "desc": "角色攻击力降低 5%，战斗胜利后有概率分裂出 1 个复制体（最多 3 个）"},
	"zhongdeng": {"id": "zhongdeng", "name": "中等念头群体机", "star": 0, "negative": true, "desc": "商品价格提高 25%"},
	"heisenlin": {"id": "heisenlin", "name": "黑森林咕咕钟", "star": 0, "negative": true, "desc": "进入战斗时，随机 1 名我方目标被敌方攻击概率大幅提高，持续 5 回合"},
	"bushu": {"id": "bushu", "name": "卜签咕咕钟", "star": 0, "negative": true, "desc": "战斗胜利后选择祝福时，可选择的祝福选项减少 1 个"},
	# ── 1 星 ──
	"zhongduan": {"id": "zhongduan", "name": "终端卫士", "star": 1, "desc": "失去区域时获得 75 宇宙碎片（触发 3 次后损毁）"},
	"dabinggan": {"id": "dabinggan", "name": "大饼干", "star": 1, "desc": "区域升级时获得 1 个随机 1-2 星祝福（每个区域 1 次，触发 2 次后损毁）"},
	"eye": {"id": "eye", "name": "监督之眼", "star": 1, "desc": "进入区域后失去 50 宇宙碎片；失去该奇物时获得 1 个随机 3 星奇物"},
	"anhai": {"id": "anhai", "name": "暗海碎饵", "star": 1, "desc": "获得或每 3 场战斗后，随机获得当前 15% 或失去当前 10% 的宇宙碎片"},
	"shui": {"id": "shui", "name": "睡眠和死亡", "star": 1, "desc": "进入区域时若碎片 ≤10，损毁并获得 400 宇宙碎片"},
	"lieyang": {"id": "lieyang", "name": "烈阳之舞", "star": 1, "desc": "奇物损毁时，获得 30 宇宙碎片"},
	"wulian": {"id": "wulian", "name": "无爱之尘", "star": 1, "desc": "进入区域时若奇物 ≥4，失去自身与其他 3 个随机奇物，获得 1 个 1-3 星方程"},
	"wuxian": {"id": "wuxian", "name": "无限递归的代码", "star": 1, "desc": "进入战斗时，我方目标生命上限提高 20%"},
	"zhutie": {"id": "zhutie", "name": "铸铁的齿轮指环", "star": 1, "desc": "获得宇宙碎片提高 30%，但商店售价与覆写消耗提高 30%"},
	"adaptive": {"id": "adaptive", "name": "自适应礼品盒", "star": 1, "desc": "获得时失去所有碎片，然后随机获得失去值 10%-200% 的碎片"},
	"jidong": {"id": "jidong", "name": "铸铁的机动指环", "star": 1, "desc": "获得碎片降低 50%，覆写消耗降低 100%，覆写次数上限降为 7"},
	"liangzi": {"id": "liangzi", "name": "量子大乐透", "star": 1, "desc": "每次进入区域有小概率获得负面奇物，也有小概率损毁（损毁时 +400 碎片）"},
	"jixian": {"id": "jixian", "name": "祭献投枪", "star": 1, "desc": "进入战斗/转化/精英/首领区域 +35 碎片；事件/奖励/冒险/财富区域 -35 碎片"},
	"yinhe": {"id": "yinhe", "name": "银河大乐透", "star": 1, "desc": "进入区域后小概率获得奇物，也有小概率损毁并使全队损失 99% 当前生命"},
	"linji": {"id": "linji", "name": "临时赌资", "star": 1, "desc": "立即获得 300 碎片，累计 5 个区域后损毁并失去 450 碎片"},
	"heping": {"id": "heping", "name": "和平的代价", "star": 1, "desc": "进入商店区域时获得 150 宇宙碎片"},
	"wanxiang": {"id": "wanxiang", "name": "万象无常骰", "star": 1, "desc": "获得后立即随机强化 2 个祝福"},
	"boshi": {"id": "boshi", "name": "博士之袍", "star": 1, "desc": "进入战斗时若拥有已展开的 3 星方程，激活终结技并使伤害提高 25%"},
	"club": {"id": "club", "name": "俱乐部券", "star": 1, "desc": "战斗胜利后获得宇宙碎片提高 40%"},
	"sheep": {"id": "sheep", "name": "永不停嘴的羊皮卷", "star": 1, "desc": "进入战斗时，敌方全体受到各自生命上限 30% 的固定伤害"},
	"cheese": {"id": "cheese", "name": "香涎干酪", "star": 1, "desc": "战斗胜利后，全队回复 100% 生命"},
	"yueqian": {"id": "yueqian", "name": "跃迁复眼", "star": 1, "desc": "战斗胜利后选择祝福时，强化所有 1 星祝福"},
	"zuotian": {"id": "zuotian", "name": "昨天的重量", "star": 1, "desc": "进入区域时获得 35 碎片，碎片减少累计 3 次后损毁"},
	"juedui": {"id": "juedui", "name": "绝对自灭药膏", "star": 1, "desc": "立即获得 2 个方程所需祝福，失去 2 个方程不需要的祝福"},
	"maidi": {"id": "maidi", "name": "埋点土", "star": 1, "desc": "获得 3/6/9 场战斗胜利后获得 50/150/250 碎片；9 场后损毁"},
	"youmeng": {"id": "youmeng", "name": "有梦-0110", "star": 1, "desc": "进入战斗时全队伤害提高 50%；15 回合后受到的伤害提高 10%"},
	"lubeite": {"id": "lubeite", "name": "鲁珀特帝国机械齿轮", "star": 1, "desc": "每次进入区域获得 50 碎片；碎片超过 750 时损毁并失去 750 碎片"},
	# ── 2 星 ──
	"caikuang": {"id": "caikuang", "name": "采矿吸尘器（大型）", "star": 2, "desc": "进入重任/异堂区域后获得 1 个 1-2 星祝福（触发 5 次后损毁）"},
	"canjing_lm": {"id": "canjing_lm", "name": "赐福残晶·浪漫", "star": 2, "desc": "祝福和方程每有 1 个星级，普攻伤害提高 2.5%"},
	"canjing_lx": {"id": "canjing_lx", "name": "赐福残晶·理性", "star": 2, "desc": "祝福和方程每有 1 个星级，终结技伤害提高 2.5%"},
	"canjing_fz": {"id": "canjing_fz", "name": "赐福残晶·纷争", "star": 2, "desc": "祝福和方程每有 1 个星级，对精英敌人伤害提高 2.5%"},
	"shijin": {"id": "shijin", "name": "失金爪锚", "star": 2, "desc": "立即获得 500 碎片；5 个区域后损毁；碎片 <500 时失去 5 个随机祝福后损毁"},
	"hepingxiang": {"id": "hepingxiang", "name": "和平箱", "star": 2, "desc": "展开 1 个 2 星及以上方程后获得 1 个随机祝福（最多 4 次）"},
	"luck": {"id": "luck", "name": "有形幸运", "star": 2, "desc": "进入区域时，若宇宙碎片小于 250，补足为 250"},
	"huacheng": {"id": "huacheng", "name": "化作尘泥", "star": 2, "desc": "在造物调试台中，额外获得 5 点可使用热量"},
	"xile": {"id": "xile", "name": "喜乐熏香", "star": 2, "desc": "获得时获得 2 个随机方程；首领区域战斗时每有 1 个未展开方程，敌方生命与攻击 +40%"},
	"haimian": {"id": "haimian", "name": "海绵王", "star": 2, "desc": "每进入一个区域全队损失 80% 当前生命，生命上限 +10%（4 次后损毁，上限加成保留）"},
	"fuhua": {"id": "fuhua", "name": "腐化异木果实", "star": 2, "desc": "角色抵抗所有控制类负面效果，每次抵抗消耗 20% 生命上限的生命"},
	"lixing": {"id": "lixing", "name": "理性的溃败", "star": 2, "desc": "获得时立即获得 3 个不同命运的随机 1 星祝福各 1 个"},
	"renzao": {"id": "renzao", "name": "人造陨石球", "star": 2, "desc": "获得时立即获得 1-3 个拥有祝福数量最多的命运的祝福"},
	"xugou": {"id": "xugou", "name": "虚构机兵", "star": 2, "desc": "角色回合开始时，回复其生命上限 20% 的生命值"},
	"huanzhe": {"id": "huanzhe", "name": "患者面具", "star": 2, "desc": "将所有祝福替换为随机祝福，强化情况保留，有概率替换为更高稀有度"},
	"tiancai": {"id": "tiancai", "name": "天才俱乐部普通八卦", "star": 2, "desc": "获得碎片时额外获得 50%，但战斗结束无法再获取祝福"},
	"shanyao": {"id": "shanyao", "name": "闪耀的偏方三八面骰", "star": 2, "desc": "获得后将所有奇物替换为随机奇物"},
	"fenlie_jb": {"id": "fenlie_jb", "name": "分裂金币", "star": 2, "desc": "每进入下一区域，获得当前持有碎片 5% 的碎片"},
	"fujiao": {"id": "fujiao", "name": "福灵胶", "star": 2, "desc": "战斗胜利后额外获得 1 个 3 星祝福（1 次后损毁）"},
	"jiangwei": {"id": "jiangwei", "name": "降维骰子", "star": 2, "desc": "战斗胜利后可额外选择 1 次祝福，但选项减少 1 个（2 次战斗后损毁）"},
	"louti": {"id": "louti", "name": "「楼梯上的水母」", "star": 2, "desc": "失去所有祝福，按失去祝福的星级之和获得碎片（每星级 80 碎片）"},
	"xiee": {"id": "xiee", "name": "邪恶机械卫星#900", "star": 2, "desc": "商品价格降低 25%"},
	"kongwu": {"id": "kongwu", "name": "空无烛剪", "star": 2, "desc": "获得后随机修复最多 2 个已损毁的 1-3 星奇物，剩余次数恢复初始"},
	"xinyang": {"id": "xinyang", "name": "信仰债券", "star": 2, "desc": "覆写祝福、覆写方程以及复活角色所需的碎片数量降低 30%"},
	"kaituo": {"id": "kaituo", "name": "开拓火漆", "star": 2, "desc": "获得时随机获得每个命运的祝福各 1 个；获得方程时获得 3 个所需祝福（每区域 1 次）"},
	"chuiyu": {"id": "chuiyu", "name": "垂语果实", "star": 2, "desc": "立即获得 1 个随机祝福；失去后再次获得并使奖励祝福 +1（最多 4 个）"},
	"zhizun": {"id": "zhizun", "name": "至尊胶", "star": 2, "desc": "获得祝福时有 10% 概率再随机获得 1 个 1-2 星祝福（最多 5 个）"},
	"jingshen": {"id": "jingshen", "name": "精神感应餐叉", "star": 2, "desc": "失去祝福时获得 50 宇宙碎片"},
	"zhenshi": {"id": "zhenshi", "name": "真实机兵", "star": 2, "desc": "失去奇物时获得 75 宇宙碎片"},
	"mori": {"id": "mori", "name": "末日复眼·先行版", "star": 2, "desc": "获得时获得 3 个拥有祝福数量最多的命运的祝福；覆写消耗提高 1000%"},
	"wuren": {"id": "wuren", "name": "无人通讯", "star": 2, "desc": "奇物损毁时使其恢复如新（触发 2 次后损毁）"},
	"aruan": {"id": "aruan", "name": "阿阮袋", "star": 2, "desc": "立即获得 3 个随机祝福；战斗胜利后选择祝福时选项变为 1（2 次战斗后损毁）"},
	"chunmei": {"id": "chunmei", "name": "纯美骑士精神", "star": 2, "desc": "获得时获得 1 个随机方程"},
	"silver": {"id": "silver", "name": "分裂银币", "star": 2, "desc": "立即获得当前持有宇宙碎片 40% 的宇宙碎片"},
	"lens": {"id": "lens", "name": "时空棱镜", "star": 2, "desc": "所有角色技能等级提高 2 级"},
	"shuishang": {"id": "shuishang", "name": "水上书", "star": 2, "desc": "进入区域时，全队回复全部生命，并重置所有无法战斗的角色"},
	# ── 3 星 ──
	"jingque": {"id": "jingque", "name": "精确优雅的代码", "star": 3, "desc": "进入战斗时防御/攻击/生命上限 +35%，攻击后对随机目标造成 350% 攻击力的附加伤害"},
	"xugao": {"id": "xugao", "name": "虚高一丈", "star": 3, "desc": "获得 1/2/3 星奇物时获得 20/40/120 碎片；每有 1 个 1/2/3 星奇物，战斗伤害 +3%/6%/20%"},
	"yusi": {"id": "yusi", "name": "与死重逢", "star": 3, "desc": "立即获得 1 个当前无法展开的方程；每展开 1 个方程后获得 1 个随机无法展开方程（最多 3 个）；每有 1 个展开方程，全队伤害 +10%"},
	"wenyi": {"id": "wenyi", "name": "瘟疫巢都", "star": 3, "desc": "立即获得 4 个随机负面奇物；进入区域时随机失去最多 2 个负面奇物并获得等量祝福；每因此失去 1 个负面奇物，战斗伤害 +10%"},
	"jiyi": {"id": "jiyi", "name": "记忆轮", "star": 3, "desc": "立即获得 2 个随机方程；每进入区域时将方程置换为随机同星级方程；进入战斗时获得所有未展开方程的效果"},
	"jiazu": {"id": "jiazu", "name": "家族缘结", "star": 3, "desc": "立即获得 2 个可损毁奇物；奇物损毁时获得 1 个可损毁奇物；每有 1 个已损毁奇物，战斗伤害 +30%"},
	"chunmei_pao": {"id": "chunmei_pao", "name": "纯美之袍", "star": 3, "desc": "进入战斗时每有 100 碎片全队伤害 +20%；进入战斗/精英/首领区域时获得当前碎片 10% 的碎片"},
}

const CURIO_FX: Dictionary = {
	"posui": {"shardsCut": 0.25},
	"yongdong": {"shardsPct": 4},
	"kuaile": {"cost": 25},
	"bobo": {"regions": 3, "hpPct": 99},
	"gongsi": {"priceMult": 1.25},
	"zhongdeng": {"priceMult": 1.25},
	"heisenlin": {"tauntTurns": 5},
	"bushu": {"optionCut": 1},
	"zhongduan": {"gain": 75, "triggers": 3},
	"dabinggan": {"triggers": 2, "starRange": [1, 2]},
	"eye": {"cost": 50, "gainStar": 3},
	"anhai": {"gainPct": 15, "lossPct": 10, "battles": 3},
	"shui": {"shardsMax": 10, "gain": 400},
	"lieyang": {"gain": 30},
	"wulian": {"minCurios": 4, "loseCount": 3},
	"wuxian": {"maxHpMult": 20},
	"zhutie": {"shardsMult": 1.3, "priceMult": 1.3},
	"adaptive": {"minPct": 10, "maxPct": 200},
	"jidong": {"shardsCut": 0.5, "overwriteFree": true, "overwriteCap": 7},
	"liangzi": {"gain": 400},
	"jixian": {"battleGain": 35, "softLoss": 35, "chainGain": 35},
	"yinhe": {},
	"linji": {"gain": 300, "regions": 5, "penalty": 450},
	"heping": {"gain": 150},
	"wanxiang": {"count": 2},
	"boshi": {"atkMult": 25, "needStar": 3},
	"club": {"shardsMult": 1.4},
	"sheep": {"hpPct": 30},
	"cheese": {"healPct": 100},
	"yueqian": {},
	"zuotian": {"gain": 35, "triggers": 3},
	"juedui": {"count": 2},
	"maidi": {"winPoints": [3, 6, 9], "gains": [50, 150, 250]},
	"youmeng": {"atkMult": 50, "turns": 15, "laterDmgPct": 10},
	"lubeite": {"gain": 50, "cap": 750, "penalty": 750},
	"caikuang": {"triggers": 5, "starRange": [1, 2]},
	"canjing_lm": {"atkPerStar": 2.5},
	"canjing_lx": {"atkPerStar": 2.5},
	"canjing_fz": {"atkPerStar": 2.5},
	"shijin": {"gain": 500, "regions": 5, "minShards": 500},
	"hepingxiang": {"maxTriggers": 4, "minStar": 2},
	"luck": {"floor": 250},
	"huacheng": {"heat": 5},
	"xile": {},
	"haimian": {"hpCut": 0.8, "maxHpMult": 10, "triggers": 4},
	"fuhua": {"hpCostPct": 20},
	"lixing": {"count": 3},
	"renzao": {"max": 3},
	"xugou": {"healPct": 20},
	"huanzhe": {},
	"tiancai": {"shardsMult": 1.5},
	"shanyao": {},
	"fenlie_jb": {"shardsPct": 5},
	"fujiao": {"blessingStar": 3},
	"jiangwei": {"triggers": 2, "extraPick": 1},
	"louti": {"shardsPerStar": 80},
	"xiee": {"priceCut": 0.75},
	"kongwu": {"fixCount": 2},
	"xinyang": {"costCut": 0.7},
	"kaituo": {},
	"chuiyu": {"maxExtra": 4},
	"zhizun": {"chance": 0.1, "maxExtra": 5},
	"jingshen": {"gain": 50},
	"zhenshi": {"gain": 75},
	"mori": {"priceMult": 11, "count": 3},
	"wuren": {"triggers": 2},
	"aruan": {"triggers": 2},
	"chunmei": {},
	"silver": {"shardsPct": 40},
	"lens": {"skillUp": 2},
	"shuishang": {},
	"jingque": {"atkDefHpPct": 35, "atkPct": 350},
	"xugao": {"shardsByStar": [20, 40, 120], "atkByStar": [3, 6, 20]},
	"yusi": {"atkPerEquation": 10},
	"wenyi": {"negativeCount": 4, "atkPerLost": 10},
	"jiyi": {},
	"jiazu": {"atkPerBroken": 30},
	"chunmei_pao": {"atkPer100": 20, "shardsPct": 10},
}

# ================= 工具 =================

static func _s(v: Variant) -> String:
	return "" if v == null else str(v)

static func _pick(arr: Array) -> Variant:
	if arr.is_empty():
		return null
	return arr[randi() % arr.size()]

## 方程是否已展开：当前祝福命途统计满足 EQUATIONS[id].require
static func is_equation_unlocked(state: Dictionary, id: String) -> bool:
	var eq: Dictionary = EQUATIONS.get(id, {})
	if eq.is_empty() or not eq.has("require"):
		return true
	var counts: Dictionary = {}
	for b in state.get("blessings", []):
		var fate: String = _s(BLESSINGS.get(b.get("id", ""), {}).get("fate", ""))
		if fate != "":
			counts[fate] = int(counts.get(fate, 0)) + 1
	for f in eq["require"].keys():
		if int(counts.get(f, 0)) < int(eq["require"][f]):
			return false
	return true

## 按星级过滤祝福池
static func blessing_pool(min_star: int = 1, max_star: int = 3) -> Array:
	var pool: Array = []
	for b in BLESSINGS.values():
		if int(b.get("star", 0)) >= min_star and int(b.get("star", 0)) <= max_star:
			pool.append(b)
	return pool

## 获得 1 个随机祝福 id
static func roll_blessing(min_star: int = 1, max_star: int = 3) -> String:
	var pool: Array = blessing_pool(min_star, max_star)
	var b: Variant = _pick(pool)
	return "" if b == null else _s(b.get("id", ""))

## 生成「祝福三选一」候选（不重复）
static func roll_blessing_candidates(count: int = 3, min_star: int = 1, max_star: int = 3) -> Array:
	var pool: Array = blessing_pool(min_star, max_star)
	# 洗牌取前 count 个
	for i in range(pool.size() - 1, 0, -1):
		var j: int = randi() % (i + 1)
		var tmp = pool[i]
		pool[i] = pool[j]
		pool[j] = tmp
	var result: Array = []
	for i in range(mini(count, pool.size())):
		result.append(_s(pool[i].get("id", "")))
	return result

## 获得祝福：已有则强化
static func gain_blessing(state: Dictionary, id: String, opts: Dictionary = {}) -> Dictionary:
	var b: Dictionary = BLESSINGS.get(id, {})
	if b.is_empty():
		return {"ok": false, "reason": "无此祝福"}
	var exist: Variant = null
	for x in state.get("blessings", []):
		if _s(x.get("id", "")) == id:
			exist = x
			break
	if exist != null:
		exist["enhanced"] = int(exist.get("enhanced", 1)) + 1
		state["log"].append("祝福「%s」强化至 ×%d" % [_s(b.get("name", id)), exist["enhanced"]])
		return {"ok": true, "enhanced": exist["enhanced"], "star": b.get("star", 0), "silent": opts.get("silent", false)}
	state["blessings"].append({"id": id, "star": b.get("star", 0), "enhanced": 1})
	if not opts.get("silent", false):
		state["log"].append("获得祝福「%s」(%d星·%s)" % [_s(b.get("name", id)), int(b.get("star", 0)), _s(b.get("fate", ""))])
	# 轨道红移：生命上限 +16%/层
	if id == "hongyi":
		for t in state.get("team", []):
			t["maxHp"] = ceili(float(t.get("maxHp", 1)) * 1.16)
			t["hp"] = mini(int(t.get("hp", 0)), int(t["maxHp"]))
	return {"ok": true, "star": b.get("star", 0), "silent": opts.get("silent", false)}

## 随机失去 1 个祝福
static func lose_random_blessing(state: Dictionary) -> Variant:
	var blessings: Array = state.get("blessings", [])
	if blessings.is_empty():
		return null
	var idx: int = randi() % blessings.size()
	var removed: Dictionary = blessings.pop_at(idx)
	state["log"].append("失去祝福「%s」" % _s(BLESSINGS.get(removed.get("id", ""), {}).get("name", removed.get("id", ""))))
	return removed

## 失去指定祝福（按数组下标）
static func lose_blessing_at(state: Dictionary, idx: int) -> Variant:
	var blessings: Array = state.get("blessings", [])
	if idx < 0 or idx >= blessings.size():
		return null
	return blessings.pop_at(idx)

## 祝福强化倍数
static func blessing_mult(state: Dictionary, id: String) -> int:
	for b in state.get("blessings", []):
		if _s(b.get("id", "")) == id:
			return int(b.get("enhanced", 1)) * int(b.get("heatEnhanced", 1))
	return 0

## 祝福强化等级（1 级起）
static func blessing_level(state: Dictionary, id: String) -> int:
	for b in state.get("blessings", []):
		if _s(b.get("id", "")) == id:
			return maxi(1, int(b.get("enhanced", 1)) + int(b.get("heatEnhanced", 1)) - 1)
	return 0

## 祝福强化后数值：按等级查 lv 表，越界等差延伸，无表回退 fx
static func blessing_val(state: Dictionary, id: String, field: String) -> float:
	var def: Dictionary = BLESSINGS.get(id, {})
	if def.is_empty():
		return 0.0
	var lv: int = blessing_level(state, id)
	var table: Array = def.get("lv", {}).get(field, [])
	var v: float = 0.0
	if not table.is_empty():
		if lv <= table.size():
			v = float(table[lv - 1])
		else:
			var step: float = float(table[1] - table[0]) if table.size() >= 2 else 0.0
			v = float(table[table.size() - 1]) + step * (lv - table.size())
	else:
		v = float(def.get("fx", {}).get(field, 0))
	var fx_cap: Variant = def.get("fx", {}).get("cap")
	var top_cap: Variant = def.get("cap")
	if fx_cap != null or top_cap != null:
		var cap_v: float = float(fx_cap) if fx_cap != null else float(top_cap)
		v = minf(v, cap_v)
	var fx_min: Variant = def.get("fx", {}).get("min")
	var top_min: Variant = def.get("min")
	if fx_min != null or top_min != null:
		var min_v: float = float(fx_min) if fx_min != null else float(top_min)
		v = maxf(v, min_v)
	return v

## 聚合所有祝福修正
static func get_uni_modifiers(state: Dictionary) -> Dictionary:
	var mods: Dictionary = {
		"atkMult": 0.0,
		"atkNormalMult": 0.0,
		"skillDmgMult": 0.0,
		"dmgTakenMult": 0.0,
		"healMult": 0.0,
		"shieldMult": 0.0,
		"maxHpMult": 0.0,
	}
	var blessings: Array = state.get("blessings", [])
	if blessings.is_empty():
		return apply_curio_star_mods(state, mods)
	var fate_count := func(f: String) -> int:
		var n: int = 0
		for b in blessings:
			if _s(BLESSINGS.get(b.get("id", ""), {}).get("fate", "")) == f:
				n += 1
		return n
	var zhishu_count: int = fate_count.call("智识")
	var fengrao_count: int = fate_count.call("丰饶")
	for b in blessings:
		var fx: Dictionary = BLESSINGS.get(b.get("id", ""), {}).get("fx", {})
		if fx.is_empty():
			continue
		match _s(b.get("id", "")):
			"shouzhao", "jifeng":
				mods["atkMult"] += blessing_val(state, _s(b.get("id", "")), "atkMult")
			"hongkuai":
				mods["skillDmgMult"] += blessing_val(state, _s(b.get("id", "")), "atkMult")
			"chilun":
				mods["skillDmgMult"] += blessing_val(state, _s(b.get("id", "")), "atkPer") * mini(zhishu_count, int(fx.get("max", 5)))
			"ruchong":
				mods["atkMult"] += float(fx.get("atkMult", 0))
			"xingqiu":
				mods["atkMult"] += float(fx.get("atkMult", 0))
				var enemies: Array = state.get("combat", {}).get("enemies", [])
				var has_dot: bool = false
				for e in enemies:
					if e.get("alive", false) and int(e.get("dotTurns", 0)) > 0:
						has_dot = true
						break
				if has_dot:
					mods["atkMult"] += float(fx.get("dotAtkMult", 0))
			"chitu":
				mods["atkMult"] += float(fx.get("atkMult", 0))
			"xuansi":
				mods["atkNormalMult"] += blessing_val(state, _s(b.get("id", "")), "atkMult")
			"penliu":
				mods["dmgTakenMult"] += blessing_val(state, _s(b.get("id", "")), "dmgTakenPct")
			"fangshe":
				mods["dmgTakenMult"] += float(fx.get("dmgTakenPct", 0))
				mods["healMult"] += blessing_val(state, _s(b.get("id", "")), "healMultPct")
			"ganlu", "chaoxi":
				mods["healMult"] += blessing_val(state, _s(b.get("id", "")), "healMult")
			"luoke", "lingzhu":
				mods["shieldMult"] += blessing_val(state, _s(b.get("id", "")), "shieldMult")
			"hongyi":
				mods["maxHpMult"] += blessing_val(state, _s(b.get("id", "")), "maxHpMult")
			"fayu":
				mods["maxHpMult"] += blessing_val(state, _s(b.get("id", "")), "maxHpPer") * mini(fengrao_count, int(fx.get("maxStacks", 6)))
			"qingxu":
				var dot_count: int = 0
				for e in state.get("combat", {}).get("enemies", []):
					if e.get("alive", false) and int(e.get("dotTurns", 0)) > 0:
						dot_count += 1
				mods["atkMult"] += blessing_val(state, _s(b.get("id", "")), "atkPerDot") * mini(dot_count, int(fx.get("maxDot", 4)))
	return apply_curio_star_mods(state, mods)

## 赐福残晶系列（星级 = 祝福星数和 + 方程星数和）
static func apply_curio_star_mods(state: Dictionary, mods: Dictionary) -> Dictionary:
	var star_total: int = 0
	for b in state.get("blessings", []):
		star_total += int(b.get("star", 0))
	for e in state.get("equations", []):
		star_total += int(e.get("star", 0))
	var curios: Array = state.get("curios", [])
	var has_curio := func(id: String) -> bool:
		for c in curios:
			if _s(c.get("id", "")) == id:
				return true
		return false
	if has_curio.call("canjing_lm"):
		mods["atkNormalMult"] += float(CURIO_FX.get("canjing_lm", {}).get("atkPerStar", 2.5)) * star_total
	if has_curio.call("canjing_lx"):
		mods["skillDmgMult"] += float(CURIO_FX.get("canjing_lx", {}).get("atkPerStar", 2.5)) * star_total
	if has_curio.call("canjing_fz"):
		mods["atkMult"] += float(CURIO_FX.get("canjing_fz", {}).get("atkPerStar", 2.5)) * star_total
	return mods

## 按成员血量/护盾/战意动态计算的额外攻击修正
static func member_atk_mods(state: Dictionary, member_idx: int) -> float:
	var team: Array = state.get("team", [])
	if member_idx < 0 or member_idx >= team.size():
		return 0.0
	var t: Dictionary = team[member_idx]
	var extra: float = 0.0
	if blessing_mult(state, "baofa") > 0 and float(t.get("hp", 0)) / float(t.get("maxHp", 1)) < float(BLESSINGS.get("baofa", {}).get("fx", {}).get("hpBelow", 50)) / 100.0:
		extra += blessing_val(state, "baofa", "atkPct")
	if blessing_mult(state, "fanwu") > 0 and float(t.get("hp", 0)) / float(t.get("maxHp", 1)) < float(BLESSINGS.get("fanwu", {}).get("fx", {}).get("hpBelow", 50)) / 100.0:
		extra += blessing_val(state, "fanwu", "zhandu")
	extra += float(t.get("status", {}).get("zhandu", 0)) * 1.0
	return extra

## 按成员血量动态计算的受伤减伤
static func member_dmg_taken_mods(state: Dictionary, member_idx: int) -> float:
	var team: Array = state.get("team", [])
	if member_idx < 0 or member_idx >= team.size():
		return 0.0
	var t: Dictionary = team[member_idx]
	var extra: float = 0.0
	if blessing_mult(state, "fanwu") > 0 and float(t.get("hp", 0)) / float(t.get("maxHp", 1)) < float(BLESSINGS.get("fanwu", {}).get("fx", {}).get("hpBelow", 50)) / 100.0:
		extra += blessing_val(state, "fanwu", "zhandu")
	extra += float(t.get("status", {}).get("zhandu", 0)) * 1.0
	if blessing_mult(state, "mingche") > 0 and float(t.get("hp", 0)) >= float(t.get("maxHp", 0)):
		extra += blessing_val(state, "mingche", "dmgTakenPct")
	if blessing_mult(state, "jianding") > 0 and (float(t.get("shield", 0)) > 0 or not t.get("status", {}).get("defensePile", []).is_empty()):
		extra += blessing_val(state, "jianding", "dmgTakenPct")
	if blessing_mult(state, "fangshe") > 0 and float(t.get("hp", 0)) / float(t.get("maxHp", 1)) >= float(BLESSINGS.get("fangshe", {}).get("fx", {}).get("hpBelow", 50)) / 100.0:
		extra -= blessing_val(state, "fangshe", "dmgTakenPct")
	return extra

# ================= 事件钩子 =================

## 战斗开始钩子：哨戒/储备度规/延寿
static func trigger_on_combat_start(state: Dictionary) -> void:
	for t in state.get("team", []):
		if not t.get("alive", false):
			continue
		if blessing_mult(state, "shaojie") > 0:
			t["shield"] = float(t.get("shield", 0)) + ceili(float(t.get("maxHp", 1)) * blessing_val(state, "shaojie", "shieldPct") / 100.0)
		if blessing_mult(state, "chubei") > 0:
			t["shield"] = float(t.get("shield", 0)) + ceili((float(t.get("maxHp", 1)) - float(t.get("hp", 0))) * blessing_val(state, "chubei", "shieldPct") / 100.0)
		if blessing_mult(state, "yanshou") > 0:
			t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + ceili(float(t.get("maxHp", 1)) * blessing_val(state, "yanshou", "healPct") / 100.0))

## 受到伤害后钩子
static func trigger_on_damaged(state: Dictionary, member_idx: int, hp_loss: float) -> void:
	var team: Array = state.get("team", [])
	if member_idx < 0 or member_idx >= team.size():
		return
	var t: Dictionary = team[member_idx]
	if blessing_mult(state, "mihe") > 0 and hp_loss > 0:
		t["shield"] = float(t.get("shield", 0)) + ceili(hp_loss * blessing_val(state, "mihe", "shieldPct") / 100.0)
	var shanbian_fx: Dictionary = BLESSINGS.get("shanbian", {}).get("fx", {})
	if not shanbian_fx.is_empty() and blessing_mult(state, "shanbian") > 0 and float(t.get("hp", 0)) / float(t.get("maxHp", 1)) < float(shanbian_fx.get("hpBelow", 35)) / 100.0:
		t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + ceili(float(t.get("maxHp", 1)) * blessing_val(state, "shanbian", "healPct") / 100.0))
	var chuanzhi_fx: Dictionary = BLESSINGS.get("chuanzhi", {}).get("fx", {})
	if not chuanzhi_fx.is_empty() and blessing_mult(state, "chuanzhi") > 0:
		t["maxHp"] = ceili(float(t.get("maxHp", 1)) * (1 + blessing_val(state, "chuanzhi", "maxHpPct") / 100.0))
		t["status"]["maxHpBuffTurns"] = chuanzhi_fx.get("turns", 2)
	var huanyu_fx: Dictionary = BLESSINGS.get("huanyu", {}).get("fx", {})
	if not huanyu_fx.is_empty() and blessing_mult(state, "huanyu") > 0 and hp_loss > 0:
		t["status"]["zhandu"] = int(t.get("status", {}).get("zhandu", 0)) + int(blessing_val(state, "huanyu", "zhandu"))
	var weixing_fx: Dictionary = BLESSINGS.get("weixing", {}).get("fx", {})
	if not weixing_fx.is_empty() and blessing_mult(state, "weixing") > 0 and float(t.get("hp", 0)) / float(t.get("maxHp", 1)) <= float(weixing_fx.get("hpBelow", 50)) / 100.0 and not t.get("status", {}).get("weixingUsed", false):
		t["status"]["weixingUsed"] = true
		t["shield"] = float(t.get("shield", 0)) + ceili(float(t.get("maxHp", 1)) * blessing_val(state, "weixing", "shieldPct") / 100.0)
	# 方程：冰霜巨人
	var bingkuang_fx: Dictionary = EQUATIONS.get("bingkuang", {}).get("fx", {})
	if not bingkuang_fx.is_empty() and _has_equation(state, "bingkuang") and hp_loss > 0 and float(t.get("hp", 0)) / float(t.get("maxHp", 1)) < float(bingkuang_fx.get("hpBelow", 40)) / 100.0:
		if int(t.get("status", {}).get("zhandu", 0)) >= int(bingkuang_fx.get("zhanduCost", 5)):
			t["status"]["zhandu"] = int(t.get("status", {}).get("zhandu", 0)) - int(bingkuang_fx.get("zhanduCost", 5))
			t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + ceili(float(t.get("maxHp", 1)) * float(bingkuang_fx.get("healPct", 25)) / 100.0))
			t["status"]["dmgBuffPct"] = float(t.get("status", {}).get("dmgBuffPct", 0)) + float(bingkuang_fx.get("atkPct", 150))
			t["status"]["dmgBuffTurns"] = bingkuang_fx.get("turns", 2)
			state["log"].append("冰霜巨人：消耗战意，回复并强化")

static func _has_equation(state: Dictionary, id: String) -> bool:
	for e in state.get("equations", []):
		if _s(e.get("id", "")) == id:
			return true
	return false

## 接受治疗后钩子
static func trigger_on_heal(state: Dictionary, member_idx: int, heal_amount: float = 0.0) -> void:
	var team: Array = state.get("team", [])
	if member_idx < 0 or member_idx >= team.size():
		return
	var t: Dictionary = team[member_idx]
	if blessing_mult(state, "rangzai") > 0:
		var n: int = int(blessing_val(state, "rangzai", "defCards"))
		for i in range(n):
			t["status"]["defensePile"].append({"value": 2, "rank": "盾", "suit": "♦"})
	var bore_fx: Dictionary = BLESSINGS.get("bore", {}).get("fx", {})
	if not bore_fx.is_empty() and blessing_mult(state, "bore") > 0 and heal_amount > 0:
		t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + ceili(heal_amount * blessing_val(state, "bore", "healPct") / 100.0))
	var baoguang_fx: Dictionary = BLESSINGS.get("baoguang", {}).get("fx", {})
	if not baoguang_fx.is_empty() and blessing_mult(state, "baoguang") > 0:
		t["status"]["dmgBuffPct"] = maxf(float(t.get("status", {}).get("dmgBuffPct", 0)), float(baoguang_fx.get("atkPct", 20)))
		t["status"]["dmgBuffTurns"] = baoguang_fx.get("turns", 1)
	# 丰饶众生，一法界心：提供治疗时，我方全体（含被治疗者）额外回复回复量 30%（新规范）
	var yifajie_fx: Dictionary = BLESSINGS.get("yifajie", {}).get("fx", {})
	if not yifajie_fx.is_empty() and blessing_mult(state, "yifajie") > 0 and heal_amount > 0:
		var spread_heal: float = ceili(heal_amount * blessing_val(state, "yifajie", "spreadPct") / 100.0)
		for x in team:
			if x.get("alive", false):
				x["hp"] = minf(float(x.get("maxHp", 1)), float(x.get("hp", 0)) + spread_heal)

## 消灭敌人后钩子
static func trigger_on_kill(state: Dictionary, member_idx: int) -> void:
	var team: Array = state.get("team", [])
	if member_idx < 0 or member_idx >= team.size():
		return
	var feihong_fx: Dictionary = BLESSINGS.get("feihong", {}).get("fx", {})
	if not feihong_fx.is_empty() and blessing_mult(state, "feihong") > 0:
		var t: Dictionary = team[member_idx]
		t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + ceili(float(t.get("maxHp", 1)) * blessing_val(state, "feihong", "healPct") / 100.0))
	var xingren_fx: Dictionary = BLESSINGS.get("xingren", {}).get("fx", {})
	if not xingren_fx.is_empty() and blessing_mult(state, "xingren") > 0:
		charge_jar_brain(state, blessing_val(state, "xingren", "jarBrain"))

## 开大后钩子
static func trigger_after_skill(state: Dictionary, char_index: int) -> void:
	var team: Array = state.get("team", [])
	if char_index < 0 or char_index >= team.size():
		return
	var t: Dictionary = team[char_index]
	var juhuo_fx: Dictionary = BLESSINGS.get("juhuo", {}).get("fx", {})
	if not juhuo_fx.is_empty() and blessing_mult(state, "juhuo") > 0:
		t["status"]["nextAttackBoost"] = blessing_val(state, "juhuo", "atkPct")
	var luoqi_fx: Dictionary = BLESSINGS.get("luoqi", {}).get("fx", {})
	if not luoqi_fx.is_empty() and blessing_mult(state, "luoqi") > 0:
		t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + ceili(float(t.get("maxHp", 1)) * blessing_val(state, "luoqi", "healPct") / 100.0))
	var guangxue_fx: Dictionary = BLESSINGS.get("guangxue", {}).get("fx", {})
	if not guangxue_fx.is_empty() and blessing_mult(state, "guangxue") > 0:
		t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + ceili(float(t.get("maxHp", 1)) * blessing_val(state, "guangxue", "healPct") / 100.0))
	var weihai_fx: Dictionary = BLESSINGS.get("weihai", {}).get("fx", {})
	if not weihai_fx.is_empty() and blessing_mult(state, "weihai") > 0:
		t["shield"] = float(t.get("shield", 0)) + ceili((float(t.get("maxHp", 1)) - float(t.get("hp", 0))) * blessing_val(state, "weihai", "shieldPct") / 100.0)
	var jianti_fx: Dictionary = BLESSINGS.get("jianti", {}).get("fx", {})
	if not jianti_fx.is_empty() and blessing_mult(state, "jianti") > 0:
		t["maxHp"] = ceili(float(t.get("maxHp", 1)) * (1 + blessing_val(state, "jianti", "maxHpPct") / 100.0))
		t["status"]["maxHpBuffTurns"] = jianti_fx.get("turns", 2)
	var yanchi_fx: Dictionary = BLESSINGS.get("yanchi", {}).get("fx", {})
	if not yanchi_fx.is_empty() and blessing_mult(state, "yanchi") > 0:
		t["status"]["dmgBuffPct"] = float(t.get("status", {}).get("dmgBuffPct", 0)) + blessing_val(state, "yanchi", "atkPct")
		t["status"]["dmgBuffTurns"] = maxi(int(t.get("status", {}).get("dmgBuffTurns", 0)), int(yanchi_fx.get("turns", 2)))
	var cuihua_fx: Dictionary = BLESSINGS.get("cuihua", {}).get("fx", {})
	if not cuihua_fx.is_empty() and blessing_mult(state, "cuihua") > 0:
		for x in state.get("team", []):
			x["status"]["dmgBuffPct"] = minf(float(x.get("status", {}).get("dmgBuffPct", 0)) + blessing_val(state, "cuihua", "atkPct"), blessing_val(state, "cuihua", "cap"))
			x["status"]["dmgBuffTurns"] = cuihua_fx.get("turns", 1)
	# 罐中脑：已迁移至 uni_skills.execute_uni_skill（大招后再激活大招）

## 攻击后钩子
static func trigger_on_attack_after(state: Dictionary, member_idx: int, target_enemy_id: int, base_dmg: float) -> void:
	var team: Array = state.get("team", [])
	if member_idx < 0 or member_idx >= team.size():
		return
	var t: Dictionary = team[member_idx]
	var c: Dictionary = state.get("combat", {})
	if c.is_empty():
		return
	var target: Variant = null
	for e in c.get("enemies", []):
		if int(e.get("id", -1)) == target_enemy_id and e.get("alive", false):
			target = e
			break
	if target == null:
		return
	if blessing_mult(state, "jiemo") > 0:
		var n: int = int(blessing_val(state, "jiemo", "defCards"))
		for i in range(n):
			t["status"]["defensePile"].append({"value": 2, "rank": "盾", "suit": "♦"})
	var yanli_fx: Dictionary = BLESSINGS.get("yanli", {}).get("fx", {})
	if not yanli_fx.is_empty() and blessing_mult(state, "yanli") > 0:
		var extra: float = ceili(float(target.get("hp", 0)) * blessing_val(state, "yanli", "hpPct") / 100.0)
		if extra > 0:
			c["_pendingExtra"] = float(c.get("_pendingExtra", 0)) + extra
	var shenxing_fx: Dictionary = BLESSINGS.get("shenxing", {}).get("fx", {})
	if not shenxing_fx.is_empty() and blessing_mult(state, "shenxing") > 0 and float(t.get("shield", 0)) > 0:
		c["_pendingExtra"] = float(c.get("_pendingExtra", 0)) + ceili(float(t.get("shield", 0)) * blessing_val(state, "shenxing", "shieldPct") / 100.0)
	var zainan_fx: Dictionary = BLESSINGS.get("zainan", {}).get("fx", {})
	if not zainan_fx.is_empty() and blessing_mult(state, "zainan") > 0 and int(t.get("status", {}).get("zhandu", 0)) > 0:
		var cost: float = ceili(float(t.get("hp", 0)) * float(zainan_fx.get("costPct", 10)) / 100.0)
		t["hp"] = float(t.get("hp", 0)) - cost
		var lost: float = float(t.get("maxHp", 1)) - float(t.get("hp", 0))
		c["_pendingExtra"] = float(c.get("_pendingExtra", 0)) + ceili(lost * blessing_val(state, "zainan", "dmgPct") / 100.0)
	# 裸脑质/飞溅蛊：普攻溅射随机相邻敌人
	var splash: float = blessing_val(state, "luonao", "splashPct") + blessing_val(state, "feijian", "splashPct")
	if splash > 0:
		var others: Array = []
		for e in c.get("enemies", []):
			if e.get("alive", false) and int(e.get("id", -1)) != target_enemy_id:
				others.append(e)
		if not others.is_empty():
			var vic: Dictionary = others[randi() % others.size()]
			c["_pendingSplash"] = float(c.get("_pendingSplash", 0)) + ceili(base_dmg * splash / 100.0)
			c["_splashTarget"] = vic.get("id", 0)

## 回合结束钩子
static func trigger_on_end_turn(state: Dictionary) -> void:
	var huikui_fx: Dictionary = BLESSINGS.get("huikui", {}).get("fx", {})
	if not huikui_fx.is_empty() and blessing_mult(state, "huikui") > 0 and randf() < float(huikui_fx.get("chance", 0.8)):
		for t in state.get("team", []):
			if not t.get("alive", false):
				continue
			t["shield"] = float(t.get("shield", 0)) + ceili(float(t.get("maxHp", 1)) * blessing_val(state, "huikui", "shieldPct") / 100.0)
	var huanyu_fx: Dictionary = BLESSINGS.get("huanyu", {}).get("fx", {})
	if not huanyu_fx.is_empty() and blessing_mult(state, "huanyu") > 0:
		for t in state.get("team", []):
			t["status"]["zhandu"] = maxi(0, int(t.get("status", {}).get("zhandu", 0)) - int(blessing_val(state, "huanyu", "zhandu")))

## 罐中脑充能（0-100 封顶）
static func charge_jar_brain(state: Dictionary, n: float) -> void:
	state["jarBrain"] = minf(100.0, float(state.get("jarBrain", 0)) + n)

## 战斗开始奇物钩子
static func trigger_curio_on_combat_start(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty():
		return
	var curios: Array = state.get("curios", [])
	var has_curio := func(id: String) -> bool:
		for x in curios:
			if _s(x.get("id", "")) == id:
				return true
		return false
	if has_curio.call("wuxian"):
		for t in state.get("team", []):
			t["maxHp"] = ceili(float(t.get("maxHp", 1)) * (1 + float(CURIO_FX.get("wuxian", {}).get("maxHpMult", 20)) / 100.0))
			t["hp"] = minf(float(t.get("hp", 0)), float(t["maxHp"]))
	if has_curio.call("jingque"):
		for t in state.get("team", []):
			t["maxHp"] = ceili(float(t.get("maxHp", 1)) * (1 + float(CURIO_FX.get("jingque", {}).get("atkDefHpPct", 35)) / 100.0))
			t["status"]["atkBonus"] = int(t.get("status", {}).get("atkBonus", 0)) + 5
	if has_curio.call("sheep"):
		for e in c.get("enemies", []):
			if e.get("alive", false):
				e["hp"] = maxf(0.0, float(e.get("hp", 0)) - ceili(float(e.get("maxHp", 1)) * float(CURIO_FX.get("sheep", {}).get("hpPct", 30)) / 100.0))
				if float(e["hp"]) <= 0:
					e["alive"] = false
					state["log"].append("羊皮卷：击败 %s" % _s(e.get("name", "")))
	if has_curio.call("boshi") and _has_equation(state, ""):
		var has_3star: bool = false
		for e in state.get("equations", []):
			if int(e.get("star", 0)) == 3:
				has_3star = true
				break
		if has_3star:
			for t in state.get("team", []):
				t["status"]["dmgBuffPct"] = float(t.get("status", {}).get("dmgBuffPct", 0)) + float(CURIO_FX.get("boshi", {}).get("atkMult", 25))
				t["status"]["dmgBuffTurns"] = 1
	if has_curio.call("youmeng"):
		for t in state.get("team", []):
			t["status"]["dmgBuffPct"] = float(t.get("status", {}).get("dmgBuffPct", 0)) + float(CURIO_FX.get("youmeng", {}).get("atkMult", 50))
			t["status"]["dmgBuffTurns"] = 1
	if has_curio.call("heisenlin"):
		var alive: Array = []
		for t in state.get("team", []):
			if t.get("alive", false):
				alive.append(t)
		if not alive.is_empty():
			var target: Dictionary = alive[randi() % alive.size()]
			target["status"]["taunt"] = CURIO_FX.get("heisenlin", {}).get("tauntTurns", 5)
			state["log"].append("黑森林咕咕钟：%s 被标记为集火目标" % _s(target.get("name", "")))

## 战斗胜利奇物钩子
static func trigger_curio_on_win(state: Dictionary) -> void:
	var curios: Array = state.get("curios", [])
	# 埋点土
	var maidi: Variant = null
	for x in curios:
		if _s(x.get("id", "")) == "maidi":
			maidi = x
			break
	if maidi != null:
		maidi["wins"] = int(maidi.get("wins", 0)) + 1
		var w: int = int(maidi["wins"])
		var pts: Array = CURIO_FX.get("maidi", {}).get("winPoints", [3, 6, 9])
		var gs: Array = CURIO_FX.get("maidi", {}).get("gains", [50, 150, 250])
		var gain: int = 0
		for i in range(pts.size()):
			if w >= int(pts[i]):
				gain = int(gs[i])
		if gain > 0:
			state["shards"] = int(state.get("shards", 0)) + gain
			state["log"].append("埋点土：+%d 碎片" % gain)
		if w >= 9:
			state["curios"] = _filter_curios(state.get("curios", []), "maidi")
			state["log"].append("埋点土：损毁")
	# 阿阮袋
	if _has_curio(state, "aruan"):
		for x in state.get("curios", []):
			if _s(x.get("id", "")) == "aruan":
				x["wins"] = int(x.get("wins", 0)) + 1
				if int(x["wins"]) >= int(CURIO_FX.get("aruan", {}).get("triggers", 2)):
					state["curios"] = _filter_curios(state.get("curios", []), "aruan")
					state["log"].append("阿阮袋：损毁")
				break
	# 降维骰子
	if _has_curio(state, "jiangwei"):
		for x in state.get("curios", []):
			if _s(x.get("id", "")) == "jiangwei":
				x["wins"] = int(x.get("wins", 0)) + 1
				if int(x["wins"]) >= int(CURIO_FX.get("jiangwei", {}).get("triggers", 2)):
					state["curios"] = _filter_curios(state.get("curios", []), "jiangwei")
					state["log"].append("降维骰子：损毁")
				break

static func _filter_curios(curios: Array, id: String) -> Array:
	var result: Array = []
	for c in curios:
		if _s(c.get("id", "")) != id:
			result.append(c)
	return result

static func _has_curio(state: Dictionary, id: String) -> bool:
	for c in state.get("curios", []):
		if _s(c.get("id", "")) == id:
			return true
	return false

## 敌方持续伤害结算后钩子：虚妄供品
static func trigger_on_enemy_dot(state: Dictionary) -> void:
	var gongpin_fx: Dictionary = BLESSINGS.get("gongpin", {}).get("fx", {})
	var m: int = blessing_mult(state, "gongpin")
	if not gongpin_fx.is_empty() and m > 0:
		for t in state.get("team", []):
			if not t.get("alive", false):
				continue
			t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + ceili(float(t.get("maxHp", 1)) * float(gongpin_fx.get("healPct", 2)) / 100.0 * m))

## 治疗扩散（丰饶众生，一法界心）
static func apply_heal_spread(state: Dictionary, healer_idx: int, amount: float) -> float:
	var yifajie_fx: Dictionary = BLESSINGS.get("yifajie", {}).get("fx", {})
	var m: int = blessing_mult(state, "yifajie")
	if yifajie_fx.is_empty() or m <= 0:
		return 0.0
	var spread: float = 0.0
	for t in state.get("team", []):
		if not t.get("alive", false) or int(t.get("index", -1)) == healer_idx:
			continue
		var heal: float = ceili(amount * float(yifajie_fx.get("spreadPct", 30)) / 100.0 * m)
		t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + heal)
		spread += heal
	return spread

# ================= 奇物操作 =================

## 随机 1 个奇物
static func roll_curio(exclude_negative: bool = false, min_star: int = 1, max_star: int = 3) -> String:
	var pool: Array = []
	for c in CURIOS.values():
		if (not exclude_negative or not c.get("negative", false)) and int(c.get("star", 0)) >= min_star and int(c.get("star", 0)) <= max_star:
			pool.append(c)
	if pool.is_empty():
		return ""
	var picked: Dictionary = pool[randi() % pool.size()]
	return _s(picked.get("id", ""))

## 获得奇物：已有则强化
static func gain_curio(state: Dictionary, id: String, opts: Dictionary = {}) -> Dictionary:
	var c: Dictionary = CURIOS.get(id, {})
	if c.is_empty():
		return {"ok": false, "reason": "无此奇物"}
	var exist: Variant = null
	for x in state.get("curios", []):
		if _s(x.get("id", "")) == id:
			exist = x
			break
	if exist != null:
		exist["enhanced"] = int(exist.get("enhanced", 1)) + 1
		state["log"].append("奇物「%s」强化至 ×%d" % [_s(c.get("name", id)), exist["enhanced"]])
		return {"ok": true, "enhanced": exist["enhanced"], "silent": opts.get("silent", false)}
	state["curios"].append({"id": id, "star": c.get("star", 0), "enhanced": 1, "broken": false})
	if not opts.get("silent", false):
		state["log"].append("获得奇物「%s」" % _s(c.get("name", id)))
	# 时空棱镜
	if id == "lens":
		for t in state.get("team", []):
			if int(t.get("charId", 0)) != 11:
				t["skillLevel"] = mini(10, int(t.get("skillLevel", 1)) + 2)
		state["log"].append("时空棱镜：全队技能等级 +2")
	# 分裂银币
	if id == "silver":
		var gain: int = ceili(float(state.get("shards", 0)) * float(CURIO_FX.get("silver", {}).get("shardsPct", 40)) / 100.0)
		state["shards"] = int(state.get("shards", 0)) + gain
		state["log"].append("分裂银币：+%d 宇宙碎片" % gain)
	# 失金爪锚
	if id == "shijin":
		state["shards"] = int(state.get("shards", 0)) + int(CURIO_FX.get("shijin", {}).get("gain", 500))
		state["log"].append("失金爪锚：+碎片")
	# 临时赌资
	if id == "linji":
		state["shards"] = int(state.get("shards", 0)) + int(CURIO_FX.get("linji", {}).get("gain", 300))
		state["log"].append("临时赌资：+碎片")
	# 自适应礼品盒
	if id == "adaptive":
		var lost: int = int(state.get("shards", 0))
		var min_p: float = float(CURIO_FX.get("adaptive", {}).get("minPct", 10))
		var max_p: float = float(CURIO_FX.get("adaptive", {}).get("maxPct", 200))
		var pct: float = (min_p + randf() * (max_p - min_p)) / 100.0
		state["shards"] = ceili(float(lost) * pct)
		state["log"].append("自适应礼品盒：失去 %d，获得 %d" % [lost, int(state["shards"])])
	# 暗海碎饵
	if id == "anhai":
		if randf() < 0.5:
			state["shards"] = int(state.get("shards", 0)) + ceili(float(state.get("shards", 0)) * float(CURIO_FX.get("anhai", {}).get("gainPct", 15)) / 100.0)
		else:
			state["shards"] = maxi(0, int(state.get("shards", 0)) - ceili(float(state.get("shards", 0)) * float(CURIO_FX.get("anhai", {}).get("lossPct", 10)) / 100.0))
	# 万象无常骰：强化 2 个随机祝福
	if id == "wanxiang":
		for i in range(2):
			var blessings: Array = state.get("blessings", [])
			if blessings.is_empty():
				break
			var b: Dictionary = blessings[randi() % blessings.size()]
			b["heatEnhanced"] = int(b.get("heatEnhanced", 1)) + 1
	# 理性的溃败
	if id == "lixing":
		for f in FATES:
			var pool: Array = []
			for b in BLESSINGS.values():
				if int(b.get("star", 0)) == 1 and _s(b.get("fate", "")) == f:
					pool.append(b)
			if not pool.is_empty():
				var b: Dictionary = pool[randi() % pool.size()]
				gain_blessing(state, _s(b.get("id", "")), {"silent": true})
	# 纯美骑士精神 / 与死重逢
	if id == "chunmei" or id == "yusi":
		var eq: String = roll_equation(1, 3)
		if eq != "":
			gain_equation(state, eq)
	# 喜乐熏香 / 记忆轮
	if id == "xile" or id == "jiyi":
		for i in range(2):
			var eq2: String = roll_equation(1, 3)
			if eq2 != "":
				gain_equation(state, eq2)
	# 阿阮袋 / 垂语果实 / 开拓火漆
	if id == "aruan" or id == "chuiyu" or id == "kaituo":
		var cnt: int = 3 if id == "aruan" else 1
		for i in range(cnt):
			var b2: String = roll_blessing(1, 3)
			if b2 != "":
				gain_blessing(state, b2, {"silent": true})
	# 开拓火漆：每个命运 1 个祝福
	if id == "kaituo":
		for f in FATES:
			var pool2: Array = []
			for b in BLESSINGS.values():
				if _s(b.get("fate", "")) == f:
					pool2.append(b)
			if not pool2.is_empty():
				var b3: Dictionary = pool2[randi() % pool2.size()]
				gain_blessing(state, _s(b3.get("id", "")), {"silent": true})
	# 楼梯上的水母
	if id == "louti":
		var star_sum: int = 0
		for b in state.get("blessings", []):
			star_sum += int(b.get("star", 1)) * int(b.get("enhanced", 1))
		state["blessings"] = []
		state["shards"] = int(state.get("shards", 0)) + star_sum * int(CURIO_FX.get("louti", {}).get("shardsPerStar", 80))
		state["log"].append("楼梯上的水母：祝福转碎片")
	# 患者面具
	if id == "huanzhe":
		var new_blessings: Array = []
		for b in state.get("blessings", []):
			var pool3: Array = blessing_pool(1, 3)
			var next: Dictionary = pool3[randi() % pool3.size()]
			new_blessings.append({"id": next.get("id", ""), "star": next.get("star", 0), "enhanced": b.get("enhanced", 1), "heatEnhanced": b.get("heatEnhanced", 1)})
		state["blessings"] = new_blessings
	# 闪耀骰：奇物全换
	if id == "shanyao":
		var new_curios: Array = []
		for c_old in state.get("curios", []):
			var all_curios: Array = CURIOS.values()
			var next2: Dictionary = all_curios[randi() % all_curios.size()]
			new_curios.append({"id": next2.get("id", ""), "star": next2.get("star", 0), "enhanced": c_old.get("enhanced", 1), "broken": false})
		state["curios"] = new_curios
	# 绝对自灭药膏
	if id == "juedui":
		for i in range(2):
			var b4: String = roll_blessing(1, 3)
			if b4 != "":
				gain_blessing(state, b4, {"silent": true})
		for i in range(2):
			var bl: Array = state.get("blessings", [])
			if bl.is_empty():
				break
			bl.pop_at(randi() % bl.size())
	# 瘟疫巢都
	if id == "wenyi":
		var negatives: Array = []
		for c2 in CURIOS.values():
			if c2.get("negative", false):
				negatives.append(c2)
		for i in range(4):
			if negatives.is_empty():
				break
			var n: Dictionary = negatives[randi() % negatives.size()]
			if not _has_curio(state, _s(n.get("id", ""))):
				gain_curio(state, _s(n.get("id", "")), {"silent": true})
	return {"ok": true, "star": c.get("star", 0), "silent": opts.get("silent", false)}

## 随机失去 1 个奇物
static func lose_random_curio(state: Dictionary) -> Variant:
	var curios: Array = state.get("curios", [])
	if curios.is_empty():
		return null
	var idx: int = randi() % curios.size()
	var removed: Dictionary = curios.pop_at(idx)
	state["log"].append("失去奇物「%s」" % _s(CURIOS.get(removed.get("id", ""), {}).get("name", removed.get("id", ""))))
	# 监督之眼：失去时获得 1 个随机 3 星奇物
	if _s(removed.get("id", "")) == "eye":
		var pool4: Array = []
		for c3 in CURIOS.values():
			if int(c3.get("star", 0)) == 3:
				pool4.append(c3)
		if not pool4.is_empty():
			var next3: Dictionary = pool4[randi() % pool4.size()]
			gain_curio(state, _s(next3.get("id", "")))
	# 真实机兵：失去奇物时 +75 碎片
	if _has_curio(state, "zhenshi"):
		state["shards"] = int(state.get("shards", 0)) + 75
		state["log"].append("真实机兵：+75 碎片")
	return removed

# ================= 方程操作 =================

## 随机 1 个方程
static func roll_equation(min_star: int = 1, max_star: int = 3) -> String:
	var pool: Array = []
	for e in EQUATIONS.values():
		if int(e.get("star", 0)) >= min_star and int(e.get("star", 0)) <= max_star:
			pool.append(e)
	if pool.is_empty():
		return ""
	return _s(pool[randi() % pool.size()].get("id", ""))

## 获得方程：重复 → 自动转化为宇宙碎片
static func gain_equation(state: Dictionary, id: String, opts: Dictionary = {}) -> Dictionary:
	var eq: Dictionary = EQUATIONS.get(id, {})
	if eq.is_empty():
		return {"ok": false, "reason": "无此方程"}
	for x in state.get("equations", []):
		if _s(x.get("id", "")) == id:
			var shards: int = int(UniConstants.EQUATION_DUPE_SHARDS.get(eq.get("star", 1), 0))
			state["shards"] = int(state.get("shards", 0)) + shards
			state["log"].append("重复方程「%s」→ 转化为 %d 宇宙碎片" % [_s(eq.get("name", id)), shards])
			return {"ok": true, "dupe": true, "shards": shards, "silent": opts.get("silent", false)}
	state["equations"].append({"id": id, "star": eq.get("star", 0), "enhanced": 1})
	if not opts.get("silent", false):
		state["log"].append("获得方程「%s」(%d星)" % [_s(eq.get("name", id)), int(eq.get("star", 0))])
	# 换心魔：生命上限 +40%
	if id == "huanxin":
		for t in state.get("team", []):
			t["maxHp"] = ceili(float(t.get("maxHp", 1)) * 1.4)
			t["hp"] = minf(float(t.get("hp", 0)), float(t["maxHp"]))
		state["log"].append("换心魔：全队生命上限 +40%")
	return {"ok": true, "star": eq.get("star", 0), "silent": opts.get("silent", false)}
