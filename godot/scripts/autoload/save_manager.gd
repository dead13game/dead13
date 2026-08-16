class_name SaveManager
## 存档管理器：跨平台持久化（Web → localStorage，桌面 → user:// 文件）
## 用法：SaveManager.save(key, data_dict) / load / has / clear
## key 示例："classic" "solo" "uni" "league" "worldcup"

static func save(key: String, data: Dictionary) -> bool:
	var json: String = JSON.stringify(data)
	if json.is_empty():
		return false
	if _is_web():
		return _web_save(key, json)
	return _file_save(key, json)

static func load(key: String) -> Variant:
	var raw: String = ""
	if _is_web():
		raw = _web_load(key)
	else:
		raw = _file_load(key)
	if raw.is_empty():
		return null
	var parsed: Variant = JSON.parse_string(raw)
	if parsed == null or not parsed is Dictionary:
		return null
	return parsed

static func has(key: String) -> bool:
	if _is_web():
		var raw: String = _web_load(key)
		return not raw.is_empty()
	return FileAccess.file_exists(_path(key))

static func clear(key: String) -> void:
	if _is_web():
		_web_remove(key)
	else:
		var f: String = _path(key)
		if FileAccess.file_exists(f):
			DirAccess.remove_absolute(f)

# ===== 平台判断与后端 =====

static func _is_web() -> bool:
	return OS.has_feature("web")

static func _path(key: String) -> String:
	return "user://save_%s.json" % key

static func _file_save(key: String, json: String) -> bool:
	var f := FileAccess.open(_path(key), FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(json)
	f.close()
	return true

static func _file_load(key: String) -> String:
	if not FileAccess.file_exists(_path(key)):
		return ""
	var f := FileAccess.open(_path(key), FileAccess.READ)
	if f == null:
		return ""
	var text: String = f.get_as_text()
	f.close()
	return text

static func _web_save(key: String, json: String) -> bool:
	# JavaScriptBridge 仅在 Web 导出可用（单线程模式 OK）
	var js: Variant = null
	if Engine.has_singleton("JavaScriptBridge"):
		js = Engine.get_singleton("JavaScriptBridge")
		js.eval("localStorage.setItem(%s, %s)" % [JSON.stringify(key), JSON.stringify(json)])
		return true
	# 无 JS 环境（开发预览等）回退文件
	return _file_save(key, json)

static func _web_load(key: String) -> String:
	var js: Variant = null
	if Engine.has_singleton("JavaScriptBridge"):
		js = Engine.get_singleton("JavaScriptBridge")
		var result: Variant = js.eval("localStorage.getItem(%s) || ''" % JSON.stringify(key))
		if result != null:
			return String(result)
		return ""
	return _file_load(key)

static func _web_remove(key: String) -> void:
	var js: Variant = null
	if Engine.has_singleton("JavaScriptBridge"):
		js = Engine.get_singleton("JavaScriptBridge")
		js.eval("localStorage.removeItem(%s)" % JSON.stringify(key))
	else:
		var f: String = _path(key)
		if FileAccess.file_exists(f):
			DirAccess.remove_absolute(f)
