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
