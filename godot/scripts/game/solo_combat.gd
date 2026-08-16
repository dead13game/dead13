class_name GameSoloCombat
## 单机战斗结算 — 抽3选2 / 行动力 / 牌堆坟场 / 护盾 / 斗志 / AI 随机出牌
## 从 src/solo/logic/soloCombat.js 移植

const GameSoloConstants = preload("res://scripts/game/solo_constants.gd")
const GameSolo = preload("res://scripts/game/solo.gd")
const GameDeck = preload("res://scripts/game/deck.gd")
const GameSoundEvents = preload("res://scripts/game/sound_events.gd")

# ===== 聚合工具 =====

static func expand_deck(agg: Dictionary) -> Array:
	var arr: Array = []
	for id in agg.keys():
		var card: Variant = GameSoloConstants.SOLO_CARDS.get(id)
		if card == null:
			continue
		var count: int = int(agg[id])
		for i in range(count):
			var c: Dictionary = card.duplicate(true)
			arr.append(c)
	return arr

static func add_to_agg(agg: Dictionary, card_id: String, count: int) -> void:
	agg[card_id] = int(agg.get(card_id, 0)) + count

static func remove_from_agg(agg: Dictionary, card_id: String, count: int) -> void:
	if not agg.has(card_id):
		return
	agg[card_id] = int(agg[card_id]) - count
	if int(agg[card_id]) <= 0:
		agg.erase(card_id)

## 从牌堆抽 n 张并聚合进 hand；牌堆空时从 grave 洗回
static func draw_into_pile(state: Dictionary, pile: Array, hand: Dictionary, grave: Dictionary, n: int) -> void:
	var left: int = n
	while left > 0:
		var r: Dictionary = GameDeck.draw_cards(pile, left)
		var drawn: Array = r["drawn"]
		var remaining: Array = r["remaining"]
		for card in drawn:
			add_to_agg(hand, String(card.get("id", "?")), 1)
		left -= drawn.size()
		# 真正从牌堆移除已抽的牌
		pile.clear()
		pile.append_array(remaining)
		if drawn.is_empty():
			# 牌堆空 → 坟场洗回（原地清空保持引用）
			var grave_pile: Array = expand_deck(grave)
			for k in grave.keys():
				grave.erase(k)
			if grave_pile.is_empty():
				break
			pile.clear()
			pile.append_array(GameDeck.shuffle_deck(grave_pile))

## 记录到"最近打出队列"（最多 6 种，同 cardId+side+回合 合并并置最新）
static func push_played_queue(c: Dictionary, card_id: String, count: int, side: String) -> void:
	if not c.has("playedQueue"):
		c["playedQueue"] = []
	var queue: Array = c["playedQueue"]
	var round: int = int(c.get("round", 0))
	var idx: int = -1
	for i in range(queue.size()):
		var e: Dictionary = queue[i]
		if String(e.get("cardId", "")) == card_id and String(e.get("side", "")) == side and int(e.get("round", 0)) == round:
			idx = i
			break
	if idx >= 0:
		var item: Dictionary = queue[idx]
		item["count"] = int(item.get("count", 0)) + count
		queue.remove_at(idx)
		queue.append(item)  # 移到最新
	else:
		queue.append({"cardId": card_id, "count": count, "side": side, "round": round})
	while queue.size() > 6:
		queue.pop_front()

## 手牌种类上限爆牌：超种类的新牌进坟场
static func enforce_hand_limit(state: Dictionary, hand: Dictionary) -> void:
	var kinds: Array = hand.keys()
	var limit: int = int(GameSoloConstants.SOLO_CONST["HAND_KIND_LIMIT"])
	while kinds.size() > limit:
		var overflow_id: String = String(kinds[kinds.size() - 1])
		add_to_agg(state["combat"]["grave"], overflow_id, int(hand[overflow_id]))
		hand.erase(overflow_id)
		kinds.pop_back()

static func refill_poker(state: Dictionary) -> void:
	var c: Dictionary = state["combat"]
	var poker_draw: int = int(GameSoloConstants.SOLO_CONST["POKER_DRAW"])
	if c.get("pokerDeck", []).size() < poker_draw:
		c["pokerDeck"] = GameDeck.shuffle_deck(GameDeck.create_full_deck(1))

# ===== 创建战斗 =====

static func start_combat(state: Dictionary, enemy_key: String) -> void:
	var enemy: Dictionary = GameSoloConstants.SOLO_ENEMIES.get(enemy_key, {})
	var player_pile: Array = GameDeck.shuffle_deck(expand_deck(state["player"]["deck"]))
	var enemy_pile: Array = GameDeck.shuffle_deck(expand_deck(enemy.get("deck", {})))
	state["combat"] = {
		"enemyKey": enemy_key,
		"enemyName": enemy.get("name", "?"),
		"enemyHp": enemy.get("hp", 20),
		"enemyMaxHp": enemy.get("hp", 20),
		"enemyShield": 0,
		"enemyBuff": enemy.get("buff"),
		"enemySpirit": 0,
		"enemyNextActionDrain": 0,
		"enemyNextShieldPen": 0,
		"playerPile": player_pile,
		"playerHand": {},
		"playerGrave": {},
		"enemyPile": enemy_pile,
		"enemyHand": {},
		"enemyGrave": {},
		"pokerDeck": GameDeck.shuffle_deck(GameDeck.create_full_deck(1)),
		"pendingPoker": null,
		"actionPoints": 0,
		"drawCount": 0,
		"playsThisTurn": 0,
		"playedQueue": [],
		"playerShield": 0,
		"fightingSpirit": 0,
		"round": 0,
		"phase": "pick-poker",
		"log": [],
	}
	start_player_turn(state)

# ===== 玩家回合 =====

static func start_player_turn(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or String(c.get("phase", "")) == "won" or String(c.get("phase", "")) == "lost":
		return
	refill_poker(state)
	var poker_draw: int = int(GameSoloConstants.SOLO_CONST["POKER_DRAW"])
	var r: Dictionary = GameDeck.draw_cards(c.get("pokerDeck", []), poker_draw)
	c["pokerDeck"] = r["remaining"]
	c["pendingPoker"] = r["drawn"]
	c["playsThisTurn"] = 0
	c["enemyNextActionDrain"] = 0
	c["enemyNextShieldPen"] = 0
	c["phase"] = "pick-poker"

static func pick_poker(state: Dictionary, action_idx_a: int, action_idx_b: int, draw_idx: int) -> Dictionary:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or String(c.get("phase", "")) != "pick-poker":
		return {"ok": false, "reason": "时机不对"}
	var poker: Variant = c.get("pendingPoker")
	if poker == null or (poker as Array).size() != 3:
		return {"ok": false, "reason": "扑克未就绪"}
	var idxs: Array = [action_idx_a, action_idx_b, draw_idx]
	if action_idx_a == action_idx_b or action_idx_a == draw_idx or action_idx_b == draw_idx:
		return {"ok": false, "reason": "选择非法"}
	for i in idxs:
		if int(i) < 0 or int(i) > 2:
			return {"ok": false, "reason": "选择非法"}
	var poker_arr: Array = poker
	var ap: int = int(poker_arr[action_idx_a].get("value", 0)) + int(poker_arr[action_idx_b].get("value", 0))
	# 玛薇卡斗志：每 5 层行动力 +1
	ap += int(c.get("fightingSpirit", 0)) / int(GameSoloConstants.SOLO_CONST["SPIRIT_PER_ACTION"])
	c["actionPoints"] = ap
	c["drawCount"] = int(poker_arr[draw_idx].get("value", 0))
	c["pendingPoker"] = null
	c["phase"] = "draw-skill"
	draw_skill(state)
	return {"ok": true, "actionPoints": ap, "drawCount": int(c.get("drawCount", 0))}

static func draw_skill(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or String(c.get("phase", "")) != "draw-skill":
		return
	draw_into_pile(state, c["playerPile"], c["playerHand"], c["playerGrave"], int(c.get("drawCount", 0)))
	enforce_hand_limit(state, c["playerHand"])
	c["phase"] = "play"

## 打出技能卡（同名牌可一次打 count 张）
static func play_card(state: Dictionary, card_id: String, count: int = 1) -> Dictionary:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or String(c.get("phase", "")) != "play":
		return {"ok": false, "reason": "非出牌阶段"}
	var card: Variant = GameSoloConstants.SOLO_CARDS.get(card_id)
	if card == null:
		return {"ok": false, "reason": "无此卡"}
	var hand: Dictionary = c.get("playerHand", {})
	if int(hand.get(card_id, 0)) < count:
		return {"ok": false, "reason": "手牌不足"}
	var cost: int = int(card.get("cost", 0)) * count
	if int(c.get("actionPoints", 0)) < cost:
		return {"ok": false, "reason": "行动力不足"}

	c["actionPoints"] = int(c.get("actionPoints", 0)) - cost
	c["playsThisTurn"] = int(c.get("playsThisTurn", 0)) + 1
	remove_from_agg(hand, card_id, count)
	add_to_agg(c["playerGrave"], card_id, count)
	push_played_queue(c, card_id, count, "player")

	var stats: Dictionary = GameSolo.get_card_stats(state, card_id)
	var attrs: Dictionary = state["player"]["attrs"]
	var ctype: String = String(card.get("type", ""))

	if ctype == "physical" or ctype == "magic":
		GameSoundEvents.record_sound(state, "attack")
		var dmg: int = int(stats.get("base", 0)) + int(attrs.get("str" if ctype == "physical" else "mag", 0))
		var hits: int = int(card.get("hits", 1))
		for i in range(count * hits):
			damage_enemy(state, dmg, int(stats.get("armorPen", 0)))
			if String(c.get("phase", "")) == "won":
				break
		if card.get("heal", false):
			heal_self(state, int(stats.get("base", 0)) + int(attrs.get("mag", 0)), count)
		if card.get("actionDrain", 0) != null:
			c["enemyNextActionDrain"] = int(card.get("actionDrain", 0))
	elif ctype == "defense":
		GameSoundEvents.record_sound(state, "defense")
		var shield: int = int(stats.get("base", 0)) + int(attrs.get("def", 0))
		c["playerShield"] = int(c.get("playerShield", 0)) + shield * count
		if card.get("actionRefund", 0) != null:
			c["actionPoints"] = int(c.get("actionPoints", 0)) + int(card.get("actionRefund", 0))
	elif ctype == "utility":
		if card.get("fightingSpirit", 0) != null:
			c["fightingSpirit"] = int(c.get("fightingSpirit", 0)) + int(card.get("fightingSpirit", 0)) * count
		if card.get("drawBonus", 0) != null:
			draw_into_pile(state, c["playerPile"], c["playerHand"], c["playerGrave"], int(card.get("drawBonus", 0)) * count)
			enforce_hand_limit(state, c["playerHand"])

	if String(c.get("phase", "")) != "won" and String(c.get("phase", "")) != "lost":
		check_victory(state)
	return {"ok": true}

static func end_turn(state: Dictionary) -> Dictionary:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or String(c.get("phase", "")) != "play":
		return {"ok": false}
	start_enemy_turn(state)
	return {"ok": true}

# ===== 伤害结算 =====

static func damage_enemy(state: Dictionary, dmg: int, pen: int = 0) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or String(c.get("phase", "")) == "won":
		return
	var d: int = dmg
	# 破甲：穿透 pen 点护盾（直接伤 HP）
	var pen_dmg: int = mini(d, pen)
	c["enemyHp"] = int(c.get("enemyHp", 0)) - pen_dmg
	d -= pen_dmg
	# 扣护盾
	var shield_dmg: int = mini(int(c.get("enemyShield", 0)), d)
	c["enemyShield"] = int(c.get("enemyShield", 0)) - shield_dmg
	d -= shield_dmg
	# 斗志：对护盾造成伤害 → 玛薇卡斗志 += 破盾量
	if shield_dmg > 0:
		c["fightingSpirit"] = int(c.get("fightingSpirit", 0)) + shield_dmg
	# 剩余扣 HP
	c["enemyHp"] = int(c.get("enemyHp", 0)) - d
	if int(c.get("enemyHp", 0)) < 0:
		c["enemyHp"] = 0

static func heal_self(state: Dictionary, amount: int, count: int) -> void:
	var c: Dictionary = state.get("combat", {})
	var p: Dictionary = state["player"]
	p["hp"] = mini(int(p.get("maxHp", 0)), int(p.get("hp", 0)) + amount * count)

static func damage_player(state: Dictionary, dmg: int) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or String(c.get("phase", "")) == "lost":
		return
	var d: int = dmg
	var shield_dmg: int = mini(int(c.get("playerShield", 0)), d)
	c["playerShield"] = int(c.get("playerShield", 0)) - shield_dmg
	d -= shield_dmg
	# 首领斗志：破玩家盾攒斗志
	if shield_dmg > 0 and String(c.get("enemyBuff", "")) == "fightingSpirit":
		c["enemySpirit"] = int(c.get("enemySpirit", 0)) + shield_dmg
	state["player"]["hp"] = int(state["player"].get("hp", 0)) - d
	if int(state["player"].get("hp", 0)) < 0:
		state["player"]["hp"] = 0
	if d > 0:
		GameSoundEvents.record_sound(state, "hit")
	if int(state["player"].get("hp", 0)) <= 0:
		end_combat(state, "lost")

# ===== 敌方 AI 回合 =====

static func start_enemy_turn(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or String(c.get("phase", "")) != "play":
		return
	c["phase"] = "enemy-announce"

	# 1. AI 抽 3 张扑克，选 2 张最大作行动力
	refill_poker(state)
	var r: Dictionary = GameDeck.draw_cards(c.get("pokerDeck", []), int(GameSoloConstants.SOLO_CONST["POKER_DRAW"]))
	c["pokerDeck"] = r["remaining"]
	var drawn: Array = r["drawn"]
	var sorted: Array = drawn.duplicate()
	sorted.sort_custom(func(a, b): return int(a.get("value", 0)) > int(b.get("value", 0)))
	var ap: int = int(sorted[0].get("value", 0)) + int(sorted[1].get("value", 0))
	var draw_count: int = int(sorted[2].get("value", 1)) if sorted.size() > 2 else 1
	# 首领斗志：每 5 层行动力 +1
	ap += int(c.get("enemySpirit", 0)) / int(GameSoloConstants.SOLO_CONST["SPIRIT_PER_ACTION"])
	# 冰锥 debuff
	ap -= int(c.get("enemyNextActionDrain", 0))
	if ap < 0:
		ap = 0
	c["enemyActionPoints"] = ap
	c["enemyDrawCount"] = draw_count
	c["enemySpent"] = 0
	c["enemyPendingPlay"] = null

	# 2. AI 抽技能卡
	draw_into_pile(state, c["enemyPile"], c["enemyHand"], c["enemyGrave"], draw_count)
	enforce_hand_limit(state, c["enemyHand"])

## 敌方宣布要打出的牌；playing=false 表示出牌结束（已回玩家回合）
static func enemy_announce(state: Dictionary) -> Dictionary:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or String(c.get("phase", "")) != "enemy-announce":
		return {"playing": false}
	if String(c.get("phase", "")) == "lost" or String(c.get("phase", "")) == "won":
		return {"playing": false}

	# 所有可出的牌（攻击+防御，纯随机均匀选取）
	var playable: Array = []
	for id in c.get("enemyHand", {}).keys():
		var card: Variant = GameSoloConstants.SOLO_CARDS.get(id)
		if card is Dictionary \
				and String(card.get("type", "")) != "utility" \
				and int(c["enemyHand"][id]) > 0 \
				and int(card.get("cost", 0)) <= int(c.get("enemyActionPoints", 0)):
			playable.append(id)
	# 行动力不足或手牌无可用卡 → 结束敌方回合
	if playable.is_empty():
		finish_enemy_turn(state)
		return {"playing": false}
	var id: String = String(playable[randi() % playable.size()])
	var card: Dictionary = GameSoloConstants.SOLO_CARDS[id]
	# 打出数量：行动力允许范围内的全部持有数
	var max_count: int = mini(int(c["enemyHand"][id]), int(int(c.get("enemyActionPoints", 0)) / int(card.get("cost", 1))))
	var count: int = max_count
	c["enemyPendingPlay"] = {"cardId": id, "count": count, "cost": int(card.get("cost", 0)) * count}
	c["phase"] = "enemy-resolve"
	return {"playing": true, "cardId": id, "count": count}

## 结算敌方宣布的牌（延迟后调用）
static func enemy_resolve(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or String(c.get("phase", "")) != "enemy-resolve" or c.get("enemyPendingPlay") == null:
		return
	var pending: Dictionary = c["enemyPendingPlay"]
	var card_id: String = String(pending.get("cardId", ""))
	var count: int = int(pending.get("count", 1))
	var cost: int = int(pending.get("cost", 0))
	var card: Dictionary = GameSoloConstants.SOLO_CARDS.get(card_id, {})
	c["enemyActionPoints"] = int(c.get("enemyActionPoints", 0)) - cost
	c["enemySpent"] = int(c.get("enemySpent", 0)) + cost
	remove_from_agg(c["enemyHand"], card_id, count)
	add_to_agg(c["enemyGrave"], card_id, count)
	push_played_queue(c, card_id, count, "enemy")

	var ctype: String = String(card.get("type", ""))
	if ctype == "physical" or ctype == "magic":
		var dmg: int = int(card.get("base", 0))
		var hits: int = int(card.get("hits", 1))
		for i in range(count * hits):
			damage_player(state, dmg)
			if String(c.get("phase", "")) == "lost":
				break
	elif ctype == "defense":
		var shield: int = int(card.get("base", 0))
		if int(c.get("enemyNextShieldPen", 0)) > 0:
			shield = maxi(0, shield - int(c.get("enemyNextShieldPen", 0)))
		c["enemyShield"] = int(c.get("enemyShield", 0)) + shield * count
	c["enemyPendingPlay"] = null
	# 若结算中玩家死亡/敌方已败，保持终态，不再继续宣布
	if String(c.get("phase", "")) != "lost" and String(c.get("phase", "")) != "won":
		c["phase"] = "enemy-announce"

static func finish_enemy_turn(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	c["enemyPendingPlay"] = null
	c["round"] = int(c.get("round", 0)) + 1
	if int(c.get("round", 0)) >= int(GameSoloConstants.SOLO_CONST["TURN_LIMIT"]):
		# 平局：HP 比例高者胜，相同玩家败
		var p_ratio: float = float(state["player"].get("hp", 0)) / maxf(1.0, float(state["player"].get("maxHp", 1)))
		var e_ratio: float = float(c.get("enemyHp", 0)) / maxf(1.0, float(c.get("enemyMaxHp", 1)))
		if e_ratio > p_ratio:
			end_combat(state, "won")
		else:
			end_combat(state, "lost")
		return
	if String(c.get("phase", "")) != "lost" and String(c.get("phase", "")) != "won":
		start_player_turn(state)

# ===== 战斗结束 =====

static func check_victory(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	if int(c.get("enemyHp", 0)) <= 0:
		end_combat(state, "won")

static func end_combat(state: Dictionary, result: String) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or String(c.get("phase", "")) == "won" or String(c.get("phase", "")) == "lost":
		return
	c["phase"] = result
	if result == "won":
		GameSoundEvents.record_sound(state, "match_end")
		var reward: Dictionary = GameSolo.award_battle_reward(state, String(c.get("enemyKey", "")))
		c["lastReward"] = reward
		state["log"].append("击败 %s，+%d 金币 +%d 经验" % [c.get("enemyName", "?"), reward.get("gold", 0), reward.get("exp", 0)])
	else:
		GameSoundEvents.record_sound(state, "lose")
		state["gameOver"] = true
		state["log"].append("败于 %s，单机模式结束" % c.get("enemyName", "?"))

## 战斗胜利后领取卡牌候选（3 选 1）；首领额外属性点；末节点通关
static func claim_card_reward(state: Dictionary, card_id: String) -> Dictionary:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or String(c.get("phase", "")) != "won" or not c.has("lastReward"):
		return {"ok": false}
	if not GameSoloConstants.SOLO_CARDS.has(card_id):
		return {"ok": false, "reason": "无此卡"}
	GameSolo.add_cards(state, card_id, 1)
	if int(c["lastReward"].get("attrPoint", 0)) > 0:
		state["player"]["pendingAttrPoints"] = int(state["player"].get("pendingAttrPoints", 0)) + int(c["lastReward"].get("attrPoint", 0))
	c["lastReward"]["claimedCard"] = card_id
	# 通关判定：当前节点是最后一节点（首领）
	if int(state.get("nodeIndex", 0)) >= state.get("mapNodes", []).size() - 1:
		state["victory"] = true
		state["gameOver"] = true
	return {"ok": true}
