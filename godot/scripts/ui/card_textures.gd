class_name CardTextures
## Kenney 扑克牌贴图映射：游戏牌数据（suit/rank）→ 素材贴图
## 素材：assets/kenney/playing-cards（CC0）
## 花色符号 → Kenney 文件名段
const SUIT_FILE := {
	"♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs",
}
const BASE := "res://assets/kenney/playing-cards/PNG/Cards (large)/"
const BACK_PATH := BASE + "card_back.png"

var _cache: Dictionary = {}

## 取牌面贴图（面朝上时）；未知牌返回 null
func get_face(card: Dictionary) -> Texture2D:
	var suit: String = String(card.get("suit", ""))
	var rank: String = String(card.get("rank", ""))
	var sub: String = SUIT_FILE.get(suit, "")
	if sub == "" or rank == "":
		return null
	var path := BASE + "card_%s_%s.png" % [sub, _to_file_rank(rank)]
	return _load_cached(path)

## 游戏 rank（A/2/…/10/J/Q/K）→ Kenney 文件名段（A/02/…/10/J/Q/K，2-9 补零）
func _to_file_rank(rank: String) -> String:
	match rank:
		"2", "3", "4", "5", "6", "7", "8", "9":
			return "0" + rank
		_:
			return rank

## 取牌背贴图
func get_back() -> Texture2D:
	return _load_cached(BACK_PATH)

func _load_cached(path: String) -> Texture2D:
	if _cache.has(path):
		return _cache[path]
	var t: Texture2D = load(path) if ResourceLoader.exists(path) else null
	_cache[path] = t
	return t
