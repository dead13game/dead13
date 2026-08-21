class_name LayoutRegistry
## ============================================================================
## 脚本动态生成 UI 的「布局单一真源」—— 新 UI 摆放工作流的一等公民。
##
## 背景：动态创建且需要绝对定位的节点（代码里 new 出来 set_anchors_preset/offset 的那种），
## 编辑器拖不到，以前只能翻代码改数值，人机沟通成本高。
## 现在：这类节点的位置/尺寸一律从本注册表读取（数据在 layout_registry.json），
## 人类要调时走 ui_adjust.gd 的 registry 模式改 JSON，不翻代码、不重编译。
##
## 用法（动态 UI 创建处，替换原来的 set_anchors_preset + offset 硬编码）:
##   var panel := PanelContainer.new()
##   LayoutRegistry.apply_to(panel, "UniTeamPanel", Control.PRESET_TOP_WIDE)
##
## 约定：
##   - 注册表条目 = {preset, anchor_*, offset_*}，preset 用于还原 grow 等行为
##   - 条目缺失时回退 fallback_preset（场景搭一半也能跑）
##   - 只在「动态创建 + 绝对定位」的节点上用；容器子节点不用（容器自动排）
## ============================================================================

static var _data: Dictionary = {}
static var _loaded := false

static func _ensure() -> void:
	if _loaded:
		return
	_loaded = true
	var path := "res://scripts/ui/layout_registry.json"
	if not FileAccess.file_exists(path):
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if parsed is Dictionary:
		_data = parsed

## 取某条目的 rect 字典（不存在返回空）
static func rect(name: String) -> Dictionary:
	_ensure()
	var rects: Dictionary = _data.get("rects", {})
	return (rects.get(name, {}) as Dictionary).duplicate(true)

static func has(name: String) -> bool:
	_ensure()
	return _data.get("rects", {}).has(name)

## 把注册表条目应用到控件；缺失时回退 fallback_preset。返回是否命中注册表。
static func apply_to(c: Control, name: String, fallback_preset: int = -1) -> bool:
	var e := rect(name)
	if e.is_empty():
		if fallback_preset >= 0:
			c.set_anchors_preset(fallback_preset)
		return false
	if e.has("preset"):
		var preset := _preset_id(String(e["preset"]))
		if preset >= 0:
			c.set_anchors_preset(preset)
	elif fallback_preset >= 0:
		c.set_anchors_preset(fallback_preset)
	c.anchor_left = float(e.get("anchor_left", c.anchor_left))
	c.anchor_top = float(e.get("anchor_top", c.anchor_top))
	c.anchor_right = float(e.get("anchor_right", c.anchor_right))
	c.anchor_bottom = float(e.get("anchor_bottom", c.anchor_bottom))
	c.offset_left = float(e.get("offset_left", c.offset_left))
	c.offset_top = float(e.get("offset_top", c.offset_top))
	c.offset_right = float(e.get("offset_right", c.offset_right))
	c.offset_bottom = float(e.get("offset_bottom", c.offset_bottom))
	return true

static func _preset_id(name: String) -> int:
	match name:
		"TOP_LEFT": return Control.PRESET_TOP_LEFT
		"TOP_RIGHT": return Control.PRESET_TOP_RIGHT
		"TOP_WIDE": return Control.PRESET_TOP_WIDE
		"BOTTOM_LEFT": return Control.PRESET_BOTTOM_LEFT
		"BOTTOM_RIGHT": return Control.PRESET_BOTTOM_RIGHT
		"BOTTOM_WIDE": return Control.PRESET_BOTTOM_WIDE
		"CENTER": return Control.PRESET_CENTER
		"CENTER_TOP": return Control.PRESET_CENTER_TOP
		"CENTER_LEFT": return Control.PRESET_CENTER_LEFT
		"CENTER_RIGHT": return Control.PRESET_CENTER_RIGHT
		"CENTER_BOTTOM": return Control.PRESET_CENTER_BOTTOM
		"LEFT_WIDE": return Control.PRESET_LEFT_WIDE
		"RIGHT_WIDE": return Control.PRESET_RIGHT_WIDE
		"VCENTER_WIDE": return Control.PRESET_VCENTER_WIDE
		"HCENTER_WIDE": return Control.PRESET_HCENTER_WIDE
		"FULL_RECT": return Control.PRESET_FULL_RECT
	return -1
