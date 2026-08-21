class_name ThemeHelper
## 通用主题助手：任意场景一行换肤
## 用法：
##   ThemeHelper.apply(self, "casino")          # self 为场景根 Control
##   ThemeHelper.apply(root, "neon")            # root 非 Control 时自动找第一个 Control 后代
##   var t: Theme = ThemeHelper.load_theme("frost")
## 主题清单与配色见 docs/godot-themes.md

const THEME_DIR := "res://assets/themes/"

## 主题 id 清单（与 assets/themes/ 下的 .tres 一一对应）
const THEME_IDS: Array[String] = [
	"night", "casino", "bloodmoon", "frost",
	"inferno", "forest", "neon", "sakura",
]

static func theme_path(id: String) -> String:
	return THEME_DIR + id + ".tres"

static func load_theme(id: String) -> Theme:
	var path := theme_path(id)
	if not ResourceLoader.exists(path):
		return null
	return load(path) as Theme

## 给场景套主题：root 传场景根（Control 或任意 Node 均可）。
## theme 沿 Control 树向下传播，子节点未单独覆盖的样式全部走该主题。
## 返回是否成功应用。
static func apply(root: Node, id: String) -> bool:
	var theme: Theme = load_theme(id)
	if theme == null:
		push_error("ThemeHelper: 找不到主题 %s（%s）" % [id, theme_path(id)])
		return false
	if root is Control:
		root.theme = theme
		return true
	for child in root.get_children():
		if child is Control:
			child.theme = theme
			return true
	push_warning("ThemeHelper: 场景根下没有 Control 节点，主题未应用")
	return false
