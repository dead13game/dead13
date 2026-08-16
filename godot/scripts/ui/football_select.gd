extends Control
## 足球模式选择：世界杯 / 联赛

func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.05, 0.07, 0.1)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 14)
	center.add_child(vbox)

	var title := Label.new()
	title.text = "足球模式"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 34)
	vbox.add_child(title)

	var sub := Label.new()
	sub.text = "扑克牌决胜负，先杀死对方角色者进球！"
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(sub)

	var wc_btn := Button.new()
	wc_btn.text = "🏆 世界杯（小组赛 → 淘汰赛 → 冠军）"
	wc_btn.custom_minimum_size = Vector2(360, 52)
	wc_btn.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/football/world_cup_shell.tscn"))
	vbox.add_child(wc_btn)

	var lg_btn := Button.new()
	lg_btn.text = "⚽ 英超联赛（10队双循环 18 轮）"
	lg_btn.custom_minimum_size = Vector2(360, 52)
	lg_btn.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/football/league_shell.tscn"))
	vbox.add_child(lg_btn)

	var back_btn := Button.new()
	back_btn.text = "← 返回"
	back_btn.custom_minimum_size = Vector2(360, 40)
	back_btn.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/main_menu.tscn"))
	vbox.add_child(back_btn)
