class_name UniEvents
## 模拟宇宙事件系统（从 src/simuniverse/logic/uniEvents.js 移植）
## 分支事件 / 奖励 / 冒险

const UniConstants = preload("res://scripts/game/uni_constants.gd")
const UniBuffs = preload("res://scripts/game/uni_buffs.gd")
const UniCore = preload("res://scripts/game/uni_core.gd")

const DEF_CARD_SHIELD: int = 2

static func _s(v: Variant) -> String:
	return "" if v == null else str(v)

static func _pick(arr: Array) -> Variant:
	if arr.is_empty():
		return null
	return arr[randi() % arr.size()]

# ================= 事件定义 =================

const UNI_EVENTS: Dictionary = {
	"caravan": {
		"id": "caravan", "title": "迷途商队",
		"desc": "你遇到一支迷路的商队，商人们神色疲惫，货物散落一地。",
		"options": [
			{"text": "指引方向", "effects": {"blessingPick": 1, "blessingStars": [1, 3]}},
			{"text": "护送他们", "effects": {"battle": {"kind": "normal", "count": 3, "reward": {"blessingPick": 2, "blessingStars": [1, 3]}}}},
			{"text": "搜刮货物", "effects": {"shards": 100, "defenseCards": -1}},
		],
	},
	"plague": {
		"id": "plague", "title": "瘟疫村庄",
		"desc": "一个村庄正遭受瘟疫侵袭，村口燃着苍白的火焰。",
		"options": [
			{"text": "提供医疗援助", "effects": {"healPct": 15, "blessingPick": 1, "blessingStars": [1, 3]}},
			{"text": "封锁村庄", "effects": {"shards": 150}},
		],
	},
	"watchtower": {
		"id": "watchtower", "title": "废弃哨塔",
		"desc": "一座废弃的哨塔矗立在路边，顶层似乎有东西在发光。",
		"options": [
			{"text": "攀登哨塔", "effects": {"skillUpRandom": 1}},
			{"text": "搜索底层", "effects": {"shards": 100}},
			{"text": "绕行", "effects": {}},
		],
	},
	"abyss": {
		"id": "abyss", "title": "深渊裂缝",
		"desc": "一道裂缝正在吞噬周围的地面，裂缝深处传来低沉的轰鸣。",
		"options": [
			{"text": "调查裂缝", "effects": {"battle": {"kind": "elite", "count": 2, "reward": {"skillUpTarget": 2}}}},
			{"text": "封住裂缝", "effects": {"shards": 150, "defenseCards": -3}},
			{"text": "无视", "effects": {}},
		],
	},
	"tablet": {
		"id": "tablet", "title": "古老石碑",
		"desc": "石碑上刻着看不懂的符文，在月光下泛着微光。",
		"options": [
			{"text": "解读符文", "effects": {"blessingCount": 2}},
			{"text": "触摸石碑", "effects": {"blessingCount": 1}},
			{"text": "标记位置", "effects": {}},
		],
	},
	"ghostship": {
		"id": "ghostship", "title": "幽灵船",
		"desc": "一艘废弃的战舰搁浅在岸边，船身散发着诡异的光芒。",
		"options": [
			{"text": "搜索船舱", "effects": {"blessingCount": 1, "defenseCards": -1}},
			{"text": "烧毁船只", "effects": {"shards": 150, "defenseCards": -1}},
			{"text": "快速离开", "effects": {}},
		],
	},
	"spring": {
		"id": "spring", "title": "幻象之泉",
		"desc": "泉水倒映出你内心最渴望的东西。",
		"options": [
			{"text": "饮用泉水", "effects": {"blessingCount": 10}},
			{"text": "观察倒影", "effects": {"curioCount": 5, "excludeNegative": true}},
			{"text": "破坏泉水", "effects": {"shards": 800}},
		],
	},
	"gate": {
		"id": "gate", "title": "封印之门",
		"desc": "一扇刻满符文的门挡住了去路。",
		"options": [
			{"text": "暴力破门", "effects": {"battle": {"kind": "elite", "count": 2, "reward": {"shards": 250, "blessingPick": 1, "blessingStars": [3, 3]}}}},
			{"text": "解读符文", "effects": {"requireShards": 150, "blessingCount": 3, "blessingStars": [1, 2]}},
			{"text": "绕路", "effects": {}},
		],
	},
	"altar": {
		"id": "altar", "title": "古代祭坛",
		"desc": "祭坛上有一件正在发光的物品。",
		"options": [
			{"text": "取走物品", "effects": {"equationStar": 3, "curioCount": 2, "loseHpPct": 60}},
			{"text": "献祭物品", "effects": {"loseBlessing": 2, "shards": 300}},
			{"text": "祈祷", "effects": {"loseCurio": 1, "healPct": 50}},
		],
	},
}

const UNI_REWARDS: Dictionary = {
	"medkit": {
		"id": "medkit", "title": "医疗补给",
		"desc": "你发现了一箱完好的医疗物资。",
		"options": [
			{"text": "快速恢复", "effects": {"healPct": 20}},
			{"text": "储备药品", "effects": {"medkit": 2}},
			{"text": "消毒物资", "effects": {"healPct": 100, "loseHpAfter3": 50}},
		],
	},
	"potion": {
		"id": "potion", "title": "强化药剂",
		"desc": "桌上摆着三瓶不同颜色的药剂。",
		"options": [
			{"text": "红色药剂", "effects": {"blessingCount": 2}},
			{"text": "蓝色药剂", "effects": {"curioCount": 2, "excludeNegative": true}},
			{"text": "绿色药剂", "effects": {"healPct": 40, "ceil": true}},
		],
	},
	"manual": {
		"id": "manual", "title": "战术手册",
		"desc": "一本残留着战斗笔记的手册。",
		"options": [
			{"text": "进攻战术", "effects": {"buff": "atkUp"}},
			{"text": "防守战术", "effects": {"buff": "defUp"}},
			{"text": "速攻战术", "effects": {"buff": "enemyStun"}},
		],
	},
	"scroll": {
		"id": "scroll", "title": "防护卷轴",
		"desc": "卷轴上的符文隐隐发光。",
		"options": [
			{"text": "护盾符文", "effects": {"defenseCards": 5}},
			{"text": "反伤符文", "effects": {"buff": "reflect"}},
			{"text": "免疫符文", "effects": {"buff": "immuneFirst"}},
		],
	},
	"expScroll": {
		"id": "expScroll", "title": "经验卷轴",
		"desc": "卷轴记载着战斗的感悟。",
		"options": [
			{"text": "专注研读", "effects": {"skillUpTarget": 2}},
			{"text": "分享经验", "effects": {"skillUpAll": 1}},
			{"text": "实战转化", "effects": {"tempSkillBoost": 3}},
		],
	},
	"weapon": {
		"id": "weapon", "title": "附魔武器",
		"desc": "刀刃上流淌着微弱的光芒。",
		"options": [
			{"text": "火焰附魔", "effects": {"buff": "dmgUp50"}},
			{"text": "精炼材料", "effects": {"shards": 250}},
		],
	},
	"crystal": {
		"id": "crystal", "title": "生命结晶",
		"desc": "晶石在手心散发着温度。",
		"options": [
			{"text": "吸收能量", "effects": {"planeMaxHp": 20}},
			{"text": "转化力量", "effects": {"healPct": 30, "blessingCount": 2}},
			{"text": "交换物品", "effects": {"shards": 200}},
		],
	},
	"box": {
		"id": "box", "title": "神秘箱子",
		"desc": "一个锁着的箱子，上面刻着一行字：「选择你的代价」。",
		"options": [
			{"text": "打开箱子", "effects": {"blessingCount": 2, "blessingStars": [3, 3]}},
			{"text": "砸开箱子", "effects": {"shards": 500, "loseAllDefense": true}},
			{"text": "放弃箱子", "effects": {"shards": 200}},
		],
	},
}

const UNI_ADVENTURES: Dictionary = {
	"dice": {
		"id": "dice", "title": "骰子游戏",
		"desc": "商人拿出骰子，邀请你玩一局。",
		"options": [
			{"text": "保守：投入 60 碎片", "effects": {"gamble": {"cost": 60, "mult": 20}}},
			{"text": "正常：投入 90 碎片", "effects": {"gamble": {"cost": 90, "mult": 30}}},
			{"text": "豪赌：投入 150 碎片", "effects": {"gamble": {"cost": 150, "mult": 50}}},
		],
	},
	"cards": {
		"id": "cards", "title": "翻牌",
		"desc": "三张牌扣在桌子上，抽一张。",
		"options": [
			{"text": "抽一张", "effects": {"fortuneCard": true}},
		],
	},
	"lottery": {
		"id": "lottery", "title": "抽签",
		"desc": "10 支签放在一个竹筒里（1 大吉 / 2 中吉 / 4 小吉 / 3 凶）。",
		"options": [
			{"text": "抽一支（25 碎片）", "effects": {"lottery": {"cost": 25, "count": 1}}},
			{"text": "抽三支取最好（100 碎片）", "effects": {"lottery": {"cost": 100, "count": 3}}},
			{"text": "放弃", "effects": {}},
		],
	},
}

## 按事件 id 取事件定义
static func get_event_def(event_id: String) -> Variant:
	if UNI_EVENTS.has(event_id):
		return UNI_EVENTS[event_id]
	if UNI_REWARDS.has(event_id):
		return UNI_REWARDS[event_id]
	if UNI_ADVENTURES.has(event_id):
		return UNI_ADVENTURES[event_id]
	return null

## 按区域类型随机抽 1 个具体事件（type: event/reward/adventure）
static func roll_event(type: String) -> String:
	var pool: Dictionary = UNI_EVENTS
	if type == "reward":
		pool = UNI_REWARDS
	elif type == "adventure":
		pool = UNI_ADVENTURES
	var ids: Array = pool.keys()
	return _s(_pick(ids))

# ================= 效果辅助 =================

## 治疗全队（百分比）
static func _heal_team_pct(state: Dictionary, pct: float, floor_mode: bool = false) -> float:
	var healed: float = 0.0
	for t in state.get("team", []):
		if not t.get("alive", false):
			continue
		var amount: int = ceili(float(t.get("maxHp", 1)) * pct / 100.0) if floor_mode else floori(float(t.get("maxHp", 1)) * pct / 100.0)
		t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + amount)
		healed += amount
	return healed

## 全队损失生命上限百分比的血量（最低减为 1）
static func _lose_team_hp_pct(state: Dictionary, pct: float) -> void:
	for t in state.get("team", []):
		if not t.get("alive", false):
			continue
		var loss: int = floori(float(t.get("maxHp", 1)) * pct / 100.0)
		t["hp"] = maxf(1.0, float(t.get("hp", 0)) - loss)

## 全队获得/失去防御牌
static func _team_defense_cards(state: Dictionary, n: int) -> int:
	if n >= 0:
		for t in state.get("team", []):
			if not t.get("alive", false):
				continue
			for i in range(n):
				t["status"]["defensePile"].append({"value": DEF_CARD_SHIELD, "rank": "?", "suit": "♠"})
		return n
	for t in state.get("team", []):
		if not t.get("alive", false):
			continue
		for i in range(-n):
			var pile: Array = t["status"]["defensePile"]
			if pile.is_empty():
				break
			pile.pop_back()
	return n

## 提升角色技能等级
static func apply_skill_up(state: Dictionary, char_index: int, n: int) -> Dictionary:
	var team: Array = state.get("team", [])
	if char_index < 0 or char_index >= team.size():
		return {"ok": false, "reason": "无此角色"}
	var t: Dictionary = team[char_index]
	if int(t.get("charId", 0)) == 11:
		return {"ok": false, "reason": "菜月昴不可升级"}
	var before: int = int(t.get("skillLevel", 1))
	t["skillLevel"] = mini(10, before + n)
	UniCore.sync_passives(state)
	state["log"].append("%s 技能等级 +%d（Lv%d）" % [_s(t.get("name", "")), int(t["skillLevel"]) - before, int(t["skillLevel"])])
	return {"ok": true, "leveled": int(t["skillLevel"]) - before}

## 随机一名可升级角色技能 +1
static func _random_skill_up(state: Dictionary, n: int = 1) -> Variant:
	var upgradable: Array = []
	for t in state.get("team", []):
		if t.get("alive", false) and int(t.get("charId", 0)) != 11:
			upgradable.append(t)
	if upgradable.is_empty():
		return null
	var t: Dictionary = upgradable[randi() % upgradable.size()]
	return apply_skill_up(state, int(t.get("index", 0)), n)

# ================= 选项应用 =================

## 应用事件选项
static func apply_event_option(state: Dictionary, event_id: String, option_idx: int) -> Dictionary:
	var ev: Variant = get_event_def(event_id)
	if ev == null:
		return {"ok": false, "reason": "无此事件"}
	var options: Array = ev.get("options", [])
	if option_idx < 0 or option_idx >= options.size():
		return {"ok": false, "reason": "无此选项"}
	var opt: Dictionary = options[option_idx]
	var fx: Dictionary = opt.get("effects", {})
	var outcome: Dictionary = {"text": opt.get("text", ""), "fx": fx}

	# 花费检查
	if fx.has("requireShards") and not UniCore.spend_shards(state, int(fx["requireShards"])):
		outcome["failed"] = "碎片不足"
		return {"ok": true, "outcome": outcome, "eventId": event_id, "eventTitle": ev.get("title", "")}

	# 货币
	if fx.has("shards"):
		UniCore.add_shards(state, int(fx["shards"]))

	# 血量
	if fx.has("healPct"):
		_heal_team_pct(state, float(fx["healPct"]), fx.get("ceil", false))
	if fx.has("loseHpPct"):
		_lose_team_hp_pct(state, float(fx["loseHpPct"]))
	if fx.has("loseHpAfter3"):
		if int(state.get("floor", 1)) <= 2:
			_heal_team_pct(state, 100.0)
		else:
			_heal_team_pct(state, 100.0)
			_lose_team_hp_pct(state, float(fx["loseHpAfter3"]))

	# 防御牌
	if fx.has("defenseCards"):
		_team_defense_cards(state, int(fx["defenseCards"]))
	if fx.get("loseAllDefense", false):
		for t in state.get("team", []):
			t["status"]["defensePile"] = []

	# 祝福
	if fx.has("blessingCount"):
		var star_range: Array = fx.get("blessingStars", [1, 3])
		for i in range(int(fx["blessingCount"])):
			var id: String = UniBuffs.roll_blessing(int(star_range[0]), int(star_range[1]))
			if id != "":
				UniBuffs.gain_blessing(state, id, {"silent": true})
	# 祝福三选一
	if fx.has("blessingPick"):
		var star_range2: Array = fx.get("blessingStars", [1, 3])
		var picks: Array = []
		for i in range(int(fx["blessingPick"])):
			picks.append({"candidates": UniBuffs.roll_blessing_candidates(3, int(star_range2[0]), int(star_range2[1])), "starRange": star_range2})
		var pending: Array = state.get("pendingBlessingPicks", [])
		pending.append_array(picks)
		state["pendingBlessingPicks"] = pending
		outcome["pendingPicks"] = picks.size()

	# 奇物
	if fx.has("curioCount"):
		for i in range(int(fx["curioCount"])):
			var cid: String = UniBuffs.roll_curio(fx.get("excludeNegative", false))
			if cid != "":
				UniBuffs.gain_curio(state, cid, {"silent": true})

	# 方程
	if fx.has("equationStar"):
		var eid: String = UniBuffs.roll_equation(int(fx["equationStar"]), int(fx["equationStar"]))
		if eid != "":
			UniBuffs.gain_equation(state, eid)

	# 失去祝福/奇物
	if fx.has("loseBlessing"):
		for i in range(int(fx["loseBlessing"])):
			UniBuffs.lose_random_blessing(state)
	if fx.has("loseCurio"):
		for i in range(int(fx["loseCurio"])):
			UniBuffs.lose_random_curio(state)

	# 技能升级
	if fx.has("skillUpRandom"):
		_random_skill_up(state, int(fx["skillUpRandom"]))
	if fx.has("skillUpTarget"):
		var upgradable2: bool = false
		for t in state.get("team", []):
			if t.get("alive", false) and int(t.get("charId", 0)) != 11:
				upgradable2 = true
				break
		if upgradable2:
			outcome["needSkillTarget"] = int(fx["skillUpTarget"])
		else:
			state["log"].append("无可升级角色，放弃技能升级奖励")
	if fx.has("skillUpAll"):
		for t in state.get("team", []):
			if t.get("alive", false) and int(t.get("charId", 0)) != 11:
				apply_skill_up(state, int(t.get("index", 0)), int(fx["skillUpAll"]))
	if fx.has("tempSkillBoost"):
		state["tempSkillBoost"] = int(fx["tempSkillBoost"])

	# 急救包 / 位面生命上限
	if fx.has("medkit"):
		state["items"]["medkit"] = int(state.get("items", {}).get("medkit", 0)) + int(fx["medkit"])
	if fx.has("planeMaxHp"):
		state["planeMaxHpBoost"] = int(fx["planeMaxHp"])
		for t in state.get("team", []):
			t["maxHp"] = ceili(float(t.get("maxHp", 1)) * (100 + int(fx["planeMaxHp"])) / 100.0)

	# 下次战斗 buff
	if fx.has("buff"):
		state["nextBattleBuffs"][_s(fx["buff"])] = true

	# 事件战斗
	if fx.has("battle"):
		var b: Dictionary = fx["battle"]
		state["pendingEventReward"] = b.get("reward", null)
		outcome["battle"] = {
			"waves": [{"kind": b.get("kind", "normal"), "count": b.get("count", 3)}],
			"desc": "%s敌人 ×%d" % ["精英" if b.get("kind", "") == "elite" else "普通", int(b.get("count", 3))],
		}

	# 冒险
	if fx.has("gamble"):
		outcome["gamble"] = _run_gamble(state, fx["gamble"])
	if fx.get("fortuneCard", false):
		outcome["fortuneCard"] = _run_fortune_card(state)
	if fx.has("lottery"):
		outcome["lottery"] = _run_lottery(state, fx["lottery"])

	# 事件扣血致死
	var all_dead: bool = true
	for t in state.get("team", []):
		if t.get("alive", false):
			all_dead = false
			break
	if all_dead:
		state["gameOver"] = true

	return {"ok": true, "outcome": outcome, "eventId": event_id, "eventTitle": ev.get("title", "")}

## 处理祝福三选一的选择
static func choose_blessing_pick(state: Dictionary, picked_id: String) -> Dictionary:
	var queue: Array = state.get("pendingBlessingPicks", [])
	if queue.is_empty():
		return {"ok": false, "reason": "无可选祝福"}
	var cur: Dictionary = queue[0]
	if not cur.get("candidates", []).has(picked_id):
		return {"ok": false, "reason": "非法选择"}
	UniBuffs.gain_blessing(state, picked_id)
	queue.pop_front()
	if queue.is_empty():
		state["pendingBlessingPicks"] = []
	return {"ok": true, "remaining": queue.size()}

## 骰子游戏
static func _run_gamble(state: Dictionary, g: Dictionary) -> Dictionary:
	if not UniCore.spend_shards(state, int(g.get("cost", 0))):
		return {"failed": "碎片不足"}
	var point: int = randi() % 6 + 1
	var gain: int = point * int(g.get("mult", 10))
	UniCore.add_shards(state, gain)
	state["log"].append("骰子掷出 %d 点，获得 %d 碎片（投入 %d）" % [point, gain, int(g.get("cost", 0))])
	return {"point": point, "gain": gain, "cost": int(g.get("cost", 0))}

## 翻牌
static func _run_fortune_card(state: Dictionary) -> Dictionary:
	var r: float = randf()
	if r < 0.4:
		for i in range(2):
			var id: String = UniBuffs.roll_blessing(1, 3)
			if id != "":
				UniBuffs.gain_blessing(state, id, {"silent": true})
		return {"kind": "blessing", "count": 2}
	if r < 0.7:
		for i in range(2):
			var cid: String = UniBuffs.roll_curio(false)
			if cid != "":
				UniBuffs.gain_curio(state, cid, {"silent": true})
		return {"kind": "curio", "count": 2}
	var eid: String = UniBuffs.roll_equation(1, 3)
	if eid != "":
		UniBuffs.gain_equation(state, eid)
	return {"kind": "equation", "count": 1}

## 抽签单次
static func _draw_lottery_one(state: Dictionary) -> Dictionary:
	var r: float = randf()
	if r < 0.1:
		for i in range(3):
			var id: String = UniBuffs.roll_blessing(3, 3)
			if id != "":
				UniBuffs.gain_blessing(state, id, {"silent": true})
		return {"level": 4, "name": "大吉"}
	if r < 0.3:
		var cid: String = UniBuffs.roll_curio(false, 3, 3)
		if cid != "":
			UniBuffs.gain_curio(state, cid, {"silent": true})
		return {"level": 3, "name": "中吉"}
	if r < 0.7:
		for i in range(2):
			var id2: String = UniBuffs.roll_blessing(1, 2)
			if id2 != "":
				UniBuffs.gain_blessing(state, id2, {"silent": true})
		return {"level": 2, "name": "小吉"}
	_lose_team_hp_pct(state, 20.0)
	return {"level": 1, "name": "凶"}

## 抽签
static func _run_lottery(state: Dictionary, lot: Dictionary) -> Dictionary:
	if not UniCore.spend_shards(state, int(lot.get("cost", 0))):
		return {"failed": "碎片不足"}
	var best: Variant = null
	var draws: Array = []
	for i in range(int(lot.get("count", 1))):
		var d: Dictionary = _draw_lottery_one(state)
		draws.append(d)
		if best == null or int(d.get("level", 0)) > int(best.get("level", 0)):
			best = d
	var names: Array = []
	for d in draws:
		names.append(_s(d.get("name", "")))
	state["log"].append("抽签：%s（取%s）" % ["、".join(names), _s(best.get("name", ""))])
	return {"cost": int(lot.get("cost", 0)), "draws": draws, "best": _s(best.get("name", ""))}
