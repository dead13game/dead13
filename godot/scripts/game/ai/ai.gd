class_name GameAi
## AI 公共 API + 调度（从 src/game/ai/index.js 移植）

const GameAiCore = preload("res://scripts/game/ai/ai_core.gd")
const GameAiEasy = preload("res://scripts/game/ai/ai_easy.gd")
const GameAiSkilled = preload("res://scripts/game/ai/ai_skilled.gd")
const GameAiHell = preload("res://scripts/game/ai/ai_hell.gd")

## 顶层决策：选择行动（攻击/防御/赌命/技能）
static func decide_top_action(state: Dictionary) -> Dictionary:
	var player: Dictionary = GameAiCore.current_ai_player(state)
	var diff: String = GameAiCore.get_difficulty(player)
	match diff:
		"skilled":
			return GameAiSkilled.decide_skilled_top(state, player)
		"hell":
			return GameAiHell.decide_hell_top(state, player)
		_:
			return GameAiEasy.decide_easy_top(state, player)

## 选择目标
static func decide_target(state: Dictionary, context: Variant) -> Dictionary:
	var player: Dictionary = GameAiCore.current_ai_player(state)
	var diff: String = GameAiCore.get_difficulty(player)
	var ctx: String = GameAiCore.map_context(context)
	match diff:
		"skilled":
			return GameAiSkilled.decide_skilled_target(state, player, ctx)
		"hell":
			return GameAiHell.decide_hell_target(state, player, ctx)
		_:
			return GameAiEasy.decide_easy_target(state, player)

## 赌命选牌（陷阱 + 诱饵）
static func decide_gamble_pick(state: Dictionary, drawn_cards: Array) -> Dictionary:
	var player: Dictionary = GameAiCore.current_ai_player(state)
	var diff: String = GameAiCore.get_difficulty(player)
	match diff:
		"skilled":
			return GameAiSkilled.decide_skilled_gamble(state, player, drawn_cards)
		"hell":
			return GameAiHell.decide_hell_gamble(state, player, drawn_cards)
		_:
			return GameAiEasy.decide_easy_gamble(state, player, drawn_cards)

## 纳西妲占卜牌排序
static func decide_nahida_order(state: Dictionary, scry_cards: Array) -> Array:
	var player: Dictionary = GameAiCore.current_ai_player(state)
	var diff: String = GameAiCore.get_difficulty(player)
	match diff:
		"skilled":
			return GameAiSkilled.decide_skilled_nahida(state, player, scry_cards)
		"hell":
			return GameAiHell.decide_hell_nahida(state, player, scry_cards)
		_:
			return GameAiEasy.decide_easy_nahida(state, player, scry_cards)

## 莉奈娅子技能 + 目标选择
static func decide_liniya_choice(state: Dictionary) -> Dictionary:
	var player: Dictionary = GameAiCore.current_ai_player(state)
	var diff: String = GameAiCore.get_difficulty(player)
	if diff == "skilled" or diff == "hell":
		return GameAiSkilled.decide_skilled_liniya(state, player)
	return GameAiEasy.decide_easy_liniya(state, player)

## 菜月昴存档/读档选择
static func decide_caiyueang_choice(state: Dictionary) -> Dictionary:
	var player: Dictionary = GameAiCore.current_ai_player(state)
	var diff: String = GameAiCore.get_difficulty(player)
	if diff == "skilled" or diff == "hell":
		return GameAiSkilled.decide_skilled_caiyueang(state, player)
	return GameAiEasy.decide_easy_caiyueang(state, player)
