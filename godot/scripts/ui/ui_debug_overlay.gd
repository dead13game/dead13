extends CanvasLayer
## ============================================================================
## 运行时 UI 调试浮层 —— 新 UI 摆放工作流的「读节点名」入口（给人类自己开游戏用）
##
## 用法（进游戏后按 F1）：
##   - 悬停任意控件：白色细框高亮 + 顶部信息条实时显示 节点名/类型/rect
##   - 点击列表某一行：青色粗框选中，并把一行「节点名|场景|rect」复制进剪贴板
##   - 把这行直接发给「UI 调参子代理」即可（它用 ui_adjust.gd 改布局）
##   - F1 再按一次关闭
##
## 说明：
##   - 只读不改，不拦截游戏输入（浮层开着时面板区域会挡住其下方点击，属预期）
##   - headless / CI 下自动禁用，不影响测试
##   - 展示的是运行时真实 rect（含容器排布），比编辑器里的锚点数值更贴近所见
## ============================================================================

const TOGGLE_KEY := KEY_F1

var _open := false
var _panel: PanelContainer
var _rows_box: VBoxContainer
var _hint_label: Label
var _highlight: Control
var _hovered: Control = null
var _selected: Control = null

func _ready() -> void:
	if DisplayServer.get_name() == "headless":
		set_process(false)
		set_process_unhandled_input(false)
		return
	layer = 100
	process_mode = Node.PROCESS_MODE_ALWAYS
	name = "UiDebugOverlay"
	_build_ui()
	visible = false

func _build_ui() -> void:
	# 高亮层（垫底，不挡鼠标）
	_highlight = Control.new()
	_highlight.name = "Highlight"
	_highlight.set_anchors_preset(Control.PRESET_FULL_RECT)
	_highlight.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_highlight.draw.connect(_on_highlight_draw)
	add_child(_highlight)

	# 面板（右缘，宽 430）
	_panel = PanelContainer.new()
	_panel.name = "DebugPanel"
	_panel.set_anchors_preset(Control.PRESET_RIGHT_WIDE)
	_panel.anchor_left = 1.0
	_panel.anchor_right = 1.0
	_panel.anchor_top = 0.0
	_panel.anchor_bottom = 1.0
	_panel.offset_left = -430.0
	_panel.offset_right = 0.0
	_panel.offset_top = 0.0
	_panel.offset_bottom = 0.0
	_panel.add_theme_stylebox_override("panel", _make_style())
	add_child(_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 6)
	_panel.add_child(vbox)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 12)
	vbox.add_child(top)
	var title := Label.new()
	title.text = "UI 调试 (F1 关闭)"
	title.add_theme_font_size_override("font_size", 28)
	top.add_child(title)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(spacer)
	var refresh := Button.new()
	refresh.text = "刷新"
	refresh.pressed.connect(_rebuild_rows)
	top.add_child(refresh)
	var copy := Button.new()
	copy.text = "复制选中"
	copy.pressed.connect(func(): _copy_line(true))
	top.add_child(copy)

	_hint_label = Label.new()
	_hint_label.add_theme_font_size_override("font_size", 26)
	_hint_label.text = "悬停查看控件，点列表行选中并复制"
	_hint_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hint_label.custom_minimum_size = Vector2(0, 64)
	vbox.add_child(_hint_label)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	vbox.add_child(scroll)
	_rows_box = VBoxContainer.new()
	_rows_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rows_box.add_theme_constant_override("separation", 2)
	scroll.add_child(_rows_box)

## 半透明深色底，便于看清浮层内容
func _make_style() -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.05, 0.06, 0.12, 0.92)
	sb.set_border_width_all(2)
	sb.border_color = Color(0.9, 0.7, 0.2, 1.0)
	sb.set_corner_radius_all(6)
	return sb

# ---------------------------------------------------------------- 输入

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == TOGGLE_KEY:
		_open = not _open
		visible = _open
		if _open:
			_selected = null
			_hovered = null
			_rebuild_rows()
			_update_hint()
		get_viewport().set_input_as_handled()

func _process(_delta: float) -> void:
	if not _open:
		return
	var mp := get_viewport().get_mouse_position()
	var controls := _collect()
	var hit: Control = null
	for i in range(controls.size() - 1, -1, -1):
		var c := controls[i] as Control
		if not c.visible:
			continue
		if c.get_global_rect().has_point(mp):
			hit = c
			break
	if hit != _hovered:
		_hovered = hit
		_update_hint()
		_highlight.queue_redraw()

# ---------------------------------------------------------------- 数据

func _collect() -> Array:
	var arr := []
	var root := get_tree().current_scene
	if root != null:
		_walk(root, arr)
	return arr

func _walk(n: Node, arr: Array) -> void:
	for c in n.get_children():
		if c is Control:
			arr.append(c)
		_walk(c, arr)

func _row_text(c: Control) -> String:
	var r := c.get_global_rect()
	var mark := "%" if c.unique_name_in_owner else " "
	var in_con := " [容器:%s]" % c.get_parent().get_class() if c.get_parent() is Container else ""
	return "%s %s (%s%s)  x=%d y=%d w=%d h=%d%s" % [
		mark, c.name, c.get_class(), "", int(r.position.x), int(r.position.y), int(r.size.x), int(r.size.y), in_con]

func _rect_str(c: Control) -> String:
	var r := c.get_global_rect()
	return "全局(x=%d,y=%d,w=%d,h=%d) 锚(l=%.2f,t=%.2f,r=%.2f,b=%.2f) 偏移(l=%d,t=%d,r=%d,b=%d)" % [
		int(r.position.x), int(r.position.y), int(r.size.x), int(r.size.y),
		c.anchor_left, c.anchor_top, c.anchor_right, c.anchor_bottom,
		int(c.offset_left), int(c.offset_top), int(c.offset_right), int(c.offset_bottom)]

func _rebuild_rows() -> void:
	for ch in _rows_box.get_children():
		ch.queue_free()
	var controls := _collect()
	# 显示列表按名字字典序（自然序、忽略大小写）；悬停命中的 _collect() 仍保持树序（用于 z 序判定）
	controls.sort_custom(func(a: Control, b: Control) -> bool:
		return String(a.name).naturalnocasecmp_to(String(b.name)) < 0)
	for c in controls:
		var b := Button.new()
		b.text = _row_text(c)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.custom_minimum_size = Vector2(0, 42)
		b.add_theme_font_size_override("font_size", 26)
		b.pressed.connect(func(): _select(c))
		_rows_box.add_child(b)
	_hint_label.text = "共 %d 个控件。悬停查看，点行选中并复制" % controls.size()

func _select(c: Control) -> void:
	_selected = c
	_highlight.queue_redraw()
	var line := _copy_line(true)
	if line != "":
		_hint_label.text = "已复制:\n" + line

## 复制「节点|场景|rect」一行到剪贴板。force=true 时无选中也复制悬停项。
func _copy_line(force: bool) -> String:
	var c := _selected if _selected != null else (_hovered if force else null)
	if c == null:
		return ""
	var scene_path := ""
	var sc := get_tree().current_scene
	if sc != null and sc.scene_file_path != "":
		scene_path = sc.scene_file_path
	var line := "UI节点: %s | 场景: %s | %s" % [c.name, scene_path, _rect_str(c)]
	DisplayServer.clipboard_set(line)
	return line

func _update_hint() -> void:
	if _hovered == null:
		if _hint_label.text.begins_with("已复制") or _hint_label.text.begins_with("共 "):
			return
		_hint_label.text = "悬停查看控件，点列表行选中并复制"
		return
	var r := _hovered.get_global_rect()
	_hint_label.text = "%s (%s)  x=%d y=%d w=%d h=%d\n%s" % [
		_hovered.name, _hovered.get_class(),
		int(r.position.x), int(r.position.y), int(r.size.x), int(r.size.y), _rect_str(_hovered)]

# ---------------------------------------------------------------- 绘制

func _on_highlight_draw() -> void:
	if _selected != null and is_instance_valid(_selected):
		_draw_box(_selected.get_global_rect(), Color(0.3, 0.85, 1.0, 0.95), 3)
	if _hovered != null and _hovered != _selected and is_instance_valid(_hovered):
		_draw_box(_hovered.get_global_rect(), Color(1, 1, 1, 0.6), 2)

func _draw_box(rect: Rect2, col: Color, w: int) -> void:
	_highlight.draw_rect(rect.grow(2), Color(col, 0.10), true)
	_highlight.draw_rect(rect.grow(2), col, false, w)
