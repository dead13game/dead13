class_name GameDeck
## 扑克牌模块（从 src/game/deck.js 移植）

const GameConstants = preload("res://scripts/game/constants.gd")

## 创建一副牌：52张，不含大小王
static func create_deck() -> Array:
	var cards: Array = []
	for suit in GameConstants.SUITS:
		for rank in GameConstants.RANKS:
			cards.append({
				"id": "%s-%s" % [suit, rank],
				"suit": suit,
				"rank": rank,
				"value": int(GameConstants.RANK_VALUES[rank]),
				"faceUp": false,
			})
	return cards

## Fisher-Yates 洗牌（返回新数组）
static func shuffle_deck(deck: Array) -> Array:
	var arr: Array = deck.duplicate()
	for i in range(arr.size() - 1, 0, -1):
		var j: int = randi() % (i + 1)
		var tmp = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp
	return arr

## 创建牌库（默认两副牌）
static func create_full_deck(num_decks: int = 2) -> Array:
	var deck: Array = []
	for i in range(num_decks):
		deck.append_array(create_deck())
	return deck

## 从牌库顶抽 n 张牌
static func draw_cards(deck: Array, n: int = 1) -> Dictionary:
	var drawn: Array = []
	var remaining: Array = deck.duplicate()
	for i in range(n):
		if remaining.is_empty():
			break
		drawn.append(remaining.pop_back())
	return {"drawn": drawn, "remaining": remaining}

## 重构牌库：洗匀墓地中的牌作为新牌库（排除指定卡牌 id）
static func reshuffle_from_grave(grave: Array, exclude_ids: Array = []) -> Array:
	var eligible: Array = []
	for card in grave:
		if not exclude_ids.has(card.get("id")):
			eligible.append(card)
	return shuffle_deck(eligible)

## 获取牌的点数描述
static func card_display(card: Dictionary) -> String:
	if card.is_empty():
		return "无牌"
	return "%s%s" % [card.get("rank", "?"), card.get("suit", "?")]
