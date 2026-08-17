# 人类 × AI 分工协作方案（Godot 阶段）

> 背景：DeepSeek API 涨价后不能像以前一样随意使用 AI。目标是把 AI 调用压到最少、
> 价值最高，把「AI 做起来复杂、人类做起来顺手」的任务交给人类（项目作者）。
> 适用：亡命十三街 Godot 迁移版（`godot/`）的开发协作，本文件对参与开发的
> 所有 session（含其他 AI session）同样有效。

## 一、分工判断标准（一条原则）

> **「能不能用眼睛直接判断好坏？」**
> - 能 → **人类做**（视觉、手感、音效、文案、试玩平衡）
> - 不能（需要读代码 / 算法 / 数据）→ **AI 做**

视觉类任务让 AI 做是「盲调参数 → 你截图 → 再调」的死循环，一次改动烧几十轮
调用；人类在 Godot 编辑器里所见即所得，30 秒搞定。

## 二、人类任务清单（按依赖顺序）

| 优先级 | 任务 | 需要的 Godot 技能 | 依赖 |
|---|---|---|---|
| P0 | 卡牌动画（抽牌/出牌/翻牌） | AnimationPlayer / Tween | 无 |
| P0 | 伤害飘字 + 攻击反馈 | Control / Tween | 无 |
| P0 | 粒子特效（暴击/死亡/技能） | GPUParticles2D / CPUParticles2D | 无 |
| P1 | 状态标签动画、界面过渡、按钮反馈 | AnimationPlayer / Theme | 无 |
| P1 | 音效试玩调音（音量/时机/BGM 切换） | AudioStreamPlayer | 音效框架已就绪 |
| P2 | 平台导出（Windows 图标/真机、移动端签名） | 导出面板 | 需要账号/设备 |
| 随时 | 试玩反馈平衡性问题（哪个角色/卡太强太弱） | 无 | 有可玩版本 |

## 三、AI 任务清单

- **骨架代码**：按人类任务包先搭结构（`add_damage_number()`、牌飞行 Tween 框架、
  粒子挂载点），人类在编辑器里只调数值
- 规则 / 平衡性 / bug 修复（需要读代码的活）
- 测试脚本、文档、CI、迁移推进

## 四、工作方式（省 AI 用量的机制）

1. **人类先动手，卡住了才叫 AI**：编辑器操作类任务默认你先做，需要代码接口时再找 AI
2. **批量攒单**：别一条条来——把一周的「需要 AI 的活」攒成一单一次性给 AI，
   减少上下文反复加载
3. **AI 只产出骨架/接口，不产出成品**：约定好接口签名（如
   `damage_number(text, pos, color)`），AI 写一次，人类在编辑器里无限调
4. **视觉手感零 AI 试错**：任何「调出来看看效果」的活都默认人类做
5. **每次 AI 调用带验收标准**：给 AI 的任务必须写明「做完我能怎么验证」
   （跑哪个测试 / 看哪个场景），避免来回返工
6. **git 流程**：本地提交由 session 自行 commit；push 一律由项目作者手动执行
   （项目规矩：禁止 AI push）

## 五、接口约定格式（任务开工前先定）

每个任务包开工前，先约定两样东西：

- **挂载点**：动画 / 飘字 / 粒子挂在哪个节点路径
  （如 `game_table/PlayerSeats/Seat_0`）
- **函数签名**：AI 提供哪些方法、参数是什么

示例：

```gdscript
# 伤害飘字（AI 提供骨架，人类调样式）
func add_damage_number(text: String, pos: Vector2, color: Color = Color.WHITE) -> void
# 挂载点: scenes/classic/game_table.tscn → PlayerSeats/Seat_{i}/DamageLayer
```

## 六、学习路径 → 任务解锁映射（getting_started）

按官方文档 `https://docs.godotengine.org/en/stable/getting_started` 的模块，
学完对应部分即可接手对应任务（章节名以官方实际目录为准）：

| 学习模块 | 学完可接手 |
|---|---|
| Step by Step：节点 / 场景 / 实例化 | 读懂现有 `godot/` 项目结构（先做「读结构」热身） |
| Step by Step：GDScript 基础 / 脚本 / 信号 | 能读改 GDScript → 可做音效调音（能看懂 audio_manager.gd） |
| Step by Step：Control / UI | 界面美化、按钮反馈、飘字样式 |
| Step by Step：动画（AnimationPlayer / Tween） | 卡牌动画、状态标签动画 |
| Step by Step：音频（AudioStreamPlayer） | 音效调音、BGM 切换 |
| Step by Step：粒子（Particles） | 粒子特效 |
| 导出（Export） | 平台导出配置 |
| First 2D Game 教程（建议穿插实战） | 综合：把上面技能在完整小游戏里串一遍，是接任务前的最佳实战预习 |

> 建议顺序：**Step by Step 全部 → First 2D Game → 回到本项目接 P0 任务**。

## 七、当前 Godot 项目状态速查（供协作参考）

- 迁移已完成 95%：经典 / 足球 / 单机 / 模拟宇宙四大模式可玩，57 脚本 8 场景
- 逻辑层全部移植完成，测试全绿（`godot/tests/`）
- 音效框架已就绪：`scripts/autoload/audio_manager.gd`（SFX + 3 BGM 素材齐全）
- **动画 / 粒子：完全空白**（无 tween/animation/particles 使用）→ 人类任务包 P0 主战场
- 导出：仅 Web（已上 GitHub Pages），Windows / 移动端待配
- 详细迁移进度见 `docs/migration-to-godot.md`
