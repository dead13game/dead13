extends SceneTree
## ============================================================================
## UI 布局调整工具 —— 供「UI 调参子代理」调用（新 UI 摆放工作流的核心工具）
##
## 用法（命令 JSON 写进一个文件，避免 shell 引号地狱）:
##   godot --headless --path godot --script res://tools/ui_adjust.gd -- <命令.json>
##
## 命令 JSON 字段:
##   {
##     "op":    "list" | "inspect" | "search" | "move" | "align" | "resize" | "set" | "registry",
##     "scene": "game_table" | "classic/game_table" | "res://scenes/classic/game_table.tscn",
##     "node":  "%LogPanel" | "LogPanel" | "Panel/Child" | "LogPanel@1234",
##     # move:   像素位移 + 窗口百分比位移（窗口 = 1080×1920 竖屏）
##     "dx": 10, "dy": -288, "dxpct": 0, "dypct": -15,
##     # align:  与另一节点对齐（同节点或跨节点，取全局 rect 计算）
##     "axis": "y", "ref": "center", "target": "TopBar", "node_ref": "min", "target_ref": "max",
##     # resize: 增量 dw/dh（px）或绝对 w/h；点锚居中扩边，范围锚扩自由边
##     "dw": 20, "dh": 0, "w": 500, "h": 300,
##     # set:    直接写任意 anchor_* / offset_* 字段
##     "anchor_left": 0.5, "offset_top": 100,
##     # registry 模式: rop = "list" | "inspect" | "move" | "resize" | "set"
##     "rop": "move",
##     # 通用
##     "dry": true,      # 只计算并预览，不写盘
##     "force": true     # 绕过「容器子节点禁止移动」拦截（不推荐）
##   }
##
## 输出约定:
##   人类可读行以 "> " 开头；最后一行机器 JSON 为 "[UIADJUST] {...}"，agent 解析它。
## 写盘前自动备份原场景到 res://tools/.ui_adjust_backups/
## ============================================================================

const REGISTRY_PATH := "res://scripts/ui/layout_registry.json"
const BACKUP_DIR := "res://tools/.ui_adjust_backups"

var _win_w := 1080.0
var _win_h := 1920.0
var _result := {}
var _summary := PackedStringArray()

# ---------------------------------------------------------------- 入口

func _initialize() -> void:
	_win_w = float(ProjectSettings.get_setting("display/window/size/viewport_width", 1080))
	_win_h = float(ProjectSettings.get_setting("display/window/size/viewport_height", 1920))
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		_fail("缺少命令 JSON 文件参数。用法: godot --headless --path godot --script res://tools/ui_adjust.gd -- <cmd.json>")
		return
	var raw := ""
	var arg := String(args[0]).strip_edges()
	if arg.begins_with("{"):
		raw = arg  # 允许直接内联 JSON
	elif arg.begins_with("res://"):
		raw = FileAccess.get_file_as_string(arg)
	else:
		raw = FileAccess.get_file_as_string(arg)
		if raw.is_empty():
			# MSYS /c/... → C:/... 转换
			raw = FileAccess.get_file_as_string(_to_windows_path(arg))
	if raw.is_empty():
		_fail("无法读取命令文件: " + arg)
		return
	var parsed = JSON.parse_string(raw)
	if parsed is not Dictionary:
		_fail("命令 JSON 解析失败，内容: " + raw.substr(0, 200))
		return
	_run(parsed)

func _to_windows_path(p: String) -> String:
	if p.begins_with("/c/") or p.begins_with("/C/"):
		return "C:/" + p.substr(3)
	if p.begins_with("/mnt/c/"):
		return "C:/" + p.substr(7)
	return p

func _run(cmd: Dictionary) -> void:
	var op := String(cmd.get("op", ""))
	match op:
		"list", "inspect", "move", "align", "resize", "set":
			var scene_path := _resolve_scene_path(String(cmd.get("scene", "")))
			if scene_path.is_empty():
				_fail("找不到场景: %s（可给完整 res:// 路径，或 scene 名如 classic/game_table）" % String(cmd.get("scene", "")))
				return
			var root := _load_scene_root(scene_path)
			if root == null:
				_fail("场景加载失败: " + scene_path)
				return
			_scene_op(op, cmd, scene_path, root)
			root.free()
		"search":
			_search_op(cmd)
		"audit":
			_audit_op(cmd)
		"registry":
			_registry_op(String(cmd.get("rop", "list")), cmd)
		_:
			_fail("未知 op: %s（可用 list / inspect / search / move / align / resize / set / registry / audit）" % op)

func _finish() -> void:
	_result["ok"] = true
	print("[UIADJUST] " + JSON.stringify(_result))
	quit(0)

func _fail(msg: String) -> void:
	print("> ERROR: " + msg)
	print("[UIADJUST] " + JSON.stringify({"ok": false, "error": msg}))
	quit(1)

func _note(msg: String) -> void:
	_summary.append(msg)

# ---------------------------------------------------------------- 场景定位 / 加载

func _resolve_scene_path(q: String) -> String:
	q = q.strip_edges()
	if q.is_empty():
		return ""
	if q.begins_with("res://"):
		return q if FileAccess.file_exists(q) else ""
	for c in [
		"res://scenes/%s.tscn" % q,
		"res://scenes/%s" % q,
		"res://%s" % q,
	]:
		if FileAccess.file_exists(c):
			return c
	if FileAccess.file_exists(q):
		return q
	var found := _find_scene_by_name(q.get_file())
	if found.is_empty():
		return ""
	if found.size() == 1:
		return found[0]
	print("> 场景名有歧义，请指定完整路径，候选: " + ", ".join(found))
	return ""

func _find_scene_by_name(basename: String) -> Array:
	var out := []
	_collect_scenes("res://scenes", basename, out)
	return out

func _collect_scenes(dir: String, basename: String, out: Array) -> void:
	var d := DirAccess.open(dir)
	if d == null:
		return
	d.list_dir_begin()
	var fn := d.get_next()
	while fn != "":
		if d.current_is_dir():
			if not fn.begins_with("."):
				_collect_scenes(dir + "/" + fn, basename, out)
		elif fn.ends_with(".tscn") and (basename == "" or fn == basename or fn == basename + ".tscn"):
			out.append(dir + "/" + fn)
		fn = d.get_next()
	d.list_dir_end()

func _all_scene_files() -> Array:
	var out := []
	_collect_scenes("res://scenes", "", out)
	return out

func _load_scene_root(path: String) -> Node:
	var ps: PackedScene = load(path)
	if ps == null:
		return null
	return ps.instantiate()

# ---------------------------------------------------------------- 节点解析

func _resolve_node(root: Node, query: String) -> Array:
	## 返回 [Node 或 null, 错误信息]
	var q := query.strip_edges()
	if q.contains("@"):  # 运行时后缀容错 LogPanel@1234 -> LogPanel
		q = q.substr(0, q.find("@"))
	if q.is_empty():
		return [null, "节点名不能为空"]
	if q.begins_with("%"):
		var name := q.substr(1)
		var found := []
		_walk(root, func(n: Node):
			if n is Control and n.unique_name_in_owner and n.name == name:
				found.append(n))
		if found.is_empty():
			return [null, "场景里没有唯一名 %%%s" % name]
		return [found[0], ""]
	if q.contains("/"):
		var node := root.get_node_or_null(q)
		if node != null:
			return [node, ""]
	var matches := []
	_walk(root, func(n: Node):
		if n.name == q:
			matches.append(n))
	if matches.is_empty():
		return [null, "场景里找不到节点: %s" % q]
	if matches.size() > 1:
		var cands := PackedStringArray()
		for m in matches:
			cands.append(root.get_path_to(m))
		return [null, "节点名 %s 有 %d 个匹配(%s)；请用 %%%s 唯一名或完整路径区分" % [q, matches.size(), ", ".join(cands), q]]
	return [matches[0], ""]

func _walk(n: Node, f: Callable) -> void:
	for c in n.get_children():
		f.call(c)
		_walk(c, f)

# ---------------------------------------------------------------- 几何

## 沿父链从窗口矩形向下逐层做 anchor/offset 数学，算出节点全局 rect。
## 局限：链上有 Container 时容器会覆盖子节点排布，此值不准（对齐前会检测）。
func _global_rect(n: Control) -> Rect2:
	var stack := []
	var cur: Node = n
	while cur is Control:
		stack.push_front(cur)
		cur = cur.get_parent()
	var pr := Rect2(0, 0, _win_w, _win_h)
	for c in stack:
		var ctl := c as Control
		var x := pr.position.x + pr.size.x * ctl.anchor_left + ctl.offset_left
		var y := pr.position.y + pr.size.y * ctl.anchor_top + ctl.offset_top
		var w := pr.size.x * (ctl.anchor_right - ctl.anchor_left) + (ctl.offset_right - ctl.offset_left)
		var h := pr.size.y * (ctl.anchor_bottom - ctl.anchor_top) + (ctl.offset_bottom - ctl.offset_top)
		pr = Rect2(x, y, maxf(0, w), maxf(0, h))
	return pr

func _chain_has_container(n: Control) -> bool:
	var cur: Node = n
	while cur is Control:
		var p := cur.get_parent()
		if p is Container:
			return true
		cur = p
	return false

func _parent_is_container(n: Control) -> bool:
	return n.get_parent() is Container

func _size_of(n: Control) -> Vector2:
	return _global_rect(n).size

# ---------------------------------------------------------------- dump

func _dump_node(n: Control, root: Node) -> Dictionary:
	var parent := n.get_parent()
	var gr := _global_rect(n)
	return {
		"name": String(n.name),
		"unique_name": n.unique_name_in_owner,
		"type": n.get_class(),
		"path": root.get_path_to(n),
		"parent": String(parent.name) if parent != null else "",
		"parent_type": parent.get_class() if parent != null else "",
		"in_container": _parent_is_container(n),
		"container_type": parent.get_class() if parent is Container else "",
		"anchor_left": n.anchor_left, "anchor_top": n.anchor_top,
		"anchor_right": n.anchor_right, "anchor_bottom": n.anchor_bottom,
		"offset_left": n.offset_left, "offset_top": n.offset_top,
		"offset_right": n.offset_right, "offset_bottom": n.offset_bottom,
		"size": [_size_of(n).x, _size_of(n).y],
		"global_rect": [gr.position.x, gr.position.y, gr.size.x, gr.size.y],
		"visible": n.visible,
		"text": n.get("text"),
	}

func _dump_mini(n: Control) -> Dictionary:
	return {
		"name": String(n.name),
		"type": n.get_class(),
		"in_container": _parent_is_container(n),
		"container_type": n.get_parent().get_class() if n.get_parent() is Container else "",
		"offset_top": n.offset_top, "offset_bottom": n.offset_bottom,
		"offset_left": n.offset_left, "offset_right": n.offset_right,
		"size": [_size_of(n).x, _size_of(n).y],
	}

# ---------------------------------------------------------------- 场景 op 分发

func _scene_op(op: String, cmd: Dictionary, scene_path: String, root: Node) -> void:
	match op:
		"list":
			var nodes := []
			var unique_names := PackedStringArray()
			if root is Control:
				nodes.append(_dump_node(root, root))
				if root.unique_name_in_owner:
					unique_names.append("%" + root.name)
			_walk(root, func(n: Node):
				if n is Control:
					nodes.append(_dump_node(n, root))
					if n.unique_name_in_owner:
						unique_names.append("%" + n.name))
			_result["scene"] = scene_path
			_result["window"] = {"w": _win_w, "h": _win_h}
			_result["node_count"] = nodes.size()
			_result["nodes"] = nodes
			_result["unique_names"] = unique_names
			_note("场景 %s 共 %d 个 Control；唯一名: %s" % [scene_path, nodes.size(), ", ".join(unique_names)])
			_finish()
		"inspect":
			var q := String(cmd.get("node", ""))
			var res := _resolve_node(root, q)
			if res[0] == null:
				_fail(res[1])
				return
			var n := res[0] as Control
			var d := _dump_node(n, root)
			d["hint"] = _hint_for(n)
			_result["scene"] = scene_path
			_result["window"] = {"w": _win_w, "h": _win_h}
			_result["node"] = d
			_note("已定位: %s (%s)" % [root.get_path_to(n), n.get_class()])
			_finish()
		_:
			var q := String(cmd.get("node", ""))
			var res := _resolve_node(root, q)
			if res[0] == null:
				_fail(res[1])
				return
			var n := res[0] as Control
			match op:
				"move": _op_move(cmd, scene_path, root, n)
				"align": _op_align(cmd, scene_path, root, n)
				"resize": _op_resize(cmd, scene_path, root, n)
				"set": _op_set(cmd, scene_path, root, n)

func _hint_for(n: Control) -> String:
	if _parent_is_container(n):
		return "节点在容器 %s 内，位置由容器算法排布，编辑器也拖不动；调整应改容器(separation/自定义最小尺寸)或改为绝对定位" % n.get_parent().get_class()
	var a := n.anchor_left
	var b := n.anchor_right
	if is_equal_approx(a, b) and is_equal_approx(n.anchor_top, n.anchor_bottom):
		return "角锚点(单点)定位：offset 即相对父的位置/尺寸，可直接移动/缩放"
	if is_equal_approx(a, 0.0) and is_equal_approx(b, 1.0):
		return "横向撑满(anchor 0→1)：整宽元素，横向位移无意义，纵向可移"
	return "锚定区间定位：可整体移动；注意各边锚点"

# ---------------------------------------------------------------- 写盘（.tscn 文本级编辑）

func _backup(path: String, op: String) -> String:
	DirAccess.make_dir_recursive_absolute(BACKUP_DIR)
	var base := path.get_file().get_basename()
	var ts := Time.get_datetime_string_from_system(false, true).replace(":", "-").replace(" ", "_")
	var dst := "%s/%s.%s.%s.tscn" % [BACKUP_DIR, base, op, ts]
	if DirAccess.copy_absolute(path, dst) == OK:
		return dst
	return ""

func _fmt_tscn_val(v) -> String:
	if v is bool:
		return "true" if v else "false"
	if v is float:
		return String.num(v, 4) if not is_equal_approx(v, roundf(v)) else String.num(v, 0) + ".0"
	if v is int:
		return str(v)
	return str(v)

## 把 props 写进场景文本里对应节点块（属性行已存在则替换，否则块尾插入）。
## 返回 [ok, msg]。
func _write_tscn_props(path: String, n: Control, root: Node, props: Dictionary) -> Array:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return [false, "无法读取场景: " + path]
	var text := f.get_as_text()
	f.close()
	# 计算节点父路径
	var parent_path := "."
	var cur: Node = n.get_parent()
	if cur != null and cur != root:
		parent_path = String(root.get_path_to(cur)).trim_prefix("/")
	elif cur == null:
		parent_path = "."
	var lines := text.split("\n")
	var header_re := RegEx.new()
	header_re.compile('^\\[node name="([^"]*)"[^\\]]*parent="([^"]*)"[^\\]]*\\]')
	var block_start := -1
	var block_end := -1
	for i in lines.size():
		var m := header_re.search(lines[i])
		if m:
			if m.get_string(1) == n.name and m.get_string(2) == parent_path:
				if block_start != -1:
					return [false, "场景里有多个同名同父节点块(%s/%s)，无法确定写哪个；请给节点设唯一名再试" % [parent_path, n.name]]
				block_start = i
			elif block_start != -1:
				block_end = i
				break
		elif block_start != -1 and (lines[i].begins_with("[connection") or lines[i].begins_with("[editable") or lines[i].begins_with("[sub_resource")):
			block_end = i
			break
	if block_start == -1:
		return [false, "场景文本里找不到节点块 %s/%s；该节点可能是脚本动态生成，应走 registry/改代码" % [parent_path, n.name]]
	if block_end == -1:
		block_end = lines.size()
	var inserts := {}
	for key in props:
		var found := false
		var val: Variant = props[key]
		var prop_re := RegEx.new()
		prop_re.compile('^(\\s*)' + key + '\\s*=\\s*.*$')
		for j in range(block_start + 1, block_end):
			var mm := prop_re.search(lines[j])
			if mm and not lines[j].strip_edges().begins_with("#"):
				lines[j] = mm.get_string(1) + key + " = " + _fmt_tscn_val(val)
				found = true
				break
		if not found:
			inserts[key] = _fmt_tscn_val(val)
	if not inserts.is_empty():
		var ins := PackedStringArray()
		for key in inserts:
			ins.append("\t" + key + " = " + inserts[key])
		lines = _insert_lines(lines, block_end, ins)
	var fw := FileAccess.open(path, FileAccess.WRITE)
	if fw == null:
		return [false, "无法写场景: " + path]
	fw.store_string("\n".join(lines))
	fw.close()
	return [true, ""]

func _insert_lines(lines: Array, at: int, ins: PackedStringArray) -> Array:
	var out := []
	for i in lines.size():
		if i == at:
			for s in ins:
				out.append(s)
		out.append(lines[i])
	if at >= lines.size():
		for s in ins:
			out.append(s)
	return out

# ---------------------------------------------------------------- move / align / resize / set

func _collect_prop_delta(n: Control, dx: float, dy: float) -> Dictionary:
	## 平移语义：保持尺寸不变（移动维度两个 offset 一起平移），锚点不动。
	var props := {}
	if dx != 0.0:
		props["offset_left"] = n.offset_left + dx
		props["offset_right"] = n.offset_right + dx
	if dy != 0.0:
		props["offset_top"] = n.offset_top + dy
		props["offset_bottom"] = n.offset_bottom + dy
	return props

func _op_move(cmd: Dictionary, scene_path: String, root: Node, n: Control) -> void:
	var dx := float(cmd.get("dx", 0.0))
	var dy := float(cmd.get("dy", 0.0))
	dx += float(cmd.get("dxpct", 0.0)) / 100.0 * _win_w
	dy += float(cmd.get("dypct", 0.0)) / 100.0 * _win_h
	if is_equal_approx(dx, 0.0) and is_equal_approx(dy, 0.0):
		_fail("move 需要 dx/dy（像素）或 dxpct/dypct（窗口百分比）")
		return
	if _parent_is_container(n) and not bool(cmd.get("force", false)):
		_fail("节点 %s 在容器 %s 内，位置由容器算法排布不能直接移动。\n  调整方式：改容器 separation/自定义最小尺寸，或把该节点改为绝对定位。\n  确要强改可加 force:true（不推荐）。" % [n.name, n.get_parent().get_class()])
		return
	var before := _dump_node(n, root)
	var props := _collect_prop_delta(n, dx, dy)
	_apply_props(n, props)
	var after := _dump_node(n, root)
	_result["scene"] = scene_path
	_result["op"] = "move"
	_result["node"] = before
	_result["delta"] = {"dx": dx, "dy": dy, "dxpct": cmd.get("dxpct", 0.0), "dypct": cmd.get("dypct", 0.0)}
	_result["after"] = after
	_note("move: %s → %s (dx=%.1f dy=%.1f)" % [before["name"], after["name"], dx, dy])
	_finish_write(scene_path, root, n, props, bool(cmd.get("dry", false)))

func _ref_value(rect: Rect2, ref: String, vertical: bool) -> float:
	match ref:
		"min":
			return rect.position.y if vertical else rect.position.x
		"max":
			return rect.end.y if vertical else rect.end.x
		_:
			return rect.get_center().y if vertical else rect.get_center().x

func _op_align(cmd: Dictionary, scene_path: String, root: Node, n: Control) -> void:
	var target_q := String(cmd.get("target", ""))
	if target_q.is_empty():
		_fail("align 需要 target（要与之对齐的节点）")
		return
	var axis := String(cmd.get("axis", "y"))
	var ref := String(cmd.get("ref", "center"))
	var node_ref := String(cmd.get("node_ref", ref))
	var target_ref := String(cmd.get("target_ref", ref))
	if axis != "x" and axis != "y":
		_fail("axis 只能为 x 或 y")
		return
	var res := _resolve_node(root, target_q)
	if res[0] == null:
		_fail("align 目标节点定位失败: " + res[1])
		return
	var tn := res[0] as Control
	if _parent_is_container(n) and not bool(cmd.get("force", false)):
		_fail("节点 %s 在容器 %s 内，不能直接对齐；请先改容器或绝对定位" % [n.name, n.get_parent().get_class()])
		return
	if (_chain_has_container(n) or _chain_has_container(tn)) and not bool(cmd.get("force", false)):
		_note("> 警告: 节点或目标所在链上有 Container，全局 rect 为近似值（容器会覆盖排布）；已按近似值计算，可加 force:true 忽略警告")
	var nr := _global_rect(n)
	var tr := _global_rect(tn)
	var nv := _ref_value(nr, node_ref, axis == "y")
	var tv := _ref_value(tr, target_ref, axis == "y")
	var dx := 0.0
	var dy := 0.0
	if axis == "y":
		dy = tv - nv
	else:
		dx = tv - nv
	var before := _dump_node(n, root)
	var props := _collect_prop_delta(n, dx, dy)
	_apply_props(n, props)
	var after := _dump_node(n, root)
	_result["scene"] = scene_path
	_result["op"] = "align"
	_result["node"] = before
	_result["target"] = _dump_mini(tn)
	_result["axis"] = axis
	_result["refs"] = {"node_ref": node_ref, "target_ref": target_ref}
	_result["delta"] = {"dx": dx, "dy": dy}
	_result["after"] = after
	_note("align: %s[%s] %s→%s %s[%s] (dx=%.1f dy=%.1f)" % [before["name"], node_ref, axis, target_ref, tn.name, axis, dx, dy])
	_finish_write(scene_path, root, n, props, bool(cmd.get("dry", false)))

func _op_resize(cmd: Dictionary, scene_path: String, root: Node, n: Control) -> void:
	var dw := float(cmd.get("dw", 0.0))
	var dh := float(cmd.get("dh", 0.0))
	if cmd.has("w"):
		dw = float(cmd["w"]) - _size_of(n).x
	if cmd.has("h"):
		dh = float(cmd["h"]) - _size_of(n).y
	if is_equal_approx(dw, 0.0) and is_equal_approx(dh, 0.0):
		_fail("resize 需要 dw/dh（增量）或 w/h（绝对尺寸）")
		return
	var before := _dump_node(n, root)
	var props := {}
	if dw != 0.0:
		if is_equal_approx(n.anchor_left, n.anchor_right):
			props["offset_left"] = n.offset_left - dw / 2.0
			props["offset_right"] = n.offset_right + dw / 2.0
		else:
			props["offset_right"] = n.offset_right + dw
	if dh != 0.0:
		if is_equal_approx(n.anchor_top, n.anchor_bottom):
			props["offset_top"] = n.offset_top - dh / 2.0
			props["offset_bottom"] = n.offset_bottom + dh / 2.0
		else:
			props["offset_bottom"] = n.offset_bottom + dh
	_apply_props(n, props)
	var after := _dump_node(n, root)
	_result["scene"] = scene_path
	_result["op"] = "resize"
	_result["node"] = before
	_result["delta"] = {"dw": dw, "dh": dh}
	_result["after"] = after
	_note("resize: %s size %s → %s (dw=%.1f dh=%.1f)" % [before["name"], str(before["size"]), str(after["size"]), dw, dh])
	_finish_write(scene_path, root, n, props, bool(cmd.get("dry", false)))

func _op_set(cmd: Dictionary, scene_path: String, root: Node, n: Control) -> void:
	var props := {}
	for key in ["anchor_left", "anchor_top", "anchor_right", "anchor_bottom",
			"offset_left", "offset_top", "offset_right", "offset_bottom"]:
		if cmd.has(key):
			props[key] = float(cmd[key])
	if props.is_empty():
		_fail("set 需要至少一个 anchor_* / offset_* 字段")
		return
	var before := _dump_node(n, root)
	_apply_props(n, props)
	var after := _dump_node(n, root)
	_result["scene"] = scene_path
	_result["op"] = "set"
	_result["node"] = before
	_result["props"] = props
	_result["after"] = after
	_note("set: %s 写 %d 个字段" % [before["name"], props.size()])
	_finish_write(scene_path, root, n, props, bool(cmd.get("dry", false)))

func _apply_props(n: Control, props: Dictionary) -> void:
	for key in props:
		n.set(key, props[key])

func _finish_write(scene_path: String, root: Node, n: Control, props: Dictionary, dry: bool) -> void:
	if dry:
		_result["dry"] = true
		_result["saved"] = false
		_result["would_write"] = props
		_note("dry-run，未写盘；确认无误后去掉 dry 再跑")
		_finish()
		return
	var backup := _backup(scene_path, _result["op"])
	var ok: Array = _write_tscn_props(scene_path, n, root, props)
	if not ok[0]:
		_result["saved"] = false
		_result["error"] = ok[1]
		print("> 写盘失败: " + ok[1])
		print("[UIADJUST] " + JSON.stringify(_result))
		quit(1)
		return
	_result["saved"] = true
	_result["backup"] = backup if backup != "" else ""
	_note("已写入 %s；备份: %s" % [scene_path, backup if backup != "" else "(无)"])
	_finish()

# ---------------------------------------------------------------- search（文本扫描，安全无实例化）

func _search_op(cmd: Dictionary) -> void:
	var q := String(cmd.get("node", "")).strip_edges()
	if q.contains("@"):
		q = q.substr(0, q.find("@"))
	if q.is_empty():
		_fail("search 需要 node 名")
		return
	var results := []
	for sp in _all_scene_files():
		var info := _find_node_block_text(sp, q)
		if info.size() > 0:
			results.append({"scene": sp, "matches": info})
	_result["op"] = "search"
	_result["query"] = q
	_result["results"] = results
	_note("search %s → 命中 %d 个场景" % [q, results.size()])
	_finish()

## 文本级找节点块（不实例化，安全）。返回匹配块列表 [{name,parent,type,unique,props}]
func _find_node_block_text(path: String, q: String) -> Array:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return []
	var lines := f.get_as_text().split("\n")
	f.close()
	var header_re := RegEx.new()
	header_re.compile('^\\[node name="([^"]*)"[^\\]]*\\]')
	var out := []
	var in_block := false
	var block := {}
	for line in lines:
		var h := header_re.search(line)
		if h:
			in_block = false
			var name := h.get_string(1)
			if name == q or name.begins_with(q):
				in_block = true
				block = {"name": name, "parent": "", "type": "", "unique": false, "props": {}}
				var m2 := _re(line, 'parent="([^"]*)"')
				if m2:
					block["parent"] = m2.get_string(1)
				var m3 := _re(line, 'type="([^"]*)"')
				if m3:
					block["type"] = m3.get_string(1)
				block["unique"] = line.contains("unique_name_in_owner") or line.begins_with("unique_name_in_owner")
				out.append(block)
			continue
		if in_block and block.size() > 0:
			var pl := line.strip_edges()
			if pl == "" or pl.begins_with("["):
				in_block = false
				continue
			if pl.begins_with("unique_name_in_owner"):
				block["unique"] = true
			var pm := _re(line, '^\\s*(anchor_(?:left|top|right|bottom)|offset_(?:left|top|right|bottom))\\s*=\\s*(-?[0-9.]+)')
			if pm:
				block["props"][pm.get_string(1)] = float(pm.get_string(2))
	return out

func _re(subject: String, pattern: String) -> RegExMatch:
	var r := RegEx.new()
	r.compile(pattern)
	return r.search(subject)

# ---------------------------------------------------------------- audit（注册表一致性检查）

## 扫描所有 .gd 里的 LayoutRegistry.apply_to(...) 调用，对照 layout_registry.json：
##  - missing：调用了但 JSON 没有条目（→ 需补条目，否则 apply_to 退化成 preset 默认，布局会走样）
##  - orphan ：JSON 有条目但代码里没有任何调用（→ 可能是废条目，可清理）
## 这是「动态 UI 自动维护」的一致性检查：写新功能顺手写 apply_to 那行，跑一次 audit 就知道要不要补 JSON。
func _audit_op(cmd: Dictionary) -> void:
	var data := _load_registry()
	var rects: Dictionary = data.get("rects", {})
	var calls := []  # [{name, file, line}]
	var stack := ["res://scripts"]
	while not stack.is_empty():
		var dir: String = stack.pop_back()
		var d := DirAccess.open(dir)
		if d == null:
			continue
		d.list_dir_begin()
		var fn := d.get_next()
		while fn != "":
			var p := dir + "/" + fn
			if d.current_is_dir():
				if not fn.begins_with("."):
					stack.append(p)
			elif fn.ends_with(".gd"):
				var lines := FileAccess.get_file_as_string(p).split("\n")
				for i in lines.size():
					if lines[i].strip_edges().begins_with("#"):
						continue  # 跳过注释示例
					var m := _re(lines[i], 'LayoutRegistry\\s*\\.\\s*apply_to\\s*\\(\\s*[^,]+\\s*,\\s*["\']([^"\']+)["\']')
					if m:
						calls.append({"name": m.get_string(1), "file": p, "line": i + 1})
			fn = d.get_next()
		d.list_dir_end()
	var used := {}
	for c in calls:
		used[c["name"]] = true
	var missing := []
	var seen := {}
	for c in calls:
		if not rects.has(c["name"]) and not seen.has(c["name"]):
			seen[c["name"]] = true
			missing.append(c)
	var orphans := []
	for k in rects:
		if not used.has(k):
			orphans.append(k)
	_result["op"] = "audit"
	_result["registry"] = REGISTRY_PATH
	_result["call_count"] = calls.size()
	_result["entry_count"] = rects.size()
	_result["missing"] = missing
	_result["orphans"] = orphans
	if missing.is_empty():
		_note("audit: 全部 %d 处 apply_to 调用均已登记，无遗漏（孤儿 %d 条）" % [calls.size(), orphans.size()])
	else:
		for m in missing:
			_note("> 未登记: %s @ %s:%d —— 需在 registry 补条目" % [m["name"], m["file"], m["line"]])
		for o in orphans:
			_note("> 孤儿条目: %s —— 无代码调用，可清理" % o)
	_finish()

# ---------------------------------------------------------------- registry 模式

func _load_registry() -> Dictionary:
	if not FileAccess.file_exists(REGISTRY_PATH):
		return {"version": 1, "window": {"w": _win_w, "h": _win_h}, "rects": {}}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(REGISTRY_PATH))
	if parsed is Dictionary:
		return parsed
	return {"version": 1, "window": {"w": _win_w, "h": _win_h}, "rects": {}}

func _save_registry(data: Dictionary) -> bool:
	var f := FileAccess.open(REGISTRY_PATH, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify(data, "\t"))
	f.close()
	return true

func _reg_rect(data: Dictionary, name: String) -> Dictionary:
	var rects: Dictionary = data.get("rects", {})
	return rects.get(name, {})

func _reg_apply(data: Dictionary, name: String, e: Dictionary) -> void:
	var rects: Dictionary = data.get("rects", {})
	rects[name] = e
	data["rects"] = rects

func _reg_global_rect(e: Dictionary) -> Rect2:
	## 注册表条目按「父=窗口(1080×1920)」近似算全局 rect（仅供 move 的 % 换算参考，不做对齐）
	var l := float(e.get("anchor_left", 0.0))
	var t := float(e.get("anchor_top", 0.0))
	var r := float(e.get("anchor_right", 0.0))
	var b := float(e.get("anchor_bottom", 0.0))
	var x := _win_w * l + float(e.get("offset_left", 0.0))
	var y := _win_h * t + float(e.get("offset_top", 0.0))
	var w := _win_w * (r - l) + float(e.get("offset_right", 0.0)) - float(e.get("offset_left", 0.0))
	var h := _win_h * (b - t) + float(e.get("offset_bottom", 0.0)) - float(e.get("offset_top", 0.0))
	return Rect2(x, y, maxf(0, w), maxf(0, h))

func _registry_op(rop: String, cmd: Dictionary) -> void:
	var data := _load_registry()
	var name := String(cmd.get("node", "")).strip_edges()
	match rop:
		"list":
			var rects: Dictionary = data.get("rects", {})
			var entries := []
			for k in rects:
				entries.append({"name": k, "entry": rects[k]})
			_result["op"] = "registry-list"
			_result["window"] = {"w": _win_w, "h": _win_h}
			_result["registry"] = REGISTRY_PATH
			_result["entries"] = entries
			_note("registry %s 共 %d 条" % [REGISTRY_PATH, entries.size()])
			_finish()
		"inspect":
			if name.is_empty() or not data.get("rects", {}).has(name):
				_fail("registry 里没有条目: %s（先 registry/list 看看有哪些）" % name)
				return
			var e: Dictionary = _reg_rect(data, name)
			var r := _reg_global_rect(e)
			_result["op"] = "registry-inspect"
			_result["node"] = name
			_result["entry"] = e
			_result["global_rect_approx"] = [r.position.x, r.position.y, r.size.x, r.size.y]
			_result["consumers"] = _find_registry_consumers(name)
			_finish()
		"move":
			if name.is_empty() or not data.get("rects", {}).has(name):
				_fail("registry 里没有条目: %s" % name)
				return
			var e: Dictionary = _reg_rect(data, name).duplicate(true)
			var dx := float(cmd.get("dx", 0.0)) + float(cmd.get("dxpct", 0.0)) / 100.0 * _win_w
			var dy := float(cmd.get("dy", 0.0)) + float(cmd.get("dypct", 0.0)) / 100.0 * _win_h
			if is_equal_approx(dx, 0.0) and is_equal_approx(dy, 0.0):
				_fail("registry move 需要 dx/dy 或 dxpct/dypct")
				return
			var before := e.duplicate(true)
			if dx != 0.0:
				e["offset_left"] = float(e.get("offset_left", 0.0)) + dx
				e["offset_right"] = float(e.get("offset_right", 0.0)) + dx
			if dy != 0.0:
				e["offset_top"] = float(e.get("offset_top", 0.0)) + dy
				e["offset_bottom"] = float(e.get("offset_bottom", 0.0)) + dy
			_result["op"] = "registry-move"
			_result["node"] = name
			_result["before"] = before
			_result["delta"] = {"dx": dx, "dy": dy}
			_result["after"] = e
			_finish_registry_write(data, name, e, bool(cmd.get("dry", false)))
		"resize":
			if name.is_empty() or not data.get("rects", {}).has(name):
				_fail("registry 里没有条目: %s" % name)
				return
			var e: Dictionary = _reg_rect(data, name).duplicate(true)
			var dw := float(cmd.get("dw", 0.0))
			var dh := float(cmd.get("dh", 0.0))
			if cmd.has("w"):
				dw = float(cmd["w"]) - (float(e.get("offset_right", 0.0)) - float(e.get("offset_left", 0.0)))
			if cmd.has("h"):
				dh = float(cmd["h"]) - (float(e.get("offset_bottom", 0.0)) - float(e.get("offset_top", 0.0)))
			var before := e.duplicate(true)
			if dw != 0.0:
				if is_equal_approx(float(e.get("anchor_left", 0.0)), float(e.get("anchor_right", 0.0))):
					e["offset_left"] = float(e.get("offset_left", 0.0)) - dw / 2.0
					e["offset_right"] = float(e.get("offset_right", 0.0)) + dw / 2.0
				else:
					e["offset_right"] = float(e.get("offset_right", 0.0)) + dw
			if dh != 0.0:
				if is_equal_approx(float(e.get("anchor_top", 0.0)), float(e.get("anchor_bottom", 0.0))):
					e["offset_top"] = float(e.get("offset_top", 0.0)) - dh / 2.0
					e["offset_bottom"] = float(e.get("offset_bottom", 0.0)) + dh / 2.0
				else:
					e["offset_bottom"] = float(e.get("offset_bottom", 0.0)) + dh
			_result["op"] = "registry-resize"
			_result["node"] = name
			_result["before"] = before
			_result["delta"] = {"dw": dw, "dh": dh}
			_result["after"] = e
			_finish_registry_write(data, name, e, bool(cmd.get("dry", false)))
		"set":
			if name.is_empty() or not data.get("rects", {}).has(name):
				_fail("registry 里没有条目: %s" % name)
				return
			var e: Dictionary = _reg_rect(data, name).duplicate(true)
			var changed := false
			for key in ["anchor_left", "anchor_top", "anchor_right", "anchor_bottom",
					"offset_left", "offset_top", "offset_right", "offset_bottom"]:
				if cmd.has(key):
					e[key] = float(cmd[key])
					changed = true
			if not changed:
				_fail("registry set 需要至少一个 anchor_* / offset_* 字段")
				return
			var before := _reg_rect(data, name).duplicate(true)
			_result["op"] = "registry-set"
			_result["node"] = name
			_result["before"] = before
			_result["after"] = e
			_finish_registry_write(data, name, e, bool(cmd.get("dry", false)))
		_:
			_fail("未知 rop: %s（可用 list/inspect/move/resize/set）" % rop)

func _finish_registry_write(data: Dictionary, name: String, e: Dictionary, dry: bool) -> void:
	if dry:
		_result["dry"] = true
		_result["saved"] = false
		_note("dry-run，未写盘；确认后去掉 dry 再跑")
		_finish()
		return
	var backup := _backup(REGISTRY_PATH, "registry-" + _result["op"])
	_reg_apply(data, name, e)
	if not _save_registry(data):
		_result["saved"] = false
		_result["error"] = "registry 写盘失败"
		_finish()
		return
	_result["saved"] = true
	_result["backup"] = backup if backup != "" else ""
	_note("已写入 registry %s（%s）；备份: %s" % [REGISTRY_PATH, name, backup if backup != "" else "(无)"])
	_finish()

## 找哪些 gd 脚本引用了该注册表条目（帮助 agent 评估影响面）
func _find_registry_consumers(name: String) -> Array:
	var out := []
	var d := DirAccess.open("res://scripts")
	if d == null:
		return out
	var stack := ["res://scripts"]
	while not stack.is_empty():
		var dir: String = stack.pop_back()
		var dd := DirAccess.open(dir)
		if dd == null:
			continue
		dd.list_dir_begin()
		var fn := dd.get_next()
		while fn != "":
			var p := dir + "/" + fn
			if dd.current_is_dir():
				if not fn.begins_with("."):
					stack.append(p)
			elif fn.ends_with(".gd"):
				var content := FileAccess.get_file_as_string(p)
				if content.contains("LayoutRegistry") and (content.contains('"%s"' % name) or content.contains("'%s'" % name)):
					out.append(p)
			fn = dd.get_next()
		dd.list_dir_end()
	return out
