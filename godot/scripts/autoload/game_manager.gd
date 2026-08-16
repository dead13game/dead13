extends Node
## 全局游戏会话管理：跨场景持有游戏状态
## 经典模式 + 世界杯/联赛（1v1 比赛模式）

const GameState = preload("res://scripts/game/game_state.gd")
const GameMatchState = preload("res://scripts/game/match_state.gd")
const GameWorldCup = preload("res://scripts/game/world_cup.gd")
const GameWorldCupConstants = preload("res://scripts/game/world_cup_constants.gd")

signal match_ui_changed(mode: String)  # "substitution" | "penalty" | "over" | "play"

var state: Dictionary = {}
var mode: String = "classic"  # classic | worldcup | league
var wc_state: Dictionary = {}      # 世界杯锦标赛状态
var league_state: Dictionary = {}  # 联赛状态
var match_state: Dictionary = {}   # 当前比赛状态（比赛模式）
var match_return_scene: String = ""  # 比赛结束后返回的场景
var match_context: String = ""       # "worldcup" | "league"
var _last_scorer_is_player: bool = false  # 最近一次进球是否玩家
var league_death_order: Array = []  # 联赛 3v3 死亡顺序 [{playerIndex, teamId, charId}]

# ===== 经典模式 =====

func new_classic_game(char_ids: Array, use_weather: bool, player_count: int) -> void:
	state = GameState.create_game_state()
	GameState.init_game(state, char_ids, use_weather, 1)
	mode = "classic"

# ===== 1v1 比赛模式（世界杯/联赛通用） =====

## 初始化一场 1v1 比赛
func start_match(player_char_id: int, opponent_char_id: int, is_group: bool, player_name: String, opponent_name: String, subs_left: int, opponent_difficulty: String = "skilled") -> void:
	state = GameState.create_game_state()
	GameState.init_game(state, [player_char_id, opponent_char_id], false, 1)
	# 名称
	for p in state["players"]:
		if int(p.get("characterId", 0)) == player_char_id:
			p["name"] = player_name
		else:
			p["name"] = opponent_name
	# 对手 AI
	for p in state["players"]:
		if int(p.get("characterId", 0)) == opponent_char_id:
			p["isAI"] = true
			p["aiDifficulty"] = opponent_difficulty
	# 比赛状态
	match_state = GameMatchState.create_match_state(is_group, player_char_id, opponent_char_id)
	match_state["substitutionsLeft"] = subs_left
	_last_scorer_is_player = false
	# 比赛上下文回调（由 damage/check_game_over 与回合推进触发）
	state["matchContext"] = {
		"onPlayerEliminated": Callable(self, "_match_on_eliminated"),
		"onNewRound": Callable(self, "_match_on_new_round"),
	}

func _match_on_eliminated(dead_idx: int, killer_idx: int, actual_round: Variant = null) -> void:
	var killer_char_id: int = -1
	for p in state.get("players", []):
		if int(p.get("index", -1)) == killer_idx:
			killer_char_id = int(p.get("characterId", 0))
			break
	_last_scorer_is_player = killer_char_id == int(match_state.get("playerCharId", 0))
	GameMatchState.on_player_eliminated(match_state, state, dead_idx, killer_idx, actual_round)
	_route_after_elimination()

func _match_on_new_round(round: int) -> void:
	if match_state.get("matchOver", false):
		return
	match_state["matchRound"] = round
	if round > int(match_state.get("maxRounds", 90)):
		GameMatchState.check_match_end(match_state, state)
		_route_after_elimination()

func _route_after_elimination() -> void:
	if match_state.get("isPenaltyShootout", false):
		match_ui_changed.emit("penalty")
	elif match_state.get("matchOver", false):
		match_ui_changed.emit("over")
	elif match_state.get("substitutionPending", false):
		match_ui_changed.emit("substitution")

# ===== 世界杯 =====

func new_world_cup(player_team_name: String) -> void:
	wc_state = GameWorldCup.create_world_cup_state(player_team_name)
	GameWorldCup.init_group_matches(wc_state)
	mode = "worldcup"

# ===== 联赛 =====

func new_league(player_team_id: int) -> void:
	var GameLeague = preload("res://scripts/game/league.gd")
	league_state = GameLeague.create_league_state(player_team_id)
	mode = "league"

## 3v3 比赛：6 人（玩家3+对手3）同场，死亡顺序计分
func start_league_3v3(player_chars: Array, opponent_chars: Array, is_home: bool, opponent_difficulty: String = "skilled") -> void:
	var GameLeague = preload("res://scripts/game/league.gd")
	var GameLeagueConstants = preload("res://scripts/game/league_constants.gd")
	var player_team_id: int = int(league_state.get("playerTeamId", 1))
	var opponent_id: int = GameLeague.get_player_opponent(league_state, int(league_state.get("currentRound", 1)))
	var card_bonus: Dictionary = GameLeague.get_card_bonus(player_team_id, opponent_id, is_home)

	# 初始化 6 人游戏：teamId 0=玩家队伍 3 人，1=对手队伍 3 人
	var all_chars: Array = []
	all_chars.append_array(player_chars)
	all_chars.append_array(opponent_chars)
	var team_ids: Array = [0, 0, 0, 1, 1, 1]

	# 死亡顺序
	league_death_order = []

	# 联赛上下文（须在 init_game 前设置：init_game 会保存并恢复，且据此跳过和平期）
	var league_ctx: Dictionary = {
		"cardBonus": card_bonus,
		"maxRounds": int(GameLeagueConstants.LEAGUE_MATCH_CONFIG.get("maxRounds", 12)),
		"onPlayerDeath": Callable(self, "_league_on_death"),
		"onTeamWipe": Callable(self, "_league_on_team_wipe"),
		"onNewRound": Callable(self, "_league_on_round"),
		"onRoundLimit": Callable(self, "_league_on_round_limit"),
	}

	state = GameState.create_game_state()
	state["leagueContext"] = league_ctx
	GameState.init_game(state, all_chars, false, 1, 2, team_ids)
	state["leagueContext"] = league_ctx

	# 队伍名称
	var player_team: Variant = GameLeagueConstants.LEAGUE_TEAMS[player_team_id] if player_team_id < GameLeagueConstants.LEAGUE_TEAMS.size() else null
	var opponent_team: Variant = GameLeagueConstants.LEAGUE_TEAMS[opponent_id] if opponent_id > 0 and opponent_id < GameLeagueConstants.LEAGUE_TEAMS.size() else null
	for p in state["players"]:
		if int(p.get("teamId", -1)) == 0:
			p["name"] = "%s %s·%s" % [
				player_team.get("emoji", "") if player_team != null else "",
				player_team.get("name", "?") if player_team != null else "?",
				GameConstants.get_char_data(p).get("name", "?")]
		else:
			p["name"] = "%s %s·%s" % [
				opponent_team.get("emoji", "") if opponent_team != null else "",
				opponent_team.get("name", "?") if opponent_team != null else "?",
				GameConstants.get_char_data(p).get("name", "?")]

	# 标记 AI 玩家（对手队伍）
	for p in state["players"]:
		if int(p.get("teamId", -1)) == 1:
			p["isAI"] = true
			p["aiDifficulty"] = opponent_difficulty

	# 比赛状态
	match_state = {
		"round": int(league_state.get("currentRound", 1)),
		"playerTeamId": 0,
		"opponentTeamId": 1,
		"isHome": is_home,
		"cardBonus": card_bonus,
		"deathOrder": [],
		"matchOver": false,
		"winner": null,
		"playerScore": 0,
		"opponentScore": 0,
		"maxRounds": int(GameLeagueConstants.LEAGUE_MATCH_CONFIG.get("maxRounds", 12)),
		"is3v3": true,
	}
	_last_scorer_is_player = false
	mode = "league"

func _league_on_death(dead_idx: int) -> void:
	var ms: Dictionary = match_state
	if ms.is_empty() or ms.get("matchOver", false):
		return
	if dead_idx < 0 or dead_idx >= state.get("players", []).size():
		return
	var dead: Dictionary = state["players"][dead_idx]
	ms["deathOrder"].append({
		"playerIndex": dead_idx,
		"teamId": int(dead.get("teamId", -1)),
		"charId": int(dead.get("characterId", 0)),
	})

func _league_on_team_wipe(surviving_team_id: int) -> void:
	var ms: Dictionary = match_state
	if ms.is_empty() or ms.get("matchOver", false):
		return
	ms["matchOver"] = true
	ms["winner"] = surviving_team_id
	_finalize_league_score()

func _league_on_round_limit() -> void:
	var ms: Dictionary = match_state
	if ms.is_empty() or ms.get("matchOver", false):
		return
	ms["matchOver"] = true
	ms["winner"] = null
	_finalize_league_score()

func _finalize_league_score() -> void:
	var ms: Dictionary = match_state
	var GameLeague = preload("res://scripts/game/league.gd")
	var score: Dictionary = GameLeague.calculate_match_score(ms.get("deathOrder", []), 0, 1)
	ms["playerScore"] = score.get("playerScore", 0)
	ms["opponentScore"] = score.get("opponentScore", 0)
	match_ui_changed.emit("over")

# ===== 单机 =====

var solo_state: Dictionary = {}

func new_solo() -> void:
	var GameSolo = preload("res://scripts/game/solo.gd")
	solo_state = GameSolo.create_solo_state()
	mode = "solo"

# ===== 模拟宇宙 =====

var uni_state: Dictionary = {}

func new_simuniverse(char_ids: Array = []) -> void:
	var GameUniState = preload("res://scripts/game/uni_state.gd")
	uni_state = GameUniState.create_uni_state(char_ids)
	mode = "simuniverse"
