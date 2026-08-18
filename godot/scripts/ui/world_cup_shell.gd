extends Control
## 世界杯模式外壳：小组赛 → 积分榜 → 淘汰赛 → 冠军
## 比赛在 game_table 中进行，结束后返回本场景继续

const GameConstants = preload("res://scripts/game/constants.gd")
const GameWorldCup = preload("res://scripts/game/world_cup.gd")
const GameWorldCupConstants = preload("res://scripts/game/world_cup_constants.gd")
const GameMatchState = preload("res://scripts/game/match_state.gd")

@onready var _back_btn: Button = find_child("BackBtn", true, false) as Button
@onready var _title: Label = %TitleLabel
@onready var _content: VBoxContainer = %ContentBox

## 安全转 String（null → 空串）
static func _s(v: Variant) -> String:
	return "" if v == null else str(v)

func _ready() -> void:
	_ensure_nodes()
	_bind_back()
	_handle_return_from_match()
	_refresh()

## 场景节点缺失时降级：代码兜底创建（编辑器里搭一半也能跑）
func _ensure_nodes() -> void:
	if _title == null:
		_title = Label.new()
		_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_title.add_theme_font_size_override("font_size", 45)
		add_child(_title)
	if _content == null:
		_content = VBoxContainer.new()
		_content.add_theme_constant_override("separation", 12)
		var scroll := ScrollContainer.new()
		scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
		add_child(scroll)
		scroll.add_child(_content)

## 绑定返回按钮（场景缺 BackBtn 时兜底创建）
func _bind_back() -> void:
	if _back_btn == null:
		_back_btn = Button.new()
		_back_btn.text = "← 返回主菜单"
		add_child(_back_btn)
	if not _back_btn.pressed.is_connected(_on_back):
		_back_btn.pressed.connect(_on_back)

func _on_back() -> void:
	GameManager.wc_state = {}
	GameManager.state = {}
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")

## 从比赛返回后记录结果
func _handle_return_from_match() -> void:
	if GameManager.match_state.is_empty():
		return
	var ms: Dictionary = GameManager.match_state
	var wc: Dictionary = GameManager.wc_state
	if ms.get("isGroupStage", false):
		var match_idx: int = int(wc.get("_currentMatchIdx", -1))
		if match_idx >= 0:
			var result: String = GameMatchState.get_group_match_result(ms)
			var mapped: String = "draw"
			if result == "win":
				mapped = "home"
			elif result == "loss":
				mapped = "away"
			# 真实比分：玩家=主队(home)，对手=客队(away)，用于积分榜净胜球
			var scr: Array = ms.get("score", [0, 0])
			var home_goals: int = int(scr[0]) if scr.size() > 0 else -1
			var away_goals: int = int(scr[1]) if scr.size() > 1 else -1
			GameWorldCup.record_group_match_result(wc, match_idx, mapped, home_goals, away_goals)
	else:
		var winner: Variant = ms.get("winner")
		if int(ms.get("matchRound", 1)) <= 1:
			pass
		if winner != null and int(winner) == 0:
			if _s(wc.get("knockoutRound")) == "Final":
				wc["phase"] = "champion"
			else:
				GameWorldCup.advance_knockout_round(wc)
		elif winner != null and int(winner) == 1:
			GameWorldCup.eliminate_player(wc)
	GameManager.match_state = {}

func _refresh() -> void:
	if GameManager.wc_state.is_empty():
		_show_setup()
		return
	var wc: Dictionary = GameManager.wc_state
	var phase: String = _s(wc.get("phase", "group"))
	if phase == "champion":
		_show_end(true)
	elif phase == "eliminated":
		_show_end(false)
	elif wc.get("knockoutRound") != null:
		_show_knockout()
	else:
		_show_group()

# ===== 设置 =====

func _show_setup() -> void:
	_title.text = "世界杯 · 开始"
	for child in _content.get_children():
		child.queue_free()

	var name_label := Label.new()
	name_label.text = "你的球队名称"
	_content.add_child(name_label)
	var name_edit := LineEdit.new()
	name_edit.placeholder_text = "例如：梦魂队"
	_content.add_child(name_edit)

	var char_label := Label.new()
	char_label.text = "你的角色"
	_content.add_child(char_label)
	var char_option := OptionButton.new()
	for cid in range(1, 12):
		var cdata: Dictionary = GameConstants.CHARACTERS.get(cid, {})
		if cdata.is_empty():
			continue
		char_option.add_item("%s（%s）" % [cdata.get("name", "?"), cdata.get("title", "?")], cid)
	char_option.select(0)
	_content.add_child(char_option)

	var diff_label := Label.new()
	diff_label.text = "对手 AI 难度"
	_content.add_child(diff_label)
	var diff_option := OptionButton.new()
	diff_option.add_item("简单", 0)
	diff_option.add_item("熟练", 1)
	diff_option.add_item("地狱", 2)
	diff_option.select(1)
	_content.add_child(diff_option)

	var start_btn := Button.new()
	start_btn.text = "开始世界杯"
	start_btn.custom_minimum_size = Vector2(0, 66)
	start_btn.pressed.connect(func():
		var team_name: String = name_edit.text.strip_edges()
		if team_name.is_empty():
			team_name = "梦魂队"
		GameManager.new_world_cup(team_name)
		GameManager.wc_state["_playerCharId"] = char_option.get_selected_id()
		var diff: String = "easy"
		if diff_option.selected == 1:
			diff = "skilled"
		elif diff_option.selected == 2:
			diff = "hell"
		GameManager.wc_state["_aiDifficulty"] = diff
		_refresh())
	_content.add_child(start_btn)

# ===== 小组赛 =====

func _show_group() -> void:
	var wc: Dictionary = GameManager.wc_state
	_title.text = "小组赛 A 组 · %s" % wc.get("playerTeamName", "?")
	for child in _content.get_children():
		child.queue_free()

	var group_teams: Array = wc.get("groupTeams", [])
	var teams_line := Label.new()
	var names: Array = []
	for t in group_teams:
		names.append("%s %s" % [t.get("emoji", ""), t.get("name", "?")])
	teams_line.text = " | ".join(names)
	_content.add_child(teams_line)

	var matches: Array = wc.get("groupMatches", [])
	var all_player_done: bool = true
	for m in matches:
		if m.get("isPlayerMatch", false) and not m.get("played", false):
			all_player_done = false
			break
	for i in range(matches.size()):
		var m: Dictionary = matches[i]
		if m.get("isPlayerMatch", false):
			var opp_name: String = _opponent_name_for_match(wc, i)
			if m.get("played", false):
				var res: String = _s(m.get("result"))
				var res_text: String = "平局"
				if res == "home":
					res_text = "✅ 胜"
				elif res == "away":
					res_text = "❌ 负"
				var label1 := Label.new()
				label1.text = "第%d场 vs %s —— %s" % [i + 1, opp_name, res_text]
				_content.add_child(label1)
			else:
				var btn := Button.new()
				btn.text = "⚽ 第%d场 vs %s（开始）" % [i + 1, opp_name]
				var match_idx: int = i
				btn.pressed.connect(func(): _start_group_match(match_idx))
				_content.add_child(btn)
				continue
		else:
			var resv: Variant = m.get("result")
			var t_home: Dictionary = group_teams[int(m.get("home", 0))]
			var t_away: Dictionary = group_teams[int(m.get("away", 0))]
			var sim_state: String = "已模拟" if m.get("played", false) else "待模拟"
			var label2 := Label.new()
			label2.text = "%s vs %s（%s）" % [t_home.get("name", "?"), t_away.get("name", "?"), sim_state]
			_content.add_child(label2)

	if all_player_done:
		# 玩家3场打完 → 模拟非玩家比赛并计算积分榜
		GameWorldCup.simulate_non_player_matches(wc)
		GameWorldCup.calculate_group_standings(wc)
		var standings: Array = wc.get("groupStandings", [])
		_content.add_child(_make_h_sep())
		var st_title := Label.new()
		st_title.text = "小组积分榜"
		st_title.add_theme_font_size_override("font_size", 27)
		_content.add_child(st_title)
		for t in standings:
			var row: Label = Label.new()
			var mark: String = "⭐" if t.get("isPlayer", false) else ""
			row.text = "%s %s %s  场%d 胜%d 平%d 负%d 积分%d" % [
				t.get("emoji", ""), mark, t.get("name", "?"),
				t.get("played", 0), t.get("wins", 0), t.get("draws", 0),
				t.get("losses", 0), t.get("points", 0)]
			_content.add_child(row)
		var adv: Dictionary = GameWorldCup.check_group_advancement(wc)
		var adv_label := Label.new()
		if adv.get("advanced", false):
			adv_label.text = "🎉 你以小组第%d名出线！" % int(adv.get("rank", 0))
			adv_label.add_theme_color_override("font_color", Color(0.4, 1.0, 0.4))
		else:
			adv_label.text = "😔 小组第%d名，未能出线…" % int(adv.get("rank", 0))
			adv_label.add_theme_color_override("font_color", Color(1.0, 0.4, 0.4))
		_content.add_child(adv_label)
		var cont_btn := Button.new()
		if adv.get("advanced", false):
			cont_btn.text = "进入淘汰赛 ➜"
		else:
			cont_btn.text = "结束征程"
		cont_btn.custom_minimum_size = Vector2(0, 60)
		cont_btn.pressed.connect(func():
			if adv.get("advanced", false):
				GameWorldCup.advance_knockout_round(wc)
			else:
				GameWorldCup.eliminate_player(wc)
			_refresh())
		_content.add_child(cont_btn)

func _opponent_name_for_match(wc: Dictionary, match_idx: int) -> String:
	var matches: Array = wc.get("groupMatches", [])
	var m: Dictionary = matches[match_idx]
	var group_teams: Array = wc.get("groupTeams", [])
	var opp: Dictionary = group_teams[int(m.get("home", 0))] if int(m.get("home", 0)) != 0 else group_teams[int(m.get("away", 1))]
	return opp.get("name", "?")

func _start_group_match(match_idx: int) -> void:
	var wc: Dictionary = GameManager.wc_state
	var player_char_id: int = int(wc.get("_playerCharId", 1))
	var opponent_char_id: int = GameWorldCup.get_random_group_opponent_char()
	var opponent_name: String = _opponent_name_for_match(wc, match_idx)
	var player_name: String = _s(wc.get("playerTeamName", "玩家"))
	wc["_currentMatchIdx"] = match_idx
	GameManager.start_match(player_char_id, opponent_char_id, true, player_name, opponent_name, 999, _s(wc.get("_aiDifficulty", "skilled")))
	GameManager.match_return_scene = "res://scenes/football/world_cup_shell.tscn"
	GameManager.match_context = "worldcup"
	get_tree().change_scene_to_file("res://scenes/classic/game_table.tscn")

# ===== 淘汰赛 =====

func _show_knockout() -> void:
	var wc: Dictionary = GameManager.wc_state
	var round: String = _s(wc.get("knockoutRound"))
	_title.text = "淘汰赛 · %s" % GameWorldCup.get_knockout_round_name(round)
	for child in _content.get_children():
		child.queue_free()

	var subs_label := Label.new()
	subs_label.text = "剩余换人：%d 次" % int(wc.get("substitutionsLeft", 3))
	_content.add_child(subs_label)

	var opp: Dictionary = wc.get("knockoutOpponent", {})
	var char_data: Dictionary = GameConstants.CHARACTERS.get(int(opp.get("charId", 1)), {})
	var opp_line := Label.new()
	opp_line.text = "对手：%s %s（%s）" % [opp.get("emoji", ""), opp.get("name", "?"), char_data.get("name", "?")]
	opp_line.add_theme_font_size_override("font_size", 27)
	_content.add_child(opp_line)

	var btn := Button.new()
	btn.text = "⚽ 开始比赛"
	btn.custom_minimum_size = Vector2(0, 66)
	btn.pressed.connect(func():
		var player_char_id: int = int(wc.get("_playerCharId", 1))
		var opponent_char_id: int = int(opp.get("charId", 1))
		GameManager.start_match(player_char_id, opponent_char_id, false,
			_s(wc.get("playerTeamName", "玩家")), _s(opp.get("name", "对手")),
			int(wc.get("substitutionsLeft", 3)), _s(wc.get("_aiDifficulty", "skilled")))
		GameManager.match_return_scene = "res://scenes/football/world_cup_shell.tscn"
		GameManager.match_context = "worldcup"
		get_tree().change_scene_to_file("res://scenes/classic/game_table.tscn"))
	_content.add_child(btn)

# ===== 结束 =====

func _show_end(champion: bool) -> void:
	var wc: Dictionary = GameManager.wc_state
	_title.text = "世界杯落幕"
	for child in _content.get_children():
		child.queue_free()
	var end_label := Label.new()
	if champion:
		end_label.text = "🏆🏆🏆\n恭喜夺冠！\n%s 是世界杯冠军！" % wc.get("playerTeamName", "?")
		end_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		end_label.add_theme_font_size_override("font_size", 39)
	else:
		end_label.text = "😔 征程结束\n%s 遗憾出局，下届再战！" % wc.get("playerTeamName", "?")
		end_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		end_label.add_theme_font_size_override("font_size", 36)
	_content.add_child(end_label)
	var again_btn := Button.new()
	again_btn.text = "再玩一次"
	again_btn.custom_minimum_size = Vector2(0, 60)
	again_btn.pressed.connect(func():
		GameManager.wc_state = {}
		_refresh())
	_content.add_child(again_btn)

func _make_h_sep() -> HSeparator:
	var sep := HSeparator.new()
	sep.custom_minimum_size = Vector2(0, 12)
	return sep
