extends SceneTree
## 主题资源自测：加载 assets/themes/*.tres 校验结构 + ThemeHelper 换肤助手
## 运行：godot --headless --path godot --script res://tests/test_themes.gd

const ThemeHelper = preload("res://scripts/ui/theme_helper.gd")
const THEME_DIR := "res://assets/themes/"

var _failures: int = 0

func _initialize() -> void:
	for id in ThemeHelper.THEME_IDS:
		_test_theme(id)
	_test_helper()
	if _failures == 0:
		print("PASS: all theme tests")
	else:
		push_error("FAIL: %d theme test(s) failed" % _failures)
	quit(_failures)

func _check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok - ", msg)
	else:
		_failures += 1
		push_error("  FAIL - " + msg)

func _test_theme(id: String) -> void:
	print("theme:", id)
	var t: Theme = load(THEME_DIR + id + ".tres")
	_check(t != null, "load " + id + ".tres")
	if t == null:
		return
	# Button 五态
	_check(t.get_stylebox("Button", "normal") != null, "Button/normal")
	_check(t.get_stylebox("Button", "hover") != null, "Button/hover")
	_check(t.get_stylebox("Button", "pressed") != null, "Button/pressed")
	_check(t.get_stylebox("Button", "disabled") != null, "Button/disabled")
	_check(t.get_stylebox("Button", "focus") != null, "Button/focus")
	_check(t.get_color("Button", "font_color") != null, "Button/font_color")
	_check(t.get_font_size("Button", "font_size") > 0, "Button/font_size")
	# 面板 / 容器
	_check(t.get_stylebox("Panel", "panel") != null, "Panel/panel")
	_check(t.get_stylebox("PanelContainer", "panel") != null, "PanelContainer/panel")
	# 输入控件
	_check(t.get_stylebox("LineEdit", "normal") != null, "LineEdit/normal")
	_check(t.get_stylebox("LineEdit", "focus") != null, "LineEdit/focus")
	_check(t.get_stylebox("OptionButton", "hover") != null, "OptionButton/hover")
	_check(t.get_color("SpinBox", "font_color") != null, "SpinBox/font_color")
	# 勾选框图标（无位图素材也能画）
	_check(t.get_icon("CheckBox", "checked") != null, "CheckBox/checked icon")
	_check(t.get_icon("CheckBox", "unchecked") != null, "CheckBox/unchecked icon")
	# 滚动条
	_check(t.get_stylebox("VScrollBar", "grabber") != null, "VScrollBar/grabber")
	_check(t.get_stylebox("HScrollBar", "grabber_highlight") != null, "HScrollBar/grabber_highlight")
	# 其他
	_check(t.get_stylebox("ProgressBar", "fill") != null, "ProgressBar/fill")
	_check(t.get_color("RichTextLabel", "default_color") != null, "RichTextLabel/default_color")
	_check(t.get_stylebox("TooltipPanel", "panel") != null, "TooltipPanel/panel")

func _test_helper() -> void:
	print("ThemeHelper")
	_check(ThemeHelper.THEME_IDS.size() == 8, "8 themes registered")
	# apply 到 Control 树：子 Button 能取到主题色
	var root := Control.new()
	var btn := Button.new()
	root.add_child(btn)
	var ok: bool = ThemeHelper.apply(root, "night")
	_check(ok, "apply(root, night) returns true")
	_check(root.theme != null, "root.theme assigned")
	_check(btn.get_theme_color("font_color", "Button") != null, "child Button sees theme color")
	# apply 到非 Control 根（场景根）
	var node_root := Node.new()
	node_root.add_child(Control.new())
	ok = ThemeHelper.apply(node_root, "casino")
	_check(ok, "apply(non-Control root) works")
	# 不存在的主题
	ok = ThemeHelper.apply(root, "not_a_theme")
	_check(not ok, "unknown theme returns false")
	root.queue_free()
	node_root.queue_free()
