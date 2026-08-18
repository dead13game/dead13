class_name UniCombat
## 模拟宇宙战斗结算（从 src/simuniverse/logic/uniCombat.js 移植）
## 扑克牌行动 / 敌人模板 / 波次 / 转化及格线
## execute_uni_skill 通过 Callable 注入（避免与 uni_skills 循环依赖）

const GameConstants = preload("res://scripts/game/constants.gd")
const GameDeck = preload("res://scripts/game/deck.gd")
const GameSoundEvents = preload("res://scripts/game/sound_events.gd")
const UniConstants = preload("res://scripts/game/uni_constants.gd")
const UniBuffs = preload("res://scripts/game/uni_buffs.gd")
const UniCore = preload("res://scripts/game/uni_core.gd")

const POKER_DRAW: int = 1

static var _execute_skill_fn: Callable = Callable()

## 注入 execute_uni_skill（由 uni_state 在创建时调用）
static func inject_execute_skill(fn: Callable) -> void:
	_execute_skill_fn = fn

static func _s(v: Variant) -> String:
	return "" if v == null else str(v)

static func _pick(arr: Array) -> Variant:
	if arr.is_empty():
		return null
	return arr[randi() % arr.size()]

# ---- 敌人 ----

## 生成 1 个敌人
static func _create_enemy(state: Dictionary, kind: String, idx: int) -> Dictionary:
	var base: Dictionary = UniConstants.ENEMY_BASE.get(kind, {})
	var mult: int = UniConstants.plane_mult(int(state.get("plane", 1)))
	var hp: int = int(base.get("hp", 10)) * mult
	var patterns: Array = UniConstants.ENEMY_PATTERNS.get(kind, {}).keys()
	var pattern: String = _s(_pick(patterns))
	return {
		"id": idx,
		"kind": kind,
		"name": _s(base.get("name", "")) if kind == "boss" else "%s%d" % [_s(base.get("name", "")), idx + 1],
		"pattern": pattern,
		"hp": hp,
		"maxHp": hp,
		"shield": 0,
		"locked": [],
		"round": 0,
		"alive": true,
		"stunnedTurns": 0,
		"dotDmg": 0,
		"dotTurns": 0,
	}

## 生成当前波次敌人
static func spawn_wave(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	var waves: Array = c.get("waves", [])
	var cfg: Variant = waves[c.get("wave", 0)] if c.get("wave", 0) < waves.size() else null
	if cfg == null:
		end_combat(state, "won")
		return
	var enemies: Array = []
	for i in range(int(cfg.get("count", 1))):
		enemies.append(_create_enemy(state, _s(cfg.get("kind", "normal")), i))
	c["enemies"] = enemies

## 波次敌人全灭检查
static func _check_wave_clear(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty():
		return
	var phase: String = _s(c.get("phase", ""))
	if phase == "won" or phase == "lost" or phase == "wave-clear":
		return
	var enemies: Array = c.get("enemies", [])
	if not enemies.is_empty():
		var all_dead: bool = true
		for e in enemies:
			if e.get("alive", false):
				all_dead = false
				break
		if all_dead:
			var waves: Array = c.get("waves", [])
			if int(c.get("wave", 0)) >= waves.size() - 1:
				end_combat(state, "won")
			else:
				next_wave(state)

# ---- 战斗开始 ----

## 开始一场战斗
static func start_combat(state: Dictionary) -> Dictionary:
	var r: Dictionary = state.get("region", {})
	var kind: String = _s(r.get("type", "battle"))
	var buff_keys: Array = []
	for k in state.get("nextBattleBuffs", {}).keys():
		buff_keys.append(k)
	var c: Dictionary = {
		"kind": kind,
		"waves": r.get("waves", []),
		"wave": 0,
		"enemies": [],
		"round": 0,
		"turnCount": 0,
		"actionOrder": [],
		"turnIdx": -1,
		"activeIdx": null,
		"pendingPoker": [],
		"pokerDeck": GameDeck.shuffle_deck(GameDeck.create_full_deck(1)),
		"phase": "player-action",
		"enemyQueue": [],
		"enemyPending": null,
		"lastReward": null,
		"waveClear": false,
		"buffs": buff_keys,
		"immuneUsed": false,
	}
	state["combat"] = c
	# 新规范（火神）：玛薇卡斗志每场战斗清零
	for t in state.get("team", []):
		t["status"]["spirit"] = 0
	# 急救包
	if int(state.get("items", {}).get("medkit", 0)) > 0:
		state["items"]["medkit"] = int(state["items"]["medkit"]) - 1
		for t in state.get("team", []):
			if t.get("alive", false):
				t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + ceili(float(t.get("maxHp", 1)) * 0.1))
		state["log"].append("使用急救包，全队回复 10% 生命")
	spawn_wave(state)
	_check_wave_clear(state)
	if _s(state["combat"].get("phase", "")) == "won" or _s(state["combat"].get("phase", "")) == "lost":
		return state["combat"]
	UniBuffs.trigger_on_combat_start(state)
	UniBuffs.trigger_curio_on_combat_start(state)
	_check_wave_clear(state)
	if _s(state["combat"].get("phase", "")) == "won" or _s(state["combat"].get("phase", "")) == "lost":
		return state["combat"]
	start_player_turn(state)
	return state["combat"]

# ---- 玩家回合 ----

## 回合开始
static func start_player_turn(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty():
		return
	var phase: String = _s(c.get("phase", ""))
	if phase == "won" or phase == "lost":
		return
	c["round"] = int(c.get("round", 0)) + 1
	c["phase"] = "player-action"
	# 冷却/状态递减
	for t in state.get("team", []):
		if int(t.get("skillCooldown", 0)) > 0:
			t["skillCooldown"] = int(t["skillCooldown"]) - 1
		if int(t.get("status", {}).get("dmgBuffTurns", 0)) > 0:
			t["status"]["dmgBuffTurns"] = int(t["status"]["dmgBuffTurns"]) - 1
			if int(t["status"]["dmgBuffTurns"]) == 0:
				t["status"]["dmgBuffPct"] = 0
		# 精英 C debuff（新规范）：造成伤害降低 50%，持续 2 回合
		if int(t.get("status", {}).get("dmgDebuffTurns", 0)) > 0:
			t["status"]["dmgDebuffTurns"] = int(t["status"]["dmgDebuffTurns"]) - 1
		if int(t.get("status", {}).get("maxHpBuffTurns", 0)) > 0:
			t["status"]["maxHpBuffTurns"] = int(t["status"]["maxHpBuffTurns"]) - 1
			if int(t["status"]["maxHpBuffTurns"]) == 0:
				t["maxHp"] = float(t.get("status", {}).get("origMaxHp", t.get("maxHp", 1)))
				t["hp"] = minf(float(t.get("hp", 0)), float(t["maxHp"]))
				t["status"]["maxHpBuffPct"] = 0
	# 方程：除魔士
	var chumo_fx: Dictionary = UniBuffs.EQUATIONS.get("chumo", {}).get("fx", {})
	if _is_equation_active(state, "chumo") and not chumo_fx.is_empty() and int(c.get("round", 0)) % int(chumo_fx.get("every", 4)) == 0:
		for t in state.get("team", []):
			if not t.get("alive", false):
				continue
			t["status"]["dmgBuffPct"] = float(t.get("status", {}).get("dmgBuffPct", 0)) + float(chumo_fx.get("atkPct", 200))
			t["status"]["dmgBuffTurns"] = 1
		state["log"].append("除魔士：全队伤害 +200%（本回合）")
	_tick_team_dots(state)
	_tick_enemy_dots(state)
	if _s(c.get("phase", "")) != "player-action":
		return
	# 奇物：虚构机兵
	if _has_curio(state, "xugou"):
		for t in state.get("team", []):
			if not t.get("alive", false):
				continue
			t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + ceili(float(t.get("maxHp", 1)) * 0.2))
	# speed 降序
	var order: Array = []
	var team: Array = state.get("team", [])
	for i in range(team.size()):
		var t: Dictionary = team[i]
		if t.get("alive", false):
			order.append({"i": i, "speed": int(GameConstants.CHARACTERS.get(int(t.get("charId", 0)), {}).get("speed", 0))})
	order.sort_custom(func(a, b): return int(a["speed"]) > int(b["speed"]) or (int(a["speed"]) == int(b["speed"]) and int(a["i"]) < int(b["i"])))
	var action_order: Array = []
	for x in order:
		action_order.append(int(x["i"]))
	c["actionOrder"] = action_order
	c["turnCount"] = 0
	c["turnIdx"] = -1
	c["waveClear"] = false
	_next_player_action(state)

## 轮到下一名角色行动
static func _next_player_action(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	c["turnIdx"] = int(c.get("turnIdx", 0)) + 1
	var action_order: Array = c.get("actionOrder", [])
	if int(c.get("turnIdx", 0)) >= action_order.size():
		var phase: String = _s(c.get("phase", ""))
		if phase == "won" or phase == "lost":
			return
		_start_enemy_phase(state)
		return
	var idx: int = int(action_order[int(c["turnIdx"])])
	var t: Dictionary = state.get("team", [])[idx]
	c["activeIdx"] = idx
	if not t.get("alive", false):
		_next_player_action(state)
		return
	# 傀儡
	if t.get("status", {}).get("puppet", false) == true:
		var victim: Variant = _pick_alive_member(state, idx)
		if victim != null:
			_damage_team_member(state, int(victim), float(UniConstants.PUPPET_DMG))
		t["status"]["puppet"] = null
		_finish_player_action(state)
		return
	# 眩晕
	if t.get("status", {}).get("stunned", false):
		t["status"]["stunned"] = false
		_finish_player_action(state)
		return
	c["pendingPoker"] = []
	c["phase"] = "player-action"

## 从共享牌堆抽 n 张
static func draw_poker(state: Dictionary, n: int) -> Array:
	var c: Dictionary = state.get("combat", {})
	var deck: Array = c.get("pokerDeck", [])
	if deck.size() < n:
		deck = GameDeck.shuffle_deck(GameDeck.create_full_deck(1))
	var result: Dictionary = GameDeck.draw_cards(deck, n)
	c["pokerDeck"] = result["remaining"]
	return result["drawn"]

# ---- 玩家三选一 ----

## 普攻
static func player_attack(state: Dictionary, enemy_idx: int) -> Dictionary:
	var c: Dictionary = state.get("combat", {})
	if _s(c.get("phase", "")) != "player-action":
		return {"ok": false, "reason": "非行动时机"}
	var enemy: Variant = null
	for e in c.get("enemies", []):
		if int(e.get("id", -1)) == enemy_idx and e.get("alive", false):
			enemy = e
			break
	if enemy == null:
		return {"ok": false, "reason": "目标无效"}
	if c.get("pendingPoker", []).is_empty():
		c["pendingPoker"] = draw_poker(state, POKER_DRAW)
	var attacker: Dictionary = state.get("team", [])[int(c.get("activeIdx", 0))]
	var mods: Dictionary = UniBuffs.get_uni_modifiers(state)
	var flat: float = float(attacker.get("status", {}).get("atkBonus", 0))
	var pct: float = float(attacker.get("status", {}).get("dmgBuffPct", 0))
	# 玛薇卡斗志（新规范）：每层使下一次攻击伤害 +1（加在乘算增伤之前）
	var spirit_stacks: float = float(attacker.get("status", {}).get("spirit", 0))
	var next_boost: float = float(attacker.get("status", {}).get("nextAttackBoost", 0))
	var shouzu_fx: Dictionary = UniBuffs.EQUATIONS.get("shouzu", {}).get("fx", {})
	var kill_stacks: int = 0
	if _is_equation_active(state, "shouzu") and not shouzu_fx.is_empty():
		kill_stacks = mini(int(c.get("killStacks", 0)), int(shouzu_fx.get("maxStacks", 3)))
	var raw: float = float(c.get("pendingPoker", [{}])[0].get("value", 0))
	var total_pct: float = pct + float(mods.get("atkMult", 0)) + float(mods.get("atkNormalMult", 0)) \
		+ UniBuffs.member_atk_mods(state, int(c.get("activeIdx", 0))) + next_boost \
		+ kill_stacks * float(shouzu_fx.get("atkPerKill", 20))
	if _is_equation_active(state, "ruchong") and int(c.get("round", 0)) == 1:
		total_pct += float(UniBuffs.EQUATIONS.get("ruchong", {}).get("fx", {}).get("firstAtkMult", 60))
	if c.get("buffs", []).has("atkUp"):
		total_pct += 30
	if c.get("buffs", []).has("dmgUp50"):
		total_pct += 50
	# 新规范（火神）：攻击牌点数 → +少女攻防 → +斗志层数 → ×增伤百分比
	var dmg: int = maxi(0, ceili((raw + flat + spirit_stacks) * (1 + total_pct / 100.0)))
	if attacker.get("status", {}).get("nextAttackBoost", 0):
		attacker["status"]["nextAttackBoost"] = 0
	GameSoundEvents.record_sound(state, "attack")
	if _is_equation_active(state, "yiji"):
		UniBuffs.charge_jar_brain(state, float(UniBuffs.EQUATIONS.get("yiji", {}).get("fx", {}).get("jarBrain", 8)))
	var poker: Variant = c.get("pendingPoker", [{}])[0] if not c.get("pendingPoker", []).is_empty() else null
	c["lastPoker"] = poker
	c["lastPokerTarget"] = {"type": "enemy", "id": enemy_idx}
	c["pendingPoker"] = []
	_damage_enemy(state, enemy_idx, dmg, int(c.get("activeIdx", 0)))
	# 方程：梦魔主
	if _is_equation_active(state, "mengmo"):
		c["_pendingExtra"] = float(c.get("_pendingExtra", 0)) + ceili((float(attacker.get("maxHp", 1)) + float(attacker.get("shield", 0))) * float(UniBuffs.EQUATIONS.get("mengmo", {}).get("fx", {}).get("hpShieldPct", 10)) / 100.0)
	# 方程：街道骑行官
	c["attackCount"] = int(c.get("attackCount", 0)) + 1
	var xingzou_fx: Dictionary = UniBuffs.EQUATIONS.get("xingzou", {}).get("fx", {})
	if _is_equation_active(state, "xingzou") and not xingzou_fx.is_empty() and int(c.get("attackCount", 0)) % int(xingzou_fx.get("every", 24)) == 0:
		var first: Variant = null
		for x in state.get("team", []):
			if x.get("alive", false):
				first = x
				break
		if first != null:
			first["status"]["nextAttackBoost"] = float(first.get("status", {}).get("nextAttackBoost", 0)) + float(xingzou_fx.get("atkPct", 160))
			state["log"].append("街道骑行官：第一位角色下一次攻击强化")
	UniBuffs.trigger_on_attack_after(state, int(c.get("activeIdx", 0)), enemy_idx, float(dmg))
	if c.has("_pendingExtra"):
		_damage_enemy(state, enemy_idx, int(c["_pendingExtra"]), int(c.get("activeIdx", 0)))
		c["_pendingExtra"] = 0
	if c.has("_splashTarget") and c["_splashTarget"] != null:
		_damage_enemy(state, int(c["_splashTarget"]), int(c.get("_pendingSplash", 0)), int(c.get("activeIdx", 0)))
		c["_pendingSplash"] = 0
		c["_splashTarget"] = null
	var phase_now: String = _s(c.get("phase", ""))
	if phase_now == "won" or phase_now == "lost":
		return {"ok": true, "dmg": dmg}
	_finish_player_action(state)
	return {"ok": true, "dmg": dmg}

## 防御
static func player_defense(state: Dictionary, target_idx: int) -> Dictionary:
	var c: Dictionary = state.get("combat", {})
	if _s(c.get("phase", "")) != "player-action":
		return {"ok": false, "reason": "非行动时机"}
	var team: Array = state.get("team", [])
	if target_idx < 0 or target_idx >= team.size():
		return {"ok": false, "reason": "目标无效"}
	var target: Dictionary = team[target_idx]
	if not target.get("alive", false):
		return {"ok": false, "reason": "目标无效"}
	if c.get("pendingPoker", []).is_empty():
		c["pendingPoker"] = draw_poker(state, POKER_DRAW)
	var poker: Variant = c.get("pendingPoker", [{}])[0] if not c.get("pendingPoker", []).is_empty() else null
	var shield: int = int(poker.get("value", 0)) if poker != null else 0
	var actor: Dictionary = team[int(c.get("activeIdx", 0))]
	var def_bonus: int = int(actor.get("status", {}).get("defBonus", 0))
	target["shield"] = float(target.get("shield", 0)) + shield + def_bonus
	c["lastPoker"] = poker
	c["lastPokerTarget"] = {"type": "member", "id": target_idx}
	c["pendingPoker"] = []
	GameSoundEvents.record_sound(state, "defense")
	_finish_player_action(state)
	return {"ok": true, "shield": shield + def_bonus}

## 开大
static func player_skill(state: Dictionary, target_idx: Variant, payload: Dictionary = {}) -> Dictionary:
	if _execute_skill_fn.is_valid():
		var r: Dictionary = _execute_skill_fn.call(state, int(state.get("combat", {}).get("activeIdx", 0)), {"targetIdx": target_idx}.merged(payload))
		if r.get("ok", false) and _s(state.get("combat", {}).get("phase", "")) == "player-action":
			# 罐中脑再激活（新规范）：大招后保持行动，可再次激活大招
			var c: Dictionary = state.get("combat", {})
			if c.get("_jarBrainExtraUlt", false):
				c["_jarBrainExtraUlt"] = false
			else:
				_finish_player_action(state)
		return r
	return {"ok": false, "reason": "技能未注入"}

## 纳西妲：指定角色立即行动
static func grant_extra_action(state: Dictionary, member_idx: int) -> bool:
	var c: Dictionary = state.get("combat", {})
	var team: Array = state.get("team", [])
	if member_idx < 0 or member_idx >= team.size():
		return false
	var t: Dictionary = team[member_idx]
	if not t.get("alive", false):
		return false
	if t.get("status", {}).get("stunned", false) or t.get("status", {}).get("puppet", false) == true:
		return false
	var action_order: Array = c.get("actionOrder", [])
	var insert_at: int = int(c.get("turnIdx", 0)) + 1
	if not action_order.has(member_idx):
		action_order.insert(insert_at, member_idx)
	else:
		action_order.remove_at(action_order.find(member_idx))
		action_order.insert(insert_at, member_idx)
	c["actionOrder"] = action_order
	return true

## 玩家行动完成
static func _finish_player_action(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	c["turnCount"] = int(c.get("turnCount", 0)) + 1
	# 首领穿插
	if _s(c.get("kind", "")) == "boss":
		var boss: Variant = null
		for e in c.get("enemies", []):
			if e.get("alive", false):
				boss = e
				break
		if boss != null:
			var pattern: String = _boss_pattern(int(c.get("round", 1)))
			var tpl: Dictionary = UniConstants.ENEMY_PATTERNS.get("boss", {}).get(pattern, {})
			if int(c.get("turnCount", 0)) == 2 and tpl.has("interlude"):
				_queue_enemy_action(state, boss, tpl["interlude"], "穿插·%s" % _s(tpl["interlude"].get("type", "")))
			elif int(c.get("turnCount", 0)) == 4:
				var acts: Array = tpl.get("actions", [])
				if acts.size() >= 2:
					_queue_enemy_action(state, boss, acts[0], "行动1·%s" % _s(acts[0].get("type", "")))
					_queue_enemy_action(state, boss, acts[1], "行动2·%s" % _s(acts[1].get("type", "")))
	# 波次清空检查
	var enemies: Array = c.get("enemies", [])
	if not enemies.is_empty():
		var all_dead: bool = true
		for e in enemies:
			if e.get("alive", false):
				all_dead = false
				break
		if all_dead:
			if _s(c.get("kind", "")) == "transform" and int(c.get("wave", 0)) == 1:
				c["waveClear"] = true
				c["phase"] = "wave-clear"
				return
			next_wave(state)
			var ph: String = _s(c.get("phase", ""))
			if ph == "won" or ph == "lost":
				return
	if not c.get("enemyQueue", []).is_empty():
		c["phase"] = "enemy-announce"
		return
	_next_player_action(state)

## 敌人行动入队
static func _queue_enemy_action(state: Dictionary, enemy: Dictionary, action: Dictionary, desc: String) -> void:
	state.get("combat", {})["enemyQueue"].append({"enemyIdx": int(enemy.get("id", 0)), "action": action.duplicate(), "desc": desc})

## 首领技能轮转
static func _boss_pattern(round: int) -> String:
	return ["A", "B", "C"][(round - 1) % 3]

# ---- 敌人阶段 ----

## 普通/精英敌人阶段
static func _start_enemy_phase(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	var phase: String = _s(c.get("phase", ""))
	if phase == "won" or phase == "lost":
		return
	# 速攻战术
	if c.get("buffs", []).has("enemyStun") and int(c.get("round", 0)) == 1:
		state["log"].append("速攻战术：敌方首回合无法行动")
		_finish_enemy_turn(state)
		return
	if _s(c.get("kind", "")) == "boss":
		var boss: Variant = null
		for e in c.get("enemies", []):
			if e.get("alive", false):
				boss = e
				break
		if boss != null:
			boss["round"] = int(boss.get("round", 0)) + 1
		if c.get("enemyQueue", []).is_empty():
			_finish_enemy_turn(state)
			return
		c["phase"] = "enemy-announce"
		return
	for e in c.get("enemies", []):
		if not e.get("alive", false):
			continue
		e["round"] = int(e.get("round", 0)) + 1
		if int(e.get("stunnedTurns", 0)) > 0:
			e["stunnedTurns"] = int(e["stunnedTurns"]) - 1
			continue
		var tpl: Dictionary = UniConstants.ENEMY_PATTERNS.get(_s(e.get("kind", "")), {}).get(_s(e.get("pattern", "")), {})
		if tpl.is_empty():
			continue
		var actions: Array = resolve_pattern_actions(state, e, tpl)
		for i in range(actions.size()):
			_queue_enemy_action(state, e, actions[i], "%s#%d" % [_s(tpl.get("name", "")), i + 1])
	c["phase"] = "enemy-announce"
	if c.get("enemyQueue", []).is_empty():
		_finish_enemy_turn(state)

## 生成敌人本回合的行动列表
static func resolve_pattern_actions(state: Dictionary, enemy: Dictionary, tpl: Dictionary) -> Array:
	var actions: Array = tpl.get("actions", [])
	if _s(enemy.get("kind", "")) == "elite" and _s(tpl.get("special", "")) == "lock":
		if int(enemy.get("round", 0)) % 2 == 1:
			enemy["locked"] = []
			return [{"type": "lock"}, {"type": "lock"}]
		return [{"type": "hitLocked", "dmg": UniConstants.ELITE_LOCK_DMG}, {"type": "hitLocked", "dmg": UniConstants.ELITE_LOCK_DMG}]
	if _s(enemy.get("kind", "")) == "elite" and _s(tpl.get("special", "")) == "cycle":
		if int(enemy.get("round", 0)) % 2 == 1:
			return [{"type": "debuff"}, {"type": "debuff"}]
		return [{"type": "aoe", "dmg": 8}, {"type": "aoe", "dmg": 8}]
	var result: Array = []
	for a in actions:
		result.append(a.duplicate())
	return result

## 敌人宣布下一次行动
static func enemy_announce(state: Dictionary) -> Dictionary:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or _s(c.get("phase", "")) != "enemy-announce":
		return {"playing": false}
	if c.get("enemyQueue", []).is_empty():
		_finish_enemy_turn(state)
		return {"playing": false}
	var next: Dictionary = c["enemyQueue"][0]
	var enemy: Variant = null
	for e in c.get("enemies", []):
		if int(e.get("id", -1)) == int(next.get("enemyIdx", -1)):
			enemy = e
			break
	if enemy == null or not enemy.get("alive", false):
		c["enemyQueue"].pop_front()
		return enemy_announce(state)
	c["enemyPending"] = next
	return {"playing": true, "enemyName": _s(enemy.get("name", "")), "action": next.get("action", {}), "desc": _s(next.get("desc", ""))}

## 结算敌人行动
static func enemy_resolve(state: Dictionary) -> Dictionary:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or _s(c.get("phase", "")) != "enemy-announce" or c.get("enemyPending", null) == null:
		return {"ok": false}
	var pending: Dictionary = c["enemyPending"]
	var enemy_idx: int = int(pending.get("enemyIdx", -1))
	var enemy: Variant = null
	for e in c.get("enemies", []):
		if int(e.get("id", -1)) == enemy_idx:
			enemy = e
			break
	if enemy != null and enemy.get("alive", false):
		_resolve_enemy_action(state, enemy, pending.get("action", {}))
	c["enemyQueue"].pop_front()
	c["enemyPending"] = null
	var ph: String = _s(c.get("phase", ""))
	if ph == "won" or ph == "lost":
		return {"ok": true, "done": true}
	if c.get("enemyQueue", []).is_empty():
		if int(c.get("turnCount", 0)) >= c.get("actionOrder", []).size():
			_finish_enemy_turn(state)
		else:
			_next_player_action(state)
		return {"ok": true, "done": true}
	c["phase"] = "enemy-announce"
	return {"ok": true, "done": false}

## 结算单个敌人行动
static func _resolve_enemy_action(state: Dictionary, enemy: Dictionary, action: Dictionary) -> void:
	var dmg_mult_now: float = UniConstants.dmg_mult(int(state.get("plane", 1)))
	var type: String = _s(action.get("type", ""))
	if type == "single":
		var target: Variant = _pick_alive_member(state)
		if target == null:
			return
		var yiyi_cut: float = UniBuffs.blessing_val(state, "yiyi", "dmgCut") if int(enemy.get("dotTurns", 0)) > 0 else 0.0
		var dmg: int = maxi(0, ceili(int(action.get("dmg", 0)) * dmg_mult_now) - int(yiyi_cut))
		_damage_team_member(state, int(target), float(dmg))
	elif type == "aoe":
		var yiyi_cut2: float = UniBuffs.blessing_val(state, "yiyi", "dmgCut") if int(enemy.get("dotTurns", 0)) > 0 else 0.0
		var dmg2: int = maxi(0, ceili(int(action.get("dmg", 0)) * dmg_mult_now) - int(yiyi_cut2))
		for i in range(state.get("team", []).size()):
			if state.get("team", [])[i].get("alive", false):
				_damage_team_member(state, i, float(dmg2))
	elif type == "shield":
		var shield: int = ceili(float(enemy.get("maxHp", 1)) * float(action.get("pct", 0.3)))
		enemy["shield"] = float(enemy.get("shield", 0)) + shield
	elif type == "heal":
		var heal: int = ceili(float(enemy.get("maxHp", 1)) * float(action.get("pct", 0.1)))
		enemy["hp"] = minf(float(enemy.get("maxHp", 1)), float(enemy.get("hp", 0)) + heal)
	elif type == "lock":
		var target2: Variant = _pick_alive_member(state)
		if target2 != null:
			enemy.get("locked", []).append(int(target2))
	elif type == "hitLocked":
		var dmg3: int = ceili(int(action.get("dmg", 0)) * dmg_mult_now)
		var locked: Array = enemy.get("locked", [])
		if locked.is_empty():
			var target3: Variant = _pick_alive_member(state)
			if target3 != null:
				_damage_team_member(state, int(target3), float(dmg3))
		else:
			for idx in locked:
				var tm: Array = state.get("team", [])
				if idx >= 0 and idx < tm.size() and tm[idx].get("alive", false):
					_damage_team_member(state, int(idx), float(dmg3))
	elif type == "debuff":
		# 精英 C（新规范）：随机 1 名角色造成伤害降低 50%，持续 2 回合（最好标出哪个角色）
		var target4: Variant = _pick_alive_member(state)
		if target4 == null:
			return
		var t: Dictionary = state.get("team", [])[int(target4)]
		t["status"]["dmgDebuffTurns"] = UniConstants.ENEMY_DEBUFF_DMG_TURNS
		state["log"].append("%s 受到减益：造成伤害降低 50%%（%d 回合）" % [_s(t.get("name", "")), UniConstants.ENEMY_DEBUFF_DMG_TURNS])
	elif type == "healcut":
		for t in state.get("team", []):
			if t.get("alive", false):
				t["status"]["healCut"] = UniConstants.BOSS_HEAL_CUT
	elif type == "stun":
		var target5: Variant = _pick_alive_member(state)
		if target5 == null:
			return
		state.get("team", [])[int(target5)]["status"]["stunned"] = true
	elif type == "summon":
		for i in range(2):
			var summoned: Dictionary = _create_enemy(state, "normal", state.get("combat", {}).get("enemies", []).size())
			state.get("combat", {})["enemies"].append(summoned)
	elif type == "puppet":
		if int(enemy.get("round", 0)) % UniConstants.PUPPET_EVERY == 0 and int(enemy.get("round", 0)) > 0:
			var target6: Variant = _pick_alive_member(state)
			if target6 == null:
				return
			state.get("team", [])[int(target6)]["status"]["puppet"] = true
		else:
			var target7: Variant = _pick_alive_member(state)
			if target7 == null:
				return
			var dmg4: int = ceili(6 * dmg_mult_now)
			_damage_team_member(state, int(target7), float(dmg4))
	# 敌人行动可能把全队打死
	var all_dead: bool = true
	for t in state.get("team", []):
		if t.get("alive", false):
			all_dead = false
			break
	if all_dead:
		end_combat(state, "lost")

## 随机选 1 名存活成员
static func _pick_alive_member(state: Dictionary, exclude_idx: int = -1) -> Variant:
	var alive: Array = []
	for i in range(state.get("team", []).size()):
		var t: Dictionary = state.get("team", [])[i]
		if t.get("alive", false) and i != exclude_idx:
			alive.append(i)
	if alive.is_empty():
		return null
	return alive[randi() % alive.size()]

# ---- 伤害结算 ----

## 对敌人造成伤害
static func _damage_enemy(state: Dictionary, enemy_idx: int, dmg: int, source_idx: int = -1) -> void:
	var c: Dictionary = state.get("combat", {})
	var enemy: Variant = null
	for e in c.get("enemies", []):
		if int(e.get("id", -1)) == enemy_idx:
			enemy = e
			break
	if enemy == null or not enemy.get("alive", false):
		return
	# 精英 C debuff（新规范）：我方目标造成的伤害降低 50%（最终伤害 ×0.5）
	if source_idx >= 0 and source_idx < state.get("team", []).size():
		var src_t: Dictionary = state["team"][source_idx]
		if int(src_t.get("status", {}).get("dmgDebuffTurns", 0)) > 0:
			dmg = ceili(float(dmg) * UniConstants.ENEMY_DEBUFF_DMG_CUT)
	var d: int = dmg
	var shield_dmg: int = mini(int(enemy.get("shield", 0)), d)
	enemy["shield"] = int(enemy.get("shield", 0)) - shield_dmg
	d -= shield_dmg
	# 玛薇卡斗志（新规范）：攻击一次敌人（只要造成伤害，破盾或扣血都算）→ +1 层；单场不归零
	if (shield_dmg > 0 or d > 0) and source_idx >= 0:
		var team: Array = state.get("team", [])
		if source_idx >= 0 and source_idx < team.size():
			var atk: Dictionary = team[source_idx]
			if int(atk.get("status", {}).get("spiritCap", 0)) > 0:
				atk["status"]["spirit"] = mini(int(atk.get("status", {}).get("spiritCap", 0)), int(atk.get("status", {}).get("spirit", 0)) + 1)
	enemy["hp"] = maxf(0.0, float(enemy.get("hp", 0)) - d)
	c["_dmgSeq"] = int(c.get("_dmgSeq", 0)) + 1
	c["lastDamage"] = {"type": "enemy", "idx": enemy_idx, "dmg": dmg, "seq": int(c["_dmgSeq"])}
	if float(enemy.get("hp", 0)) <= 0:
		enemy["alive"] = false
		GameSoundEvents.record_sound(state, "kill")
		if _s(c.get("kind", "")) == "transform" and _s(enemy.get("kind", "")) == "elite":
			UniCore.add_shards(state, UniConstants.TRANSFORM_ELITE_SHARDS)
			state["log"].append("消灭精英 %s，+%d 宇宙碎片" % [_s(enemy.get("name", "")), UniConstants.TRANSFORM_ELITE_SHARDS])
		state["log"].append("击败 %s" % _s(enemy.get("name", "")))
		if source_idx >= 0:
			UniBuffs.trigger_on_kill(state, source_idx)
		if _is_equation_active(state, "shouzu"):
			c["killStacks"] = int(c.get("killStacks", 0)) + 1
		if _is_equation_active(state, "chaoji"):
			UniBuffs.charge_jar_brain(state, float(UniBuffs.EQUATIONS.get("chaoji", {}).get("fx", {}).get("jarBrainKill", 30)))

## 对外导出（uni_skills 需要）
static func damage_enemy(state: Dictionary, enemy_idx: int, dmg: int, source_idx: int = -1) -> void:
	_damage_enemy(state, enemy_idx, dmg, source_idx)

static func has_equation(state: Dictionary, id: String) -> bool:
	for e in state.get("equations", []):
		if _s(e.get("id", "")) == id:
			return true
	return false

## 方程是否生效：已持有且已展开
static func _is_equation_active(state: Dictionary, id: String) -> bool:
	return has_equation(state, id) and UniBuffs.is_equation_unlocked(state, id)

static func _has_curio(state: Dictionary, id: String) -> bool:
	for c in state.get("curios", []):
		if _s(c.get("id", "")) == id:
			return true
	return false

## 推进到下一波
static func next_wave(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	c["wave"] = int(c.get("wave", 0)) + 1
	if int(c["wave"]) >= c.get("waves", []).size():
		end_combat(state, "won")
		return
	spawn_wave(state)
	_check_wave_clear(state)

## 转化层：打完两波后选择撤退或挑战第三波
static func choose_third_wave(state: Dictionary, go: bool) -> Dictionary:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty() or _s(c.get("phase", "")) != "wave-clear":
		return {"ok": false, "reason": "非第三波选择时机"}
	if not go:
		end_combat(state, "won")
		return {"ok": true, "go": false}
	c["waveClear"] = false
	next_wave(state)
	var ph: String = _s(c.get("phase", ""))
	if ph == "won" or ph == "lost":
		return {"ok": true, "go": true}
	if not c.get("enemyQueue", []).is_empty():
		c["phase"] = "enemy-announce"
	else:
		_next_player_action(state)
	return {"ok": true, "go": true}

## 对我方成员造成伤害
static func _damage_team_member(state: Dictionary, member_idx: int, dmg: float) -> void:
	var team: Array = state.get("team", [])
	if member_idx < 0 or member_idx >= team.size():
		return
	var t: Dictionary = team[member_idx]
	var c: Dictionary = state.get("combat", {})
	if not t.get("alive", false):
		return
	var mods: Dictionary = UniBuffs.get_uni_modifiers(state)
	var taken: float = maxf(0.0, 1.0 - (float(mods.get("dmgTakenMult", 0)) + UniBuffs.member_dmg_taken_mods(state, member_idx)) / 100.0)
	if c.get("buffs", []).has("defUp"):
		taken = maxf(0.0, taken - 0.3)
	if c.get("buffs", []).has("immuneFirst") and not c.get("immuneUsed", false):
		c["immuneUsed"] = true
		taken = 0.0
		state["log"].append("免疫符文生效：本次伤害无效")
	var final_dmg: int = maxi(0, ceili(dmg * taken))
	var remaining: int = final_dmg
	# 1. 独立护盾
	if float(t.get("shield", 0)) > 0:
		var shield_dmg: int = mini(int(t.get("shield", 0)), remaining)
		t["shield"] = float(t.get("shield", 0)) - shield_dmg
		remaining -= shield_dmg
		GameSoundEvents.record_sound(state, "shield_break")
	# 2. 防御牌逐张抵扣
	var pile: Array = t.get("status", {}).get("defensePile", [])
	while remaining > 0 and not pile.is_empty():
		var top: Dictionary = pile[pile.size() - 1]
		if int(top.get("value", 0)) >= remaining:
			top["value"] = int(top["value"]) - remaining
			remaining = 0
			if int(top["value"]) == 0:
				pile.pop_back()
		else:
			remaining -= int(top["value"])
			pile.pop_back()
			GameSoundEvents.record_sound(state, "shield_break")
	var hp_dmg: int = mini(int(t.get("hp", 0)), remaining)
	# 湮灭回归不等式
	var final_hp_dmg: int = hp_dmg
	if UniBuffs.blessing_mult(state, "yanmie") > 0 and hp_dmg > 0:
		var alive: Array = []
		for x in team:
			if x.get("alive", false):
				alive.append(x)
		if alive.size() > 1:
			var share: int = ceili(float(hp_dmg) / float(alive.size()))
			for x in alive:
				if x == t:
					continue
				x["hp"] = maxf(0.0, float(x.get("hp", 0)) - share)
				if float(x["hp"]) <= 0:
					x["hp"] = 0
					x["alive"] = false
					state["log"].append("%s 因伤害分担倒下" % _s(x.get("name", "")))
			final_hp_dmg = share
	t["hp"] = float(t.get("hp", 0)) - final_hp_dmg
	if remaining > 0:
		GameSoundEvents.record_sound(state, "hit")
	c["_dmgSeq"] = int(c.get("_dmgSeq", 0)) + 1
	c["lastDamage"] = {"type": "member", "idx": member_idx, "dmg": final_dmg, "seq": int(c["_dmgSeq"])}
	if final_hp_dmg > 0:
		UniBuffs.trigger_on_damaged(state, member_idx, float(final_hp_dmg))
	# 反伤符文
	if hp_dmg > 0 and c.get("buffs", []).has("reflect"):
		var alive_enemies: Array = []
		for e in c.get("enemies", []):
			if e.get("alive", false):
				alive_enemies.append(e)
		if not alive_enemies.is_empty():
			var victim: Dictionary = alive_enemies[randi() % alive_enemies.size()]
			_damage_enemy(state, int(victim.get("id", 0)), hp_dmg, member_idx)
	if float(t.get("hp", 0)) <= 0:
		if UniBuffs.blessing_mult(state, "huiguang") > 0 and not t.get("status", {}).get("huiguangUsed", false):
			t["status"]["huiguangUsed"] = true
			t["hp"] = maxf(1.0, ceili(float(t.get("maxHp", 1)) * 0.01))
			t["status"]["defensePile"] = []
			state["log"].append("回光效应：%s 免于阵亡！" % _s(t.get("name", "")))
		else:
			t["hp"] = 0
			t["alive"] = false
			t["status"]["defensePile"] = []
			state["log"].append("%s 无法战斗" % _s(t.get("name", "")))
		var all_dead: bool = true
		for x in team:
			if x.get("alive", false):
				all_dead = false
				break
		if all_dead:
			end_combat(state, "lost")

## 我方 dot 结算
static func _tick_team_dots(state: Dictionary) -> void:
	for t in state.get("team", []):
		if not t.get("alive", false) or int(t.get("status", {}).get("dot", 0)) <= 0:
			continue
		t["hp"] = maxf(0.0, float(t.get("hp", 0)) - int(t["status"]["dot"]))
		if float(t["hp"]) <= 0:
			t["hp"] = 0
			t["alive"] = false
			state["log"].append("%s 因持续伤害倒下" % _s(t.get("name", "")))
	var all_dead: bool = true
	for t in state.get("team", []):
		if t.get("alive", false):
			all_dead = false
			break
	if all_dead:
		end_combat(state, "lost")

## 敌方 dot 结算
static func _tick_enemy_dots(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty():
		return
	var any_ticked: bool = false
	var total_dot_dmg: int = 0
	for e in c.get("enemies", []):
		if not e.get("alive", false) or int(e.get("dotTurns", 0)) <= 0:
			continue
		any_ticked = true
		var dot_dmg: int = int(e.get("dotDmg", 0))
		if UniBuffs.blessing_mult(state, "beiju") > 0:
			dot_dmg += ceili(float(dot_dmg) * UniBuffs.blessing_val(state, "beiju", "dotPct") / 100.0)
		total_dot_dmg += dot_dmg
		e["hp"] = maxf(0.0, float(e.get("hp", 0)) - dot_dmg)
		e["dotTurns"] = int(e["dotTurns"]) - 1
		if float(e["hp"]) <= 0:
			e["alive"] = false
			GameSoundEvents.record_sound(state, "kill")
			state["log"].append("击败 %s（持续伤害）" % _s(e.get("name", "")))
			if _s(c.get("kind", "")) == "transform" and _s(e.get("kind", "")) == "elite":
				UniCore.add_shards(state, UniConstants.TRANSFORM_ELITE_SHARDS)
	if any_ticked:
		UniBuffs.trigger_on_enemy_dot(state)
		if UniBuffs.blessing_mult(state, "richu") > 0 and total_dot_dmg > 0:
			for t in state.get("team", []):
				if not t.get("alive", false):
					continue
				t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + total_dot_dmg)
	var enemies: Array = c.get("enemies", [])
	if not enemies.is_empty():
		var all_dead: bool = true
		for e in enemies:
			if e.get("alive", false):
				all_dead = false
				break
		if all_dead:
			if _s(c.get("kind", "")) == "transform" and int(c.get("wave", 0)) == 1:
				c["waveClear"] = true
				c["phase"] = "wave-clear"
				return
			next_wave(state)

# ---- 回合推进 ----

## 敌人阶段结束
static func _finish_enemy_turn(state: Dictionary) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty():
		return
	var phase: String = _s(c.get("phase", ""))
	if phase == "won" or phase == "lost":
		return
	c["enemyQueue"] = []
	c["enemyPending"] = null
	UniBuffs.trigger_on_end_turn(state)
	# 方程：苹果！苹果！
	var pingguo_fx: Dictionary = UniBuffs.EQUATIONS.get("pingguo", {}).get("fx", {})
	if _is_equation_active(state, "pingguo") and not pingguo_fx.is_empty() and int(c.get("round", 0)) % int(pingguo_fx.get("every", 3)) == 0:
		var dmg: int = ceili(float(int(pingguo_fx.get("dmgMult", 20))) * UniConstants.dmg_mult(int(state.get("plane", 1))))
		for e in c.get("enemies", []):
			if e.get("alive", false):
				_damage_enemy(state, int(e.get("id", 0)), dmg, -1)
		state["log"].append("苹果！苹果！：对敌方全体造成伤害")
	# 转化及格线
	if _s(c.get("kind", "")) == "transform" and int(c.get("round", 0)) >= UniConstants.TRANSFORM_PASS_ROUND and int(c.get("wave", 0)) < 2:
		state["log"].append("转化：%d 回合仍未消灭两波，战斗失败" % int(c.get("round", 0)))
		end_combat(state, "lost")
		return
	phase = _s(c.get("phase", ""))
	if phase != "won" and phase != "lost":
		start_player_turn(state)

# ---- 战斗结束 ----

## 战斗结束
static func end_combat(state: Dictionary, result: String) -> void:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty():
		return
	var phase: String = _s(c.get("phase", ""))
	if phase == "won" or phase == "lost":
		return
	c["phase"] = result
	if result == "won":
		GameSoundEvents.record_sound(state, "match_end")
		var reward: Dictionary = UniConstants.REGION_REWARD.get(_s(c.get("kind", "")), {})
		var shards: int = 0
		if not reward.is_empty():
			shards = int(reward.get("shards", 0))
			if _has_curio(state, "posui"):
				shards = ceili(float(shards) * 0.75)
			if _has_curio(state, "club"):
				shards = ceili(float(shards) * 1.4)
			UniCore.add_shards(state, shards)
		# 香涎干酪
		if _has_curio(state, "cheese"):
			for t in state.get("team", []):
				if t.get("alive", false):
					t["hp"] = float(t.get("maxHp", 1))
			state["log"].append("香涎干酪：全队回复满生命")
		# 福灵胶
		if _has_curio(state, "fujiao"):
			var fid: String = UniBuffs.roll_blessing(3, 3)
			if fid != "":
				UniBuffs.gain_blessing(state, fid)
			var curios: Array = state.get("curios", [])
			for i in range(curios.size()):
				if _s(curios[i].get("id", "")) == "fujiao":
					curios.remove_at(i)
					state["log"].append("福灵胶使用后损毁")
					break
		c["lastReward"] = {"shards": shards, "blessingPicks": int(reward.get("blessingPicks", 0))}
		state["log"].append("战斗胜利%s" % ("，+%d 宇宙碎片" % shards if shards > 0 else ""))
		# 胜利后祝福三选一
		if int(reward.get("blessingPicks", 0)) > 0 and not state.get("pendingEventReward", null) != null:
			var star_range: Array = reward.get("blessingStars", [1, 3])
			var picks: Array = []
			var pick_count: int = int(reward["blessingPicks"])
			# 阿阮袋：战斗胜利后无法选择，直接获得（新规范）
			if UniBuffs._has_curio(state, "aruan"):
				for i in range(pick_count):
					var bid: String = UniBuffs.roll_blessing(int(star_range[0]), int(star_range[1]))
					if bid != "":
						UniBuffs.gain_blessing(state, bid)
				state["log"].append("阿阮袋：无法选择，直接获得祝福")
			else:
				# 降维骰子：改为 4 次 1~2 星祝福二选一（损毁后恢复 3 次 1~3 星三选一）
				var opt_count: int = 3
				if UniBuffs._has_curio(state, "jiangwei"):
					pick_count = 4
					star_range = [1, 2]
					opt_count = 2
				# 卜签咕咕钟：选项减 1（三选一变二选一）
				if UniBuffs._has_curio(state, "bushu"):
					opt_count = mini(opt_count, 2)
				for i in range(pick_count):
					picks.append({"candidates": UniBuffs.roll_blessing_candidates(opt_count, int(star_range[0]), int(star_range[1])), "starRange": star_range})
				var pending: Array = state.get("pendingBlessingPicks", [])
				pending.append_array(picks)
				state["pendingBlessingPicks"] = pending
				state["log"].append("战斗胜利：可进行 %d 次祝福选择" % pick_count)
		# 胜利后方程奖励
		if int(reward.get("equations", 0)) > 0 and not state.get("pendingEventReward", null) != null:
			var eq_star_range: Array = reward.get("equationStars", [1, 3])
			var gained: int = 0
			for i in range(int(reward["equations"])):
				var eq_id: String = UniBuffs.roll_equation(int(eq_star_range[0]), int(eq_star_range[1]))
				if eq_id != "" and UniBuffs.gain_equation(state, eq_id).get("ok", false):
					gained += 1
			if gained > 0:
				state["log"].append("战斗胜利：获得 %d 个方程（%d~%d 星）" % [gained, int(eq_star_range[0]), int(eq_star_range[1])])
		# 事件战斗奖励
		if state.get("pendingEventReward", null) != null:
			var r: Dictionary = state["pendingEventReward"]
			if r.has("shards"):
				UniCore.add_shards(state, int(r["shards"]))
				state["log"].append("事件奖励：+%d 宇宙碎片" % int(r["shards"]))
			if r.has("blessingPick"):
				var sr2: Array = r.get("blessingStars", [1, 3])
				var picks2: Array = []
				var pc2: int = int(r["blessingPick"])
				if UniBuffs._has_curio(state, "aruan"):
					for i in range(pc2):
						var bid2: String = UniBuffs.roll_blessing(int(sr2[0]), int(sr2[1]))
						if bid2 != "":
							UniBuffs.gain_blessing(state, bid2)
				else:
					var oc2: int = 3
					if UniBuffs._has_curio(state, "jiangwei"):
						pc2 = 4
						sr2 = [1, 2]
						oc2 = 2
					if UniBuffs._has_curio(state, "bushu"):
						oc2 = mini(oc2, 2)
					for i in range(pc2):
						picks2.append({"candidates": UniBuffs.roll_blessing_candidates(oc2, int(sr2[0]), int(sr2[1])), "starRange": sr2})
					var pending2: Array = state.get("pendingBlessingPicks", [])
					pending2.append_array(picks2)
					state["pendingBlessingPicks"] = pending2
			if r.has("skillUpTarget"):
				var upgradable: bool = false
				for t in state.get("team", []):
					if t.get("alive", false) and int(t.get("charId", 0)) != 11:
						upgradable = true
						break
				if not upgradable:
					state["log"].append("无可升级角色，放弃技能升级奖励")
				else:
					state["pendingSkillUpTarget"] = int(state.get("pendingSkillUpTarget", 0)) + int(r["skillUpTarget"])
					state["log"].append("事件战斗胜利：可指定角色技能等级 +%d" % int(r["skillUpTarget"]))
			state["pendingEventReward"] = null
		# 一次性 buff 与临时等级失效
		state["tempSkillBoost"] = 0
		state["nextBattleBuffs"] = {}
		UniBuffs.trigger_curio_on_win(state)
	else:
		GameSoundEvents.record_sound(state, "lose")
		state["log"].append("队伍全灭，模拟宇宙终局")
		# 菜月昴死亡回归
		if UniCore.try_caiyueang_revive(state):
			state["log"].append("死亡回归发动，回到本层开始前")
			return
		state["gameOver"] = true

## 外部查询：当前行动角色
static func current_active(state: Dictionary) -> Variant:
	var c: Dictionary = state.get("combat", {})
	if c.is_empty():
		return null
	var idx: Variant = c.get("activeIdx", null)
	if idx == null:
		return null
	var team: Array = state.get("team", [])
	if int(idx) < 0 or int(idx) >= team.size():
		return null
	return team[int(idx)]
