# 亡命十三街 → Godot 迁移计划

> 目标：把现有的 Vue 3 + PixiJS + Tauri 项目逐步迁移到 Godot 4.7，最终以 **HTML（Web 导出）** 部署到 GitHub Pages（替换原 Vue 版，仍使用 `https://menghun-myracler.github.io/13street/`）。
> 当前状态：**经典模式已可玩（纯逻辑全部移植 + Godot UI），Web 导出已配置，GitHub Pages 工作流已接入。**

## 为什么选 Godot
- 原生跨平台导出，不再依赖浏览器/WebView。
- 2D 渲染、UI、动画、粒子、音频都在一个引擎内。
- 后续上线 App Store / Google Play / Steam 更直接。

## 迁移策略

1. **保留 `src/game/`、`src/solo/logic/`、`src/simuniverse/logic/` 作为规则权威来源。**
2. **按模块人工移植到 GDScript**，优先移植纯逻辑（零依赖），再接入 Godot 场景与 UI。
3. **现有资源直接复用**：`images/`、`Sounds/`、`public/sfx/` 已复制到 `godot/assets/`。
4. **每个逻辑模块配 GDScript 自测**，对照原 Vitest 用例保证行为一致。
5. 界面用 Godot Control 构建（代码搭建，视觉细节可后续在 Godot 编辑器里调整）。

## 目录结构（Godot）

```
godot/
  project.godot
  export_presets.cfg    # Web 导出预设（导出到 build/web/）
  assets/
    images/             # 角色立绘等
    audio/              # 音效/BGM
    team-badges/        # 足球模式队徽
  scenes/
    main_menu.tscn
    classic/
      character_select.tscn   # 选人（2-8人/AI难度/天气）
      game_table.tscn         # 牌桌（玩家位/行动栏/日志/卡牌）
    football/     # 世界杯 / 联赛（计划）
    solo/         # 单人爬塔（计划）
    simuniverse/  # 模拟宇宙（计划）
  scripts/
    autoload/
      game_manager.gd         # 跨场景会话（GameManager autoload）
    game/                     # 纯逻辑移植
      constants.gd  deck.gd  player.gd  weather.gd
      sound_events.gd  damage.gd  artifacts.gd  combat.gd
      gamble.gd  alliance.gd  skills.gd  caiyueang.gd
      game_state.gd  serialize.gd
      ai/ai_core.gd  ai_easy.gd  ai_skilled.gd  ai_hell.gd  ai.gd
    ui/
      main_menu.gd  character_select.gd  game_table.gd
  tests/
    test_core.gd    # constants/deck/player/weather/damage/combat
    test_logic.gd   # game_state/gamble/alliance/skills/ai/serialize
  build/web/        # Web 导出产物（gitignore，CI 生成）
```

## 已完成的迁移

### 纯逻辑（全部移植完成，测试通过）
- [x] `constants.gd`：常量、角色表、`get_char_data`
- [x] `deck.gd`：创建牌组、洗牌、抽牌、墓地重构
- [x] `player.gd`：玩家工厂
- [x] `weather.gd`：天气牌堆
- [x] `sound_events.gd`：音效事件队列
- [x] `damage.gd`：伤害结算 / 死亡 / 游戏结束
- [x] `artifacts.gd`：圣遗物（伤害加成 / 暴击 / 圣言自明 / 击破计数）
- [x] `combat.gd`：攻击 / 防御 / 陷阱判定 / 联盟平摊
- [x] `gamble.gd`：赌命 / 陷阱 / 饵
- [x] `alliance.gd`：结盟 / 背刺
- [x] `skills.gd`：11 个角色技能（温迪/钟离/雷电将军/纳西妲/芙宁娜/玛薇卡/哥伦比娅/风堇/莉奈娅/爱蜜莉雅/菜月昴）
- [x] `caiyueang.gd`：菜月昴死亡回归（存档/读档/深拷贝）
- [x] `game_state.gd`：状态机 / 回合推进 / 初始化 / 统一入口
- [x] `serialize.gd`：存档序列化 / 读档
- [x] `ai/*.gd`：简单 / 熟练 / 地狱 AI + 调度器

### 经典模式 UI（可玩）
- [x] 主菜单 → 经典模式入口
- [x] `character_select`：2-8 人、11 角色、AI 难度、天气开关
- [x] `game_table`：玩家位（HP/防御/陷阱/状态标签）、回合/天气/牌库信息、战斗日志、行动栏（攻击/防御/赌命/技能/结盟/背刺/圣言自明/存档读档/偷牌DoT）
- [x] 技能选目标、赌命选陷阱饵、纳西妲占卜排序、结盟选目标、取消回退
- [x] AI 自动行动（含各技能分支决策）

### 构建与发布
- [x] Web 导出预设 `export_presets.cfg`（`build/web/index.html`，相对路径引用，可部署子路径）
- [x] 本地导出验证通过（index.html + index.wasm + index.pck）
- [x] GitHub Actions：`.github/workflows/deploy.yml` 改为 CI 下载 Godot 4.7.1 → Web 导出 → 部署 Pages（替换原 Vue 构建）

## 测试

```bash
# Godot 核心 + 逻辑测试（PASS: all core tests / all logic tests）
cd godot
godot --headless --path . --script res://tests/test_core.gd
godot --headless --path . --script res://tests/test_logic.gd
```

## 后续里程碑（建议顺序）

### Phase 2：足球模式
- [ ] `match_state.gd`：1v1 比赛状态机
- [ ] `world_cup.gd`：世界杯赛程
- [ ] `league.gd`：联赛赛程
- [ ] 世界杯 / 联赛 UI

### Phase 3：单人模式
- [ ] `solo_logic.gd`：爬塔状态机
- [ ] `solo_combat.gd`：战斗
- [ ] 单人 UI

### Phase 4：模拟宇宙
- [ ] `uni_state.gd`：位面 / 推进
- [ ] `uni_combat.gd`：三选一战斗
- [ ] `uni_buffs.gd`：祝福 / 奇物 / 方程
- [ ] 模拟宇宙 UI

### Phase 5：打磨与发布
- [ ] 动画/粒子/音效还原（视觉细节可在 Godot 编辑器协助）
- [ ] 战斗音乐 / 音效播放接入
- [ ] 存档系统接入（浏览器 localStorage / 桌面文件）
- [ ] 各平台导出配置（Windows / 移动端）

## 上线流程

1. 本地验证：`godot --headless --path godot --script res://tests/test_logic.gd`
2. push 到 `main` → GitHub Actions 自动下载 Godot、导出 Web、部署到 Pages
3. 仓库设置：Settings → Pages → Source 选 **GitHub Actions**

## 与原项目并行策略
- 原 Web/Tauri 版本代码保留在仓库中，直到 Godot 版功能覆盖完成。
- 逻辑层先迁移，保证规则一致；美术/音效共享。
- 每次提交记录迁移进度，方便回滚。
