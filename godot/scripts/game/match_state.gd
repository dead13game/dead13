class_name GameMatchState
## 比赛状态机 — 在 1v1 游戏之上叠加比赛逻辑（进球、重置、换人、加时、点球）
## 从 src/game/matchState.js 移植

const GameWorldCupConstants = preload("res://scripts/game/world_cup_constants.gd")
const GameConstants = preload("res://scripts/game/constants.gd")
const GameDeck = preload("res://scripts/game/deck.gd")
const GamePlayer = preload("res://scripts/game/player.gd")

static func _get_char_data(char_id: int) -> Dictionary:
	return GameConstants.CHARACTERS.get(char_id, {})

# ===== 创建比赛状态 =====

static func create_match_state(is_group_stage: bool, player_char_id: int, opponent_char_id: int, player_artifact_id: Variant = null) -> Dictionary:
	return {
		"isGroupStage": is_group_stage,
		"matchRound": 1,
		"maxRounds": GameWorldCupConstants.MATCH_CONFIG["knockoutRounds"],  # 小组赛和淘汰赛都是90回合
		"score": [0, 0],  # [玩家进球, 对方进球]
		"isExtraTime": false,
		"isPenaltyShootout": false,
		"matchOver": false,
		"winner": null,  # 0=玩家, 1=对方, null=未结束
		"substitutionPending": false,
		"substitutionsLeft": GameWorldCupConstants.MATCH_CONFIG["maxSubstitutions"],
		"playerCharId": player_char_id,
		"opponentCharId": opponent_char_id,
		"playerArtifactId": player_artifact_id,
		"penalty": null,
		"penaltyDeck": [],
		"penaltyGrave": [],
	}

# ===== 核心钩子：有人阵亡时记录进球并决定下一步 =====

static func on_player_eliminated(match_state: Dictionary, game_state: Dictionary, dead_idx: int, killer_idx: int, actual_round: Variant = null) -> void:
	if match_state.get("matchOver", false):
		return
	# 用实际游戏回合同步比赛回合计数器
	if actual_round != null:
		match_state["matchRound"] = int(actual_round)
	# 通过 characterId 判定谁进球（initGame 按血量排序后索引不可靠）
	var killer: Dictionary = {}
	for p in game_state.get("players", []):
		if p.get("index") == killer_idx:
			killer = p
			break
	# 无存活击杀者（如同一波陷阱同归于尽）：不计进球，仅推进结束判定
	if killer.is_empty():
		check_match_end(match_state, game_state)
		return
	var is_player_goal: bool = int(killer.get("characterId", 0)) == int(match_state.get("playerCharId", 0))
	var score: Array = match_state["score"]
	if is_player_goal:
		score[0] = int(score[0]) + 1
	else:
		score[1] = int(score[1]) + 1
	check_match_end(match_state, game_state)

# ===== 判定比赛是否结束 / 加时 / 点球 =====

static func check_match_end(match_state: Dictionary, game_state: Dictionary):
	var score: Array = match_state["score"]
	var p_score: int = int(score[0])
	var o_score: int = int(score[1])
	var round: int = int(match_state.get("matchRound", 0))
	var knockout_rounds: int = int(GameWorldCupConstants.MATCH_CONFIG["knockoutRounds"])
	var total_rounds: int = int(GameWorldCupConstants.MATCH_CONFIG["totalRounds"])

	# 常规时间（90回合）结束
	if round >= knockout_rounds and not match_state.get("isExtraTime", false):
		if p_score != o_score:
			return end_match(match_state, game_state)
		# 平局：小组赛直接结束，淘汰赛进加时
		if match_state.get("isGroupStage", false):
			return end_match(match_state, game_state)
		return start_extra_time(match_state, game_state)

	# 加时赛（120回合）结束
	if round >= total_rounds and match_state.get("isExtraTime", false):
		if p_score != o_score:
			return end_match(match_state, game_state)
		# 仍平局 → 点球大战
		return start_penalty_shootout(match_state, game_state)

	# 比赛继续：标记换人待处理，然后由 UI 层处理换人后再 resetGameForNextLife
	match_state["substitutionPending"] = true
	return null

static func end_match(match_state: Dictionary, game_state: Dictionary):
	match_state["matchOver"] = true
	var score: Array = match_state["score"]
	var p_score: int = int(score[0])
	var o_score: int = int(score[1])
	if p_score > o_score:
		match_state["winner"] = 0
	elif o_score > p_score:
		match_state["winner"] = 1
	else:
		match_state["winner"] = null  # 平局
	game_state["gameOver"] = true
	game_state["winnerIndex"] = int(match_state.get("winner", -1)) if match_state.get("winner") != null else -1
	return match_state.get("winner")

static func start_extra_time(match_state: Dictionary, game_state: Dictionary):
	match_state["isExtraTime"] = true
	match_state["maxRounds"] = GameWorldCupConstants.MATCH_CONFIG["totalRounds"]
	# 加时赛不结束比赛，继续（重置游戏后继续打）
	match_state["substitutionPending"] = true
	return null

static func start_penalty_shootout(match_state: Dictionary, game_state: Dictionary):
	match_state["isPenaltyShootout"] = true
	match_state["matchOver"] = true  # 停止正常比赛流程
	match_state["penalty"] = {
		"playerScore": 0,
		"opponentScore": 0,
		"round": 0,
		"playerCards": null,
		"opponentCards": null,
		"lastResult": null,
	}
	# 创建点球专用牌堆
	match_state["penaltyDeck"] = GameDeck.shuffle_deck(GameDeck.create_full_deck(1))
	match_state["penaltyGrave"] = []
	return null

# ===== 重置游戏以进行下一局（保留回合数） =====

static func reset_game_for_next_life(match_state: Dictionary, game_state: Dictionary) -> void:
	# 按 characterId 保存名称（HP 排序后索引不可靠）
	var player_p: Dictionary = {}
	var opponent_p: Dictionary = {}
	for p in game_state.get("players", []):
		if int(p.get("characterId", 0)) == int(match_state.get("playerCharId", 0)):
			player_p = p
		elif int(p.get("characterId", 0)) == int(match_state.get("opponentCharId", 0)):
			opponent_p = p
	var player_name: String = player_p.get("name", "玩家") if not player_p.is_empty() else "玩家"
	var opponent_name: String = opponent_p.get("name", "对手") if not opponent_p.is_empty() else "对手"

	# 回合数 +1（因为上一局消耗了当前回合）
	match_state["matchRound"] = int(match_state.get("matchRound", 0)) + 1
	match_state["substitutionPending"] = false

	# 保存 matchContext + 天气状态（reset1v1Game 会清掉天气）
	var saved_context: Variant = game_state.get("matchContext")
	var saved_use_weather: bool = game_state.get("useWeather", false)
	var saved_weather_deck: Array = game_state.get("weatherDeck", [])
	var saved_current_weather: Variant = game_state.get("currentWeather")
	var saved_next_weather: Variant = game_state.get("nextWeather")

	# 重新初始化 1v1 游戏
	reset_1v1_game(game_state, int(match_state.get("playerCharId", 0)), int(match_state.get("opponentCharId", 0)), int(match_state.get("matchRound", 1)))

	# 恢复天气状态（世界杯模式下应保持天气）
	game_state["useWeather"] = saved_use_weather
	game_state["weatherDeck"] = saved_weather_deck
	game_state["currentWeather"] = saved_current_weather
	game_state["nextWeather"] = saved_next_weather

	# 按 characterId 恢复名称
	for p in game_state.get("players", []):
		if int(p.get("characterId", 0)) == int(match_state.get("playerCharId", 0)):
			p["name"] = player_name
		elif int(p.get("characterId", 0)) == int(match_state.get("opponentCharId", 0)):
			p["name"] = opponent_name

	# 恢复比赛上下文
	game_state["matchContext"] = saved_context

	# 加时赛提示
	var knockout_rounds: int = int(GameWorldCupConstants.MATCH_CONFIG["knockoutRounds"])
	if match_state.get("isExtraTime", false) and int(match_state.get("matchRound", 0)) == knockout_rounds + 1:
		game_state["messageLog"].append("⚽ 90分钟结束，进入加时赛！")
	if int(match_state.get("matchRound", 0)) == 1:
		game_state["messageLog"].append("⚽ 比赛开始！（回合制）")

# ===== 重置为 1v1 游戏 =====

static func reset_1v1_game(game_state: Dictionary, player_char_id: int, opponent_char_id: int, starting_round: int) -> void:
	var char_data1: Dictionary = _get_char_data(player_char_id)
	var char_data2: Dictionary = _get_char_data(opponent_char_id)
	if char_data1.is_empty() or char_data2.is_empty():
		return

	# 重置核心状态
	game_state["players"] = []
	game_state["currentPlayerIndex"] = 0
	game_state["phase"] = "peace"
	game_state["step"] = "pickAction"
	game_state["deck"] = GameDeck.shuffle_deck(GameDeck.create_full_deck(2))
	game_state["grave"] = []
	game_state["weatherDeck"] = []
	game_state["currentWeather"] = null
	game_state["nextWeather"] = null
	game_state["round"] = starting_round
	# messageLog 保留
	game_state["gameOver"] = false
	game_state["winnerIndex"] = -1
	game_state["scryCards"] = null
	game_state["pendingAttackCard"] = null
	game_state["pendingVentiCards"] = null
	game_state["endTurn"] = true
	game_state["useWeather"] = false
	game_state["peaceRounds"] = 4
	game_state["_peaceStartRound"] = starting_round - 1
	game_state["_elimGuard"] = false
	game_state["_elimPaused"] = false
	game_state["_skipAnim"] = false
	game_state["_gameJustReset"] = true

	# 创建两个玩家
	game_state["players"].append(GamePlayer.create_player(0, char_data1, "玩家"))
	game_state["players"].append(GamePlayer.create_player(1, char_data2, "对手"))

	# 按 speed 降序排列，同速按 index 升序
	var players: Array = game_state["players"]
	players.sort_custom(func(a, b):
		var sa: int = int(GameConstants.CHARACTERS.get(int(a.get("characterId", 0)), {}).get("speed", 5))
		var sb: int = int(GameConstants.CHARACTERS.get(int(b.get("characterId", 0)), {}).get("speed", 5))
		if sa != sb:
			return sa > sb
		return int(a.get("index", 0)) < int(b.get("index", 0))
	)
	for i in range(players.size()):
		players[i]["index"] = i

# ===== 换人 =====

static func can_substitute(match_state: Dictionary) -> bool:
	return match_state.get("substitutionPending", false) \
		and not match_state.get("matchOver", false) \
		and int(match_state.get("substitutionsLeft", 0)) > 0

static func is_substitution_valid(match_state: Dictionary, new_char_id: int) -> bool:
	return new_char_id != int(match_state.get("opponentCharId", 0))

static func execute_substitution(match_state: Dictionary, game_state: Dictionary, new_char_id: int) -> bool:
	if not can_substitute(match_state):
		return false
	var char_data: Dictionary = _get_char_data(new_char_id)
	if char_data.is_empty():
		return false

	var old_char_id: int = int(match_state.get("playerCharId", 0))
	match_state["playerCharId"] = new_char_id
	match_state["substitutionsLeft"] = int(match_state.get("substitutionsLeft", 0)) - 1

	# 找到人类玩家（用旧 characterId）
	for p in game_state.get("players", []):
		if int(p.get("characterId", 0)) == old_char_id:
			p["characterId"] = int(char_data.get("id", 0))
			p["hp"] = int(char_data.get("hp", 0))
			p["maxHp"] = int(char_data.get("hp", 0))
			p["skillUses"] = int(char_data.get("maxUses", 0))  # 换人后技能恢复到满
			break

	game_state["messageLog"].append("🔄 换人：%s 上场！（剩余换人 %d 次）" % [char_data.get("name", "?"), match_state.get("substitutionsLeft", 0)])
	return true

static func skip_substitution(match_state: Dictionary, game_state: Dictionary) -> void:
	match_state["substitutionPending"] = false
	reset_game_for_next_life(match_state, game_state)

# ===== 点球大战 =====

static func execute_penalty_round(match_state: Dictionary) -> Dictionary:
	if match_state.get("penalty") == null or match_state.get("matchOver", false):
		return {}
	var pen: Dictionary = match_state["penalty"]

	ensure_penalty_deck(match_state)

	# 各抽2张
	var r1: Dictionary = GameDeck.draw_cards(match_state.get("penaltyDeck", []), 2)
	match_state["penaltyDeck"] = r1["remaining"]
	var r2: Dictionary = GameDeck.draw_cards(match_state.get("penaltyDeck", []), 2)
	match_state["penaltyDeck"] = r2["remaining"]

	# 弃入墓地
	for c in r1["drawn"]:
		match_state["penaltyGrave"].append(c)
	for c in r2["drawn"]:
		match_state["penaltyGrave"].append(c)

	pen["playerCards"] = r1["drawn"]
	pen["opponentCards"] = r2["drawn"]

	# 计算总分
	var player_sum: int = 0
	for c in r1["drawn"]:
		player_sum += int(GameConstants.RANK_VALUES.get(c.get("rank", ""), 0))
	var opponent_sum: int = 0
	for c in r2["drawn"]:
		opponent_sum += int(GameConstants.RANK_VALUES.get(c.get("rank", ""), 0))

	pen["round"] = int(pen.get("round", 0)) + 1

	if player_sum > opponent_sum:
		pen["playerScore"] = int(pen.get("playerScore", 0)) + 1
		pen["lastResult"] = "player"
	elif opponent_sum > player_sum:
		pen["opponentScore"] = int(pen.get("opponentScore", 0)) + 1
		pen["lastResult"] = "opponent"
	else:
		pen["lastResult"] = "draw"

	var first_to: int = int(GameWorldCupConstants.MATCH_CONFIG["penaltyFirstTo"])
	var result: Dictionary = {
		"winner": null,
		"playerSum": player_sum,
		"opponentSum": opponent_sum,
		"playerCards": pen["playerCards"],
		"opponentCards": pen["opponentCards"],
	}
	# 检查是否有人先到5分
	if int(pen.get("playerScore", 0)) >= first_to:
		match_state["winner"] = 0
		result["winner"] = 0
		return result
	if int(pen.get("opponentScore", 0)) >= first_to:
		match_state["winner"] = 1
		result["winner"] = 1
		return result
	return result

static func ensure_penalty_deck(match_state: Dictionary) -> void:
	if match_state.get("penaltyDeck", []).size() < 4:
		match_state["penaltyDeck"] = GameDeck.reshuffle_from_grave(match_state.get("penaltyGrave", []))
		match_state["penaltyGrave"] = []

static func is_penalty_over(match_state: Dictionary) -> bool:
	return match_state.get("winner") != null

# ===== 小组赛 =====

static func get_group_match_result(match_state: Dictionary) -> String:
	if not match_state.get("matchOver", false):
		return ""
	var score: Array = match_state["score"]
	var p_score: int = int(score[0])
	var o_score: int = int(score[1])
	if p_score > o_score:
		return "win"
	if p_score < o_score:
		return "loss"
	return "draw"
