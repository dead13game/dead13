extends SceneTree
## 联赛 3v3 逻辑自测：死亡顺序计分 / 团灭 / 回合上限
## 运行：godot --headless --path godot --script res://tests/test_league_3v3.gd

const GameLeague = preload("res://scripts/game/league.gd")
const GameState = preload("res://scripts/game/game_state.gd")
const GameDamage = preload("res://scripts/game/damage.gd")

var _failures: int = 0
var _wipe_team: Variant = null
var _limit_hit: bool = false

func _initialize() -> void:
	_test_score_calc()
	_test_team_wipe_flow()
	_test_round_limit_flow()
	_test_full_match()
	if _failures == 0:
		print("PASS: all league 3v3 tests")
	else:
		push_error("FAIL: %d league 3v3 test(s) failed" % _failures)
	quit(_failures)

func _check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok - ", msg)
	else:
		_failures += 1
		push_error("  FAIL - " + msg)

# ===== 死亡顺序计分 =====

func _test_score_calc() -> void:
	print("league_3v3_score")
	# 6 名全死：玩家第1/2名（强），对手3-6名
	var death_order: Array = [
		{"playerIndex": 0, "teamId": 1},  # 对手死最早 → 第6名 0分
		{"playerIndex": 1, "teamId": 1},  # 第5名 2分
		{"playerIndex": 2, "teamId": 0},  # 第4名 3分
		{"playerIndex": 3, "teamId": 1},  # 第3名 4分
		{"playerIndex": 4, "teamId": 0},  # 第2名 5分
		{"playerIndex": 5, "teamId": 0},  # 第1名 7分
	]
	var r1: Dictionary = GameLeague.calculate_match_score(death_order, 0, 1)
	_check(int(r1["playerScore"]) == 3 + 5 + 7, "player 15 (3+5+7)")
	_check(int(r1["opponentScore"]) == 0 + 2 + 4, "opponent 6 (0+2+4)")
	_check(int(r1["winner"]) == 0, "player wins")
	# 一方团灭：对手全死，剩余名次归玩家
	var death_order2: Array = [
		{"playerIndex": 0, "teamId": 1},
		{"playerIndex": 1, "teamId": 1},
		{"playerIndex": 2, "teamId": 1},
	]
	var r2: Dictionary = GameLeague.calculate_match_score(death_order2, 0, 1)
	# 对手拿 0+2+3=5；玩家拿 4+5+7=16
	_check(int(r2["playerScore"]) == 4 + 5 + 7, "player 16 wipe")
	_check(int(r2["opponentScore"]) == 0 + 2 + 3, "opponent 5")
	# 平局：比分相等
	var r3: Dictionary = GameLeague.calculate_match_score([], 0, 1)
	_check(r3["winner"] == null, "empty death order -> draw")
	_check(int(r3["playerScore"]) == int(r3["opponentScore"]), "even scores")

# ===== 团灭流程 =====

func _test_team_wipe_flow() -> void:
	print("league_3v3_wipe")
	# 模拟 GameManager 的回调接线：6人局 → 手动击杀3名对手 → 团灭触发
	var state: Dictionary = GameState.create_game_state()
	var death_order: Array = []
	_wipe_team = null
	state["leagueContext"] = {
		"cardBonus": {"attackBonus": 0, "defenseBonus": 0},
		"maxRounds": 12,
		"onPlayerDeath": Callable(self, "_on_death").bind(death_order),
		"onTeamWipe": _on_wipe,
		"onNewRound": func(round: int): pass,
		"onRoundLimit": func(): pass,
	}
	GameState.init_game(state, [1, 2, 3, 4, 5, 6], false, 1, 2, [0, 0, 0, 1, 1, 1])
	_check(state["players"].size() == 6, "6 players")
	# 验证 teamId 分配
	var team0: int = 0
	var team1: int = 0
	for p in state["players"]:
		if int(p.get("teamId", -1)) == 0:
			team0 += 1
		elif int(p.get("teamId", -1)) == 1:
			team1 += 1
	_check(team0 == 3 and team1 == 3, "teams 3v3")
	# 击杀 3 名对手（teamId=1）：先记录死亡，再触发团灭检测
	for p in state["players"]:
		if int(p.get("teamId", -1)) != 1:
			continue
		p["alive"] = false
		_on_death(death_order, int(p.get("index", 0)))
	_check(death_order.size() == 3, "3 deaths recorded")
	GameDamage.check_game_over(state)
	_check(_wipe_team == 0, "team wipe -> surviving team 0 (player)")

func _on_wipe(surviving_team_id: int) -> void:
	_wipe_team = surviving_team_id

func _on_death(order: Array, dead_idx: int) -> void:
	order.append({"playerIndex": dead_idx})

# ===== 回合上限 =====

func _test_round_limit_flow() -> void:
	print("league_3v3_round_limit")
	var state: Dictionary = GameState.create_game_state()
	_limit_hit = false
	state["leagueContext"] = {
		"cardBonus": {"attackBonus": 0, "defenseBonus": 0},
		"maxRounds": 3,
		"onPlayerDeath": Callable(self, "_on_death_noop"),
		"onTeamWipe": func(surviving_team_id: int): pass,
		"onNewRound": func(round: int): pass,
		"onRoundLimit": _on_round_limit,
	}
	GameState.init_game(state, [1, 2, 3, 4, 5, 6], false, 1, 2, [0, 0, 0, 1, 1, 1])
	# 推进回合直到超过 maxRounds（round 从 1 到 4 触发 >3）
	var guard: int = 0
	while not _limit_hit and guard < 60:
		guard += 1
		GameState.next_player(state)
	_check(_limit_hit, "round limit triggers onRoundLimit (round=%d)" % int(state.get("round", 0)))
	_check(state.get("_elimPaused", false) == true, "elim paused after round limit")

func _on_round_limit() -> void:
	_limit_hit = true

func _on_death_noop(_dead_idx: int) -> void:
	pass

# ===== 完整 3v3 对局 =====

## 模拟 GameManager 完整接线：AI 决策 + 真实攻防 + 死亡顺序 + 团灭 + 计分
func _test_full_match() -> void:
	print("league_3v3_full_match")
	var state: Dictionary = GameState.create_game_state()
	var match_ms: Dictionary = {
		"deathOrder": [], "matchOver": false, "winner": null,
		"playerScore": 0, "opponentScore": 0,
	}
	state["leagueContext"] = {
		"cardBonus": {"attackBonus": 0, "defenseBonus": 0},
		"maxRounds": 12,
		"onPlayerDeath": func(dead_idx: int): _match_on_death(match_ms, state, dead_idx),
		"onTeamWipe": func(surviving_team_id: int): _match_on_wipe(match_ms, state, surviving_team_id),
		"onNewRound": func(round: int): pass,
		"onRoundLimit": func(): pass,
	}
	GameState.init_game(state, [1, 2, 3, 4, 5, 6], false, 1, 2, [0, 0, 0, 1, 1, 1])
	# 直接验证死亡回调接线
	var probe: Dictionary = state["players"][3]
	probe["hp"] = 1
	probe["defensePile"] = []
	GameDamage.apply_damage(state, probe, 999)
	_check(match_ms["deathOrder"].size() == 1, "death callback wired (deathOrder=%d)" % match_ms["deathOrder"].size())
	# 恢复状态重开
	state = GameState.create_game_state()
	match_ms["deathOrder"] = []
	state["leagueContext"] = {
		"cardBonus": {"attackBonus": 0, "defenseBonus": 0},
		"maxRounds": 12,
		"onPlayerDeath": func(dead_idx: int): _match_on_death(match_ms, state, dead_idx),
		"onTeamWipe": func(surviving_team_id: int): _match_on_wipe(match_ms, state, surviving_team_id),
		"onNewRound": func(round: int): pass,
		"onRoundLimit": func(): pass,
	}
	GameState.init_game(state, [1, 2, 3, 4, 5, 6], false, 1, 2, [0, 0, 0, 1, 1, 1])
	# 标记 AI：对手队伍
	for p in state["players"]:
		if int(p.get("teamId", -1)) == 1:
			p["isAI"] = true
	# 强化玩家队伍（血厚+防御）确保能赢下对局
	for p in state["players"]:
		if int(p.get("teamId", -1)) == 0:
			p["maxHp"] = 500
			p["hp"] = 500
			var shields: Array = []
			for i in range(30):
				shields.append({"value": 100, "rank": "盾", "suit": "♦", "isShield": true})
			p["defensePile"] = shields

	var GameAi = preload("res://scripts/game/ai/ai.gd")
	# 玩家策略：始终攻击敌方队伍第一个存活者
	var guard: int = 0
	while not match_ms["matchOver"] and guard < 400:
		guard += 1
		var st: String = String(state.get("step", ""))
		var cur: Dictionary = state["players"][int(state.get("currentPlayerIndex", 0))]
		if not cur.get("alive", false):
			GameState.next_player(state)
			continue
		match st:
			"pickAction":
				if cur.get("isAI", false):
					var dec: Dictionary = GameAi.decide_top_action(state)
					match String(dec.get("action", "defense")):
						"attack":
							GameState.start_attack(state)
						"skill":
							GameState.execute_skill(state)
						_:
							GameState.execute_defense(state)
				else:
					# 玩家：找敌方第一个存活者攻击
					var target: int = -1
					for i in range(state["players"].size()):
						var tp: Dictionary = state["players"][i]
						if tp.get("alive", false) and int(tp.get("teamId", -1)) == 1:
							target = i
							break
					if target >= 0:
						state["_testTarget"] = target
						GameState.start_attack(state)
					else:
						GameState.execute_defense(state)
			"attackShowCard", "pickTarget":
				if cur.get("isAI", false):
					var t_dec: Dictionary = GameAi.decide_target(state, {"action": "attack", "characterId": int(cur.get("characterId", 0))})
					GameState.execute_attack(state, int(t_dec.get("targetIndex", 0)))
				else:
					# 重新找存活目标（目标可能已被击杀）
					var tgt: int = -1
					for i in range(state["players"].size()):
						var tp2: Dictionary = state["players"][i]
						if tp2.get("alive", false) and int(tp2.get("teamId", -1)) == 1:
							tgt = i
							break
					if tgt >= 0:
						GameState.execute_attack(state, tgt)
					else:
						GameState.execute_defense(state)
			"skillPickTarget":
				if cur.get("isAI", false):
					var s_dec: Dictionary = GameAi.decide_target(state, {"action": "skill", "characterId": int(cur.get("characterId", 0))})
					GameState.execute_skill(state)
				else:
					GameState.execute_skill(state)
			_:
				GameState.end_action(state)
	_check(match_ms["matchOver"], "match reaches over (guard=%d)" % guard)
	var total_deaths: int = match_ms["deathOrder"].size()
	_check(total_deaths >= 3, "at least 3 deaths recorded: %d" % total_deaths)
	var p_score: int = int(match_ms["playerScore"])
	var o_score: int = int(match_ms["opponentScore"])
	_check(p_score + o_score == 21, "total score = 21 (0+2+3+4+5+7): %d+%d" % [p_score, o_score])
	_check(match_ms["winner"] == 0, "player team wins (winner=%s)" % str(match_ms["winner"]))

func _match_on_death(ms: Dictionary, state: Dictionary, dead_idx: int) -> void:
	if dead_idx < 0 or dead_idx >= state["players"].size():
		return
	var dead: Dictionary = state["players"][dead_idx]
	ms["deathOrder"].append({
		"playerIndex": dead_idx,
		"teamId": int(dead.get("teamId", -1)),
		"charId": int(dead.get("characterId", 0)),
	})

func _match_on_wipe(ms: Dictionary, state: Dictionary, surviving_team_id: int) -> void:
	if ms["matchOver"]:
		return
	ms["matchOver"] = true
	ms["winner"] = surviving_team_id
	var score: Dictionary = GameLeague.calculate_match_score(ms["deathOrder"], 0, 1)
	ms["playerScore"] = score.get("playerScore", 0)
	ms["opponentScore"] = score.get("opponentScore", 0)
