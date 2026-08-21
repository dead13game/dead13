extends Control
## 模拟宇宙 UI 主壳：队伍选择 / 层推进(2选1) / 战斗(三选一) / 事件 / 商店 / 造物调试台 / 祝福三选一 / 结算
## 从 src/simuniverse/UniShell.vue 移植（功能 UI，视觉细节可在 Godot 编辑器调整）

const UniState = preload("res://scripts/game/uni_state.gd")
const UniConstants = preload("res://scripts/game/uni_constants.gd")
const UniBuffs = preload("res://scripts/game/uni_buffs.gd")
const UniCombat = preload("res://scripts/game/uni_combat.gd")
const UniSkills = preload("res://scripts/game/uni_skills.gd")
const UniShop = preload("res://scripts/game/uni_shop.gd")
const UniEvents = preload("res://scripts/game/uni_events.gd")
const UniCore = preload("res://scripts/game/uni_core.gd")
const UniMemberSeat = preload("res://scripts/ui/uni_member_seat.gd")
const GameConstants = preload("res://scripts/game/constants.gd")
const SaveManager = preload("res://scripts/autoload/save_manager.gd")

var _s: Dictionary = {}
var _view: String = "map"
var _pick_targets: Array = []      # 待选敌人/成员（id 列表）
var _pick_kind: String = ""        # "attack" | "skill" | "defend"
var _skill_branch: String = ""     # 莉奈娅 branch
var _msg: String = ""
var _busy: bool = false

@onready var _back_btn: Button = find_child("BackBtn", true, false) as Button
@onready var _title: Label = %TitleLabel
@onready var _status_label: Label = %StatusLabel
@onready var _team_row: HBoxContainer = %TeamRow
@onready var _enemy_panel: PanelContainer = %EnemyPanel
@onready var _enemy_row: HBoxContainer = %EnemyRow
@onready var _content: VBoxContainer = %ContentBox
@onready var _log_box: VBoxContainer = %LogBox
@onready var _action_bar: PanelContainer = %ActionBar
@onready var _save_btn: Button = %SaveBtn
@onready var _load_btn: Button = %LoadBtn

func _ready() -> void:
	_s = GameManager.uni_state
	AudioManager.play_bgm("battle1")
	_ensure_nodes()
	_bind_back()
	_bind_action_bar()
	_refresh_log()
	_refresh_team()
	_show_map()

## 场景节点缺失时降级：代码兜底创建（编辑器里搭一半也能跑）
func _ensure_nodes() -> void:
	if _title == null:
		_title = Label.new()
		_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_title.add_theme_font_size_override("font_size", 36)
		add_child(_title)
	if _status_label == null:
		_status_label = Label.new()
		_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		add_child(_status_label)
	if _team_row == null:
		var panel := PanelContainer.new()
		panel.name = "TeamPanel"
		LayoutRegistry.apply_to(panel, "UniTeamPanel", Control.PRESET_TOP_WIDE)
		panel.add_theme_stylebox_override("panel", load("res://assets/styles/fantasy_panel.tres"))
		add_child(panel)
		var margin := MarginContainer.new()
		margin.add_theme_constant_override("margin_left", 10)
		margin.add_theme_constant_override("margin_right", 10)
		margin.add_theme_constant_override("margin_top", 10)
		margin.add_theme_constant_override("margin_bottom", 10)
		panel.add_child(margin)
		_team_row = HBoxContainer.new()
		_team_row.add_theme_constant_override("separation", 8)
		margin.add_child(_team_row)
	if _enemy_panel == null or _enemy_row == null:
		var ep := PanelContainer.new()
		ep.name = "EnemyPanel"
		LayoutRegistry.apply_to(ep, "UniEnemyPanel", Control.PRESET_TOP_WIDE)
		ep.visible = false
		ep.add_theme_stylebox_override("panel", load("res://assets/styles/fantasy_panel.tres"))
		add_child(ep)
		_enemy_panel = ep
		var em := MarginContainer.new()
		em.add_theme_constant_override("margin_left", 10)
		em.add_theme_constant_override("margin_right", 10)
		em.add_theme_constant_override("margin_top", 8)
		em.add_theme_constant_override("margin_bottom", 8)
		ep.add_child(em)
		_enemy_row = HBoxContainer.new()
		_enemy_row.add_theme_constant_override("separation", 10)
		em.add_child(_enemy_row)
	if _content == null:
		_content = VBoxContainer.new()
		_content.add_theme_constant_override("separation", 9)
		var scroll := ScrollContainer.new()
		scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
		add_child(scroll)
		scroll.add_child(_content)
	if _log_box == null:
		_log_box = VBoxContainer.new()
		var log_scroll := ScrollContainer.new()
		log_scroll.custom_minimum_size = Vector2(0, 150)
		add_child(log_scroll)
		log_scroll.add_child(_log_box)

## 绑定返回按钮（场景缺 BackBtn 时兜底创建）
func _bind_back() -> void:
	if _back_btn == null:
		_back_btn = Button.new()
		_back_btn.text = "← 返回主菜单"
		add_child(_back_btn)
	if not _back_btn.pressed.is_connected(_on_back):
		_back_btn.pressed.connect(_on_back)

func _on_back() -> void:
	GameManager.uni_state = {}
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")

## 绑定地图操作栏按钮（场景缺 ActionBar 时 _show_map 用动态按钮兜底）
func _bind_action_bar() -> void:
	if _action_bar == null:
		return
	if _save_btn == null:
		_save_btn = Button.new()
		_save_btn.text = "💾 存档"
		_action_bar.add_child(_save_btn)
	if _load_btn == null:
		_load_btn = Button.new()
		_load_btn.text = "📂 读档"
		_action_bar.add_child(_load_btn)
	if not _save_btn.pressed.is_connected(_on_save):
		_save_btn.pressed.connect(_on_save)
	if not _load_btn.pressed.is_connected(_on_load):
		_load_btn.pressed.connect(_on_load)

## 地图操作栏显隐（仅地图界面显示）
func _set_action_bar(v: bool) -> void:
	if _action_bar != null:
		_action_bar.visible = v

# ===== 刷新 =====

func _refresh_status() -> void:
	var shards: int = int(_s.get("shards", 0))
	var floor_n: int = int(_s.get("floor", 1))
	var plane: int = int(_s.get("plane", 1))
	var blessings: int = _s.get("blessings", []).size()
	var curios: int = _s.get("curios", []).size()
	var eqs: int = _s.get("equations", []).size()
	var alive: int = 0
	for t in _s.get("team", []):
		if t.get("alive", false):
			alive += 1
	_status_label.text = "第 %d 层 · 位面 %d  |  💎%d  祝福%d 奇物%d 方程%d  |  存活 %d/%d" % [
		floor_n, plane, shards, blessings, curios, eqs, alive, _s.get("team", []).size()]

## 安全取 combat（uni_state 初始为 null；.get(key, default) 在 key 存在但值为 null 时返回 null）
func _combat() -> Dictionary:
	var c: Variant = _s.get("combat", {})
	return c if c is Dictionary else {}

## 队伍行（仿 Vue uni-battle__team）：显示全部已选角色，高亮当前行动角色
func _refresh_team() -> void:
	if _team_row == null:
		return
	for child in _team_row.get_children():
		child.queue_free()
	var active_idx: int = -1
	var combat := _combat()
	if not combat.is_empty() and combat.get("activeIdx", null) != null:
		active_idx = int(combat["activeIdx"])
	var team: Array = _s.get("team", [])
	for i in range(team.size()):
		var seat := UniMemberSeat.new()
		seat.setup(team[i], i == active_idx, _skill_line(i))
		_team_row.add_child(seat)

## 技能行文本（仿 Vue）：技能名 + 冷却N / ✓可用 / 被动
func _skill_line(member_idx: int) -> String:
	var info: Variant = UniSkills.get_skill_info(_s, member_idx)
	if not (info is Dictionary) or (info as Dictionary).is_empty():
		return ""
	var nm: String = String(info.get("name", ""))
	var type: String = String(info.get("type", ""))
	var cd: int = int(info.get("cooldown", 0))
	if cd > 0:
		return "%s（冷却%d）" % [nm, cd]
	if type == "active":
		return nm + " ✓可用"
	return nm + "（被动）"

## 敌方 HP 行（仿 Vue uni-enemy）：战斗时显示敌方卡片（名字+HP条+护盾）
func _refresh_enemies() -> void:
	if _enemy_panel == null or _enemy_row == null:
		return
	for child in _enemy_row.get_children():
		child.queue_free()
	var c := _combat()
	var enemies: Array = c.get("enemies", []) if not c.is_empty() else []
	_enemy_panel.visible = not enemies.is_empty()
	for e in enemies:
		_enemy_row.add_child(_make_enemy_card(e))

func _make_enemy_card(e: Dictionary) -> Control:
	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(150, 60)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.16, 0.1, 0.1)
	sb.border_color = Color(0.5, 0.3, 0.3)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(6)
	card.add_theme_stylebox_override("panel", sb)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 2)
	card.add_child(box)
	var name_l := Label.new()
	name_l.text = String(e.get("name", "?"))
	name_l.add_theme_font_size_override("font_size", 26)
	name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(name_l)
	var row := HBoxContainer.new()
	box.add_child(row)
	var hp: float = float(e.get("hp", 0))
	var max_hp: float = float(e.get("maxHp", 1))
	var bar := ProgressBar.new()
	bar.custom_minimum_size = Vector2(0, 16)
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.max_value = max_hp if max_hp > 0 else 1
	bar.value = hp
	var bg_sb := StyleBoxFlat.new()
	bg_sb.bg_color = Color(0.2, 0.12, 0.12)
	bg_sb.set_corner_radius_all(4)
	bar.add_theme_stylebox_override("background", bg_sb)
	var fill_sb := StyleBoxFlat.new()
	fill_sb.bg_color = Color(0.85, 0.3, 0.3)
	fill_sb.set_corner_radius_all(4)
	bar.add_theme_stylebox_override("fill", fill_sb)
	row.add_child(bar)
	var hp_l := Label.new()
	hp_l.text = " %d/%d" % [int(hp), int(max_hp)]
	hp_l.add_theme_font_size_override("font_size", 26)
	row.add_child(hp_l)
	if float(e.get("shield", 0)) > 0:
		var sh := Label.new()
		sh.text = "🛡%d" % int(e["shield"])
		sh.add_theme_font_size_override("font_size", 26)
		sh.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		box.add_child(sh)
	if not e.get("alive", true):
		card.modulate.a = 0.4
	return card

func _refresh_log() -> void:
	var logs: Array = _s.get("log", [])
	var existing: int = _log_box.get_child_count()
	while existing < logs.size():
		var l := Label.new()
		l.text = String(logs[existing])
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.add_theme_font_size_override("font_size", 26)
		_log_box.add_child(l)
		existing += 1

func _clear_content() -> void:
	for child in _content.get_children():
		child.queue_free()

func _add_label(text: String, font_size: int = 26) -> Label:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	# 硬性规则：UI 文本最小 26px；空串仅作行距占位，不参与字号下限
	l.add_theme_font_size_override("font_size", maxi(font_size, 26) if text != "" else font_size)
	_content.add_child(l)
	return l

func _add_button(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 54)
	b.pressed.connect(cb)
	_content.add_child(b)
	return b

func _team_line() -> String:
	var parts: Array = []
	for t in _s.get("team", []):
		var cd: Dictionary = GameConstants.CHARACTERS.get(int(t.get("charId", 0)), {})
		var mark: String = "💀" if not t.get("alive", false) else ""
		parts.append("%s%s %d/%d%s" % [cd.get("name", "?"), mark, int(t.get("hp", 0)), int(t.get("maxHp", 1)),
			("🛡%d" % int(t.get("shield", 0))) if float(t.get("shield", 0)) > 0 else ""])
	return "  ".join(parts)

# ===== 地图 / 层推进 =====

func _show_map() -> void:
	_view = "map"
	_title.text = "模拟宇宙 · 第 %d 层" % _s.get("floor", 1)
	_refresh_status()
	_refresh_team()
	_refresh_enemies()
	_clear_content()
	_set_action_bar(true)
	if not _msg.is_empty():
		_add_label(_msg, 13)
		_msg = ""

	if _s.get("gameOver", false):
		_show_end()
		return

	_add_label(_team_line(), 13)
	_add_label("", 6)

	# 存档 / 读档（常驻）：场景有 ActionBar 用固定栏，否则动态兜底
	if _action_bar == null:
		var save_row := HBoxContainer.new()
		save_row.add_theme_constant_override("separation", 12)
		_content.add_child(save_row)
		var save_btn := Button.new()
		save_btn.text = "💾 存档"
		save_btn.pressed.connect(_on_save)
		save_row.add_child(save_btn)
		var load_btn := Button.new()
		load_btn.text = "📂 读档（%s）" % ("有存档" if SaveManager.has("uni") else "无存档")
		load_btn.pressed.connect(_on_load)
		save_row.add_child(load_btn)
	else:
		_load_btn.text = "📂 读档（%s）" % ("有存档" if SaveManager.has("uni") else "无存档")
	_add_label("", 4)

	# 待选祝福优先
	if _s.get("pendingBlessingPicks", []).size() > 0:
		_add_button("🎁 选择祝福（%d 次）" % _s["pendingBlessingPicks"].size(), _show_blessing)
		return

	# 2 选 1（普通层）
	if _s.get("pendingChoice", null) != null:
		var pc: Dictionary = _s["pendingChoice"]
		var options: Array = pc.get("options", [])
		_add_label("选择本层内容：", 16)
		for i in range(options.size()):
			var t: String = String(options[i])
			var meta: Dictionary = UniConstants.REGION_META.get(t, {})
			var b := Button.new()
			b.text = "%s %s" % [meta.get("icon", "❓"), meta.get("name", t)]
			b.custom_minimum_size = Vector2(0, 60)
			var idx: int = i
			b.pressed.connect(func():
				var r: Dictionary = UniState.choose_normal_content(_s, idx)
				if not r.get("ok", false):
					_msg = String(r.get("reason", "选择失败"))
				_show_map())
			_content.add_child(b)
		return

	# 当前区域
	var r: Variant = _s.get("region", null)
	if r == null:
		_add_button("➡️ 推进到下一层", _on_advance)
		return
	var rtype: String = String(r.get("type", ""))
	var meta: Dictionary = UniConstants.REGION_META.get(rtype, {})
	_add_label("本层：%s %s" % [meta.get("icon", ""), meta.get("name", rtype)], 17)
	match rtype:
		"battle", "elite", "transform":
			var waves: Array = r.get("waves", [])
			var desc: Array = []
			for w in waves:
				desc.append("%s×%d" % [UniConstants.ENEMY_BASE.get(w.get("kind", ""), {}).get("name", "?"), w.get("count", 0)])
			_add_label("敌人：%s" % " → ".join(desc), 13)
			_add_button("⚔️ 进入战斗", func():
				_pick_targets.clear()
				UniCombat.start_combat(_s)
				_refresh_log()
				_show_battle())
		"boss":
			# 首领层：造物调试台 → 首领战斗（设计第九框架 ①②③ 调试台 ④战斗）
			if int(_s.get("heat", 0)) > 0:
				_add_label("造物调试台：%d 热量" % _s.get("heat", 0), 13)
				_add_button("🔧 造物调试台（热量强化 / 覆写）", _show_workbench)
			var waves: Array = r.get("waves", [])
			var desc: Array = []
			for w in waves:
				desc.append("%s×%d" % [UniConstants.ENEMY_BASE.get(w.get("kind", ""), {}).get("name", "?"), w.get("count", 0)])
			_add_label("敌人：%s" % " → ".join(desc), 13)
			_add_button("⚔️ 进入首领战斗", func():
				_pick_targets.clear()
				UniCombat.start_combat(_s)
				_refresh_log()
				_show_battle())
		"event":
			_enter_event()
		"reward":
			_enter_event()
		"adventure":
			_enter_event()
		"shop":
			_show_shop()
		"rest":
			_show_rest()
		"fortune":
			_add_button("➡️ 继续前进", _on_advance)
		"oddity":
			# 奇遇：workbench 效果时可用一次造物调试台（设计第九框架 奇遇①）
			if str(r.get("oddityEffect", "")) == "workbench":
				_add_button("🔧 造物调试台（奇遇）", _show_workbench)
			_add_button("➡️ 继续前进", _on_advance)

func _on_advance() -> void:
	var r: Variant = UniState.advance_floor(_s)
	_refresh_log()
	_show_map()

## 存档（模拟宇宙）
func _on_save() -> void:
	var data: Dictionary = UniState.serialize_uni(_s)
	if SaveManager.save("uni", data):
		_msg = "已存档！"
	else:
		_msg = "存档失败"
	_show_map()

## 读档
func _on_load() -> void:
	var data: Variant = SaveManager.load("uni")
	if data == null or not data is Dictionary:
		_msg = "无存档或读档失败"
		_show_map()
		return
	# 覆盖当前状态（保留引用）
	if UniState.deserialize_uni(_s, data):
		# 重新注入技能（存档恢复后 _injected 已是 true，无需重注入；combat 引用已由状态携带）
		_msg = "读档成功！"
		_refresh_log()
		_show_map()
	else:
		_msg = "读档失败"
		_show_map()

func _enter_event() -> void:
	var r: Dictionary = _s["region"]
	var event_id: String = ""
	var desc_line: String = ""
	if r.has("eventIds"):
		# 事件区域：2 个事件依次处理
		var idx: int = int(r.get("eventIdx", 0))
		var ids: Array = r.get("eventIds", [])
		if idx < ids.size():
			event_id = String(ids[idx])
			desc_line = "（事件 %d/%d）" % [idx + 1, ids.size()]
		else:
			_add_button("➡️ 继续前进", _on_advance)
			return
	else:
		event_id = String(r.get("eventId", ""))
		if event_id == "":
			_add_button("➡️ 继续前进", _on_advance)
			return
	_show_event(event_id, desc_line)

# ===== 祝福三选一 =====

func _show_blessing() -> void:
	_view = "blessing"
	_set_action_bar(false)
	_title.text = "🎁 祝福三选一"
	_refresh_status()
	_clear_content()
	var queue: Array = _s.get("pendingBlessingPicks", [])
	if queue.is_empty():
		_add_button("➡️ 返回", _show_map)
		return
	var cur: Dictionary = queue[0]
	var sr: Array = cur.get("starRange", [1, 3])
	_add_label("选择祝福（%d~%d 星）：" % [int(sr[0]), int(sr[1])], 16)
	for id in cur.get("candidates", []):
		var bd: Dictionary = UniBuffs.BLESSINGS.get(id, {})
		var b := Button.new()
		b.text = "%s（%d星·%s）\n%s" % [bd.get("name", id), bd.get("star", 0), bd.get("fate", ""), bd.get("desc", "")]
		b.custom_minimum_size = Vector2(0, 81)
		var cid: String = String(id)
		b.pressed.connect(func():
			var r: Dictionary = UniEvents.choose_blessing_pick(_s, cid)
			if not r.get("ok", false):
				_msg = String(r.get("reason", "选择失败"))
			_refresh_log()
			_show_map())
		_content.add_child(b)

# ===== 战斗 =====

func _show_battle() -> void:
	_view = "battle"
	_set_action_bar(false)
	_refresh_status()
	_refresh_team()
	_refresh_enemies()
	_clear_content()
	var c := _combat()
	if c.is_empty():
		_finish_region()
		return
	var phase: String = String(c.get("phase", ""))
	match phase:
		"won":
			_finish_region()
			return
		"lost":
			_finish_region()
			return
		"enemy-announce":
			# 敌方行动中：异步驱动 announce → resolve
			_title.text = "⚔️ 敌方行动…"
			_add_label("（敌方正在行动）", 15)
			_run_enemy_actions()
			return
		"wave-clear":
			_title.text = "🔮 转化层·及格！"
			_add_label("已消灭两波敌人，是否挑战第三波精英？", 16)
			_add_button("⚔️ 挑战第三波", func():
				var r: Dictionary = UniCombat.choose_third_wave(_s, true)
				if not r.get("ok", false):
					_msg = String(r.get("reason", "失败"))
				_refresh_log()
				_show_battle())
			_add_button("🛡 撤退（保底奖励）", func():
				UniCombat.choose_third_wave(_s, false)
				_refresh_log()
				_finish_region())
			return
		_:
			pass
	# 标题
	var kind_names: Dictionary = {"battle": "战斗", "elite": "精英", "boss": "首领", "transform": "转化"}
	_title.text = "⚔️ %s · 第 %d 波" % [kind_names.get(c.get("kind", "battle"), "战斗"), int(c.get("wave", 0)) + 1]
	# 敌方
	for e in c.get("enemies", []):
		var line: String = "%s%s HP %d/%d" % [e.get("name", "?"),
			(" 💀" if not e.get("alive", false) else ""), int(e.get("hp", 0)), int(e.get("maxHp", 1))]
		if float(e.get("shield", 0)) > 0:
			line += " 🛡%d" % int(e["shield"])
		if int(e.get("stunnedTurns", 0)) > 0:
			line += " ❄%d" % e["stunnedTurns"]
		if int(e.get("dotTurns", 0)) > 0:
			line += " ☠%d" % e["dotTurns"]
		var l := Label.new()
		l.text = line
		l.add_theme_font_size_override("font_size", 26)
		l.add_theme_color_override("font_color", Color(1.0, 0.6, 0.55))
		_content.add_child(l)
	# 我方当前行动者
	var active: Variant = UniCombat.current_active(_s)
	_add_label("", 4)
	if active == null:
		_add_label("（等待行动）", 14)
		_add_button("⏩ 继续", _show_battle)
		return
	var cd: Dictionary = GameConstants.CHARACTERS.get(int(active.get("charId", 0)), {})
	var active_line: String = "▶ %s 行动：HP %d/%d  🛡%d" % [cd.get("name", "?"), int(active.get("hp", 0)), int(active.get("maxHp", 1)), int(active.get("shield", 0))]
	if int(active.get("status", {}).get("spirit", 0)) > 0:
		active_line += "  斗志%d" % active["status"]["spirit"]
	_add_label(active_line, 16)
	# 三选一
	_add_button("🗡 普攻（抽1张牌）", func(): _start_pick("attack"))
	_add_button("🛡 防御", func():
		# 防御默认当前行动者，也可选其他存活成员
		_start_pick("defend"))
	var skill_check: Dictionary = UniSkills.can_use_uni_skill(_s, int(c.get("activeIdx", 0)))
	if skill_check.get("ok", false):
		var sk: Dictionary = UniConstants.UNI_SKILLS.get(int(active.get("charId", 0)), {})
		_add_button("💥 开大：%s" % sk.get("name", "?"), func(): _on_skill_pressed())
	else:
		_add_label("💤 大招：%s" % String(skill_check.get("reason", "不可用")), 12)

# 敌方行动循环（announce → 短暂停顿 → resolve，直到玩家行动恢复或战斗结束）
func _run_enemy_actions() -> void:
	if _busy:
		return
	_busy = true
	var guard: int = 0
	while guard < 60:
		guard += 1
		var c := _combat()
		var phase: String = String(c.get("phase", ""))
		if phase != "enemy-announce":
			break
		var ann: Dictionary = UniCombat.enemy_announce(_s)
		if not ann.get("playing", false):
			break
		_refresh_log()
		await get_tree().create_timer(0.6).timeout
		UniCombat.enemy_resolve(_s)
		_refresh_log()
	_busy = false
	_show_battle()

# 选目标界面（attack/skill/defend 共用）
func _start_pick(kind: String) -> void:
	_pick_kind = kind
	_pick_targets = []
	_title.text = "选择目标"
	_clear_content()
	var c := _combat()
	if kind == "defend":
		_add_label("为谁添加护盾？", 16)
		for t in _s.get("team", []):
			if not t.get("alive", false):
				continue
			var cd: Dictionary = GameConstants.CHARACTERS.get(int(t.get("charId", 0)), {})
			var b := Button.new()
			b.text = "%s（%d/%d）" % [cd.get("name", "?"), int(t.get("hp", 0)), int(t.get("maxHp", 1))]
			b.custom_minimum_size = Vector2(0, 54)
			var idx: int = int(t.get("index", 0))
			b.pressed.connect(func():
				var r: Dictionary = UniCombat.player_defense(_s, idx)
				if not r.get("ok", false):
					_msg = String(r.get("reason", "防御失败"))
				_refresh_log()
				_show_battle())
			_content.add_child(b)
		return
	# attack / skill：选敌人
	_add_label("选择敌人目标：", 16)
	for e in c.get("enemies", []):
		if not e.get("alive", false):
			continue
		var b := Button.new()
		b.text = "%s（HP %d/%d）" % [e.get("name", "?"), int(e.get("hp", 0)), int(e.get("maxHp", 1))]
		b.custom_minimum_size = Vector2(0, 54)
		var eid: int = int(e.get("id", 0))
		b.pressed.connect(func():
			if _pick_kind == "attack":
				var r: Dictionary = UniCombat.player_attack(_s, eid)
				if not r.get("ok", false):
					_msg = String(r.get("reason", "攻击失败"))
				_refresh_log()
				_show_battle()
			else:
				_execute_skill_on(eid))
		_content.add_child(b)
	_add_button("↩ 取消", _show_battle)

## 开大：按角色分支（需目标/选成员/直接释放）
func _on_skill_pressed() -> void:
	var c := _combat()
	var active_idx: int = int(c.get("activeIdx", 0))
	var t: Dictionary = _s["team"][active_idx]
	var char_id: int = int(t.get("charId", 0))
	match char_id:
		1, 3:
			# 温迪/雷电：选敌人
			_pick_kind = "skill"
			_start_pick("skill")
		4:
			# 纳西妲：选 1-4 名队友立即行动
			if _pick_kind != "skill":
				_pick_targets = []
				_pick_kind = "skill"
			_title.text = "选择立即行动的队友"
			_clear_content()
			_add_label("点击队友使其立即行动（再按释放）", 15)
			for t2 in _s.get("team", []):
				if not t2.get("alive", false):
					continue
				var cd: Dictionary = GameConstants.CHARACTERS.get(int(t2.get("charId", 0)), {})
				var b := Button.new()
				var mark: String = " ✓" if _pick_targets.has(int(t2.get("index", 0))) else ""
				b.text = "%s%s" % [cd.get("name", "?"), mark]
				b.custom_minimum_size = Vector2(0, 51)
				var idx: int = int(t2.get("index", 0))
				b.pressed.connect(func():
					if _pick_targets.has(idx):
						_pick_targets.erase(idx)
					else:
						_pick_targets.append(idx)
					_on_skill_pressed())
				_content.add_child(b)
			_add_button("💥 释放", func():
				if _pick_targets.is_empty():
					_msg = "请选择队友"
					_on_skill_pressed()
					return
				var r: Dictionary = UniCombat.player_skill(_s, null, {"members": _pick_targets})
				_pick_targets.clear()
				if not r.get("ok", false):
					_msg = String(r.get("reason", "开大失败"))
				_refresh_log()
				_show_battle())
			_add_button("↩ 取消", _show_battle)
		9:
			# 莉奈娅：盾 / dot 分支
			_title.text = "选择莉奈娅技能"
			_clear_content()
			_add_button("🛡 全队护盾", func():
				var r: Dictionary = UniCombat.player_skill(_s, null, {"branch": "shield"})
				if not r.get("ok", false):
					_msg = String(r.get("reason", "开大失败"))
				_refresh_log()
				_show_battle())
			_add_button("☠ 持续伤害", func():
				var r: Dictionary = UniCombat.player_skill(_s, null, {"branch": "dot"})
				if not r.get("ok", false):
					_msg = String(r.get("reason", "开大失败"))
				_refresh_log()
				_show_battle())
			_add_button("↩ 取消", _show_battle)
		_:
			# 无需目标的技能（钟离/芙宁娜/风堇/爱蜜莉雅/myracler）
			var r: Dictionary = UniCombat.player_skill(_s, null, {})
			if not r.get("ok", false):
				_msg = String(r.get("reason", "开大失败"))
			_refresh_log()
			_show_battle()

func _execute_skill_on(eid: int) -> void:
	var r: Dictionary = UniCombat.player_skill(_s, eid, {})
	if not r.get("ok", false):
		_msg = String(r.get("reason", "开大失败"))
	_refresh_log()
	_show_battle()

# ===== 事件 =====

func _show_event(event_id: String, desc_line: String = "") -> void:
	_view = "event"
	_set_action_bar(false)
	var ev: Variant = UniEvents.get_event_def(event_id)
	if ev == null:
		_finish_region()
		return
	_title.text = "❓ %s%s" % [ev.get("title", "事件"), desc_line]
	_refresh_status()
	_clear_content()
	_add_label(ev.get("desc", ""), 15)
	for i in range(ev.get("options", []).size()):
		var opt: Dictionary = ev["options"][i]
		var b := Button.new()
		b.text = String(opt.get("text", "?"))
		b.custom_minimum_size = Vector2(0, 60)
		var oi: int = i
		var eid2: String = event_id
		b.pressed.connect(func(): _on_event_option(eid2, oi))
		_content.add_child(b)

func _on_event_option(event_id: String, opt_idx: int) -> void:
	var r: Dictionary = UniEvents.apply_event_option(_s, event_id, opt_idx)
	_refresh_log()
	if _s.get("gameOver", false):
		_show_end()
		return
	if _s.get("pendingBlessingPicks", []).size() > 0:
		_show_blessing()
		return
	var outcome: Dictionary = r.get("outcome", {})
	if outcome.has("failed"):
		_msg = String(outcome["failed"])
		_show_event(event_id)
		return
	# 事件战斗：直接开始
	if outcome.has("battle"):
		var b: Dictionary = outcome["battle"]
		_s["region"] = {"type": "battle", "waves": b.get("waves", [])}
		UniCombat.start_combat(_s)
		_refresh_log()
		_show_battle()
		return
	_show_event_result(String(outcome.get("text", "已生效")), event_id)

func _show_event_result(note: String, event_id: String) -> void:
	_view = "event"
	_set_action_bar(false)
	_title.text = "事件结果"
	_clear_content()
	_add_label(note, 16)
	_add_label(_team_line(), 13)
	var r: Dictionary = _s["region"]
	# 事件区域第二个事件？
	if r.has("eventIds"):
		var idx: int = int(r.get("eventIdx", 0)) + 1
		r["eventIdx"] = idx
		var ids: Array = r.get("eventIds", [])
		if idx < ids.size():
			_add_button("➡️ 下一个事件", func():
				_show_event(String(ids[idx]), "（事件 %d/%d）" % [idx + 1, ids.size()]))
			return
	_add_button("➡️ 继续前进", _finish_region)

# ===== 商店 =====

func _show_shop() -> void:
	_view = "shop"
	_set_action_bar(false)
	_title.text = "🛒 商店"
	_refresh_status()
	_clear_content()
	if not _msg.is_empty():
		_add_label(_msg, 13)
		_msg = ""
	_add_label("宇宙碎片：%d" % _s.get("shards", 0), 15)
	_add_label("", 4)
	var stock: Dictionary = _s.get("shopStock", {})
	if stock.is_empty():
		UniShop.create_shop_stock(_s)
		stock = _s["shopStock"]
	# 祝福
	_add_label("祝福：", 15)
	for i in range(stock.get("blessing", []).size()):
		var item: Dictionary = stock["blessing"][i]
		var bd: Dictionary = UniBuffs.BLESSINGS.get(item.get("id", ""), {})
		var price: int = UniShop.shop_price(_s, "blessing", int(item.get("star", 1)))
		var sold: String = "（已售）" if item.get("sold", false) else "%d💎" % price
		var b := Button.new()
		b.text = "%s（%d星） %s" % [bd.get("name", item.get("id", "")), item.get("star", 0), sold]
		b.custom_minimum_size = Vector2(0, 48)
		b.disabled = item.get("sold", false)
		var idx: int = i
		b.pressed.connect(func():
			var r: Dictionary = UniShop.shop_buy(_s, "blessing", idx)
			_msg = "购买成功！" if r.get("ok", false) else String(r.get("reason", "购买失败"))
			_refresh_log()
			_show_shop())
		_content.add_child(b)
	# 奇物
	_add_label("奇物：", 15)
	for i in range(stock.get("curio", []).size()):
		var item: Dictionary = stock["curio"][i]
		var cd: Dictionary = UniBuffs.CURIOS.get(item.get("id", ""), {})
		var price: int = UniShop.shop_price(_s, "curio", int(item.get("star", 1)))
		var sold: String = "（已售）" if item.get("sold", false) else "%d💎" % price
		var b := Button.new()
		b.text = "%s（%d星） %s" % [cd.get("name", item.get("id", "")), item.get("star", 0), sold]
		b.custom_minimum_size = Vector2(0, 48)
		b.disabled = item.get("sold", false)
		var idx: int = i
		b.pressed.connect(func():
			var r: Dictionary = UniShop.shop_buy(_s, "curio", idx)
			_msg = "购买成功！" if r.get("ok", false) else String(r.get("reason", "购买失败"))
			_refresh_log()
			_show_shop())
		_content.add_child(b)
	# 方程
	_add_label("方程：", 15)
	for i in range(stock.get("equation", []).size()):
		var item: Dictionary = stock["equation"][i]
		var ed: Dictionary = UniBuffs.EQUATIONS.get(item.get("id", ""), {})
		var price: int = UniShop.shop_price(_s, "equation", int(item.get("star", 1)))
		var sold: String = "（已售）" if item.get("sold", false) else "%d💎" % price
		var b := Button.new()
		b.text = "%s（%d星） %s" % [ed.get("name", item.get("id", "")), item.get("star", 0), sold]
		b.custom_minimum_size = Vector2(0, 48)
		b.disabled = item.get("sold", false)
		var idx: int = i
		b.pressed.connect(func():
			var r: Dictionary = UniShop.shop_buy(_s, "equation", idx)
			_msg = "购买成功！" if r.get("ok", false) else String(r.get("reason", "购买失败"))
			_refresh_log()
			_show_shop())
		_content.add_child(b)
	_add_button("🔧 造物调试台", _show_workbench)
	_add_button("➡️ 离开商店", _finish_region)

# ===== 造物调试台 =====

func _show_workbench() -> void:
	_view = "workbench"
	_set_action_bar(false)
	_title.text = "🔧 造物调试台（热量 %d）" % _s.get("heat", 0)
	_refresh_status()
	_clear_content()
	if not _msg.is_empty():
		_add_label(_msg, 13)
		_msg = ""
	# 热量强化祝福
	_add_label("热量强化祝福（1/2/3星需 1/2/3 热量）：", 14)
	for i in range(_s.get("blessings", []).size()):
		var bd: Dictionary = _s["blessings"][i]
		var data: Dictionary = UniBuffs.BLESSINGS.get(bd.get("id", ""), {})
		var mult: int = int(bd.get("heatEnhanced", 1))
		var b := Button.new()
		b.text = "%s ×%d（%d热量）" % [data.get("name", bd.get("id", "")), mult, bd.get("star", 1)]
		b.custom_minimum_size = Vector2(0, 48)
		var idx: int = i
		b.pressed.connect(func():
			var r: Dictionary = UniShop.heat_strengthen(_s, idx)
			_msg = "强化成功！" if r.get("ok", false) else String(r.get("reason", "热量不足"))
			_refresh_log()
			_show_workbench())
		_content.add_child(b)
	# 覆写
	_add_label("覆写（%d💎）：" % UniShop.overwrite_price(_s), 14)
	for i in range(_s.get("blessings", []).size()):
		var bd: Dictionary = _s["blessings"][i]
		var data: Dictionary = UniBuffs.BLESSINGS.get(bd.get("id", ""), {})
		var b := Button.new()
		b.text = "↻ 覆写祝福：%s" % data.get("name", bd.get("id", ""))
		b.custom_minimum_size = Vector2(0, 45)
		var idx: int = i
		b.pressed.connect(func():
			var r: Dictionary = UniShop.overwrite_blessing(_s, idx)
			_msg = "已覆写！" if r.get("ok", false) else String(r.get("reason", "覆写失败"))
			_refresh_log()
			_show_workbench())
		_content.add_child(b)
	for i in range(_s.get("equations", []).size()):
		var ed: Dictionary = _s["equations"][i]
		var data2: Dictionary = UniBuffs.EQUATIONS.get(ed.get("id", ""), {})
		var b := Button.new()
		b.text = "↻ 覆写方程：%s" % data2.get("name", ed.get("id", ""))
		b.custom_minimum_size = Vector2(0, 45)
		var idx: int = i
		b.pressed.connect(func():
			var r: Dictionary = UniShop.overwrite_equation(_s, idx)
			_msg = "已覆写！" if r.get("ok", false) else String(r.get("reason", "覆写失败"))
			_refresh_log()
			_show_workbench())
		_content.add_child(b)
	_add_button("↩ 返回", _show_shop)

# ===== 休整 =====

func _show_rest() -> void:
	_view = "rest"
	_set_action_bar(false)
	_title.text = "🏕️ 休整"
	_refresh_status()
	_clear_content()
	_add_label(_team_line(), 13)
	_add_label("", 4)
	# 复活死亡角色
	var dead: Array = []
	for t in _s.get("team", []):
		if not t.get("alive", false):
			dead.append(t)
	if not dead.is_empty():
		_add_label("复活（%d💎/名）：" % UniConstants.UNI_CONST["RESURRECT_COST"], 15)
		for t in dead:
			var cd: Dictionary = GameConstants.CHARACTERS.get(int(t.get("charId", 0)), {})
			var b := Button.new()
			b.text = "➕ %s" % cd.get("name", "?")
			b.custom_minimum_size = Vector2(0, 51)
			var idx: int = int(t.get("index", 0))
			b.pressed.connect(func():
				var r: Dictionary = UniState.revive_at_rest(_s, idx)
				_msg = "复活成功！" if r.get("ok", false) else String(r.get("reason", "复活失败"))
				_refresh_log()
				_show_rest())
			_content.add_child(b)
	else:
		_add_label("全员存活，无角色需要复活", 14)
	# 购买祝福 / 奇物（设计第九框架：休整购买规则同商店）
	var rest_stock: Dictionary = _s.get("shopStock", {})
	if rest_stock.is_empty():
		UniShop.create_shop_stock(_s)
		rest_stock = _s["shopStock"]
	_add_label("购买（宇宙碎片 %d）：" % _s.get("shards", 0), 15)
	var rest_buy := func(type: String) -> void:
		var items: Array = rest_stock.get(type, [])
		if items.is_empty():
			_add_label("（无%s在售）" % ("祝福" if type == "blessing" else "奇物"), 13)
			return
		for i in range(items.size()):
			var item: Dictionary = items[i]
			var bd: Dictionary = UniBuffs.BLESSINGS.get(item.get("id", ""), {}) if type == "blessing" else UniBuffs.CURIOS.get(item.get("id", ""), {})
			var price: int = UniShop.shop_price(_s, type, int(item.get("star", 1)))
			var sold: String = "（已售）" if item.get("sold", false) else "%d💎" % price
			var b := Button.new()
			b.text = "%s（%d星） %s" % [bd.get("name", item.get("id", "")), item.get("star", 0), sold]
			b.custom_minimum_size = Vector2(0, 48)
			b.disabled = item.get("sold", false)
			var idx: int = i
			b.pressed.connect(func():
				var r: Dictionary = UniShop.shop_buy(_s, type, idx)
				_msg = "购买成功！" if r.get("ok", false) else String(r.get("reason", "购买失败"))
				_refresh_log()
				_show_rest())
			_content.add_child(b)
	rest_buy.call("blessing")
	rest_buy.call("curio")
	if not _msg.is_empty():
		_add_label(_msg, 13)
		_msg = ""
	_add_button("➡️ 继续前进", _finish_region)

# ===== 区域完成 =====

func _finish_region() -> void:
	if _s.get("gameOver", false):
		_show_end()
		return
	_s["region"] = null
	_refresh_log()
	_show_map()

# ===== 结算 =====

func _show_end() -> void:
	_view = "end"
	_set_action_bar(false)
	_title.text = "💀 模拟宇宙终局"
	_refresh_status()
	_clear_content()
	_add_label("队伍在第 %d 层（位面 %d）倒下" % [_s.get("floor", 1), _s.get("plane", 1)], 18)
	_add_label(_team_line(), 13)
	_add_label("", 6)
	# 展示收集
	_add_label("收集：祝福 %d · 奇物 %d · 方程 %d · 碎片 %d" % [
		_s.get("blessings", []).size(), _s.get("curios", []).size(),
		_s.get("equations", []).size(), _s.get("shards", 0)], 14)
	var again := Button.new()
	again.text = "再玩一次"
	again.custom_minimum_size = Vector2(0, 60)
	again.pressed.connect(func():
		GameManager.new_simuniverse()
		_s = GameManager.uni_state
		_show_map())
	_content.add_child(again)
