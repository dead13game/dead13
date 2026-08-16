extends SceneTree
## 核心纯逻辑自测：constants / deck / player / weather
## 运行：godot --headless --path godot --script res://tests/test_core.gd

const GameConstants = preload("res://scripts/game/constants.gd")
const GameDeck = preload("res://scripts/game/deck.gd")
const GamePlayer = preload("res://scripts/game/player.gd")
const GameWeather = preload("res://scripts/game/weather.gd")
const GameDamage = preload("res://scripts/game/damage.gd")
const GameCombat = preload("res://scripts/game/combat.gd")

var _failures: int = 0

func _initialize() -> void:
	_test_constants()
	_test_deck()
	_test_player()
	_test_weather()
	_test_damage()
	_test_combat()
	if _failures == 0:
		print("PASS: all core tests")
	else:
		push_error("FAIL: %d core test(s) failed" % _failures)
	quit(_failures)

func _check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok - ", msg)
	else:
		_failures += 1
		push_error("  FAIL - " + msg)

func _test_constants() -> void:
	print("constants")
	_check(GameConstants.SUITS.size() == 4, "4 suits")
	_check(GameConstants.RANKS.size() == 13, "13 ranks")
	_check(int(GameConstants.RANK_VALUES["K"]) == 13, "K value 13")
	_check(GameConstants.CHARACTERS.size() == 12, "12 characters")
	var c: Dictionary = GameConstants.get_char_data({"characterId": 1})
	_check(c.get("name") == "温迪", "character 1 name")

func _test_deck() -> void:
	print("deck")
	var deck: Array = GameDeck.create_full_deck()
	_check(deck.size() == 104, "full deck 104")
	var drawn: Dictionary = GameDeck.draw_cards(deck, 3)
	_check(drawn["drawn"].size() == 3, "draw 3")
	_check(drawn["remaining"].size() == 101, "remaining 101")
	var shuffled: Array = GameDeck.shuffle_deck(deck)
	_check(shuffled.size() == 104, "shuffled size 104")
	var grave: Array = [{"id": "♠A"}, {"id": "♥2"}]
	var rebuilt: Array = GameDeck.reshuffle_from_grave(grave, ["♥2"])
	_check(rebuilt.size() == 1, "reshuffle excludes")

func _test_player() -> void:
	print("player")
	var char_data: Dictionary = GameConstants.CHARACTERS[1]
	var p: Dictionary = GamePlayer.create_player(0, char_data, "测试")
	_check(p["name"] == "测试", "custom name")
	_check(p["hp"] == 11, "hp from char")
	_check(p["alive"] == true, "alive default")
	_check(p["statusEffects"].has("frozenBy"), "statusEffects initialized")
	_check(p["relations"].has("allyIndex"), "relations initialized")

func _test_weather() -> void:
	print("weather")
	var state: Dictionary = {
		"useWeather": true,
		"weatherDeck": [],
		"currentWeather": null,
		"nextWeather": null,
	}
	GameWeather.setup_weather_deck(state)
	_check(state["weatherDeck"].size() == 9, "weather deck 9")
	var w = GameWeather.draw_weather(state)
	_check(w != null, "draw weather returns id")
	_check(state.has("currentWeather"), "currentWeather set")

func _test_damage() -> void:
	print("damage")
	var char_data: Dictionary = GameConstants.CHARACTERS[1]
	var p1: Dictionary = GamePlayer.create_player(0, char_data, "A")
	var p2: Dictionary = GamePlayer.create_player(1, char_data, "B")
	var state: Dictionary = {
		"players": [p1, p2],
		"grave": [],
		"messageLog": [],
		"soundQueue": [],
		"gameOver": false,
		"winnerIndex": -1,
		"phase": GameConstants.PHASE["NORMAL"],
		"round": 1,
		"_elimGuard": false,
		"_elimPaused": false,
		"leagueContext": null,
		"matchContext": null,
	}
	var remaining: int = GameDamage.apply_damage(state, p2, 5)
	_check(remaining == 5, "returns remaining damage after defense")
	_check(p2["hp"] == 6, "hp reduced 11->6")
	_check(p2["alive"] == true, "still alive")

	# 防御牌吸收
	var defense_card: Dictionary = {"value": 8, "faceUp": false, "isShield": false}
	p2["defensePile"] = [defense_card]
	GameDamage.apply_damage(state, p2, 3)
	_check(p2["hp"] == 6, "defense absorbed damage")
	_check(p2["defensePile"].size() == 1, "defense card remains")
	_check(defense_card["defenseValue"] == 5, "defenseValue reduced")

	# 死亡结算
	var p3: Dictionary = GamePlayer.create_player(2, char_data, "C")
	state["players"].append(p3)
	GameDamage.apply_damage(state, p3, 99)
	_check(p3["alive"] == false, "dead")
	_check(p3["hp"] == 0, "hp clamped to 0")
	# 只剩 1 人存活时游戏结束
	p2["alive"] = false
	GameDamage.check_game_over(state)
	_check(state["gameOver"] == true, "game over when one alive")


func _test_combat() -> void:
	print("combat")
	var char_data: Dictionary = GameConstants.CHARACTERS[1]
	var p1: Dictionary = GamePlayer.create_player(0, char_data, "A")
	var p2: Dictionary = GamePlayer.create_player(1, char_data, "B")
	var state: Dictionary = {
		"players": [p1, p2],
		"currentPlayerIndex": 0,
		"phase": GameConstants.PHASE["NORMAL"],
		"step": GameConstants.STEP["PICK_ACTION"],
		"deck": [{"id": "♠5", "suit": "♠", "rank": "5", "value": 5, "faceUp": false}],
		"grave": [],
		"messageLog": [],
		"soundQueue": [],
		"round": 4,
		"gameOver": false,
		"winnerIndex": -1,
		"pendingAttackCard": null,
		"pendingVentiCards": null,
		"currentWeather": null,
		"leagueContext": null,
		"matchContext": null,
		"_elimGuard": false,
		"_elimPaused": false,
	}
	GameCombat.inject_deps(
		Callable(self, "_combat_current_player"),
		Callable(self, "_combat_add_log"),
		Callable(self, "_combat_ensure_deck"),
		Callable(self, "_combat_end_action"),
	)
	GameCombat.start_attack(state)
	_check(state["step"] == GameConstants.STEP["ATTACK_SHOW_CARD"], "start_attack sets attackShowCard")
	_check(state.has("pendingAttackCard"), "attack card pending")
	GameCombat.execute_attack(state, 1)
	_check(p2["hp"] == 6, "attack deals 5 damage")
	_check(state["grave"].size() == 1, "attack card moved to grave")

func _combat_current_player(state: Dictionary) -> Dictionary:
	return state["players"][state["currentPlayerIndex"]]

func _combat_add_log(state: Dictionary, msg: String) -> void:
	state["messageLog"].append(msg)

func _combat_ensure_deck(state: Dictionary, n: int = 1) -> void:
	pass

func _combat_end_action(state: Dictionary) -> void:
	pass
