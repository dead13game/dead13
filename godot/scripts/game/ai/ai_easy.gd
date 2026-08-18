class_name GameAiEasy
## AI 简单难度（从 src/game/ai/easy.js 移植）

const GameConstants = preload("res://scripts/game/constants.gd")
const GameAiCore = preload("res://scripts/game/ai/ai_core.gd")
const GameSkills = preload("res://scripts/game/skills.gd")

static func decide_easy_top(state: Dictionary, player: Dictionary) -> Dictionary:
	var r: float = randf()
	var can_atk: bool = GameAiCore.can_attack_ai(state)
	var can_skill: bool = GameConstants.get_char_data(player).get("skillType", "") == "active" \
		and int(player.get("skillUses", 0)) > 0 and state.get("currentWeather", "") != "arms"
	# 对齐 execute_skill 的实际可用条件：PEACE 期与温迪(1)/雷神(3) 大招 round<10 不可用，
	# 否则 AI 反复选大招失败会卡死 AI 循环
	var cid_easy: int = int(player.get("characterId", 0))
	if can_skill and (state.get("phase", "") == GameConstants.PHASE["PEACE"] \
			or ((cid_easy == 1 or cid_easy == 3) and int(state.get("round", 0)) < 10)):
		can_skill = false

	if r < 0.55 and can_atk:
		return {"action": "attack", "reason": "random(55%)"}
	if r < 0.82:
		return {"action": "defense", "reason": "random(27%)"}
	if r < 0.94:
		return {"action": "gamble", "reason": "random(12%)"}
	if can_skill:
		return {"action": "skill", "reason": "random(6%)"}
	return {"action": "defense", "reason": "fallback"}

static func decide_easy_target(state: Dictionary, player: Dictionary) -> Dictionary:
	var alive: Array = _alive_opponents(state, player)
	if alive.is_empty():
		return {"targetIndex": -1, "reason": "no target"}
	var idx: int = alive[0].get("index", 0)
	return {"targetIndex": idx, "reason": "first opponent"}

static func decide_easy_gamble(state: Dictionary, player: Dictionary, cards: Array) -> Dictionary:
	return {"trapIdx": 0, "baitIdx": 1, "reason": "first two"}

static func decide_easy_nahida(state: Dictionary, player: Dictionary, scry_cards: Array) -> Array:
	return [0, 1, 2, 3, 4]

static func decide_easy_liniya(state: Dictionary, player: Dictionary) -> Dictionary:
	var targets: Array = []
	for p in state.get("players", []):
		if p.get("alive", false) and p.get("index") != player.get("index"):
			targets.append(p)
	var idx: int = targets[0].get("index", 0) if not targets.is_empty() else 0
	return {"subSkill": 2, "targetIndex": idx, "reason": "dot"}

static func decide_easy_caiyueang(state: Dictionary, player: Dictionary) -> Dictionary:
	return {"choice": "save", "reason": "always save"}

static func _alive_opponents(state: Dictionary, player: Dictionary) -> Array:
	var result: Array = []
	for p in state.get("players", []):
		if not p.get("alive", false):
			continue
		if p.get("index") == player.get("index"):
			continue
		if int(player.get("teamId", -1)) >= 0 and int(p.get("teamId", -1)) == int(player.get("teamId", -1)):
			continue
		result.append(p)
	return result
