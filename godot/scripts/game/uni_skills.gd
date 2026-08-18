class_name UniSkills
## 模拟宇宙角色 PVE 技能（从 src/simuniverse/logic/uniSkills.js 移植）
## 等级 1-10 查表 / 冷却 / 菜月昴读档
## 依赖 uni_combat（draw_poker / damage_enemy / grant_extra_action）

const UniConstants = preload("res://scripts/game/uni_constants.gd")
const UniBuffs = preload("res://scripts/game/uni_buffs.gd")
const UniCombat = preload("res://scripts/game/uni_combat.gd")
const GameSoundEvents = preload("res://scripts/game/sound_events.gd")

static func _s(v: Variant) -> String:
	return "" if v == null else str(v)

## 技能等级取值（数组按等级 1-10，越界取末项）
static func _val(arr: Array, lv: int) -> float:
	if arr.is_empty():
		return 0.0
	var idx: int = mini(lv, arr.size()) - 1
	return float(arr[idx])

## 有效技能等级（含临时提升）
static func _effective_level(state: Dictionary, t: Dictionary) -> int:
	return mini(10, int(t.get("skillLevel", 1)) + int(state.get("tempSkillBoost", 0)))

## 当前行动角色是否可用大招
static func can_use_uni_skill(state: Dictionary, char_index: int) -> Dictionary:
	var team: Array = state.get("team", [])
	if char_index < 0 or char_index >= team.size():
		return {"ok": false, "reason": "无法行动"}
	var t: Dictionary = team[char_index]
	if not t.get("alive", false):
		return {"ok": false, "reason": "无法行动"}
	var sk: Dictionary = UniConstants.UNI_SKILLS.get(int(t.get("charId", 0)), {})
	if sk.is_empty() or _s(sk.get("type", "")) != "active":
		return {"ok": false, "reason": "被动技能"}
	if int(t.get("skillCooldown", 0)) > 0:
		return {"ok": false, "reason": "冷却 %d 回合" % int(t.get("skillCooldown", 0))}
	return {"ok": true}

## 技能展示信息（UI 用）
static func get_skill_info(state: Dictionary, char_index: int) -> Variant:
	var team: Array = state.get("team", [])
	if char_index < 0 or char_index >= team.size():
		return null
	var t: Dictionary = team[char_index]
	var sk: Dictionary = UniConstants.UNI_SKILLS.get(int(t.get("charId", 0)), {})
	if sk.is_empty():
		return null
	var lv: int = _effective_level(state, t)
	var info: Dictionary = {
		"name": _s(sk.get("name", "")),
		"type": _s(sk.get("type", "")),
		"level": lv,
		"cooldown": int(t.get("skillCooldown", 0)),
		"cdTotal": _val(sk.get("cd", []), lv) if sk.has("cd") else null,
		"value": _val(sk.get("values", []), lv) if sk.has("values") else null,
		"extra": null,
	}
	if sk.has("heal"):
		info["extra"] = {"heal": _val(sk["heal"], lv)}
	elif sk.has("dot"):
		info["extra"] = {"dot": _val(sk["dot"], lv), "dotTurns": _val(sk["dotTurns"], lv)}
	return info

## 执行大招
static func execute_uni_skill(state: Dictionary, char_index: int, payload: Dictionary = {}) -> Dictionary:
	var c: Dictionary = state.get("combat", {})
	var team: Array = state.get("team", [])
	if char_index < 0 or char_index >= team.size():
		return {"ok": false, "reason": "无法行动"}
	var t: Dictionary = team[char_index]
	if not t.get("alive", false):
		return {"ok": false, "reason": "无法行动"}
	if int(c.get("activeIdx", -1)) != char_index:
		return {"ok": false, "reason": "非当前行动角色"}
	var sk: Dictionary = UniConstants.UNI_SKILLS.get(int(t.get("charId", 0)), {})
	if sk.is_empty() or _s(sk.get("type", "")) != "active":
		return {"ok": false, "reason": "被动技能"}
	if int(t.get("skillCooldown", 0)) > 0:
		return {"ok": false, "reason": "冷却 %d 回合" % int(t.get("skillCooldown", 0))}
	var lv: int = _effective_level(state, t)
	# 阈下知觉：首次终结技
	var yuxia_fx: Dictionary = UniBuffs.BLESSINGS.get("yuxia", {}).get("fx", {})
	var yuxia_boost: float = 0.0
	if not yuxia_fx.is_empty() and UniBuffs.blessing_mult(state, "yuxia") > 0 and not state.get("uniFirstUltUsed", false):
		state["uniFirstUltUsed"] = true
		yuxia_boost = UniBuffs.blessing_val(state, "yuxia", "atkPct")
		t["status"]["nextSkillBoost"] = float(t.get("status", {}).get("nextSkillBoost", 0)) + yuxia_boost
	var effect: Dictionary = _do_skill(state, t, sk, lv, payload)
	if not effect.get("ok", false) and yuxia_boost > 0:
		state["uniFirstUltUsed"] = false
		t["status"]["nextSkillBoost"] = maxf(0.0, float(t.get("status", {}).get("nextSkillBoost", 0)) - yuxia_boost)
		return effect
	if not effect.get("ok", false):
		return effect
	# 冷却置满
	t["skillCooldown"] = int(_val(sk.get("cd", []), lv)) if sk.has("cd") else 0
	# 罐中脑（新规范）：充能满 100% → 立即消耗 100%，当前行动角色大招后可再次激活大招（清冷却、保持行动）
	if float(state.get("jarBrain", 0)) >= 100.0:
		state["jarBrain"] = 0.0
		t["skillCooldown"] = 0
		c["_jarBrainExtraUlt"] = true
		state["log"].append("罐中脑能量释放：可再次激活大招")
	# 记录最近施放的技能
	if not c.is_empty():
		c["_skillSeq"] = int(c.get("_skillSeq", 0)) + 1
		c["lastSkill"] = {"charId": int(t.get("charId", 0)), "actor": char_index, "seq": int(c["_skillSeq"])}
	# 祝福钩子
	UniBuffs.trigger_after_skill(state, char_index)
	# 方程：蛰虫帝
	if UniBuffs.is_equation_unlocked(state, "zhedi") and _has_equation(state, "zhedi"):
		var alive_enemies: Array = []
		for e in c.get("enemies", []):
			if e.get("alive", false):
				alive_enemies.append(e)
		if not alive_enemies.is_empty():
			var victim: Dictionary = alive_enemies[randi() % alive_enemies.size()]
			var dmg: int = ceili(float(t.get("maxHp", 1)) * 0.1)
			UniCombat.damage_enemy(state, int(victim.get("id", 0)), dmg, char_index)
	GameSoundEvents.record_sound(state, "skill")
	var ph: String = _s(c.get("phase", ""))
	if ph == "won" or ph == "lost":
		return {"ok": true, "effect": effect}
	return {"ok": true, "effect": effect}

static func _has_equation(state: Dictionary, id: String) -> bool:
	for e in state.get("equations", []):
		if _s(e.get("id", "")) == id:
			return true
	return false

## 终结技伤害加成
static func _skill_dmg_mult(state: Dictionary, t: Dictionary) -> float:
	var mods: Dictionary = UniBuffs.get_uni_modifiers(state)
	var one_shot: float = float(t.get("status", {}).get("nextSkillBoost", 0))
	if one_shot > 0:
		t["status"]["nextSkillBoost"] = 0
	return float(mods.get("skillDmgMult", 0)) + one_shot

## 各角色技能实现
static func _do_skill(state: Dictionary, t: Dictionary, sk: Dictionary, lv: int, payload: Dictionary) -> Dictionary:
	var c: Dictionary = state.get("combat", {})
	match int(t.get("charId", 0)):
		1:
			# 温迪：爆发 n 张牌
			var n: int = int(_val(sk.get("values", []), lv))
			if not payload.has("targetIdx") or payload["targetIdx"] == null:
				return {"ok": false, "reason": "需要目标"}
			var cards: Array = UniCombat.draw_poker(state, n)
			var sum_val: int = 0
			for p in cards:
				sum_val += int(p.get("value", 0))
			var dmg: int = maxi(0, ceili(float(maxi(0, sum_val - 2)) * (1 + _skill_dmg_mult(state, t) / 100.0)))
			UniCombat.damage_enemy(state, int(payload["targetIdx"]), dmg, int(t.get("index", 0)))
			state["log"].append("%s 爆发 %d 张牌（%d 伤害）" % [_s(t.get("name", "")), n, dmg])
			return {"ok": true, "summary": {"cards": n, "dmg": dmg}}
		2:
			# 钟离：全队护盾
			var shield: int = int(_val(sk.get("values", []), lv))
			var mods: Dictionary = UniBuffs.get_uni_modifiers(state)
			var gain: int = ceili(float(shield) * (1 + float(mods.get("shieldMult", 0)) / 100.0))
			for m in state.get("team", []):
				if m.get("alive", false):
					m["shield"] = float(m.get("shield", 0)) + gain
			state["log"].append("%s 全队 +%d 护盾" % [_s(t.get("name", "")), gain])
			return {"ok": true, "summary": {"shield": gain}}
		3:
			# 雷电将军：单体伤害
			if not payload.has("targetIdx") or payload["targetIdx"] == null:
				return {"ok": false, "reason": "需要目标"}
			var dmg3: int = ceili(float(_val(sk.get("values", []), lv)) * (1 + _skill_dmg_mult(state, t) / 100.0))
			UniCombat.damage_enemy(state, int(payload["targetIdx"]), dmg3, int(t.get("index", 0)))
			state["log"].append("%s 对目标造成 %d 伤害" % [_s(t.get("name", "")), dmg3])
			return {"ok": true, "summary": {"dmg": dmg3}}
		4:
			# 纳西妲：指定 1-4 人立即行动
			var count: int = int(_val(sk.get("values", []), lv))
			var members: Array = payload.get("members", [])
			if members.size() == 0:
				return {"ok": false, "reason": "需要选择角色"}
			var granted: int = 0
			for idx in members:
				if UniCombat.grant_extra_action(state, int(idx)):
					granted += 1
			state["log"].append("%s 让 %d 名角色立即行动" % [_s(t.get("name", "")), members.size()])
			return {"ok": true, "summary": {"granted": granted, "members": members}}
		5:
			# 芙宁娜：全队增伤 + 治疗
			var pct: float = _val(sk.get("values", []), lv)
			var heal_pct: float = _val(sk.get("heal", []), lv)
			var mods5: Dictionary = UniBuffs.get_uni_modifiers(state)
			var heal_base: int = ceili(float(t.get("maxHp", 1)) * heal_pct / 100.0)
			var heal_amount: int = ceili(float(heal_base) * (1 + float(mods5.get("healMult", 0)) / 100.0))
			for m in state.get("team", []):
				if not m.get("alive", false):
					continue
				m["status"]["dmgBuffPct"] = maxf(float(m.get("status", {}).get("dmgBuffPct", 0)), pct)
				m["status"]["dmgBuffTurns"] = 3
				var amount: int = heal_amount
				if float(m.get("status", {}).get("healCut", 0)) > 0:
					amount = ceili(float(amount) * (1.0 - float(m["status"]["healCut"])))
				m["hp"] = minf(float(m.get("maxHp", 1)), float(m.get("hp", 0)) + amount)
			state["log"].append("%s 全队增伤 %d%%（3 回合），治疗 %d" % [_s(t.get("name", "")), int(pct), heal_amount])
			return {"ok": true, "summary": {"pct": int(pct), "healAmount": heal_amount}}
		6, 7:
			return {"ok": false, "reason": "被动技能"}
		8:
			# 风堇：全队生命上限 +% → 回满 → 回复量 10% 伤害
			var pct8: int = int(_val(sk.get("values", []), lv))
			var total_healed: int = 0
			for m in state.get("team", []):
				if not m.get("alive", false):
					continue
				m["status"]["origMaxHp"] = float(m.get("maxHp", 1))
				var new_max: int = ceili(float(m.get("maxHp", 1)) * (100 + pct8) / 100.0)
				m["status"]["maxHpBuffPct"] = pct8
				m["status"]["maxHpBuffTurns"] = 3
				total_healed += new_max - int(m.get("hp", 0))
				m["maxHp"] = new_max
				m["hp"] = new_max
			var bonus_dmg: int = ceili(float(total_healed) * 0.1)
			if bonus_dmg > 0:
				var targets: Array = []
				for e in c.get("enemies", []):
					if e.get("alive", false):
						targets.append(e)
				if not targets.is_empty():
					var victim8: Dictionary = targets[randi() % targets.size()]
					UniCombat.damage_enemy(state, int(victim8.get("id", 0)), ceili(float(bonus_dmg) * (1 + _skill_dmg_mult(state, t) / 100.0)), int(t.get("index", 0)))
			state["log"].append("%s 全队生命上限 +%d%% 并回满（附加 %d 伤害）" % [_s(t.get("name", "")), pct8, bonus_dmg])
			return {"ok": true, "summary": {"pct": pct8, "totalHealed": total_healed, "bonusDmg": bonus_dmg}}
		9:
			# 莉奈娅：一技能 全队 N 张盾 / 二技能 dot
			var branch: String = _s(payload.get("branch", "shield"))
			var n9: int = int(_val(sk.get("values", []), lv))
			if branch == "dot":
				var dot: int = int(_val(sk.get("dot", []), lv))
				var turns: int = int(_val(sk.get("dotTurns", []), lv))
				if turns > 0:
					for e in c.get("enemies", []):
						if not e.get("alive", false):
							continue
						e["dotDmg"] = dot
						e["dotTurns"] = turns
					state["log"].append("%s 全体敌人受 %d 点持续伤害（%d 回合）" % [_s(t.get("name", "")), dot, turns])
					return {"ok": true, "summary": {"branch": "dot", "dot": dot, "turns": turns}}
				for e in c.get("enemies", []):
					if e.get("alive", false):
						UniCombat.damage_enemy(state, int(e.get("id", 0)), ceili(float(dot) * (1 + _skill_dmg_mult(state, t) / 100.0)), int(t.get("index", 0)))
				state["log"].append("%s 全体敌人受 %d 点伤害" % [_s(t.get("name", "")), dot])
				return {"ok": true, "summary": {"branch": "dot", "dot": dot, "turns": 0}}
			var mods9: Dictionary = UniBuffs.get_uni_modifiers(state)
			var shield9: int = ceili(float(n9) * float(UniConstants.LINIYA_SHIELD_VALUE) * (1 + float(mods9.get("shieldMult", 0)) / 100.0))
			for m in state.get("team", []):
				if m.get("alive", false):
					m["shield"] = float(m.get("shield", 0)) + shield9
			state["log"].append("%s 全队 +%d 张盾（%d 护盾）" % [_s(t.get("name", "")), n9, shield9])
			return {"ok": true, "summary": {"branch": "shield", "shields": n9, "shield": shield9}}
		10:
			# 爱蜜莉雅：敌方停 N 回合
			var turns10: int = int(_val(sk.get("values", []), lv))
			for e in c.get("enemies", []):
				if not e.get("alive", false):
					continue
				e["stunnedTurns"] = maxi(int(e.get("stunnedTurns", 0)), turns10)
			state["log"].append("%s 敌方全体停 %d 回合" % [_s(t.get("name", "")), turns10])
			return {"ok": true, "summary": {"turns": turns10}}
		11:
			return {"ok": false, "reason": "被动技能（死亡回归）"}
		12:
			# myracler(开发者)
			var dmg12: int = ceili(float(_val(sk.get("values", []), lv)) * (1 + _skill_dmg_mult(state, t) / 100.0))
			for e in c.get("enemies", []):
				if e.get("alive", false):
					UniCombat.damage_enemy(state, int(e.get("id", 0)), dmg12, int(t.get("index", 0)))
			state["log"].append("%s 开发者指令：对敌方全体造成 %d 伤害" % [_s(t.get("name", "")), dmg12])
			return {"ok": true, "summary": {"dmg": dmg12, "targets": c.get("enemies", []).size()}}
		_:
			return {"ok": false, "reason": "未知角色"}
