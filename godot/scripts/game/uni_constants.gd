class_name UniConstants
## 模拟宇宙常量（从 src/simuniverse/logic/uniConstants.js 移植）
## 纯数据 + 位面/层规则，零依赖

const UNI_CONST: Dictionary = {
	"START_SHARDS": 0,
	"TEAM_SIZE": 4,
	"RESURRECT_COST": 150,
	"BOSS_HEAT": 5,
	"OVERWRITE_BASE": 25,
	"OVERWRITE_STEP": 25,
	"OVERWRITE_CAP": 200,
}

# 位面 1-9 的血量膨胀倍数表；10+ 每 +3
const PLANE_MULT: Array = [1, 2, 4, 6, 8, 10, 13, 16, 19]

## 血量膨胀倍数：位面 → 倍数
static func plane_mult(plane: int) -> int:
	if plane <= PLANE_MULT.size():
		return int(PLANE_MULT[plane - 1])
	return int(PLANE_MULT[PLANE_MULT.size() - 1]) + (plane - PLANE_MULT.size()) * 3

## 伤害膨胀倍率（新规范）：第一位面固定 1，其余 = 血量倍率 × 0.5（保留小数，如 1.5/6.5/9.5/12.5）
static func dmg_mult(plane: int) -> float:
	if plane <= 1:
		return 1.0
	return float(plane_mult(plane)) * 0.5

## 位面换算：1-10 → 1；11-30 → 2；31-60 → 3；61+ 每 30 层 +1
static func get_plane(floor: int) -> int:
	if floor <= 10:
		return 1
	if floor <= 30:
		return 2
	if floor <= 60:
		return 3
	return 4 + (floor - 61) / 30

## 层类型规则：首领=10的倍数；转化=25,35,55,75,95…；奇遇=45,75,105…；休整=29,59,89…
static func get_layer_type(floor: int) -> String:
	if floor == 1:
		return "battle"
	if floor % 10 == 0:
		return "boss"
	if floor >= 45 and (floor - 45) % 30 == 0:
		return "oddity"
	if floor == 25 or (floor >= 35 and (floor - 35) % 20 == 0):
		return "transform"
	if floor >= 29 and (floor - 29) % 30 == 0:
		return "rest"
	return "normal"

const ENEMY_BASE: Dictionary = {
	"normal": {"name": "普通敌人", "hp": 10},
	"elite": {"name": "精英敌人", "hp": 25},
	"boss": {"name": "首领", "hp": 60},
}

const NORMAL_POOL: Array = ["event", "reward", "battle", "elite", "adventure", "shop", "fortune"]

const REGION_META: Dictionary = {
	"event": {"icon": "❓", "name": "事件"},
	"reward": {"icon": "🎁", "name": "奖励"},
	"battle": {"icon": "⚔️", "name": "战斗"},
	"elite": {"icon": "💀", "name": "精英"},
	"adventure": {"icon": "🎲", "name": "冒险"},
	"shop": {"icon": "🛒", "name": "商店"},
	"fortune": {"icon": "💰", "name": "财富"},
	"boss": {"icon": "👑", "name": "首领"},
	"transform": {"icon": "🔮", "name": "转化"},
	"rest": {"icon": "🏕️", "name": "休整"},
	"oddity": {"icon": "✨", "name": "奇遇"},
}

const REGION_REWARD: Dictionary = {
	"battle": {"shards": 30, "blessingPicks": 3, "blessingStars": [1, 2]},
	"elite": {"shards": 80, "blessingPicks": 3, "blessingStars": [2, 3]},
	"boss": {"shards": 250, "blessingPicks": 2, "blessingStars": [3, 3], "equations": 2, "equationStars": [2, 3]},
	"fortune": {"shards": 300},
}

const TRANSFORM_WAVES: Array = [
	{"kind": "normal", "count": 5},
	{"kind": "normal", "count": 5},
	{"kind": "elite", "count": 3},
]
const TRANSFORM_PASS_ROUND: int = 20
const TRANSFORM_ELITE_SHARDS: int = 150

const BATTLE_WAVES: Array = [
	{"kind": "normal", "count": 3},
	{"kind": "normal", "count": 3},
	{"kind": "normal", "count": 3},
]

const ELITE_BATTLE: Array = [{"kind": "elite", "count": 3}]

const SHOP_PRICE: Dictionary = {
	"blessing": {1: 80, 2: 120, 3: 180},
	"curio": {1: 120, 2: 200, 3: 0},
	"equation": {1: 200, 2: 450, 3: 650},
}

const SHOP_STOCK: Dictionary = {
	"blessing": [
		{"star": 1, "count": 3},
		{"star": 2, "count": 4},
		{"star": 3, "count": 3},
	],
	"curio": [
		{"star": 1, "count": 4},
		{"star": 2, "count": 4},
	],
	"equation": [
		{"star": 1, "count": 1},
		{"star": 2, "count": 1},
		{"star": 3, "count": 1},
	],
}

const ODDITY_EFFECTS: Array = ["workbench", "shards", "strengthen"]
const ODDITY_SHARDS: int = 800
const ODDITY_STRENGTHEN_COUNT: int = 8

const EQUATION_DUPE_SHARDS: Dictionary = {1: 200, 2: 450, 3: 650}

# 敌人技能模板
const ENEMY_PATTERNS: Dictionary = {
	"normal": {
		"A": {"name": "重击", "actions": [{"type": "single", "dmg": 5}]},
		"B": {"name": "震荡波", "actions": [{"type": "aoe", "dmg": 3}]},
		"C": {"name": "岩化", "actions": [{"type": "shield", "pct": 0.3}]},
	},
	"elite": {
		"A": {"name": "连击", "actions": [{"type": "single", "dmg": 8}, {"type": "aoe", "dmg": 5}]},
		"B": {"name": "锁定狙击", "special": "lock", "actions": [{"type": "single", "dmg": 16}]},
		"C": {"name": "腐蚀", "special": "cycle", "actions": [{"type": "debuff"}, {"type": "aoe", "dmg": 8}]},
	},
	"boss": {
		"A": {"name": "帝王威压", "interlude": {"type": "aoe", "dmg": 8}, "actions": [{"type": "single", "dmg": 12}, {"type": "heal", "pct": 0.1}]},
		"B": {"name": "权柄压制", "interlude": {"type": "single", "dmg": 8}, "actions": [{"type": "aoe", "dmg": 6}, {"type": "stun"}]},
		"C": {"name": "傀儡仪式", "interlude": {"type": "summon"}, "actions": [{"type": "aoe", "dmg": 6}, {"type": "puppet", "every": 3}]},
	},
}

const ENEMY_DEBUFF_DOT: int = 2
const ENEMY_DEBUFF_DURATION: int = 3
const ENEMY_DEBUFF_DMG_CUT: float = 0.5
const ENEMY_DEBUFF_DMG_TURNS: int = 2
const PUPPET_DMG: int = 10
const PUPPET_EVERY: int = 3
const BOSS_HEAL_CUT: float = 0.5
const ELITE_LOCK_DMG: int = 16

# 角色 PVE 技能表（新规范「把饭喂嘴里版」：与旧版有差异的以新版为准）
const UNI_SKILLS: Dictionary = {
	1: {"name": "千风之诗", "type": "active", "cd": [6], "values": [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]},
	2: {"name": "坚如磐石", "type": "active", "cd": [6], "values": [18, 21, 25, 30, 35, 40, 45, 50, 55, 65]},
	3: {"name": "无想的一刀", "type": "active", "cd": [6], "values": [20, 22, 25, 28, 32, 36, 40, 45, 50, 60]},
	4: {"name": "智慧之殿堂", "type": "active", "cd": [9, 9, 9, 9, 8, 7, 6, 5, 4, 3], "values": [1, 2, 3, 4, 4, 4, 4, 4, 4, 4]},
	5: {"name": "审判", "type": "active", "cd": [6], "values": [20, 24, 28, 32, 36, 40, 45, 50, 55, 70], "heal": [10, 12, 15, 18, 21, 24, 27, 30, 33, 40]},
	6: {"name": "焚焰", "type": "passive", "values": [4, 5, 6, 7, 8, 9, 10, 10, 10, 10], "team": [1, 1, 1, 1, 1, 1, 1, 2, 3, 4]},
	7: {"name": "三月交辉之刻", "type": "passive", "values": [2, 3, 4, 5, 6, 7, 8, 8, 8, 8], "team": [1, 1, 1, 1, 1, 1, 1, 2, 3, 4]},
	8: {"name": "重见澄澈晴空", "type": "active", "cd": [6], "values": [10, 12, 15, 18, 21, 24, 27, 30, 33, 40], "dmgPct": [10, 12, 14, 16, 18, 20, 22, 24, 26, 30]},
	9: {"name": "青春之力的馈赠", "type": "active", "cd": [6], "values": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "dot": [3, 4, 5, 6, 7, 7, 7, 7, 7, 7], "dotTurns": [0, 0, 0, 0, 0, 3, 4, 5, 6, 7]},
	10: {"name": "冻结", "type": "active", "cd": [12, 12, 12, 12, 12, 11, 10, 9, 8, 8], "values": [1, 2, 3, 4, 5, 5, 5, 5, 5, 5]},
	11: {"name": "死亡回归", "type": "passive", "maxLoads": 3},
	12: {"name": "开发者指令", "type": "active", "cd": [0], "values": [1000]},
}

const LINIYA_SHIELD_VALUE: int = 6
const CAIYUEANG_MAX_LOADS: int = 3
const SPIRIT_PER_5: int = 5
