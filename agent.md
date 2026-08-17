# Agent 工作流（替代 CLAUDE.md）

亡命十三街 — 基于扑克牌的多人对战游戏。**当前阶段：Vue 3 + PixiJS + Tauri 版 → Godot 4.7 迁移版（`godot/`）**。
本项目使用中文交流。本文件对参与开发的所有 AI session 有效，**完全替代 CLAUDE.md**。

---

## 一、人类 × AI 分工（最高优先级原则）

> **「能不能用眼睛直接判断好坏？」**
> - 能 → **人类做**（视觉、手感、音效、文案、试玩平衡、编辑器拖拽布局）
> - 不能（需要读代码 / 算法 / 数据）→ **AI 做**

完整分工清单见 `docs/human-ai-collaboration.md`。核心结论：

- **AI 只产出骨架/接口，不产出成品**：约定好函数签名（如 `add_damage_number(text, pos, color)`），AI 写一次，人类在编辑器里无限调
- **每次 AI 调用带验收标准**：任务必须写明「做完我能怎么验证」（跑哪个测试 / 看哪个场景）
- **批量攒单**：把一周的活攒成一单一次性给 AI，减少上下文反复加载
- **视觉手感零 AI 试错**：任何「调出来看看效果」的活都默认人类做

### 人类独占任务（AI 一律不做，即使 godot-bridge 能近似执行）

| 任务 | 原因 |
|---|---|
| **调整 UI 位置 / 布局** | 眼睛判断，所见即所得 |
| **动画和粒子效果** | 流畅度/手感想看试玩，静态截图判断不了 |
| **试玩测试**（手感/平衡/流程） | 需要真人体感 |
| **音效试听调音**（音量/时机/BGM 切换） | AI 无法判断听感 |
| **美术素材**（图标/卡牌图/背景/按钮样式） | AI 生成资源质量差，人类画/找 |
| **配色与主题** | 眼睛选色，AI 盲调 |
| **文案语气 / 命名**（UI 文本、角色昵称的语感） | 语言审美属人类 |
| **导出平台的账号/签名/真机**（Android 签名、iOS 证书） | 需要账号与设备 |

> 即使 godot-bridge 能「运行时改属性 + 截图预览」，AI 也不做调参/预览循环——那是烧 token 的死循环，人类 30 秒拖完。AI 改完结构只交「验收清单」，不交「预览方案」。

## 二、场景驱动 vs 脚本驱动（UI 分流标准）

| 情况 | 方式 |
|---|---|
| 快速原型 / 极度动态 UI（手牌区、座位内容、日志条目） | **脚本驱动**：代码 instantiate / 动态生成 |
| 固定框架 UI（主菜单背景、战斗界面上下边栏、对话框底板、行动栏按钮） | **场景驱动**：编辑器拖拽搭建 |
| 可复用组件（卡牌 `card.tscn`、座位组件） | **场景设计原型 + 脚本 `load()` / `instantiate()`** |

**节点约定**：脚本用 `@onready var x = %NodeName` 引用场景节点（Unique Name），不依赖绝对路径；**节点缺失时脚本降级**（代码兜底创建或跳过），保证场景搭一半时游戏也能跑。

**场景修改两条路**：
- A：AI 给出节点清单 + 说明，人类在编辑器创建
- B：AI 直接改 `.tscn` 文本（**不用在意坐标**——AI 负责结构/层级/属性/Unique Name/脚本引用正确，位置由人类拖动调整）

## 三、禁用操作（硬规则）

- **禁止**：`git push` / gh CLI / `git clone` / `git pull`（已写入 `reasonix.toml` 的 `[permissions] deny`）
- **允许**：本地 `git commit`
- push 一律由项目作者手动执行

## 四、行为准则 — 信息不足必须追问

1. Bug 报告太模糊 → 追问错误日志 / 复现步骤 / 预期 vs 实际
2. 功能需求不明确 → 追问技能效果 / 数值 / 次数限制
3. 多个可能原因时 → 列出假设，不赌一个去改
4. 第一次听说的问题 → 先追问细节，不直接动手

## 五、接口约定格式（任务开工前先定）

每个任务包开工前，先约定：
- **挂载点**：动画/飘字/粒子挂在哪个节点路径（如 `game_table/PlayerSeats/Seat_0`）
- **函数签名**：AI 提供哪些方法、参数是什么

```gdscript
# 伤害飘字（AI 提供骨架，人类调样式）
func add_damage_number(text: String, pos: Vector2, color: Color = Color.WHITE) -> void
# 挂载点: scenes/classic/game_table.tscn → PlayerSeats/Seat_{i}/DamageLayer
```

## 六、Godot 项目当前状态（2026-08 迁移期）

- **迁移已完成 95%**：经典 / 足球（世界杯+联赛 3v3）/ 单机 / 模拟宇宙四大模式可玩
- 逻辑层全部移植到 GDScript（`godot/scripts/game/`），测试全绿（`godot/tests/` 9 套：core/logic/football/solo/uni/uni_ui/league_3v3/save/audio）
- 存档系统：`godot/scripts/autoload/save_manager.gd`（Web→localStorage / 桌面→user://）
- 音效框架：`godot/scripts/autoload/audio_manager.gd`（12 类 SFX + 3 BGM，素材齐全）
- 场景管理：`godot/scripts/autoload/game_manager.gd`（跨场景状态 + 模式状态机）
- **动画/粒子：完全空白**（无 tween/animation/particles 使用）→ P0 人类任务主战场
- 导出：Web（单线程，已上 GitHub Pages）+ Windows Desktop（exe 已验证），移动端待配
- 详细迁移进度见 `docs/migration-to-godot.md`

## 七、常用命令

```bash
# 运行全部 9 套测试（改逻辑后必跑）
cd godot
for t in core logic football solo uni uni_ui league_3v3 save audio; do \
  godot --headless --path . --script res://tests/test_$t.gd; done

# 单套测试
godot --headless --path godot --script res://tests/test_core.gd

# Web 导出（单线程预设）
godot --headless --path godot --export-release "Web"

# Windows 导出
godot --headless --path godot --export-release "Windows Desktop"
```

## 八、游戏核心规则（逻辑层参考）

- `godot/scripts/game/` 是纯逻辑层 — 零 UI 依赖
- 伤害计算：先 -2 再 2:1 联盟分配，向下取整
- 行动顺序按 `CHARACTERS[id].speed` 每回合重排（大=先动，dead 排末尾，同速按 index）
- Player 嵌套字段写完整路径：`statusEffects.xxx` / `relations.xxx`
- 状态机：`PHASE: SETUP → PEACE → NORMAL → GAME_OVER`；`STEP` 驱动 UI 按钮显隐
- 开发日志：`state.soundQueue`（音效事件）/ `state.log`（文本日志）由 audio_manager / UI 消费

## 九、测试与调试

- 逻辑自测：`godot/tests/test_*.gd`（extends SceneTree，PASS/FAIL 输出，`quit(_failures)`）
- 交互调试：godot-bridge 工具（click / eval / get_ui_elements / screenshot）
- 调试注意：`eval` 返回复杂对象易超时；优先返回精简字段；复杂循环改用独立测试脚本
- 音频陷阱：Godot 只支持 PCM/float WAV，非 PCM 文件导入失败——新音频素材需先验证格式
