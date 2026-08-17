extends SceneTree
## 音效系统自测：soundQueue 消费追踪 / 播放映射
## 运行：godot --headless --path godot --script res://tests/test_audio.gd
## headless 下 AudioStreamPlayer 不真实出声，验证：队列消费逻辑、seq 追踪、节流状态、BGM 资源存在

const GameState = preload("res://scripts/game/game_state.gd")
const GameSoundEvents = preload("res://scripts/game/sound_events.gd")

var _failures: int = 0

func _initialize() -> void:
	# 真实 autoload 实例（headless 下也会加载 autoload）
	var am: Node = get_root().get_node("AudioManager")
	if am == null:
		push_error("FAIL: AudioManager autoload not loaded")
		quit(1)
		return
	_test_queue_consumption(am)
	_test_sfx_mapping(am)
	_test_bgm_mapping(am)
	if _failures == 0:
		print("PASS: all audio tests")
	else:
		push_error("FAIL: %d audio test(s) failed" % _failures)
	quit(_failures)

func _check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok - ", msg)
	else:
		_failures += 1
		push_error("  FAIL - " + msg)

# ===== 队列消费追踪 =====

func _test_queue_consumption(am: Node) -> void:
	print("audio_queue")
	var state: Dictionary = GameState.create_game_state()
	GameState.init_game(state, [1, 2], false, 1)
	# 手动放音效事件
	GameSoundEvents.record_sound(state, "attack")
	GameSoundEvents.record_sound(state, "kill")
	_check(state["soundQueue"].size() == 2, "2 sound events queued")
	# 第一次轮询：应消费全部 2 个
	am._check_state(state)
	_check(int(am._queue_tracked.get(state, 0)) == 2, "queue tracked to seq 2")
	# 再轮询：无新事件，seq 不变
	am._check_state(state)
	_check(int(am._queue_tracked.get(state, 0)) == 2, "no re-play on same queue")
	# 追加新事件 → 只消费新的
	GameSoundEvents.record_sound(state, "skill")
	am._check_state(state)
	_check(int(am._queue_tracked.get(state, 0)) == 3, "only new event consumed")

# ===== SFX 文件映射 =====

func _test_sfx_mapping(am: Node) -> void:
	print("audio_sfx")
	for type in ["attack", "defense", "gamble", "skill", "shield_break", "kill", "match_end", "hit", "lose"]:
		_check(am.SFX_FILES.has(type), "sfx type %s in table" % type)
		var path: String = String(am.SFX_FILES[type])
		_check(ResourceLoader.exists(path), "sfx %s file exists: %s" % [type, path.get_file()])

# ===== BGM 文件映射 =====

func _test_bgm_mapping(am: Node) -> void:
	print("audio_bgm")
	for name in ["menu", "battle1", "battle2"]:
		_check(am.BGM_FILES.has(name), "bgm %s in table" % name)
		var path: String = String(am.BGM_FILES[name])
		_check(ResourceLoader.exists(path), "bgm %s file exists: %s" % [name, path.get_file()])
