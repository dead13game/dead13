extends SceneTree
## 模拟宇宙 UI 流程自动化验证（游戏内运行）
## 用法：godot --path godot --script res://tests/test_uni_ui.gd
## 直接驱动逻辑层：开局 → 打穿 battle 层 → 验证胜利奖励 + 祝福三选一

const UniState = preload("res://scripts/game/uni_state.gd")
const UniConstants = preload("res://scripts/game/uni_constants.gd")
const UniBuffs = preload("res://scripts/game/uni_buffs.gd")
const UniCombat = preload("res://scripts/game/uni_combat.gd")
const UniEvents = preload("res://scripts/game/uni_events.gd")
const UniCore = preload("res://scripts/game/uni_core.gd")
const GameSoundEvents = preload("res://scripts/game/sound_events.gd")

var _failures: int = 0

func _check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok - ", msg)
	else:
		_failures += 1
		push_error("  FAIL - " + msg)

func _initialize() -> void:
	# 造个强队：菜月昴 + 开发者（12 伤害 1000）+ 2 个肉盾
	var s: Dictionary = UniState.create_uni_state([12, 2, 3, 4])
	# 给开发者指令没冷却，可每回合开大打穿
	var round_guard: int = 0
	var won: bool = false
	while round_guard < 60:
		round_guard += 1
		var c: Variant = s.get("combat")
		if c == null or not c is Dictionary or c.is_empty():
			# 层推进或开始战斗
			var r: Variant = s.get("region", null)
			if r == null:
				UniState.advance_floor(s)
				continue
			UniCombat.start_combat(s)
			continue
		var ph: String = String(c.get("phase", ""))
		if ph == "won":
			won = true
			break
		if ph == "lost":
			break
		if ph == "player-action":
			var ai: int = int(c.get("activeIdx", 0))
			var t: Dictionary = s["team"][ai]
			if int(t.get("charId", 0)) == 12:
				# 开发者：开大全体 1000
				var r: Dictionary = UniCombat.player_skill(s, null, {})
				if not r.get("ok", false):
					# 冷却？开发者 cd=0，不应该
					UniCombat.player_attack(s, 0)
			else:
				# 其他角色防御
				UniCombat.player_defense(s, ai)
		elif ph == "enemy-announce":
			var ann: Dictionary = UniCombat.enemy_announce(s)
			if ann.get("playing", false):
				UniCombat.enemy_resolve(s)
		elif ph == "wave-clear":
			UniCombat.choose_third_wave(s, true)
		else:
			break
	_check(won, "developer team wins battle layer, phase=%s round=%d" % [String(s.get("combat", {}).get("phase", "?")), int(s.get("combat", {}).get("round", 0))])
	if won:
		_check(s["pendingBlessingPicks"].size() >= 1, "blessing picks after win: %d" % s["pendingBlessingPicks"].size())
		_check(int(s["combat"]["lastReward"]["shards"]) >= 30, "reward shards >= 30")
		# 祝福三选一
		var before: int = s["blessings"].size()
		var cands: Array = s["pendingBlessingPicks"][0]["candidates"]
		if cands.size() > 0:
			var pick: Dictionary = UniEvents.choose_blessing_pick(s, String(cands[0]))
			_check(pick["ok"] == true, "choose blessing pick ok")
			_check(s["blessings"].size() == before + 1, "blessing gained")
	# 层推进验证
	var floor_before: int = int(s.get("floor", 1))
	UniState.advance_floor(s)
	_check(int(s.get("floor", 1)) == floor_before + 1, "advance floor")
	if _failures == 0:
		print("PASS: uni ui flow")
	else:
		push_error("FAIL: %d uni ui flow check(s) failed" % _failures)
	quit(_failures)
