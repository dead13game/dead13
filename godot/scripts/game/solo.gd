class_name GameSolo
## 单机模式状态机 — 章节地图 / 属性成长 / 卡组构筑 / 金币 / 存档
## 从 src/solo/logic/solo.js 移植

const GameSoloConstants = preload("res://scripts/game/solo_constants.gd")

const DEFAULT_START_DECK: Dictionary = {"mengji": 2, "zhongji": 1, "gedang": 1}

# ===== 创建 =====

static func create_solo_state(char_id: int = 6) -> Dictionary:
	var attrs: Dictionary = GameSoloConstants.SOLO_CONST["INIT_ATTRS"].duplicate(true)
	var player: Dictionary = {
		"charId": char_id,
		"hp": GameSoloConstants.calc_max_hp(attrs),
		"maxHp": GameSoloConstants.calc_max_hp(attrs),
		"level": 1,
		"exp": 0,
		"attrs": attrs,
		"pendingAttrPoints": 0,
		"deck": DEFAULT_START_DECK.duplicate(true),
		"upgraded": {},
		"gold": 0,
		"removedCount": 0,
	}
	var map_nodes: Array = []
	for n in GameSoloConstants.SOLO_CHAPTER:
		map_nodes.append(n.duplicate(true))
	return {
		"chapter": 1,
		"chapterTitle": "第 1 章",
		"chapterFlavor": "",
		"nodeIndex": 0,
		"mapNodes": map_nodes,
		"player": player,
		"combat": null,
		"pendingEvent": null,
		"gameOver": false,
		"victory": false,
		"log": [],
		"soundQueue": [],
	}

# ===== 节点 =====

static func get_current_node(state: Dictionary) -> Dictionary:
	var nodes: Array = state.get("mapNodes", [])
	var idx: int = int(state.get("nodeIndex", 0))
	return nodes[idx] if idx < nodes.size() else {}

static func is_solo_finished(state: Dictionary) -> bool:
	return int(state.get("nodeIndex", 0)) >= state.get("mapNodes", []).size()

static func advance_node(state: Dictionary) -> void:
	state["nodeIndex"] = int(state.get("nodeIndex", 0)) + 1

# ===== 属性 / 经验 =====

static func gain_exp(state: Dictionary, n: int) -> void:
	var p: Dictionary = state["player"]
	p["exp"] = int(p.get("exp", 0)) + n
	var curve: Array = GameSoloConstants.EXP_CURVE
	while int(p.get("level", 1)) < curve.size() + 1 \
			and int(p.get("exp", 0)) >= int(curve[int(p.get("level", 1)) - 1]):
		p["exp"] = int(p.get("exp", 0)) - int(curve[int(p.get("level", 1)) - 1])
		p["level"] = int(p.get("level", 1)) + 1
		p["pendingAttrPoints"] = int(p.get("pendingAttrPoints", 0)) + int(GameSoloConstants.SOLO_CONST["ATTR_POINTS_PER_LEVEL"])
		# 升级回满血（肉鸽惯例）
		p["hp"] = GameSoloConstants.calc_max_hp(p["attrs"])
		p["maxHp"] = GameSoloConstants.calc_max_hp(p["attrs"])

static func apply_attr_points(state: Dictionary, attr: String, n: int) -> bool:
	var p: Dictionary = state["player"]
	if n > int(p.get("pendingAttrPoints", 0)):
		return false
	if not p["attrs"].has(attr):
		return false
	p["attrs"][attr] = int(p["attrs"][attr]) + n
	p["pendingAttrPoints"] = int(p.get("pendingAttrPoints", 0)) - n
	p["maxHp"] = GameSoloConstants.calc_max_hp(p["attrs"])
	p["hp"] = mini(int(p.get("hp", 0)), int(p.get("maxHp", 0)))
	return true

# ===== 卡组构筑 =====

static func add_cards(state: Dictionary, card_id: String, count: int = 1) -> bool:
	if not GameSoloConstants.SOLO_CARDS.has(card_id):
		return false
	var deck: Dictionary = state["player"]["deck"]
	deck[card_id] = int(deck.get(card_id, 0)) + count
	return true

static func remove_card(state: Dictionary, card_id: String) -> bool:
	var deck: Dictionary = state["player"]["deck"]
	if not deck.has(card_id) or int(deck[card_id]) <= 0:
		return false
	deck[card_id] = int(deck[card_id]) - 1
	if int(deck[card_id]) <= 0:
		deck.erase(card_id)
	state["player"]["removedCount"] = int(state["player"].get("removedCount", 0)) + 1
	return true

static func remove_random_card(state: Dictionary) -> String:
	var ids: Array = state["player"]["deck"].keys()
	if ids.is_empty():
		return ""
	var card_id: String = String(ids[randi() % ids.size()])
	remove_card(state, card_id)
	return card_id

static func upgrade_card(state: Dictionary, card_id: String) -> bool:
	var deck: Dictionary = state["player"]["deck"]
	if not deck.has(card_id) or int(deck[card_id]) <= 0:
		return false
	var upgraded: Dictionary = state["player"].get("upgraded", {})
	upgraded[card_id] = int(upgraded.get(card_id, 0)) + 1
	state["player"]["upgraded"] = upgraded
	return true

static func get_card_stats(state: Dictionary, card_id: String) -> Dictionary:
	var card: Variant = GameSoloConstants.SOLO_CARDS.get(card_id)
	if card == null:
		return {}
	var ups: int = int(state["player"].get("upgraded", {}).get(card_id, 0))
	var result: Dictionary = card.duplicate(true)
	result["base"] = int(card.get("base", 0)) + ups * 2
	return result

# ===== 金币 / 生命 =====

static func add_gold(state: Dictionary, n: int) -> void:
	var p: Dictionary = state["player"]
	p["gold"] = maxi(0, int(p.get("gold", 0)) + n)

static func spend_gold(state: Dictionary, n: int) -> bool:
	var p: Dictionary = state["player"]
	if int(p.get("gold", 0)) < n:
		return false
	p["gold"] = int(p.get("gold", 0)) - n
	return true

static func heal_player(state: Dictionary, n: int) -> void:
	var p: Dictionary = state["player"]
	p["hp"] = mini(int(p.get("maxHp", 0)), int(p.get("hp", 0)) + n)

# ===== 商店 =====

static func shop_catalog(state: Dictionary) -> Array:
	return GameSoloConstants.SOLO_CARDS.keys()

static func _card_rarity_price(card_id: String) -> int:
	var card: Variant = GameSoloConstants.SOLO_CARDS.get(card_id)
	if card is Dictionary and int(card.get("cost", 0)) >= 8:
		return int(GameSoloConstants.SHOP_PRICE["buyRare"])
	return int(GameSoloConstants.SHOP_PRICE["buyCommon"])

static func shop_buy(state: Dictionary, card_id: String) -> Dictionary:
	var card: Variant = GameSoloConstants.SOLO_CARDS.get(card_id)
	if card == null:
		return {"ok": false, "reason": "无此卡"}
	var price: int = _card_rarity_price(card_id)
	if not spend_gold(state, price):
		return {"ok": false, "reason": "金币不足"}
	add_cards(state, card_id, 1)
	return {"ok": true, "price": price}

static func shop_remove_price(state: Dictionary) -> int:
	return int(GameSoloConstants.SHOP_PRICE["removeBase"]) \
		+ int(state["player"].get("removedCount", 0)) * int(GameSoloConstants.SHOP_PRICE["removeIncrement"])

static func shop_heal_price(amount: int) -> int:
	return ceili(float(amount) / 5.0) * int(GameSoloConstants.SHOP_PRICE["healPer5"])

static func shop_upgrade_price() -> int:
	return int(GameSoloConstants.SHOP_PRICE["upgrade"])

# ===== 战斗奖励 =====

static func award_battle_reward(state: Dictionary, enemy_key: String) -> Dictionary:
	var reward: Variant = GameSoloConstants.BATTLE_REWARD.get(enemy_key)
	if reward == null:
		return {}
	var gold_range: Array = reward.get("gold", [0, 0])
	var gold: int = int(gold_range[0]) + randi() % (int(gold_range[1]) - int(gold_range[0]) + 1)
	add_gold(state, gold)
	gain_exp(state, int(reward.get("exp", 0)))
	return {
		"gold": gold,
		"exp": int(reward.get("exp", 0)),
		"rarity": reward.get("rarity", "common"),
		"attrPoint": int(reward.get("attrPoint", 0)),
	}

static func roll_card_candidates(rarity: String) -> Array:
	var ids: Array = GameSoloConstants.SOLO_CARDS.keys()
	var pool: Array = []
	for id in ids:
		var card: Variant = GameSoloConstants.SOLO_CARDS[id]
		if rarity == "rare":
			if int(card.get("cost", 0)) >= 8:
				pool.append(id)
		elif rarity == "mix":
			pool.append(id)
		else:
			if int(card.get("cost", 0)) < 8:
				pool.append(id)
	# 洗牌取 3
	var shuffled: Array = pool.duplicate()
	for i in range(shuffled.size() - 1, 0, -1):
		var j: int = randi() % (i + 1)
		var tmp = shuffled[i]
		shuffled[i] = shuffled[j]
		shuffled[j] = tmp
	var result: Array = []
	for i in range(mini(3, shuffled.size())):
		result.append(shuffled[i])
	return result

# ===== 存档 =====

static func serialize_solo(state: Dictionary) -> Dictionary:
	return state.duplicate(true)

static func deserialize_solo(state: Dictionary, data: Variant) -> bool:
	if data == null or not (data is Dictionary):
		return false
	# 深拷贝关键字段
	state["chapter"] = data.get("chapter", 1)
	state["chapterTitle"] = data.get("chapterTitle", "第 1 章")
	state["chapterFlavor"] = data.get("chapterFlavor", "")
	state["nodeIndex"] = data.get("nodeIndex", 0)
	state["mapNodes"] = (data.get("mapNodes", []) as Array).duplicate(true)
	state["player"] = (data.get("player", {}) as Dictionary).duplicate(true)
	state["combat"] = data.get("combat")
	state["pendingEvent"] = data.get("pendingEvent")
	state["gameOver"] = data.get("gameOver", false)
	state["victory"] = data.get("victory", false)
	state["log"] = (data.get("log", []) as Array).duplicate(true)
	return true
