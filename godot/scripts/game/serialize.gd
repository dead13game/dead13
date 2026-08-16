class_name GameSerialize
## 存档序列化（从 src/game/serialize.js 移植）
## 纯逻辑：把状态转成可 JSON 存储的纯对象 / 从存档恢复

const GameConstants = preload("res://scripts/game/constants.gd")
const GameDamage = preload("res://scripts/game/damage.gd")

static func _clone_cards(cards: Array) -> Array:
	var result: Array = []
	for c in cards:
		result.append(c.duplicate(true))
	return result

static func serialize_game_state(state: Dictionary) -> Dictionary:
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
				"frozenBy": se.get("frozenBy"),
				"stealTarget": se.get("stealTarget").duplicate(true) if se.get("stealTarget") != null else null,
				"dotTarget": se.get("dotTarget").duplicate(true) if se.get("dotTarget") != null else null,
				"damageBonus": se.get("damageBonus", {}).duplicate(true),
				"ignoreTrapThisTurn": se.get("ignoreTrapThisTurn", false),
				"extraAction": se.get("extraAction", false),
				"savepoint": null,  # 存档点不序列化
			},
			"relations": {
				"allyIndex": rel.get("allyIndex"),
				"allianceTurns": rel.get("allianceTurns"),
				"betrayalPenalty": rel.get("betrayalPenalty"),
				"allyKillBonus": rel.get("allyKillBonus"),
				"consecutiveGambles": rel.get("consecutiveGambles"),
				"gamblePenalty": rel.get("gamblePenalty"),
			},
			"isAI": p.get("isAI", false),
			"aiDifficulty": p.get("aiDifficulty"),
			"teamId": p.get("teamId", -1),
			"artifactId": p.get("artifactId"),
			"breakCount": p.get("breakCount", 0),
			"holyWordUses": p.get("holyWordUses", 2),
			"artifactActive": p.get("artifactActive", false),
			"artifactRoundsLeft": p.get("artifactRoundsLeft", 0),
		})
	return {
		"version": 2,
		"players": players,
		"deck": _clone_cards(state.get("deck", [])),
		"grave": _clone_cards(state.get("grave", [])),
		"weatherDeck": _clone_cards(state.get("weatherDeck", [])),
		"currentPlayerIndex": state.get("currentPlayerIndex"),
		"phase": state.get("phase"),
		"step": state.get("step"),
		"round": state.get("round"),
		"peaceRounds": state.get("peaceRounds"),
		"currentWeather": state.get("currentWeather"),
		"nextWeather": state.get("nextWeather"),
		"useWeather": state.get("useWeather", false),
	}

static func deserialize_game_state(state: Dictionary, save_data: Variant) -> bool:
	if save_data == null or not (save_data is Dictionary):
		return false
	var saved_players: Variant = save_data.get("players")
	if saved_players == null or not (saved_players is Array) or saved_players.is_empty():
		return false

	# 1. 恢复玩家
	var players: Array = []
	for sp in saved_players:
		var char_data: Dictionary = GameConstants.CHARACTERS.get(int(sp.get("characterId", 0)), {})
		var se: Dictionary = sp.get("statusEffects", {})
		var rel: Dictionary = sp.get("relations", {})
		players.append({
			"index": sp.get("index"),
			"name": sp.get("name"),
			"characterId": sp.get("characterId"),
			"hp": sp.get("hp"),
			"maxHp": sp.get("maxHp"),
			"alive": sp.get("alive"),
			"defensePile": _clone_cards(sp.get("defensePile", [])),
			"trap": sp.get("trap").duplicate(true) if sp.get("trap") != null else null,
			"bait": sp.get("bait").duplicate(true) if sp.get("bait") != null else null,
			"skillUses": int(sp.get("skillUses", char_data.get("maxUses", 0))),
			"fightingSpirit": int(sp.get("fightingSpirit", 0)),
			"moonPhase": int(sp.get("moonPhase", 0)),
			"loadUses": int(sp.get("loadUses", char_data.get("loadMaxUses", 0))),
			"statusEffects": {
				"frozenBy": se.get("frozenBy"),
				"stealTarget": se.get("stealTarget").duplicate(true) if se.get("stealTarget") != null else null,
				"dotTarget": se.get("dotTarget").duplicate(true) if se.get("dotTarget") != null else null,
				"damageBonus": (se.get("damageBonus", {}) if se.get("damageBonus") != null else {}).duplicate(true),
				"ignoreTrapThisTurn": se.get("ignoreTrapThisTurn", false),
				"extraAction": se.get("extraAction", false),
				"savepoint": null,
			},
			"relations": {
				"allyIndex": rel.get("allyIndex"),
				"allianceTurns": rel.get("allianceTurns", 0),
				"betrayalPenalty": rel.get("betrayalPenalty", 0),
				"allyKillBonus": rel.get("allyKillBonus", false),
				"consecutiveGambles": rel.get("consecutiveGambles", 0),
				"gamblePenalty": rel.get("gamblePenalty", false),
			},
			"isAI": sp.get("isAI", false),
			"aiDifficulty": sp.get("aiDifficulty"),
			"teamId": sp.get("teamId", -1),
			"artifactId": sp.get("artifactId"),
			"breakCount": int(sp.get("breakCount", 0)),
			"holyWordUses": int(sp.get("holyWordUses", 2)),
			"artifactActive": sp.get("artifactActive", false),
			"artifactRoundsLeft": int(sp.get("artifactRoundsLeft", 0)),
		})
	state["players"] = players

	# 2. 恢复牌堆
	state["deck"] = _clone_cards(save_data.get("deck", []))
	state["grave"] = _clone_cards(save_data.get("grave", []))
	state["weatherDeck"] = _clone_cards(save_data.get("weatherDeck", []))

	# 3. 恢复回合/阶段
	state["currentPlayerIndex"] = int(save_data.get("currentPlayerIndex", 0))
	state["phase"] = save_data.get("phase", GameConstants.PHASE["PEACE"])
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	state["round"] = int(save_data.get("round", 1))
	state["peaceRounds"] = int(save_data.get("peaceRounds", 4))
	state["currentWeather"] = save_data.get("currentWeather")
	state["nextWeather"] = save_data.get("nextWeather")
	state["useWeather"] = save_data.get("useWeather", false)

	# 4. 重置临时状态（防止上一局残留字段影响读档行为）
	state["endTurn"] = true
	state["gameOver"] = false
	state["winnerIndex"] = -1
	state["messageLog"] = ["游戏已读取存档（第%d回合）" % int(state.get("round", 1))]
	state["scryCards"] = null
	state["pendingAttackCard"] = null
	state["pendingVentiCards"] = null
	state["_elimGuard"] = false
	state["_elimPaused"] = false
	state["_gameJustReset"] = false
	state["_peaceStartRound"] = 0
	state["_skipAnim"] = false
	state["pendingFurinaTarget"] = false
	state["_aimiliyaFreeze"] = null
	state.erase("_fenjinHeal")
	state["_liniyaSubSkill"] = null
	state["_caiyueangMode"] = null
	state["pendingGamble"] = null

	# 5. 校验游戏状态
	GameDamage.check_game_over(state)
	return true
