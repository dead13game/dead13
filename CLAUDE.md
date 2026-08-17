# CLAUDE.md — 亡命十三街 Godot 版架构参考

亡命十三街 — 基于扑克牌的多人对战游戏。**当前形态：Vue 3 + PixiJS + Tauri 版 → Godot 4.7 迁移版（`godot/`）**。
工作流与分工见 **agent.md**；本文件维护架构、构建关键点、关键文件、项目状态等辅助参考。
最终目标：**手机浏览器打开 GitHub Pages 玩**（竖屏 1080×1920，单线程 Web 导出）。

## 常用命令

```bash
# 运行全部 9 套测试（改逻辑后必跑）
cd godot
for t in core logic football solo uni uni_ui league_3v3 save audio; do \
  godot --headless --path . --script res://tests/test_$t.gd; done

# 单套测试
godot --headless --path godot --script res://tests/test_core.gd

# Web 导出（单线程预设，部署用）
godot --headless --path godot --export-release "Web"

# Windows 导出
godot --headless --path godot --export-release "Windows Desktop"
```

## 禁用操作（硬规则）

- **禁止**：`git push` / gh CLI / `git clone` / `git pull`（已写入 `reasonix.toml` deny）
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
  tests/                      # 9 套 headless 自测
```

## 游戏模式

| 模式 | 逻辑文件 | 说明 |
|---|---|---|
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
- 伤害计算：先 -2 再 2:1 联盟分配，向下取整
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
- **音频**：Godot 只支持 PCM/float WAV；非 PCM 导入失败（历史坑，坏文件已清理）

## 关键文件

| 文件 | 说明 |
|---|---|
| scripts/autoload/game_manager.gd | 跨场景状态 + 模式入口 + 3v3 死亡顺序回调 |
| scripts/autoload/audio_manager.gd | 12 类 SFX 轮询 + menu/battle1/battle2 BGM |
| scripts/autoload/save_manager.gd | localStorage / user:// 双后端 |
| scripts/ui/game_table.gd | 牌桌：经典+比赛模式 + 按钮显隐规则（莉奈娅偷牌/DoT、菜月昴存读档、6人结盟背刺） |
| scripts/ui/solo_shell.gd | 单人主壳（场景骨架化样板） |
| scripts/game/solo_combat.gd | 单机战斗（enemyBuff null 坑已修） |
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
