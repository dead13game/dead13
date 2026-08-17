extends Node
## 音效播放器（从 src/audio/SoundManager.js 移植）
## autoload 单例：_process 轮询各模式的 state.soundQueue 播放音效；按场景切换 BGM
## 用法：AudioManager.ensure(state) 后由 _process 自动消费；play_bgm("menu"|"battle1"|"battle2")

const SFX_FILES: Dictionary = {
	"attack": "res://assets/audio/抽牌音效.wav",
	"defense": "res://assets/audio/放置防御牌和陷阱牌.wav",
	"gamble": "res://assets/audio/抽牌音效.wav",
	"skill": "res://assets/audio/释放技能.wav",
	"shield_break": "res://assets/audio/击破防御或陷阱.wav",
	"kill": "res://assets/audio/击杀音效.mp3",
	"match_end": "res://assets/audio/释放技能.wav",
	"trap_break": "res://assets/audio/击破防御或陷阱.wav",
	"trap_reflect": "res://assets/audio/掉血音效(敌我均生效).wav",
	"trap_tie": "res://assets/audio/掉血音效(敌我均生效).wav",
	"hit": "res://assets/audio/掉血音效(敌我均生效).wav",
	"lose": "res://assets/audio/玩家死亡失败音效.wav",
}

const BGM_FILES: Dictionary = {
	"menu": "res://assets/audio/主菜单BGM.mp3",
	"battle1": "res://assets/audio/战斗BGM1.mp3",
	"battle2": "res://assets/audio/战斗BGM2.mp3",
}

const THROTTLE_MS: int = 120

var _cache: Dictionary = {}          # type -> AudioStreamPlayer
var _last_played: Dictionary = {}    # type -> msec
var _muted: bool = false
var _volume: float = 0.8
var _bgm_volume: float = 0.5
var _bgm: AudioStreamPlayer = null
var _bgm_name: String = ""
var _bgm_playing: bool = false

## 已跟踪的 soundQueue 长度（每状态一个）
var _queue_tracked: Dictionary = {}  # state_id -> last_seq

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS

func _process(_delta: float) -> void:
	_check_state(GameManager.state)
	_check_state(GameManager.solo_state)
	_check_state(GameManager.uni_state)
	_check_state(GameManager.wc_state)
	_check_state(GameManager.league_state)

## 轮询一个状态的 soundQueue，播放新事件
func _check_state(state: Dictionary) -> void:
	if state.is_empty() or not state.has("soundQueue"):
		return
	var queue: Array = state["soundQueue"]
	if queue.is_empty():
		return
	# 用状态引用本身作跟踪键（Dictionary 引用作 key 稳定，内容变化不影响）
	var last_seq: int = int(_queue_tracked.get(state, 0))
	var max_seq: int = 0
	for entry in queue:
		var seq: int = int(entry.get("seq", 0))
		var type: String = String(entry.get("type", ""))
		max_seq = maxi(max_seq, seq)
		if seq > last_seq:
			play(type)
	_queue_tracked[state] = max_seq

## 播放音效（含节流）
func play(type: String) -> void:
	if _muted or not SFX_FILES.has(type):
		return
	var now_ms: int = Time.get_ticks_msec()
	var last: int = int(_last_played.get(type, 0))
	if now_ms - last < THROTTLE_MS:
		return
	_last_played[type] = now_ms
	var player: AudioStreamPlayer = _get_player(type)
	if player != null:
		player.pitch_scale = 1.0
		player.play()

func _get_player(type: String) -> AudioStreamPlayer:
	if _cache.has(type):
		return _cache[type]
	var path: String = String(SFX_FILES[type])
	if not ResourceLoader.exists(path):
		return null
	var stream: AudioStream = load(path)
	if stream == null:
		return null
	var player := AudioStreamPlayer.new()
	player.stream = stream
	player.volume_db = linear_to_db(_volume)
	add_child(player)
	_cache[type] = player
	return player

## 场景 BGM 切换（menu / battle1 / battle2）
func play_bgm(name: String) -> void:
	if _bgm != null and _bgm_name == name and _bgm_playing:
		return
	if _bgm != null:
		_bgm.stop()
		_bgm = null
	_bgm_name = name
	var path: String = String(BGM_FILES.get(name, ""))
	if path == "" or not ResourceLoader.exists(path):
		_bgm_playing = false
		return
	var stream: AudioStream = load(path)
	if stream == null:
		_bgm_playing = false
		return
	_bgm = AudioStreamPlayer.new()
	_bgm.stream = stream
	_bgm.volume_db = linear_to_db(_bgm_volume)
	_bgm.finished.connect(func(): _bgm_playing = false)
	add_child(_bgm)
	_bgm.play()
	_bgm_playing = true

func stop_bgm() -> void:
	if _bgm != null:
		_bgm.stop()
		_bgm = null
	_bgm_name = ""
	_bgm_playing = false

func set_muted(m: bool) -> void:
	_muted = m
	if _bgm != null:
		_bgm.stream_paused = m

func set_volume(v: float) -> void:
	_volume = v
	for player in _cache.values():
		if player is AudioStreamPlayer:
			player.volume_db = linear_to_db(v)

func set_bgm_volume(v: float) -> void:
	_bgm_volume = v
	if _bgm != null:
		_bgm.volume_db = linear_to_db(v)
