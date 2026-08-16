class_name GameState
## 游戏状态机 / 回合推进 / 统一入口（从 src/game/gameState.js 移植）
## 纯逻辑层，UI 只从本模块入口调用

const GameConstants = preload("res://scripts/game/constants.gd")
const GameDeck = preload("res://scripts/game/deck.gd")
const GamePlayer = preload("res://scripts/game/player.gd")
const GameDamage = preload("res://scripts/game/damage.gd")
const GameWeather = preload("res://scripts/game/weather.gd")
const GameCombat = preload("res://scripts/game/combat.gd")
const GameGamble = preload("res://scripts/game/gamble.gd")
const GameSkills = preload("res://scripts/game/skills.gd")
const GameAlliance = preload("res://scripts/game/alliance.gd")
const GameCaiyueang = preload("res://scripts/game/caiyueang.gd")
const GameArtifacts = preload("res://scripts/game/artifacts.gd")
const GameSerialize = preload("res://scripts/game/serialize.gd")

# ════════════════════════════════════
#  工具函数
# ════════════════════════════════════

static func add_log(state: Dictionary, msg: String) -> void:
	if not state.has("messageLog"):
		state["messageLog"] = []
	state["messageLog"].append(msg)

static func current_player(state: Dictionary) -> Dictionary:
	var players: Array = state.get("players", [])
	var idx: int = int(state.get("currentPlayerIndex", 0))
	return players[idx] if idx < players.size() else {}

static func ensure_deck(state: Dictionary, n: int = 1) -> void:
	if state.get("deck", []).size() >= n:
		return
	var grave_count: int = state.get("grave", []).size()
	state["deck"] = GameDeck.reshuffle_from_grave(state.get("grave", []))
	state["grave"] = []
	add_log(state, "牌库重构")

## 统一行动结束出口
static func end_action(state: Dictionary) -> void:
	# Bug fix: 比赛模式阵亡后暂停，等待 UI 处理换人/重置（防止幽灵回合）
	if state.get("_elimPaused", false):
		state["_elimPaused"] = false
		return
	# 比赛模式：游戏刚被重置，不再推进回合逻辑，只推进到下一个存活玩家
	if state.get("_gameJustReset", false):
		state["_gameJustReset"] = false
		var next: int = int(state.get("currentPlayerIndex", 0)) + 1
		var players: Array = state.get("players", [])
		while next < players.size() and not players[next].get("alive", false):
			next += 1
		if next >= players.size():
			next = 0
		while next < players.size() and not players[next].get("alive", false):
			next += 1
		if next < players.size() and players[next].get("alive", false):
			state["currentPlayerIndex"] = next
			state["step"] = GameConstants.STEP["PICK_ACTION"]
		return
	if state.get("endTurn", true):
		state["endTurn"] = true
		next_player(state)
	else:
		state["endTurn"] = true
		state["step"] = GameConstants.STEP["PICK_ACTION"]
		add_log(state, "%s 获得额外行动" % current_player(state).get("name", "?"))

# ── 依赖注入：让子模块能使用上述工具函数 ──
static func _inject_all() -> void:
	GameCombat.inject_deps(Callable(GameState, "current_player"), Callable(GameState, "add_log"), Callable(GameState, "ensure_deck"), Callable(GameState, "end_action"))
	GameGamble.inject_deps(Callable(GameState, "current_player"), Callable(GameState, "add_log"), Callable(GameState, "ensure_deck"), Callable(GameState, "end_action"))
	GameSkills.inject_deps(Callable(GameState, "current_player"), Callable(GameState, "add_log"), Callable(GameState, "ensure_deck"), Callable(GameState, "end_action"))
	GameAlliance.inject_deps(Callable(GameState, "current_player"), Callable(GameState, "add_log"), Callable(GameState, "ensure_deck"), Callable(GameState, "end_action"))
	GameCaiyueang.inject_deps(Callable(GameState, "current_player"), Callable(GameState, "add_log"), Callable(GameState, "end_action"), Callable(GameState, "check_game_over"))
	GameArtifacts.inject_deps(Callable(GameState, "current_player"), Callable(GameState, "add_log"), Callable(GameState, "end_action"))

# ════════════════════════════════════
#  状态创建
# ════════════════════════════════════

static func create_game_state() -> Dictionary:
	_inject_all()
	return {
		"players": [],
		"currentPlayerIndex": 0,
		"phase": GameConstants.PHASE["SETUP"],
		"step": GameConstants.STEP["PICK_ACTION"],
		"deck": [],
		"grave": [],
		"weatherDeck": [],
		"currentWeather": null,
		"nextWeather": null,
		"round": 0,
		"messageLog": [],
		"gameOver": false,
		"winnerIndex": -1,
		"endTurn": true,
		"scryCards": null,
		"pendingAttackCard": null,
		"pendingVentiCards": null,
		"useWeather": false,
		"matchContext": null,
		"leagueContext": null,
		"_skipAnim": false,
		"_gameJustReset": false,
		"_elimPaused": false,
		"aiPeekDepth": 3,
		"soundQueue": [],
	}

# ════════════════════════════════════
#  游戏初始化
# ════════════════════════════════════

static func init_game(state: Dictionary, player_chars: Array, use_weather: bool = false, starting_round: int = 1, deck_count: int = 2, team_ids: Array = []) -> void:
	var saved_match_context: Variant = state.get("matchContext")
	var saved_league_context: Variant = state.get("leagueContext")

	state["players"] = []
	state["currentPlayerIndex"] = 0
	state["phase"] = GameConstants.PHASE["SETUP"]
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	state["deck"] = []
	state["grave"] = []
	state["weatherDeck"] = []
	state["currentWeather"] = null
	state["nextWeather"] = null
	state["round"] = 0
	state["messageLog"] = []
	state["gameOver"] = false
	state["winnerIndex"] = -1
	state["scryCards"] = null
	state["pendingAttackCard"] = null
	state["pendingVentiCards"] = null
	state["endTurn"] = true
	state["useWeather"] = use_weather
	state["matchContext"] = saved_match_context
	state["leagueContext"] = saved_league_context
	state["_elimGuard"] = false
	state["_elimPaused"] = false
	state["_peaceStartRound"] = 0
	state["soundQueue"] = []

	state["deck"] = GameDeck.shuffle_deck(GameDeck.create_full_deck(deck_count))

	for i in range(player_chars.size()):
		var char_id: int = int(player_chars[i])
		var char_data: Dictionary = GameConstants.CHARACTERS.get(char_id, {})
		if char_data.is_empty():
			continue
		var team_id: int = -1
		if team_ids.size() > i:
			team_id = int(team_ids[i])
		state["players"].append(GamePlayer.create_player(i, char_data, "", team_id))

	# 按 speed 降序排列（数字大=行动快），同速按 index 升序
	var players: Array = state["players"]
	players.sort_custom(func(a, b):
		var sa: int = int(GameConstants.CHARACTERS.get(int(a.get("characterId", 0)), {}).get("speed", 5))
		var sb: int = int(GameConstants.CHARACTERS.get(int(b.get("characterId", 0)), {}).get("speed", 5))
		if sa != sb:
			return sa > sb
		return int(a.get("index", 0)) < int(b.get("index", 0))
	)
	for i in range(players.size()):
		players[i]["index"] = i

	if use_weather:
		GameWeather.setup_weather_deck(state)

	# 联赛模式：无和平期，直接进入战斗
	if state.get("leagueContext") != null:
		state["phase"] = GameConstants.PHASE["NORMAL"]
		state["peaceRounds"] = 0
	else:
		state["phase"] = GameConstants.PHASE["PEACE"]
		state["peaceRounds"] = 4
	state["round"] = starting_round
	state["step"] = GameConstants.STEP["PICK_ACTION"]

	if starting_round > int(state.get("peaceRounds", 4)):
		state["phase"] = GameConstants.PHASE["NORMAL"]

	add_log(state, "亡命十三街开始")
	var char_names: Array = []
	for p in players:
		char_names.append(GameConstants.get_char_data(p).get("name", "?"))
	add_log(state, "角色：%s" % " · ".join(char_names))
	var order_names: Array = []
	for p in players:
		order_names.append(p.get("name", "?"))
	add_log(state, "行动顺序：%s" % " → ".join(order_names))
	if state.get("phase", "") == GameConstants.PHASE["PEACE"]:
		add_log(state, "和平发育（第1-%d回合禁止攻击）" % int(state.get("peaceRounds", 4)))

# ════════════════════════════════════
#  回合推进（核心循环）
# ════════════════════════════════════

static func next_player(state: Dictionary, _depth: int = 0) -> void:
	if _depth > state.get("players", []).size():
		return
	var players: Array = state.get("players", [])
	var next: int = int(state.get("currentPlayerIndex", 0)) + 1
	while next < players.size() and not players[next].get("alive", false):
		next += 1

	if next >= players.size() or not players[next].get("alive", false):
		# 新回合
		state["round"] = int(state.get("round", 0)) + 1
		next = 0
		while next < players.size() and not players[next].get("alive", false):
			next += 1

		# 阶段切换
		if state.get("phase", "") == GameConstants.PHASE["PEACE"] \
				and int(state.get("round", 0)) > int(state.get("_peaceStartRound", 0)) + int(state.get("peaceRounds", 4)):
			state["phase"] = GameConstants.PHASE["NORMAL"]
			add_log(state, "第%d回合 战斗开始" % int(state.get("round", 0)))
		else:
			add_log(state, "------ 第%d回合 ------" % int(state.get("round", 0)))

		# 重置当前指针到第一个存活玩家
		next = 0
		while next < players.size() and not players[next].get("alive", false):
			next += 1

		# 天气
		if state.get("useWeather", false):
			GameWeather.draw_weather(state)
			var w: Dictionary = GameWeather.get_current_weather(state)
			add_log(state, w.get("name", "风和日丽") if not w.is_empty() else "风和日丽")
			if state.get("currentWeather", "") == "rain":
				for p in players:
					if p.get("alive", false) and p.get("defensePile", []).size() > 0:
						var discarded: Dictionary = p["defensePile"].pop_back()
						state["grave"].append(discarded)
						add_log(state, "%s 防御牌被暴雨冲走" % p.get("name", "?"))

		# 月相轮换（哥伦比娅）
		for p in players:
			if p.get("alive", false) and p.get("characterId", 0) == 7:
				p["moonPhase"] = (int(p.get("moonPhase", 0)) + 1) % 3
				var moon_names: Array = GameConstants.MOON_NAMES
				add_log(state, "哥伦比娅月相 %s" % moon_names[int(p["moonPhase"])])

		# 圣遗物效果回合递减
		GameArtifacts.tick_artifact_rounds(state)

		# 比赛模式：通知新回合（用于回合上限检查等）
		var match_ctx: Variant = state.get("matchContext")
		if match_ctx != null and match_ctx.has("onNewRound"):
			_call_context(match_ctx, "onNewRound", [int(state.get("round", 0))])

		# 联赛模式：通知新回合 + 回合上限检测
		var league_ctx: Variant = state.get("leagueContext")
		if league_ctx != null and league_ctx.has("onNewRound"):
			_call_context(league_ctx, "onNewRound", [int(state.get("round", 0))])
		if league_ctx != null and league_ctx.has("maxRounds") \
				and int(state.get("round", 0)) > int(league_ctx.get("maxRounds", 999999)):
			if league_ctx.has("onRoundLimit"):
				_call_context(league_ctx, "onRoundLimit", [])
			state["_elimPaused"] = true
			return

		# 联盟/背刺回合处理
		for p in players:
			if not p.get("alive", false):
				continue
			var rel: Dictionary = p.get("relations", {})
			if int(rel.get("allianceTurns", 0)) > 0:
				rel["allianceTurns"] = int(rel.get("allianceTurns", 0)) - 1
				if int(rel.get("allianceTurns", 0)) <= 0:
					GameDamage.dissolve_alliance(state, p)
					add_log(state, "%s 联盟到期" % p.get("name", "?"))
			if int(rel.get("betrayalPenalty", 0)) > 0:
				rel["betrayalPenalty"] = int(rel.get("betrayalPenalty", 0)) - 1
				if int(rel.get("betrayalPenalty", 0)) <= 0:
					add_log(state, "%s 背刺惩罚结束" % p.get("name", "?"))
			if rel.get("allyKillBonus", false) and rel.get("allyIndex") != null:
				rel["allyKillBonus"] = false
				add_log(state, "%s 盟友击杀奖励：立即执行一次防御或赌命" % p.get("name", "?"))
				state["endTurn"] = false

		# 莉奈娅被动（DoT / 偷牌）
		for p in players:
			if not p.get("alive", false):
				continue
			var se: Dictionary = p.get("statusEffects", {})
			var dot: Variant = se.get("dotTarget")
			if dot != null and int(dot.get("turns", 0)) > 0:
				var target: Dictionary = _find_player(players, dot.get("idx"))
				if not target.is_empty() and target.get("alive", false):
					add_log(state, "%s 受到莉奈娅DoT 5点伤害（无视陷阱）" % target.get("name", "?"))
					GameDamage.apply_damage(state, target, 5)
					dot["turns"] = int(dot.get("turns", 0)) - 1
					if int(dot.get("turns", 0)) <= 0:
						se["dotTarget"] = null
				else:
					se["dotTarget"] = null

			var steal: Variant = se.get("stealTarget")
			if steal != null and int(steal.get("turns", 0)) > 0:
				var target2: Dictionary = _find_player(players, steal.get("idx"))
				if not target2.is_empty() and target2.get("alive", false) and target2.get("defensePile", []).size() > 0:
					var stolen: Dictionary = target2["defensePile"].pop_back()
					stolen["faceUp"] = true
					p["defensePile"].append(stolen)
					add_log(state, "%s 偷取了 %s 的防御牌" % [p.get("name", "?"), target2.get("name", "?")])
				steal["turns"] = int(steal.get("turns", 0)) - 1
				if int(steal.get("turns", 0)) <= 0:
					se["stealTarget"] = null

		GameDamage.check_game_over(state)

	if not state.get("gameOver", false) and next < players.size() and players[next].get("alive", false):
		state["currentPlayerIndex"] = next
		var p: Dictionary = current_player(state)

		if p.get("statusEffects", {}).get("frozenBy") != null:
			add_log(state, "%s 被冻结，跳过行动" % p.get("name", "?"))
			p["statusEffects"]["frozenBy"] = null
			next_player(state, _depth + 1)
			return

		state["step"] = GameConstants.STEP["PICK_ACTION"]
		p["statusEffects"]["ignoreTrapThisTurn"] = false
		add_log(state, "当前 %s 行动" % p.get("name", "?"))

static func _find_player(players: Array, index: Variant) -> Dictionary:
	for p in players:
		if p.get("index") == index:
			return p
	return {}

static func _call_context(ctx: Variant, method: String, args: Array) -> void:
	if ctx is Callable:
		ctx.callv(args)
	elif ctx is Dictionary and ctx.has(method):
		var cb: Variant = ctx[method]
		if cb is Callable:
			cb.callv(args)

# ════════════════════════════════════
#  统一导出（UI 入口）
# ════════════════════════════════════

static func _ensure_injected() -> void:
	_inject_all()

# damage.js
static func apply_damage(state: Dictionary, player: Dictionary, damage: int) -> int:
	return GameDamage.apply_damage(state, player, damage)

static func dissolve_alliance(state: Dictionary, player: Dictionary) -> void:
	GameDamage.dissolve_alliance(state, player)

static func check_game_over(state: Dictionary) -> void:
	GameDamage.check_game_over(state)

static func alive_players(state: Dictionary) -> Array:
	return GameDamage.alive_players(state)

# weather.js
static func get_current_weather(state: Dictionary) -> Dictionary:
	return GameWeather.get_current_weather(state)

static func get_next_weather(state: Dictionary) -> Dictionary:
	return GameWeather.get_next_weather(state)

# combat.js
static func start_attack(state: Dictionary) -> void:
	GameCombat.start_attack(state)

static func execute_attack(state: Dictionary, target_idx: int) -> void:
	GameCombat.execute_attack(state, target_idx)

static func execute_defense(state: Dictionary) -> void:
	GameCombat.execute_defense(state)

# gamble.js
static func execute_gamble(state: Dictionary) -> void:
	GameGamble.execute_gamble(state)

static func submit_gamble(state: Dictionary, trap_idx: int, bait_idx: int) -> void:
	GameGamble.submit_gamble(state, trap_idx, bait_idx)

# skills.js
static func can_use_skill(state: Dictionary, player: Dictionary) -> bool:
	return GameSkills.can_use_skill(state, player)

static func execute_skill(state: Dictionary) -> bool:
	return GameSkills.execute_skill(state)

static func execute_raiden_skill(state: Dictionary, target_idx: int) -> void:
	GameSkills.execute_raiden_skill(state, target_idx)

static func execute_furina_swap(state: Dictionary, target_idx: int) -> void:
	GameSkills.execute_furina_swap(state, target_idx)

static func execute_fenjin_skill(state: Dictionary, target_idx: int) -> void:
	GameSkills.execute_fenjin_skill(state, target_idx)

static func execute_liniya_skill(state: Dictionary, target_idx: int, sub_skill: int) -> void:
	GameSkills.execute_liniya_skill(state, target_idx, sub_skill)

static func execute_aimiliya_skill(state: Dictionary, target_idx: int) -> void:
	GameSkills.execute_aimiliya_skill(state, target_idx)

static func submit_nahida_scry(state: Dictionary, order_arr: Array) -> void:
	GameSkills.submit_nahida_scry(state, order_arr)

# alliance.js
static func start_ally(state: Dictionary) -> void:
	GameAlliance.start_ally(state)

static func execute_ally(state: Dictionary, target_idx: int) -> void:
	GameAlliance.execute_ally(state, target_idx)

static func execute_betray(state: Dictionary) -> void:
	GameAlliance.execute_betray(state)

static func get_alliance_targets(state: Dictionary) -> Array:
	return GameAlliance.get_alliance_targets(state)

# caiyueang.js
static func execute_skill_caiyueang(state: Dictionary) -> void:
	GameCaiyueang.execute_skill_caiyueang_entry(state)

static func execute_caiyueang_save(state: Dictionary) -> void:
	GameCaiyueang.execute_caiyueang_save(state)

static func execute_caiyueang_load(state: Dictionary) -> void:
	GameCaiyueang.execute_caiyueang_load(state)

# artifacts.js
static func execute_holy_word(state: Dictionary) -> bool:
	return GameArtifacts.execute_holy_word(state)

static func can_use_holy_word(state: Dictionary, player: Dictionary) -> bool:
	return GameArtifacts.can_use_holy_word(state, player)

static func apply_artifact_damage_boost(attacker: Dictionary, attack_value: int, state: Dictionary) -> Dictionary:
	return GameArtifacts.apply_artifact_damage_boost(attacker, attack_value, state)

static func record_trap_break(attacker: Dictionary, state: Dictionary) -> void:
	GameArtifacts.record_trap_break(attacker, state)

static func record_defense_break(attacker: Dictionary, count: int, state: Dictionary) -> void:
	GameArtifacts.record_defense_break(attacker, count, state)

static func tick_artifact_rounds(state: Dictionary) -> void:
	GameArtifacts.tick_artifact_rounds(state)

static func get_artifact_data(artifact_id: Variant) -> Dictionary:
	return GameArtifacts.get_artifact_data(artifact_id)

# serialize.js
static func serialize_game_state(state: Dictionary) -> Dictionary:
	return GameSerialize.serialize_game_state(state)

static func deserialize_game_state(state: Dictionary, save_data: Variant) -> bool:
	return GameSerialize.deserialize_game_state(state, save_data)
