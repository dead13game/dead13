class_name GameGamble
## 赌命 / 陷阱 / 饵（从 src/game/gamble.js 移植）
## 依赖：GameConstants / GameDeck / GameSoundEvents

const GameConstants = preload("res://scripts/game/constants.gd")
const GameDeck = preload("res://scripts/game/deck.gd")
const GameSoundEvents = preload("res://scripts/game/sound_events.gd")

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

# ===== 赌命 =====

static func execute_gamble(state: Dictionary) -> void:
	if state.get("step", "") != GameConstants.STEP["PICK_ACTION"]:
		return
	var player: Dictionary = _current_player(state)
	_ensure_deck(state)

	var draw_count: int = 2
	if player.get("characterId", 0) == 7 and player.get("moonPhase", 0) == 2:
		# 哥伦比娅新月
		draw_count = 3
	if state.get("currentWeather", "") == "wind":
		draw_count += 1

	var r: Dictionary = GameDeck.draw_cards(state.get("deck", []), draw_count)
	var drawn: Array = r["drawn"]
	for c in drawn:
		c["faceUp"] = true
	state["deck"] = r["remaining"]

	GameSoundEvents.record_sound(state, "gamble")
	_add_log(state, "%s 执行赌命" % player.get("name", "?"))

	# 连续赌命计数 + 赌命惩罚判定
	var relations: Dictionary = player.get("relations", {})
	relations["consecutiveGambles"] = int(relations.get("consecutiveGambles", 0)) + 1
	if int(relations.get("consecutiveGambles", 0)) >= 3 and not relations.get("gamblePenalty", false):
		relations["gamblePenalty"] = true
		_add_log(state, "%s 连续赌命3次，被标记惩罚！受到的伤害+1" % player.get("name", "?"))

	state["step"] = GameConstants.STEP["GAMBLE_PICK"]
	state["pendingGamble"] = {"drawnCards": drawn}

static func submit_gamble(state: Dictionary, trap_idx: int, bait_idx: int) -> void:
	if state.get("step", "") != GameConstants.STEP["GAMBLE_PICK"]:
		return
	var player: Dictionary = _current_player(state)
	var pending: Variant = state.get("pendingGamble")
	if pending == null:
		return
	var cards: Array = pending.get("drawnCards", [])
	if cards.is_empty() or trap_idx == bait_idx:
		return
	if trap_idx < 0 or trap_idx >= cards.size() or bait_idx < 0 or bait_idx >= cards.size():
		return

	var trap_card: Dictionary = cards[trap_idx]
	var bait_card: Dictionary = cards[bait_idx]

	if player.get("trap") != null:
		state["grave"].append(player["trap"])
	if player.get("bait") != null:
		state["grave"].append(player["bait"])

	trap_card["faceUp"] = false
	player["trap"] = trap_card
	bait_card["faceUp"] = true
	player["bait"] = bait_card

	for i in range(cards.size()):
		if i != trap_idx and i != bait_idx:
			state["grave"].append(cards[i])

	_add_log(state, "%s 设陷阱 诱饵%s" % [player.get("name", "?"), GameDeck.card_display(bait_card)])

	state["pendingGamble"] = null
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	_end_action(state)
