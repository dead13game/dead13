extends Control
## 主菜单：Godot 移植版入口

signal mode_selected(mode: String)

@onready var title_label: Label = %TitleLabel
@onready var mode_label: Label = %ModeLabel
@onready var buttons: VBoxContainer = %Buttons

func _ready() -> void:
	title_label.text = "亡命十三街"
	mode_label.text = "Godot 移植版 · 开发中"

func _on_normal_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/classic/character_select.tscn")

func _on_football_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/football/football_select.tscn")

func _on_solo_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/solo/solo_shell.tscn")

func _on_simuniverse_pressed() -> void:
	GameManager.new_simuniverse()
	get_tree().change_scene_to_file("res://scenes/simuniverse/uni_shell.tscn")

func _on_rules_pressed() -> void:
	mode_label.text = "规则说明：请先迁移完整规则后再接入。"
