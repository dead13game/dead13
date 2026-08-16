class_name GameWeather
## 天气模块（从 src/game/weather.js 移植）

const GameDeck = preload("res://scripts/game/deck.gd")

const WDATA: Dictionary = {
	"calm": {"name": "风和日丽", "desc": "无效果"},
	"wind": {"name": "狂风呼啸", "desc": "赌命抽牌数+1"},
	"trade": {"name": "黑市交易", "desc": "防御牌点数+2"},
	"sun": {"name": "烈日当空", "desc": "攻击牌点数+2"},
	"rain": {"name": "暴雨倾盆", "desc": "所有玩家防御区出1张"},
	"arms": {"name": "军备竞赛", "desc": "禁止使用角色技能"},
}

static func setup_weather_deck(state: Dictionary) -> void:
	var weather_cards: Array = [
		{"id": "calm"}, {"id": "calm"}, {"id": "calm"}, {"id": "calm"},
		{"id": "wind"}, {"id": "trade"}, {"id": "sun"}, {"id": "rain"}, {"id": "arms"},
	]
	state["weatherDeck"] = GameDeck.shuffle_deck(weather_cards)

static func draw_weather(state: Dictionary):
	if not state.get("useWeather", false):
		return null
	var weather_deck: Array = state.get("weatherDeck", [])
	if weather_deck.is_empty():
		return null
	var w: Dictionary = weather_deck.pop_front()
	weather_deck.append(w)
	state["currentWeather"] = w.get("id")
	state["nextWeather"] = weather_deck[0].get("id") if not weather_deck.is_empty() else null
	return w.get("id")

static func get_current_weather(state: Dictionary) -> Dictionary:
	var w: Variant = WDATA.get(state.get("currentWeather"), null)
	return w if w is Dictionary else {}

static func get_next_weather(state: Dictionary) -> Dictionary:
	var w: Variant = WDATA.get(state.get("nextWeather"), null)
	return w if w is Dictionary else {}
