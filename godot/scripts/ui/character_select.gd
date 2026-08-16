extends Control
## 经典模式选人界面（Godot 版）
## 纯功能 UI：玩家人数 / 角色 / AI 难度 / 天气 → 开始游戏

const GameConstants = preload("res://scripts/game/constants.gd")

var _player_count: SpinBox
var _weather_check: CheckBox
var _players_box: VBoxContainer
var _rows: Array = []  # 每项: {char_option, ai_check, diff_option, name_edit}
var _start_button: Button

func _ready() -> void:
	_build_ui()
	_rebuild_rows()

# ===== UI 构建 =====

func _build_ui() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.07, 0.07, 0.11)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	for side in ["margin_left", "margin_top", "margin_right", "margin_bottom"]:
		margin.set(side, 28)
	add_child(margin)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 14)
	margin.add_child(vbox)

	var title := Label.new()
	title.text = "亡命十三街 · 经典对战"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 34)
	vbox.add_child(title)

	# 人数 + 天气
	var count_row := HBoxContainer.new()
	count_row.add_theme_constant_override("separation", 10)
	vbox.add_child(count_row)

	var count_label := Label.new()
	count_label.text = "玩家人数"
	count_label.custom_minimum_size = Vector2(90, 0)
	count_row.add_child(count_label)

	_player_count = SpinBox.new()
	_player_count.min_value = 2
	_player_count.max_value = 8
	_player_count.value = 4
	_player_count.custom_minimum_size = Vector2(70, 0)
	_player_count.value_changed.connect(func(_v): _rebuild_rows())
	count_row.add_child(_player_count)

	_weather_check = CheckBox.new()
	_weather_check.text = "启用天气"
	_weather_check.button_pressed = false
	count_row.add_child(_weather_check)

	# 玩家列表
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vbox.add_child(scroll)

	_players_box = VBoxContainer.new()
	_players_box.add_theme_constant_override("separation", 8)
	scroll.add_child(_players_box)

	_start_button = Button.new()
	_start_button.text = "开始游戏"
	_start_button.custom_minimum_size = Vector2(0, 48)
	_start_button.add_theme_font_size_override("font_size", 22)
	_start_button.pressed.connect(_on_start)
	vbox.add_child(_start_button)

func _rebuild_rows() -> void:
	for child in _players_box.get_children():
		child.queue_free()
	_rows.clear()
	var count: int = int(_player_count.value) if _player_count != null else 4
	for i in range(count):
		_rows.append(_make_row(i))

func _make_row(i: int) -> Dictionary:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_players_box.add_child(row)

	var name_edit := LineEdit.new()
	name_edit.placeholder_text = "玩家%d" % (i + 1)
	name_edit.custom_minimum_size = Vector2(110, 0)
	row.add_child(name_edit)

	var char_option := OptionButton.new()
	char_option.custom_minimum_size = Vector2(190, 0)
	# 角色 1-11（12 是开发者测试角色，仅模拟宇宙可选）
	for cid in range(1, 12):
		var cdata: Dictionary = GameConstants.CHARACTERS.get(cid, {})
		if cdata.is_empty():
			continue
		char_option.add_item("%s（%s）" % [cdata.get("name", "?"), cdata.get("title", "?")], cid)
		if i == 0 and cid == 1:
			char_option.select(char_option.item_count - 1)
		elif i == 1 and cid == 2:
			char_option.select(char_option.item_count - 1)
		elif i == 2 and cid == 3:
			char_option.select(char_option.item_count - 1)
		elif i == 3 and cid == 4:
			char_option.select(char_option.item_count - 1)
	row.add_child(char_option)

	var ai_check := CheckButton.new()
	ai_check.text = "AI"
	ai_check.button_pressed = i > 0  # 默认玩家1是人类，其余 AI
	row.add_child(ai_check)

	var diff_option := OptionButton.new()
	diff_option.add_item("简单", 0)
	diff_option.add_item("熟练", 1)
	diff_option.add_item("地狱", 2)
	diff_option.visible = ai_check.button_pressed
	ai_check.toggled.connect(func(on: bool): diff_option.visible = on)
	row.add_child(diff_option)

	return {
		"name_edit": name_edit,
		"char_option": char_option,
		"ai_check": ai_check,
		"diff_option": diff_option,
	}

# ===== 开始游戏 =====

func _on_start() -> void:
	var char_ids: Array = []
	var ai_flags: Array = []
	var difficulties: Array = []
	for row in _rows:
		var cid: int = row["char_option"].get_selected_id()
		if cid <= 0:
			cid = 1
		char_ids.append(cid)
		ai_flags.append(row["ai_check"].button_pressed)
		var diff_idx: int = row["diff_option"].selected
		var diff: String = "easy"
		if diff_idx == 1:
			diff = "skilled"
		elif diff_idx == 2:
			diff = "hell"
		difficulties.append(diff)

	GameManager.new_classic_game(char_ids, _weather_check.button_pressed, char_ids.size())

	# 设置名称 / AI 标记 / 难度（init_game 已按 speed 重排，按 characterId 匹配）
	for i in range(GameManager.state["players"].size()):
		var p: Dictionary = GameManager.state["players"][i]
		var cid: int = int(p.get("characterId", 0))
		# 找到该角色在配置中的序号（允许重复角色时取第一个未用的）
		for j in range(char_ids.size()):
			if int(char_ids[j]) == cid:
				var name_text: String = row_name(j)
				if not name_text.is_empty():
					p["name"] = name_text
				p["isAI"] = ai_flags[j]
				p["aiDifficulty"] = difficulties[j]
				char_ids[j] = -1  # 标记已用
				break

	get_tree().change_scene_to_file("res://scenes/classic/game_table.tscn")

func row_name(i: int) -> String:
	if i < _rows.size():
		var edit: LineEdit = _rows[i]["name_edit"]
		var t: String = edit.text.strip_edges()
		if t.is_empty():
			return ""
		return t
	return ""
