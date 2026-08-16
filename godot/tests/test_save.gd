extends SceneTree
## 存档管理器自测（桌面 FileAccess 后端 + 各模式序列化往返）
## 运行：godot --headless --path godot --script res://tests/test_save.gd

const SaveManager = preload("res://scripts/autoload/save_manager.gd")
const GameState = preload("res://scripts/game/game_state.gd")
const GameSolo = preload("res://scripts/game/solo.gd")
const UniState = preload("res://scripts/game/uni_state.gd")

var _failures: int = 0

func _initialize() -> void:
	_test_save_manager()
	_test_classic_roundtrip()
	_test_solo_roundtrip()
	_test_uni_roundtrip()
	# 清理
	SaveManager.clear("test_key")
	if _failures == 0:
		print("PASS: all save tests")
	else:
		push_error("FAIL: %d save test(s) failed" % _failures)
	quit(_failures)

func _check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok - ", msg)
	else:
		_failures += 1
		push_error("  FAIL - " + msg)

# ===== SaveManager 基础 =====

func _test_save_manager() -> void:
	print("save_manager")
	var data: Dictionary = {"a": 1, "b": "x", "nested": {"k": [1, 2, 3]}}
	_check(SaveManager.save("test_key", data) == true, "save ok")
	_check(SaveManager.has("test_key") == true, "has ok")
	var loaded: Variant = SaveManager.load("test_key")
	_check(loaded != null and loaded is Dictionary, "load returns dict")
	if loaded is Dictionary:
		_check(int(loaded.get("a", 0)) == 1, "field a=1")
		_check(String(loaded.get("b", "")) == "x", "field b=x")
		var nested: Dictionary = loaded.get("nested", {})
		var k_arr: Array = nested.get("k", [])
		_check(k_arr.size() == 3 and int(k_arr[0]) == 1 and int(k_arr[2]) == 3, "nested array preserved")
	# 不存在的 key
	_check(SaveManager.has("no_such_key_xyz") == false, "missing key not found")
	_check(SaveManager.load("no_such_key_xyz") == null, "missing key load null")
	# 清空
	SaveManager.clear("test_key")
	_check(SaveManager.has("test_key") == false, "clear ok")

# ===== 经典模式存档往返 =====

func _test_classic_roundtrip() -> void:
	print("classic_save")
	var s: Dictionary = GameState.create_game_state()
	GameState.init_game(s, [1, 2, 3], false, 1)
	# 推进一些状态
	GameState.add_log(s, "测试回合")
	var data: Dictionary = GameState.serialize_game_state(s)
	_check(SaveManager.save("classic", data) == true, "classic save")
	var loaded: Variant = SaveManager.load("classic")
	_check(loaded != null and loaded is Dictionary, "classic load")
	if loaded is Dictionary:
		var s2: Dictionary = GameState.create_game_state()
		_check(GameState.deserialize_game_state(s2, loaded) == true, "classic deserialize")
		_check(s2.get("players", []).size() == 3, "players restored")
		_check(int(s2.get("round", 0)) == 1, "round restored")

# ===== 单人模式存档往返 =====

func _test_solo_roundtrip() -> void:
	print("solo_save")
	var s: Dictionary = GameSolo.create_solo_state()
	GameSolo.gain_exp(s, 10)
	GameSolo.add_gold(s, 45)
	var data: Dictionary = GameSolo.serialize_solo(s)
	_check(SaveManager.save("solo", data) == true, "solo save")
	var loaded: Variant = SaveManager.load("solo")
	_check(loaded != null and loaded is Dictionary, "solo load")
	if loaded is Dictionary:
		var s2: Dictionary = GameSolo.create_solo_state()
		_check(GameSolo.deserialize_solo(s2, loaded) == true, "solo deserialize")
		_check(int(s2["player"].get("level", 1)) == 2, "level restored")
		_check(int(s2["player"].get("gold", 0)) == 45, "gold restored")

# ===== 模拟宇宙存档往返 =====

func _test_uni_roundtrip() -> void:
	print("uni_save")
	var s: Dictionary = UniState.create_uni_state()
	UniCore_add_shards(s, 120)
	UniBuffs_gain(s, "shaojie")
	var data: Dictionary = UniState.serialize_uni(s)
	_check(SaveManager.save("uni", data) == true, "uni save")
	var loaded: Variant = SaveManager.load("uni")
	_check(loaded != null and loaded is Dictionary, "uni load")
	if loaded is Dictionary:
		var s2: Dictionary = UniState.create_uni_state()
		_check(UniState.deserialize_uni(s2, loaded) == true, "uni deserialize")
		_check(int(s2.get("shards", 0)) == 120, "shards restored")
		_check(s2.get("blessings", []).size() == 1, "blessings restored")

func UniCore_add_shards(s: Dictionary, n: int) -> void:
	var UniCore = load("res://scripts/game/uni_core.gd")
	UniCore.add_shards(s, n)

func UniBuffs_gain(s: Dictionary, id: String) -> void:
	var UniBuffs = load("res://scripts/game/uni_buffs.gd")
	UniBuffs.gain_blessing(s, id)
