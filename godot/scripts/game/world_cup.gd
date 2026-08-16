class_name GameWorldCup
## 世界杯锦标赛状态机 — 小组赛→淘汰赛（从 src/game/worldCup.js 移植）

const GameWorldCupConstants = preload("res://scripts/game/world_cup_constants.gd")
const GameConstants = preload("res://scripts/game/constants.gd")

static func _shuffle(arr: Array) -> Array:
	var a: Array = arr.duplicate()
	for i in range(a.size() - 1, 0, -1):
		var j: int = randi() % (i + 1)
		var tmp = a[i]
		a[i] = a[j]
		a[j] = tmp
	return a

static func _pick_random_names(pool: Array, n: int, exclude: Array = []) -> Array:
	var available: Array = []
	for name in pool:
		if not exclude.has(name):
			available.append(name)
	var shuffled: Array = _shuffle(available)
	var result: Array = []
	for i in range(mini(n, shuffled.size())):
		result.append(shuffled[i])
	return result

# ===== 创建锦标赛状态 =====

static func create_world_cup_state(player_team_name: String, opponent_names_override: Array = []) -> Dictionary:
	var opponent_names: Array
	if not opponent_names_override.is_empty():
		opponent_names = opponent_names_override.duplicate()
	else:
		opponent_names = _pick_random_names(GameWorldCupConstants.AI_TEAM_NAMES, 3, [player_team_name])
	var opponent_emojis: Array = []
	for name in opponent_names:
		var idx: int = GameWorldCupConstants.AI_TEAM_NAMES.find(name)
		opponent_emojis.append(GameWorldCupConstants.TEAM_EMOJIS[idx] if idx >= 0 else "🏳️")

	return {
		"phase": "group",  # 'group' | 'knockout' | 'champion' | 'eliminated'
		"playerTeamName": player_team_name,
		"groupName": "A",
		"groupTeams": [
			{"name": player_team_name, "isPlayer": true, "emoji": "⭐"},
			{"name": opponent_names[0], "isPlayer": false, "emoji": opponent_emojis[0]},
			{"name": opponent_names[1], "isPlayer": false, "emoji": opponent_emojis[1]},
			{"name": opponent_names[2], "isPlayer": false, "emoji": opponent_emojis[2]},
		],
		"groupMatches": [],  # 小组赛6场比赛
		"groupStandings": null,
		"knockoutRound": null,  # 'R16' | 'QF' | 'SF' | 'Final' | null
		"knockoutOpponent": null,
		"substitutionsLeft": 3,
		"currentMatch": null,
	}

# ===== 小组赛 =====

static func init_group_matches(state: Dictionary) -> void:
	# 4队单循环：6场比赛。顺序：玩家(0)先打完3场，然后模拟其他3场
	state["groupMatches"] = [
		{"home": 0, "away": 1, "played": false, "result": null, "isPlayerMatch": true},
		{"home": 0, "away": 2, "played": false, "result": null, "isPlayerMatch": true},
		{"home": 0, "away": 3, "played": false, "result": null, "isPlayerMatch": true},
		{"home": 1, "away": 2, "played": false, "result": null, "isPlayerMatch": false},
		{"home": 1, "away": 3, "played": false, "result": null, "isPlayerMatch": false},
		{"home": 2, "away": 3, "played": false, "result": null, "isPlayerMatch": false},
	]

static func get_player_group_matches(state: Dictionary) -> Array:
	var result: Array = []
	for m in state.get("groupMatches", []):
		if m.get("isPlayerMatch", false) and not m.get("played", false):
			result.append(m)
	return result

static func get_next_player_group_match(state: Dictionary) -> int:
	var matches: Array = state.get("groupMatches", [])
	for i in range(matches.size()):
		if matches[i].get("isPlayerMatch", false) and not matches[i].get("played", false):
			return i
	return -1

static func simulate_non_player_matches(state: Dictionary) -> void:
	var matches: Array = state.get("groupMatches", [])
	for m in matches:
		if m.get("isPlayerMatch", false) or m.get("played", false):
			continue
		var r: float = randf()
		if r < 0.4:
			m["result"] = "home"
		elif r < 0.7:
			m["result"] = "draw"
		else:
			m["result"] = "away"
		m["played"] = true

static func record_group_match_result(state: Dictionary, match_index: int, result: String) -> void:
	# result: 'home'=玩家胜, 'away'=对方胜, 'draw'=平
	var matches: Array = state.get("groupMatches", [])
	if match_index < 0 or match_index >= matches.size():
		return
	var m: Dictionary = matches[match_index]
	if m.get("played", false):
		return
	m["result"] = result
	m["played"] = true

static func calculate_group_standings(state: Dictionary) -> Array:
	var teams: Array = []
	var group_teams: Array = state.get("groupTeams", [])
	for i in range(group_teams.size()):
		var t: Dictionary = group_teams[i]
		teams.append({
			"index": i,
			"name": t.get("name", "?"),
			"emoji": t.get("emoji", ""),
			"isPlayer": t.get("isPlayer", false),
			"played": 0,
			"wins": 0,
			"draws": 0,
			"losses": 0,
			"goalsFor": 0,
			"goalsAgainst": 0,
			"points": 0,
		})

	for m in state.get("groupMatches", []):
		if not m.get("played", false) or m.get("result") == null:
			continue
		var home: Dictionary = teams[int(m["home"])]
		var away: Dictionary = teams[int(m["away"])]
		home["played"] = int(home["played"]) + 1
		away["played"] = int(away["played"]) + 1
		var res: String = String(m["result"])
		if res == "home":
			home["wins"] = int(home["wins"]) + 1
			home["points"] = int(home["points"]) + int(GameWorldCupConstants.POINTS["WIN"])
			away["losses"] = int(away["losses"]) + 1
		elif res == "away":
			away["wins"] = int(away["wins"]) + 1
			away["points"] = int(away["points"]) + int(GameWorldCupConstants.POINTS["WIN"])
			home["losses"] = int(home["losses"]) + 1
		else:
			home["draws"] = int(home["draws"]) + 1
			away["draws"] = int(away["draws"]) + 1
			home["points"] = int(home["points"]) + int(GameWorldCupConstants.POINTS["DRAW"])
			away["points"] = int(away["points"]) + int(GameWorldCupConstants.POINTS["DRAW"])
		# 小组赛简化：每场比赛进1球（赢方1-0，平局0-0）
		if res == "home":
			home["goalsFor"] = int(home["goalsFor"]) + 1
			away["goalsAgainst"] = int(away["goalsAgainst"]) + 1
		elif res == "away":
			away["goalsFor"] = int(away["goalsFor"]) + 1
			home["goalsAgainst"] = int(home["goalsAgainst"]) + 1

	# 排序：积分高→净胜球多→进球多（sort_custom: true 表示 a 排在 b 前）
	teams.sort_custom(func(a, b):
		if int(a["points"]) != int(b["points"]):
			return int(a["points"]) > int(b["points"])
		var gd_a: int = int(a["goalsFor"]) - int(a["goalsAgainst"])
		var gd_b: int = int(b["goalsFor"]) - int(b["goalsAgainst"])
		if gd_a != gd_b:
			return gd_a > gd_b
		return int(a["goalsFor"]) > int(b["goalsFor"])
	)
	state["groupStandings"] = teams
	return teams

static func check_group_advancement(state: Dictionary) -> Dictionary:
	var standings: Array = state.get("groupStandings")
	if standings == null or standings.is_empty():
		standings = calculate_group_standings(state)
	var player_idx: int = -1
	for i in range(standings.size()):
		if standings[i].get("isPlayer", false):
			player_idx = i
			break
	var rank: int = player_idx + 1

	# 检查第2名和第3名同分情况
	var need_tiebreaker: bool = false
	if standings.size() >= 3:
		var second: Dictionary = standings[1]
		var third: Dictionary = standings[2]
		if int(second.get("points", 0)) == int(third.get("points", 0)):
			need_tiebreaker = true

	return {
		"advanced": rank <= 2,
		"rank": rank,
		"needTiebreaker": need_tiebreaker and (rank == 2 or rank == 3),
		"standings": standings,
	}

# ===== 淘汰赛 =====

static func init_knockout_opponent() -> Dictionary:
	var names: Array = GameWorldCupConstants.AI_TEAM_NAMES
	var name: String = names[randi() % names.size()]
	var idx: int = names.find(name)
	var emoji: String = GameWorldCupConstants.TEAM_EMOJIS[idx] if idx >= 0 else "🏳️"
	# 随机选角色（排除开发者角色12）
	var chars: Array = []
	for cid in GameConstants.CHARACTERS.keys():
		if int(cid) != 12:
			chars.append(int(cid))
	var char_id: int = chars[randi() % chars.size()]
	return {"name": name, "emoji": emoji, "charId": char_id}

static func get_knockout_round_name(round: String) -> String:
	return GameWorldCupConstants.KNOCKOUT_NAMES.get(round, round)

static func advance_knockout_round(state: Dictionary) -> void:
	var order: Array = ["R16", "QF", "SF", "Final", "champion"]
	var current: Variant = state.get("knockoutRound")
	var current_idx: int = order.find(current)

	if current_idx < 0:
		# 初始进入淘汰赛
		state["knockoutRound"] = "R16"
	elif String(state.get("knockoutRound", "")) == "Final":
		# 赢得决赛 → 冠军
		state["phase"] = "champion"
		state["knockoutRound"] = "champion"
		return
	else:
		# 晋级下一轮
		state["knockoutRound"] = order[current_idx + 1]

	# 生成新对手
	state["knockoutOpponent"] = init_knockout_opponent()

static func eliminate_player(state: Dictionary) -> void:
	state["phase"] = "eliminated"

static func get_random_group_opponent_char() -> int:
	var chars: Array = []
	for cid in GameConstants.CHARACTERS.keys():
		if int(cid) != 12:
			chars.append(int(cid))
	return chars[randi() % chars.size()]
