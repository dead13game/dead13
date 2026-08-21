class_name UniMemberSeat
extends PanelContainer
## 模拟宇宙队伍成员卡（仿 Vue uni-battle__team 的成员块）：
## 头像 + 名字 + HP条(hp/maxHp) + 技能行(冷却/✓可用/被动) + 护盾 + 阵亡变暗 + 当前行动金色高亮
## 用法：seat.setup(unit_dict, is_active, skill_line)

const GameConstants = preload("res://scripts/game/constants.gd")

const SIZE := Vector2(152, 200)

var _unit: Dictionary = {}
var _portrait: TextureRect
var _name_label: Label
var _hp_bg: ColorRect
var _hp_fill: ColorRect
var _hp_label: Label
var _skill_label: Label
var _shield_label: Label
var _dead_label: Label
var _highlight: PanelContainer

func setup(unit: Dictionary, is_active: bool, skill_line: String = "") -> void:
	_unit = unit
	custom_minimum_size = SIZE
	_build_ui()
	_refresh(is_active, skill_line)

func _build_ui() -> void:
	# 高亮环（当前行动）
	_highlight = PanelContainer.new()
	_highlight.name = "Highlight"
	_highlight.set_anchors_preset(Control.PRESET_FULL_RECT)
	_highlight.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var hl := StyleBoxFlat.new()
	hl.bg_color = Color(0, 0, 0, 0)
	hl.set_border_width_all(3)
	hl.border_color = Color(1.0, 0.85, 0.3, 0.95)
	hl.set_corner_radius_all(8)
	_highlight.add_theme_stylebox_override("panel", hl)
	_highlight.visible = false
	add_child(_highlight)
	# 主体
	var root := VBoxContainer.new()
	root.name = "Root"
	root.add_theme_constant_override("separation", 2)
	add_child(root)
	_portrait = TextureRect.new()
	_portrait.name = "Portrait"
	_portrait.custom_minimum_size = Vector2(96, 96)
	_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	root.add_child(_portrait)
	_name_label = _make_label(26, Color(0.97, 0.93, 0.85))
	_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(_name_label)
	# HP 条
	var hp_row := HBoxContainer.new()
	root.add_child(hp_row)
	_hp_bg = ColorRect.new()
	_hp_bg.name = "HPBg"
	_hp_bg.color = Color(0.15, 0.15, 0.2)
	_hp_bg.custom_minimum_size = Vector2(0, 12)
	_hp_bg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_hp_bg.clip_contents = true
	hp_row.add_child(_hp_bg)
	_hp_fill = ColorRect.new()
	_hp_fill.name = "HPFill"
	_hp_fill.color = Color(0.3, 0.75, 0.35)
	_hp_fill.size = Vector2(100, 12)
	_hp_bg.add_child(_hp_fill)
	_hp_label = _make_label(26, Color.WHITE)
	hp_row.add_child(_hp_label)
	_skill_label = _make_label(26, Color(0.6, 0.95, 0.65))
	_skill_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(_skill_label)
	_shield_label = _make_label(26, Color(0.5, 0.75, 1.0))
	_shield_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(_shield_label)
	# 阵亡
	_dead_label = _make_label(26, Color(0.9, 0.25, 0.25))
	_dead_label.text = "阵亡"
	_dead_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dead_label.set_anchors_preset(Control.PRESET_CENTER)
	_dead_label.visible = false
	_dead_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_dead_label)

func _make_label(fs: int, color: Color) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", color)
	return l

func _refresh(is_active: bool, skill_line: String = "") -> void:
	var cd: Dictionary = GameConstants.CHARACTERS.get(int(_unit.get("charId", 0)), {})
	var portrait := _load_portrait(cd.get("icon", ""))
	if portrait != null:
		_portrait.texture = portrait
	var name: String = String(_unit.get("name", cd.get("name", "?")))
	_name_label.text = ("▶ " if is_active else "") + name
	var hp: float = float(_unit.get("hp", 0))
	var max_hp: float = float(_unit.get("maxHp", 1))
	var ratio: float = clampf(hp / max_hp, 0.0, 1.0) if max_hp > 0 else 0.0
	_hp_fill.color = Color(0.85, 0.3, 0.3) if ratio < 0.3 else Color(0.3, 0.75, 0.35)
	_hp_fill.size = Vector2(_hp_bg.size.x * ratio, 12)
	_hp_label.text = " %d/%d" % [int(hp), int(max_hp)]
	_skill_label.text = skill_line
	_skill_label.visible = skill_line != ""
	var shield: float = float(_unit.get("shield", 0))
	_shield_label.text = "🛡%d" % int(shield) if shield > 0 else ""
	var alive: bool = _unit.get("alive", true)
	_dead_label.visible = not alive
	modulate.a = 0.55 if not alive else 1.0
	_highlight.visible = is_active

func _load_portrait(icon_path: String) -> Texture2D:
	if icon_path == "":
		return null
	var p := icon_path.trim_prefix("./")
	var path := "res://assets/" + p
	if not ResourceLoader.exists(path):
		return null
	return load(path) as Texture2D
