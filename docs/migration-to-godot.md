# 亡命十三街 → Godot 迁移计划

> 目标：把现有的 Vue 3 + PixiJS + Tauri 项目逐步迁移到 Godot 4.7，最终以 **HTML（Web 导出）** 部署到 GitHub Pages（替换原 Vue 版，仍使用 `https://menghun-myracler.github.io/13street/`）。
> 当前状态：**经典 / 足球（世界杯+联赛）/ 单人爬塔 / 模拟宇宙 四大模式可玩，Web 单线程导出已配置，GitHub Pages 工作流已接入。**

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

### 足球模式（世界杯完整 + 联赛可玩）
- [x] `match_state.gd`：1v1 比赛状态机（进球/重置/换人/加时/点球）
- [x] `world_cup.gd` + `world_cup_constants.gd`：世界杯赛程（小组赛6场→积分榜→出线→淘汰赛 R16/QF/SF/Final）
- [x] `league.gd` + `league_constants.gd`：10队双循环18轮 + 积分榜 + 等级加成 + 3v3比分计算（逻辑已备）
- [x] `game_table` 支持比赛模式：比分栏/换人面板/点球面板/赛果遮罩
- [x] 世界杯 UI：设置 → 小组赛 → 积分榜出线 → 淘汰赛（含换人）→ 冠军/淘汰
- [x] 联赛 UI：选队 → 18轮（简化1v1代表战）→ 积分榜 → 赛季结束
- [ ] 联赛 3v3 完整版（选秀+6人赛+死亡顺序计分）——逻辑已移植，UI 待接

### 单人模式（爬塔肉鸽，可玩）
- [x] `solo_constants.gd`：13 张技能卡 / 敌人 / 7 节点链 / 数值常量
- [x] `solo.gd`：章节地图 / 属性成长 / 卡组构筑 / 金币 / 存档
- [x] `solo_combat.gd`：抽3选2 / 行动力 / 牌堆坟场 / 护盾 / 斗志 / 敌方 AI 出牌
- [x] `solo_events.gd`：岔路猎手 / 神秘商人 + 扑克检定（♥ 重抽）
- [x] 单人 UI：地图 → 战斗（抽3选2/出牌/敌方回合）→ 事件/商店/营地 → 卡牌3选1 → 属性分配 → 通关/阵亡

### 模拟宇宙（逻辑层全部移植，UI 待搭）
- [x] `uni_constants.gd`：位面/层规则 / 敌人基础 / 区域 / 货币 / 商店价格 / 12 角色 PVE 技能表
- [x] `uni_buffs.gd`：祝福 59 / 奇物 79 / 方程 13 全量数据 + 强化规则 + modifier 聚合 + 全部事件钩子
- [x] `uni_core.gd`：队伍创建 / 碎片货币（奇物修正）/ 被动同步（玛薇卡斗志/哥伦比娅攻防）/ 存档 / 菜月昴死亡回归
- [x] `uni_state.gd`：状态创建 / 区域生成 / 普通层 2 选 1 / 进入区域效果（财富/休整/首领工作台/商店/奇遇）/ 层推进 / 复活
- [x] `uni_combat.gd`：三选一战斗（普攻/防御/开大）/ 敌人模板 / 波次 / 首领穿插 / 转化及格线 / 伤害结算 / 祝福奇物方程钩子
- [x] `uni_skills.gd`：12 角色 PVE 技能（等级 1-10 查表 / 冷却 / 阈下知觉 / 蛰虫帝）
- [x] `uni_shop.gd`：商品生成 / 购买 / 造物调试台（热量强化 + 覆写）
- [x] `uni_events.gd`：9 分支事件 + 8 奖励 + 3 冒险（骰子/翻牌/抽签）+ 祝福三选一
- [x] `test_uni.gd`：覆盖常量/祝福/奇物/方程/状态/区域/商店/事件/战斗/技能/存档复活/端到端跑图 31 层
- [x] 模拟宇宙 UI（UniShell 等价物）：层推进(2选1)/战斗(三选一)/事件/商店/造物调试台/祝福三选一/休整复活/结算
- [x] 主菜单入口 + GameManager 状态管理 + `uni_shell.tscn`
- [x] `test_uni_ui.gd`：UI 流程回归（打穿战斗层→胜利奖励→祝福三选一→层推进）

## 测试

```bash
# Godot 核心 + 逻辑 + 足球 + 单机 + 模拟宇宙测试（PASS: all core/logic/football/solo/uni tests + uni ui flow）
cd godot
godot --headless --path . --script res://tests/test_core.gd
godot --headless --path . --script res://tests/test_logic.gd
godot --headless --path . --script res://tests/test_football.gd
godot --headless --path . --script res://tests/test_solo.gd
godot --headless --path . --script res://tests/test_uni.gd
godot --headless --path . --script res://tests/test_uni_ui.gd
```

## 后续里程碑（建议顺序）

### Phase 4：模拟宇宙
- [x] `uni_state.gd`：位面 / 推进 / 区域生成 / 货币 / 队伍 / 存档
- [x] `uni_combat.gd`：三选一战斗 / 敌人模板 / 波次 / 转化及格线
- [x] `uni_buffs.gd`：祝福 / 奇物 / 方程 全量数据 + 效果
- [x] `uni_skills.gd` / `uni_shop.gd` / `uni_events.gd` / `uni_core.gd`
- [x] 模拟宇宙 UI（UniShell 等价物）

### Phase 5：打磨与发布
- [ ] 联赛 3v3 完整版（选秀 + 6人赛 + 死亡顺序计分）
- [ ] 动画/粒子/音效还原（视觉细节可在 Godot 编辑器协助）
- [ ] 战斗音乐 / 音效播放接入
- [ ] 存档系统接入（浏览器 localStorage / 桌面文件）
- [ ] 各平台导出配置（Windows / 移动端）

## 上线流程

1. 本地验证：`godot --headless --path godot --script res://tests/test_football.gd`
2. push 到 `main` → GitHub Actions 自动下载 Godot、导出 Web、部署到 Pages
3. 仓库设置：Settings → Pages → Source 选 **GitHub Actions**
4. **Web 导出为单线程**（`export_presets.cfg` 中 `variant/thread_support=false`）——不需要 SharedArrayBuffer / 跨源隔离头，GitHub Pages 直接可跑

## 与原项目并行策略
- 原 Web/Tauri 版本代码保留在仓库中，直到 Godot 版功能覆盖完成。
- 逻辑层先迁移，保证规则一致；美术/音效共享。
- 每次提交记录迁移进度，方便回滚。
