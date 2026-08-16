class_name GameDamage
## 伤害结算 / 死亡 / 游戏结束（从 src/game/damage.js 移植）
## 依赖：GameConstants / GameDeck / GameSoundEvents

const GameConstants = preload("res://scripts/game/constants.gd")
const GameDeck = preload("res://scripts/game/deck.gd")
const GameSoundEvents = preload("res://scripts/game/sound_events.gd")

static func _find_player(players: Array, index: Variant) -> Dictionary:
	for p in players:
		if p.get("index") == index:
			return p
	return {}

## 解除双方的联盟关系
static func dissolve_alliance(state: Dictionary, player: Dictionary) -> void:
	var ally: Dictionary = _find_player(state.get("players", []), player.get("relations", {}).get("allyIndex"))
	if not ally.is_empty():
		ally["relations"]["allyIndex"] = null
		ally["relations"]["allianceTurns"] = 0
	player["relations"]["allyIndex"] = null
	player["relations"]["allianceTurns"] = 0

## 对一名玩家造成伤害（处理防御结算、扣血、死亡）
static func apply_damage(state: Dictionary, player: Dictionary, damage: int) -> int:
	var hp_before: int = player.get("hp", 0)
	var def_count_before: int = player.get("defensePile", []).size()
	var message_log: Array = state.get("messageLog", [])

	# 赌命惩罚：有 gamblePenalty 的角色受到的伤害+1
	if player.get("relations", {}).get("gamblePenalty", false):
		damage += 1

	var remaining: int = damage

	# 防御判定
	while remaining > 0 and player.get("defensePile", []).size() > 0:
		var defense_pile: Array = player["defensePile"]
		var top: Dictionary = defense_pile[defense_pile.size() - 1]
		var defense_value: int = top.get("defenseValue", top.get("value", 0))
		top["faceUp"] = true

		if defense_value >= remaining:
			top["defenseValue"] = defense_value - remaining
			remaining = 0
			if top["defenseValue"] == 0:
				defense_pile.pop_back()
				if not top.get("isShield", false):
					state["grave"].append(top)
				message_log.append("%s 防御牌抵消" % player.get("name", "?"))
			else:
				message_log.append("%s 残盾 %s点" % [player.get("name", "?"), top["defenseValue"]])
		else:
			remaining -= defense_value
			GameSoundEvents.record_sound(state, "shield_break")
			message_log.append("%s 防御牌 %s 被击穿" % [player.get("name", "?"), GameDeck.card_display(top)])
			defense_pile.pop_back()
			if not top.get("isShield", false):
				state["grave"].append(top)

	# 扣血
	if remaining > 0:
		player["hp"] = player.get("hp", 0) - remaining
		GameSoundEvents.record_sound(state, "hit")
		message_log.append("%s HP %s" % [player.get("name", "?"), player["hp"]])

		if player["hp"] < 0:
			player["hp"] = 0

		if player["hp"] <= 0:
			player["alive"] = false
			player["hp"] = 0
			GameSoundEvents.record_sound(state, "kill")
			message_log.append("%s 阵亡" % player.get("name", "?"))

			# 丢弃所有牌入墓地（护盾牌除外）
			var discard: Array = player.get("defensePile", []).duplicate()
			if player.get("trap") != null:
				discard.append(player["trap"])
			if player.get("bait") != null:
				discard.append(player["bait"])
			for c in discard:
				if not c.get("isShield", false):
					state["grave"].append(c)
			player["defensePile"] = []
			player["trap"] = null
			player["bait"] = null
			dissolve_alliance(state, player)

			# 联赛模式：每次死亡都通知控制器记录死亡顺序
			var league_ctx = state.get("leagueContext")
			if league_ctx != null:
				_call_context(league_ctx, "onPlayerDeath", [player.get("index")])

			check_game_over(state)
			return remaining

	return remaining

## 存活玩家
static func alive_players(state: Dictionary) -> Array:
	var result: Array = []
	for p in state.get("players", []):
		if p.get("alive", false):
			result.append(p)
	return result

## 检查游戏结束
static func check_game_over(state: Dictionary) -> void:
	var alive: Array = alive_players(state)
	var message_log: Array = state.get("messageLog", [])

	# 联赛模式：只做团灭检测
	var league_ctx = state.get("leagueContext")
	if league_ctx != null:
		if alive.is_empty():
			return
		var teams_alive: Dictionary = {}
		for p in alive:
			teams_alive[p.get("teamId", -1)] = true
		if teams_alive.size() <= 1:
			if state.get("_elimGuard", false):
				return
			state["_elimGuard"] = true
			var surviving_team: Variant = teams_alive.keys()[0]
			_call_context(league_ctx, "onTeamWipe", [surviving_team])
			state["_elimPaused"] = true
		return

	if alive.size() <= 1:
		# 比赛模式：不结束游戏，交给 matchContext 处理
		var match_ctx = state.get("matchContext")
		if match_ctx != null:
			if state.get("_elimGuard", false):
				return
			state["_elimGuard"] = true
			var dead_idx: int = -1
			for i in range(state.get("players", []).size()):
				if not state["players"][i].get("alive", true):
					dead_idx = i
					break
			var killer_idx: int = alive[0].get("index", -1) if not alive.is_empty() else -1
			_call_context(match_ctx, "onPlayerEliminated", [dead_idx, killer_idx, state.get("round", 0)])
			state["_elimPaused"] = true
			return

		state["gameOver"] = true
		state["winnerIndex"] = alive[0].get("index", -1) if not alive.is_empty() else -1
		state["phase"] = GameConstants.PHASE["GAME_OVER"]
		if alive.size() == 1:
			message_log.append("%s 获胜" % alive[0].get("name", "?"))
			if alive[0].get("isAI", false):
				GameSoundEvents.record_sound(state, "lose")
		else:
			message_log.append("全员阵亡")
			GameSoundEvents.record_sound(state, "lose")

static func _call_context(ctx: Variant, method: String, args: Array) -> void:
	if ctx is Callable:
		ctx.callv(args)
	elif ctx is Dictionary and ctx.has(method):
		var cb = ctx[method]
		if cb is Callable:
			cb.callv(args)
