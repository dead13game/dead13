extends Control
## 牌桌（Godot 版）— 经典模式 + 1v1 比赛模式（世界杯/联赛）
## 功能 UI：玩家位 / 回合信息 / 日志 / 行动栏 / 卡牌选择 / AI 自动行动 / 换人 / 点球

const GameConstants = preload("res://scripts/game/constants.gd")
const GameState = preload("res://scripts/game/game_state.gd")
const GameAi = preload("res://scripts/game/ai/ai.gd")
const GameMatchState = preload("res://scripts/game/match_state.gd")
const SaveManager = preload("res://scripts/autoload/save_manager.gd")

# ---- UI 引用（场景驱动：Unique Name；节点缺失时 _ensure_nodes 降级兜底） ----
@onready var _round_label: Label = %RoundLabel
@onready var _weather_label: Label = %WeatherLabel
@onready var _deck_label: Label = %DeckLabel
@onready var _turn_label: Label = %TurnLabel
@onready var _score_label: Label = %ScoreLabel
@onready var _stage_label: Label = %StageLabel
@onready var _info_label: Label = %InfoLabel
@onready var _players_row: FlowContainer = %PlayersRow
@onready var _card_row: HBoxContainer = %CardRow
@onready var _log_list: VBoxContainer = %LogList
@onready var _overlay: PanelContainer = %Overlay
@onready var _subs_panel: PanelContainer = %SubsPanel
@onready var _penalty_panel: PanelContainer = %PenaltyPanel

# ---- 比赛模式 ----
var _match_mode: bool = false
@onready var _subs_box: VBoxContainer = %SubsBox
@onready var _penalty_score_label: Label = %PenaltyScoreLabel
@onready var _penalty_result_label: Label = %PenaltyResultLabel
@onready var _penalty_kick_btn: Button = %PenaltyKickBtn
@onready var _penalty_finish_btn: Button = %PenaltyFinishBtn
var _last_penalty: Dictionary = {}

# ---- 交互状态 ----
var _state: Dictionary = {}
var _last_log_count: int = 0
var _liniya_subskill: int = 0
var _nahida_order: Array = []
var _gamble_trap_idx: int = -1
var _busy: bool = false
var _ai_loop_running: bool = false

# ---- 行动栏按钮（场景驱动） ----
@onready var _attack_btn: Button = %AttackBtn
@onready var _defense_btn: Button = %DefenseBtn
@onready var _gamble_btn: Button = %GambleBtn
@onready var _skill_btn: Button = %SkillBtn
@onready var _ally_btn: Button = %AllyBtn
@onready var _betray_btn: Button = %BetrayBtn
@onready var _holy_btn: Button = %HolyBtn
@onready var _cancel_btn: Button = %CancelBtn
@onready var _save_btn: Button = %SaveBtn
@onready var _load_btn: Button = %LoadBtn
@onready var _steal_btn: Button = %StealBtn
@onready var _dot_btn: Button = %DotBtn
@onready var _menu_btn: Button = %MenuBtn

func _ready() -> void:
	AudioManager.play_bgm("battle1")
	_state = GameManager.state
	_match_mode = _state.get("matchContext") != null
	_ensure_nodes()
	_connect_signals()
	_refresh_all()
	# 比赛模式：若开局就处于换人/点球（如刚重置后），处理之
	if _match_mode:
		_check_match_pending()
	_maybe_run_ai()

## 场景节点缺失时降级：代码兜底创建（编辑器里搭一半也能跑）
func _ensure_nodes() -> void:
	if _players_row == null:
		_players_row = FlowContainer.new()
		_players_row.add_theme_constant_override("h_separation", 12)
		_players_row.add_theme_constant_override("v_separation", 12)
		add_child(_players_row)
	if _card_row == null:
		_card_row = HBoxContainer.new()
		_card_row.alignment = BoxContainer.ALIGNMENT_CENTER
		_card_row.add_theme_constant_override("separation", 15)
		add_child(_card_row)
	if _log_list == null:
		_log_list = VBoxContainer.new()
		_log_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		add_child(_log_list)
	if _overlay == null:
		_overlay = PanelContainer.new()
		_overlay.visible = false
		add_child(_overlay)
		if not _overlay.has_node("OverlayTitle"):
			var ov_l := Label.new()
			ov_l.name = "OverlayTitle"
			ov_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			ov_l.add_theme_font_size_override("font_size", 54)
			_overlay.add_child(ov_l)
	if _subs_panel == null:
		_subs_panel = PanelContainer.new()
		_subs_panel.visible = false
		add_child(_subs_panel)
	if _penalty_panel == null:
		_penalty_panel = PanelContainer.new()
		_penalty_panel.visible = false
		add_child(_penalty_panel)
	if _subs_box == null:
		_subs_box = VBoxContainer.new()
		_subs_box.add_theme_constant_override("separation", 9)
		if _subs_panel != null:
			_subs_panel.add_child(_subs_box)
	if _stage_label == null:
		_stage_label = Label.new()
		_stage_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_stage_label.add_theme_font_size_override("font_size", 36)
		add_child(_stage_label)
	if _info_label == null:
		_info_label = Label.new()
		_info_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		add_child(_info_label)
	if _round_label == null:
		_round_label = Label.new()
		_round_label.text = "回合 1"
		add_child(_round_label)
	if _weather_label == null:
		_weather_label = Label.new()
		_weather_label.text = "天气：无"
		add_child(_weather_label)
	if _deck_label == null:
		_deck_label = Label.new()
		_deck_label.text = "牌库"
		add_child(_deck_label)
	if _turn_label == null:
		_turn_label = Label.new()
		_turn_label.text = "当前"
		add_child(_turn_label)
	if _score_label == null:
		_score_label = Label.new()
		add_child(_score_label)
	# 点球标签/按钮兜底
	if _penalty_score_label == null:
		_penalty_score_label = Label.new()
		_penalty_score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		if _penalty_panel != null:
			_penalty_panel.add_child(_penalty_score_label)
	if _penalty_result_label == null:
		_penalty_result_label = Label.new()
		_penalty_result_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		if _penalty_panel != null:
			_penalty_panel.add_child(_penalty_result_label)
	if _penalty_kick_btn == null:
		_penalty_kick_btn = Button.new()
		_penalty_kick_btn.text = "⚽ 踢点球"
		if _penalty_panel != null:
			_penalty_panel.add_child(_penalty_kick_btn)
	if _penalty_finish_btn == null:
		_penalty_finish_btn = Button.new()
		_penalty_finish_btn.text = "查看赛果"
		_penalty_finish_btn.visible = false
		if _penalty_panel != null:
			_penalty_panel.add_child(_penalty_finish_btn)

## 连接信号（场景里不连，统一代码连）
func _connect_signals() -> void:
	if _attack_btn != null:
		_attack_btn.pressed.connect(_on_attack)
	if _defense_btn != null:
		_defense_btn.pressed.connect(_on_defense)
	if _gamble_btn != null:
		_gamble_btn.pressed.connect(_on_gamble)
	if _skill_btn != null:
		_skill_btn.pressed.connect(_on_skill)
	if _ally_btn != null:
		_ally_btn.pressed.connect(_on_ally)
	if _betray_btn != null:
		_betray_btn.pressed.connect(_on_betray)
	if _holy_btn != null:
		_holy_btn.pressed.connect(_on_holy_word)
	if _cancel_btn != null:
		_cancel_btn.pressed.connect(_on_cancel)
	if _save_btn != null:
		_save_btn.pressed.connect(_on_save)
	if _load_btn != null:
		_load_btn.pressed.connect(_on_load)
	if _steal_btn != null:
		_steal_btn.pressed.connect(_on_liniya_1)
	if _dot_btn != null:
		_dot_btn.pressed.connect(_on_liniya_2)
	if _menu_btn != null:
		_menu_btn.pressed.connect(_on_overlay_return)
	if _penalty_kick_btn != null:
		_penalty_kick_btn.pressed.connect(_on_penalty_kick)
	if _penalty_finish_btn != null:
		_penalty_finish_btn.pressed.connect(func():
			_penalty_panel.visible = false
			_show_match_over())
	if _subs_panel != null:
		var skip_btn: Button = _subs_panel.find_child("SubsSkipBtn", true, true)
		if skip_btn != null:
			skip_btn.pressed.connect(_on_substitute_skip)
	if _overlay != null:
		var ov_btn: Button = _overlay.find_child("OverlayBtn", true, true)
		if ov_btn != null:
			ov_btn.pressed.connect(_on_overlay_return)
	# 比赛模式信号（换人/点球/赛果）
	if _match_mode:
		GameManager.match_ui_changed.connect(_on_match_ui_changed)

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
	if _match_mode:
		var ms: Dictionary = GameManager.match_state
		var score: Array = ms.get("score", [0, 0])
		var extra: String = "（加时）" if ms.get("isExtraTime", false) else ""
		_score_label.text = "⚽ 玩家 %d : %d 对手 · 第%d局%s" % [
			score[0], score[1], ms.get("matchRound", 1), extra]

func _refresh_players() -> void:
	for child in _players_row.get_children():
		child.queue_free()
	for i in range(_state.get("players", []).size()):
		_players_row.add_child(_make_player_slot(_state["players"][i]))

func _make_player_slot(p: Dictionary) -> Control:
	var btn := Button.new()
	btn.custom_minimum_size = Vector2(294, 210)
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
		l.add_theme_font_size_override("font_size", 20)
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
	_holy_btn.visible = show_bar
	_skill_btn.visible = show_bar
	# 结盟/背刺：仅经典模式（无比赛/联赛上下文）且玩家数 >= 6 才显示
	var _player_total: int = _state.get("players", []).size()
	var _is_classic: bool = _state.get("matchContext") == null and _state.get("leagueContext") == null
	_ally_btn.visible = show_bar and _is_classic and _player_total >= 6
	_betray_btn.visible = show_bar and _is_classic and _player_total >= 6
	# 存/读档：仅当前角色为菜月昴(11) 时显示
	var _is_caiyueang: bool = int(p.get("characterId", 0)) == 11
	_save_btn.visible = is_human and _is_caiyueang
	_load_btn.visible = is_human and _is_caiyueang
	# 偷牌/DoT：点击技能后 && 角色为莉奈娅(9)（LINIYA_PICK 步骤）
	_steal_btn.visible = step == GameConstants.STEP["LINIYA_PICK"] and is_human
	_dot_btn.visible = step == GameConstants.STEP["LINIYA_PICK"] and is_human
	_cancel_btn.visible = not show_bar and is_human and not _state.get("gameOver", false) \
		and step != GameConstants.STEP["PICK_ACTION"]

	if show_bar:
		# 比赛模式：和平阶段禁攻击；经典模式：第4回合后可攻击
		if _state.get("matchContext") != null:
			_attack_btn.disabled = _state.get("phase", "") == GameConstants.PHASE["PEACE"]
		else:
			_attack_btn.disabled = int(_state.get("round", 0)) < 4
		_skill_btn.disabled = not GameState.can_use_skill(_state, p)
		_holy_btn.disabled = not GameState.can_use_holy_word(_state, p)
		_ally_btn.disabled = not _is_classic or _state.get("phase", "") == GameConstants.PHASE["PEACE"] \
			or _state.get("players", []).size() < 4 \
			or p.get("relations", {}).get("allyIndex") != null \
			or int(p.get("relations", {}).get("betrayalPenalty", 0)) > 0
		_betray_btn.disabled = not _is_classic or p.get("relations", {}).get("allyIndex") == null

	# 结算遮罩（比赛模式由 match_ui_changed 控制，经典模式用 gameOver / 本机玩家阵亡）
	var over: bool = _state.get("gameOver", false)
	if _match_mode:
		# 比赛模式：遮罩只在"over"时显示（由 _show_match_over 控制）
		pass
	else:
		# 本机玩家（isAI==false）阵亡但游戏仍在进行 → 显示"你已阵亡"结算遮罩
		var human_dead: bool = false
		if not over:
			for hp in _state.get("players", []):
				if not hp.get("isAI", false) and not hp.get("alive", true):
					human_dead = true
					break
		var show_overlay: bool = over or human_dead
		_overlay.visible = show_overlay
		if show_overlay:
			var title: Label = _overlay.find_child("OverlayTitle", true, true)
			if title != null:
				if over:
					var winner_idx: int = int(_state.get("winnerIndex", -1))
					if winner_idx >= 0 and winner_idx < _state.get("players", []).size():
						title.text = "%s 获胜！" % _state["players"][winner_idx].get("name", "?")
					else:
						title.text = "全员阵亡"
				else:
					title.text = "你已阵亡"

# ============================================================
#  比赛模式（换人 / 点球 / 赛果）
# ============================================================

func _check_match_pending() -> void:
	if not _match_mode:
		return
	var ms: Dictionary = GameManager.match_state
	if ms.get("isPenaltyShootout", false):
		_show_penalty()
	elif ms.get("matchOver", false):
		_show_match_over()
	elif ms.get("substitutionPending", false):
		_handle_substitution_ui()

func _on_match_ui_changed(mode: String) -> void:
	match mode:
		"substitution":
			_handle_substitution_ui()
		"penalty":
			_show_penalty()
		"over":
			_show_match_over()

# ---- 换人 ----

func _handle_substitution_ui() -> void:
	if not _match_mode:
		return
	var ms: Dictionary = GameManager.match_state
	if GameManager._last_scorer_is_player:
		# 玩家进球 → 对手阵亡 → 对手自动换人（随机不同角色），玩家跳过
		var new_char: int = _random_char_excluding(int(ms.get("playerCharId", 0)))
		ms["opponentCharId"] = new_char
		_on_substitute_skip()
		return
	# 玩家阵亡 → 显示换人面板
	_rebuild_subs_panel()
	_subs_panel.visible = true
	_ai_loop_running = true  # 暂停 AI 循环

func _rebuild_subs_panel() -> void:
	for child in _subs_box.get_children():
		child.queue_free()
	var ms: Dictionary = GameManager.match_state
	var opponent_char_id: int = int(ms.get("opponentCharId", 0))
	for cid in range(1, 12):
		if cid == opponent_char_id:
			continue
		var cdata: Dictionary = GameConstants.CHARACTERS.get(cid, {})
		if cdata.is_empty():
			continue
		var btn := Button.new()
		btn.text = "%s（%s）" % [cdata.get("name", "?"), cdata.get("title", "?")]
		btn.custom_minimum_size = Vector2(0, 54)
		var char_id: int = cid
		btn.pressed.connect(func(): _on_substitute_char(char_id))
		_subs_box.add_child(btn)

func _on_substitute_skip() -> void:
	if not _match_mode:
		return
	var ms: Dictionary = GameManager.match_state
	GameMatchState.skip_substitution(ms, _state)
	_after_substitution()

func _on_substitute_char(char_id: int) -> void:
	if not _match_mode:
		return
	var ms: Dictionary = GameManager.match_state
	GameMatchState.execute_substitution(ms, _state, char_id)
	GameMatchState.skip_substitution(ms, _state)
	_after_substitution()

func _after_substitution() -> void:
	_subs_panel.visible = false
	_ai_loop_running = false
	_refresh_all()
	_maybe_run_ai()

func _random_char_excluding(exclude: int) -> int:
	var pool: Array = []
	for cid in range(1, 12):
		if cid != exclude:
			pool.append(cid)
	return pool[randi() % pool.size()]

# ---- 点球 ----

func _show_penalty() -> void:
	_subs_panel.visible = false
	_penalty_panel.visible = true
	_ai_loop_running = true
	_last_penalty = {}
	_refresh_penalty()

func _refresh_penalty() -> void:
	var ms: Dictionary = GameManager.match_state
	var pen: Dictionary = ms.get("penalty", {})
	var p_score: int = int(pen.get("playerScore", 0))
	var o_score: int = int(pen.get("opponentScore", 0))
	_penalty_score_label.text = "玩家 %d : %d 对手" % [p_score, o_score]
	if _last_penalty.is_empty():
		_penalty_result_label.text = "每轮双方各抽2张牌，点数大者得1分，先到5分者胜"
	else:
		var player_cards: Array = _last_penalty.get("playerCards", [])
		var opp_cards: Array = _last_penalty.get("opponentCards", [])
		var pc: String = ""
		for c in player_cards:
			pc += "%s%s " % [c.get("rank", "?"), c.get("suit", "")]
		var oc: String = ""
		for c in opp_cards:
			oc += "%s%s " % [c.get("rank", "?"), c.get("suit", "")]
		var winner: Variant = _last_penalty.get("winner")
		var line: String = "本轮：玩家 %s（%d） vs 对手 %s（%d）" % [
			pc.strip_edges(), _last_penalty.get("playerSum", 0), oc.strip_edges(), _last_penalty.get("opponentSum", 0)]
		if winner != null:
			line += "\n" + ("🎉 玩家获胜！" if int(winner) == 0 else "😔 对手获胜！")
		_penalty_result_label.text = line
	_penalty_kick_btn.visible = ms.get("winner") == null
	_penalty_finish_btn.visible = ms.get("winner") != null

func _on_penalty_kick() -> void:
	var ms: Dictionary = GameManager.match_state
	var saved_over: bool = ms.get("matchOver", true)
	ms["matchOver"] = false
	var result: Dictionary = GameMatchState.execute_penalty_round(ms)
	ms["matchOver"] = saved_over
	if result.is_empty():
		return
	_last_penalty = result
	if result.get("winner") != null:
		ms["winner"] = result.get("winner")
		ms["matchOver"] = true
		_state["gameOver"] = true
		_state["winnerIndex"] = int(result.get("winner", -1))
	_refresh_penalty()

# ---- 赛果 ----

func _show_match_over() -> void:
	_subs_panel.visible = false
	_penalty_panel.visible = false
	_ai_loop_running = true
	var ms: Dictionary = GameManager.match_state
	var title: Label = _overlay.find_child("OverlayTitle", true, true)
	if title != null:
		if ms.get("is3v3", false):
			# 3v3：死亡顺序计分
			var p_score: int = int(ms.get("playerScore", 0))
			var o_score: int = int(ms.get("opponentScore", 0))
			var winner: Variant = ms.get("winner")
			var text: String = "3v3 战报 %d : %d" % [p_score, o_score]
			if winner != null:
				text += "\n" + ("🏆 你赢了！" if int(winner) == 0 else "😔 你输了…")
			else:
				text += "\n平局"
			title.text = text
		else:
			var score: Array = ms.get("score", [0, 0])
			var winner2: Variant = ms.get("winner")
			var text2: String = "比赛结束 %d : %d" % [score[0], score[1]]
			if winner2 != null:
				text2 += "\n" + ("🏆 你赢了！" if int(winner2) == 0 else "😔 你输了…")
			else:
				text2 += "\n平局"
			title.text = text2
	_overlay.visible = true

func _on_overlay_return() -> void:
	if _match_mode:
		if GameManager.match_return_scene != "":
			get_tree().change_scene_to_file(GameManager.match_return_scene)
		else:
			get_tree().change_scene_to_file("res://scenes/main_menu.tscn")
	else:
		GameManager.state = {}
		get_tree().change_scene_to_file("res://scenes/main_menu.tscn")

# ============================================================
#  卡牌 UI
# ============================================================

func _make_card_ui(card: Dictionary, face_up: bool, slot_idx: int = -1) -> Control:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(96, 132)
	var label := Label.new()
	if face_up:
		var rank: String = String(card.get("rank", "?"))
		var suit: String = String(card.get("suit", ""))
		label.text = "%s%s" % [rank, suit]
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.add_theme_font_size_override("font_size", 33)
		if suit == "♥" or suit == "♦":
			label.add_theme_color_override("font_color", Color(1.0, 0.35, 0.35))
		else:
			label.add_theme_color_override("font_color", Color.WHITE)
	else:
		label.text = "🂠"
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.add_theme_font_size_override("font_size", 42)
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
	# 比赛模式（联赛/世界杯）不持久化存档
	if _state.get("leagueContext") != null or _state.get("matchContext") != null:
		return
	# 有菜月昴场景：执行技能存档（内存快照）+ 持久化
	var caiyueang: Variant = _state.get("caiyueang", null)
	if caiyueang != null:
		GameState.execute_caiyueang_save(_state)
	var data: Dictionary = GameState.serialize_game_state(_state)
	SaveManager.save("classic", data)
	var log: Array = _state.get("messageLog", [])
	log.append("💾 已持久化存档")
	_after_action()

func _on_load() -> void:
	if _state.get("leagueContext") != null or _state.get("matchContext") != null:
		return
	var caiyueang: Variant = _state.get("caiyueang", null)
	if caiyueang != null:
		GameState.execute_caiyueang_load(_state)
		_after_action()
		return
	var data: Variant = SaveManager.load("classic")
	if data == null or not data is Dictionary:
		var log2: Array = _state.get("messageLog", [])
		log2.append("无存档")
		_after_action()
		return
	if GameState.deserialize_game_state(_state, data):
		_refresh_all()
		var log3: Array = _state.get("messageLog", [])
		log3.append("📂 读档成功")
	else:
		var log4: Array = _state.get("messageLog", [])
		log4.append("读档失败")
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
	if _match_mode and _match_pending_ui():
		return
	var p: Dictionary = GameState.current_player(_state)
	if not p.get("isAI", false):
		return
	_ai_loop_running = true
	_run_ai_loop()

## 比赛模式：换人/点球/赛果等待 UI 处理时暂停 AI
func _match_pending_ui() -> bool:
	if not _match_mode:
		return false
	var ms: Dictionary = GameManager.match_state
	return ms.get("substitutionPending", false) \
		or ms.get("isPenaltyShootout", false) \
		or ms.get("matchOver", false)

func _run_ai_loop() -> void:
	var steps: int = 0
	while not _state.get("gameOver", false):
		if _match_mode and _match_pending_ui():
			break
		var p: Dictionary = GameState.current_player(_state)
		if not p.get("isAI", false):
			break
		steps += 1
		if steps > 40:
			break
		# AI 行动节奏：0.7s/步（玩家反馈太快，减缓一倍）
		await get_tree().create_timer(0.7).timeout
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
					if not GameState.execute_skill(_state):
						# 兜底：技能执行失败（冷却/阶段限制）时改防御，防止 AI 循环空转卡死
						GameState.execute_defense(_state)
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
