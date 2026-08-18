class_name UniCore
## 模拟宇宙共享工具（从 src/simuniverse/logic/uniState.js 抽出）
## 队伍创建 / 货币 / 被动同步 / 存档 / 菜月昴复活
## 供 uni_shop / uni_events / uni_combat 引用，避免循环依赖

const GameConstants = preload("res://scripts/game/constants.gd")
const UniConstants = preload("res://scripts/game/uni_constants.gd")
const UniBuffs = preload("res://scripts/game/uni_buffs.gd")

const DEFAULT_TEAM_IDS: Array = [1, 2, 3, 4]

static func _s(v: Variant) -> String:
	return "" if v == null else str(v)

static func _pick(arr: Array) -> Variant:
	if arr.is_empty():
		return null
	return arr[randi() % arr.size()]

## 持有指定奇物
static func has_curio(state: Dictionary, id: String) -> bool:
	for c in state.get("curios", []):
		if _s(c.get("id", "")) == id:
			return true
	return false

# ---- 队伍 ----

## 创建 4 人队伍（HP 基准 = 经典模式角色数值）
static func create_team(char_ids: Array) -> Array:
	var team: Array = []
	for i in range(char_ids.size()):
		var id: int = int(char_ids[i])
		var data: Dictionary = GameConstants.CHARACTERS.get(id, {})
		var hp: int = int(data.get("hp", 10))
		team.append({
			"index": i,
			"charId": id,
			"name": _s(data.get("name", "角色%d" % id)),
			"hp": hp,
			"maxHp": hp,
			"shield": 0,
			"alive": true,
			"skillLevel": 1,
			"skillCooldown": 0,
			"status": {
				"lockedBy": null,
				"stunned": false,
				"puppet": null,
				"healCut": 0,
				"dot": 0,
				"dotTurns": 0,
				"defensePile": [],
				"atkBonus": 0,
				"defBonus": 0,
				"spirit": 0,
				"spiritCap": 0,
				"dmgBuffPct": 0,
				"dmgBuffTurns": 0,
				"maxHpBuffPct": 0,
				"maxHpBuffTurns": 0,
				"origMaxHp": hp,
			},
			"buffs": [],
		})
	return team

# ---- 货币 ----

## 获得碎片（受奇物修正）
static func add_shards(state: Dictionary, n: int) -> int:
	if n > 0:
		if has_curio(state, "zhutie"):
			n = ceili(float(n) * UniBuffs.curio_val(state, "zhutie", "shardsMult"))
		if has_curio(state, "jidong"):
			n = ceili(float(n) * (1.0 - float(UniBuffs.CURIO_FX.get("jidong", {}).get("shardsCut", 0.5))))
		if has_curio(state, "tiancai"):
			n = ceili(float(n) * UniBuffs.curio_val(state, "tiancai", "shardsMult"))
	state["shards"] = maxi(0, int(state.get("shards", 0)) + n)
	return int(state["shards"])

static func spend_shards(state: Dictionary, n: int) -> bool:
	if int(state.get("shards", 0)) < n:
		return false
	state["shards"] = int(state.get("shards", 0)) - n
	return true

# ---- 被动技能同步（少女/玛薇卡） ----

## 技能受益成员：拥有者必含，其余按队伍 index 升序补足
static func beneficiary_team(state: Dictionary, owner_idx: int, count: int) -> Array:
	var set: Array = [owner_idx]
	var team: Array = state.get("team", [])
	for i in range(team.size()):
		if set.size() >= count:
			break
		if not set.has(i):
			set.append(i)
	return set

## 同步被动技能状态（玛薇卡斗志 / 少女攻防加成）
static func sync_passives(state: Dictionary) -> void:
	var team: Array = state.get("team", [])
	# 玛薇卡（6）
	var mav: Variant = null
	for t in team:
		if int(t.get("charId", 0)) == 6:
			mav = t
			break
	if mav != null:
		var sk: Dictionary = UniConstants.UNI_SKILLS.get(6, {})
		var lv: int = mini(int(mav.get("skillLevel", 1)), 10)
		var cap: int = int(sk.get("values", [])[lv - 1])
		var benef: Array = beneficiary_team(state, int(mav.get("index", 0)), int(sk.get("team", [])[lv - 1]))
		for t in team:
			if benef.has(int(t.get("index", -1))):
				t["status"]["spiritCap"] = cap
			else:
				t["status"]["spiritCap"] = 0
				t["status"]["spirit"] = 0
	# 哥伦比娅（7）
	var shao: Variant = null
	for t in team:
		if int(t.get("charId", 0)) == 7:
			shao = t
			break
	if shao != null:
		var sk2: Dictionary = UniConstants.UNI_SKILLS.get(7, {})
		var lv2: int = mini(int(shao.get("skillLevel", 1)), 10)
		var val: int = int(sk2.get("values", [])[lv2 - 1])
		var benef2: Array = beneficiary_team(state, int(shao.get("index", 0)), int(sk2.get("team", [])[lv2 - 1]))
		for t in team:
			var on: bool = benef2.has(int(t.get("index", -1)))
			t["status"]["atkBonus"] = val if on else 0
			t["status"]["defBonus"] = val if on else 0

# ---- 存档 / 菜月昴复活 ----

## 深拷贝 state（JSON 往返等价：GDScript duplicate(true) 足够）
static func serialize_uni(state: Dictionary) -> Dictionary:
	return state.duplicate(true)

## 恢复快照到 state（清空原键再逐个赋值，保持引用）
static func restore_state(state: Dictionary, snapshot: Dictionary) -> void:
	for key in state.keys():
		state.erase(key)
	for key in snapshot.keys():
		state[key] = snapshot[key]

## 菜月昴死亡回归：全灭时回滚到本层开始前（最多 3 次）
static func try_caiyueang_revive(state: Dictionary) -> bool:
	var team: Array = state.get("team", [])
	var has_caiyueang: bool = false
	for t in team:
		if int(t.get("charId", 0)) == 11:
			has_caiyueang = true
			break
	if not has_caiyueang:
		return false
	if int(state.get("caiyueangLoads", 0)) >= UniConstants.CAIYUEANG_MAX_LOADS:
		return false
	if not state.has("savepoint"):
		return false
	var snapshot: Dictionary = state.get("savepoint", {}).duplicate(true)
	restore_state(state, snapshot)
	state["caiyueangLoads"] = int(state.get("caiyueangLoads", 0)) + 1
	state["gameOver"] = false
	state["victory"] = false
	state["combat"] = null
	state["soundQueue"] = []
	state["log"].append("菜月昴发动死亡回归（%d/%d）" % [int(state["caiyueangLoads"]), UniConstants.CAIYUEANG_MAX_LOADS])
	return true

## 记录本层存档点
static func record_savepoint(state: Dictionary) -> void:
	state["savepoint"] = serialize_uni(state)

## 反序列化（外部读档用）
static func deserialize_uni(state: Dictionary, data: Variant) -> bool:
	if data == null or not data is Dictionary:
		return false
	restore_state(state, data)
	return true
