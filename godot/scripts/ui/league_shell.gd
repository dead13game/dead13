extends Control
## 联赛模式外壳：10队双循环 18 轮 + 积分榜
## 每轮比赛为 3v3 完整版：选秀（玩家3人 vs 对手3人）→ 6人同场 → 死亡顺序计分

const GameConstants = preload("res://scripts/game/constants.gd")
const GameLeague = preload("res://scripts/game/league.gd")
const GameLeagueConstants = preload("res://scripts/game/league_constants.gd")
const GameWorldCup = preload("res://scripts/game/world_cup.gd")

@onready var _back_btn: Button = find_child("BackBtn", true, false) as Button
@onready var _title: Label = %TitleLabel
@onready var _content: VBoxContainer = %ContentBox

var _draft_player_picks: Array = []     # 玩家选秀角色
var _draft_opponent_picks: Array = []   # 对手选秀角色（AI 自动）
var _draft_taken: Dictionary = {}       # charId -> true（双方已选）

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
		_title.add_theme_font_size_override("font_size", 30)
		add_child(_title)
	if _content == null:
		_content = VBoxContainer.new()
		_content.add_theme_constant_override("separation", 8)
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
	GameManager.league_state = {}
	GameManager.state = {}
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")

## 从比赛返回后记录本轮结果（3v3 死亡顺序计分 → 胜负平）
func _handle_return_from_match() -> void:
	if GameManager.match_state.is_empty():
		return
	var ms: Dictionary = GameManager.match_state
	var lg: Dictionary = GameManager.league_state
	var round: int = int(lg.get("currentRound", 1))
	if ms.get("is3v3", false):
		# 3v3：按比分定胜负
		var p_score: int = int(ms.get("playerScore", 0))
		var o_score: int = int(ms.get("opponentScore", 0))
		var result: String = "draw"
		if p_score > o_score:
			result = "home"      # 玩家胜
		elif o_score > p_score:
			result = "away"
		GameLeague.record_match_result(lg, round, result)
		lg["_lastResult"] = result
		lg["_lastScore"] = [p_score, o_score]
		lg["_lastDeathOrder"] = ms.get("deathOrder", [])
	else:
		var winner: Variant = ms.get("winner")
		var result2: String = "draw"
		if winner != null and int(winner) == 0:
			result2 = "home"
		elif winner != null and int(winner) == 1:
			result2 = "away"
		GameLeague.record_match_result(lg, round, result2)
		lg["_lastResult"] = result2
	GameLeague.simulate_non_player_matches(lg, round)
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
	btn.text = "⚽ 3v3 选人开赛"
	btn.custom_minimum_size = Vector2(0, 44)
	btn.pressed.connect(func():
		_show_draft(round, player_team, opponent_team))
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

	# 3v3 比分战报
	if lg.has("_lastScore"):
		var score_label := Label.new()
		score_label.text = "3v3 战报：你 %d : %d 对手" % [int(lg["_lastScore"][0]), int(lg["_lastScore"][1])]
		score_label.add_theme_font_size_override("font_size", 16)
		score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_content.add_child(score_label)
	# 死亡顺序
	if lg.has("_lastDeathOrder"):
		var order_parts: Array = []
		for entry in lg["_lastDeathOrder"]:
			var cid: int = int(entry.get("charId", 0))
			var cd: Dictionary = GameConstants.CHARACTERS.get(cid, {})
			var team_mark: String = "⭐" if int(entry.get("teamId", -1)) == 0 else "🔥"
			order_parts.append("%s%s" % [team_mark, cd.get("name", "?")])
		if not order_parts.is_empty():
			var order_label := Label.new()
			order_label.text = "死亡顺序：%s" % " → ".join(order_parts)
			order_label.add_theme_font_size_override("font_size", 13)
			order_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			_content.add_child(order_label)

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

# ===== 3v3 选秀 =====

## 选秀界面：玩家选 3 人，AI 补 3 人（仿 LeagueDraft.vue）
func _show_draft(round: int, player_team: Variant, opponent_team: Variant) -> void:
	_title.text = "第 %d 轮 · 3v3 选人" % round
	_draft_player_picks = []
	_draft_opponent_picks = []
	_draft_taken = {}
	for child in _content.get_children():
		child.queue_free()

	var opp_name: String = "对手"
	if opponent_team != null:
		opp_name = "%s %s" % [opponent_team.get("emoji", ""), opponent_team.get("name", "?")]
	var info := Label.new()
	info.text = "%s %s vs %s · 选 3 名角色（第 %d/3 名）" % [
		player_team.get("emoji", "") if player_team != null else "",
		player_team.get("name", "?") if player_team != null else "?",
		opp_name, _draft_player_picks.size() + 1]
	info.add_theme_font_size_override("font_size", 17)
	_content.add_child(info)

	# 已选展示
	var picked_label := Label.new()
	picked_label.name = "DraftPickedLabel"
	picked_label.text = _draft_picked_text()
	picked_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_content.add_child(picked_label)

	# 角色网格（1-11，排除开发者 12）
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	for cid in range(1, 12):
		var cdata: Dictionary = GameConstants.CHARACTERS.get(cid, {})
		if cdata.is_empty():
			continue
		var b := Button.new()
		b.text = "%s\nHP %d" % [cdata.get("name", "?"), cdata.get("hp", 0)]
		b.custom_minimum_size = Vector2(150, 52)
		b.disabled = _draft_taken.has(cid)
		var char_id: int = cid
		b.pressed.connect(func():
			if _draft_taken.has(char_id):
				return
			_draft_taken[char_id] = true
			_draft_player_picks.append(char_id)
			_refresh_draft(round, player_team, opponent_team))
		grid.add_child(b)
	_content.add_child(grid)

	# 返回按钮
	var cancel := Button.new()
	cancel.text = "↩ 取消选人"
	cancel.custom_minimum_size = Vector2(0, 34)
	cancel.pressed.connect(func(): _refresh())
	_content.add_child(cancel)

func _draft_picked_text() -> String:
	var p: Array = []
	for cid in _draft_player_picks:
		var cd: Dictionary = GameConstants.CHARACTERS.get(cid, {})
		p.append(cd.get("name", "?"))
	var o: Array = []
	for cid in _draft_opponent_picks:
		var cd2: Dictionary = GameConstants.CHARACTERS.get(cid, {})
		o.append(cd2.get("name", "?"))
	return "⭐ 你：%s\n🔥 对手：%s" % [
		("、".join(p)) if not p.is_empty() else "待选…",
		("、".join(o)) if not o.is_empty() else "（AI 选人）"]

## 刷新选秀界面（AI 补选 + 3 人齐后开始比赛）
func _refresh_draft(round: int, player_team: Variant, opponent_team: Variant) -> void:
	# 玩家选满 3 人前：AI 每轮补 1 人
	while _draft_opponent_picks.size() < _draft_player_picks.size() and _draft_player_picks.size() < 3:
		var remaining: Array = []
		for cid in range(1, 12):
			if not _draft_taken.has(cid):
				remaining.append(cid)
		if remaining.is_empty():
			break
		var pick: int = remaining[randi() % remaining.size()]
		_draft_taken[pick] = true
		_draft_opponent_picks.append(pick)
	# 玩家选满 → AI 补满 3 人 → 开始比赛
	if _draft_player_picks.size() >= 3:
		while _draft_opponent_picks.size() < 3:
			var remaining2: Array = []
			for cid in range(1, 12):
				if not _draft_taken.has(cid):
					remaining2.append(cid)
			if remaining2.is_empty():
				break
			var pick2: int = remaining2[randi() % remaining2.size()]
			_draft_taken[pick2] = true
			_draft_opponent_picks.append(pick2)
		_start_3v3_match(round)
		return
	# 未满：重绘
	for child in _content.get_children():
		child.queue_free()
	var opp_name: String = "对手"
	if opponent_team != null:
		opp_name = "%s %s" % [opponent_team.get("emoji", ""), opponent_team.get("name", "?")]
	var info := Label.new()
	info.text = "%s %s vs %s · 选第 %d/3 名角色" % [
		player_team.get("emoji", "") if player_team != null else "",
		player_team.get("name", "?") if player_team != null else "?",
		opp_name, _draft_player_picks.size() + 1]
	info.add_theme_font_size_override("font_size", 17)
	_content.add_child(info)
	var picked_label := Label.new()
	picked_label.text = _draft_picked_text()
	picked_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_content.add_child(picked_label)
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	for cid in range(1, 12):
		var cdata: Dictionary = GameConstants.CHARACTERS.get(cid, {})
		if cdata.is_empty():
			continue
		var b := Button.new()
		b.text = "%s\nHP %d" % [cdata.get("name", "?"), cdata.get("hp", 0)]
		b.custom_minimum_size = Vector2(150, 52)
		b.disabled = _draft_taken.has(cid)
		var char_id: int = cid
		b.pressed.connect(func():
			if _draft_taken.has(char_id):
				return
			_draft_taken[char_id] = true
			_draft_player_picks.append(char_id)
			_refresh_draft(round, player_team, opponent_team))
		grid.add_child(b)
	_content.add_child(grid)
	var cancel := Button.new()
	cancel.text = "↩ 取消选人"
	cancel.custom_minimum_size = Vector2(0, 34)
	cancel.pressed.connect(func(): _refresh())
	_content.add_child(cancel)

## 选满 6 人 → 开始 3v3 比赛
func _start_3v3_match(round: int) -> void:
	var lg: Dictionary = GameManager.league_state
	var opponent_id: int = GameLeague.get_player_opponent(lg, round)
	var is_home: bool = GameLeague.is_player_home(lg, round)
	GameManager.start_league_3v3(_draft_player_picks, _draft_opponent_picks, is_home)
	GameManager.match_return_scene = "res://scenes/football/league_shell.tscn"
	GameManager.match_context = "league"
	get_tree().change_scene_to_file("res://scenes/classic/game_table.tscn")
