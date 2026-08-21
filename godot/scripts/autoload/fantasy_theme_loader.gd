extends Node
## 全局 Fantasy 主题加载器（亡命十三街专用）
##
## 背景：本机 Godot 4.7.1 的 Control.theme / gui/theme/custom 运行时失效；
##      ThemeDB.default_theme 合并只对 font_size 生效，stylebox/color 不生效（headless 已验证）。
## 方案：
##   1) 把 fantasy.tres 合并进 ThemeDB.default_theme —— 提供全局 26px 字号地板 + Label/Button 默认字号；
##   2) 挂 get_tree().node_added —— 所有进入树的 Button/Label（含脚本动态创建的）自动套
##      Fantasy 边框（StyleBoxTexture override）与暖色文字，已有 override 的跳过（不覆盖人工设置）。
## 效果：场景 + 脚本生成的所有按钮/标签统一 Fantasy 风，且 26px 字号下限。
## 停用：删掉 project.godot [autoload] 里的 FantasyThemeLoader 一行。

const THEME_PATH := "res://assets/themes/fantasy.tres"
const BTN_NORMAL := "res://assets/styles/fantasy_button_normal.tres"
const BTN_HOVER := "res://assets/styles/fantasy_button_hover.tres"
const BTN_PRESSED := "res://assets/styles/fantasy_button_pressed.tres"
const LE_NORMAL := "res://assets/styles/fantasy_lineedit_normal.tres"
const LE_FOCUS := "res://assets/styles/fantasy_lineedit_focus.tres"

const BTN_FONT := Color(0.97, 0.93, 0.85, 1.0)
const BTN_FONT_HOVER := Color(1.0, 0.97, 0.9, 1.0)
const LABEL_FONT := Color(0.96, 0.93, 0.86, 1.0)
const LE_PLACEHOLDER := Color(0.82, 0.78, 0.72, 1.0)

var _btn_normal: StyleBoxTexture
var _btn_hover: StyleBoxTexture
var _btn_pressed: StyleBoxTexture
var _le_normal: StyleBoxTexture
var _le_focus: StyleBoxTexture

func _ready() -> void:
	# 1) 字号地板（font_size 走 default_theme 生效）
	var t: Theme = load(THEME_PATH) as Theme
	if t != null:
		ThemeDB.get_default_theme().merge_with(t)
	# 2) 边框 + 文字色：全局 node_added 自动 override
	_btn_normal = load(BTN_NORMAL) as StyleBoxTexture
	_btn_hover = load(BTN_HOVER) as StyleBoxTexture
	_btn_pressed = load(BTN_PRESSED) as StyleBoxTexture
	_le_normal = load(LE_NORMAL) as StyleBoxTexture
	_le_focus = load(LE_FOCUS) as StyleBoxTexture
	get_tree().node_added.connect(_on_node_added)

func _on_node_added(node: Node) -> void:
	if node is Button:
		var btn := node as Button
		if not btn.has_theme_stylebox_override("normal") and _btn_normal != null:
			btn.add_theme_stylebox_override("normal", _btn_normal)
			btn.add_theme_stylebox_override("hover", _btn_hover)
			btn.add_theme_stylebox_override("pressed", _btn_pressed)
			btn.add_theme_stylebox_override("focus", _btn_hover)
		if not btn.has_theme_color_override("font_color"):
			btn.add_theme_color_override("font_color", BTN_FONT)
			btn.add_theme_color_override("font_hover_color", BTN_FONT_HOVER)
	elif node is Label:
		var lbl := node as Label
		if not lbl.has_theme_color_override("font_color"):
			lbl.add_theme_color_override("font_color", LABEL_FONT)
	elif node is LineEdit:
		var le := node as LineEdit
		if not le.has_theme_stylebox_override("normal") and _le_normal != null:
			le.add_theme_stylebox_override("normal", _le_normal)
			le.add_theme_stylebox_override("focus", _le_focus)
			le.add_theme_stylebox_override("read_only", _le_normal)
		if not le.has_theme_color_override("font_color"):
			le.add_theme_color_override("font_color", BTN_FONT)
			le.add_theme_color_override("font_placeholder_color", LE_PLACEHOLDER)
			le.add_theme_color_override("caret_color", Color.WHITE)
