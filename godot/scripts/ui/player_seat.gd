class_name PlayerSeat
extends PanelContainer
## 角色牌桌（复现 Vue PlayerTableSprite）：
## 立绘 + 名字/角色/技能 + HP条 + 状态 + 防御牌阵 + 陷阱/诱饵 + 当前回合高亮 + 阵亡标记
## 座位是动态内容（2-8 人重建），代码构建；卡牌用 Kenney 素材。

signal seat_clicked(player_index: int)

const SEAT_SIZE := Vector2(310, 236)
const PORTRAIT := Vector2(88, 118)

var _idx := -1
var _player: Dictionary = {}
var _is_current := false

var _portrait: TextureRect
var _name_label: Label
var _char_label: Label
var _status_label: Label
var _hp_bg: ColorRect
var _hp_fill: ColorRect
var _hp_label: Label
var _def_row: HBoxContainer
var _trap_card: CardControl
var _bait_card: CardControl
var _dead_label: Label
var _highlight: PanelContainer
var _hl_tween: Tween = null

# ── 构建 ──

func setup(player: Dictionary) -> void:
	_idx = int(player.get("index", 0))
	_player = player
	custom_minimum_size = SEAT_SIZE
	_build_ui()
	update_player(player, false)

func _build_ui() -> void:
	# 边框（当前回合高亮用）
	_highlight = PanelContainer.new()
	_highlight.name = "Highlight"
	_highlight.set_anchors_preset(Control.PRESET_FULL_RECT)
	_highlight.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var hl := StyleBoxFlat.new()
	hl.bg_color = Color(0, 0, 0, 0)
	hl.set_border_width_all(3)
	hl.border_color = Color(0.3, 0.6, 1.0, 0.9)
	hl.set_corner_radius_all(8)
	_highlight.add_theme_stylebox_override("panel", hl)
	_highlight.visible = false
	add_child(_highlight)
	# 主体
	var root := VBoxContainer.new()
	root.name = "Root"
	root.add_theme_constant_override("separation", 2)
	add_child(root)
	# 上：立绘 + 信息
	var top := HBoxContainer.new()
	top.name = "InfoRow"
	top.add_theme_constant_override("separation", 8)
	root.add_child(top)
	_portrait = TextureRect.new()
	_portrait.name = "Portrait"
	_portrait.custom_minimum_size = PORTRAIT
	_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	top.add_child(_portrait)
	var info := VBoxContainer.new()
	info.name = "InfoBox"
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(info)
	_name_label = _make_label(26, Color(1, 0.85, 0.3), true)
	_name_label.clip_text = true
	info.add_child(_name_label)
	_char_label = _make_label(26, Color(0.8, 0.82, 0.9), false)
	_char_label.clip_text = true
	info.add_child(_char_label)
	# HP 条
	var hp_row := HBoxContainer.new()
	info.add_child(hp_row)
	_hp_bg = ColorRect.new()
	_hp_bg.name = "HPBg"
	_hp_bg.color = Color(0.15, 0.15, 0.2)
	_hp_bg.custom_minimum_size = Vector2(120, 12)
	_hp_bg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_hp_bg.clip_contents = true
	hp_row.add_child(_hp_bg)
	_hp_fill = ColorRect.new()
	_hp_fill.name = "HPFill"
	_hp_fill.color = Color(0.3, 0.75, 0.35)
	_hp_fill.size = Vector2(120, 12)
	_hp_bg.add_child(_hp_fill)
	_hp_label = _make_label(26, Color.WHITE, false)
	hp_row.add_child(_hp_label)
	_status_label = _make_label(26, Color(1, 0.6, 0.4), false)
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_child(_status_label)
	# 下：防御阵 + 陷阱/诱饵
	var bottom := HBoxContainer.new()
	bottom.name = "BottomRow"
	bottom.add_theme_constant_override("separation", 6)
	root.add_child(bottom)
	_def_row = HBoxContainer.new()
	_def_row.name = "DefenseRow"
	_def_row.add_theme_constant_override("separation", 2)
	bottom.add_child(_def_row)
	_trap_card = _make_small_card()
	bottom.add_child(_trap_card)
	_bait_card = _make_small_card()
	bottom.add_child(_bait_card)
	# 阵亡
	_dead_label = Label.new()
	_dead_label.name = "DeadLabel"
	_dead_label.text = "阵亡"
	_dead_label.add_theme_font_size_override("font_size", 26)
	_dead_label.add_theme_color_override("font_color", Color(0.9, 0.25, 0.25))
	_dead_label.set_anchors_preset(Control.PRESET_CENTER)
	_dead_label.visible = false
	_dead_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_dead_label)
	# 点击
	gui_input.connect(func(ev: InputEvent):
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			seat_clicked.emit(_idx))

func _make_label(fs: int, color: Color, bold: bool) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", color)
	return l

func _make_small_card() -> CardControl:
	var c := CardControl.new()
	c.scale = Vector2(0.55, 0.55)
	c.size = Vector2(96, 96)
	return c

# ── 刷新 ──

func update_player(player: Dictionary, is_current: bool) -> void:
	_player = player
	_is_current = is_current
	var alive: bool = player.get("alive", true)
	var cd: Dictionary = GameConstants.get_char_data(player)
	var portrait := _load_portrait(cd.get("icon", ""))
	if portrait != null:
		_portrait.texture = portrait
	_name_label.text = ("▶ " if is_current else "") + str(player.get("name", "?"))
	_char_label.text = "%s · %s" % [cd.get("name", "?"), cd.get("skillName", "")]
	_update_hp()
	_refresh_defense()
	_refresh_trap()
	_refresh_status()
	_highlight.visible = is_current
	if is_current:
		_pulse_highlight()
	_dead_label.visible = not alive
	modulate.a = 0.6 if not alive else 1.0

func _update_hp() -> void:
	var hp: float = float(_player.get("hp", 0))
	var max_hp: float = float(_player.get("maxHp", 1))
	var ratio: float = clampf(hp / max_hp, 0.0, 1.0) if max_hp > 0 else 0.0
	var w := _hp_bg.size.x * ratio
	_hp_fill.color = Color(0.85, 0.3, 0.3) if ratio < 0.3 else Color(0.3, 0.75, 0.35)
	var tw := create_tween()
	tw.tween_property(_hp_fill, "size", Vector2(w, _hp_fill.size.y), 0.35) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_hp_label.text = "HP %d/%d" % [int(_player.get("hp", 0)), int(max_hp)]

func _refresh_defense() -> void:
	for child in _def_row.get_children():
		child.queue_free()
	var pile: Array = _player.get("defensePile", [])
	for i in range(mini(pile.size(), 4)):
		var c := CardControl.new()
		c.setup(pile[i], true)
		c.scale = Vector2(0.5, 0.5)
		c.size = Vector2(96, 96)
		var dv: Variant = pile[i].get("defenseValue", pile[i].get("value"))
		if dv != null:
			c.set_value_badge(int(dv))
		_def_row.add_child(c)

func _refresh_trap() -> void:
	var trap: Variant = _player.get("trap")
	var bait: Variant = _player.get("bait")
	_trap_card.setup(trap if trap != null else {}, false)
	_bait_card.setup(bait if bait != null else {}, true)

func _refresh_status() -> void:
	var se: Dictionary = _player.get("statusEffects", {})
	var rel: Dictionary = _player.get("relations", {})
	var tags: PackedStringArray = []
	if se.get("frozenBy") != null: tags.append("冻结")
	if rel.get("allyIndex") != null: tags.append("联盟")
	if int(rel.get("betrayalPenalty", 0)) > 0: tags.append("背刺惩罚")
	if int(_player.get("fightingSpirit", 0)) > 0: tags.append("斗志%d" % _player.get("fightingSpirit"))
	if se.get("stealTarget") != null: tags.append("偷牌中")
	if se.get("dotTarget") != null: tags.append("DoT")
	if rel.get("gamblePenalty", false): tags.append("赌命惩罚")
	if se.get("savepoint") != null: tags.append("存档")
	if _player.get("isAI", false): tags.append("AI")
	_status_label.text = " · ".join(tags)

# ── 动画（Vue 对应：受伤闪白 / 死亡 / 击穿抖动 / 高亮脉动） ──

func play_hurt() -> void:
	modulate.a = 0.25
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 1.0, 0.4).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

func play_death() -> void:
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 0.3, 0.6).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)

func shake() -> void:
	var orig := position
	var tw := create_tween()
	tw.tween_property(self, "position", orig + Vector2(6, 0), 0.07)
	tw.tween_property(self, "position", orig - Vector2(6, 0), 0.07)
	tw.tween_property(self, "position", orig + Vector2(3, 0), 0.05)
	tw.tween_property(self, "position", orig, 0.05)

func _pulse_highlight() -> void:
	var hl: StyleBoxFlat = _highlight.get_theme_stylebox("panel") as StyleBoxFlat
	if hl == null: return
	# 座位复用后同一节点会反复刷新：先杀掉旧循环 tween，避免叠加打架
	if _hl_tween != null and _hl_tween.is_valid():
		_hl_tween.kill()
	_hl_tween = create_tween().set_loops()
	_hl_tween.tween_method(func(a: float): hl.border_color = Color(0.3, 0.6, 1.0, a), 0.25, 0.9, 1.2) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_hl_tween.tween_interval(0.1)

func _load_portrait(icon_path: String) -> Texture2D:
	if icon_path == "": return null
	# "./images/温迪.jpg" → "res://assets/images/温迪.jpg"
	var p := icon_path.trim_prefix("./")
	var path := "res://assets/" + p
	if not ResourceLoader.exists(path): return null
	return load(path) as Texture2D
