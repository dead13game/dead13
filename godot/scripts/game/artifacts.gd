class_name GameArtifacts
## 圣遗物系统（从 src/game/artifacts.js 移植）
## 纯逻辑层

const GameConstants = preload("res://scripts/game/constants.gd")

const ARTIFACTS: Dictionary = {
	1: {
		"id": 1,
		"name": "角斗士的终幕礼",
		"desc": "你对其他玩家造成的伤害提高50%（向上取整）",
		"type": "damage_boost",
		"damageMultiplier": 1.5,
	},
	2: {
		"id": 2,
		"name": "流浪大地的乐园",
		"desc": "你的攻击有50%概率触发暴击，暴击时伤害×2",
		"type": "crit",
		"critChance": 0.5,
		"critMultiplier": 2,
	},
}

static func get_artifact_data(artifact_id: Variant) -> Dictionary:
	return ARTIFACTS.get(artifact_id, {})

## 检查玩家是否可以使用圣言自明
static func can_use_holy_word(state: Dictionary, player: Dictionary) -> bool:
	if player.is_empty() or not player.get("alive", false):
		return false
	if player.get("breakCount", 0) < 8:
		return false
	if player.get("holyWordUses", 0) <= 0:
		return false
	if player.get("artifactActive", false):
		return false
	return state.get("step", "") == GameConstants.STEP["PICK_ACTION"]

## 发动圣言自明
static func execute_holy_word(state: Dictionary) -> bool:
	if state.get("step", "") != GameConstants.STEP["PICK_ACTION"]:
		return false
	var p: Dictionary = _current_player(state)
	if not can_use_holy_word(state, p):
		return false

	p["breakCount"] = p.get("breakCount", 0) - 8
	p["holyWordUses"] = p.get("holyWordUses", 0) - 1
	p["artifactActive"] = true
	p["artifactRoundsLeft"] = 2

	var art_data: Dictionary = get_artifact_data(p.get("artifactId"))
	var art_name: String = art_data.get("name", "未知") if not art_data.is_empty() else "未知"
	_add_log(state, "%s 发动圣言自明！圣遗物《%s》激活（%d次剩余）" % [p.get("name", "?"), art_name, p.get("holyWordUses", 0)])

	# 获得额外行动
	state["endTurn"] = false
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	_end_action(state)
	return true

## 对攻击值应用圣遗物效果
static func apply_artifact_damage_boost(attacker: Dictionary, attack_value: int, state: Dictionary) -> Dictionary:
	if not attacker.get("artifactActive", false) or attacker.get("artifactId") == null:
		return {"value": attack_value, "crit": false}

	var art_data: Dictionary = get_artifact_data(attacker.get("artifactId"))
	if art_data.is_empty():
		return {"value": attack_value, "crit": false}

	var final_value: int = attack_value

	if art_data.get("type") == "damage_boost":
		var boost: int = ceili(float(attack_value) * (float(art_data.get("damageMultiplier", 1.0)) - 1.0))
		final_value = attack_value + boost
		_add_log(state, "角斗士的终幕礼+%d" % boost)
	elif art_data.get("type") == "crit":
		if randf() < float(art_data.get("critChance", 0.0)):
			final_value = attack_value * int(art_data.get("critMultiplier", 2))
			_add_log(state, "流浪大地的乐园·暴击！伤害×2")
			return {"value": final_value, "crit": true}

	return {"value": final_value, "crit": false}

## 记录陷阱击破（明暗两张牌 +2）
static func record_trap_break(attacker: Dictionary, state: Dictionary) -> void:
	if attacker.is_empty() or not attacker.get("alive", false):
		return
	if attacker.get("artifactId") == null:
		return
	attacker["breakCount"] = attacker.get("breakCount", 0) + 2

## 记录防御牌击破（每张 +1）
static func record_defense_break(attacker: Dictionary, count: int, state: Dictionary) -> void:
	if attacker.is_empty() or not attacker.get("alive", false) or count <= 0:
		return
	if attacker.get("artifactId") == null:
		return
	attacker["breakCount"] = attacker.get("breakCount", 0) + count

## 新回合开始递减所有玩家的圣遗物剩余回合数
static func tick_artifact_rounds(state: Dictionary) -> void:
	for p in state.get("players", []):
		if not p.get("alive", false) or not p.get("artifactActive", false):
			continue
		p["artifactRoundsLeft"] = p.get("artifactRoundsLeft", 0) - 1
		if p["artifactRoundsLeft"] <= 0:
			p["artifactActive"] = false
			p["artifactRoundsLeft"] = 0
			_add_log(state, "%s 的圣遗物效果已结束" % p.get("name", "?"))

# ---- 依赖注入（简化版：直接由 GameState 设置） ----
static var _current_player_fn: Callable
static var _add_log_fn: Callable
static var _end_action_fn: Callable

static func inject_deps(current_player_fn: Callable, add_log_fn: Callable, end_action_fn: Callable) -> void:
	_current_player_fn = current_player_fn
	_add_log_fn = add_log_fn
	_end_action_fn = end_action_fn

static func _current_player(state: Dictionary) -> Dictionary:
	if _current_player_fn.is_valid():
		return _current_player_fn.call(state)
	return {}

static func _add_log(state: Dictionary, msg: String) -> void:
	if _add_log_fn.is_valid():
		_add_log_fn.call(state, msg)
	elif state.has("messageLog"):
		state["messageLog"].append(msg)

static func _end_action(state: Dictionary) -> void:
	if _end_action_fn.is_valid():
		_end_action_fn.call(state)
