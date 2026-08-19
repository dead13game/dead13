class_name GameSoundEvents
## 音效事件记录（从 src/game/soundEvents.js 移植）
## 纯数据：只把音效事件写进 state.soundQueue，不负责播放

static func record_sound(state: Dictionary, type: String) -> void:
	if not state.has("soundQueue"):
		state["soundQueue"] = []
	# 每 state 独立 seq（避免全局计数器导致跨模式/残留串音）
	state["_soundSeq"] = int(state.get("_soundSeq", 0)) + 1
	state["soundQueue"].append({"type": type, "seq": int(state["_soundSeq"])})
	if state["soundQueue"].size() > 32:
		state["soundQueue"] = state["soundQueue"].slice(state["soundQueue"].size() - 32)
