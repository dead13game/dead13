class_name GameAiHell
## AI 地狱难度（从 src/game/ai/hell.js 移植）— 偷看牌库 + 增强评分

const GameConstants = preload("res://scripts/game/constants.gd")
const GameAiCore = preload("res://scripts/game/ai/ai_core.gd")
const GameAiSkilled = preload("res://scripts/game/ai/ai_skilled.gd")
const GameSkills = preload("res://scripts/game/skills.gd")

# ===== 偷看工具函数 =====

static func peek_deck_top(state: Dictionary, n: int) -> Array:
	var depth: int = mini(n, int(state.get("aiPeekDepth", 3)))
	var deck: Array = state.get("deck", [])
	depth = mini(depth, deck.size())
	var result: Array = []
	for i in range(deck.size() - depth, deck.size()):
		if i >= 0:
			result.append(deck[i].duplicate(true))
	return result

static func estimate_exact_damage(attack_value: int, target: Dictionary) -> int:
	var remaining: int = attack_value
	var def_copy: Array = []
	for c in target.get("defensePile", []):
		def_copy.append(c.duplicate(true))
	while remaining > 0 and not def_copy.is_empty():
		var top: Dictionary = def_copy[def_copy.size() - 1]
		if int(top.get("value", 0)) >= remaining:
			remaining = 0
		else:
			remaining -= int(top.get("value", 0))
			def_copy.pop_back()
	return remaining

static func will_trap_trigger(atk_val: int, trap_val: int) -> String:
	if atk_val < trap_val:
		return "rebound"
	if atk_val == trap_val:
		return "tie"
	return "break"

# ===== 地狱决策 =====

static func decide_hell_top(state: Dictionary, player: Dictionary) -> Dictionary:
	var candidates: Array = []

	if GameAiCore.can_attack_ai(state):
		var targets: Array = _alive_opponents(state, player)
		var best_atk: float = -INF
		for t in targets:
			best_atk = maxf(best_atk, score_attack_hell(state, player, t))
		candidates.append({"action": "attack", "score": best_atk})

	candidates.append({"action": "defense", "score": score_defense_hell(state, player)})
	candidates.append({"action": "gamble", "score": score_gamble_hell(state, player)})

	if GameSkills.can_use_skill(state, player):
		candidates.append({"action": "skill", "score": GameAiSkilled.score_skill_skilled(state, player)})

	candidates.sort_custom(func(a, b): return float(a["score"]) > float(b["score"]))
	var best: Dictionary = candidates[0]
	return {"action": best.get("action", "defense"), "reason": "score=%d" % int(best.get("score", 0))}

# --- 地狱评分函数 ---

static func score_attack_hell(state: Dictionary, player: Dictionary, target: Dictionary) -> float:
	var score: float = 0.0
	var hp_ratio: float = float(target.get("hp", 0)) / maxf(1.0, float(target.get("maxHp", 1)))
	score += (1.0 - hp_ratio) * 20.0
	score -= target.get("defensePile", []).size() * 4.0
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

	# 地狱增强：知道下一张牌的真实值
	var next_cards: Array = peek_deck_top(state, 1)
	var next_val: int = int(next_cards[0].get("value", 0)) if not next_cards.is_empty() else 7
	var bonus: int = GameAiCore.extra_attack_bonus(state, player)
	if next_val + bonus >= int(target.get("hp", 0)) + target.get("defensePile", []).size() * 4:
		score += 15.0

	# 精确陷阱判断
	if target.get("trap") != null:
		var trap_val: int = int(target["trap"].get("value", 0))
		var atk_val: int = next_val + bonus
		var result: String = will_trap_trigger(atk_val, trap_val)

		if result == "break":
			score += 15.0
		elif result == "rebound":
			var self_dmg: int = estimate_exact_damage(atk_val, player)
			if atk_val > int(player.get("hp", 0)) + self_dmg:
				score -= 80.0
			else:
				score -= 15.0
		else:
			if atk_val > int(player.get("hp", 0)) + estimate_exact_damage(atk_val, player):
				score -= 50.0
			elif int(target.get("hp", 0)) <= atk_val + target.get("defensePile", []).size() * 2:
				score += 5.0
			else:
				score -= 10.0

	# 精确伤害穿透计算
	var exact_dmg: int = estimate_exact_damage(next_val + bonus, target)

	if exact_dmg >= int(target.get("hp", 0)):
		score += 30.0
		if target.get("trap") == null:
			score += 15.0
	if target.get("trap") != null \
			and will_trap_trigger(next_val + bonus, int(target["trap"].get("value", 0))) == "break" \
			and exact_dmg >= int(target.get("hp", 0)):
		score += 25.0
	if exact_dmg <= 0:
		score -= 10.0

	if target.get("trap") == null:
		score += 12.0

	return score

static func score_defense_hell(state: Dictionary, player: Dictionary) -> float:
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

	# 地狱增强：偷看下一张防御牌的真实值
	var next_cards: Array = peek_deck_top(state, 1)
	if not next_cards.is_empty() and int(next_cards[0].get("value", 0)) > GameAiCore.avg_deck_value(state):
		score += 8.0
	return score

static func score_gamble_hell(state: Dictionary, player: Dictionary) -> float:
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

	# 地狱增强：偷看赌命抽牌数的牌库顶部
	var draw_count: int = GameAiCore.get_gamble_draw_count(state, player)
	var peeked: Array = peek_deck_top(state, draw_count)
	if not peeked.is_empty():
		var avg: float = GameAiCore.avg_deck_value(state)
		var strong_count: int = 0
		var weak_count: int = 0
		var max_peeked: int = 0
		for c in peeked:
			var v: int = int(c.get("value", 0))
			if v > avg:
				strong_count += 1
			elif v < avg:
				weak_count += 1
			max_peeked = maxi(max_peeked, v)
		if strong_count > weak_count:
			score += 10.0
		elif weak_count > strong_count:
			score -= 10.0
		if has_trap and int(player["trap"].get("value", 0)) < max_peeked:
			score += 10.0
	return score

static func score_target_hell(state: Dictionary, player: Dictionary, target: Dictionary, context: String) -> float:
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
			var next_cards: Array = peek_deck_top(state, 1)
			var atk_val: int = (int(next_cards[0].get("value", 0)) if not next_cards.is_empty() else 7) \
				+ GameAiCore.extra_attack_bonus(state, player)
			var exact_dmg: int = estimate_exact_damage(atk_val, target)
			if exact_dmg >= int(target.get("hp", 0)):
				score += 25.0
			if exact_dmg <= 0 and target.get("defensePile", []).size() > 0:
				score -= 15.0
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

# --- 地狱目标选择 ---

static func decide_hell_target(state: Dictionary, player: Dictionary, context: String) -> Dictionary:
	var targets: Array = _alive_opponents(state, player)
	if targets.is_empty():
		return {"targetIndex": -1, "reason": "no target"}
	var best_idx: int = 0
	var best_score: float = -INF
	for t in targets:
		var s: float = score_target_hell(state, player, t, context)
		if s > best_score:
			best_score = s
			best_idx = int(t.get("index", 0))
	return {"targetIndex": best_idx, "reason": "score=%d" % int(best_score)}

# --- 地狱赌命选牌 ---

static func decide_hell_gamble(state: Dictionary, player: Dictionary, cards: Array) -> Dictionary:
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

# --- 地狱纳西妲排序 ---

static func decide_hell_nahida(state: Dictionary, player: Dictionary, scry_cards: Array) -> Array:
	var indexed: Array = []
	for i in range(scry_cards.size()):
		var c: Dictionary = scry_cards[i].duplicate(true)
		c["origIdx"] = i
		indexed.append(c)
	if state.get("phase", "") == GameConstants.PHASE["PEACE"] or state.get("currentWeather", "") == "arms":
		indexed.sort_custom(func(a, b): return int(a["value"]) > int(b["value"]))
	else:
		indexed.sort_custom(func(a, b): return int(a["value"]) < int(b["value"]))
		if int(state.get("aiPeekDepth", 3)) > 5:
			var beyond: Array = peek_deck_top(state, int(state.get("aiPeekDepth", 3)) - 5)
			if not beyond.is_empty():
				var sum_b: int = 0
				for c in beyond:
					sum_b += int(c.get("value", 0))
				var beyond_avg: float = float(sum_b) / float(beyond.size())
				if beyond_avg <= GameAiCore.avg_deck_value(state):
					indexed.sort_custom(func(a, b): return int(a["value"]) > int(b["value"]))
	var result: Array = []
	for c in indexed:
		result.append(c["origIdx"])
	return result

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
