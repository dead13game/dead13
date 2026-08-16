class_name GameSoundEvents
## 音效事件记录（从 src/game/soundEvents.js 移植）
## 纯数据：只把音效事件写进 state.soundQueue，不负责播放

static var _sound_seq: int = 0

static func record_sound(state: Dictionary, type: String) -> void:
	if not state.has("soundQueue"):
		state["soundQueue"] = []
	_sound_seq += 1
	state["soundQueue"].append({"type": type, "seq": _sound_seq})
	if state["soundQueue"].size() > 32:
		state["soundQueue"] = state["soundQueue"].slice(state["soundQueue"].size() - 32)
