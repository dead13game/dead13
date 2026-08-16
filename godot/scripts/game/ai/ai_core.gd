class_name GameAiCore
## AI 共享工具函数（从 src/game/ai/index.js 移植）
## 纯逻辑层，无难度实现，避免循环依赖

const GameConstants = preload("res://scripts/game/constants.gd")

static func get_difficulty(player: Dictionary) -> String:
	var d: Variant = player.get("aiDifficulty")
	if d == null or d == "":
		return "easy"
	return String(d)

static func current_ai_player(state: Dictionary) -> Dictionary:
	var players: Array = state.get("players", [])
	var idx: int = int(state.get("currentPlayerIndex", 0))
	return players[idx] if idx < players.size() else {}

static func avg_deck_value(state: Dictionary) -> float:
	var deck: Array = state.get("deck", [])
	if not deck.is_empty():
		var sum: int = 0
		for c in deck:
			sum += int(c.get("value", 0))
		return float(sum) / float(deck.size())
	return 7.0

static func extra_attack_bonus(state: Dictionary, player: Dictionary) -> int:
	var b: int = 0
	if state.get("currentWeather", "") == "sun":
		b += 2
	if player.get("characterId", 0) == 7 and player.get("moonPhase", 0) == 0:
		b += 4  # 哥伦比娅弦月
	if player.get("characterId", 0) == 6:
		b += int(player.get("fightingSpirit", 0))  # 玛薇卡
	if player.get("relations", {}).get("allyIndex") != null \
			and player.get("relations", {}).get("allianceTurns", 0) > 0 \
			and player.get("relations", {}).get("betrayalPenalty", 0) <= 0:
		b += 2
	return b

static func get_gamble_draw_count(state: Dictionary, player: Dictionary) -> int:
	var count: int = 2
	if state.get("currentWeather", "") == "wind":
		count += 1
	if player.get("characterId", 0) == 7 and player.get("moonPhase", 0) == 2:
		count += 1  # 哥伦比娅新月
	return count

static func get_next_alive_index(state: Dictionary, current_idx: int) -> int:
	# 按 index 升序排列后，找当前玩家的下一个存活玩家（循环）
	var players: Array = state.get("players", [])
	var sorted: Array = []
	for p in players:
		sorted.append(p)
	sorted.sort_custom(func(a, b): return int(a.get("index", 0)) < int(b.get("index", 0)))
	var start_idx: int = -1
	for i in range(sorted.size()):
		if int(sorted[i].get("index", -1)) == current_idx:
			start_idx = i
			break
	for i in range(1, sorted.size() + 1):
		var next_p: Dictionary = sorted[(start_idx + i) % sorted.size()]
		if next_p.get("alive", false):
			return int(next_p.get("index", current_idx))
	return current_idx

static func can_attack_ai(state: Dictionary) -> bool:
	if state.get("matchContext") != null:
		return state.get("phase", "") != GameConstants.PHASE["PEACE"]
	return int(state.get("round", 0)) >= 4

static func is_ai_player(player: Dictionary) -> bool:
	return player.get("isAI", false)

## 上下文映射（decide_target 用）
static func map_context(context: Variant) -> String:
	if context == null or context.is_empty():
		return "attack"
	var action: String = context.get("action", "attack")
	var character_id: int = int(context.get("characterId", 0))
	if action == "attack":
		return "attack"
	if action == "ally":
		return "ally"
	if action == "skill":
		match character_id:
			3:
				return "skillRaiden"  # 雷神
			5:
				return "skillFurina"  # 芙宁娜
			8:
				return "skillFenjin"  # 风堇
			10:
				return "skillAimiliya"  # 爱蜜莉雅
			9:
				return "skillLiniya"  # 莉奈娅
			_:
				return "attack"
	return "attack"
