class_name GameAlliance
## 结盟 / 背刺（从 src/game/alliance.js 移植）
## 依赖：GameConstants / GameDeck / GameDamage

const GameConstants = preload("res://scripts/game/constants.gd")
const GameDeck = preload("res://scripts/game/deck.gd")
const GameDamage = preload("res://scripts/game/damage.gd")

static var _current_player_fn: Callable
static var _add_log_fn: Callable
static var _ensure_deck_fn: Callable
static var _end_action_fn: Callable

static func inject_deps(current_player_fn: Callable, add_log_fn: Callable, ensure_deck_fn: Callable, end_action_fn: Callable) -> void:
	_current_player_fn = current_player_fn
	_add_log_fn = add_log_fn
	_ensure_deck_fn = ensure_deck_fn
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

static func _ensure_deck(state: Dictionary, n: int = 1) -> void:
	if _ensure_deck_fn.is_valid():
		_ensure_deck_fn.call(state, n)

static func _end_action(state: Dictionary) -> void:
	if _end_action_fn.is_valid():
		_end_action_fn.call(state)

static func _find_player(players: Array, index: Variant) -> Dictionary:
	for p in players:
		if p.get("index") == index:
			return p
	return {}

# ===== 结盟 =====

static func start_ally(state: Dictionary) -> void:
	if state.get("phase", "") == "peace":
		return
	if state.get("players", []).size() < 4:
		_add_log(state, "仅4人局及以上可结盟")
		return
	var player: Dictionary = _current_player(state)
	var relations: Dictionary = player.get("relations", {})
	# 非赌命操作：重置连续赌命计数
	if relations.get("consecutiveGambles", 0) > 0:
		relations["consecutiveGambles"] = 0
	if relations.get("allyIndex") != null:
		_add_log(state, "已有盟友，不可再结盟")
		return
	if relations.get("betrayalPenalty", 0) > 0:
		_add_log(state, "背刺惩罚中，%d回合内不可结盟" % relations.get("betrayalPenalty", 0))
		return
	state["step"] = "allyPick"
	_add_log(state, "%s 选择结盟目标" % player.get("name", "?"))

static func execute_ally(state: Dictionary, target_idx: int) -> void:
	var player: Dictionary = _current_player(state)
	var target: Dictionary = _find_player(state.get("players", []), target_idx)
	if target.is_empty() or not target.get("alive", false):
		return
	if target.get("relations", {}).get("allyIndex") != null:
		_add_log(state, "%s 已有盟友" % target.get("name", "?"))
		return
	player["relations"]["allyIndex"] = target_idx
	player["relations"]["allianceTurns"] = 5
	target["relations"]["allyIndex"] = player.get("index")
	target["relations"]["allianceTurns"] = 5
	_add_log(state, "%s 与 %s 结盟（5回合）" % [player.get("name", "?"), target.get("name", "?")])
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	_end_action(state)

# ===== 背刺 =====

static func execute_betray(state: Dictionary) -> void:
	var player: Dictionary = _current_player(state)
	var relations: Dictionary = player.get("relations", {})
	# 非赌命操作：重置连续赌命计数
	if relations.get("consecutiveGambles", 0) > 0:
		relations["consecutiveGambles"] = 0
	if relations.get("allyIndex") == null:
		_add_log(state, "没有盟友可以背刺")
		return
	var ally: Dictionary = _find_player(state.get("players", []), relations.get("allyIndex"))
	if ally.is_empty() or not ally.get("alive", false):
		return

	_ensure_deck(state)
	var r: Dictionary = GameDeck.draw_cards(state.get("deck", []), 1)
	var card: Dictionary = r["drawn"][0]
	state["deck"] = r["remaining"]
	card["faceUp"] = true

	var dmg: int = int(card.get("value", 0)) + 4
	_add_log(state, "%s 背刺 %s！%s +4 = %d" % [player.get("name", "?"), ally.get("name", "?"), GameDeck.card_display(card), dmg])

	GameDamage.apply_damage(state, ally, dmg)

	# 惩罚
	for c in player.get("defensePile", []):
		c["faceUp"] = true
	if player.get("trap") != null:
		player["trap"]["faceUp"] = true
	if player.get("bait") != null:
		player["bait"]["faceUp"] = true
	relations["betrayalPenalty"] = 10
	relations["allianceTurns"] = 0
	GameDamage.dissolve_alliance(state, player)

	# 击杀奖励
	if not ally.get("alive", true):
		player["hp"] = player.get("maxHp", 0)
		for i in range(2):
			_ensure_deck(state)
			var rr: Dictionary = GameDeck.draw_cards(state.get("deck", []), 1)
			state["deck"] = rr["remaining"]
			rr["drawn"][0]["faceUp"] = false
			player["defensePile"].append(rr["drawn"][0])
		_add_log(state, "%s 击杀盟友！回满血+2防御" % player.get("name", "?"))

	_add_log(state, "%s 背刺惩罚：10回合不可结盟，防御/陷阱全明，被打伤害+2" % player.get("name", "?"))
	state["grave"].append(card)
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	_end_action(state)

# ===== 工具函数 =====

static func get_alliance_targets(state: Dictionary) -> Array:
	var player: Dictionary = _current_player(state)
	var result: Array = []
	for p in state.get("players", []):
		if p.get("alive", false) and p.get("index") != player.get("index") \
				and p.get("relations", {}).get("allyIndex") == null \
				and p.get("relations", {}).get("betrayalPenalty", 0) <= 0:
			result.append(p)
	return result

static func get_ally(state: Dictionary, player: Dictionary) -> Dictionary:
	if player.get("relations", {}).get("allyIndex") == null:
		return {}
	return _find_player(state.get("players", []), player["relations"]["allyIndex"])
