extends SceneTree
## 生成按钮渐变 PNG（深蓝竖渐变 + 圆角透明角）
## 运行：godot --headless --path godot --script res://tools/gen_gradients.gd

func _initialize() -> void:
	_make("res://assets/themes/calinou_dark/btn_normal.png",
		Color(0.086, 0.16, 0.29), Color(0.039, 0.071, 0.149))   # #16294A -> #0A1226
	_make("res://assets/themes/calinou_dark/btn_hover.png",
		Color(0.114, 0.2, 0.349), Color(0.055, 0.102, 0.2))     # #1D3359 -> #0E1A33
	_make("res://assets/themes/calinou_dark/btn_pressed.png",
		Color(0.039, 0.071, 0.149), Color(0.086, 0.16, 0.29))   # 反向下深蓝（按下）
	_make("res://assets/themes/calinou_dark/btn_disabled.png",
		Color(0.07, 0.09, 0.14), Color(0.04, 0.05, 0.09))       # 去饱和暗灰蓝
	# 文本框（输入框）深红渐变
	_make("res://assets/themes/calinou_dark/input_normal.png",
		Color(0.35, 0.06, 0.06), Color(0.17, 0.02, 0.02))       # #591010 -> #2B0505
	_make("res://assets/themes/calinou_dark/input_focus.png",
		Color(0.42, 0.08, 0.08), Color(0.20, 0.03, 0.03))       # #6B1414 -> #330808
	_make("res://assets/themes/calinou_dark/input_readonly.png",
		Color(0.24, 0.05, 0.05), Color(0.12, 0.02, 0.02))       # #3D0D0D -> #1E0505
	quit(0)

func _make(path: String, top: Color, bottom: Color) -> void:
	const SIZE := 64
	const RADIUS := 10.0
	var img := Image.create(SIZE, SIZE, false, Image.FORMAT_RGBA8)
	for y in range(SIZE):
		var t := float(y) / float(SIZE - 1)
		var c := top.lerp(bottom, t)
		for x in range(SIZE):
			var cx := clampf(x + 0.5, RADIUS, SIZE - RADIUS)
			var cy := clampf(y + 0.5, RADIUS, SIZE - RADIUS)
			if Vector2(x + 0.5 - cx, y + 0.5 - cy).length() <= RADIUS:
				img.set_pixel(x, y, c)
			else:
				img.set_pixel(x, y, Color(0, 0, 0, 0))
	img.save_png(path)
	print("[gen-gradients] OK ", path)
