extends Control
## 联赛模式外壳：10队双循环 18 轮 + 积分榜
## 比赛为简化 1v1 代表战（玩家角色 vs 对手角色），胜负平 → 3/1/0 积分
## 3v3 完整版（选秀+6人赛+死亡顺序计分）留待后续

const GameConstants = preload("res://scripts/game/constants.gd")
const GameLeague = preload("res://scripts/game/league.gd")
const GameLeagueConstants = preload("res://scripts/game/league_constants.gd")
const GameWorldCup = preload("res://scripts/game/world_cup.gd")

var _root_box: VBoxContainer
var _title: Label
var _content: VBoxContainer

func _ready() -> void:
	_build_ui()
	_handle_return_from_match()
	_refresh()

func _build_ui() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.05, 0.07, 0.09)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 30)
	margin.add_theme_constant_override("margin_right", 30)
	margin.add_theme_constant_override("margin_top", 20)
	margin.add_theme_constant_override("margin_bottom", 20)
	add_child(margin)

	_root_box = VBoxContainer.new()
	_root_box.add_theme_constant_override("separation", 12)
	margin.add_child(_root_box)

	var back_btn := Button.new()
	back_btn.text = "← 返回主菜单"
	back_btn.pressed.connect(func():
		GameManager.league_state = {}
		GameManager.state = {}
		get_tree().change_scene_to_file("res://scenes/main_menu.tscn"))
	_root_box.add_child(back_btn)

	_title = Label.new()
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.add_theme_font_size_override("font_size", 30)
	_root_box.add_child(_title)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_root_box.add_child(scroll)
	_content = VBoxContainer.new()
	_content.add_theme_constant_override("separation", 8)
	scroll.add_child(_content)

## 从比赛返回后记录本轮结果
func _handle_return_from_match() -> void:
	if GameManager.match_state.is_empty():
		return
	var ms: Dictionary = GameManager.match_state
	var lg: Dictionary = GameManager.league_state
	var round: int = int(lg.get("currentRound", 1))
	var winner: Variant = ms.get("winner")
	var result: String = "draw"
	if winner != null and int(winner) == 0:
		result = "home"      # 控制器约定：'home' 参数 = 玩家胜
	elif winner != null and int(winner) == 1:
		result = "away"
	GameLeague.record_match_result(lg, round, result)
	GameLeague.simulate_non_player_matches(lg, round)
	lg["_lastResult"] = result
	GameManager.match_state = {}

func _refresh() -> void:
	if GameManager.league_state.is_empty():
		_show_setup()
		return
	var lg: Dictionary = GameManager.league_state
	var round: int = int(lg.get("currentRound", 1))
	if lg.get("_showStandings", false):
		_show_standings()
	elif GameLeague.is_league_finished(lg):
		_show_final()
	else:
		var pm: Dictionary = GameLeague.get_player_match_for_round(lg, round)
		if pm.is_empty():
			# 本轮没有玩家比赛（不应发生）→ 下一轮
			lg["currentRound"] = round + 1
			_refresh()
			return
		var key: String = "%d_%d" % [round, pm["matchIdx"]]
		var played: bool = lg.get("results", {}).has(key)
		if played:
			_show_round_result(round)
		else:
			_show_round_match(round)

# ===== 设置 =====

func _show_setup() -> void:
	_title.text = "英格兰超级联赛 · 选择球队"
	for child in _content.get_children():
		child.queue_free()

	var teams: Array = GameLeagueConstants.LEAGUE_TEAMS
	var team_option := OptionButton.new()
	for team_id in range(1, teams.size()):
		var t: Variant = teams[team_id]
		if t is Dictionary:
			team_option.add_item("%s %s（%s）" % [t.get("emoji", ""), t.get("name", "?"), GameLeagueConstants.TIER_LABELS.get(t.get("tier", 3), "")], team_id)
	team_option.select(0)
	_content.add_child(team_option)

	var char_label := Label.new()
	char_label.text = "你的代表角色"
	_content.add_child(char_label)
	var char_option := OptionButton.new()
	for cid in range(1, 12):
		var cdata: Dictionary = GameConstants.CHARACTERS.get(cid, {})
		if cdata.is_empty():
			continue
		char_option.add_item("%s（%s）" % [cdata.get("name", "?"), cdata.get("title", "?")], cid)
	char_option.select(0)
	_content.add_child(char_option)

	var start_btn := Button.new()
	start_btn.text = "开始联赛征程"
	start_btn.custom_minimum_size = Vector2(0, 44)
	start_btn.pressed.connect(func():
		GameManager.new_league(team_option.get_selected_id())
		GameManager.league_state["_playerCharId"] = char_option.get_selected_id()
		_refresh())
	_content.add_child(start_btn)

# ===== 单轮比赛 =====

func _show_round_match(round: int) -> void:
	var lg: Dictionary = GameManager.league_state
	var player_team: Variant = GameLeagueConstants.LEAGUE_TEAMS[int(lg.get("playerTeamId", 1))]
	_title.text = "第 %d 轮" % round
	for child in _content.get_children():
		child.queue_free()

	var opponent_id: int = GameLeague.get_player_opponent(lg, round)
	var opponent_team: Variant = GameLeagueConstants.LEAGUE_TEAMS[opponent_id] if opponent_id > 0 else null
	var is_home: bool = GameLeague.is_player_home(lg, round)
	var bonus: Dictionary = GameLeague.get_card_bonus(int(lg.get("playerTeamId", 1)), opponent_id, is_home)
	var line := Label.new()
	line.text = "%s %s %s %s %s %s（%s）" % [
		player_team.get("emoji", ""), player_team.get("name", "?"),
		"🏠 主" if is_home else "✈️ 客",
		"vs",
		opponent_team.get("emoji", "") if opponent_team != null else "",
		opponent_team.get("name", "?") if opponent_team != null else "?",
		"主场加成" if is_home else "",
	]
	line.add_theme_font_size_override("font_size", 18)
	_content.add_child(line)

	if int(bonus.get("attackBonus", 0)) > 0 or int(bonus.get("defenseBonus", 0)) > 0:
		var bonus_label := Label.new()
		bonus_label.text = "卡牌加成：攻击+%d 防御+%d" % [bonus.get("attackBonus", 0), bonus.get("defenseBonus", 0)]
		_content.add_child(bonus_label)

	var btn := Button.new()
	btn.text = "⚽ 开始比赛"
	btn.custom_minimum_size = Vector2(0, 44)
	btn.pressed.connect(func():
		var player_char: int = int(lg.get("_playerCharId", 1))
		var opponent_char: int = GameWorldCup.get_random_group_opponent_char()
		var player_name: String = "%s %s" % [player_team.get("emoji", ""), player_team.get("name", "?")]
		var opp_name: String = "%s %s" % [opponent_team.get("emoji", ""), opponent_team.get("name", "?")]
		GameManager.start_match(player_char, opponent_char, false, player_name, opp_name, 999)
		GameManager.match_return_scene = "res://scenes/football/league_shell.tscn"
		GameManager.match_context = "league"
		get_tree().change_scene_to_file("res://scenes/classic/game_table.tscn"))
	_content.add_child(btn)

	var standings_btn := Button.new()
	standings_btn.text = "查看积分榜"
	standings_btn.pressed.connect(func():
		lg["_showStandings"] = true
		_refresh())
	_content.add_child(standings_btn)

func _show_round_result(round: int) -> void:
	var lg: Dictionary = GameManager.league_state
	_title.text = "第 %d 轮 · 赛果" % round
	for child in _content.get_children():
		child.queue_free()

	var player_result: String = GameLeague.get_player_result(lg, round)
	var res_text: String = "平局"
	var color := Color.WHITE
	if player_result == "win":
		res_text = "✅ 胜利 +3分"
		color = Color(0.4, 1.0, 0.4)
	elif player_result == "loss":
		res_text = "❌ 失利"
		color = Color(1.0, 0.4, 0.4)
	var label := Label.new()
	label.text = res_text
	label.add_theme_font_size_override("font_size", 22)
	label.add_theme_color_override("font_color", color)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_content.add_child(label)

	var next_btn := Button.new()
	next_btn.text = "下一轮 ➜"
	next_btn.custom_minimum_size = Vector2(0, 40)
	next_btn.pressed.connect(func():
		lg["currentRound"] = int(lg.get("currentRound", 1)) + 1
		_refresh())
	_content.add_child(next_btn)

	var standings_btn := Button.new()
	standings_btn.text = "查看积分榜"
	standings_btn.pressed.connect(func():
		lg["_showStandings"] = true
		_refresh())
	_content.add_child(standings_btn)

# ===== 积分榜 =====

func _show_standings() -> void:
	var lg: Dictionary = GameManager.league_state
	var round: int = int(lg.get("currentRound", 1))
	_title.text = "积分榜（第 %d 轮后）" % (mini(round - 1, GameLeagueConstants.TOTAL_ROUNDS))
	for child in _content.get_children():
		child.queue_free()

	var standings: Array = GameLeague.calculate_standings(lg)
	for i in range(standings.size()):
		var t: Dictionary = standings[i]
		var mark: String = "⭐" if t.get("isPlayer", false) else ""
		var row := Label.new()
		row.text = "#%d  %s %s %s  场%d 胜%d 平%d 负%d 积分%d" % [
			i + 1, t.get("emoji", ""), mark, t.get("name", "?"),
			t.get("played", 0), t.get("wins", 0), t.get("draws", 0),
			t.get("losses", 0), t.get("points", 0)]
		if t.get("isPlayer", false):
			row.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3))
		_content.add_child(row)

	if GameLeague.is_league_finished(lg):
		var tb: Dictionary = GameLeague.check_tiebreaker_needed(lg)
		var end_label := Label.new()
		if tb.get("needed", false):
			end_label.text = "⚠️ 与 %s 积分相同，需要加赛（后续版本）" % tb.get("opponentTeamId", -1)
		else:
			end_label.text = "🏁 联赛全部结束！"
		_content.add_child(end_label)

	var back_btn := Button.new()
	back_btn.text = "← 返回"
	back_btn.custom_minimum_size = Vector2(0, 36)
	back_btn.pressed.connect(func():
		lg["_showStandings"] = false
		_refresh())
	_content.add_child(back_btn)

# ===== 联赛结束 =====

func _show_final() -> void:
	_title.text = "联赛结束"
	for child in _content.get_children():
		child.queue_free()

	var standings: Array = GameLeague.calculate_standings(GameManager.league_state)
	var player_rank: int = -1
	for i in range(standings.size()):
		if standings[i].get("isPlayer", false):
			player_rank = i + 1
			break
	var end_label := Label.new()
	end_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	end_label.add_theme_font_size_override("font_size", 24)
	if player_rank == 1:
		end_label.text = "🏆 联赛冠军！"
		end_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3))
	elif player_rank <= 4:
		end_label.text = "🥇 欧战席位（第%d名）" % player_rank
	elif player_rank <= 7:
		end_label.text = "联赛中游（第%d名）" % player_rank
	else:
		end_label.text = "😔 保级区（第%d名）…" % player_rank
	_content.add_child(end_label)

	var again_btn := Button.new()
	again_btn.text = "再玩一次"
	again_btn.custom_minimum_size = Vector2(0, 40)
	again_btn.pressed.connect(func():
		GameManager.league_state = {}
		_refresh())
	_content.add_child(again_btn)
