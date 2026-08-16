class_name GameCaiyueang
## 菜月昴·死亡回归（从 src/game/caiyueang.js 移植）
## 存档 / 读档 / 深拷贝

const GameConstants = preload("res://scripts/game/constants.gd")

static var _current_player_fn: Callable
static var _add_log_fn: Callable
static var _end_action_fn: Callable
static var _check_game_over_fn: Callable

static func inject_deps(current_player_fn: Callable, add_log_fn: Callable, end_action_fn: Callable, check_game_over_fn: Callable) -> void:
	_current_player_fn = current_player_fn
	_add_log_fn = add_log_fn
	_end_action_fn = end_action_fn
	_check_game_over_fn = check_game_over_fn

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

static func _check_game_over(state: Dictionary) -> void:
	if _check_game_over_fn.is_valid():
		_check_game_over_fn.call(state)

# ===== 深拷贝（用于存档） =====

static func _clone_cards(cards: Array) -> Array:
	var result: Array = []
	for c in cards:
		result.append(c.duplicate(true))
	return result

static func deep_clone_state(state: Dictionary) -> Dictionary:
	var players: Array = []
	for p in state.get("players", []):
		var se: Dictionary = p.get("statusEffects", {})
		var rel: Dictionary = p.get("relations", {})
		players.append({
			"index": p.get("index"),
			"name": p.get("name"),
			"characterId": p.get("characterId"),
			"hp": p.get("hp"),
			"maxHp": p.get("maxHp"),
			"alive": p.get("alive"),
			"defensePile": _clone_cards(p.get("defensePile", [])),
			"trap": p.get("trap").duplicate(true) if p.get("trap") != null else null,
			"bait": p.get("bait").duplicate(true) if p.get("bait") != null else null,
			"skillUses": p.get("skillUses"),
			"fightingSpirit": p.get("fightingSpirit"),
			"moonPhase": p.get("moonPhase"),
			"loadUses": p.get("loadUses"),
			"statusEffects": {
				"ignoreTrapThisTurn": se.get("ignoreTrapThisTurn", false),
				"extraAction": se.get("extraAction", false),
				"stealTarget": se.get("stealTarget").duplicate(true) if se.get("stealTarget") != null else null,
				"dotTarget": se.get("dotTarget").duplicate(true) if se.get("dotTarget") != null else null,
				"damageBonus": se.get("damageBonus", {}).duplicate(true),
				"frozenBy": se.get("frozenBy"),
				"savepoint": null,
			},
			"relations": {
				"allyIndex": rel.get("allyIndex"),
				"allianceTurns": rel.get("allianceTurns"),
				"betrayalPenalty": rel.get("betrayalPenalty"),
				"allyKillBonus": rel.get("allyKillBonus"),
			},
			"artifactId": p.get("artifactId"),
			"breakCount": p.get("breakCount"),
			"holyWordUses": p.get("holyWordUses"),
			"artifactActive": p.get("artifactActive"),
			"artifactRoundsLeft": p.get("artifactRoundsLeft"),
		})
	return {
		"players": players,
		"deck": _clone_cards(state.get("deck", [])),
		"grave": _clone_cards(state.get("grave", [])),
		"currentPlayerIndex": state.get("currentPlayerIndex"),
		"phase": state.get("phase"),
		"step": state.get("step"),
		"round": state.get("round"),
		"currentWeather": state.get("currentWeather"),
		"peaceRounds": state.get("peaceRounds"),
	}

# ===== 从存档恢复 =====

static func restore_state(state: Dictionary, sp: Dictionary) -> void:
	var saved_players: Array = sp.get("players", [])
	for i in range(saved_players.size()):
		if i >= state.get("players", []).size():
			break
		var saved: Dictionary = saved_players[i]
		var p: Dictionary = state["players"][i]
		for key in saved.keys():
			p[key] = saved[key]
		# 嵌套结构单独处理
		p["defensePile"] = _clone_cards(saved.get("defensePile", []))
		p["trap"] = saved.get("trap").duplicate(true) if saved.get("trap") != null else null
		p["bait"] = saved.get("bait").duplicate(true) if saved.get("bait") != null else null
		var saved_se: Dictionary = saved.get("statusEffects", {})
		if not saved_se.is_empty():
			var se: Dictionary = p.get("statusEffects", {})
			se["stealTarget"] = saved_se.get("stealTarget").duplicate(true) if saved_se.get("stealTarget") != null else null
			se["dotTarget"] = saved_se.get("dotTarget").duplicate(true) if saved_se.get("dotTarget") != null else null
			se["damageBonus"] = saved_se.get("damageBonus", {}).duplicate(true)
		p["loadUses"] = saved.get("loadUses")
		var saved_rel: Dictionary = saved.get("relations", {})
		if not saved_rel.is_empty():
			var rel: Dictionary = p.get("relations", {})
			rel["allyIndex"] = saved_rel.get("allyIndex")
			rel["allianceTurns"] = saved_rel.get("allianceTurns")
			rel["betrayalPenalty"] = saved_rel.get("betrayalPenalty")
			rel["allyKillBonus"] = saved_rel.get("allyKillBonus")
	state["deck"] = _clone_cards(sp.get("deck", []))
	state["grave"] = _clone_cards(sp.get("grave", []))
	state["currentPlayerIndex"] = sp.get("currentPlayerIndex", 0)
	state["phase"] = sp.get("phase", "setup")
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	state["round"] = sp.get("round", 1)
	state["currentWeather"] = sp.get("currentWeather")
	state["peaceRounds"] = sp.get("peaceRounds", 4)
	_check_game_over(state)

# ===== 死亡回归 =====

static func execute_skill_caiyueang_entry(state: Dictionary) -> void:
	var player: Dictionary = _current_player(state)
	state["_caiyueangMode"] = true
	state["step"] = GameConstants.STEP["CAIYUEANG_PICK"]
	_add_log(state, "%s 死亡回归 — 选择存档或读档" % player.get("name", "?"))

static func execute_caiyueang_save(state: Dictionary) -> void:
	var player: Dictionary = _current_player(state)
	player["statusEffects"]["savepoint"] = deep_clone_state(state)
	state["_caiyueangMode"] = null
	state["endTurn"] = false
	_add_log(state, "%s 存档完成" % player.get("name", "?"))
	_end_action(state)

static func execute_caiyueang_load(state: Dictionary) -> void:
	var player: Dictionary = _current_player(state)
	var savepoint: Variant = player.get("statusEffects", {}).get("savepoint")
	if savepoint == null:
		_add_log(state, "没有存档点可以回溯")
		state["_caiyueangMode"] = null
		state["step"] = GameConstants.STEP["PICK_ACTION"]
		return
	if int(player.get("loadUses", 0)) <= 0:
		_add_log(state, "读档次数已用完")
		state["_caiyueangMode"] = null
		state["step"] = GameConstants.STEP["PICK_ACTION"]
		return
	var subaru_idx: int = int(player.get("index", 0))
	restore_state(state, savepoint)
	var subaru: Dictionary = state["players"][subaru_idx] if subaru_idx < state.get("players", []).size() else {}
	if subaru.is_empty():
		return
	subaru["loadUses"] = int(subaru.get("loadUses", 0)) - 1
	state["endTurn"] = false
	_add_log(state, "%s 死亡回归！回溯到存档点（剩余读档%d次）" % [subaru.get("name", "?"), subaru.get("loadUses", 0)])
	state["_caiyueangMode"] = null
	_end_action(state)
