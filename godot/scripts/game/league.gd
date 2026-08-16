class_name GameLeague
## 联赛状态机 — 10队双循环联赛（18轮）（从 src/game/league.js 移植）

const GameLeagueConstants = preload("res://scripts/game/league_constants.gd")

static func _shuffle(arr: Array) -> Array:
	var a: Array = arr.duplicate()
	for i in range(a.size() - 1, 0, -1):
		var j: int = randi() % (i + 1)
		var tmp = a[i]
		a[i] = a[j]
		a[j] = tmp
	return a

static func get_team_tier(team_id: int) -> int:
	var team: Variant = GameLeagueConstants.LEAGUE_TEAMS[team_id] if team_id < GameLeagueConstants.LEAGUE_TEAMS.size() else null
	if team is Dictionary:
		return int(team.get("tier", 3))
	return 3

## 计算卡牌加成（等级差 + 主场）
static func get_card_bonus(player_team_id: int, opponent_team_id: int, is_home: bool) -> Dictionary:
	var player_tier: int = get_team_tier(player_team_id)
	var opponent_tier: int = get_team_tier(opponent_team_id)
	var attack_bonus: int = 0
	var defense_bonus: int = 0

	var tier_diff: int = opponent_tier - player_tier  # 正数=玩家等级更高

	if tier_diff >= 1:
		if tier_diff >= 2:
			# 一流 vs 末流：攻击+2，防御+2
			attack_bonus = 2
			defense_bonus = 2
		else:
			# 一流 vs 二流 或 二流 vs 末流：攻击+2
			attack_bonus = 2

	# 主场加成：攻击牌额外+1
	if is_home:
		attack_bonus += 1

	return {"attackBonus": attack_bonus, "defenseBonus": defense_bonus}

# ===== 创建联赛状态 =====

static func create_league_state(player_team_id: int) -> Dictionary:
	return {
		"playerTeamId": player_team_id,
		"currentRound": 1,
		"results": {},          # results[round_matchIdx] = 'home' | 'away' | 'draw'
		"roundSimulated": {},   # 本轮非玩家比赛是否已模拟
	}

# ===== 赛程查询 =====

static func get_round_matches(round_num: int) -> Array:
	if round_num < 1 or round_num > GameLeagueConstants.TOTAL_ROUNDS:
		return []
	return GameLeagueConstants.LEAGUE_SCHEDULE[round_num] if round_num < GameLeagueConstants.LEAGUE_SCHEDULE.size() else []

## 玩家在某一轮参与的比赛
static func get_player_match_for_round(state: Dictionary, round_num: int) -> Dictionary:
	var matches: Array = get_round_matches(round_num)
	var player_team_id: int = int(state.get("playerTeamId", 0))
	for i in range(matches.size()):
		var m: Dictionary = matches[i]
		if int(m.get("home", -1)) == player_team_id:
			return {"matchIdx": i, "match": m, "isHome": true}
		if int(m.get("away", -1)) == player_team_id:
			return {"matchIdx": i, "match": m, "isHome": false}
	return {}

static func is_player_home(state: Dictionary, round_num: int) -> bool:
	var pm: Dictionary = get_player_match_for_round(state, round_num)
	return pm.get("isHome", false) if not pm.is_empty() else false

static func get_player_opponent(state: Dictionary, round_num: int) -> int:
	var pm: Dictionary = get_player_match_for_round(state, round_num)
	if pm.is_empty():
		return -1
	return int(pm["match"].get("away", -1)) if pm.get("isHome", false) else int(pm["match"].get("home", -1))

# ===== 自动模拟 =====

static func simulate_non_player_matches(state: Dictionary, round_num: int) -> void:
	if state.get("roundSimulated", {}).has(round_num):
		return
	var matches: Array = get_round_matches(round_num)
	var player_team_id: int = int(state.get("playerTeamId", 0))
	var results: Dictionary = state.get("results", {})
	for idx in range(matches.size()):
		var m: Dictionary = matches[idx]
		if int(m.get("home", -1)) == player_team_id or int(m.get("away", -1)) == player_team_id:
			continue
		var key: String = "%d_%d" % [round_num, idx]
		if results.has(key):
			continue
		results[key] = simulate_match(int(m.get("home", 0)), int(m.get("away", 0)))
	state["roundSimulated"][round_num] = true

## 自动模拟单场比赛（胜率表含主场优势）
static func simulate_match(home_id: int, away_id: int) -> String:
	var home_tier: int = get_team_tier(home_id)
	var away_tier: int = get_team_tier(away_id)

	var home_win_prob: float
	var draw_prob: float
	var away_win_prob: float

	if home_tier == away_tier:
		home_win_prob = 0.35
		draw_prob = 0.3
		away_win_prob = 0.35
	elif home_tier < away_tier:
		# 主队等级更高
		if home_tier == 1 and away_tier == 3:
			home_win_prob = 0.75
			draw_prob = 0.15
			away_win_prob = 0.1
		else:
			home_win_prob = 0.6
			draw_prob = 0.2
			away_win_prob = 0.2
	else:
		# 主队等级更低 — 翻转
		if away_tier == 1 and home_tier == 3:
			home_win_prob = 0.1
			draw_prob = 0.15
			away_win_prob = 0.75
		else:
			home_win_prob = 0.2
			draw_prob = 0.2
			away_win_prob = 0.6

	var r: float = randf()
	if r < home_win_prob:
		return "home"
	if r < home_win_prob + draw_prob:
		return "draw"
	return "away"

# ===== 比赛结果记录 =====

static func record_match_result(state: Dictionary, round_num: int, result: String) -> void:
	# result: 'home'/'away'/'draw'（玩家视角）
	var pm: Dictionary = get_player_match_for_round(state, round_num)
	if pm.is_empty():
		return
	var key: String = "%d_%d" % [round_num, pm["matchIdx"]]
	var results: Dictionary = state.get("results", {})
	# 转换为绝对视角
	if pm.get("isHome", false):
		results[key] = result
	else:
		if result == "home":
			results[key] = "away"
		elif result == "away":
			results[key] = "home"
		else:
			results[key] = "draw"

static func get_match_result(state: Dictionary, round_num: int, match_idx: int) -> String:
	var results: Dictionary = state.get("results", {})
	return results.get("%d_%d" % [round_num, match_idx], "")

## 玩家在某轮比赛的结果（玩家视角）
static func get_player_result(state: Dictionary, round_num: int) -> String:
	var pm: Dictionary = get_player_match_for_round(state, round_num)
	if pm.is_empty():
		return ""
	var key: String = "%d_%d" % [round_num, pm["matchIdx"]]
	var results: Dictionary = state.get("results", {})
	var absolute_result: String = results.get(key, "")
	if absolute_result.is_empty():
		return ""
	if absolute_result == "draw":
		return "draw"
	if pm.get("isHome", false):
		return "win" if absolute_result == "home" else "loss"
	return "win" if absolute_result == "away" else "loss"

# ===== 积分榜 =====

static func calculate_standings(state: Dictionary) -> Array:
	var teams: Array = []
	for team_id in range(1, GameLeagueConstants.LEAGUE_TEAMS.size()):
		var t: Variant = GameLeagueConstants.LEAGUE_TEAMS[team_id]
		teams.append({
			"teamId": team_id,
			"name": t.get("name", "?"),
			"emoji": t.get("emoji", ""),
			"tier": t.get("tier", 3),
			"isPlayer": team_id == int(state.get("playerTeamId", 0)),
			"played": 0,
			"wins": 0,
			"draws": 0,
			"losses": 0,
			"points": 0,
		})

	var results: Dictionary = state.get("results", {})
	for round_num in range(1, GameLeagueConstants.TOTAL_ROUNDS + 1):
		var matches: Array = get_round_matches(round_num)
		for idx in range(matches.size()):
			var key: String = "%d_%d" % [round_num, idx]
			var result: String = results.get(key, "")
			if result.is_empty():
				continue
			var m: Dictionary = matches[idx]
			var home: Dictionary = teams[int(m["home"]) - 1]
			var away: Dictionary = teams[int(m["away"]) - 1]
			home["played"] = int(home["played"]) + 1
			away["played"] = int(away["played"]) + 1
			if result == "home":
				home["wins"] = int(home["wins"]) + 1
				home["points"] = int(home["points"]) + int(GameLeagueConstants.LEAGUE_POINTS["WIN"])
				away["losses"] = int(away["losses"]) + 1
			elif result == "away":
				away["wins"] = int(away["wins"]) + 1
				away["points"] = int(away["points"]) + int(GameLeagueConstants.LEAGUE_POINTS["WIN"])
				home["losses"] = int(home["losses"]) + 1
			else:
				home["draws"] = int(home["draws"]) + 1
				away["draws"] = int(away["draws"]) + 1
				home["points"] = int(home["points"]) + int(GameLeagueConstants.LEAGUE_POINTS["DRAW"])
				away["points"] = int(away["points"]) + int(GameLeagueConstants.LEAGUE_POINTS["DRAW"])

	# 排序：积分降序（sort_custom: true 表示 a 排在 b 前）
	teams.sort_custom(func(a, b): return int(a["points"]) > int(b["points"]))
	return teams

static func is_league_finished(state: Dictionary) -> bool:
	return int(state.get("currentRound", 1)) > GameLeagueConstants.TOTAL_ROUNDS

## 联赛结束后与某队同分 → 需要加赛
static func check_tiebreaker_needed(state: Dictionary) -> Dictionary:
	if not is_league_finished(state):
		return {"needed": false, "opponentTeamId": -1}
	var standings: Array = calculate_standings(state)
	var player_points: int = -1
	for t in standings:
		if t.get("isPlayer", false):
			player_points = int(t.get("points", 0))
			break
	if player_points < 0:
		return {"needed": false, "opponentTeamId": -1}
	# 找到和玩家同分的其他球队
	for t in standings:
		if not t.get("isPlayer", false) and int(t.get("points", 0)) == player_points:
			return {"needed": true, "opponentTeamId": int(t.get("teamId", -1))}
	return {"needed": false, "opponentTeamId": -1}

# ===== 3v3 比赛结果计算 =====

static func calculate_match_score(death_order: Array, player_team_id: int, opponent_team_id: int) -> Dictionary:
	var total_players: int = 6
	var rank_points: Array = [0, 2, 3, 4, 5, 7]  # 第6名到第1名的积分

	var player_score: int = 0
	var opponent_score: int = 0

	# 先计算已确定的名次
	for i in range(death_order.size()):
		var entry: Dictionary = death_order[i]
		var points: int = rank_points[i] if i < rank_points.size() else 0
		if int(entry.get("teamId", -1)) == player_team_id:
			player_score += points
		elif int(entry.get("teamId", -1)) == opponent_team_id:
			opponent_score += points

	# 剩余名次随机分配给存活者所属队伍
	var remaining_ranks: int = total_players - death_order.size()
	if remaining_ranks > 0:
		var dead_has_player: bool = false
		var dead_has_opponent: bool = false
		for entry in death_order:
			if int(entry.get("teamId", -1)) == player_team_id:
				dead_has_player = true
			elif int(entry.get("teamId", -1)) == opponent_team_id:
				dead_has_opponent = true
		var surviving_team: int = -1
		if dead_has_player and not dead_has_opponent:
			surviving_team = opponent_team_id
		elif not dead_has_player and dead_has_opponent:
			surviving_team = player_team_id

		if surviving_team >= 0:
			# 一方团灭，剩余名次全归胜方
			for i in range(death_order.size(), total_players):
				var points: int = rank_points[i] if i < rank_points.size() else 0
				if surviving_team == player_team_id:
					player_score += points
				else:
					opponent_score += points

	var winner: Variant = null
	if player_score > opponent_score:
		winner = 0
	elif opponent_score > player_score:
		winner = 1

	return {"playerScore": player_score, "opponentScore": opponent_score, "winner": winner}
