class_name GameCombat
## 攻击 / 防御（从 src/game/combat.js 移植）
## 依赖：GameConstants / GameDeck / GameDamage / GameArtifacts / GameSoundEvents

const GameConstants = preload("res://scripts/game/constants.gd")
const GameDeck = preload("res://scripts/game/deck.gd")
const GameDamage = preload("res://scripts/game/damage.gd")
const GameArtifacts = preload("res://scripts/game/artifacts.gd")
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

static func _find_player(players: Array, index: Variant) -> Dictionary:
	for p in players:
		if p.get("index") == index:
			return p
	return {}

# ===== 攻击 =====

static func start_attack(state: Dictionary) -> void:
	if state.get("step", "") != GameConstants.STEP["PICK_ACTION"]:
		return
	var p: Dictionary = _current_player(state)
	if p.get("relations", {}).get("consecutiveGambles", 0) > 0:
		p["relations"]["consecutiveGambles"] = 0

	var can_attack: bool
	if state.get("matchContext") != null:
		can_attack = state.get("phase", "") != GameConstants.PHASE["PEACE"]
	else:
		can_attack = state.get("round", 0) >= 4

	if not can_attack:
		if state.get("phase", "") == GameConstants.PHASE["PEACE"]:
			_add_log(state, "和平阶段禁止攻击")
		else:
			_add_log(state, "第4回合后才能攻击")
		return

	_ensure_deck(state, 1)

	var r: Dictionary = GameDeck.draw_cards(state.get("deck", []), 1)
	var card: Dictionary = r["drawn"][0]
	state["deck"] = r["remaining"]
	card["faceUp"] = false

	GameSoundEvents.record_sound(state, "attack")
	state["pendingAttackCard"] = card
	state["step"] = GameConstants.STEP["ATTACK_SHOW_CARD"]
	_add_log(state, "%s 攻击 摸出%s" % [p.get("name", "?"), GameDeck.card_display(card)])

static func execute_attack(state: Dictionary, target_idx: int) -> void:
	var attacker: Dictionary = _current_player(state)
	var target: Dictionary = _find_player(state.get("players", []), target_idx)
	if target.is_empty() or not target.get("alive", false):
		return

	# 经典模式：不能攻击盟友
	if state.get("matchContext") == null and attacker.get("relations", {}).get("allyIndex") == target_idx:
		_add_log(state, "不能攻击盟友，请使用背刺")
		state["pendingAttackCard"] = null
		state["step"] = GameConstants.STEP["PICK_ACTION"]
		return

	# 联赛模式：不能攻击同队队友
	if attacker.get("teamId", -1) >= 0 and attacker.get("teamId", -1) == target.get("teamId", -1):
		_add_log(state, "不能攻击队友")
		state["pendingAttackCard"] = null
		state["step"] = GameConstants.STEP["PICK_ACTION"]
		return

	var card: Dictionary = state.get("pendingAttackCard", {})
	state["pendingAttackCard"] = null
	if card.is_empty():
		return

	var base_card_value: int = int(card.get("value", 0))
	var attack_value: int = 0
	var attack_cards: Array = []

	if state.has("pendingVentiCards") and state["pendingVentiCards"] != null:
		attack_cards = state["pendingVentiCards"]
		attack_value = int(attack_cards[0].get("value", 0)) + int(attack_cards[1].get("value", 0))
		state["pendingVentiCards"] = null
		_add_log(state, "%s 千风之诗 %s %s" % [attacker.get("name", "?"), GameDeck.card_display(attack_cards[0]), GameDeck.card_display(attack_cards[1])])
	else:
		attack_cards = [card]
		attack_value = base_card_value
		_add_log(state, "%s 攻击 %s" % [attacker.get("name", "?"), target.get("name", "?")])

	# 联赛模式卡牌加成
	var league_ctx = state.get("leagueContext")
	if league_ctx != null and league_ctx is Dictionary and league_ctx.has("cardBonus") and attacker.get("teamId", -1) == 0:
		var bonus: int = int(league_ctx["cardBonus"].get("attackBonus", 0) if league_ctx["cardBonus"] != null else 0)
		if bonus > 0:
			attack_value += bonus
			_add_log(state, "联赛攻击加成+%d" % bonus)

	# 天气加成
	if state.get("currentWeather", "") == "sun":
		attack_value += 2
		_add_log(state, "烈日当空")

	# 哥伦比娅弦月 +4
	if attacker.get("characterId", 0) == 7 and attacker.get("moonPhase", 0) == 0:
		attack_value += 4
		_add_log(state, "弦月加持")

	# 玛薇卡斗志
	if attacker.get("characterId", 0) == 6 and attacker.get("fightingSpirit", 0) > 0:
		var spirit: int = int(attacker.get("fightingSpirit", 0))
		attack_value += spirit
		_add_log(state, "斗志 %d层" % spirit)

	# 莉奈娅永久伤害加成
	if attacker.get("characterId", 0) == 9:
		var dmg_bonus: Dictionary = attacker.get("statusEffects", {}).get("damageBonus", {})
		if dmg_bonus.has(target_idx) and int(dmg_bonus[target_idx]) > 0:
			var bonus2: int = int(dmg_bonus[target_idx])
			attack_value += bonus2
			_add_log(state, "永久伤害+%d" % bonus2)

	# 联盟攻击加成
	var attacker_relations: Dictionary = attacker.get("relations", {})
	if attacker_relations.get("allyIndex") != null and attacker_relations.get("allianceTurns", 0) > 0 and attacker_relations.get("betrayalPenalty", 0) <= 0:
		attack_value += 2
		_add_log(state, "联盟攻击+2")

	# 打背刺者伤害+2
	var target_relations: Dictionary = target.get("relations", {})
	if attacker.get("index") != target.get("index") and target_relations.get("betrayalPenalty", 0) > 0:
		attack_value += 2
		_add_log(state, "惩罚背刺者+2")

	# 陷阱判定
	var trap_triggered: bool = false
	var had_trap: bool = target.get("trap") != null
	var attacker_status: Dictionary = attacker.get("statusEffects", {})
	if target.get("trap") != null and not attacker_status.get("ignoreTrapThisTurn", false):
		var trap: Dictionary = target["trap"]
		trap["faceUp"] = true
		var trap_value: int = int(trap.get("value", 0))
		_add_log(state, "%s 触发陷阱" % target.get("name", "?"))

		if attack_value < trap_value:
			GameSoundEvents.record_sound(state, "trap_reflect")
			_add_log(state, "陷阱反弹 %s" % attacker.get("name", "?"))
			state["grave"].append(target["trap"])
			if target.get("bait") != null:
				state["grave"].append(target["bait"])
			target["trap"] = null
			target["bait"] = null
			trap_triggered = true
			GameDamage.apply_damage(state, attacker, trap_value)
			_clear_gamble_penalty(state, target)
			for c in attack_cards:
				state["grave"].append(c)
			if not state.get("gameOver", false):
				_end_action(state)
			return
		elif attack_value == trap_value:
			GameSoundEvents.record_sound(state, "trap_tie")
			_add_log(state, "陷阱平局双方受伤")
			state["grave"].append(target["trap"])
			if target.get("bait") != null:
				state["grave"].append(target["bait"])
			target["trap"] = null
			target["bait"] = null
			trap_triggered = true
			GameArtifacts.record_trap_break(attacker, state)
			var tie_target_dmg: int = trap_value
			if attacker.get("artifactActive", false) and attacker.get("artifactId") != null:
				tie_target_dmg = int(GameArtifacts.apply_artifact_damage_boost(attacker, trap_value, state)["value"])
			GameDamage.apply_damage(state, attacker, trap_value)
			GameDamage.apply_damage(state, target, tie_target_dmg)
			_clear_gamble_penalty(state, target)
			if attacker.get("characterId", 0) == 6:
				attacker["fightingSpirit"] = mini(5, int(attacker.get("fightingSpirit", 0)) + 1)
				_add_log(state, "斗志 %d层" % attacker["fightingSpirit"])
			for c in attack_cards:
				state["grave"].append(c)
			if not state.get("gameOver", false):
				_end_action(state)
			return
		else:
			GameSoundEvents.record_sound(state, "trap_break")
			_add_log(state, "陷阱被破")
			GameArtifacts.record_trap_break(attacker, state)
			if attacker.get("characterId", 0) == 6:
				attacker["fightingSpirit"] = mini(5, int(attacker.get("fightingSpirit", 0)) + 1)
				_add_log(state, "斗志 %d层" % attacker["fightingSpirit"])
			state["grave"].append(target["trap"])
			if target.get("bait") != null:
				state["grave"].append(target["bait"])
			target["trap"] = null
			target["bait"] = null
			_clear_gamble_penalty(state, target)

	# 圣遗物伤害加成
	if not trap_triggered and attacker.get("artifactActive", false) and attacker.get("artifactId") != null:
		attack_value = int(GameArtifacts.apply_artifact_damage_boost(attacker, attack_value, state)["value"])

	# 联盟平摊
	if not trap_triggered and target_relations.get("allyIndex") != null and target_relations.get("allianceTurns", 0) > 0:
		var ally: Dictionary = _find_player(state.get("players", []), target_relations.get("allyIndex"))
		if not ally.is_empty() and ally.get("alive", false) and ally.get("index") != attacker.get("index"):
			var reduced: int = attack_value - 2
			var ally_dmg: int = floori(reduced / 3.0)
			var target_dmg: int = reduced - ally_dmg
			attack_value = target_dmg
			_add_log(state, "联盟平摊：%s %d点，%s %d点" % [target.get("name", "?"), target_dmg, ally.get("name", "?"), ally_dmg])
			GameDamage.apply_damage(state, ally, ally_dmg)

	# 防御判定
	var target_hp_before: int = int(target.get("hp", 0))
	var before_defense: int = target.get("defensePile", []).size()
	var remaining_dmg: int = GameDamage.apply_damage(state, target, attack_value)
	var actual_hp_lost: int = target_hp_before - int(target.get("hp", 0))
	var defense_consumed: int = before_defense - target.get("defensePile", []).size()
	GameArtifacts.record_defense_break(attacker, defense_consumed, state)

	# 玛薇卡击穿防御加斗志
	if attacker.get("characterId", 0) == 6 and defense_consumed > 0 and not trap_triggered:
		attacker["fightingSpirit"] = mini(5, int(attacker.get("fightingSpirit", 0)) + defense_consumed)
		_add_log(state, "斗志 %d层" % attacker["fightingSpirit"])

	# 联盟击杀奖励
	if not target.get("alive", true) and attacker_relations.get("allyIndex") != null:
		var ally2: Dictionary = _find_player(state.get("players", []), attacker_relations.get("allyIndex"))
		if not ally2.is_empty() and ally2.get("alive", false):
			ally2["relations"]["allyKillBonus"] = true
			_add_log(state, "%s 获得联盟击杀奖励" % ally2.get("name", "?"))

	# 风堇被动
	if attacker.get("characterId", 0) == 8:
		var heal_count: int = 0
		if had_trap and not trap_triggered:
			heal_count += 1
		heal_count += defense_consumed
		if heal_count > 0:
			attacker["hp"] = mini(int(attacker.get("maxHp", 0)), int(attacker.get("hp", 0)) + heal_count)
			_add_log(state, "%s 风堇被动回复 %d 点（当前 HP %d）" % [attacker.get("name", "?"), heal_count, attacker.get("hp", 0)])

	for c in attack_cards:
		state["grave"].append(c)
	if attacker_status.get("ignoreTrapThisTurn", false):
		attacker_status["ignoreTrapThisTurn"] = false

	if not state.get("gameOver", false):
		_end_action(state)

# ===== 防御 =====

static func execute_defense(state: Dictionary) -> void:
	if state.get("step", "") != GameConstants.STEP["PICK_ACTION"]:
		return
	var player: Dictionary = _current_player(state)
	if player.get("relations", {}).get("consecutiveGambles", 0) > 0:
		player["relations"]["consecutiveGambles"] = 0
	_ensure_deck(state, 1)

	var r: Dictionary = GameDeck.draw_cards(state.get("deck", []), 1)
	var card: Dictionary = r["drawn"][0]
	state["deck"] = r["remaining"]
	var original_value: int = int(card.get("value", 0))

	GameSoundEvents.record_sound(state, "defense")
	var card_value: int = original_value
	if state.get("currentWeather", "") == "trade":
		card_value += 2

	var league_ctx = state.get("leagueContext")
	if league_ctx != null and league_ctx is Dictionary and league_ctx.has("cardBonus") and player.get("teamId", -1) == 0:
		var def_bonus: int = int(league_ctx["cardBonus"].get("defenseBonus", 0) if league_ctx["cardBonus"] != null else 0)
		if def_bonus > 0:
			card_value += def_bonus

	if player.get("characterId", 0) == 7 and player.get("moonPhase", 0) == 1:
		card_value += 3

	var player_relations: Dictionary = player.get("relations", {})
	if player_relations.get("allyIndex") != null and player_relations.get("allianceTurns", 0) > 0 and player_relations.get("betrayalPenalty", 0) <= 0:
		card_value += 2
		_add_log(state, "联盟防御+2")

	card["defenseValue"] = card_value
	card["value"] = original_value
	card["faceUp"] = false
	player["defensePile"].append(card)
	_add_log(state, "%s 执行防御" % player.get("name", "?"))

	state["step"] = GameConstants.STEP["PICK_ACTION"]
	_end_action(state)

static func _clear_gamble_penalty(state: Dictionary, target: Dictionary) -> void:
	var rel: Dictionary = target.get("relations", {})
	if rel.get("gamblePenalty", false) or rel.get("consecutiveGambles", 0) > 0:
		rel["gamblePenalty"] = false
		rel["consecutiveGambles"] = 0
		_add_log(state, "%s 赌命惩罚结束" % target.get("name", "?"))
