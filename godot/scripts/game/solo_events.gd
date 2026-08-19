class_name GameSoloEvents
## 单机事件 — 文本 / 选项 / 扑克检定
## 从 src/solo/logic/soloEvents.js 移植

const GameSoloConstants = preload("res://scripts/game/solo_constants.gd")
const GameSolo = preload("res://scripts/game/solo.gd")
const GameDeck = preload("res://scripts/game/deck.gd")

const SOLO_EVENTS: Dictionary = {
	"hunter": {
		"id": "hunter",
		"title": "岔路猎手",
		"desc": "一名猎手拦住去路：\"要么付过路费，要么和我比试力气，绕路也行——你自己选。\"",
		"options": [
			{"text": "付 10 金币通过", "type": "fixed", "gold": -10, "note": "安稳通过"},
			{
				"text": "比试力量（检定·力量 DC12）",
				"type": "check",
				"attr": "str",
				"dc": 12,
				"success": {"gold": 5, "note": "你赢了！免费通过还得了 5 金"},
				"fail": {"hp": -5, "note": "被推搡了一下，扣 5 HP"},
			},
			{"text": "绕路，随机删 1 张卡", "type": "fixed", "removeRandom": 1, "note": "绕远路，代价是丢掉一张卡"},
		],
	},
	"merchant": {
		"id": "merchant",
		"title": "神秘商人",
		"desc": "黑市商人兜售一张稀有法术卡，但价格看起来有些可疑……",
		"options": [
			{"text": "花 25 金币直接买", "type": "fixed", "addRareCard": 1, "gold": -25, "note": "买到一张随机稀有卡"},
			{
				"text": "砍价（检定·法力 DC13）",
				"type": "check",
				"attr": "mag",
				"dc": 13,
				"success": {"addRareCard": 1, "gold": -15, "note": "谈成了！15 金成交"},
				"fail": {"addRareCard": 1, "gold": -25, "note": "谈崩了，原价 25 金"},
			},
			{"text": "不买，得 5 金币", "type": "fixed", "gold": 5, "note": "商人赏识你的谨慎"},
		],
	},
}

## 扑克检定：抽 1 张扑克（点数 1-13）+ 属性修正 vs DC；♥ 花色失败可重抽 1 次
static func roll_check(state: Dictionary, attr: String, dc: int) -> Dictionary:
	var deck: Array = GameDeck.shuffle_deck(GameDeck.create_full_deck(1))
	var card: Dictionary = GameDeck.draw_cards(deck, 1)["drawn"][0]
	var total: int = int(card.get("value", 0)) + int(state["player"]["attrs"].get(attr, 0))
	var rerolled: bool = false
	if String(card.get("suit", "")) == "♥" and total < dc:
		var second: Array = GameDeck.draw_cards(deck, 1)["drawn"]
		if not second.is_empty():
			total = int(second[0].get("value", 0)) + int(state["player"]["attrs"].get(attr, 0))
			rerolled = true
	return {"success": total >= dc, "total": total, "card": card, "rerolled": rerolled}

## 应用事件选项结果（含检定），返回结果摘要
static func apply_event_option(state: Dictionary, event_id: String, option_idx: int) -> Dictionary:
	var ev: Variant = SOLO_EVENTS.get(event_id)
	if ev == null:
		return {"ok": false}
	var options: Array = ev.get("options", [])
	if option_idx < 0 or option_idx >= options.size():
		return {"ok": false}
	var opt: Dictionary = options[option_idx]

	# 深拷贝：SOLO_EVENTS 是 const 只读字典，直接引用后写 outcome 会崩溃
	var outcome: Dictionary = opt.duplicate(true)
	var check: Dictionary = {}
	if String(opt.get("type", "")) == "check":
		check = roll_check(state, String(opt.get("attr", "str")), int(opt.get("dc", 10)))
		if check.get("success", false):
			outcome = opt.get("success", {}).duplicate(true)
		else:
			outcome = opt.get("fail", {}).duplicate(true)

	# 应用效果
	if outcome.has("gold"):
		GameSolo.add_gold(state, int(outcome["gold"]))
	if outcome.has("hp"):
		if int(outcome["hp"]) < 0:
			state["player"]["hp"] = maxi(0, int(state["player"].get("hp", 0)) + int(outcome["hp"]))
		else:
			GameSolo.heal_player(state, int(outcome["hp"]))
	if outcome.get("removeRandom", 0) > 0:
		var removed: String = GameSolo.remove_random_card(state)
		outcome["removedCard"] = removed
	if outcome.get("addRareCard", 0) > 0:
		var rare_ids: Array = []
		for id in GameSoloConstants.SOLO_CARDS.keys():
			var card: Variant = GameSoloConstants.SOLO_CARDS[id]
			if int(card.get("cost", 0)) >= 8:
				rare_ids.append(id)
		var picked: String = String(rare_ids[randi() % rare_ids.size()])
		GameSolo.add_cards(state, picked, 1)
		outcome["gainedCard"] = picked
	if outcome.has("addCard"):
		GameSolo.add_cards(state, String(outcome["addCard"]), 1)
		outcome["gainedCard"] = outcome["addCard"]

	# 事件扣血致死判定
	if int(state["player"].get("hp", 0)) <= 0:
		state["player"]["hp"] = 0
		state["gameOver"] = true
		outcome["dead"] = true

	return {"ok": true, "option": opt, "check": check, "outcome": outcome}
