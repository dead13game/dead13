extends Control
## 经典模式牌桌（Godot 版）
## 功能 UI：玩家位 / 回合信息 / 日志 / 行动栏 / 卡牌选择 / AI 自动行动

const GameConstants = preload("res://scripts/game/constants.gd")
const GameState = preload("res://scripts/game/game_state.gd")
const GameAi = preload("res://scripts/game/ai/ai.gd")

# ---- UI 引用 ----
var _round_label: Label
var _weather_label: Label
var _deck_label: Label
var _turn_label: Label
var _stage_label: Label
var _info_label: Label
var _players_row: HBoxContainer
var _card_row: HBoxContainer
var _log_list: VBoxContainer
var _overlay: PanelContainer

var _attack_btn: Button
var _defense_btn: Button
var _gamble_btn: Button
var _skill_btn: Button
var _ally_btn: Button
var _betray_btn: Button
var _holy_btn: Button
var _cancel_btn: Button
var _save_btn: Button
var _load_btn: Button
var _steal_btn: Button
var _dot_btn: Button

# ---- 交互状态 ----
var _state: Dictionary = {}
var _last_log_count: int = 0
var _liniya_subskill: int = 0
var _nahida_order: Array = []
var _gamble_trap_idx: int = -1
var _busy: bool = false
var _ai_loop_running: bool = false

func _ready() -> void:
	_state = GameManager.state
	_build_ui()
	_refresh_all()
	_maybe_run_ai()

# ============================================================
#  UI 构建（代码构建，方便后续在编辑器里调整视觉）
# ============================================================

func _build_ui() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.06, 0.08, 0.1)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	# 顶栏
	var top := HBoxContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_top = 8
	top.offset_bottom = 40
	top.add_theme_constant_override("separation", 18)
	add_child(top)

	_round_label = _top_label(top, "回合 1")
	_weather_label = _top_label(top, "天气：无")
	_deck_label = _top_label(top, "牌库 104")
	_turn_label = _top_label(top, "当前：玩家1")

	var back_btn := Button.new()
	back_btn.text = "返回主菜单"
	back_btn.pressed.connect(func():
		GameManager.state = {}
		get_tree().change_scene_to_file("res://scenes/main_menu.tscn"))
	top.add_child(back_btn)

	# 玩家位
	_players_row = HBoxContainer.new()
	_players_row.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_players_row.offset_top = 44
	_players_row.offset_bottom = 190
	_players_row.alignment = BoxContainer.ALIGNMENT_CENTER
	_players_row.add_theme_constant_override("separation", 12)
	add_child(_players_row)

	# 日志（右侧）
	var log_panel := PanelContainer.new()
	log_panel.set_anchors_preset(Control.PRESET_RIGHT_WIDE)
	log_panel.offset_left = -270
	log_panel.offset_right = -8
	log_panel.offset_top = 8
	log_panel.offset_bottom = -60
	add_child(log_panel)

	var log_margin := MarginContainer.new()
	log_margin.add_theme_constant_override("margin_left", 8)
	log_margin.add_theme_constant_override("margin_right", 8)
	log_margin.add_theme_constant_override("margin_top", 6)
	log_margin.add_theme_constant_override("margin_bottom", 6)
	log_panel.add_child(log_margin)

	var log_title := VBoxContainer.new()
	log_margin.add_child(log_title)
	var lt := Label.new()
	lt.text = "战斗日志"
	lt.add_theme_font_size_override("font_size", 16)
	log_title.add_child(lt)
	var log_scroll := ScrollContainer.new()
	log_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	log_title.add_child(log_scroll)
	_log_list = VBoxContainer.new()
	_log_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	log_scroll.add_child(_log_list)

	# 中央区
	var center := VBoxContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.offset_left = 10
	center.offset_right = -282
	center.offset_top = 196
	center.offset_bottom = -64
	center.add_theme_constant_override("separation", 10)
	add_child(center)

	_stage_label = Label.new()
	_stage_label.text = ""
	_stage_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_stage_label.add_theme_font_size_override("font_size", 24)
	center.add_child(_stage_label)

	_card_row = HBoxContainer.new()
	_card_row.alignment = BoxContainer.ALIGNMENT_CENTER
	_card_row.add_theme_constant_override("separation", 10)
	_card_row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	center.add_child(_card_row)

	_info_label = Label.new()
	_info_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center.add_child(_info_label)

	# 行动栏（底部）
	var bar := HBoxContainer.new()
	bar.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	bar.offset_top = -54
	bar.offset_bottom = -8
	bar.alignment = BoxContainer.ALIGNMENT_CENTER
	bar.add_theme_constant_override("separation", 10)
	add_child(bar)

	_attack_btn = _bar_button(bar, "攻击", _on_attack)
	_defense_btn = _bar_button(bar, "防御", _on_defense)
	_gamble_btn = _bar_button(bar, "赌命", _on_gamble)
	_skill_btn = _bar_button(bar, "技能", _on_skill)
	_ally_btn = _bar_button(bar, "结盟", _on_ally)
	_betray_btn = _bar_button(bar, "背刺", _on_betray)
	_holy_btn = _bar_button(bar, "圣言自明", _on_holy_word)
	_save_btn = _bar_button(bar, "存档", _on_save)
	_load_btn = _bar_button(bar, "读档", _on_load)
	_steal_btn = _bar_button(bar, "偷牌", _on_liniya_1)
	_dot_btn = _bar_button(bar, "DoT", _on_liniya_2)
	_cancel_btn = _bar_button(bar, "取消", _on_cancel)

	# 结算遮罩
	_overlay = PanelContainer.new()
	_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_overlay.visible = false
	add_child(_overlay)
	var ov_center := CenterContainer.new()
	_overlay.add_child(ov_center)
	var ov_vbox := VBoxContainer.new()
	ov_vbox.add_theme_constant_override("separation", 16)
	ov_center.add_child(ov_vbox)
	var ov_title := Label.new()
	ov_title.name = "OverlayTitle"
	ov_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ov_title.add_theme_font_size_override("font_size", 36)
	ov_vbox.add_child(ov_title)
	var ov_btn := Button.new()
	ov_btn.text = "返回主菜单"
	ov_btn.custom_minimum_size = Vector2(200, 44)
	ov_btn.pressed.connect(func():
		GameManager.state = {}
		get_tree().change_scene_to_file("res://scenes/main_menu.tscn"))
	ov_vbox.add_child(ov_btn)

func _top_label(parent: Control, text: String) -> Label:
	var l := Label.new()
	l.text = text
	parent.add_child(l)
	return l

func _bar_button(parent: Control, text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(86, 40)
	b.pressed.connect(cb)
	parent.add_child(b)
	return b

# ============================================================
#  刷新
# ============================================================

func _refresh_all() -> void:
	_refresh_header()
	_refresh_players()
	_refresh_center()
	_refresh_log()
	_refresh_actions()

func _refresh_header() -> void:
	_round_label.text = "回合 %d" % int(_state.get("round", 0))
	var w: Dictionary = GameState.get_current_weather(_state)
	_weather_label.text = "天气：%s" % (w.get("name", "无") if not w.is_empty() else "无")
	_deck_label.text = "牌库 %d / 墓地 %d" % [_state.get("deck", []).size(), _state.get("grave", []).size()]
	var p: Dictionary = GameState.current_player(_state)
	_turn_label.text = "当前：%s" % p.get("name", "?")

func _refresh_players() -> void:
	for child in _players_row.get_children():
		child.queue_free()
	for i in range(_state.get("players", []).size()):
		_players_row.add_child(_make_player_slot(_state["players"][i]))

func _make_player_slot(p: Dictionary) -> Control:
	var btn := Button.new()
	btn.custom_minimum_size = Vector2(196, 140)
	var is_current: bool = _state.get("currentPlayerIndex", -1) == p.get("index")
	var lines: PackedStringArray = []

	var char_data: Dictionary = GameConstants.get_char_data(p)
	var name_line: String = p.get("name", "?")
	if is_current:
		name_line = "▶ " + name_line
	lines.append(name_line)
	lines.append("%s · %s" % [char_data.get("name", "?"), p.get("characterId", 0)])
	lines.append("HP %d/%d %s" % [p.get("hp", 0), p.get("maxHp", 0), "（阵亡）" if not p.get("alive", true) else ""])
	lines.append("防御 %d  陷阱%s  饵%s" % [
		p.get("defensePile", []).size(),
		"有" if p.get("trap") != null else "无",
		"有" if p.get("bait") != null else "无",
	])
	var se: Dictionary = p.get("statusEffects", {})
	var rel: Dictionary = p.get("relations", {})
	var status: PackedStringArray = []
	if se.get("frozenBy") != null:
		status.append("❄冻结")
	if rel.get("allyIndex") != null:
		status.append("🤝联盟")
	if int(rel.get("betrayalPenalty", 0)) > 0:
		status.append("⚠背刺惩罚%d" % rel.get("betrayalPenalty", 0))
	if int(p.get("fightingSpirit", 0)) > 0:
		status.append("斗志%d" % p.get("fightingSpirit", 0))
	if se.get("stealTarget") != null:
		status.append("偷牌中")
	if se.get("dotTarget") != null:
		status.append("DoT中")
	if rel.get("gamblePenalty", false):
		status.append("赌命惩罚")
	if se.get("savepoint") != null:
		status.append("存档点")
	if p.get("isAI", false):
		status.append("AI[%s]" % p.get("aiDifficulty", "easy"))
	if not status.is_empty():
		lines.append(" | ".join(status))
	btn.text = "\n".join(lines)
	btn.disabled = not p.get("alive", true)
	var idx: int = int(p.get("index", 0))
	btn.pressed.connect(func(): _on_player_clicked(idx))
	if is_current:
		btn.add_theme_stylebox_override("normal", _make_border_style(Color(0.9, 0.7, 0.2)))
	return btn

func _make_border_style(border_color: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.12, 0.12, 0.18)
	sb.border_color = border_color
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(6)
	return sb

func _refresh_center() -> void:
	# 清空卡牌区
	for child in _card_row.get_children():
		child.queue_free()

	var step: String = _state.get("step", "")
	var p: Dictionary = GameState.current_player(_state)
	var stage_text: String = ""
	var info_text: String = ""

	match step:
		GameConstants.STEP["ATTACK_SHOW_CARD"]:
			stage_text = "攻击牌已亮出 —— 点击目标玩家"
			var ac: Variant = _state.get("pendingAttackCard")
			if ac != null:
				_card_row.add_child(_make_card_ui(ac, true))
				info_text = "点数 %d" % int(ac.get("value", 0))
		GameConstants.STEP["PICK_TARGET"]:
			stage_text = "选择技能目标"
		GameConstants.STEP["SKILL_PICK_TARGET"]:
			var cid: int = int(p.get("characterId", 0))
			match cid:
				3:
					stage_text = "无想的一刀 —— 选择目标"
				5:
					stage_text = "审判 —— 选择要交换陷阱的目标"
				8:
					stage_text = "重见澄澈晴空 —— 选择伤害目标"
				10:
					stage_text = "冻结 —— 选择目标"
				_:
					stage_text = "选择目标"
		GameConstants.STEP["GAMBLE_PICK"]:
			stage_text = "点击一张牌作陷阱，再点一张作诱饵"
			var pg: Variant = _state.get("pendingGamble")
			if pg != null:
				var cards: Array = pg.get("drawnCards", [])
				for i in range(cards.size()):
					_card_row.add_child(_make_card_ui(cards[i], true, i))
				info_text = "已选陷阱：%d" % _gamble_trap_idx if _gamble_trap_idx >= 0 else "已选陷阱：未选"
		GameConstants.STEP["SKILL_NAHIDA"]:
			stage_text = "点击 5 张牌，按想放回牌库顶的顺序（先点 = 最上面）"
			var scry: Variant = _state.get("scryCards")
			if scry != null:
				for i in range(scry.size()):
					_card_row.add_child(_make_card_ui(scry[i], true, i))
				info_text = "已选顺序：%s" % str(_nahida_order)
		GameConstants.STEP["LINIYA_PICK"]:
			stage_text = "选择子技能（偷牌 / DoT），然后选择目标"
		GameConstants.STEP["CAIYUEANG_PICK"]:
			stage_text = "死亡回归 —— 选择存档或读档"
		"allyPick":
			stage_text = "选择结盟目标"
		_:
			stage_text = "%s 的回合" % p.get("name", "?")

	_stage_label.text = stage_text
	_info_label.text = info_text

func _refresh_log() -> void:
	var entries: Array = _state.get("messageLog", [])
	while _last_log_count < entries.size():
		var entry: String = String(entries[_last_log_count])
		var l := Label.new()
		l.text = entry
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.add_theme_font_size_override("font_size", 13)
		_log_list.add_child(l)
		_last_log_count += 1

func _refresh_actions() -> void:
	var step: String = _state.get("step", "")
	var p: Dictionary = GameState.current_player(_state)
	var is_human: bool = not p.get("isAI", false)
	var is_pick: bool = step == GameConstants.STEP["PICK_ACTION"]
	var show_bar: bool = is_pick and is_human and not _state.get("gameOver", false)

	_attack_btn.visible = show_bar
	_defense_btn.visible = show_bar
	_gamble_btn.visible = show_bar
	_ally_btn.visible = show_bar
	_betray_btn.visible = show_bar
	_holy_btn.visible = show_bar
	_skill_btn.visible = show_bar
	_save_btn.visible = step == GameConstants.STEP["CAIYUEANG_PICK"] and is_human
	_load_btn.visible = step == GameConstants.STEP["CAIYUEANG_PICK"] and is_human
	_steal_btn.visible = step == GameConstants.STEP["LINIYA_PICK"] and is_human
	_dot_btn.visible = step == GameConstants.STEP["LINIYA_PICK"] and is_human
	_cancel_btn.visible = not show_bar and is_human and not _state.get("gameOver", false) \
		and step != GameConstants.STEP["PICK_ACTION"]

	if show_bar:
		_attack_btn.disabled = int(_state.get("round", 0)) < 4 and _state.get("matchContext") == null
		_skill_btn.disabled = not GameState.can_use_skill(_state, p)
		_holy_btn.disabled = not GameState.can_use_holy_word(_state, p)
		_ally_btn.disabled = _state.get("phase", "") == GameConstants.PHASE["PEACE"] \
			or _state.get("players", []).size() < 4 \
			or p.get("relations", {}).get("allyIndex") != null \
			or int(p.get("relations", {}).get("betrayalPenalty", 0)) > 0
		_betray_btn.disabled = p.get("relations", {}).get("allyIndex") == null

	# 结算遮罩
	var over: bool = _state.get("gameOver", false)
	_overlay.visible = over
	if over:
		var title: Label = _overlay.find_child("OverlayTitle", true, false)
		if title != null:
			var winner_idx: int = int(_state.get("winnerIndex", -1))
			if winner_idx >= 0 and winner_idx < _state.get("players", []).size():
				title.text = "%s 获胜！" % _state["players"][winner_idx].get("name", "?")
			else:
				title.text = "全员阵亡"

# ============================================================
#  卡牌 UI
# ============================================================

func _make_card_ui(card: Dictionary, face_up: bool, slot_idx: int = -1) -> Control:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(64, 88)
	var label := Label.new()
	if face_up:
		var rank: String = String(card.get("rank", "?"))
		var suit: String = String(card.get("suit", ""))
		label.text = "%s%s" % [rank, suit]
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.add_theme_font_size_override("font_size", 22)
		if suit == "♥" or suit == "♦":
			label.add_theme_color_override("font_color", Color(1.0, 0.35, 0.35))
		else:
			label.add_theme_color_override("font_color", Color.WHITE)
	else:
		label.text = "🂠"
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.add_theme_font_size_override("font_size", 28)
	panel.add_child(label)
	panel.add_theme_stylebox_override("panel", _make_border_style(Color(0.55, 0.55, 0.65)))
	if slot_idx >= 0:
		panel.gui_input.connect(func(ev: InputEvent):
			if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
				_on_card_clicked(slot_idx))
	return panel

func _on_card_clicked(slot_idx: int) -> void:
	var step: String = _state.get("step", "")
	if step == GameConstants.STEP["GAMBLE_PICK"]:
		if _gamble_trap_idx < 0:
			_gamble_trap_idx = slot_idx
		elif _gamble_trap_idx != slot_idx:
			GameState.submit_gamble(_state, _gamble_trap_idx, slot_idx)
			_gamble_trap_idx = -1
			_after_action()
	elif step == GameConstants.STEP["SKILL_NAHIDA"]:
		if not _nahida_order.has(slot_idx):
			_nahida_order.append(slot_idx)
			if _nahida_order.size() >= _state.get("scryCards", []).size():
				GameState.submit_nahida_scry(_state, _nahida_order)
				_nahida_order.clear()
				_after_action()
	_refresh_center()

# ============================================================
#  玩家点击（目标选择）
# ============================================================

func _on_player_clicked(idx: int) -> void:
	if _busy:
		return
	var step: String = _state.get("step", "")
	var p: Dictionary = GameState.current_player(_state)
	var cid: int = int(p.get("characterId", 0))

	match step:
		GameConstants.STEP["ATTACK_SHOW_CARD"]:
			GameState.execute_attack(_state, idx)
			_after_action()
		GameConstants.STEP["SKILL_PICK_TARGET"]:
			match cid:
				3:
					GameState.execute_raiden_skill(_state, idx)
				5:
					GameState.execute_furina_swap(_state, idx)
				8:
					GameState.execute_fenjin_skill(_state, idx)
				10:
					GameState.execute_aimiliya_skill(_state, idx)
				_:
					return
			_after_action()
		GameConstants.STEP["LINIYA_PICK"]:
			if _liniya_subskill > 0:
				GameState.execute_liniya_skill(_state, idx, _liniya_subskill)
				_liniya_subskill = 0
				_after_action()
		"allyPick":
			GameState.execute_ally(_state, idx)
			_after_action()
		_:
			pass

# ============================================================
#  行动栏回调
# ============================================================

func _on_attack() -> void:
	GameState.start_attack(_state)
	_after_action()

func _on_defense() -> void:
	GameState.execute_defense(_state)
	_after_action()

func _on_gamble() -> void:
	_gamble_trap_idx = -1
	GameState.execute_gamble(_state)
	_after_action()

func _on_skill() -> void:
	var ok: bool = GameState.execute_skill(_state)
	if ok:
		# 纳西妲/莉奈娅等需要清理中间状态
		_nahida_order.clear()
		_liniya_subskill = 0
	_after_action()

func _on_ally() -> void:
	GameState.start_ally(_state)
	_after_action()

func _on_betray() -> void:
	GameState.execute_betray(_state)
	_after_action()

func _on_holy_word() -> void:
	GameState.execute_holy_word(_state)
	_after_action()

func _on_save() -> void:
	GameState.execute_caiyueang_save(_state)
	_after_action()

func _on_load() -> void:
	GameState.execute_caiyueang_load(_state)
	_after_action()

func _on_liniya_1() -> void:
	_liniya_subskill = 1
	_refresh_all()

func _on_liniya_2() -> void:
	_liniya_subskill = 2
	_refresh_all()

func _on_cancel() -> void:
	# 取消当前选择：攻击牌放回墓地，其余直接回 pickAction
	var step: String = _state.get("step", "")
	if step == GameConstants.STEP["ATTACK_SHOW_CARD"]:
		var ac: Variant = _state.get("pendingAttackCard")
		if ac != null:
			_state["grave"].append(ac)
		_state["pendingAttackCard"] = null
		_state["pendingVentiCards"] = null
	elif step == GameConstants.STEP["GAMBLE_PICK"]:
		var pg: Variant = _state.get("pendingGamble")
		if pg != null:
			for c in pg.get("drawnCards", []):
				_state["grave"].append(c)
		_state["pendingGamble"] = null
		_gamble_trap_idx = -1
	elif step == GameConstants.STEP["SKILL_NAHIDA"]:
		var scry: Variant = _state.get("scryCards")
		if scry != null:
			for c in scry:
				_state["grave"].append(c)
		_state["scryCards"] = null
		_nahida_order.clear()
	elif step == GameConstants.STEP["SKILL_PICK_TARGET"]:
		_state["pendingFurinaTarget"] = false
		_state["_aimiliyaFreeze"] = null
	_state["step"] = GameConstants.STEP["PICK_ACTION"]
	_state["endTurn"] = true
	_refresh_all()

# ============================================================
#  行动后处理 + AI
# ============================================================

func _after_action() -> void:
	_refresh_all()
	_maybe_run_ai()

func _maybe_run_ai() -> void:
	if _ai_loop_running:
		return
	if _state.get("gameOver", false):
		return
	var p: Dictionary = GameState.current_player(_state)
	if not p.get("isAI", false):
		return
	_ai_loop_running = true
	_run_ai_loop()

func _run_ai_loop() -> void:
	var steps: int = 0
	while not _state.get("gameOver", false):
		var p: Dictionary = GameState.current_player(_state)
		if not p.get("isAI", false):
			break
		steps += 1
		if steps > 40:
			break
		await get_tree().create_timer(0.35).timeout
		_run_ai_step()
		_refresh_all()
	_ai_loop_running = false

func _run_ai_step() -> void:
	if _state.get("gameOver", false):
		return
	var p: Dictionary = GameState.current_player(_state)
	var step: String = _state.get("step", "")
	var cid: int = int(p.get("characterId", 0))

	match step:
		GameConstants.STEP["PICK_ACTION"]:
			var dec: Dictionary = GameAi.decide_top_action(_state)
			match String(dec.get("action", "defense")):
				"attack":
					GameState.start_attack(_state)
				"defense":
					GameState.execute_defense(_state)
				"gamble":
					GameState.execute_gamble(_state)
				"skill":
					GameState.execute_skill(_state)
		GameConstants.STEP["ATTACK_SHOW_CARD"]:
			var t: Dictionary = GameAi.decide_target(_state, {"action": "attack", "characterId": cid})
			GameState.execute_attack(_state, int(t.get("targetIndex", 0)))
		GameConstants.STEP["SKILL_PICK_TARGET"]:
			var t2: Dictionary = GameAi.decide_target(_state, {"action": "skill", "characterId": cid})
			var ti: int = int(t2.get("targetIndex", 0))
			match cid:
				3:
					GameState.execute_raiden_skill(_state, ti)
				5:
					GameState.execute_furina_swap(_state, ti)
				8:
					GameState.execute_fenjin_skill(_state, ti)
				10:
					GameState.execute_aimiliya_skill(_state, ti)
		GameConstants.STEP["GAMBLE_PICK"]:
			var pg: Variant = _state.get("pendingGamble")
			if pg != null:
				var g: Dictionary = GameAi.decide_gamble_pick(_state, pg.get("drawnCards", []))
				GameState.submit_gamble(_state, int(g.get("trapIdx", 0)), int(g.get("baitIdx", 0)))
		GameConstants.STEP["SKILL_NAHIDA"]:
			var scry: Variant = _state.get("scryCards")
			if scry != null:
				var order: Array = GameAi.decide_nahida_order(_state, scry)
				GameState.submit_nahida_scry(_state, order)
		GameConstants.STEP["LINIYA_PICK"]:
			var l: Dictionary = GameAi.decide_liniya_choice(_state)
			GameState.execute_liniya_skill(_state, int(l.get("targetIndex", 0)), int(l.get("subSkill", 2)))
		GameConstants.STEP["CAIYUEANG_PICK"]:
			var c: Dictionary = GameAi.decide_caiyueang_choice(_state)
			if String(c.get("choice", "save")) == "load":
				GameState.execute_caiyueang_load(_state)
			else:
				GameState.execute_caiyueang_save(_state)
		"allyPick":
			var t3: Dictionary = GameAi.decide_target(_state, {"action": "ally", "characterId": cid})
			GameState.execute_ally(_state, int(t3.get("targetIndex", 0)))
		_:
			pass
