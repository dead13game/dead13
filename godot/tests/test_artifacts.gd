extends SceneTree
## 圣遗物系统测试：开局选遗物 → 击破计数 → 圣言自明 → 伤害加成/大招限制 → 回合衰减
## 对应 update_log/圣遗物系统.md

const GameState = preload("res://scripts/game/game_state.gd")
const GameArtifacts = preload("res://scripts/game/artifacts.gd")
const GameConstants = preload("res://scripts/game/constants.gd")

var _failures: int = 0

func _initialize() -> void:
	_test_initial()
	_test_break_count()
	_test_holy_word_execute()
	_test_damage_boost()
	_test_skill_restriction()
	_test_round_tick()
	_test_use_limit()
	print("RESULT: %s" % ("PASS: all artifact tests" if _failures == 0 else "FAILED: %d" % _failures))
	quit(_failures)

func _ok(cond: bool, msg: String) -> void:
	if cond:
		print("  ok - %s" % msg)
	else:
		printerr("  FAIL - %s" % msg)
		_failures += 1

func _make_game() -> Dictionary:
	var state: Dictionary = GameState.create_game_state()
	GameState.init_game(state, [1, 2], false, 1)
	# 玩家1 开局圣遗物（模拟 character_select 的选择）
	state["players"][0]["artifactId"] = 1
	state["players"][0]["holyWordUses"] = 2
	# 进入行动步骤（execute_holy_word 需要）
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	return state

func _test_initial() -> void:
	print("artifact_init")
	var state := _make_game()
	var p: Dictionary = state["players"][0]
	_ok(p.get("artifactId", null) == 1, "玩家1 携带圣遗物1（角斗士的终幕礼）")
	_ok(int(p.get("breakCount", 0)) == 0, "击破计数初始 0")
	_ok(int(p.get("holyWordUses", 0)) == 2, "圣言自明每局 2 次")
	_ok(not p.get("artifactActive", false), "圣遗物初始未激活")

func _test_break_count() -> void:
	print("break_count")
	var state := _make_game()
	var p: Dictionary = state["players"][0]
	# 破 4 张防御牌 = 4 计数
	GameState.record_defense_break(p, 4, state)
	_ok(int(p.get("breakCount", 0)) == 4, "破 4 张防御牌 → 4 计数")
	_ok(not GameState.can_use_holy_word(state, p), "4 计数 < 8 不可发动")
	# 陷阱 +2
	GameState.record_trap_break(p, state)
	GameState.record_trap_break(p, state)
	_ok(int(p.get("breakCount", 0)) == 8, "再破 2 次陷阱(+2×2) → 8 计数")
	_ok(GameState.can_use_holy_word(state, p), "8 计数可发动圣言自明")

func _test_holy_word_execute() -> void:
	print("holy_word_execute")
	var state := _make_game()
	var p: Dictionary = state["players"][0]
	p["breakCount"] = 8
	var ok: bool = GameState.execute_holy_word(state)
	_ok(ok, "执行圣言自明成功")
	_ok(int(p.get("breakCount", 0)) == 0, "消耗 8 计数")
	_ok(int(p.get("holyWordUses", 0)) == 1, "剩余 1 次")
	_ok(p.get("artifactActive", false), "圣遗物激活")
	_ok(int(p.get("artifactRoundsLeft", 0)) == 2, "持续 2 回合")
	_ok(state.get("step", "") == GameConstants.STEP["PICK_ACTION"], "不结束回合（获得额外行动，仍可行动）")

func _test_damage_boost() -> void:
	print("damage_boost")
	var state := _make_game()
	var p: Dictionary = state["players"][0]
	# 未激活时无加成
	var r0: Dictionary = GameState.apply_artifact_damage_boost(p, 5, state)
	_ok(int(r0["value"]) == 5, "未激活：5 点不变")
	# 激活后 +50% 向上取整
	p["artifactActive"] = true
	p["artifactRoundsLeft"] = 2
	var r1: Dictionary = GameState.apply_artifact_damage_boost(p, 5, state)
	_ok(int(r1["value"]) == 8, "激活后 5 → 8（+50% 向上取整）")
	# 圣遗物2 暴击
	state["players"][0]["artifactId"] = 2
	p["artifactActive"] = true
	var crit_hit := false
	var values: Array = []
	for i in range(30):
		var r2: Dictionary = GameState.apply_artifact_damage_boost(p, 4, state)
		values.append(int(r2["value"]))
		if r2.get("crit", false):
			crit_hit = true
	_ok(crit_hit, "圣遗物2 存在暴击（×2 伤害）")
	_ok(values.has(8), "暴击值 4×2=8 出现")

func _test_skill_restriction() -> void:
	print("skill_restriction")
	var state := _make_game()
	# 圣遗物激活期间：温迪/雷电/风堇 大招禁用
	for cid in [1, 3, 8]:
		var p: Dictionary = state["players"][0]
		p["characterId"] = cid
		p["skillUses"] = 1
		p["artifactActive"] = true
		p["alive"] = true
		_ok(not GameState.can_use_skill(state, p), "角色%d 激活期间禁用大招" % cid)
		p["artifactActive"] = false
		_ok(GameState.can_use_skill(state, p), "角色%d 非激活可放大招" % cid)
	# 其他角色不受限
	var p2: Dictionary = state["players"][0]
	p2["characterId"] = 2  # 钟离
	p2["skillUses"] = 1
	p2["artifactActive"] = true
	p2["alive"] = true
	_ok(GameState.can_use_skill(state, p2), "钟离激活期间大招不受限")

func _test_round_tick() -> void:
	print("round_tick")
	var state := _make_game()
	var p: Dictionary = state["players"][0]
	p["breakCount"] = 8
	GameState.execute_holy_word(state)
	_ok(p.get("artifactActive", false), "发动后激活")
	GameArtifacts.tick_artifact_rounds(state)
	_ok(p.get("artifactActive", false), "第 1 回合结束仍激活")
	GameArtifacts.tick_artifact_rounds(state)
	_ok(not p.get("artifactActive", false), "第 2 回合结束效果消失")

func _test_use_limit() -> void:
	print("use_limit")
	var state := _make_game()
	var p: Dictionary = state["players"][0]
	# 第一次发动
	p["breakCount"] = 8
	GameState.execute_holy_word(state)
	# 激活期间不可再次发动（防叠加）
	p["breakCount"] = 8
	_ok(not GameState.can_use_holy_word(state, p), "激活期间不可再次发动（防叠加）")
	# 效果结束后再凑 8 计数，第二次发动
	GameArtifacts.tick_artifact_rounds(state)
	GameArtifacts.tick_artifact_rounds(state)
	_ok(not p.get("artifactActive", false), "效果已结束")
	p["breakCount"] = 8
	var ok2: bool = GameState.execute_holy_word(state)
	_ok(ok2, "第二次发动成功")
	_ok(int(p.get("holyWordUses", 0)) == 0, "2 次用尽")
	p["breakCount"] = 8
	GameArtifacts.tick_artifact_rounds(state)
	GameArtifacts.tick_artifact_rounds(state)
	_ok(not GameState.can_use_holy_word(state, p), "次数用尽不可再发动")
