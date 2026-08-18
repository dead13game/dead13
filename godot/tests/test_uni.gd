extends SceneTree
## 模拟宇宙纯逻辑自测：uni_constants / uni_buffs / uni_core / uni_state / uni_combat / uni_skills / uni_shop / uni_events
## 运行：godot --headless --path godot --script res://tests/test_uni.gd

const UniConstants = preload("res://scripts/game/uni_constants.gd")
const UniBuffs = preload("res://scripts/game/uni_buffs.gd")
const UniCore = preload("res://scripts/game/uni_core.gd")
const UniState = preload("res://scripts/game/uni_state.gd")
const UniCombat = preload("res://scripts/game/uni_combat.gd")
const UniSkills = preload("res://scripts/game/uni_skills.gd")
const UniShop = preload("res://scripts/game/uni_shop.gd")
const UniEvents = preload("res://scripts/game/uni_events.gd")

var _failures: int = 0

func _initialize() -> void:
	_test_constants()
	_test_blessings()
	_test_curios_equations()
	_test_state_and_regions()
	_test_shop()
	_test_events()
	_test_combat_basic()
	_test_combat_full()
	_test_full_run()
	_test_skills()
	_test_serialize_revive()
	if _failures == 0:
		print("PASS: all uni tests")
	else:
		push_error("FAIL: %d uni test(s) failed" % _failures)
	quit(_failures)

func _check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok - ", msg)
	else:
		_failures += 1
		push_error("  FAIL - " + msg)

# ===== 常量 =====

func _test_constants() -> void:
	print("uni_constants")
	_check(UniConstants.plane_mult(1) == 1, "plane 1 mult 1")
	_check(UniConstants.plane_mult(9) == 19, "plane 9 mult 19")
	_check(UniConstants.plane_mult(10) == 22, "plane 10 mult 22 (19+3)")
	_check(UniConstants.plane_mult(11) == 25, "plane 11 mult 25")
	_check(UniConstants.dmg_mult(1) == 1, "dmg mult 1")
	_check(UniConstants.dmg_mult(3) == 2, "dmg mult plane3 = ceil(4*0.5)=2")
	_check(UniConstants.get_plane(1) == 1, "floor 1 plane 1")
	_check(UniConstants.get_plane(11) == 2, "floor 11 plane 2")
	_check(UniConstants.get_plane(31) == 3, "floor 31 plane 3")
	_check(UniConstants.get_plane(61) == 4, "floor 61 plane 4")
	_check(UniConstants.get_layer_type(1) == "battle", "floor 1 battle")
	_check(UniConstants.get_layer_type(10) == "boss", "floor 10 boss")
	_check(UniConstants.get_layer_type(25) == "transform", "floor 25 transform")
	_check(UniConstants.get_layer_type(29) == "rest", "floor 29 rest")
	_check(UniConstants.get_layer_type(45) == "oddity", "floor 45 oddity")
	_check(UniConstants.get_layer_type(75) == "oddity", "floor 75 oddity (transform conflict)")
	_check(UniConstants.get_layer_type(3) == "normal", "floor 3 normal")
	_check(UniBuffs.BLESSINGS.size() >= 59, "blessings table >= 59")
	_check(UniBuffs.CURIOS.size() >= 79, "curios table >= 79")
	_check(UniBuffs.EQUATIONS.size() == 13, "equations table 13")

# ===== 祝福 =====

func _test_blessings() -> void:
	print("uni_blessings")
	var s: Dictionary = UniState.create_uni_state()
	# 获得/强化
	var r1: Dictionary = UniBuffs.gain_blessing(s, "shaojie")
	_check(r1["ok"] == true, "gain blessing ok")
	_check(s["blessings"].size() == 1, "1 blessing")
	var r2: Dictionary = UniBuffs.gain_blessing(s, "shaojie")
	_check(r2.get("enhanced", 1) == 2, "blessing enhanced x2")
	_check(UniBuffs.blessing_mult(s, "shaojie") == 2, "blessing mult 2")
	_check(int(UniBuffs.blessing_val(s, "shaojie", "shieldPct")) == 32, "lv2 shieldPct 32")
	# 无效 id
	var r3: Dictionary = UniBuffs.gain_blessing(s, "nope")
	_check(r3["ok"] == false, "invalid blessing rejected")
	# 随机候选
	var cands: Array = UniBuffs.roll_blessing_candidates(3, 1, 2)
	_check(cands.size() == 3, "3 candidates")
	# 失去
	var removed: Variant = UniBuffs.lose_random_blessing(s)
	_check(removed != null and removed.get("id", "") == "shaojie", "lose random blessing")
	# 三选一
	var picks: Array = UniBuffs.roll_blessing_candidates(3, 3, 3)
	_check(picks.size() == 3, "3-star candidates")
	for id in picks:
		_check(int(UniBuffs.BLESSINGS[id]["star"]) == 3, "candidate %s is 3-star" % id)
	# 修正聚合
	var s2: Dictionary = UniState.create_uni_state()
	UniBuffs.gain_blessing(s2, "jifeng")
	var mods: Dictionary = UniBuffs.get_uni_modifiers(s2)
	_check(float(mods["atkMult"]) == 10.0, "jifeng atkMult 10")
	# 战斗开始钩子（哨戒护盾）
	var s3: Dictionary = UniState.create_uni_state()
	UniBuffs.gain_blessing(s3, "shaojie")
	UniBuffs.trigger_on_combat_start(s3)
	var any_shield: bool = false
	for t in s3["team"]:
		if float(t["shield"]) > 0:
			any_shield = true
	_check(any_shield, "shaojie shield on combat start")
	# 方程展开判定
	var s4: Dictionary = UniState.create_uni_state()
	_check(UniBuffs.is_equation_unlocked(s4, "shouzu") == false, "shouzu locked without blessings")

# ===== 奇物 / 方程 =====

func _test_curios_equations() -> void:
	print("uni_curios_equations")
	var s: Dictionary = UniState.create_uni_state()
	# 奇物
	var r1: Dictionary = UniBuffs.gain_curio(s, "lens")
	_check(r1["ok"] == true, "gain curio lens")
	var lv_sum: int = 0
	for t in s["team"]:
		lv_sum += int(t["skillLevel"])
	_check(lv_sum == 4 + 8, "lens +2 skill level all")
	var r2: Dictionary = UniBuffs.gain_curio(s, "lens")
	_check(r2.get("enhanced", 1) == 2, "curio enhanced")
	var r3: Dictionary = UniBuffs.gain_curio(s, "nope")
	_check(r3["ok"] == false, "invalid curio rejected")
	# 随机奇物
	var cid: String = UniBuffs.roll_curio(true, 1, 2)
	_check(cid != "", "roll curio")
	# 失去奇物
	var lost: Variant = UniBuffs.lose_random_curio(s)
	_check(lost != null and lost.get("id", "") == "lens", "lose curio")
	# 方程
	var eid: String = UniBuffs.roll_equation(1, 3)
	_check(eid != "", "roll equation")
	var r4: Dictionary = UniBuffs.gain_equation(s, eid)
	_check(r4["ok"] == true, "gain equation")
	_check(s["equations"].size() == 1, "1 equation")
	# 重复方程转碎片
	var shards_before: int = int(s["shards"])
	var r5: Dictionary = UniBuffs.gain_equation(s, eid)
	_check(r5.get("dupe", false) == true, "dupe equation -> shards")
	_check(int(s["shards"]) > shards_before, "shards increased")

# ===== 状态与区域 =====

func _test_state_and_regions() -> void:
	print("uni_state_regions")
	var s: Dictionary = UniState.create_uni_state()
	_check(s["floor"] == 1, "floor 1")
	_check(s["team"].size() == 4, "team 4")
	_check(s["region"] != null and s["region"]["type"] == "battle", "region 1 battle")
	_check(int(s["shards"]) == 0, "start shards 0")
	_check(s["pendingBlessingPicks"] is Array, "pending picks array")
	# 层推进：floor 2 = normal → 2 选 1
	var adv: Variant = UniState.advance_floor(s)
	_check(adv != null and adv["type"] == "normal", "floor 2 normal choice")
	_check(s["pendingChoice"] != null and s["pendingChoice"]["options"].size() == 2, "2 options")
	var choose: Dictionary = UniState.choose_normal_content(s, 0)
	_check(choose["ok"] == true, "choose content ok")
	_check(s["region"] != null and s["region"]["type"] == String(choose["type"]), "region set")
	# 财富区域加碎片
	var s2: Dictionary = UniState.create_uni_state()
	s2["region"] = {"type": "fortune"}
	UniState.enter_region(s2)
	_check(int(s2["shards"]) == 300, "fortune +300")
	# 休整回满
	var s3: Dictionary = UniState.create_uni_state()
	s3["region"] = {"type": "rest"}
	for t in s3["team"]:
		t["hp"] = 1.0
	UniState.enter_region(s3)
	var full: bool = true
	for t in s3["team"]:
		if float(t["hp"]) != float(t["maxHp"]):
			full = false
	_check(full, "rest full heal")
	# 首领层工作台重置
	var s4: Dictionary = UniState.create_uni_state()
	s4["region"] = {"type": "boss"}
	UniState.enter_region(s4)
	_check(int(s4["heat"]) == 5, "boss heat 5")
	_check(int(s4["overwritePrice"]) == 25, "overwrite price 25")
	# 普通层判断
	var s5: Dictionary = UniState.create_uni_state()
	_check(UniState.is_normal_floor(s5) == false, "floor 1 not normal")

# ===== 商店 =====

func _test_shop() -> void:
	print("uni_shop")
	var s: Dictionary = UniState.create_uni_state()
	UniState.enter_region(s)  # 确保 region battle 进入（无副作用）
	s["region"] = {"type": "shop"}
	var stock: Dictionary = UniShop.create_shop_stock(s)
	_check(stock["blessing"].size() == 3 + 4 + 3, "blessing stock 10")
	_check(stock["curio"].size() == 4 + 4, "curio stock 8")
	_check(stock["equation"].size() == 1 + 1 + 1, "equation stock 3")
	# 价格
	_check(UniShop.shop_price(s, "blessing", 1) == 80, "blessing 1-star 80")
	# 购买
	UniCore.add_shards(s, 500)
	var buy: Dictionary = UniShop.shop_buy(s, "blessing", 0)
	_check(buy["ok"] == true and buy["price"] == 80, "buy blessing ok")
	var buy2: Dictionary = UniShop.shop_buy(s, "blessing", 0)
	_check(buy2["ok"] == false and buy2["reason"] == "已售出", "sold out")
	# 热量强化
	UniBuffs.gain_blessing(s, "shaojie")
	s["heat"] = 5
	var hs: Dictionary = UniShop.heat_strengthen(s, 0)
	_check(hs["ok"] == true and hs["heatLeft"] == 4, "heat strengthen cost 1")
	# 覆写
	var ow: Dictionary = UniShop.overwrite_blessing(s, 0)
	_check(ow["ok"] == true, "overwrite blessing")
	_check(int(s["overwritePrice"]) == 50, "overwrite price 25->50")

# ===== 事件 =====

func _test_events() -> void:
	print("uni_events")
	var s: Dictionary = UniState.create_uni_state()
	# 祝福三选一
	var r1: Dictionary = UniEvents.apply_event_option(s, "caravan", 0)
	_check(r1["ok"] == true, "caravan option ok")
	_check(s["pendingBlessingPicks"].size() == 1, "1 pending pick")
	var pick_queue: Array = s["pendingBlessingPicks"]
	var cands: Array = pick_queue[0]["candidates"]
	var pick: Dictionary = UniEvents.choose_blessing_pick(s, String(cands[0]))
	_check(pick["ok"] == true, "choose blessing pick")
	_check(s["pendingBlessingPicks"].size() == 0, "queue drained")
	# 事件战斗
	var s2: Dictionary = UniState.create_uni_state()
	var r2: Dictionary = UniEvents.apply_event_option(s2, "abyss", 0)
	_check(r2["ok"] == true and r2["outcome"].has("battle"), "abyss battle option")
	_check(s2["pendingEventReward"] != null, "pending event reward set")
	# 医疗
	var s3: Dictionary = UniState.create_uni_state()
	var r3: Dictionary = UniEvents.apply_event_option(s3, "medkit", 1)
	_check(r3["ok"] == true, "medkit option")
	_check(int(s3["items"]["medkit"]) == 2, "medkit +2")
	# 战术 buff
	var s4: Dictionary = UniState.create_uni_state()
	var r4: Dictionary = UniEvents.apply_event_option(s4, "manual", 0)
	_check(s4["nextBattleBuffs"].has("atkUp"), "manual atkUp buff")
	# 冒险：骰子
	var s5: Dictionary = UniState.create_uni_state()
	UniCore.add_shards(s5, 200)
	var r5: Dictionary = UniEvents.apply_event_option(s5, "dice", 0)
	_check(r5["outcome"].has("gamble"), "dice gamble")
	# 冒险：翻牌
	var s6: Dictionary = UniState.create_uni_state()
	var r6: Dictionary = UniEvents.apply_event_option(s6, "cards", 0)
	_check(r6["outcome"].has("fortuneCard"), "fortune card")
	# 冒险：抽签
	var s7: Dictionary = UniState.create_uni_state()
	UniCore.add_shards(s7, 200)
	var r7: Dictionary = UniEvents.apply_event_option(s7, "lottery", 0)
	_check(r7["outcome"].has("lottery"), "lottery")
	# 技能升级
	var s8: Dictionary = UniState.create_uni_state()
	var r8: Dictionary = UniEvents.apply_event_option(s8, "watchtower", 0)
	_check(r8["ok"] == true, "watchtower skill up random")
	var lv_after: int = 0
	for t in s8["team"]:
		lv_after += int(t["skillLevel"])
	_check(lv_after > 4, "skill leveled up")

# ===== 战斗基础 =====

func _test_combat_basic() -> void:
	print("uni_combat_basic")
	var s: Dictionary = UniState.create_uni_state()
	var c: Dictionary = UniCombat.start_combat(s)
	_check(c["phase"] == "player-action", "combat starts player-action")
	_check(c["enemies"].size() == 3, "3 enemies wave 1")
	_check(c["waves"].size() == 3, "3 waves")
	var active: Variant = UniCombat.current_active(s)
	_check(active != null, "active member")
	# 普攻第一个敌人
	var first_enemy: int = 0
	var attack: Dictionary = UniCombat.player_attack(s, first_enemy)
	_check(attack["ok"] == true and int(attack["dmg"]) > 0, "attack deals dmg")
	# 防御
	var s2: Dictionary = UniState.create_uni_state()
	UniCombat.start_combat(s2)
	var def: Dictionary = UniCombat.player_defense(s2, 0)
	_check(def["ok"] == true and int(def["shield"]) > 0, "defense shield")

# ===== 完整战斗模拟 =====

func _test_combat_full() -> void:
	print("uni_combat_full")
	var s: Dictionary = UniState.create_uni_state()
	# 给点祝福提升战力
	UniBuffs.gain_blessing(s, "jifeng")
	UniBuffs.gain_blessing(s, "hongyi")
	UniCombat.start_combat(s)
	var guard: int = 0
	while guard < 120:
		guard += 1
		var c: Dictionary = s["combat"]
		var phase: String = String(c["phase"])
		if phase == "won" or phase == "lost":
			break
		if phase == "player-action":
			# 找第一个存活敌人攻击
			var target: int = -1
			for e in c["enemies"]:
				if e["alive"]:
					target = int(e["id"])
					break
			if target >= 0:
				UniCombat.player_attack(s, target)
			else:
				# 无存活敌人（波次过渡）→ 防御过渡
				UniCombat.player_defense(s, 0)
		elif phase == "enemy-announce":
			var ann: Dictionary = UniCombat.enemy_announce(s)
			if ann.get("playing", false):
				UniCombat.enemy_resolve(s)
		elif phase == "wave-clear":
			# 转化层：选择挑战第三波（这里不会出现，battle 无 wave-clear）
			UniCombat.choose_third_wave(s, true)
		else:
			break
	var end_phase: String = String(s["combat"]["phase"])
	_check(end_phase == "won" or end_phase == "lost", "combat reaches terminal: %s" % end_phase)
	if end_phase == "won":
		_check(s["combat"].has("lastReward"), "has lastReward")
		_check(int(s["combat"]["lastReward"]["shards"]) >= 0, "reward shards")
		# 胜利后应有祝福三选一候选
		_check(s["pendingBlessingPicks"].size() >= 1, "blessing picks after win")
		# 转化层波次逻辑
		var s2: Dictionary = UniState.create_uni_state()
		s2["region"] = {"type": "transform", "waves": UniConstants.TRANSFORM_WAVES}
		UniCombat.start_combat(s2)
		_check(s2["combat"]["waves"].size() == 3, "transform 3 waves")
		# 转化及格线：快速打满回合看失败路径（直接改 round）
		s2["combat"]["round"] = 19
		UniCombat.start_player_turn(s2)  # round -> 20
		# 全灭敌人两波后 wave-clear
		s2["combat"]["phase"] = "wave-clear"
		var third: Dictionary = UniCombat.choose_third_wave(s2, true)
		_check(third["ok"] == true, "choose third wave ok")

# ===== 端到端跑图（层推进→区域→战斗→位面跨越） =====

func _test_full_run() -> void:
	print("uni_full_run")
	var s: Dictionary = UniState.create_uni_state()
	var guard: int = 0
	while guard < 300 and not s["gameOver"] and int(s["floor"]) < 31:
		guard += 1
		# 处理待选祝福（全选第一个候选）
		while s["pendingBlessingPicks"].size() > 0:
			var cands: Array = s["pendingBlessingPicks"][0]["candidates"]
			if cands.is_empty():
				break
			UniEvents.choose_blessing_pick(s, String(cands[0]))
		# 区域未生成 → 推进
		if s["region"] == null:
			if s["pendingChoice"] != null:
				UniState.choose_normal_content(s, 0)
			else:
				UniState.advance_floor(s)
			continue
		var rtype: String = String(s["region"]["type"])
		if s.get("combat", null) != null:
			var c: Dictionary = s["combat"]
			var phase: String = String(c["phase"])
			if phase == "won" or phase == "lost":
				# 战斗结束：清空 combat 与 region 推进
				s["combat"] = null
				s["region"] = null
				continue
			if phase == "player-action":
				var target: int = -1
				for e in c["enemies"]:
					if e["alive"]:
						target = int(e["id"])
						break
				if target >= 0:
					UniCombat.player_attack(s, target)
				else:
					UniCombat.player_defense(s, 0)
			elif phase == "enemy-announce":
				var ann: Dictionary = UniCombat.enemy_announce(s)
				if ann.get("playing", false):
					UniCombat.enemy_resolve(s)
			elif phase == "wave-clear":
				UniCombat.choose_third_wave(s, true)
			else:
				s["combat"] = null
				continue
		else:
			# 非战斗区域：事件/奖励/冒险处理或直接推进
			if rtype == "event":
				var event_ids: Array = s["region"].get("eventIds", [])
				var idx: int = int(s["region"].get("eventIdx", 0))
				if idx < event_ids.size():
					UniEvents.apply_event_option(s, String(event_ids[idx]), 0)
					s["region"]["eventIdx"] = idx + 1
				else:
					s["region"] = null
			elif rtype == "reward":
				var eid: String = String(s["region"].get("eventId", ""))
				if eid != "":
					UniEvents.apply_event_option(s, eid, 0)
				s["region"] = null
			elif rtype == "adventure":
				var aid: String = String(s["region"].get("eventId", ""))
				if aid != "":
					UniEvents.apply_event_option(s, aid, 0)
				s["region"] = null
			elif rtype == "battle" or rtype == "elite" or rtype == "boss" or rtype == "transform":
				# 战斗区域：等 start_combat（UI 层调用），这里直接开始
				UniCombat.start_combat(s)
			elif rtype == "shop" or rtype == "rest" or rtype == "fortune" or rtype == "oddity":
				# 已由 enter_region 处理
				s["region"] = null
			else:
				s["region"] = null
	_check(int(s["floor"]) >= 31 or s["gameOver"] == true, "full run reaches floor 31 or game over: floor=%d" % int(s["floor"]))
	_check(int(s["plane"]) >= 2 or s["gameOver"] == true, "plane crossed to 2+: plane=%d" % int(s["plane"]))

# ===== 技能 =====

func _test_skills() -> void:
	print("uni_skills")
	var s: Dictionary = UniState.create_uni_state()
	UniCombat.start_combat(s)
	var c: Dictionary = s["combat"]
	var active_idx: int = int(c["activeIdx"])
	# 温迪(1) 开大需要目标
	if int(s["team"][active_idx]["charId"]) == 1:
		var info: Variant = UniSkills.get_skill_info(s, active_idx)
		_check(info != null and info["name"] == "千风之诗", "wendi skill info")
		var can: Dictionary = UniSkills.can_use_uni_skill(s, active_idx)
		_check(can["ok"] == true, "can use skill")
		var target: int = int(c["enemies"][0]["id"])
		var r: Dictionary = UniCombat.player_skill(s, target, {})
		_check(r["ok"] == true, "wendi ult ok")
		_check(int(s["team"][active_idx]["skillCooldown"]) == 6, "cooldown 6（新规范）")
	# 非当前角色不可开大
	var other: int = (active_idx + 1) % 4
	var r2: Dictionary = UniSkills.execute_uni_skill(s, other, {})
	_check(r2["ok"] == false, "non-active cannot ult")

# ===== 存档与复活 =====

func _test_serialize_revive() -> void:
	print("uni_serialize_revive")
	var s: Dictionary = UniState.create_uni_state()
	UniBuffs.gain_blessing(s, "jifeng")
	UniCore.add_shards(s, 100)
	var data: Dictionary = UniState.serialize_uni(s)
	_check(int(data["shards"]) == 100, "saved shards")
	var s2: Dictionary = UniState.create_uni_state()
	_check(UniState.deserialize_uni(s2, data) == true, "deserialize ok")
	_check(int(s2["shards"]) == 100, "restored shards")
	_check(s2["blessings"].size() == 1, "restored blessings")
	# 菜月昴复活
	var s3: Dictionary = UniState.create_uni_state([11, 2, 3, 4])
	UniCore.add_shards(s3, 50)
	UniCore.record_savepoint(s3)
	s3["floor"] = 5
	for t in s3["team"]:
		t["alive"] = false
	var revived: bool = UniCore.try_caiyueang_revive(s3)
	_check(revived == true, "caiyueang revive")
	_check(int(s3["caiyueangLoads"]) == 1, "loads 1")
	_check(int(s3["floor"]) == 1, "floor rolled back to savepoint")
	_check(s3["gameOver"] == false, "gameOver cleared")
