extends Control
## 足球模式选择：世界杯 / 联赛
## 骨架区块（TopBar/ContentPanel）在 tscn 中，动态内容在此填充

@onready var _back_btn: Button = find_child("BackBtn", true, false) as Button
@onready var _title: Label = %TitleLabel
@onready var _content: VBoxContainer = %ContentBox

func _ready() -> void:
	_ensure_nodes()
	_bind_back()
	_build_content()

## 场景节点缺失时降级：代码兜底创建（编辑器里搭一半也能跑）
func _ensure_nodes() -> void:
	if _title == null:
		_title = Label.new()
		_title.text = "足球模式"
		_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_title.add_theme_font_size_override("font_size", 45)
		add_child(_title)
	if _content == null:
		_content = VBoxContainer.new()
		_content.add_theme_constant_override("separation", 21)
		var scroll := ScrollContainer.new()
		scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
		add_child(scroll)
		scroll.add_child(_content)

## 绑定返回按钮（场景缺 BackBtn 时兜底创建）
func _bind_back() -> void:
	if _back_btn == null:
		_back_btn = Button.new()
		_back_btn.text = "← 返回"
		add_child(_back_btn)
	if not _back_btn.pressed.is_connected(_on_back):
		_back_btn.pressed.connect(_on_back)

func _on_back() -> void:
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")

func _build_content() -> void:
	_title.text = "足球模式"

	var sub := Label.new()
	sub.text = "扑克牌决胜负，先杀死对方角色者进球！"
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_content.add_child(sub)

	_content.add_child(_spacer())

	var wc_btn := Button.new()
	wc_btn.text = "🏆 世界杯（小组赛 → 淘汰赛 → 冠军）"
	wc_btn.custom_minimum_size = Vector2(0, 78)
	wc_btn.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/football/world_cup_shell.tscn"))
	_content.add_child(wc_btn)

	var lg_btn := Button.new()
	lg_btn.text = "⚽ 英超联赛（10队双循环 18 轮）"
	lg_btn.custom_minimum_size = Vector2(0, 78)
	lg_btn.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/football/league_shell.tscn"))
	_content.add_child(lg_btn)

## 空白占位
func _spacer(h: int = 24) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h)
	return c
