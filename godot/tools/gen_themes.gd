extends SceneTree
## 通用主题生成器：从调色板批量生成 assets/themes/*.tres
## 运行：godot --headless --path godot --script res://tools/gen_themes.gd
## 说明：改 PALETTES 里的颜色后重跑一次即可整体重新生成，无需手改 .tres。
## 主题目录与用法见 docs/godot-themes.md

const THEME_DIR := "res://assets/themes/"

## id → 调色板。dark=true 为深色系（浅字），false 为浅色系（深字）。
const PALETTES := {
	"night": {
		"name": "星夜默认",
		"desc": "深蓝夜空 + 鎏金边，与游戏当前默认视觉一致",
		"dark": true,
		"bg": Color(0.055, 0.075, 0.13),
		"surface": Color(0.12, 0.12, 0.18),
		"surface_hover": Color(0.16, 0.17, 0.24),
		"surface_pressed": Color(0.09, 0.09, 0.14),
		"input_bg": Color(0.075, 0.095, 0.16),
		"primary": Color(0.9, 0.7, 0.2),
		"primary_hover": Color(1.0, 0.82, 0.38),
		"primary_pressed": Color(0.7, 0.53, 0.13),
		"text": Color(0.95, 0.95, 0.97),
		"text_muted": Color(0.6, 0.63, 0.72),
		"outline": Color(0.55, 0.55, 0.65),
		"outline_alt": Color(0.32, 0.34, 0.42),
		"danger": Color(1.0, 0.35, 0.35),
		"success": Color(0.4, 0.88, 0.54),
		"warning": Color(1.0, 0.76, 0.3),
	},
	"casino": {
		"name": "黄金赌场",
		"desc": "扑克夜：墨绿桌布 + 鎏金描边，最贴合十三街的赌局气质",
		"dark": true,
		"bg": Color(0.05, 0.10, 0.06),
		"surface": Color(0.09, 0.15, 0.10),
		"surface_hover": Color(0.12, 0.20, 0.14),
		"surface_pressed": Color(0.07, 0.12, 0.08),
		"input_bg": Color(0.06, 0.12, 0.08),
		"primary": Color(0.85, 0.64, 0.25),
		"primary_hover": Color(0.94, 0.76, 0.40),
		"primary_pressed": Color(0.66, 0.48, 0.16),
		"text": Color(0.96, 0.94, 0.88),
		"text_muted": Color(0.66, 0.72, 0.65),
		"outline": Color(0.48, 0.42, 0.24),
		"outline_alt": Color(0.25, 0.32, 0.26),
		"danger": Color(0.88, 0.36, 0.30),
		"success": Color(0.43, 0.88, 0.48),
		"warning": Color(1.0, 0.76, 0.3),
	},
	"bloodmoon": {
		"name": "深渊血月",
		"desc": "暗红黑调，压迫感强，适合首领战 / 血腥主题",
		"dark": true,
		"bg": Color(0.09, 0.04, 0.05),
		"surface": Color(0.14, 0.07, 0.09),
		"surface_hover": Color(0.19, 0.09, 0.11),
		"surface_pressed": Color(0.10, 0.05, 0.06),
		"input_bg": Color(0.12, 0.06, 0.07),
		"primary": Color(0.88, 0.28, 0.29),
		"primary_hover": Color(0.95, 0.40, 0.42),
		"primary_pressed": Color(0.67, 0.19, 0.20),
		"text": Color(0.96, 0.90, 0.90),
		"text_muted": Color(0.71, 0.57, 0.59),
		"outline": Color(0.48, 0.24, 0.26),
		"outline_alt": Color(0.30, 0.18, 0.19),
		"danger": Color(1.0, 0.35, 0.35),
		"success": Color(0.62, 0.88, 0.47),
		"warning": Color(0.96, 0.70, 0.30),
	},
	"frost": {
		"name": "极寒冰原",
		"desc": "冰蓝冷色，清爽沉静，适合冰系角色 / 冰雪主题",
		"dark": true,
		"bg": Color(0.04, 0.10, 0.14),
		"surface": Color(0.07, 0.16, 0.21),
		"surface_hover": Color(0.10, 0.21, 0.27),
		"surface_pressed": Color(0.05, 0.13, 0.17),
		"input_bg": Color(0.05, 0.12, 0.16),
		"primary": Color(0.37, 0.72, 0.88),
		"primary_hover": Color(0.52, 0.80, 0.94),
		"primary_pressed": Color(0.24, 0.58, 0.74),
		"text": Color(0.92, 0.96, 0.98),
		"text_muted": Color(0.61, 0.76, 0.83),
		"outline": Color(0.35, 0.53, 0.65),
		"outline_alt": Color(0.20, 0.32, 0.40),
		"danger": Color(1.0, 0.42, 0.42),
		"success": Color(0.43, 0.91, 0.69),
		"warning": Color(1.0, 0.76, 0.3),
	},
	"inferno": {
		"name": "烈焰熔炉",
		"desc": "橙红炽热，火爆刺激，适合熔岩 / 火系主题",
		"dark": true,
		"bg": Color(0.11, 0.05, 0.03),
		"surface": Color(0.17, 0.09, 0.05),
		"surface_hover": Color(0.22, 0.12, 0.07),
		"surface_pressed": Color(0.13, 0.07, 0.04),
		"input_bg": Color(0.14, 0.07, 0.04),
		"primary": Color(0.94, 0.54, 0.24),
		"primary_hover": Color(1.0, 0.65, 0.36),
		"primary_pressed": Color(0.76, 0.40, 0.15),
		"text": Color(0.98, 0.94, 0.90),
		"text_muted": Color(0.77, 0.65, 0.55),
		"outline": Color(0.54, 0.35, 0.20),
		"outline_alt": Color(0.33, 0.22, 0.13),
		"danger": Color(1.0, 0.35, 0.27),
		"success": Color(0.49, 0.88, 0.48),
		"warning": Color(1.0, 0.76, 0.3),
	},
	"forest": {
		"name": "翠绿森林",
		"desc": "祖母绿，自然生机，适合森林 / 草系主题",
		"dark": true,
		"bg": Color(0.05, 0.09, 0.06),
		"surface": Color(0.07, 0.14, 0.10),
		"surface_hover": Color(0.10, 0.19, 0.13),
		"surface_pressed": Color(0.05, 0.11, 0.08),
		"input_bg": Color(0.06, 0.11, 0.08),
		"primary": Color(0.24, 0.74, 0.48),
		"primary_hover": Color(0.35, 0.83, 0.58),
		"primary_pressed": Color(0.17, 0.60, 0.38),
		"text": Color(0.91, 0.96, 0.93),
		"text_muted": Color(0.61, 0.72, 0.65),
		"outline": Color(0.24, 0.48, 0.35),
		"outline_alt": Color(0.15, 0.30, 0.21),
		"danger": Color(0.88, 0.34, 0.30),
		"success": Color(0.4, 0.88, 0.54),
		"warning": Color(0.96, 0.75, 0.30),
	},
	"neon": {
		"name": "赛博霓虹",
		"desc": "暗底 + 青/品红霓虹，适合科幻 / 模拟宇宙深空",
		"dark": true,
		"bg": Color(0.04, 0.04, 0.09),
		"surface": Color(0.07, 0.07, 0.13),
		"surface_hover": Color(0.10, 0.10, 0.18),
		"surface_pressed": Color(0.05, 0.05, 0.10),
		"input_bg": Color(0.05, 0.05, 0.11),
		"primary": Color(0.21, 0.88, 1.0),
		"primary_hover": Color(0.43, 0.92, 1.0),
		"primary_pressed": Color(0.14, 0.72, 0.83),
		"accent": Color(0.99, 0.31, 0.85),
		"text": Color(0.92, 0.96, 1.0),
		"text_muted": Color(0.60, 0.64, 0.77),
		"outline": Color(0.29, 0.29, 0.47),
		"outline_alt": Color(0.16, 0.16, 0.28),
		"danger": Color(1.0, 0.35, 0.54),
		"success": Color(0.43, 0.91, 0.43),
		"warning": Color(1.0, 0.82, 0.30),
	},
	"sakura": {
		"name": "樱色轻语",
		"desc": "浅色樱粉，明亮柔和，适合休闲 / 换口味",
		"dark": false,
		"bg": Color(0.98, 0.95, 0.96),
		"surface": Color(1.0, 1.0, 1.0),
		"surface_hover": Color(0.96, 0.91, 0.93),
		"surface_pressed": Color(0.93, 0.88, 0.90),
		"input_bg": Color(0.97, 0.93, 0.94),
		"primary": Color(0.91, 0.42, 0.57),
		"primary_hover": Color(0.96, 0.54, 0.68),
		"primary_pressed": Color(0.78, 0.31, 0.48),
		"text": Color(0.29, 0.23, 0.26),
		"text_muted": Color(0.54, 0.45, 0.49),
		"outline": Color(0.85, 0.71, 0.75),
		"outline_alt": Color(0.85, 0.80, 0.82),
		"danger": Color(0.85, 0.30, 0.35),
		"success": Color(0.25, 0.66, 0.42),
		"warning": Color(0.79, 0.54, 0.18),
	},
}

const DEFAULT_FONT_SIZE := 28
const THEME_IDS := ["night", "casino", "bloodmoon", "frost", "inferno", "forest", "neon", "sakura"]

func _initialize() -> void:
	DirAccess.make_dir_recursive_absolute(THEME_DIR)
	var ok := 0
	var fail := 0
	for id in THEME_IDS:
		var theme: Theme = _build_theme(PALETTES[id])
		var path: String = THEME_DIR + id + ".tres"
		var err: Error = ResourceSaver.save(theme, path)
		if err == OK:
			_fix_tres_key_order(path)  # ResourceSaver 写的条目键序运行时解析不了，纠正为 type/category/name
			print("[gen-themes] OK    ", path)
			ok += 1
		else:
			push_error("[gen-themes] FAIL  ", path, "  err=", err)
			fail += 1
	print("[gen-themes] done: ", ok, " saved, ", fail, " failed")
	quit(fail)

## ResourceSaver 在 4.7.1 会把 Theme 条目写成 name/category/type（如 normal/styles/Button），
## 运行时挂节点解析不到 → 主题静默失效。这里纠正为 type/category/name（Button/styles/normal）。
func _fix_tres_key_order(path: String) -> void:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return
	var text := f.get_as_text()
	f.close()
	var re := RegEx.new()
	re.compile(r'^(\w+)/(colors|styles|constants|font_sizes|fonts|icons)/(\w+) = ')
	var out := PackedStringArray()
	for line in text.split("\n"):
		var m := re.search(line)
		if m:
			out.append(m.get_string(3) + "/" + m.get_string(2) + "/" + m.get_string(1) + " = " + line.substr(m.get_end()))
		else:
			out.append(line)
	var fw := FileAccess.open(path, FileAccess.WRITE)
	fw.store_string("\n".join(out))
	fw.close()

# ================= 组装 =================

func _build_theme(p: Dictionary) -> Theme:
	var t := Theme.new()
	t.default_font_size = DEFAULT_FONT_SIZE

	# --- Button（游戏主力控件） ---
	var b_normal := _flat(p.surface, p.primary, 2, 6)
	var b_hover := _flat(p.surface_hover, p.primary_hover, 2, 6)
	var b_pressed := _flat(p.surface_pressed, p.primary, 2, 6)
	var b_disabled := _flat(p.surface.darkened(0.18), p.outline_alt, 1, 6)
	var b_focus := _flat(p.surface, p.primary_hover, 2, 6)
	b_focus.shadow_color = Color(p.primary_hover, 0.35)
	b_focus.shadow_size = 4
	_set_btn(t, "Button", p, b_normal, b_hover, b_pressed, b_disabled, b_focus, 32)

	# --- OptionButton（选人/难度下拉） ---
	_set_btn(t, "OptionButton", p, b_normal, b_hover, b_pressed, b_disabled, b_focus, 30)

	# --- Label ---
	t.set_color("Label", "font_color", p.text)
	t.set_color("Label", "font_outline_color", Color(p.text, 0.0))
	t.set_font_size("Label", "font_size", 28)

	# --- Panel / PanelContainer（保留 0 内边距，不扰动现有布局） ---
	var panel := _flat_pad(p.bg, p.outline, 1, 6, 0)
	var panel_container := _flat_pad(p.surface, p.outline, 1, 6, 0)
	t.set_stylebox("Panel", "panel", panel)
	t.set_stylebox("PanelContainer", "panel", panel_container)

	# --- LineEdit（起名输入） ---
	var le_normal := _flat_pad(p.input_bg, p.outline_alt, 1, 4, 10)
	var le_focus := _flat_pad(p.input_bg, p.primary_hover, 1, 4, 10)
	var le_ro := _flat_pad(p.input_bg.darkened(0.05), p.outline_alt, 1, 4, 10)
	t.set_stylebox("LineEdit", "normal", le_normal)
	t.set_stylebox("LineEdit", "focus", le_focus)
	t.set_stylebox("LineEdit", "read_only", le_ro)
	t.set_color("LineEdit", "font_color", p.text)
	t.set_color("LineEdit", "font_placeholder_color", p.text_muted)
	t.set_color("LineEdit", "font_uneditable_color", p.text_muted)
	t.set_color("LineEdit", "font_selected_color", Color.WHITE)
	t.set_color("LineEdit", "selection_color", Color(p.primary, 0.45))
	t.set_color("LineEdit", "caret_color", p.primary_hover)
	t.set_font_size("LineEdit", "font_size", 30)

	# --- SpinBox（人数，底层复用 LineEdit） ---
	t.set_color("SpinBox", "font_color", p.text)
	t.set_color("SpinBox", "font_placeholder_color", p.text_muted)
	t.set_font_size("SpinBox", "font_size", 30)

	# --- CheckBox / CheckButton（天气开关、AI 开关） ---
	t.set_color("CheckBox", "font_color", p.text)
	t.set_color("CheckBox", "font_hover_color", p.text)
	t.set_color("CheckBox", "font_pressed_color", p.text)
	t.set_color("CheckBox", "font_focus_color", p.text)
	t.set_color("CheckBox", "font_disabled_color", Color(p.text, 0.4))
	t.set_font_size("CheckBox", "font_size", 28)
	t.set_constant("CheckBox", "check_v_offset", 0)
	t.set_constant("CheckBox", "h_separation", 8)
	t.set_icon("CheckBox", "unchecked", _box_icon(false, p.outline, p.primary))
	t.set_icon("CheckBox", "checked", _box_icon(true, p.primary, p.text))
	t.set_color("CheckButton", "font_color", p.text)
	t.set_color("CheckButton", "font_hover_color", p.text)
	t.set_color("CheckButton", "font_pressed_color", p.text)
	t.set_color("CheckButton", "font_focus_color", p.text)
	t.set_color("CheckButton", "font_disabled_color", Color(p.text, 0.4))
	t.set_font_size("CheckButton", "font_size", 28)
	t.set_constant("CheckButton", "h_separation", 8)

	# --- 滚动条（日志 / 内容滚动） ---
	var track := _flat_pad(Color(p.bg, 0.0), Color(p.bg, 0.0), 0, 0, 0)
	track.bg_color = Color(p.bg.darkened(0.25), 0.6)
	var grab := _flat_pad(p.primary, Color(p.primary, 0.0), 0, 4, 0)
	var grab_h := _flat_pad(p.primary_hover, Color(p.primary_hover, 0.0), 0, 4, 0)
	var grab_p := _flat_pad(p.primary_pressed, Color(p.primary_pressed, 0.0), 0, 4, 0)
	for sb_name in ["VScrollBar", "HScrollBar"]:
		t.set_stylebox(sb_name, "scroll", track)
		t.set_stylebox(sb_name, "scroll_focus", track)
		t.set_stylebox(sb_name, "grabber", grab)
		t.set_stylebox(sb_name, "grabber_highlight", grab_h)
		t.set_stylebox(sb_name, "grabber_pressed", grab_p)
		t.set_color(sb_name, "grabber_color", p.primary)
		t.set_color(sb_name, "grabber_highlight_color", p.primary_hover)
		t.set_color(sb_name, "grabber_pressed_color", p.primary_pressed)

	# --- ProgressBar（比赛比分 / HP 条） ---
	t.set_stylebox("ProgressBar", "background", _flat_pad(p.surface, Color(p.outline, 0.5), 1, 4, 0))
	t.set_stylebox("ProgressBar", "fill", _flat_pad(p.primary, Color(p.primary, 0.0), 0, 4, 0))
	t.set_color("ProgressBar", "font_color", p.text)
	t.set_font_size("ProgressBar", "font_size", 22)

	# --- RichTextLabel（日志） ---
	t.set_color("RichTextLabel", "default_color", p.text)
	t.set_color("RichTextLabel", "font_outline_color", Color(p.text, 0.0))
	t.set_font_size("RichTextLabel", "normal_font_size", 26)

	# --- 分隔线 ---
	var hs := StyleBoxFlat.new()
	hs.bg_color = p.outline_alt
	hs.content_margin_top = 1
	hs.content_margin_bottom = 1
	t.set_stylebox("HSeparator", "separator", hs)
	t.set_stylebox("VSeparator", "separator", hs)

	# --- 提示框 ---
	t.set_stylebox("TooltipPanel", "panel", _flat_pad(p.surface, p.primary, 1, 4, 8))
	t.set_color("TooltipLabel", "font_color", p.text)
	t.set_font_size("TooltipLabel", "font_size", 22)

	_add_component_presets(t, p)

	return t

## 组件预设（type variation）：给"不想手调每个节点"的场景用。
## 用法见 docs/godot-themes.md —— 由 ThemeHelper 读取并实体化为 override
## （Godot 4.7.1 Control.theme 解析失效，见 docs/godot-themes.md "已知问题"）。
func _add_component_presets(t: Theme, p: Dictionary) -> void:
	# --- 按钮预设 ---
	var b_disabled := _flat(p.surface.darkened(0.18), p.outline_alt, 1, 6)
	var b_focus := _flat(p.surface, p.primary_hover, 2, 6)
	b_focus.shadow_color = Color(p.primary_hover, 0.35)
	b_focus.shadow_size = 4
	# 尺寸预设：仅改字号
	t.set_type_variation("ButtonSmall", "Button")
	t.set_font_size("ButtonSmall", "font_size", 26)
	t.set_type_variation("ButtonLarge", "Button")
	t.set_font_size("ButtonLarge", "font_size", 44)
	# 语义预设：描边用语义色
	t.set_type_variation("ButtonDanger", "Button")
	t.set_stylebox("ButtonDanger", "normal", _flat(p.surface, p.danger, 2, 6))
	t.set_stylebox("ButtonDanger", "hover", _flat(p.surface_hover, p.danger, 2, 6))
	t.set_stylebox("ButtonDanger", "pressed", _flat(p.surface_pressed, p.danger, 2, 6))
	t.set_stylebox("ButtonDanger", "disabled", b_disabled)
	t.set_stylebox("ButtonDanger", "focus", b_focus)
	t.set_type_variation("ButtonSuccess", "Button")
	t.set_stylebox("ButtonSuccess", "normal", _flat(p.surface, p.success, 2, 6))
	t.set_stylebox("ButtonSuccess", "hover", _flat(p.surface_hover, p.success, 2, 6))
	t.set_stylebox("ButtonSuccess", "pressed", _flat(p.surface_pressed, p.success, 2, 6))
	t.set_stylebox("ButtonSuccess", "disabled", b_disabled)
	t.set_stylebox("ButtonSuccess", "focus", b_focus)
	# --- 标签字号预设 ---
	var label_sizes := {
		"LabelTitle": 84, "LabelSection": 45, "LabelHeader": 36,
		"LabelBody": 28, "LabelSmall": 20, "LabelTiny": 18,
	}
	for name: String in label_sizes:
		t.set_type_variation(name, "Label")
		t.set_font_size(name, "font_size", label_sizes[name])
	# --- 标签颜色预设 ---
	var label_colors := {
		"LabelMuted": "text_muted", "LabelDanger": "danger",
		"LabelSuccess": "success", "LabelWarning": "warning", "LabelGold": "primary",
	}
	for name: String in label_colors:
		t.set_type_variation(name, "Label")
		t.set_color(name, "font_color", p[label_colors[name]])
	# --- 面板卡片（带内边距，PanelContainer 用） ---
	t.set_type_variation("PanelCard", "PanelContainer")
	t.set_stylebox("PanelCard", "panel", _flat_pad(p.surface, p.outline, 1, 6, 16))

func _set_btn(t: Theme, type_name: String, p: Dictionary,
		normal: StyleBoxFlat, hover: StyleBoxFlat, pressed: StyleBoxFlat,
		disabled: StyleBoxFlat, focus: StyleBoxFlat, font_size: int) -> void:
	t.set_stylebox(type_name, "normal", normal)
	t.set_stylebox(type_name, "hover", hover)
	t.set_stylebox(type_name, "pressed", pressed)
	t.set_stylebox(type_name, "disabled", disabled)
	t.set_stylebox(type_name, "focus", focus)
	t.set_color(type_name, "font_color", p.text)
	t.set_color(type_name, "font_hover_color", p.text)
	t.set_color(type_name, "font_pressed_color", p.text)
	t.set_color(type_name, "font_focus_color", p.text)
	t.set_color(type_name, "font_disabled_color", Color(p.text, 0.4))
	t.set_color(type_name, "font_outline_color", Color(p.text, 0.0))
	t.set_font_size(type_name, "font_size", font_size)

func _flat(bg: Color, border: Color, border_w: int, radius: int) -> StyleBoxFlat:
	return _flat_pad(bg, border, border_w, radius, 14)

func _flat_pad(bg: Color, border: Color, border_w: int, radius: int, pad: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(border_w)
	sb.set_corner_radius_all(radius)
	sb.set_content_margin_all(pad)
	return sb

# ================= 勾选图标（无需位图素材） =================

func _box_icon(filled: bool, box_color: Color, check_color: Color) -> ImageTexture:
	var img := Image.create(32, 32, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_round_rect(img, Rect2(3, 3, 26, 26), 5, box_color)
	if not filled:
		_fill_round_rect(img, Rect2(6, 6, 20, 20), 3, Color(0, 0, 0, 0))
	else:
		_draw_line(img, Vector2(8, 17), Vector2(13, 22), check_color, 3.0)
		_draw_line(img, Vector2(13, 22), Vector2(23, 10), check_color, 3.0)
	return ImageTexture.create_from_image(img)

func _fill_round_rect(img: Image, rect: Rect2, radius: float, c: Color) -> void:
	for y in range(int(rect.position.y), int(rect.end.y)):
		for x in range(int(rect.position.x), int(rect.end.x)):
			if x < 0 or y < 0 or x >= img.get_width() or y >= img.get_height():
				continue
			var cx := clampf(x + 0.5, rect.position.x + radius, rect.end.x - radius)
			var cy := clampf(y + 0.5, rect.position.y + radius, rect.end.y - radius)
			if Vector2(x + 0.5 - cx, y + 0.5 - cy).length() <= radius:
				img.set_pixel(x, y, c)

func _draw_line(img: Image, a: Vector2, b: Vector2, c: Color, w: float) -> void:
	var steps := int(a.distance_to(b) * 2.0) + 1
	var half := int(w / 2.0)
	for i in steps:
		var p: Vector2 = a.lerp(b, float(i) / float(steps - 1 if steps > 1 else 1))
		for dx in range(-half, half + 1):
			for dy in range(-half, half + 1):
				var px := int(p.x) + dx
				var py := int(p.y) + dy
				if px >= 0 and py >= 0 and px < img.get_width() and py < img.get_height():
					img.set_pixel(px, py, c)
