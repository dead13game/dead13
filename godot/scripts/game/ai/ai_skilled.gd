class_name GameAiSkilled
## AI 熟练难度（从 src/game/ai/skilled.js 移植）

const GameConstants = preload("res://scripts/game/constants.gd")
const GameAiCore = preload("res://scripts/game/ai/ai_core.gd")
const GameSkills = preload("res://scripts/game/skills.gd")

static func decide_skilled_top(state: Dictionary, player: Dictionary) -> Dictionary:
	var candidates: Array = []

	if GameAiCore.can_attack_ai(state):
		var targets: Array = _alive_opponents(state, player)
		var best_atk: float = -INF
		for t in targets:
			best_atk = maxf(best_atk, score_attack_skilled(state, player, t))
		candidates.append({"action": "attack", "score": best_atk})

	candidates.append({"action": "defense", "score": score_defense_skilled(state, player)})
	candidates.append({"action": "gamble", "score": score_gamble_skilled(state, player)})

	if GameSkills.can_use_skill(state, player):
		candidates.append({"action": "skill", "score": score_skill_skilled(state, player)})

	candidates.sort_custom(func(a, b): return float(a["score"]) > float(b["score"]))
	var best: Dictionary = candidates[0]
	return {"action": best.get("action", "defense"), "reason": "score=%d" % int(best.get("score", 0))}

# --- 熟练评分函数 ---

static func score_attack_skilled(state: Dictionary, player: Dictionary, target: Dictionary) -> float:
	var score: float = 0.0
	var hp_ratio: float = float(target.get("hp", 0)) / maxf(1.0, float(target.get("maxHp", 1)))
	score += (1.0 - hp_ratio) * 20.0
	score -= target.get("defensePile", []).size() * 4.0
	if target.get("trap") != null:
		score -= 8.0
	if state.get("currentWeather", "") == "sun":
		score += 5.0
	if player.get("characterId", 0) == 7 and player.get("moonPhase", 0) == 0:
		score += 5.0
	if player.get("characterId", 0) == 6:
		score += int(player.get("fightingSpirit", 0)) * 2.0
	if player.get("relations", {}).get("allyIndex") != null \
			and player.get("relations", {}).get("allianceTurns", 0) > 0 \
			and player.get("relations", {}).get("betrayalPenalty", 0) <= 0:
		score += 4.0
	if target.get("relations", {}).get("betrayalPenalty", 0) > 0:
		score += 4.0
	if target.get("statusEffects", {}).get("frozenBy") != null:
		score += 5.0
	if player.get("relations", {}).get("allyIndex") == target.get("index"):
		score -= 100.0

	var avg_card: float = GameAiCore.avg_deck_value(state)
	var bonus: int = GameAiCore.extra_attack_bonus(state, player)
	if avg_card + float(bonus) >= float(target.get("hp", 0)) + float(target.get("defensePile", []).size()) * 4.0:
		score += 15.0
	return score

static func score_defense_skilled(state: Dictionary, player: Dictionary) -> float:
	var score: float = 45.0
	var hp_ratio: float = float(player.get("hp", 0)) / maxf(1.0, float(player.get("maxHp", 1)))
	score += (1.0 - hp_ratio) * 35.0
	var def_count: int = player.get("defensePile", []).size()
	if def_count == 0:
		score += 15.0
	elif def_count <= 1:
		score += 8.0
	if state.get("currentWeather", "") == "trade":
		score += 12.0
	if player.get("characterId", 0) == 7 and player.get("moonPhase", 0) == 1:
		score += 8.0
	if player.get("relations", {}).get("allyIndex") != null \
			and player.get("relations", {}).get("allianceTurns", 0) > 0 \
			and player.get("relations", {}).get("betrayalPenalty", 0) <= 0:
		score += 6.0
	if def_count >= 3:
		score -= 10.0
	if player.get("trap") != null and player.get("bait") != null:
		score -= 5.0
	return score

static func score_gamble_skilled(state: Dictionary, player: Dictionary) -> float:
	var score: float = 20.0
	var has_trap: bool = player.get("trap") != null
	var has_bait: bool = player.get("bait") != null
	if not has_trap and not has_bait:
		score += 25.0
	elif not has_trap or not has_bait:
		score += 10.0
	if has_trap and int(player["trap"].get("value", 0)) < 5:
		score += 8.0
	if has_bait and int(player["bait"].get("value", 0)) < 3:
		score += 4.0
	if state.get("currentWeather", "") == "wind":
		score += 10.0
	if player.get("characterId", 0) == 7 and player.get("moonPhase", 0) == 2:
		score += 8.0
	if player.get("defensePile", []).size() >= 3:
		score -= 10.0
	return score

static func score_skill_skilled(state: Dictionary, player: Dictionary) -> float:
	if not GameSkills.can_use_skill(state, player):
		return -INF

	var score: float = 40.0
	match int(player.get("characterId", 0)):
		2:
			# 钟离
			var lost_hp: int = int(player.get("maxHp", 0)) - int(player.get("hp", 0))
			score += lost_hp * 3.0
		3:
			# 雷神
			if state.get("phase", "") == GameConstants.PHASE["PEACE"]:
				return -INF
			if int(state.get("round", 0)) < 10:
				return -INF
			var lethal: bool = false
			for t in _alive_opponents(state, player):
				if 27 >= int(t.get("hp", 0)) + t.get("defensePile", []).size() * 4:
					lethal = true
					break
			score += 30.0 if lethal else 10.0
		4:
			# 纳西妲
			score += 20.0
		5:
			# 芙宁娜
			if state.get("phase", "") == GameConstants.PHASE["PEACE"]:
				return -INF
			if player.get("statusEffects", {}).get("ignoreTrapThisTurn", false):
				return -INF
			var trap_count: int = 0
			for t in _alive_opponents(state, player):
				if t.get("trap") != null:
					trap_count += 1
			if trap_count == 0:
				return -INF
			score += trap_count * 8.0
			if int(player.get("skillUses", 0)) <= 1:
				score -= 40.0
		8:
			# 风堇
			if state.get("phase", "") == GameConstants.PHASE["PEACE"]:
				return -INF
			var heal: int = maxi(0, int(player.get("maxHp", 0)) + 3 - int(player.get("hp", 0)))
			score += heal * 2.0
		9:
			# 莉奈娅
			if state.get("phase", "") == GameConstants.PHASE["PEACE"]:
				return -INF
			score += 10.0
		10:
			# 爱蜜莉雅
			score += 5.0
		1:
			# 温迪
			if state.get("phase", "") == GameConstants.PHASE["PEACE"]:
				return -INF
			if int(state.get("round", 0)) < 10:
				return -INF
			score += 12.0
		11:
			# 菜月昴
			score += 5.0 if player.get("statusEffects", {}).get("savepoint") != null else 12.0
		_:
			pass
	return score

static func score_target_skilled(state: Dictionary, player: Dictionary, target: Dictionary, context: String) -> float:
	var score: float = 0.0
	score += maxf(0.0, 15.0 - float(target.get("hp", 0))) * 2.0
	score -= target.get("defensePile", []).size() * 3.0
	if target.get("trap") != null and context == "attack":
		score -= 10.0
	if target.get("statusEffects", {}).get("frozenBy") != null:
		score += 5.0

	match context:
		"attack":
			if target.get("relations", {}).get("betrayalPenalty", 0) > 0:
				score += 8.0
		"skillRaiden":
			if 27 >= int(target.get("hp", 0)) + target.get("defensePile", []).size() * 4:
				score += 20.0
		"skillFurina":
			if target.get("trap") != null:
				score += 15.0
		"skillFenjin":
			score += float(target.get("hp", 0)) * 0.5 + float(target.get("defensePile", []).size()) * 2.0
		"skillAimiliya":
			var next_idx: int = GameAiCore.get_next_alive_index(state, int(state.get("currentPlayerIndex", 0)))
			if int(target.get("index", -1)) == next_idx:
				score += 15.0
		"ally":
			if target.get("relations", {}).get("betrayalPenalty", 0) > 0:
				score -= 50.0
			if target.get("relations", {}).get("allyIndex") != null:
				score -= 50.0
			score += float(target.get("hp", 0)) * 0.3
		"skillLiniya":
			score += target.get("defensePile", []).size() * 3.0
		_:
			pass

	if int(target.get("index", -1)) == int(player.get("index", -1)):
		return -INF
	return score

# --- 熟练目标选择 ---

static func decide_skilled_target(state: Dictionary, player: Dictionary, context: String) -> Dictionary:
	var targets: Array = _alive_opponents(state, player)
	if targets.is_empty():
		return {"targetIndex": -1, "reason": "no target"}
	var best_idx: int = 0
	var best_score: float = -INF
	for t in targets:
		var s: float = score_target_skilled(state, player, t, context)
		if s > best_score:
			best_score = s
			best_idx = int(t.get("index", 0))
	return {"targetIndex": best_idx, "reason": "score=%d" % int(best_score)}

# --- 熟练赌命选牌 ---

static func decide_skilled_gamble(state: Dictionary, player: Dictionary, cards: Array) -> Dictionary:
	var indexed: Array = []
	for i in range(cards.size()):
		var c: Dictionary = cards[i].duplicate(true)
		c["origIdx"] = i
		indexed.append(c)
	indexed.sort_custom(func(a, b): return int(a["value"]) > int(b["value"]))

	var trap_idx: int = indexed[0]["origIdx"]
	var bait_idx: int = indexed[1]["origIdx"]

	if int(indexed[0]["value"]) - int(indexed[1]["value"]) <= 2 and int(indexed[1]["value"]) >= 10:
		trap_idx = indexed[1]["origIdx"]
		bait_idx = indexed[0]["origIdx"]

	return {
		"trapIdx": trap_idx,
		"baitIdx": bait_idx,
		"reason": "trap=%d bait=%d" % [int(cards[trap_idx].get("value", 0)), int(cards[bait_idx].get("value", 0))],
	}

# --- 熟练纳西妲排序 ---

static func decide_skilled_nahida(state: Dictionary, player: Dictionary, scry_cards: Array) -> Array:
	var indexed: Array = []
	for i in range(scry_cards.size()):
		var c: Dictionary = scry_cards[i].duplicate(true)
		c["origIdx"] = i
		indexed.append(c)
	if state.get("phase", "") == GameConstants.PHASE["PEACE"] or state.get("currentWeather", "") == "arms":
		indexed.sort_custom(func(a, b): return int(a["value"]) > int(b["value"]))
	else:
		indexed.sort_custom(func(a, b): return int(a["value"]) < int(b["value"]))
	var result: Array = []
	for c in indexed:
		result.append(c["origIdx"])
	return result

# --- 熟练莉奈娅 ---

static func decide_skilled_liniya(state: Dictionary, player: Dictionary) -> Dictionary:
	var targets: Array = []
	for p in state.get("players", []):
		if p.get("alive", false) and p.get("index") != player.get("index"):
			targets.append(p)
	var best_idx: int = 0
	var best_score: float = -INF
	for t in targets:
		var s: float = score_target_skilled(state, player, t, "skillLiniya")
		if s > best_score:
			best_score = s
			best_idx = int(t.get("index", 0))
	var target: Dictionary = {}
	for p in state.get("players", []):
		if int(p.get("index", -1)) == best_idx:
			target = p
			break
	var sub_skill: int = 2
	if not target.is_empty() and target.get("defensePile", []).size() > 0:
		sub_skill = 1
	return {
		"subSkill": sub_skill,
		"targetIndex": best_idx,
		"reason": "steal" if sub_skill == 1 else "dot",
	}

# --- 熟练菜月昴 ---

static func decide_skilled_caiyueang(state: Dictionary, player: Dictionary) -> Dictionary:
	var hp_ratio: float = float(player.get("hp", 0)) / maxf(1.0, float(player.get("maxHp", 1)))
	if player.get("statusEffects", {}).get("savepoint") != null and hp_ratio < 0.3:
		return {"choice": "load", "reason": "low HP (%d%%)" % int(hp_ratio * 100.0)}
	return {"choice": "save", "reason": "save point"}

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
