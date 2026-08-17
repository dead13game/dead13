extends Control
## 单机模式 UI 主壳：地图 / 战斗（抽3选2·出牌）/ 事件 / 商店 / 营地 / 属性 / 结算
## 从 src/solo/SoloShell.vue 移植（功能 UI，视觉细节可在 Godot 编辑器调整）

const GameSolo = preload("res://scripts/game/solo.gd")
const GameSoloConstants = preload("res://scripts/game/solo_constants.gd")
const GameSoloCombat = preload("res://scripts/game/solo_combat.gd")
const GameSoloEvents = preload("res://scripts/game/solo_events.gd")
const GameConstants = preload("res://scripts/game/constants.gd")
const GameDeck = preload("res://scripts/game/deck.gd")
const SaveManager = preload("res://scripts/autoload/save_manager.gd")

var _s: Dictionary = {}
var _view: String = "map"
var _poker_picks: Array = []      # 前2张=行动力，第3张=抽牌数
var _reward_candidates: Array = []
var _reward_claimed: bool = false
var _enemy_text: String = ""
var _msg: String = ""
var _busy: bool = false

@onready var _back_btn: Button = find_child("BackBtn", true, false) as Button
@onready var _title: Label = %TitleLabel
@onready var _player_label: Label = %PlayerLabel
@onready var _content: VBoxContainer = %ContentBox
@onready var _log_box: VBoxContainer = %LogBox

func _ready() -> void:
	if GameManager.solo_state.is_empty():
		GameManager.new_solo()
	_s = GameManager.solo_state
	AudioManager.play_bgm("battle1")
	_ensure_nodes()
	_bind_back()
	_refresh_log()
	_show_map()

## 绑定返回按钮（场景缺 BackBtn 时兜底创建）
func _bind_back() -> void:
	if _back_btn == null:
		_back_btn = Button.new()
		_back_btn.text = "← 返回"
		add_child(_back_btn)
	if not _back_btn.pressed.is_connected(_on_back):
		_back_btn.pressed.connect(_on_back)

func _on_back() -> void:
	GameManager.solo_state = {}
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")

## 场景节点缺失时降级：代码兜底创建（编辑器里搭一半也能跑）
func _ensure_nodes() -> void:
	if _title == null:
		_title = Label.new()
		_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_title.add_theme_font_size_override("font_size", 26)
		add_child(_title)
	if _player_label == null:
		_player_label = Label.new()
		_player_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		add_child(_player_label)
	if _content == null:
		_content = VBoxContainer.new()
		_content.add_theme_constant_override("separation", 8)
		var scroll := ScrollContainer.new()
		scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
		add_child(scroll)
		scroll.add_child(_content)
	if _log_box == null:
		_log_box = VBoxContainer.new()
		var log_scroll := ScrollContainer.new()
		log_scroll.custom_minimum_size = Vector2(0, 90)
		add_child(log_scroll)
		log_scroll.add_child(_log_box)

# ===== 刷新 =====

func _refresh_player() -> void:
	var p: Dictionary = _s["player"]
	var char_data: Dictionary = GameConstants.CHARACTERS.get(int(p.get("charId", 6)), {})
	var pending: String = ""
	if int(p.get("pendingAttrPoints", 0)) > 0:
		pending = "  【属性点 %d】" % p.get("pendingAttrPoints", 0)
	_player_label.text = "%s  Lv%d  HP %d/%d  金币 %d%s" % [
		char_data.get("name", "玛薇卡"), p.get("level", 1), p.get("hp", 0),
		p.get("maxHp", 0), p.get("gold", 0), pending]

func _refresh_log() -> void:
	# 只追加新日志
	var logs: Array = _s.get("log", [])
	var existing: int = _log_box.get_child_count()
	while existing < logs.size():
		var l := Label.new()
		l.text = String(logs[existing])
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.add_theme_font_size_override("font_size", 12)
		_log_box.add_child(l)
		existing += 1

func _clear_content() -> void:
	for child in _content.get_children():
		child.queue_free()

func _add_label(text: String, font_size: int = 15) -> Label:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", font_size)
	_content.add_child(l)
	return l

func _add_button(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 44)
	b.pressed.connect(cb)
	_content.add_child(b)
	return b

# ===== 地图 =====

func _show_map() -> void:
	_view = "map"
	_title.text = "%s" % _s.get("chapterTitle", "第 1 章")
	_refresh_player()
	_clear_content()

	if not _msg.is_empty():
		var msg_label := Label.new()
		msg_label.text = _msg
		msg_label.add_theme_font_size_override("font_size", 14)
		msg_label.add_theme_color_override("font_color", Color(0.6, 1.0, 0.7))
		_content.add_child(msg_label)
		_msg = ""

	var node_idx: int = int(_s.get("nodeIndex", 0))
	var nodes: Array = _s.get("mapNodes", [])
	_add_label("当前进度：%d / %d 节点" % [node_idx, nodes.size()])
	for i in range(nodes.size()):
		var n: Dictionary = nodes[i]
		var meta: Dictionary = GameSoloConstants.NODE_META.get(n.get("type", ""), {})
		var mark: String = "▶ " if i == node_idx else ("✅ " if i < node_idx else "· ")
		var extra: String = ""
		if n.has("enemy"):
			extra = GameSoloConstants.SOLO_ENEMIES.get(n["enemy"], {}).get("name", "")
		var l := Label.new()
		l.text = "%s%s %s %s" % [mark, meta.get("icon", "❓"), meta.get("name", "?"), extra]
		_content.add_child(l)

	if _s.get("gameOver", false):
		_show_end()
		return

	if GameSolo.is_solo_finished(_s):
		_s["victory"] = true
		_s["gameOver"] = true
		_show_end()
		return

	var p: Dictionary = _s["player"]
	if int(p.get("pendingAttrPoints", 0)) > 0:
		_add_button("⬆ 分配属性点（%d）" % p["pendingAttrPoints"], _show_attr)

	# 存档 / 读档
	_add_button("💾 存档", _on_save)
	_add_button("📂 读档（%s）" % ("有存档" if SaveManager.has("solo") else "无存档"), _on_load)

	_add_button("➡️ 进入当前节点", _enter_node)

## 存档（单人爬塔）
func _on_save() -> void:
	var data: Dictionary = GameSolo.serialize_solo(_s)
	if SaveManager.save("solo", data):
		_msg = "已存档！"
	else:
		_msg = "存档失败"
	_show_map()

## 读档
func _on_load() -> void:
	var data: Variant = SaveManager.load("solo")
	if data == null or not data is Dictionary:
		_msg = "无存档或读档失败"
		_show_map()
		return
	if GameSolo.deserialize_solo(_s, data):
		_msg = "读档成功！"
		_refresh_log()
		_show_map()
	else:
		_msg = "读档失败"
		_show_map()

## 进入当前节点
func _enter_node() -> void:
	var node: Dictionary = GameSolo.get_current_node(_s)
	match String(node.get("type", "")):
		"battle":
			_poker_picks.clear()
			GameSoloCombat.start_combat(_s, String(node.get("enemy", "normal")))
			_show_battle()
		"event":
			_show_event()
		"shop":
			_show_shop()
		"camp":
			_show_camp()
		_:
			_finish_node()

## 完成当前节点 → 推进 → 回地图
func _finish_node() -> void:
	if not _s.get("gameOver", false) and not _s.get("victory", false):
		GameSolo.advance_node(_s)
	_refresh_log()
	_show_map()

# ===== 战斗 =====

func _show_battle() -> void:
	_view = "battle"
	var c: Dictionary = _s.get("combat", {})
	if c.is_empty():
		_finish_node()
		return
	_title.text = "⚔️ %s" % c.get("enemyName", "?")
	_refresh_player()
	_clear_content()

	var enemy_line := Label.new()
	enemy_line.text = "敌方 HP %d/%d 护盾 %d%s" % [
		c.get("enemyHp", 0), c.get("enemyMaxHp", 0), c.get("enemyShield", 0),
		"  斗志%d" % c.get("enemySpirit", 0) if int(c.get("enemySpirit", 0)) > 0 else ""]
	enemy_line.add_theme_font_size_override("font_size", 18)
	enemy_line.add_theme_color_override("font_color", Color(1.0, 0.5, 0.5))
	_content.add_child(enemy_line)

	var phase: String = String(c.get("phase", ""))
	match phase:
		"pick-poker":
			_add_label("抽 3 张扑克：先点 2 张作行动力，再点 1 张作抽牌数（已选 %d/3）" % _poker_picks.size(), 16)
			var poker: Array = c.get("pendingPoker", [])
			for i in range(poker.size()):
				var card: Dictionary = poker[i]
				var b := Button.new()
				var picked_mark: String = " ✓" if _poker_picks.has(i) else ""
				b.text = "%s%s (%d)%s" % [card.get("rank", "?"), card.get("suit", ""), card.get("value", 0), picked_mark]
				b.custom_minimum_size = Vector2(110, 50)
				var idx: int = i
				b.pressed.connect(func(): _on_poker_pick(idx))
				_content.add_child(b)
		"play":
			_add_label("行动力 %d  斗志 %d  你的护盾 %d" % [c.get("actionPoints", 0), c.get("fightingSpirit", 0), c.get("playerShield", 0)], 16)
			var hand: Dictionary = c.get("playerHand", {})
			if hand.is_empty():
				_add_label("手牌为空", 14)
			for id in hand.keys():
				var card: Dictionary = GameSolo.get_card_stats(_s, String(id))
				var held: int = int(hand[id])
				var line: String = "%s ×%d  （行动力 %d）" % [card.get("name", "?"), held, card.get("cost", 0)]
				if card.has("hits"):
					line += " 连击%d" % card.get("hits", 1)
				if card.get("heal", false):
					line += " 治疗"
				var b := Button.new()
				b.text = line
				b.custom_minimum_size = Vector2(0, 44)
				var cid: String = String(id)
				b.pressed.connect(func(): _on_play_card(cid))
				_content.add_child(b)
			_add_button("⏭ 结束回合", _on_end_turn)
		"enemy-announce":
			_add_label("敌方回合：%s" % _enemy_text, 16)
			_add_label("（敌方行动力 %d / 抽 %d）" % [c.get("enemyActionPoints", 0), c.get("enemyDrawCount", 0)], 14)
		"enemy-resolve":
			_add_label("敌方出牌中… %s" % _enemy_text, 16)
		"won":
			_show_reward()
			return
		"lost":
			_show_end()
			return
		_:
			_add_label("…", 14)

## 选扑克：前2张=行动力，第3张=抽牌数
func _on_poker_pick(idx: int) -> void:
	if _poker_picks.has(idx):
		return
	_poker_picks.append(idx)
	if _poker_picks.size() < 3:
		_show_battle()  # 刷新显示已选
		return
	var r: Dictionary = GameSoloCombat.pick_poker(_s, _poker_picks[0], _poker_picks[1], _poker_picks[2])
	_poker_picks.clear()
	if not r.get("ok", false):
		_msg = String(r.get("reason", "选牌失败"))
		_show_battle()
		return
	_show_battle()

func _on_play_card(card_id: String) -> void:
	var r: Dictionary = GameSoloCombat.play_card(_s, card_id, 1)
	if not r.get("ok", false):
		_msg = String(r.get("reason", "出牌失败"))
	_refresh_log()
	_show_battle()

func _on_end_turn() -> void:
	if _busy:
		return
	_busy = true
	GameSoloCombat.end_turn(_s)
	_refresh_log()
	_show_battle()
	# 敌方出牌循环（带延迟）
	var guard: int = 0
	while true:
		var c: Dictionary = _s.get("combat", {})
		var phase: String = String(c.get("phase", ""))
		if phase != "enemy-announce" and phase != "enemy-resolve":
			break
		guard += 1
		if guard > 40:
			break
		var ann: Dictionary = GameSoloCombat.enemy_announce(_s)
		if not ann.get("playing", false):
			break
		_enemy_text = "%s ×%d" % [GameSoloConstants.SOLO_CARDS.get(ann.get("cardId", ""), {}).get("name", "?"), ann.get("count", 1)]
		_show_battle()
		await get_tree().create_timer(1.0).timeout
		GameSoloCombat.enemy_resolve(_s)
		_refresh_log()
	_busy = false
	_show_battle()

## 战斗胜利 → 奖励 + 卡牌3选1
func _show_reward() -> void:
	_view = "reward"
	var c: Dictionary = _s.get("combat", {})
	_title.text = "🎉 战斗胜利！"
	_refresh_player()
	_clear_content()
	var reward: Dictionary = c.get("lastReward", {})
	var line: String = "获得 %d 金币  %d 经验" % [reward.get("gold", 0), reward.get("exp", 0)]
	if int(reward.get("attrPoint", 0)) > 0:
		line += "  +%d 属性点" % reward.get("attrPoint", 0)
	_add_label(line, 18)
	if _reward_claimed:
		_add_label("已领取奖励，前往下一节点", 14)
		_add_button("➡️ 前往下一节点", func():
			_reward_claimed = false
			_finish_node())
		return
	# 生成候选
	if _reward_candidates.is_empty():
		_reward_candidates = GameSolo.roll_card_candidates(String(reward.get("rarity", "common")))
	_add_label("选择一张奖励卡：", 16)
	for id in _reward_candidates:
		var card: Dictionary = GameSoloConstants.SOLO_CARDS.get(id, {})
		var b := Button.new()
		b.text = "%s（%s）" % [card.get("name", "?"), _rarity_text(String(card.get("type", "")))]
		b.custom_minimum_size = Vector2(0, 44)
		var cid: String = String(id)
		b.pressed.connect(func(): _on_claim(cid))
		_content.add_child(b)

func _rarity_text(ctype: String) -> String:
	match ctype:
		"physical":
			return "物理"
		"magic":
			return "法术"
		"defense":
			return "防御"
		"utility":
			return "功能"
	return "?"

func _on_claim(card_id: String) -> void:
	var r: Dictionary = GameSoloCombat.claim_card_reward(_s, card_id)
	if not r.get("ok", false):
		_msg = "领卡失败"
		return
	_reward_claimed = true
	_refresh_log()
	if _s.get("gameOver", false) or _s.get("victory", false):
		_show_end()
	else:
		_show_reward()

# ===== 事件 =====

func _show_event() -> void:
	_view = "event"
	var node: Dictionary = GameSolo.get_current_node(_s)
	var event_id: String = String(node.get("eventId", "hunter"))
	var ev: Dictionary = GameSoloEvents.SOLO_EVENTS.get(event_id, {})
	_title.text = "❓ %s" % ev.get("title", "事件")
	_refresh_player()
	_clear_content()
	_add_label(ev.get("desc", ""), 15)
	for i in range(ev.get("options", []).size()):
		var opt: Dictionary = ev["options"][i]
		var b := Button.new()
		b.text = String(opt.get("text", "?"))
		b.custom_minimum_size = Vector2(0, 44)
		var opt_idx: int = i
		var ev_id: String = event_id
		b.pressed.connect(func(): _on_event_option(ev_id, opt_idx))
		_content.add_child(b)

func _on_event_option(event_id: String, opt_idx: int) -> void:
	var r: Dictionary = GameSoloEvents.apply_event_option(_s, event_id, opt_idx)
	_refresh_log()
	if _s.get("gameOver", false):
		_show_end()
		return
	var outcome: Dictionary = r.get("outcome", {})
	var note: String = String(outcome.get("note", "已生效"))
	if outcome.has("removedCard"):
		var cdata: Dictionary = GameSoloConstants.SOLO_CARDS.get(outcome["removedCard"], {})
		note += "（失去 %s）" % cdata.get("name", "?")
	if outcome.has("gainedCard"):
		var cdata2: Dictionary = GameSoloConstants.SOLO_CARDS.get(outcome["gainedCard"], {})
		note += "（获得 %s）" % cdata2.get("name", "?")
	_msg = note
	_show_event_result(note)

func _show_event_result(note: String) -> void:
	_view = "event"
	_title.text = "事件结果"
	_clear_content()
	_add_label(note, 16)
	if _s.get("gameOver", false):
		_add_button("查看结局", _show_end)
		return
	_add_button("➡️ 继续前进", _finish_node)

# ===== 商店 =====

func _show_shop() -> void:
	_view = "shop"
	_title.text = "🛒 商店"
	_refresh_player()
	_clear_content()
	if not _msg.is_empty():
		_add_label(_msg, 14)
		_msg = ""

	# 买卡
	_add_label("购买卡牌：", 16)
	for id in GameSolo.shop_catalog(_s):
		var card: Dictionary = GameSoloConstants.SOLO_CARDS.get(id, {})
		var price: int = 15 if int(card.get("cost", 0)) < 8 else 25
		var b := Button.new()
		b.text = "%s  %d💰" % [card.get("name", "?"), price]
		b.custom_minimum_size = Vector2(0, 44)
		var cid: String = String(id)
		b.pressed.connect(func():
			var r: Dictionary = GameSolo.shop_buy(_s, cid)
			_msg = "购买成功！" if r.get("ok", false) else String(r.get("reason", "购买失败"))
			_refresh_log()
			_show_shop())
		_content.add_child(b)

	# 回血 / 删卡 / 升级
	_add_button("💖 回满（%d💰）" % GameSolo.shop_heal_price(int(_s["player"]["maxHp"]) - int(_s["player"]["hp"])), func():
		var cost: int = GameSolo.shop_heal_price(int(_s["player"]["maxHp"]) - int(_s["player"]["hp"]))
		if GameSolo.spend_gold(_s, cost):
			GameSolo.heal_player(_s, int(_s["player"]["maxHp"]))
			_msg = "回满！"
		else:
			_msg = "金币不足"
		_show_shop())
	_add_button("🗑 删一张卡（%d💰）" % GameSolo.shop_remove_price(_s), func():
		var cost: int = GameSolo.shop_remove_price(_s)
		if GameSolo.spend_gold(_s, cost):
			var removed: String = GameSolo.remove_random_card(_s)
			var cdata: Dictionary = GameSoloConstants.SOLO_CARDS.get(removed, {})
			_msg = "删除了 %s" % cdata.get("name", "?")
		else:
			_msg = "金币不足"
		_refresh_log()
		_show_shop())

	_add_button("➡️ 离开商店", _finish_node)

# ===== 营地 =====

func _show_camp() -> void:
	_view = "camp"
	_title.text = "🏕️ 营地"
	_refresh_player()
	_clear_content()
	if not _msg.is_empty():
		_add_label(_msg, 14)
		_msg = ""
	_add_label("休整一番：回血或升级一张卡", 15)

	_add_button("💖 回满（%d💰）" % GameSolo.shop_heal_price(int(_s["player"]["maxHp"]) - int(_s["player"]["hp"])), func():
		var cost: int = GameSolo.shop_heal_price(int(_s["player"]["maxHp"]) - int(_s["player"]["hp"]))
		if GameSolo.spend_gold(_s, cost):
			GameSolo.heal_player(_s, int(_s["player"]["maxHp"]))
			_msg = "满血复活！"
		else:
			_msg = "金币不足"
		_show_camp())

	for id in _s["player"]["deck"].keys():
		var card: Dictionary = GameSoloConstants.SOLO_CARDS.get(id, {})
		var b := Button.new()
		b.text = "⬆ %s（%d💰）" % [card.get("name", "?"), GameSolo.shop_upgrade_price()]
		b.custom_minimum_size = Vector2(0, 44)
		var cid: String = String(id)
		b.pressed.connect(func():
			if GameSolo.spend_gold(_s, GameSolo.shop_upgrade_price()):
				GameSolo.upgrade_card(_s, cid)
				_msg = "%s 升级！" % card.get("name", "?")
			else:
				_msg = "金币不足"
			_refresh_log()
			_show_camp())
		_content.add_child(b)

	_add_button("➡️ 前往下一节点", _finish_node)

# ===== 属性分配 =====

func _show_attr() -> void:
	_view = "attr"
	_title.text = "⬆ 属性分配"
	_refresh_player()
	_clear_content()
	var p: Dictionary = _s["player"]
	_add_label("剩余属性点：%d" % p.get("pendingAttrPoints", 0), 16)
	for attr in ["str", "mag", "def"]:
		var names: Dictionary = {"str": "力量", "mag": "法力", "def": "防御"}
		var b := Button.new()
		b.text = "+1 %s（当前 %d）" % [names[attr], p["attrs"][attr]]
		b.custom_minimum_size = Vector2(0, 44)
		var a: String = attr
		b.pressed.connect(func():
			GameSolo.apply_attr_points(_s, a, 1)
			_show_attr())
		_content.add_child(b)
	if int(p.get("pendingAttrPoints", 0)) <= 0:
		_add_button("➡️ 返回地图", _show_map)

# ===== 结算 =====

func _show_end() -> void:
	_view = "end"
	_refresh_player()
	_clear_content()
	var end_label := Label.new()
	end_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	end_label.add_theme_font_size_override("font_size", 26)
	if _s.get("victory", false):
		_title.text = "🏆 通关！"
		end_label.text = "恭喜你征服了这条街！"
		end_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3))
	elif _s.get("gameOver", false):
		_title.text = "💀 阵亡"
		end_label.text = "倒在了第 %d 节点…" % _s.get("nodeIndex", 0)
		end_label.add_theme_color_override("font_color", Color(1.0, 0.4, 0.4))
	else:
		_title.text = "单机模式"
		end_label.text = "（未结束）"
	_content.add_child(end_label)
	var again := Button.new()
	again.text = "再玩一次"
	again.custom_minimum_size = Vector2(0, 48)
	again.pressed.connect(func():
		GameManager.new_solo()
		_s = GameManager.solo_state
		_reward_claimed = false
		_reward_candidates.clear()
		_show_map())
	_content.add_child(again)
