class_name CardControl
extends Control
## 卡牌组件：Kenney 牌面/牌背 + 点数角标 + 点击回调
## 用法（动态卡牌）：
##   var c := CardControl.new()
##   c.setup(card_dict, true)          # face_up
##   c.clicked.connect(_on_card)       # 可选
## 卡牌尺寸 96×96（Kenney playing-cards 贴图为 64×64 方块，按原图比例显示，不拉伸）

signal clicked(slot_idx: int)

const BASE_SIZE := Vector2(96, 96)

var _textures := CardTextures.new()
var _card: Dictionary = {}
var _face_up := true
var _slot_idx := -1

var _tex: TextureRect
var _value_label: Label
var _value_badge: PanelContainer

func _init() -> void:
	custom_minimum_size = BASE_SIZE
	size = BASE_SIZE
	_tex = TextureRect.new()
	_tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_tex.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_tex)
	# 点数角标（残盾值，可选显示）
	_value_badge = PanelContainer.new()
	LayoutRegistry.apply_to(_value_badge, "CardValueBadge", Control.PRESET_BOTTOM_WIDE)
	_value_badge.visible = false
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0, 0, 0, 0.72)
	sb.set_corner_radius_all(6)
	_value_badge.add_theme_stylebox_override("panel", sb)
	add_child(_value_badge)
	_value_label = Label.new()
	_value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_value_label.add_theme_font_size_override("font_size", 26)
	_value_badge.add_child(_value_label)
	# 点击
	gui_input.connect(func(ev: InputEvent):
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			clicked.emit(_slot_idx))

## 设置牌数据并刷新显示
func setup(card: Dictionary, face_up: bool = true, slot_idx: int = -1) -> void:
	_card = card
	_face_up = face_up
	_slot_idx = slot_idx
	_refresh()

## 牌面/牌背切换（无翻转动画，动画由外部 tween 驱动）
func set_face_up(v: bool) -> void:
	_face_up = v
	_refresh()

## 显示/隐藏点数角标（防御牌残盾值用）
func set_value_badge(value: int) -> void:
	_value_badge.visible = true
	_value_label.text = str(value)

func _refresh() -> void:
	var tex: Texture2D = _textures.get_face(_card) if _face_up else _textures.get_back()
	if tex == null:
		tex = _textures.get_back() if not _face_up else null
	if tex != null:
		_tex.texture = tex
	else:
		# 兜底：文字牌（面朝上但缺图/未知牌）
		_tex.texture = null
		var rank: String = String(_card.get("rank", "?"))
		var suit: String = String(_card.get("suit", ""))
		var l := Label.new()
		l.text = "%s%s" % [rank, suit]
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		if suit == "♥" or suit == "♦":
			l.add_theme_color_override("font_color", Color(1.0, 0.35, 0.35))
		else:
			l.add_theme_color_override("font_color", Color.WHITE)
		_tex.add_child(l)
