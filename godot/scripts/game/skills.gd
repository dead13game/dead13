class_name GameSkills
## 角色技能（从 src/game/skills.js 移植）
## 依赖：GameConstants / GameDeck / GameDamage / GameSoundEvents / GameCaiyueang

const GameConstants = preload("res://scripts/game/constants.gd")
const GameDeck = preload("res://scripts/game/deck.gd")
const GameDamage = preload("res://scripts/game/damage.gd")
const GameSoundEvents = preload("res://scripts/game/sound_events.gd")
const GameCaiyueang = preload("res://scripts/game/caiyueang.gd")

static var _current_player_fn: Callable
static var _add_log_fn: Callable
static var _ensure_deck_fn: Callable
static var _end_action_fn: Callable

static var _shield_seq: int = 0

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

# ===== 技能入口 =====

static func can_use_skill(state: Dictionary, player: Dictionary) -> bool:
	if not player.get("alive", false):
		return false
	if GameConstants.get_char_data(player).get("skillType", "") != "active":
		return false
	if player.get("characterId", 0) == 11:
		return state.get("step", "") == GameConstants.STEP["PICK_ACTION"]
	if int(player.get("skillUses", 0)) <= 0:
		return false
	if state.get("currentWeather", "") == "arms":
		return false

	# 圣遗物效果期间，禁用温迪/雷神/风堇的主动伤害大招
	var restricted: Array = [1, 3, 8]  # 温迪, 雷电将军, 风堇
	if player.get("artifactActive", false) and restricted.has(player.get("characterId", 0)):
		return false

	return state.get("step", "") == GameConstants.STEP["PICK_ACTION"]

static func execute_skill(state: Dictionary) -> bool:
	if state.get("step", "") != GameConstants.STEP["PICK_ACTION"]:
		return false
	var player: Dictionary = _current_player(state)
	if not can_use_skill(state, player):
		return false

	# 非赌命操作：重置连续赌命计数
	var relations: Dictionary = player.get("relations", {})
	if relations.get("consecutiveGambles", 0) > 0:
		relations["consecutiveGambles"] = 0

	GameSoundEvents.record_sound(state, "skill")

	match int(player.get("characterId", 0)):
		1:
			return start_skill_venti(state)
		2:
			return execute_skill_zhongli(state)
		3:
			return execute_skill_raiden_pick(state)
		4:
			return start_skill_nahida(state)
		5:
			return execute_skill_furina(state)
		8:
			return execute_skill_fenjin(state)
		9:
			return execute_skill_liniya(state)
		10:
			return execute_skill_aimiliya(state)
		11:
			GameCaiyueang.execute_skill_caiyueang_entry(state)
			return true
		_:
			return false

# ===== 温迪（千风之诗） =====

static func start_skill_venti(state: Dictionary) -> bool:
	var player: Dictionary = _current_player(state)
	if state.get("phase", "") == GameConstants.PHASE["PEACE"]:
		_add_log(state, "和平阶段禁止攻击")
		return false
	if int(state.get("round", 0)) < 10:
		_add_log(state, "第10回合后才能使用")
		return false

	_ensure_deck(state, 2)
	var r: Dictionary = GameDeck.draw_cards(state.get("deck", []), 2)
	var cards: Array = r["drawn"]
	for c in cards:
		c["faceUp"] = false
	state["deck"] = r["remaining"]

	state["pendingVentiCards"] = cards
	state["pendingAttackCard"] = {
		"id": cards[0].get("id"),
		"suit": cards[0].get("suit"),
		"rank": cards[0].get("rank"),
		"value": int(cards[0].get("value", 0)) + int(cards[1].get("value", 0)),
		"faceUp": true,
	}
	state["step"] = GameConstants.STEP["ATTACK_SHOW_CARD"]
	player["skillUses"] = int(player.get("skillUses", 0)) - 1
	_add_log(state, "%s 千风之诗 %s %s" % [player.get("name", "?"), GameDeck.card_display(cards[0]), GameDeck.card_display(cards[1])])
	for c in cards:
		c["faceUp"] = true
	return true

# ===== 钟离（坚如磐石） =====

static func execute_skill_zhongli(state: Dictionary) -> bool:
	var player: Dictionary = _current_player(state)
	var lost_hp: int = int(player.get("maxHp", 0)) - int(player.get("hp", 0))
	var shield_value: int = 18 + lost_hp * 2
	_shield_seq += 1
	var shield: Dictionary = {
		"id": "shield-zhongli-%d" % _shield_seq,
		"suit": "",
		"rank": "盾",
		"value": shield_value,
		"faceUp": true,
		"isShield": true,
	}
	player["defensePile"].append(shield)
	player["skillUses"] = int(player.get("skillUses", 0)) - 1
	_add_log(state, "%s 释放坚如磐石 护盾%d点" % [player.get("name", "?"), shield_value])
	_end_action(state)
	return true

# ===== 雷电将军（无想的一刀） =====

static func execute_skill_raiden_pick(state: Dictionary) -> bool:
	var player: Dictionary = _current_player(state)
	if state.get("phase", "") == GameConstants.PHASE["PEACE"]:
		_add_log(state, "和平阶段禁止攻击")
		return false
	if int(state.get("round", 0)) < 10:
		_add_log(state, "第10回合后才能使用")
		return false
	state["step"] = GameConstants.STEP["SKILL_PICK_TARGET"]
	_add_log(state, "%s 释放无想的一刀" % player.get("name", "?"))
	return true

static func execute_raiden_skill(state: Dictionary, target_idx: int) -> void:
	var attacker: Dictionary = _current_player(state)
	var target: Dictionary = _find_player(state.get("players", []), target_idx)
	if target.is_empty() or not target.get("alive", false):
		return

	attacker["skillUses"] = int(attacker.get("skillUses", 0)) - 1
	var damage: int = 27
	var bonus: int = 0

	if state.get("currentWeather", "") == "sun":
		damage += 2
		bonus += 2
	if attacker.get("characterId", 0) == 6 and int(attacker.get("fightingSpirit", 0)) > 0:
		bonus += int(attacker.get("fightingSpirit", 0))
		damage += int(attacker.get("fightingSpirit", 0))

	_add_log(state, "%s 无想的一刀 ➜ %s" % [attacker.get("name", "?"), target.get("name", "?")])
	GameDamage.apply_damage(state, target, damage)
	attacker["statusEffects"]["ignoreTrapThisTurn"] = false
	if not state.get("gameOver", false):
		_end_action(state)

# ===== 纳西妲（智慧之殿堂） =====

static func start_skill_nahida(state: Dictionary) -> bool:
	var player: Dictionary = _current_player(state)
	_ensure_deck(state, 5)
	var r: Dictionary = GameDeck.draw_cards(state.get("deck", []), 5)
	var scry: Array = r["drawn"]
	for c in scry:
		c["faceUp"] = true
	state["scryCards"] = scry
	state["deck"] = r["remaining"]
	player["skillUses"] = int(player.get("skillUses", 0)) - 1
	state["step"] = GameConstants.STEP["SKILL_NAHIDA"]
	_add_log(state, "%s 释放智慧之殿堂" % player.get("name", "?"))
	return true

static func submit_nahida_scry(state: Dictionary, order_arr: Array) -> void:
	if state.get("step", "") != GameConstants.STEP["SKILL_NAHIDA"]:
		return
	var scry: Variant = state.get("scryCards")
	if scry == null:
		return
	var cards: Array = []
	for i in order_arr:
		var idx: int = int(i)
		if idx >= 0 and idx < scry.size():
			cards.append(scry[idx])
	cards.reverse()
	for c in cards:
		c["faceUp"] = false
	state["deck"].append_array(cards)
	state["scryCards"] = null
	_add_log(state, "%s 牌库顶重排" % _current_player(state).get("name", "?"))
	state["endTurn"] = false
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	_end_action(state)

# ===== 芙宁娜（审判） =====

static func execute_skill_furina(state: Dictionary) -> bool:
	var player: Dictionary = _current_player(state)
	if state.get("phase", "") == GameConstants.PHASE["PEACE"]:
		_add_log(state, "和平阶段禁止攻击")
		return false
	if int(state.get("round", 0)) < 4:
		_add_log(state, "第4回合后才能攻击")
		return false
	player["statusEffects"]["ignoreTrapThisTurn"] = true
	player["skillUses"] = int(player.get("skillUses", 0)) - 1
	state["pendingFurinaTarget"] = true
	state["step"] = GameConstants.STEP["SKILL_PICK_TARGET"]
	_add_log(state, "%s 释放审判，选择要交换陷阱的目标" % player.get("name", "?"))
	return true

static func execute_furina_swap(state: Dictionary, target_idx: int) -> void:
	var player: Dictionary = _current_player(state)
	var target: Dictionary = _find_player(state.get("players", []), target_idx)
	if target.is_empty() or not target.get("alive", false):
		return

	var temp: Variant = target.get("trap")
	target["trap"] = target.get("bait")
	target["bait"] = temp
	if target.get("trap") != null:
		target["trap"]["faceUp"] = false
	if target.get("bait") != null:
		target["bait"]["faceUp"] = true

	state["pendingFurinaTarget"] = false
	state["endTurn"] = false
	_add_log(state, "%s的陷阱明暗交换" % target.get("name", "?"))
	_end_action(state)

# ===== 风堇（重见澄澈晴空） =====

static func execute_skill_fenjin(state: Dictionary) -> bool:
	var player: Dictionary = _current_player(state)
	if state.get("phase", "") == GameConstants.PHASE["PEACE"]:
		_add_log(state, "和平阶段禁止攻击")
		return false
	player["skillUses"] = int(player.get("skillUses", 0)) - 1
	state["step"] = GameConstants.STEP["SKILL_PICK_TARGET"]
	state["_fenjinHeal"] = null
	_add_log(state, "%s 释放重见澄澈晴空" % player.get("name", "?"))
	return true

static func execute_fenjin_skill(state: Dictionary, target_idx: int) -> void:
	var player: Dictionary = _current_player(state)
	var target: Dictionary = _find_player(state.get("players", []), target_idx)
	if target.is_empty() or not target.get("alive", false):
		return

	var old_max_hp: int = int(player.get("maxHp", 0))
	player["maxHp"] = old_max_hp + 3
	var heal_amount: int = int(player.get("maxHp", 0)) - int(player.get("hp", 0))
	player["hp"] = player.get("maxHp")
	var damage: int = heal_amount * 2

	_add_log(state, "%s 生命上限 %d→%d，回复 %d 点" % [player.get("name", "?"), old_max_hp, player.get("maxHp", 0), heal_amount])
	_add_log(state, "对 %s 造成 %d 点伤害" % [target.get("name", "?"), damage])
	GameDamage.apply_damage(state, target, damage)
	state.erase("_fenjinHeal")  # 清除标记，防止后续其他角色技能触发被路由到风堇
	if not state.get("gameOver", false):
		_end_action(state)

# ===== 莉奈娅（青春之力的馈赠） =====

static func execute_skill_liniya(state: Dictionary) -> bool:
	var player: Dictionary = _current_player(state)
	if state.get("phase", "") == GameConstants.PHASE["PEACE"]:
		_add_log(state, "和平阶段禁止攻击")
		return false
	player["skillUses"] = int(player.get("skillUses", 0)) - 1
	state["_liniyaSubSkill"] = true
	state["step"] = GameConstants.STEP["LINIYA_PICK"]
	_add_log(state, "%s 释放青春之力的馈赠，选择子技能和目标" % player.get("name", "?"))
	return true

static func execute_liniya_skill(state: Dictionary, target_idx: int, sub_skill: int) -> void:
	var player: Dictionary = _current_player(state)
	var target: Dictionary = _find_player(state.get("players", []), target_idx)
	if target.is_empty() or not target.get("alive", false):
		return

	var se: Dictionary = player.get("statusEffects", {})
	if sub_skill == 1:
		se["stealTarget"] = {"idx": target_idx, "turns": 3}
		var dmg_bonus: Dictionary = se.get("damageBonus", {})
		dmg_bonus[target_idx] = int(dmg_bonus.get(target_idx, 0)) + 2
		_add_log(state, "%s 偷取 %s 的防御牌（3回合），对其伤害+2" % [player.get("name", "?"), target.get("name", "?")])
	else:
		se["dotTarget"] = {"idx": target_idx, "turns": 5}
		_add_log(state, "%s 对 %s 施加5回合DoT（每回合5点无视陷阱）" % [player.get("name", "?"), target.get("name", "?")])

	state["_liniyaSubSkill"] = null
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	_end_action(state)

# ===== 爱蜜莉雅（冻结） =====

static func execute_skill_aimiliya(state: Dictionary) -> bool:
	var player: Dictionary = _current_player(state)
	player["skillUses"] = int(player.get("skillUses", 0)) - 1
	state["step"] = GameConstants.STEP["SKILL_PICK_TARGET"]
	state["_aimiliyaFreeze"] = true
	_add_log(state, "%s 释放冻结" % player.get("name", "?"))
	return true

static func execute_aimiliya_skill(state: Dictionary, target_idx: int) -> void:
	var player: Dictionary = _current_player(state)
	var target: Dictionary = _find_player(state.get("players", []), target_idx)
	if target.is_empty() or not target.get("alive", false):
		return

	target["statusEffects"]["frozenBy"] = player.get("index")
	_add_log(state, "%s 被冻结，将跳过下一次行动" % target.get("name", "?"))
	state["_aimiliyaFreeze"] = null
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	state["endTurn"] = false
	_end_action(state)
