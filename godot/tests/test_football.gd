extends SceneTree
## 足球模式纯逻辑自测：match_state / world_cup / league
## 运行：godot --headless --path godot --script res://tests/test_football.gd

const GameConstants = preload("res://scripts/game/constants.gd")
const GameMatchState = preload("res://scripts/game/match_state.gd")
const GameWorldCup = preload("res://scripts/game/world_cup.gd")
const GameWorldCupConstants = preload("res://scripts/game/world_cup_constants.gd")
const GameLeague = preload("res://scripts/game/league.gd")
const GameLeagueConstants = preload("res://scripts/game/league_constants.gd")

var _failures: int = 0

func _initialize() -> void:
	_test_match_state()
	_test_world_cup()
	_test_league()
	if _failures == 0:
		print("PASS: all football tests")
	else:
		push_error("FAIL: %d football test(s) failed" % _failures)
	quit(_failures)

func _check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok - ", msg)
	else:
		_failures += 1
		push_error("  FAIL - " + msg)

# ===== match_state =====

func _test_match_state() -> void:
	print("match_state")
	var ms: Dictionary = GameMatchState.create_match_state(true, 1, 2)
	_check(ms["score"][0] == 0 and ms["score"][1] == 0, "score initialized")
	_check(ms["matchRound"] == 1, "match round 1")
	_check(ms["matchOver"] == false, "not over yet")

	# 模拟击杀：玩家(1)击杀对手(2) → 玩家进球
	var gs: Dictionary = {
		"players": [
			{"index": 0, "characterId": 1, "name": "玩家"},
			{"index": 1, "characterId": 2, "name": "对手"},
		],
		"matchContext": null,
		"messageLog": [],
		"round": 5,
	}
	GameMatchState.on_player_eliminated(ms, gs, 1, 0, 5)
	_check(ms["score"][0] == 1, "player goal recorded")
	_check(ms["substitutionPending"] == true, "substitution pending")

	# 90回合平局：小组赛直接结束
	var ms2: Dictionary = GameMatchState.create_match_state(true, 1, 2)
	ms2["matchRound"] = 90
	ms2["score"] = [2, 2]
	var gs2: Dictionary = {"players": [], "gameOver": false, "winnerIndex": -1}
	GameMatchState.check_match_end(ms2, gs2)
	_check(ms2["matchOver"] == true, "group draw ends at 90")
	_check(ms2["winner"] == null, "draw winner null")

	# 90回合平局：淘汰赛进加时
	var ms3: Dictionary = GameMatchState.create_match_state(false, 1, 2)
	ms3["matchRound"] = 90
	ms3["score"] = [1, 1]
	GameMatchState.check_match_end(ms3, gs2)
	_check(ms3["matchOver"] == false, "knockout draw not over")
	_check(ms3["isExtraTime"] == true, "extra time started")

	# 120回合仍平：点球大战
	ms3["matchRound"] = 120
	GameMatchState.check_match_end(ms3, gs2)
	_check(ms3["isPenaltyShootout"] == true, "penalty shootout")
	_check(ms3["penalty"] != null, "penalty state created")

	# 点球一轮（控制器约定：临时放开 matchOver，执行完恢复）
	ms3["matchOver"] = false
	var pr: Dictionary = GameMatchState.execute_penalty_round(ms3)
	ms3["matchOver"] = true
	_check(pr.has("winner") and pr.has("playerSum") and pr.has("opponentSum"), "penalty round result")
	_check(int(ms3["penalty"]["round"]) == 1, "penalty round 1")

	# 换人
	var ms4: Dictionary = GameMatchState.create_match_state(false, 1, 2)
	ms4["substitutionPending"] = true
	ms4["substitutionsLeft"] = 3
	var gs4: Dictionary = {
		"players": [{"characterId": 1, "name": "玩家", "hp": 11, "maxHp": 11, "skillUses": 3}],
		"messageLog": [],
	}
	var ok: bool = GameMatchState.execute_substitution(ms4, gs4, 3)
	_check(ok, "substitution executed")
	_check(ms4["playerCharId"] == 3, "player char changed")
	_check(ms4["substitutionsLeft"] == 2, "substitutions decremented")
	_check(int(gs4["players"][0]["characterId"]) == 3, "player object updated")

	# 非法换人：与对手相同
	var ms5: Dictionary = GameMatchState.create_match_state(false, 1, 2)
	ms5["substitutionPending"] = true
	_check(GameMatchState.is_substitution_valid(ms5, 2) == false, "same as opponent invalid")
	_check(GameMatchState.is_substitution_valid(ms5, 3) == true, "different char valid")

# ===== world_cup =====

func _test_world_cup() -> void:
	print("world_cup")
	var wc: Dictionary = GameWorldCup.create_world_cup_state("玩家队", ["巴西", "德国", "阿根廷"])
	_check(wc["phase"] == "group", "group phase")
	_check(wc["groupTeams"].size() == 4, "4 group teams")
	_check(wc["groupTeams"][0]["isPlayer"] == true, "player team first")

	GameWorldCup.init_group_matches(wc)
	_check(wc["groupMatches"].size() == 6, "6 group matches")
	var next_idx: int = GameWorldCup.get_next_player_group_match(wc)
	_check(next_idx == 0, "first player match")

	# 记录玩家3场结果 + 模拟非玩家比赛
	GameWorldCup.record_group_match_result(wc, 0, "home")
	GameWorldCup.record_group_match_result(wc, 1, "home")
	GameWorldCup.record_group_match_result(wc, 2, "draw")
	GameWorldCup.simulate_non_player_matches(wc)
	var standings: Array = GameWorldCup.calculate_group_standings(wc)
	_check(standings.size() == 4, "4 standings rows")
	_check(standings[0]["isPlayer"] == true, "player top with 7 pts")
	_check(int(standings[0]["points"]) == 7, "player 7 points")

	var adv: Dictionary = GameWorldCup.check_group_advancement(wc)
	_check(adv["advanced"] == true, "player advanced")

	# 淘汰赛
	GameWorldCup.advance_knockout_round(wc)
	_check(wc["knockoutRound"] == "R16", "knockout R16")
	_check(wc["knockoutOpponent"] != null, "knockout opponent")
	var opp: Dictionary = wc["knockoutOpponent"]
	_check(opp.has("charId") and opp.has("name"), "opponent fields")

	# 晋级到冠军
	wc["knockoutRound"] = "Final"
	GameWorldCup.advance_knockout_round(wc)
	_check(wc["phase"] == "champion", "champion after final")

	# 淘汰
	var wc2: Dictionary = GameWorldCup.create_world_cup_state("A队")
	GameWorldCup.eliminate_player(wc2)
	_check(wc2["phase"] == "eliminated", "eliminated phase")

	_check(GameWorldCup.get_knockout_round_name("QF") == "四分之一决赛", "round name")

# ===== league =====

func _test_league() -> void:
	print("league")
	var lg: Dictionary = GameLeague.create_league_state(1)
	_check(lg["playerTeamId"] == 1, "player team 1")
	_check(lg["currentRound"] == 1, "round 1")

	# 卡牌加成
	var bonus: Dictionary = GameLeague.get_card_bonus(1, 10, true)
	_check(bonus["attackBonus"] == 3, "tier1 vs tier3 home: atk+3")
	var bonus2: Dictionary = GameLeague.get_card_bonus(10, 1, false)
	_check(bonus2["attackBonus"] == 0 and bonus2["defenseBonus"] == 0, "tier3 away no bonus")

	# 玩家比赛查询（第1轮：曼城(1) 主队 vs 狼队(10)）
	var pm: Dictionary = GameLeague.get_player_match_for_round(lg, 1)
	_check(not pm.is_empty(), "player match round 1")
	_check(pm["isHome"] == true, "player home round 1")
	_check(GameLeague.get_player_opponent(lg, 1) == 10, "opponent wolf round 1")

	# 记录结果（玩家视角 home 胜 → 绝对 home）
	GameLeague.record_match_result(lg, 1, "home")
	_check(GameLeague.get_match_result(lg, 1, 0) == "home", "recorded as home")
	_check(GameLeague.get_player_result(lg, 1) == "win", "player win")

	# 模拟非玩家比赛
	GameLeague.simulate_non_player_matches(lg, 1)
	_check(lg["roundSimulated"].has(1), "round simulated")

	# 积分榜
	var standings: Array = GameLeague.calculate_standings(lg)
	_check(standings.size() == 10, "10 teams")
	var player_found: bool = false
	var player_pts: int = -1
	for t in standings:
		if t.get("isPlayer", false):
			player_found = true
			player_pts = int(t.get("points", 0))
	_check(player_found and player_pts == 3, "player in standings with 3 pts")

	# 联赛未结束
	_check(GameLeague.is_league_finished(lg) == false, "league not finished")

	# 打完剩余轮次（玩家全胜 → 54分，无人同分 → 不需要加赛）
	# 约定：record_match_result 的 "home" 参数 = 玩家胜（控制器 winner===0 时传 "home"）
	for r in range(2, 19):
		var pm2: Dictionary = GameLeague.get_player_match_for_round(lg, r)
		GameLeague.simulate_non_player_matches(lg, r)
		if not pm2.is_empty():
			GameLeague.record_match_result(lg, r, "home")
		lg["currentRound"] = r + 1
	_check(GameLeague.is_league_finished(lg) == true, "league finished after 18")

	# 加赛检测（玩家54分，无同分 → 不需要）
	var tb: Dictionary = GameLeague.check_tiebreaker_needed(lg)
	_check(tb["needed"] == false, "no tiebreaker")

	# 3v3 比分计算
	var death_order: Array = [
		{"teamId": 0}, {"teamId": 1}, {"teamId": 0}, {"teamId": 0},
	]
	var score: Dictionary = GameLeague.calculate_match_score(death_order, 0, 1)
	_check(score["playerScore"] == 7 and score["opponentScore"] == 2, "3v3 score calc")
