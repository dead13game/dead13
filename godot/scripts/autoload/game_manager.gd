extends Node
## 全局游戏会话管理：跨场景持有游戏状态
## 选人场景 → 写入 state → 切换到牌桌场景

const GameState = preload("res://scripts/game/game_state.gd")

var state: Dictionary = {}
var mode: String = "classic"

func new_classic_game(char_ids: Array, use_weather: bool, player_count: int) -> void:
	state = GameState.create_game_state()
	GameState.init_game(state, char_ids, use_weather, 1)
	mode = "classic"
