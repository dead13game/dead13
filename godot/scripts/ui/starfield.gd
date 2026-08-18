extends Node2D
## 星空背景 — Vue 版 _createStarfield() 的 GDScript 等价物
## 80 颗随机白点（半径 0.5~2.0，透明度 0.1~0.5），坐标基于 1080×1920 基准
## 挂载：各场景根节点下、背景之上（如 main_menu: Background → Starfield → 内容）
## 说明：静态星空，_ready 时画一次；位置/密度可在编辑器里改 STAR_COUNT 与半径区间

const STAR_COUNT := 80
const RADIUS_MIN := 0.5
const RADIUS_MAX := 2.0
const ALPHA_MIN := 0.1
const ALPHA_MAX := 0.5
const COLOR := Color(1.0, 1.0, 1.0, 1.0)

## 基准分辨率（与 project.godot viewport 一致）
const BASE_W := 1080
const BASE_H := 1920

var _rng := RandomNumberGenerator.new()

func _ready() -> void:
	_rng.randomize()
	queue_redraw()

func _draw() -> void:
	for i in STAR_COUNT:
		var x := _rng.randf_range(0.0, BASE_W)
		var y := _rng.randf_range(0.0, BASE_H)
		var r := _rng.randf_range(RADIUS_MIN, RADIUS_MAX)
		var a := _rng.randf_range(ALPHA_MIN, ALPHA_MAX)
		draw_circle(Vector2(x, y), r, Color(COLOR.r, COLOR.g, COLOR.b, a))
