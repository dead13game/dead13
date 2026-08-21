# Godot 通用主题（Theme）目录

亡命十三街 Godot 版的可换肤主题资源。**通用 = 任意场景、任意模式都能套**：一套 Theme 资源定义了按钮/标签/面板/输入框/滚动条等全部常用控件的配色与样式，挂在场景根 Control 上即可整体换肤。

## 文件位置

| 路径 | 说明 |
| --- | --- |
| `godot/assets/themes/*.tres` | 8 套主题资源（运行时直接加载） |
| `godot/tools/gen_themes.gd` | 生成器：改调色板 → 重跑 → 整体重新生成 |
| `godot/scripts/ui/theme_helper.gd` | 通用换肤助手（一行套主题） |
| `godot/tests/test_themes.gd` | 主题自测（第 11 套） |

> 主题不设置 `default_font`：自动继承 `project.godot` 的 `gui/theme/custom_font`（NotoSansSC + 表情回退），中文渲染不受影响。字号同样只提供兜底值，场景里已有的 `theme_override_*` 优先级更高、不会被覆盖。

## 主题目录（8 套）

| id | 名称 | 风格 | 底色 | 面板/按钮 | 主色（描边/焦点） | 文字 | 明暗 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `night` | 星夜默认 | 深蓝夜空 + 鎏金边，与当前游戏默认一致 | `#0E1321` | `#1F1F2E` | `#E5B233` | `#F2F2F7` | 深 |
| `casino` | 黄金赌场 | 墨绿桌布 + 鎏金，最贴十三街赌局气质 | `#0D1A0F` | `#17261A` | `#D9A340` | `#F5F0E0` | 深 |
| `bloodmoon` | 深渊血月 | 暗红黑调，压迫感强 | `#170A0D` | `#241217` | `#E0474A` | `#F5E6E6` | 深 |
| `frost` | 极寒冰原 | 冰蓝冷色，清爽沉静 | `#0A1A24` | `#122936` | `#5EB8E0` | `#EBF5FA` | 深 |
| `inferno` | 烈焰熔炉 | 橙红炽热，火爆刺激 | `#1C0D08` | `#2B170D` | `#F08A3D` | `#FAF0E6` | 深 |
| `forest` | 翠绿森林 | 祖母绿，自然生机 | `#0D170F` | `#12241A` | `#3DBD7A` | `#E8F5ED` | 深 |
| `neon` | 赛博霓虹 | 暗底青/品红霓虹（焦点用品红 `#FC4FD9`） | `#0A0A17` | `#121221` | `#36E0FF` | `#EBF5FF` | 深 |
| `sakura` | 樱色轻语 | 浅色樱粉，明亮柔和（唯一浅色系） | `#FAF2F5` | `#FFFFFF` | `#E86B91` | `#4A3B42` | 浅 |

每套还内置语义色：`danger`（危险/伤害红）、`success`（治疗/增益绿）、`warning`（警示黄），供需要时按主题取用。

## 覆盖的控件

- **Button**：normal / hover / pressed / disabled / focus 五态 StyleBox（2px 主色描边、圆角 6、focus 带光晕），字体色与禁用半透明
- **OptionButton**：同上（选人/难度下拉）
- **Label / RichTextLabel**：字体色 + 字号兜底（日志、标题、正文）
- **Panel / PanelContainer**：面板底色 + 描边（内边距 0，不扰动现有布局）
- **LineEdit / SpinBox**：输入框 normal/focus/read_only 三态 + 光标/选区色
- **CheckBox / CheckButton**：字体色 + 程序绘制的勾选图标（无需位图素材，深色/浅色主题都可见）
- **VScrollBar / HScrollBar**：轨道 + 滑块三态（日志/内容滚动）
- **ProgressBar**：底槽 + 填充条
- **HSeparator / VSeparator**、**TooltipPanel / TooltipLabel**：分隔线与提示框

## 怎么用

### 方式一：场景根节点挂 theme（编辑器操作）

在任意 `.tscn` 的根 Control 上，把 `theme` 属性拖入对应的 `.tres`（如 `res://assets/themes/casino.tres`）。theme 沿整棵 Control 树向下传播。

### 方式二：代码一行换肤（推荐，改 id 即可切换）

```gdscript
# 场景根 Control 的 _ready 里：
ThemeHelper.apply(self, "casino")   # id 见上表

# 运行时动态切换（如设置界面）：
ThemeHelper.apply(self, "neon")
```

`ThemeHelper` 是 `class_name` 全局类，任意脚本直接调用，无需 preload；`apply` 传入非 Control 的场景根也能自动找到第一个 Control 后代应用。

### 全局默认主题（可选）

想让某模式整体默认用某主题，在 `game_manager.gd`（或各 shell 的 `_ready`）里按模式调用 `ThemeHelper.apply(root, id)` 即可，模式间互不影响。

## 自测

```bash
godot --headless --path godot --script res://tests/test_themes.gd
```

校验：8 套主题全部可加载、Button 五态/面板/输入框/滚动条/勾选图标齐全、`ThemeHelper.apply` 在 Control 与非 Control 根上均生效。

## 加新主题 / 改配色

所有颜色集中在 `godot/tools/gen_themes.gd` 的 `PALETTES` 表，**不要手改 .tres**：

1. 在 `PALETTES` 里加一段（抄一份现有条目改颜色，`dark` 标记明暗）
2. 把 id 加进 `THEME_IDS`
3. 运行：`godot --headless --path godot --script res://tools/gen_themes.gd`
4. 重跑 `test_themes.gd` 确认通过

> 视觉验收归人类：套上后肉眼对比各主题的按钮悬停/按下/焦点、勾选框可见性、浅色主题（sakura）的对比度。需要微调就直接改 `PALETTES` 里的值重跑。

---

## 现成主题：NeoCade（已接入）

下载自 GitHub 的现成游戏 UI 主题（不是 itch.io）：**NeoCade**（[Shilo/NeoCade-Theme](https://github.com/topics/godot-4-6)，MIT，作者 Shilo，v0.9.0）。

- 安装位置：`godot/addons/neocade_theme/`（只拷了 addon 本体，不含它的示例工程）
- 主题资源：`addons/neocade_theme/neocade_theme.tres`（`NeoCadeTheme` 类，**样式在运行时生成**，5 种风格）
- 全局加载器：`godot/scripts/autoload/theme_loader.gd`，已注册进 `project.godot` 的 `[autoload]`（`ThemeLoader`）

### 工作原理（重要）

- `NeoCadeTheme.apply_globally()` 把主题条目**合并进 `ThemeDB.default_theme`**——这是作者为绕开引擎 #111656 设计的方案，恰好**绕开了本机 Godot 4.7.1 的 `Control.theme` 运行时失效 bug**（headless 已验证：合并后新建 Button/Label 直接拿到主题色）
- 因此**不要**用 `gui/theme/custom` 或给场景根挂 `theme` 的方式接 NeoCade（那两条路在本机引擎上不生效）
- 主题默认字体是 Inter（无中文字形），`theme_loader.gd` 已给 Inter 追加 NotoSansSC + 表情回退（一次修补覆盖全部字重），Web 导出中文不会乱码

### 换风格 / 停用

| 操作 | 方法 |
| --- | --- |
| 换风格（Pulse/Slate/Bubble/Daybreak/Burst） | 编辑器打开 `addons/neocade_theme/neocade_theme.tres` → 改 `style` 属性（或 `source_color` 整体换色） |
| 改字号密度 | 改 `platform`（DESKTOP/MOBILE/AUTO）；默认正文 14px，游戏内大多数 Label 有自己的字号覆盖不受影响 |
| 停用 | 删掉 `project.godot [autoload]` 里的 `ThemeLoader` 一行（addon 文件可留可删） |
| 只给单个场景用 | 在场景脚本 `_ready` 调 `NeoCadeTheme.apply_globally()`（全局）或 `NeoCadeTheme.apply_to_control(节点)`（单节点，注意本机 4.7.1 该路径不渲染，请用全局方案） |

### 与现有代码的关系

游戏 UI 大量用了 per-node `theme_override`（按钮金边、字号等），**override 优先级高于主题**——NeoCade 会接管没被 override 的部分（如主菜单按钮样式、默认文字色），已被 override 的保持原样。想要哪些界面彻底换 NeoCade，把对应节点上的 `theme_override_*` 删掉即可。

### 许可提醒

NeoCade 本体 MIT；捆绑的 Inter 字体为 SIL OFL 1.1（两者都允许商用，保留版权声明即可）。项目自带 NotoSansSC（SIL OFL）不受影响。
