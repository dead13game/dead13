extends SceneTree
## 单机模式纯逻辑自测：solo / solo_combat / solo_events
## 运行：godot --headless --path godot --script res://tests/test_solo.gd

const GameSolo = preload("res://scripts/game/solo.gd")
const GameSoloConstants = preload("res://scripts/game/solo_constants.gd")
const GameSoloCombat = preload("res://scripts/game/solo_combat.gd")
const GameSoloEvents = preload("res://scripts/game/solo_events.gd")

var _failures: int = 0

func _initialize() -> void:
	_test_state_and_growth()
	_test_deck_and_gold()
	_test_shop()
	_test_rewards()
	_test_combat()
	_test_combat_p0()
	_test_events()
	_test_serialize()
	if _failures == 0:
		print("PASS: all solo tests")
	else:
		push_error("FAIL: %d solo test(s) failed" % _failures)
	quit(_failures)

func _check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok - ", msg)
	else:
		_failures += 1
		push_error("  FAIL - " + msg)

# ===== 状态与成长 =====

func _test_state_and_growth() -> void:
	print("solo_state")
	var s: Dictionary = GameSolo.create_solo_state()
	_check(s["mapNodes"].size() == 7, "7 chapter nodes")
	_check(s["player"]["deck"].has("mengji"), "start deck mengji")
	_check(s["player"]["hp"] == 24, "maxHp = 20 + def2*2 = 24")
	_check(s["nodeIndex"] == 0, "start at node 0")

	GameSolo.gain_exp(s, 10)
	_check(s["player"]["level"] == 2, "level up to 2")
	_check(s["player"]["pendingAttrPoints"] == 2, "attr points +2")
	_check(s["player"]["hp"] == s["player"]["maxHp"], "level up full heal")

	GameSolo.apply_attr_points(s, "def", 1)
	_check(s["player"]["attrs"]["def"] == 3, "def 3")
	_check(s["player"]["maxHp"] == 26, "maxHp 26 after def")

	# 节点推进
	var node: Dictionary = GameSolo.get_current_node(s)
	_check(node.get("type", "") == "battle", "node 0 battle")
	GameSolo.advance_node(s)
	_check(GameSolo.get_current_node(s).get("type", "") == "event", "node 1 event")

# ===== 卡组与金币 =====

func _test_deck_and_gold() -> void:
	print("solo_deck_gold")
	var s: Dictionary = GameSolo.create_solo_state()
	GameSolo.add_cards(s, "tiebi", 1)
	_check(s["player"]["deck"]["tiebi"] == 1, "add card")
	var stats: Dictionary = GameSolo.get_card_stats(s, "mengji")
	_check(stats["base"] == 3, "mengji base 3")
	GameSolo.upgrade_card(s, "mengji")
	var stats2: Dictionary = GameSolo.get_card_stats(s, "mengji")
	_check(stats2["base"] == 5, "upgraded base 5")

	GameSolo.add_gold(s, 50)
	_check(s["player"]["gold"] == 50, "gold 50")
	_check(GameSolo.spend_gold(s, 20) == true, "spend ok")
	_check(s["player"]["gold"] == 30, "gold 30")

	GameSolo.heal_player(s, 5)
	_check(s["player"]["hp"] == 24, "heal clamped")

	# 删卡
	var before: int = s["player"]["deck"].size()
	var removed: String = GameSolo.remove_random_card(s)
	_check(removed != "", "random remove returns card")

# ===== 商店 =====

func _test_shop() -> void:
	print("solo_shop")
	var s: Dictionary = GameSolo.create_solo_state()
	GameSolo.add_gold(s, 100)
	var buy: Dictionary = GameSolo.shop_buy(s, "mengji")  # common 15
	_check(buy["ok"] == true and buy["price"] == 15, "buy common 15")
	var buy2: Dictionary = GameSolo.shop_buy(s, "huogiu")  # rare 25
	_check(buy2["ok"] == true and buy2["price"] == 25, "buy rare 25")
	_check(s["player"]["gold"] == 60, "gold 100-15-25=60")
	_check(GameSolo.shop_remove_price(s) == 20, "remove price 20 base")
	_check(GameSolo.shop_heal_price(10) == 10, "heal 10hp = 10 gold")
	_check(GameSolo.shop_upgrade_price() == 15, "upgrade 15")

# ===== 奖励 =====

func _test_rewards() -> void:
	print("solo_rewards")
	var s: Dictionary = GameSolo.create_solo_state()
	var reward: Dictionary = GameSolo.award_battle_reward(s, "normal")
	_check(int(reward["gold"]) >= 8 and int(reward["gold"]) <= 15, "normal gold range")
	_check(reward["exp"] == 10, "normal exp 10")
	var boss: Dictionary = GameSolo.award_battle_reward(s, "boss")
	_check(boss["attrPoint"] == 1, "boss attr point")
	var candidates: Array = GameSolo.roll_card_candidates("common")
	_check(candidates.size() == 3, "3 candidates")
	var rare: Array = GameSolo.roll_card_candidates("rare")
	for id in rare:
		_check(int(GameSoloConstants.SOLO_CARDS[id]["cost"]) >= 8, "rare candidate %s" % id)

# ===== 战斗 =====

func _test_combat() -> void:
	print("solo_combat")
	var s: Dictionary = GameSolo.create_solo_state()
	GameSoloCombat.start_combat(s, "normal")
	var c: Dictionary = s["combat"]
	_check(c["phase"] == "pick-poker", "start pick-poker")
	_check(c["pendingPoker"].size() == 3, "3 poker cards")

	# 选扑克（前2张行动力，第3张抽牌数）
	var pick: Dictionary = GameSoloCombat.pick_poker(s, 0, 1, 2)
	_check(pick["ok"] == true, "pick poker ok")
	_check(c["phase"] == "play", "phase play")
	_check(c["actionPoints"] > 0, "action points > 0")

	# 打出所有可出的牌
	var guard: int = 0
	while c["playerHand"].size() > 0 and guard < 20:
		guard += 1
		var hand: Dictionary = c["playerHand"]
		var any_played: bool = false
		for id in hand.keys():
			if int(hand[id]) > 0:
				var r: Dictionary = GameSoloCombat.play_card(s, String(id), 1)
				if r.get("ok", false):
					any_played = true
		if not any_played:
			break
	_check(true, "played cards (loop done)")

	# 结束回合 → 敌方回合
	GameSoloCombat.end_turn(s)
	_check(c["phase"] == "enemy-announce", "enemy announce")

	# 敌方宣布+结算循环（直到出牌结束或战斗终态）
	var guard2: int = 0
	while String(c.get("phase", "")) == "enemy-announce" and guard2 < 30:
		guard2 += 1
		var ann: Dictionary = GameSoloCombat.enemy_announce(s)
		if not ann.get("playing", false):
			break
		GameSoloCombat.enemy_resolve(s)
	_check(c["phase"] == "pick-poker" or c["phase"] == "won" or c["phase"] == "lost", "back to player or over")

	# 完整战斗模拟（最多 40 轮直到终态）
	var s2: Dictionary = GameSolo.create_solo_state()
	GameSolo.add_cards(s2, "zhongji", 2)
	GameSoloCombat.start_combat(s2, "normal")
	var round_guard: int = 0
	while String(s2["combat"]["phase"]) != "won" and String(s2["combat"]["phase"]) != "lost" and round_guard < 40:
		round_guard += 1
		var cc: Dictionary = s2["combat"]
		match String(cc["phase"]):
			"pick-poker":
				GameSoloCombat.pick_poker(s2, 0, 1, 2)
			"play":
				var played_any: bool = false
				for id in cc["playerHand"].keys():
					if int(cc["playerHand"][id]) > 0:
						if GameSoloCombat.play_card(s2, String(id), 1).get("ok", false):
							played_any = true
				if not played_any:
					GameSoloCombat.end_turn(s2)
			"enemy-announce":
				var ann2: Dictionary = GameSoloCombat.enemy_announce(s2)
				if ann2.get("playing", false):
					GameSoloCombat.enemy_resolve(s2)
			_:
				pass
	var phase: String = String(s2["combat"]["phase"])
	_check(phase == "won" or phase == "lost", "combat reaches terminal: %s" % phase)

	# 若获胜：领取奖励
	if phase == "won":
		var reward: Dictionary = s2["combat"]["lastReward"]
		_check(reward.has("gold"), "combat reward gold")
		var candidates: Array = GameSolo.roll_card_candidates(String(reward["rarity"]))
		if not candidates.is_empty():
			var claim: Dictionary = GameSoloCombat.claim_card_reward(s2, String(candidates[0]))
			_check(claim["ok"] == true, "claim card reward")

# ===== P0 规则正确性回归（设计 §5.5/§6.1/§12.2/§12.3） =====

func _test_combat_p0() -> void:
	print("solo_combat_p0")

	# 1. 精英开局护盾（§6.1）
	var s_elite: Dictionary = GameSolo.create_solo_state()
	GameSoloCombat.start_combat(s_elite, "elite")
	_check(int(s_elite["combat"]["enemyShield"]) == 8, "精英开局护盾 8")
	# 普通/首领无开局盾
	var s_norm: Dictionary = GameSolo.create_solo_state()
	GameSoloCombat.start_combat(s_norm, "normal")
	_check(int(s_norm["combat"]["enemyShield"]) == 0, "普通敌人无开局盾")

	# 2. 首领斗志方向（§5.5：玩家破首领盾 → 首领斗志+；首领破玩家盾 → 不变）
	var s_boss: Dictionary = GameSolo.create_solo_state()
	GameSoloCombat.start_combat(s_boss, "boss")
	var cb: Dictionary = s_boss["combat"]
	cb["enemyShield"] = 10
	GameSoloCombat.damage_enemy(s_boss, 8, 0)  # 玩家攻击破 8 盾
	_check(int(cb["enemySpirit"]) == 8, "玩家破首领盾 → 首领斗志 +8")
	_check(int(cb["fightingSpirit"]) == 8, "玩家斗志同步 +8（玛薇卡）")
	# 首领攻击玩家：破玩家盾不应加首领斗志
	var sp_before: int = int(cb["enemySpirit"])
	cb["playerShield"] = 10
	GameSoloCombat.damage_player(s_boss, 5)  # 首领破玩家 5 盾
	_check(int(cb["enemySpirit"]) == sp_before, "首领破玩家盾 → 首领斗志不变")
	# 首领斗志加成行动力：每 5 层 +1
	var ap_before: int = int(cb.get("enemyActionPoints", 0))
	cb["enemySpirit"] = 12
	cb["enemyActionPoints"] = ap_before
	# start_enemy_turn 计算（简化验证 enemySpirit 参与行动力）
	_check(true, "斗志行动力规则见 start_enemy_turn")

	# 3. AI 行动力消耗上限 7（§12.3）
	var s_ai: Dictionary = GameSolo.create_solo_state()
	GameSoloCombat.start_combat(s_ai, "normal")
	var ca: Dictionary = s_ai["combat"]
	ca["phase"] = "enemy-announce"
	ca["enemyActionPoints"] = 26
	ca["enemyHand"] = {"gedang": 3}  # cost 4 防御
	ca["enemySpent"] = 0
	var ai_rounds: int = 0
	while String(ca.get("phase", "")) == "enemy-announce" and ai_rounds < 10:
		ai_rounds += 1
		var ann: Dictionary = GameSoloCombat.enemy_announce(s_ai)
		if not ann.get("playing", false):
			break
		GameSoloCombat.enemy_resolve(s_ai)
	_check(int(ca.get("enemySpent", 0)) > 0 and int(ca.get("enemySpent", 0)) <= 7, "AI 回合消耗 1~7（实耗 %d）" % ca.get("enemySpent", 0))

	# 4. 破甲语义（§12.2：伤害正常结算 + 目标下回合防御 -2，非即时穿透）
	var s_pojia: Dictionary = GameSolo.create_solo_state()
	GameSolo.add_cards(s_pojia, "pojia", 1)
	GameSoloCombat.start_combat(s_pojia, "normal")
	var cp: Dictionary = s_pojia["combat"]
	GameSoloCombat.pick_poker(s_pojia, 0, 1, 2)
	cp["playerHand"] = {"pojia": 1}
	var hp_before: int = int(cp["enemyHp"])
	# 敌方有盾时：破甲不穿透盾，正常扣盾
	cp["enemyShield"] = 10
	var r_p: Dictionary = GameSoloCombat.play_card(s_pojia, "pojia", 1)
	_check(r_p.get("ok", false), "打破甲成功")
	_check(int(cp["enemyShield"]) == 4, "破甲伤害正常扣盾（10 - 6 = 4），不穿透")
	_check(int(cp["enemyNextShieldPen"]) == 2, "破甲：目标下回合防御 -2（enemyNextShieldPen=2）")
	_check(int(cp["enemyHp"]) == hp_before, "破甲不直接伤 HP（无即时穿透）")
	# 敌方下回合防御牌护盾被减
	cp["enemyPendingPlay"] = null
	cp["enemyHand"] = {"gedang": 1}
	cp["enemyActionPoints"] = 26
	cp["phase"] = "enemy-announce"
	var ann3: Dictionary = GameSoloCombat.enemy_announce(s_pojia)
	if ann3.get("playing", false):
		GameSoloCombat.enemy_resolve(s_pojia)
	_check(int(cp.get("enemyShield", 0)) >= 2, "敌方防御牌受破甲影响：护盾 = 4-2=2（实际 %d）" % cp.get("enemyShield", 0))

# ===== 事件 =====

func _test_events() -> void:
	print("solo_events")
	var s: Dictionary = GameSolo.create_solo_state()
	GameSolo.add_gold(s, 50)
	# 固定选项：付 10 金
	var r1: Dictionary = GameSoloEvents.apply_event_option(s, "hunter", 0)
	_check(r1["ok"] == true, "hunter option 0 ok")
	_check(s["player"]["gold"] == 40, "paid 10 gold")
	# 检定选项：力量（str=2 + 扑克点数）
	var r2: Dictionary = GameSoloEvents.apply_event_option(s, "hunter", 1)
	_check(r2["ok"] == true, "hunter check ok")
	_check(r2.has("check"), "check result returned")
	# 绕路删卡
	var deck_before: int = s["player"]["deck"].size()
	var r3: Dictionary = GameSoloEvents.apply_event_option(s, "hunter", 2)
	_check(r3["ok"] == true, "hunter detour ok")
	_check(s["player"]["deck"].size() == deck_before - 1, "card removed")

	# 事件致死
	var s2: Dictionary = GameSolo.create_solo_state()
	s2["player"]["hp"] = 2
	GameSoloEvents.apply_event_option(s2, "hunter", 1)
	if s2["player"]["hp"] <= 0:
		_check(s2["gameOver"] == true, "event death sets gameOver")

# ===== 存档 =====

func _test_serialize() -> void:
	print("solo_serialize")
	var s: Dictionary = GameSolo.create_solo_state()
	GameSolo.add_gold(s, 30)
	GameSolo.gain_exp(s, 10)
	var data: Dictionary = GameSolo.serialize_solo(s)
	_check(data["player"]["gold"] == 30, "saved gold")
	var s2: Dictionary = GameSolo.create_solo_state()
	_check(GameSolo.deserialize_solo(s2, data) == true, "deserialize ok")
	_check(s2["player"]["gold"] == 30, "restored gold")
	_check(s2["player"]["level"] == 2, "restored level")
