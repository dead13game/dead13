# CLAUDE.md — 亡命十三街 Godot 版架构参考

亡命十三街 — 基于扑克牌的多人对战游戏。**当前形态： Godot 4.7 迁移版（`godot/`）**。
工作流与分工见 **AGENTS.md**；本文件维护架构、构建关键点、关键文件、项目状态等辅助参考。
最终目标：**手机浏览器打开 GitHub Pages 玩**（竖屏 1080×1920，单线程 Web 导出）。

## 常用命令

```bash
# 运行全部 10 套测试（改逻辑后必跑）
cd godot
for t in core logic football solo uni uni_ui league_3v3 save audio artifacts; do \
  godot --headless --path . --script res://tests/test_$t.gd; done

# 单套测试
godot --headless --path godot --script res://tests/test_core.gd

# Web 导出（单线程预设，部署用）
godot --headless --path godot --export-release "Web"

# Windows 导出
godot --headless --path godot --export-release "Windows Desktop"
```

## 禁用操作（硬规则）

- **禁止**：`git push` / gh CLI / `git clone` / `git pull`
- **允许**：本地 `git commit`；push 一律由项目作者手动执行

## 架构

```
godot/
  project.godot               # 1080×1920 竖屏 + canvas_items 缩放 + autoload
  export_presets.cfg          # Web（单线程）+ Windows Desktop 两预设
  assets/audio/               # SFX（PCM WAV）+ 3 BGM（mp3）
  scenes/
    main_menu.tscn            # 主菜单（场景驱动）
    classic/                  # character_select + game_table（场景骨架+脚本动态）
    football/                 # football_select + world_cup_shell + league_shell
    solo/solo_shell.tscn      # 单人（区块级绝对定位骨架）
    simuniverse/uni_shell.tscn
  scripts/
    autoload/
      game_manager.gd         # 跨场景状态 + 模式状态机（经典/世界杯/联赛/单机/模拟宇宙）
      audio_manager.gd        # 轮询 state.soundQueue 播 SFX + 场景 BGM 切换
      save_manager.gd         # Web→localStorage / 桌面→user:// 双后端存档
    game/                     # 纯逻辑层 — 零 UI 依赖
      constants.gd deck.gd player.gd weather.gd sound_events.gd
      damage.gd combat.gd gamble.gd alliance.gd skills.gd caiyueang.gd
      artifacts.gd game_state.gd serialize.gd match_state.gd
      world_cup.gd world_cup_constants.gd league.gd league_constants.gd
      solo.gd solo_combat.gd solo_events.gd solo_constants.gd
      uni_constants.gd uni_buffs.gd uni_core.gd uni_state.gd
      uni_combat.gd uni_skills.gd uni_shop.gd uni_events.gd
      ai/ ai_core.gd ai_easy.gd ai_skilled.gd ai_hell.gd ai.gd
    ui/                       # 场景驱动骨架 + 脚本动态内容
      layout_registry.gd      # 动态 UI 布局单一真源（apply_to 约定，见「构建关键点」）
      layout_registry.json    # 动态 UI 布局数据（preset + anchor_* + offset_*）
      ui_debug_overlay.gd     # 运行时 UI 调试浮层（autoload，F1）
  tools/
    ui_adjust.gd              # UI 布局调整工具（headless）
    ui_adjust_agent.md        # UI 调参子代理定义
  tests/                      # 10 套 headless 自测（含圣遗物）
```

## 游戏模式

| 模式 | 逻辑文件 | 说明 |
| --- | --- | --- |
| 经典对战 | game_state.gd + combat/gamble/alliance/skills 等 | 2-8 人扑克对战 |
| 世界杯 | world_cup.gd + match_state.gd | 小组赛→淘汰赛 R16/QF/SF/Final；点球 |
| 联赛 | league.gd + league_constants.gd | 10 队双循环 18 轮；**3v3 完整版**（选秀+6人+死亡顺序计分） |
| 单机爬塔 | solo.gd + solo_combat.gd + solo_events.gd | 章节/成长/卡组/事件/商店/营地 |
| 模拟宇宙 | uni_state.gd + uni_combat/buffs/skills/shop/events | 位面 1-10/11-30/…；祝福/奇物/方程 |

## 游戏状态机（经典）

```
PHASE: SETUP → PEACE(前N回合禁攻) → NORMAL(战斗) → GAME_OVER
STEP:  pickAction → attackShowCard → pickTarget → … → pickAction（循环）
```

- `STEP` 驱动行动栏按钮显隐（`game_table.gd _refresh_actions`）
- 比赛模式（世界杯/联赛 1v1）：matchContext 处理换人/点球/赛果
- 联赛 3v3：leagueContext 记录死亡顺序 + 团灭/回合上限回调

## 核心规则（逻辑层）

- `godot/scripts/game/` 是纯逻辑层 — 零 UI 依赖
- 经典模式伤害计算：先 -2 再 2:1 联盟分配，向下取整
- 行动顺序按 `CHARACTERS[id].speed` 每回合重排（大=先动，dead 排末尾，同速按 index）
- Player 嵌套字段写完整路径：`statusEffects.xxx` / `relations.xxx`
- 开发日志：`state.soundQueue`（音效事件）由 audio_manager 消费；`state.log`/`messageLog`（文本）由 UI 显示

## 构建关键点

- **竖屏基准（固定不变）**：`project.godot` → `display/window/size` 1080×1920（720×1280 时代 UI 已等比 ×1.5 放大）；`display/window/stretch` mode=canvas_items, aspect=expand
- **Web 单线程**：`export_presets.cfg` `variant/thread_support=false` — 无需 SharedArrayBuffer/COOP/COEP，手机浏览器直接可跑
- **UI 分流**：固定元素（区块/按钮/标签）→ 场景驱动绝对定位（人类编辑器逐个可拖）；动态列表（手牌/座位/日志/商店/卡牌，数量随进展变多）→ 脚本 instantiate + 容器自动排；可复用组件（卡牌）→ card.tscn + load/instantiate
- **节点约定**：脚本 `@onready var x = %UniqueName`；节点缺失时脚本降级兜底（场景搭一半也能跑）
- **Container 陷阱**：Container 内子节点编辑器拖不动；要让人类拖动必须用绝对定位（PanelContainer/Control + anchor/offset）
- **布局分工（固定不变）**：分辨率固定 1080×1920；**固定元素全部独立绝对定位**（数量恒定的按钮组/标签/区块，即使条件显隐也算固定元素）；**仅动态列表保留容器**（判断标准：数量会变才用容器）
- **动态 UI 布局注册表（硬性约定，写新动态控件必守）**：脚本动态创建 + 需要绝对定位的控件，一律 `LayoutRegistry.apply_to(node, "名字", 预设)`（`scripts/ui/layout_registry.gd`），数值登记进 `scripts/ui/layout_registry.json`（preset + anchor_*+ offset_*），**禁止裸写 `offset_*` 硬编码**。收尾跑 `godot --headless --path godot --script res://tools/ui_adjust.gd -- <{"op":"audit"}>` 查漏登记（调用了但 JSON 没条目 = missing，必须补；有条目但无调用 = orphan，可清理）
- **UI 布局统一调整体系**：调试浮层 `scripts/ui/ui_debug_overlay.gd`（autoload，进游戏按 F1：悬停/点选读节点名+rect，列表按字典序）→ 人类把「节点名+效果」发给子代理 → 子代理用 `tools/ui_adjust.gd`（headless，op: list/inspect/search/move/align/resize/set/registry/audit；场景 .tscn 与注册表都支持；容器子节点自动拦截；写前自动备份到 tools/.ui_adjust_backups/，已 gitignore）。子代理定义与用法见 `tools/ui_adjust_agent.md`、`docs/ui-adjust-workflow.md`
- **布局设计分工（旧规则已废除）**：AI 负责**初步 UI 布局设计**——新 UI 区块/按钮/面板的初始位置/尺寸/间距按审美给初版（遵循布局准则，见上）；人类负责**最终微调与手感验收**（F1 调试浮层 + UI 调参子代理，报「节点名+效果」，不翻代码）；AI 仍不自己开游戏试错
- **音频**：Godot 只支持 PCM/float WAV；非 PCM 导入失败（历史坑，坏文件已清理）
- **字体（Web 必须）**：Godot 默认字体**不含中文字形**（桌面靠系统字体回退正常，Web 无回退 → 中文全乱码/方块）。项目已打包字体并设为默认：`assets/fonts/default_theme_font.tres`（FontVariation = NotoSansSC-VF.ttf 主字体 + NotoColorEmoji.ttf 回退），project.godot `gui/theme/custom_font` 指向它。**新增 UI 文本无需处理，自动生效**；如需换字体改 tres 即可。注意：勿用微软雅黑/宋体等版权字体分发

## 视觉 / 主题约定（固定不变）

- **素材**：整体 UI 用 Kenney 两包（CC0）——`assets/kenney/fantasy-ui-borders`（面板/按钮/分隔条边框）+ `assets/kenney/playing-cards`（抽的牌：手牌/赌命/观星）。卡牌**直接用贴图**（`card_textures.gd` 按 suit/rank 映射 `card_{suit}_{rank}.png`），不重画
- **UI 文字最小字号 26px（硬性，场景 + 脚本生成均适用）**：新增任何 UI 文本字号不得低于 26；低于的一律提到 26
- **所有 Button/Label 用 Fantasy 风格**：场景驱动的按钮/标签在 `.tscn` 里挂 `theme_override_styles`（`assets/styles/fantasy_*.tres`，StyleBoxTexture 九宫格，检查器可见可换图）；脚本动态创建的由全局 autoload `scripts/autoload/fantasy_theme_loader.gd` 自动套（`node_added` 钩子，已有 override 的跳过）
- **主题引擎坑（本机 Godot 4.7.1）**：`Control.theme` / `gui/theme/custom` / `ThemeDB.default_theme` 的 **stylebox 与 color 运行时都不生效**，仅 `font_size` 生效；唯一可靠路径是 per-node `theme_override_*`（含 `node_added` 自动 override）。NeoCade 主题仅 `addons/` 保留未启用
- **卡牌组件**：`scripts/ui/card_control.gd`（CardControl，Kenney 贴图 + 点数角标 + 点击信号）+ `scripts/ui/player_seat.gd`（角色牌桌：立绘/名字/角色/HP 条/状态/防御阵/陷阱/高亮/阵亡）
- **战斗动画**（复现 Vue）：`scripts/ui/game_table.gd` 内——抽牌/发牌/翻牌（`_animate_deal`）、攻击牌飞向目标（`_animate_fly_to_target`）、飞入墓地（`_animate_to_grave`）、受伤闪白/防御击穿抖动/死亡粒子（`PlayerSeat` + `_spawn_death_burst`）

## 关键文件

| 文件 | 说明 |
| --- | --- |
| scripts/autoload/game_manager.gd | 跨场景状态 + 模式入口 + 3v3 死亡顺序回调 |
| scripts/autoload/audio_manager.gd | 12 类 SFX 轮询 + menu/battle1/battle2 BGM |
| scripts/autoload/save_manager.gd | localStorage / user:// 双后端 |
| scripts/ui/game_table.gd | 牌桌：经典+比赛模式 + 按钮显隐规则（莉奈娅偷牌/DoT、菜月昴存读档、6人结盟背刺） |
| scripts/ui/character_select.gd | 选人：玩家人数/角色/AI/难度 + 玩家1 开局圣遗物二选一（角斗士的终幕礼/流浪大地的乐园） |
| scripts/game/artifacts.gd | 圣遗物：击破计数(陷阱+2/防御+1)→8 发动圣言自明(每局2次, 2回合, 额外行动)；激活期间禁温迪/雷神/风堇大招（规则见 update_log/圣遗物系统.md） |
| scripts/ui/solo_shell.gd | 单人主壳（场景骨架化样板） |
| scripts/game/solo_combat.gd | 单机战斗（enemyBuff null 坑已修） |
| scripts/ui/layout_registry.gd + .json | 动态 UI 布局单一真源（apply_to 约定 + 条目数据；新增动态绝对定位控件必登记） |
| scripts/ui/ui_debug_overlay.gd | 运行时 UI 调试浮层（autoload；F1 开关，悬停/点选复制「节点名\|场景\|rect」） |
| tools/ui_adjust.gd | UI 布局调整工具（headless；op: list/inspect/search/move/align/resize/set/registry/audit；写前自动备份） |
| tools/ui_adjust_agent.md | UI 调参子代理定义（Spawn 模板见文末） |
| export_presets.cfg | Web + Windows 预设 |

## 已修复的关键 Bug（禁止重复犯错）

- `String(null)` 崩溃：`.get(key, default)` 在 key 存在但值为 null 时返回 null 而非 default → 用 `_s(v)` helper 或判空后再 String()
- 场景锚点漏写：RIGHT_WIDE/FULL_RECT 预设必须写全 anchor（尤其 `anchor_bottom=1.0`），否则高度塌陷
- 按钮显隐：存/读档仅菜月昴(11)、偷牌/DoT 仅莉奈娅(9) LINIYA_PICK 步骤、结盟/背刺仅 ≥6 人
- 音频：非 PCM WAV 无法导入 → 素材先验证格式

## 测试与调试

- 逻辑自测：`godot/tests/test_*.gd`（extends SceneTree，PASS/FAIL 输出，`quit(_failures)`）
- 交互调试归人类（agent.md 分工）；AI 只用 headless 跑测试/校验语法（`godot_validate_script`）
- AI 调试注意：`eval` 返回复杂对象易超时；复杂循环改独立测试脚本

## node

- 默认终端为Git Bash
