extends SceneTree
## 新增纯逻辑自测：gamble / alliance / skills / game_state / ai / serialize
## 运行：godot --headless --path godot --script res://tests/test_logic.gd

const GameConstants = preload("res://scripts/game/constants.gd")
const GameDeck = preload("res://scripts/game/deck.gd")
const GameState = preload("res://scripts/game/game_state.gd")
const GameAi = preload("res://scripts/game/ai/ai.gd")

var _failures: int = 0

func _initialize() -> void:
	_test_game_state()
	_test_gamble()
	_test_alliance()
	_test_skills()
	_test_ai()
	_test_serialize()
	if _failures == 0:
		print("PASS: all logic tests")
	else:
		push_error("FAIL: %d logic test(s) failed" % _failures)
	quit(_failures)

func _check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok - ", msg)
	else:
		_failures += 1
		push_error("  FAIL - " + msg)

# ===== 测试辅助：建一个已初始化的 4 人局 =====

func _make_state(chars: Array = [1, 2, 3, 4], use_weather: bool = false, round: int = 1) -> Dictionary:
	var state: Dictionary = GameState.create_game_state()
	GameState.init_game(state, chars, use_weather, round)
	return state

## 把当前玩家切到指定角色（init_game 会按 speed 重排玩家顺序）
func _set_current(state: Dictionary, char_id: int) -> Dictionary:
	for i in range(state["players"].size()):
		if int(state["players"][i]["characterId"]) == char_id:
			state["currentPlayerIndex"] = i
			state["step"] = GameConstants.STEP["PICK_ACTION"]
			return state["players"][i]
	return {}

# ===== game_state =====

func _test_game_state() -> void:
	print("game_state")
	var state: Dictionary = _make_state()
	_check(state["players"].size() == 4, "init 4 players")
	_check(state["phase"] == GameConstants.PHASE["PEACE"], "peace phase by default")
	_check(int(state["round"]) == 1, "round 1")
	_check(state["step"] == GameConstants.STEP["PICK_ACTION"], "step pickAction")
	# 行动顺序按 speed 降序：id1(10) id2(9) id3(10) id4(9) → 同速按 index
	_check(int(state["players"][0]["index"]) == 0, "reindexed 0")
	_check(state["messageLog"].size() > 0, "init logs")

	# 和平期攻击被禁止
	GameState.start_attack(state)
	_check(state["step"] == GameConstants.STEP["PICK_ACTION"], "attack blocked in peace")
	var has_peace_log: bool = false
	for m in state["messageLog"]:
		if String(m).find("和平阶段") >= 0:
			has_peace_log = true
	_check(has_peace_log, "peace log written")

	# 第4回合后可攻击
	var state4: Dictionary = _make_state([1, 2, 3, 4], false, 4)
	state4["currentPlayerIndex"] = 0
	state4["step"] = GameConstants.STEP["PICK_ACTION"]
	GameState.start_attack(state4)
	_check(state4["step"] == GameConstants.STEP["ATTACK_SHOW_CARD"], "attack allowed at round 4")

# ===== gamble =====

func _test_gamble() -> void:
	print("gamble")
	var state: Dictionary = _make_state([1, 2, 3, 4], false, 4)
	state["currentPlayerIndex"] = 0
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	var player: Dictionary = state["players"][0]
	GameState.execute_gamble(state)
	_check(state["step"] == GameConstants.STEP["GAMBLE_PICK"], "gamble sets gamblePick")
	_check(state.has("pendingGamble"), "pendingGamble exists")
	var cards: Array = state["pendingGamble"]["drawnCards"]
	_check(cards.size() == 2, "draw 2 cards")
	_check(player["relations"]["consecutiveGambles"] == 1, "consecutiveGambles 1")

	# 提交陷阱 + 诱饵
	GameState.submit_gamble(state, 0, 1)
	_check(player["trap"] != null, "trap set")
	_check(player["bait"] != null, "bait set")
	_check(player["trap"]["faceUp"] == false, "trap face down")
	_check(player["bait"]["faceUp"] == true, "bait face up")
	_check(state["step"] == GameConstants.STEP["PICK_ACTION"], "back to pickAction")

	# 连续赌命3次惩罚
	var s2: Dictionary = _make_state([1, 2, 3, 4], false, 4)
	var p2: Dictionary = _set_current(s2, 1)
	for i in range(3):
		s2["endTurn"] = false  # 保持同一玩家连续行动
		s2["step"] = GameConstants.STEP["PICK_ACTION"]
		GameState.execute_gamble(s2)
		GameState.submit_gamble(s2, 0, 1)
	_check(p2["relations"]["gamblePenalty"] == true, "gamble penalty after 3")

# ===== alliance =====

func _test_alliance() -> void:
	print("alliance")
	# 第5回合 → phase 已切到 NORMAL，start_ally 才可用
	var state: Dictionary = _make_state([1, 2, 3, 4], false, 5)
	var p0: Dictionary = _set_current(state, 1)
	GameState.start_ally(state)
	_check(state["step"] == "allyPick", "start ally sets allyPick")
	GameState.execute_ally(state, 1)
	var p1: Dictionary = state["players"][1]
	_check(p0["relations"]["allyIndex"] == 1, "ally index set")
	_check(p1["relations"]["allyIndex"] == 0, "mutual ally")
	_check(p0["relations"]["allianceTurns"] == 5, "alliance turns 5")

	# 背刺
	_set_current(state, 1)
	GameState.execute_betray(state)
	_check(p0["relations"]["betrayalPenalty"] == 10, "betray penalty 10")
	_check(p0["relations"]["allyIndex"] == null, "alliance dissolved")

# ===== skills =====

## 找一个存活且不是当前玩家的目标
func _first_target(state: Dictionary) -> Dictionary:
	var cur_idx: int = int(state.get("currentPlayerIndex", 0))
	for p in state.get("players", []):
		if p.get("alive", false) and int(p.get("index", -1)) != cur_idx:
			return p
	return {}

func _test_skills() -> void:
	print("skills")

	# 钟离护盾
	var s1: Dictionary = _make_state([2, 1, 3, 4], false, 4)
	var zl: Dictionary = _set_current(s1, 2)
	GameState.execute_skill(s1)
	_check(zl["defensePile"].size() == 1, "zhongli shield added")
	_check(int(zl["defensePile"][0]["value"]) >= 18, "shield value >= 18")
	_check(int(zl["skillUses"]) == 0, "zhongli skill used")

	# 温迪：第10回合解锁
	var s2: Dictionary = _make_state([1, 2, 3, 4], false, 4)
	_set_current(s2, 1)
	GameState.execute_skill(s2)
	_check(s2["step"] != GameConstants.STEP["ATTACK_SHOW_CARD"], "venti locked before round 10")
	var s3: Dictionary = _make_state([1, 2, 3, 4], false, 10)
	_set_current(s3, 1)
	GameState.execute_skill(s3)
	_check(s3["step"] == GameConstants.STEP["ATTACK_SHOW_CARD"], "venti unlocked at round 10")
	_check(s3.has("pendingVentiCards"), "venti cards pending")

	# 雷电将军：第10回合解锁 → 选目标 → 27伤害
	var s4: Dictionary = _make_state([3, 2, 1, 4], false, 10)
	_set_current(s4, 3)
	var target: Dictionary = _first_target(s4)
	GameState.execute_skill(s4)
	_check(s4["step"] == GameConstants.STEP["SKILL_PICK_TARGET"], "raiden pick target")
	GameState.execute_raiden_skill(s4, int(target["index"]))
	_check(target["hp"] == 0, "raiden 27 dmg kills 11hp target")

	# 纳西妲
	var s5: Dictionary = _make_state([4, 2, 1, 3], false, 4)
	_set_current(s5, 4)
	GameState.execute_skill(s5)
	_check(s5["step"] == GameConstants.STEP["SKILL_NAHIDA"], "nahida scry")
	_check(s5.has("scryCards"), "scry cards set")
	GameState.submit_nahida_scry(s5, [0, 1, 2, 3, 4])
	_check(s5["step"] == GameConstants.STEP["PICK_ACTION"], "nahida submit back")

	# 芙宁娜：第4回合解锁（用第5回合确保 phase=NORMAL）
	var s6: Dictionary = _make_state([5, 2, 1, 3], false, 5)
	var fn: Dictionary = _set_current(s6, 5)
	GameState.execute_skill(s6)
	_check(s6["step"] == GameConstants.STEP["SKILL_PICK_TARGET"], "furina pick target")
	_check(fn["statusEffects"]["ignoreTrapThisTurn"] == true, "furina ignore trap")
	GameState.execute_furina_swap(s6, int(_first_target(s6)["index"]))
	_check(s6["pendingFurinaTarget"] == false, "furina swap done")

	# 风堇
	var s7: Dictionary = _make_state([8, 2, 1, 3], false, 5)
	var fj: Dictionary = _set_current(s7, 8)
	var fj_target: Dictionary = _first_target(s7)
	GameState.execute_skill(s7)
	_check(s7["step"] == GameConstants.STEP["SKILL_PICK_TARGET"], "fenjin pick target")
	var max_hp_before: int = int(fj["maxHp"])
	GameState.execute_fenjin_skill(s7, int(fj_target["index"]))
	_check(int(fj["maxHp"]) == max_hp_before + 3, "fenjin maxHp +3")
	_check(int(fj["hp"]) == int(fj["maxHp"]), "fenjin full heal")
	_check(not s7.has("_fenjinHeal"), "fenjin marker cleared")

	# 莉奈娅（偷牌）
	var s8: Dictionary = _make_state([9, 2, 1, 3], false, 5)
	var ln: Dictionary = _set_current(s8, 9)
	var ln_target: Dictionary = _first_target(s8)
	GameState.execute_skill(s8)
	_check(s8["step"] == GameConstants.STEP["LINIYA_PICK"], "liniya pick")
	GameState.execute_liniya_skill(s8, int(ln_target["index"]), 1)
	_check(ln["statusEffects"]["stealTarget"] != null, "liniya steal set")
	_check(int(ln["statusEffects"]["damageBonus"].get(int(ln_target["index"]), 0)) == 2, "liniya dmg bonus +2")

	# 爱蜜莉雅（冻结）
	var s9: Dictionary = _make_state([10, 2, 1, 3], false, 4)
	_set_current(s9, 10)
	var am_target: Dictionary = _first_target(s9)
	GameState.execute_skill(s9)
	_check(s9["step"] == GameConstants.STEP["SKILL_PICK_TARGET"], "aimiliya pick target")
	GameState.execute_aimiliya_skill(s9, int(am_target["index"]))
	_check(am_target["statusEffects"]["frozenBy"] == int(s9["currentPlayerIndex"]), "target frozen")

# ===== AI =====

func _test_ai() -> void:
	print("ai")
	var state: Dictionary = _make_state([1, 2, 3, 4], false, 4)
	state["currentPlayerIndex"] = 0
	state["players"][0]["isAI"] = true
	state["players"][0]["aiDifficulty"] = "easy"
	var top: Dictionary = GameAi.decide_top_action(state)
	_check(top.has("action"), "ai top decision has action")
	var valid: Array = ["attack", "defense", "gamble", "skill"]
	_check(valid.has(top["action"]), "ai action valid: %s" % top["action"])
	var target_dec: Dictionary = GameAi.decide_target(state, {"action": "attack", "characterId": 1})
	_check(target_dec.has("targetIndex"), "ai target decision")
	# 赌命选牌
	var cards: Array = [{"value": 10, "faceUp": true}, {"value": 7, "faceUp": true}]
	var gamble_dec: Dictionary = GameAi.decide_gamble_pick(state, cards)
	_check(gamble_dec.has("trapIdx") and gamble_dec.has("baitIdx"), "ai gamble pick")
	# 熟练 AI
	state["players"][0]["aiDifficulty"] = "skilled"
	var top2: Dictionary = GameAi.decide_top_action(state)
	_check(valid.has(top2["action"]), "skilled ai valid action")
	# 地狱 AI
	state["players"][0]["aiDifficulty"] = "hell"
	var top3: Dictionary = GameAi.decide_top_action(state)
	_check(valid.has(top3["action"]), "hell ai valid action")
	# 回归：easy AI 温迪在 round<10 时不选大招（否则 execute_skill 失败→AI 循环空转卡死）
	var st2: Dictionary = _make_state([1, 2, 3, 4], false, 4)
	st2["currentPlayerIndex"] = 0
	st2["players"][0]["isAI"] = true
	st2["players"][0]["aiDifficulty"] = "easy"
	st2["players"][0]["characterId"] = 1  # 温迪
	st2["players"][0]["skillUses"] = 3
	st2["round"] = 6
	var peace_phase: String = "peace"
	st2["phase"] = peace_phase
	var early_no_skill: bool = true
	for i in range(20):
		if String(GameAi.decide_top_action(st2).get("action", "")) == "skill":
			early_no_skill = false
	_check(early_no_skill, "easy venti no skill before round 10 / peace")
	# round>=10 且非和平期 → easy 温迪可选大招
	st2["round"] = 12
	st2["phase"] = "normal"
	var can_skill_late: bool = false
	for i in range(40):
		if String(GameAi.decide_top_action(st2).get("action", "")) == "skill":
			can_skill_late = true
			break
	_check(can_skill_late, "easy venti can skill after round 10")

# ===== serialize =====

func _test_serialize() -> void:
	print("serialize")
	var state: Dictionary = _make_state([1, 2, 3, 4], true, 4)
	# 打一点状态：执行一次防御
	state["currentPlayerIndex"] = 0
	state["step"] = GameConstants.STEP["PICK_ACTION"]
	state["deck"] = GameDeck.create_full_deck(1)
	GameState.execute_defense(state)
	_check(state["players"][0]["defensePile"].size() == 1, "defense before save")

	var save_data: Dictionary = GameState.serialize_game_state(state)
	_check(int(save_data["version"]) == 2, "save version 2")
	_check(save_data["players"].size() == 4, "save 4 players")
	_check(save_data["players"][0]["defensePile"].size() == 1, "save defense pile")

	# 读档到新状态
	var state2: Dictionary = GameState.create_game_state()
	var ok: bool = GameState.deserialize_game_state(state2, save_data)
	_check(ok, "deserialize ok")
	_check(state2["players"].size() == 4, "restored 4 players")
	_check(state2["players"][0]["defensePile"].size() == 1, "restored defense pile")
	_check(state2["useWeather"] == true, "weather flag restored")
