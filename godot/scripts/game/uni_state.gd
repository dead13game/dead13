class_name UniState
## 模拟宇宙状态机（从 src/simuniverse/logic/uniState.js 移植）
## 位面/层推进 / 区域生成 / 货币 / 队伍 / 存档
## 依赖：uni_core（队伍/货币/被动/存档）/ uni_shop / uni_events / uni_buffs / uni_constants

const GameConstants = preload("res://scripts/game/constants.gd")
const UniConstants = preload("res://scripts/game/uni_constants.gd")
const UniBuffs = preload("res://scripts/game/uni_buffs.gd")
const UniCore = preload("res://scripts/game/uni_core.gd")
const UniShop = preload("res://scripts/game/uni_shop.gd")
const UniEvents = preload("res://scripts/game/uni_events.gd")
const UniCombat = preload("res://scripts/game/uni_combat.gd")
const UniSkills = preload("res://scripts/game/uni_skills.gd")

static var _injected: bool = false

static func _s(v: Variant) -> String:
	return "" if v == null else str(v)

static func _pick(arr: Array) -> Variant:
	if arr.is_empty():
		return null
	return arr[randi() % arr.size()]

## 注入 execute_uni_skill（打破 uni_combat ↔ uni_skills 循环依赖）
static func _ensure_injected() -> void:
	if _injected:
		return
	_injected = true
	UniCombat.inject_execute_skill(Callable(UniSkills, "execute_uni_skill"))

# ---- 创建 ----

## 创建模拟宇宙状态
static func create_uni_state(char_ids: Array = []) -> Dictionary:
	_ensure_injected()
	var ids: Array = char_ids if not char_ids.is_empty() else UniCore.DEFAULT_TEAM_IDS
	var state: Dictionary = {
		"floor": 1,
		"plane": 1,
		"region": null,
		"combat": null,
		"pendingChoice": null,
		"team": UniCore.create_team(ids),
		"shards": int(UniConstants.UNI_CONST["START_SHARDS"]),
		"blessings": [],
		"curios": [],
		"equations": [],
		"heat": 0,
		"overwritePrice": int(UniConstants.UNI_CONST["OVERWRITE_BASE"]),
		"savepoints": [],
		"caiyueangLoads": 0,
		"gameOver": false,
		"victory": false,
		"log": [],
		"soundQueue": [],
		"pendingBlessingPicks": [],
		"pendingEventReward": null,
		"items": {"medkit": 0},
		"planeMaxHpBoost": 0,
		"nextBattleBuffs": {},
		"tempSkillBoost": 0,
		"jarBrain": 0,
		"uniFirstUltUsed": false,
	}
	# 第 1 层固定战斗（新手引导）
	state["region"] = generate_region(state, UniConstants.get_layer_type(int(state["floor"])))
	UniCore.sync_passives(state)
	UniCore.record_savepoint(state)
	return state

# ---- 区域生成 ----

## 生成区域内容
static func generate_region(state: Dictionary, type: String) -> Variant:
	var meta: Dictionary = UniConstants.REGION_META.get(type, {})
	if meta.is_empty():
		return null
	var region: Dictionary = {"type": type, "name": _s(meta.get("name", "")), "icon": _s(meta.get("icon", ""))}
	if type == "battle":
		region["waves"] = UniConstants.BATTLE_WAVES
	elif type == "elite":
		region["waves"] = UniConstants.ELITE_BATTLE
	elif type == "transform":
		region["waves"] = UniConstants.TRANSFORM_WAVES
	elif type == "boss":
		region["waves"] = [{"kind": "boss", "count": 1}]
	elif type == "event" or type == "reward" or type == "adventure":
		if type == "event":
			region["eventIds"] = [UniEvents.roll_event("event"), UniEvents.roll_event("event")]
			region["eventIdx"] = 0
		else:
			region["eventId"] = UniEvents.roll_event(type)
	return region

## 普通层：从抽取池随机抽 2 个内容供玩家 2 选 1
static func roll_normal_choice(state: Dictionary) -> Array:
	var options: Array = [_pick(UniConstants.NORMAL_POOL), _pick(UniConstants.NORMAL_POOL)]
	state["pendingChoice"] = {"options": options}
	return options

## 普通层 2 选 1
static func choose_normal_content(state: Dictionary, idx: int) -> Dictionary:
	var pc: Variant = state.get("pendingChoice", null)
	if pc == null:
		return {"ok": false, "reason": "无候选内容"}
	if idx != 0 and idx != 1:
		return {"ok": false, "reason": "无候选内容"}
	var type: String = _s(pc["options"][idx])
	state["combat"] = null
	state["region"] = generate_region(state, type)
	state["pendingChoice"] = null
	enter_region(state)
	return {"ok": true, "type": type}

## 进入区域时立即生效的效果
static func enter_region(state: Dictionary) -> void:
	var r: Variant = state.get("region", null)
	if r == null:
		return
	state["overwritePrice"] = int(UniConstants.UNI_CONST["OVERWRITE_BASE"])
	# 奇物：永动咕咕钟
	if UniCore.has_curio(state, "yongdong"):
		var loss: int = ceili(float(state.get("shards", 0)) * float(UniBuffs.CURIO_FX.get("yongdong", {}).get("shardsPct", 4)) / 100.0)
		state["shards"] = maxi(0, int(state.get("shards", 0)) - loss)
		state["log"].append("永动咕咕钟：失去 %d 宇宙碎片" % loss)
	# 奇物：监督之眼
	if UniCore.has_curio(state, "eye"):
		state["shards"] = maxi(0, int(state.get("shards", 0)) - int(UniBuffs.CURIO_FX.get("eye", {}).get("cost", 50)))
		state["log"].append("监督之眼：失去碎片")
	# 奇物：有形幸运
	if UniCore.has_curio(state, "luck") and int(state.get("shards", 0)) < 250:
		UniCore.add_shards(state, int(UniBuffs.CURIO_FX.get("luck", {}).get("floor", 250)) - int(state.get("shards", 0)))
		state["log"].append("有形幸运：宇宙碎片补足")
	var r_type: String = _s(r.get("type", ""))
	if r_type == "fortune":
		UniCore.add_shards(state, int(UniConstants.REGION_REWARD.get("fortune", {}).get("shards", 0)))
	elif r_type == "rest":
		for t in state.get("team", []):
			if t.get("alive", false):
				t["hp"] = float(t.get("maxHp", 1))
	elif r_type == "boss":
		UniShop.reset_workbench(state)
	elif r_type == "shop":
		UniShop.create_shop_stock(state)
		if UniCore.has_curio(state, "heping"):
			UniCore.add_shards(state, int(UniBuffs.CURIO_FX.get("heping", {}).get("gain", 150)))
			state["log"].append("和平的代价：+碎片")
	elif r_type == "oddity":
		var effect: Variant = _pick(UniConstants.ODDITY_EFFECTS)
		r["oddityEffect"] = effect
		if _s(effect) == "shards":
			UniCore.add_shards(state, UniConstants.ODDITY_SHARDS)
		elif _s(effect) == "workbench":
			state["heat"] = int(UniConstants.UNI_CONST["BOSS_HEAT"])
		elif _s(effect) == "strengthen":
			var boosted: int = _strengthen_random_blessings(state, UniConstants.ODDITY_STRENGTHEN_COUNT)
			r["boostedCount"] = boosted
	# 奇物区域钩子
	_apply_curio_region_hooks(state, r)

## 奇物进入区域钩子
static func _apply_curio_region_hooks(state: Dictionary, r: Dictionary) -> void:
	var r_type: String = _s(r.get("type", ""))
	var battle_like: bool = ["battle", "elite", "boss", "transform"].has(r_type)
	var soft_like: bool = ["event", "reward", "adventure", "fortune"].has(r_type)
	var remove_curio := func(id: String) -> void:
		var curios: Array = state.get("curios", [])
		for i in range(curios.size()):
			if _s(curios[i].get("id", "")) == id:
				curios.remove_at(i)
				break
	# 祭献投枪
	if UniCore.has_curio(state, "jixian"):
		if battle_like:
			var gain: int = int(UniBuffs.CURIO_FX.get("jixian", {}).get("battleGain", 35))
			if _s(state.get("lastRegionType", "")) == r_type:
				gain += int(UniBuffs.CURIO_FX.get("jixian", {}).get("chainGain", 35))
			UniCore.add_shards(state, gain)
		elif soft_like:
			UniCore.add_shards(state, -int(UniBuffs.CURIO_FX.get("jixian", {}).get("softLoss", 35)))
	# 鲁珀特帝国机械齿轮
	if UniCore.has_curio(state, "lubeite"):
		UniCore.add_shards(state, int(UniBuffs.CURIO_FX.get("lubeite", {}).get("gain", 50)))
		if int(state.get("shards", 0)) > int(UniBuffs.CURIO_FX.get("lubeite", {}).get("cap", 750)):
			remove_curio.call("lubeite")
			UniCore.add_shards(state, -int(UniBuffs.CURIO_FX.get("lubeite", {}).get("penalty", 750)))
			state["log"].append("鲁珀特帝国机械齿轮损毁")
	# 分裂金币
	if UniCore.has_curio(state, "fenlie_jb"):
		UniCore.add_shards(state, ceili(float(state.get("shards", 0)) * float(UniBuffs.CURIO_FX.get("fenlie_jb", {}).get("shardsPct", 5)) / 100.0))
	# 昨天的重量
	if UniCore.has_curio(state, "zuotian"):
		UniCore.add_shards(state, int(UniBuffs.CURIO_FX.get("zuotian", {}).get("gain", 35)))
		state["zuotianShrinks"] = int(state.get("zuotianShrinks", 0)) + 1
		if int(state["zuotianShrinks"]) >= int(UniBuffs.CURIO_FX.get("zuotian", {}).get("triggers", 3)):
			remove_curio.call("zuotian")
	# 睡眠和死亡
	if UniCore.has_curio(state, "shui") and int(state.get("shards", 0)) <= int(UniBuffs.CURIO_FX.get("shui", {}).get("shardsMax", 10)):
		remove_curio.call("shui")
		UniCore.add_shards(state, int(UniBuffs.CURIO_FX.get("shui", {}).get("gain", 400)))
		state["log"].append("睡眠和死亡：损毁并 +400 碎片")
	# 无爱之尘
	if UniCore.has_curio(state, "wulian") and state.get("curios", []).size() >= int(UniBuffs.CURIO_FX.get("wulian", {}).get("minCurios", 4)):
		remove_curio.call("wulian")
		for i in range(int(UniBuffs.CURIO_FX.get("wulian", {}).get("loseCount", 3))):
			if state.get("curios", []).is_empty():
				break
			UniBuffs.lose_random_curio(state)
		var eq: String = UniBuffs.roll_equation(1, 3)
		if eq != "":
			UniBuffs.gain_equation(state, eq)
	# 临时赌资
	if UniCore.has_curio(state, "linji"):
		state["linjiRegions"] = int(state.get("linjiRegions", 0)) + 1
		if int(state["linjiRegions"]) >= int(UniBuffs.CURIO_FX.get("linji", {}).get("regions", 5)):
			remove_curio.call("linji")
			UniCore.add_shards(state, -int(UniBuffs.CURIO_FX.get("linji", {}).get("penalty", 450)))
			state["log"].append("临时赌资：损毁并 -450 碎片")
	# 海绵王
	if UniCore.has_curio(state, "haimian"):
		for t in state.get("team", []):
			if not t.get("alive", false):
				continue
			t["hp"] = maxf(1.0, ceili(float(t.get("hp", 0)) * (1.0 - float(UniBuffs.CURIO_FX.get("haimian", {}).get("hpCut", 0.8)))))
			t["maxHp"] = ceili(float(t.get("maxHp", 1)) * (1 + float(UniBuffs.CURIO_FX.get("haimian", {}).get("maxHpMult", 10)) / 100.0))
		state["haimianCount"] = int(state.get("haimianCount", 0)) + 1
		if int(state["haimianCount"]) >= int(UniBuffs.CURIO_FX.get("haimian", {}).get("triggers", 4)):
			remove_curio.call("haimian")
	# 菠萝
	if UniCore.has_curio(state, "bobo"):
		state["boboCount"] = int(state.get("boboCount", 0)) + 1
		if int(state["boboCount"]) >= 3:
			remove_curio.call("bobo")
			for t in state.get("team", []):
				t["hp"] = maxf(1.0, ceili(float(t.get("hp", 0)) * 0.01))
			state["log"].append("菠萝：损毁，全队损失 99% 生命")
	# 水上书
	if UniCore.has_curio(state, "shuishang"):
		for t in state.get("team", []):
			t["hp"] = float(t.get("maxHp", 1))
			if not t.get("alive", false):
				t["alive"] = true
				t["hp"] = maxf(1.0, ceili(float(t.get("maxHp", 1)) * 0.5))
			t["status"]["stunned"] = false
			t["status"]["puppet"] = null
		state["log"].append("水上书：全队回满并复活")
	# 大饼干
	if UniCore.has_curio(state, "dabinggan"):
		var star_range: Array = UniBuffs.CURIO_FX.get("dabinggan", {}).get("starRange", [1, 2])
		var bid: String = UniBuffs.roll_blessing(int(star_range[0]), int(star_range[1]))
		if bid != "":
			UniBuffs.gain_blessing(state, bid)
		state["dabingganCount"] = int(state.get("dabingganCount", 0)) + 1
		if int(state["dabingganCount"]) >= int(UniBuffs.CURIO_FX.get("dabinggan", {}).get("triggers", 2)):
			remove_curio.call("dabinggan")
	# 纯美之袍
	if UniCore.has_curio(state, "chunmei_pao") and battle_like:
		UniCore.add_shards(state, ceili(float(state.get("shards", 0)) * float(UniBuffs.CURIO_FX.get("chunmei_pao", {}).get("shardsPct", 10)) / 100.0))
	# 快乐电视机
	if UniCore.has_curio(state, "kuaile") and _s(state.get("lastRegionType", "")) == r_type:
		UniCore.add_shards(state, -int(UniBuffs.CURIO_FX.get("kuaile", {}).get("cost", 25)))
		UniBuffs.lose_random_curio(state)
	# 记录上次区域类型
	state["lastRegionType"] = r_type

## 随机强化 N 个祝福
static func _strengthen_random_blessings(state: Dictionary, n: int) -> int:
	var blessings: Array = state.get("blessings", [])
	var idxs: Array = []
	for i in range(blessings.size()):
		idxs.append(i)
	for i in range(idxs.size() - 1, 0, -1):
		var j: int = randi() % (i + 1)
		var tmp = idxs[i]
		idxs[i] = idxs[j]
		idxs[j] = tmp
	var chosen: Array = idxs.slice(0, mini(n, idxs.size()))
	for i in chosen:
		blessings[int(i)]["heatEnhanced"] = int(blessings[int(i)].get("heatEnhanced", 1)) * 2
	state["log"].append("奇遇：强化了 %d 个随机祝福（效果 ×2）" % chosen.size())
	return chosen.size()

# ---- 层推进 ----

## 当前层是否为普通层
static func is_normal_floor(state: Dictionary) -> bool:
	return UniConstants.get_layer_type(int(state.get("floor", 1))) == "normal"

## 推进到下一层
static func advance_floor(state: Dictionary) -> Variant:
	if state.get("gameOver", false):
		return null
	state["combat"] = null
	state["floor"] = int(state.get("floor", 1)) + 1
	state["plane"] = UniConstants.get_plane(int(state["floor"]))
	state["region"] = null
	state["pendingChoice"] = null
	var type: String = UniConstants.get_layer_type(int(state["floor"]))
	if type == "normal":
		roll_normal_choice(state)
	else:
		state["region"] = generate_region(state, type)
		enter_region(state)
	UniCore.record_savepoint(state)
	return {"type": type, "region": state.get("region", null)}

# ---- 复活（休整） ----

## 休整复活：花费 150 碎片复活 1 名死亡角色
static func revive_at_rest(state: Dictionary, char_index: int) -> Dictionary:
	var team: Array = state.get("team", [])
	if char_index < 0 or char_index >= team.size():
		return {"ok": false, "reason": "目标未死亡"}
	var t: Dictionary = team[char_index]
	if t.get("alive", false):
		return {"ok": false, "reason": "目标未死亡"}
	if not UniCore.spend_shards(state, int(UniConstants.UNI_CONST["RESURRECT_COST"])):
		return {"ok": false, "reason": "宇宙碎片不足"}
	t["alive"] = true
	t["hp"] = maxf(1.0, ceili(float(t.get("maxHp", 1)) * 0.5))
	t["status"]["defensePile"] = []
	t["status"]["stunned"] = false
	t["status"]["puppet"] = null
	t["status"]["lockedBy"] = null
	return {"ok": true, "cost": int(UniConstants.UNI_CONST["RESURRECT_COST"]), "hp": float(t["hp"])}

# ---- 存档 ----

## 序列化（JSON 往返等价：deep copy）
static func serialize_uni(state: Dictionary) -> Dictionary:
	return UniCore.serialize_uni(state)

## 反序列化
static func deserialize_uni(state: Dictionary, data: Variant) -> bool:
	return UniCore.deserialize_uni(state, data)
