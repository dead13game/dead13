# UI 摆放新工作流 —— 亡命十三街

> 配套：`godot/tools/ui_adjust.gd`（工具）、`godot/tools/ui_adjust_agent.md`（UI 调参子代理定义）、
> `godot/scripts/ui/layout_registry.json`（动态 UI 布局单一真源）、`godot/scripts/ui/ui_debug_overlay.gd`（调试浮层）。
> 关系：本文件讲**流程**；agent.md 讲**子代理怎么干活**；工具头注释讲**命令语义**。

---

## 一、为什么换工作流（旧痛点）

旧分工：**静态 UI 人类在编辑器里拖**，**动态 UI 只能 AI 翻代码改**，两类操作路径割裂。

- 编辑器只能拖「场景里固定元素的绝对定位」——动态生成（脚本 `new` 出来）的节点拖不到，连**固定区块内的动态内容**也无从拖起；
- 动态 UI 的数值藏在 `.gd` 里（`offset_top = 138`、`DECK_ORIGIN`、`Vector2(540,400)`…），人类想调必须转述给 AI，AI 再 grep 改代码，**一来一回全是沟通损耗**；
- 「位置对不对」是视觉判断（人类负责），「位置改哪几行」是代码判断（AI 负责）——旧流程逼人类做后者，新流程把这个彻底切开。

**新工作流的统一语言：节点名 + 效果一句话。** 人类只做两件事——读节点名、看效果；其余全是子代理 + 工具的活。

---

## 二、新工作流全景

```
  人类（自己开游戏，F1 调试浮层）
    │  悬停/点选 → 复制一行「UI节点: LogPanel | 场景: res://... | 全局/锚/偏移」
    ▼
  发消息给「UI 调参子代理」：节点名 + 效果（向下10px / 上移窗口高度15% / 与%Y对齐 / 加宽…）
    ▼
  子代理（读 ui_adjust_agent.md，按决策树定位）
    ├─ 场景节点   ──► ui_adjust.gd  改 .tscn（anchor/offset 文本级精确改写）
    ├─ 注册表条目 ──► ui_adjust.gd  改 layout_registry.json（动态绝对定位单一真源）
    ├─ 容器子项   ──► 拒绝强改，回报「应改容器或改绝对定位」并说明
    └─ 纯动态/动画节点 ──► 只在必要时 grep 改代码常量，并先 ask 确认
    │  每次：inspect → dry 预览 → 实改（自动备份）→ 回报 before/after + 验收点 + 备份路径
    ▼
  人类重开游戏按 F1 验收 → 不满再发一句效果（通常一句一个改动，循环收敛）
```

---

## 三、三类节点的处理路径（子代理的决策树，这里给人类看的版本）

| 节点长在哪 | 例子 | 谁改 | 怎么改 |
|---|---|---|---|
| **场景 .tscn**（固定区块/按钮/标签/容器本身） | `%TopBar`、`%NormalButton`、`game_table` 的 `%LogPanel` | 子代理 | `ui_adjust.gd` 的 `list/inspect/move/align/resize/set` |
| **注册表**（脚本动态创建 + 绝对定位，已收敛） | `UniTeamPanel`、`CardValueBadge` | 子代理 | `op:"registry"` 模式改 `layout_registry.json` |
| **容器子项**（VBox/HBox/Flow/Grid/Scroll 内，数量会变） | `%LogList`、手牌、座位 | **子代理不硬改** | 改容器 separation / 子项 `custom_minimum_size` / `size_flags`；或人类决定把它改成绝对定位 |
| **纯动态瞬时元素**（动画飞行卡/飘字/粒子） | 发牌飞卡 | 子代理（少做） | 直接改代码常量，先 ask 确认，绝不盲改 |

**为什么动态绝对定位要收进注册表**：以后任何「动态 new 出来的固定控件」都写 `LayoutRegistry.apply_to(node, "名字", preset)`，
数值只存在 `layout_registry.json` 一处。人类说「这个动态面板下移 10」→ 子代理改 JSON 一行，不翻代码、不动逻辑。

---

## 四、人类侧操作手册（30 秒上手）

1. **开游戏**（你自己跑，任何场景都行）。
2. **按 F1** 开调试浮层（右缘面板 + 悬停白框）。
3. **悬停**目标控件 → 顶部实时显示 `节点名 | 类型 | x y w h | 锚/偏移`；**点列表行** → 青色框选中并把一行
   `UI节点: X | 场景: res://... | 全局/锚/偏移` 复制进剪贴板。
4. **把这一行 + 你的效果**发给 UI 调参子代理（一条一个效果最好）。
   例：`UI节点: %NormalButton | 场景: res://scenes/main_menu.tscn | …` + 「向下 10px」。
5. 子代理回报后，**重开游戏按 F1 验收**；不满意就再发一句，循环。
6. 想反悔？回滚 = 覆盖 `godot/tools/.ui_adjust_backups/` 里对应备份，或 `git checkout -- <文件>`。

**F1 细节**：浮层开着时右侧面板区域会挡住下方点击（预期）；再按 F1 关闭。F1 不干扰正常游戏。

---

## 五、边界与分工（随 AGENTS.md 同步更新）

- **AI 仍不自己开游戏调试**——子代理只 headless 跑工具 + 静态检查；「跑起来看效果」永远是人类验收。
- **初步布局设计 = AI（旧规则已废除）**：新 UI 区块/按钮/面板的初始位置/尺寸/间距由 AI 按审美给初版；**位置数值微调 = 子代理**（工具保证精确）；**最终视觉/手感 = 人类验收**。沟通成本从「翻代码」降为「一句话效果」。
- 新动态控件一律走注册表（apply_to 约定），人类永远能只靠「节点名+效果」调它。
- 本工作流**不强制废除编辑器拖拽**：喜欢在编辑器里拖静态 UI 的继续拖；新工作流是兜底 + 统一语言，尤其补上「动态 UI 没人能拖」这个洞。

---

## 六、采纳步骤（把这个机制铺开）

1. ✅ 已完成：工具 + 注册表 + 浮层 + 两处迁移示范（`UniTeamPanel`、`CardValueBadge`）。
2. **增量迁移**：遇到「代码里硬编码的绝对定位动态控件」，顺手改成
   `LayoutRegistry.apply_to(node, "名字", 预设)`，并把当前数值抄进 `layout_registry.json`（数值不变 → 行为零变化）。
3. **新写动态绝对定位**：一律走注册表，禁止再裸写 `offset_*` 数字。
4. 纯常量尺寸（如 `SEAT_SIZE`、`BASE_SIZE`）可留作常量（改名后也够清晰），人类点名要调时再收进注册表。
5. 动画坐标常量（`DECK_ORIGIN` 等）属于动画参数，不进注册表，人类要调走「ask 改代码」路径。

---

## 七、工具自查清单（改完用什么验）

- 改场景节点：`ui_adjust.gd` 实改后 `git diff <scene>.tscn` 应**只多出目标节点那几个字段**，其余文件原样（文本级改写保真）。
- 改注册表：`registry inspect` 能反查消费者脚本（`_find_registry_consumers`），确认影响面。
- 改过的 `.gd`：`godot --headless --path godot --script res://tools/../` 或 `godot_validate_script` 校验语法。
- 全量回归：跑 `docs/../godot/tests/` 10 套 headless 测试（新 autoload 已带 headless 自禁用，不干扰）。
