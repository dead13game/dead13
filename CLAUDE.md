# CLAUDE.md

亡命十三街 — 基于扑克牌的多人对战游戏。Vue 3 驱动 UI，PixiJS v8 渲染牌桌，GSAP 负责动画，Tauri 打包桌面端。
本项目使用中文与用户交流。

**线上地址：** `https://menghun-myracler.github.io/13street/`（GitHub Pages 自动部署）

## 快速开始

本项目使用**手动 5 session**：4 个领域 session（game-logic / pixi-render / animation / vue-ui）+ 1 个主 session。主 session 判断任务领域，用户手动切 session 传递任务和结果。

1. 主 session 收到任务 → 判断领域 → 输出 `📎 发给 [agent名]：任务描述`
2. 不知道改什么 → 主 session 自己搜索或让用户开 Explore session
3. 改完 → `npm run test` 验证
4. 改接口 → 更新下方「Agent 间合约」表

## 常用命令

```bash
npm run dev          # Vite 开发服务器
npm run build        # 生产构建（vite build → postbuild 内联）
npm run preview      # 预览构建产物
npm run test         # 运行 vitest 测试
npm run tauri:dev    # Tauri 桌面开发

```

## 禁用操作

PR以及gh CLI会导致用户GitHub账户封禁，禁止使用。
禁用worktree分支，修改直接作用在main里
禁止自己git push操作，更新完游戏提醒用户手动push

## 核心设计原则（最重要，每次变更必须遵守）

1. **`src/game/` 是纯逻辑层 — 零依赖。** 不引用 Vue、PIXI、GSAP 或浏览器 API。所有游戏规则在这里。
2. **单向数据流：** `gameState` (Vue reactive) → `usePixiSync` (watch) → `PIXIManager` (渲染)。不反向操作。
3. **新机制用通用标记。** 如 `endTurn` 控制回合推进（true=下一玩家，false=当前玩家额外行动），不搞角色特殊路径。
4. **PixiJS 对象用 `shallowRef`，不用 `ref()`。** Vue 深度响应式代理会破坏纹理引用。GSAP 动画用 `sprite.scale.x` 不是 `scaleX`。
5. **伤害计算：先 -2 再 2:1 联盟分配，向下取整（`Math.floor`）。**

## 行为准则 — 信息不足时必须追问（最重要）

**绝对禁止在信息不完整时猜测或假设。** 以下情况必须停下来追问用户，不继续执行：

1. **Bug 报告太模糊** — 用户只说「XX 有 bug」但没有给错误日志、复现步骤、预期/实际行为。追问：「请提供控制台报错或 `[game]` 日志，并描述预期行为 vs 实际行为」
2. **功能需求不明确** — 用户说「加一个新角色」但没给技能名称、效果、数值。追问：「新角色的技能是什么？效果数值？是否有使用次数限制？」
3. **不要自己读 src/ 代码** — 涉及 src/ 下任何文件时，不要自己 Read。直接 spawn 对应领域的子 agent，它会读需要的文件。你自己读 = 浪费 token + 上下文膨胀。唯一例外：跨层问题需要你自己同时理解多个层时。
4. **多个可能原因时** — bug 有 2 个以上可能的原因时，不要赌一个去改。列出所有假设，追问用户或读日志排除后再改。
5. **第一次听说的问题** — 用户描述的问题不在已修复 Bug 列表或你的认知范围内，先追问细节，不要直接动手。
6. **不确定影响范围** — 不知道改动会涉及哪些文件时，spawn Explore subagent（subagent_type: "Explore"）做只读搜索，拿到文件列表后再派对应的领域 agent。
7. **会话长时间中断后** — 如果中间可能有其他改动（用户手动改代码或第三方工具），动手前先 spawn Explore 或子 agent 重读相关文件，不要依赖中断前的上下文。

**好的提问示范：**

> 「你说的『攻击伤害不对』，具体是哪个角色攻击哪个目标？伤害值预期多少、实际多少？控制台 `[game]` 日志里 `damage_calc` 那行输出是什么？」

## 架构

```mermaid
graph TD
    A[App.vue] --> B[GameSetup.vue 选角]
    A --> C[GameShell.vue 主壳]
    C --> D[GameCanvas.vue → PIXI]
    C --> E[ActionBar.vue]
    C --> F[LogPanel.vue]

    G[src/game/gameState.js] -. watch .-> H[usePixiSync]
    G -. watch .-> I[useAnimationFlow]
    H --> J[PIXIManager]
    I --> K[GSAP + Particles]
```

| 层     | 目录              | 职责                                       |
| ------ | ----------------- | ------------------------------------------ |
| 纯逻辑 | `src/game/`       | 状态机 + 角色技能 + AI + 天气（零依赖）    |
| 桥接   | `src/bridge/`     | 监听 gameState → 驱动 PIXI + GSAP          |
| 渲染   | `src/pixi/`       | PixiJS v8 Application + 精灵 + 布局 + 粒子 |
| UI     | `src/components/` | Vue 3 组件（ACtionBar、GameShell 等）      |

## 游戏状态机

```
PHASE: SETUP → PEACE(前N回合禁攻) → NORMAL(战斗) → GAME_OVER
STEP:  pickAction → attackShowCard → pickTarget → ... → pickAction（循环）
```

`STEP` 驱动 UI（ActionBar 中 `v-if` 判断 `state.step`）。

## 领域 Agent 手动工作流

用户手动维护 4 个长期 session（对应 4 个领域 agent）+ 1 个主 session。主 session 不直接调 Agent tool——由用户手动在 session 间传递任务和结果。

```
主 session（你）接收到任务
  → 判断属于哪个领域
  → 输出：「📎 发给 [game-logic]：修复 combat.js 联盟平摊 off-by-one」
  → 用户手动切到 game-logic session，粘贴任务
  → game-logic 完成后，用户把结果贴回主 session
  → 主 session 验证（跑 test、看 diff）
```

| 目录                            | 发给哪个 session                      | 启动命令                                       |
| ------------------------------- | ------------------------------------- | ---------------------------------------------- |
| `src/game/`                     | game-logic                            | 用 `.claude/agents/game-logic.md` 的 prompt 开 |
| `src/pixi/` 或 `GameCanvas.vue` | pixi-render                           | 同上，对应 prompt                              |
| `src/bridge/` 或 `effects/`     | animation                             | 同上                                           |
| `src/components/` 或 `App.vue`  | vue-ui                                | 同上                                           |
| 不确定                          | 主 session 自己搜索或让用户开 Explore | —                                              |

**主 session 输出任务格式：** `📎 发给 [agent名]：具体任务描述（含文件路径、函数名、改什么）`

**领域 session 输出结果格式：** 标准化结果块（改动文件、摘要、测试结果、合约影响）。主 session 收到后自动解析并判断是否需要跟进。

**典型交互：**

```
你：[贴回 game-logic 的结果]
    ## 📊 任务结果
    改动文件: src/game/combat.js
    改动摘要: 修复联盟平摊 Math.floor
    测试: 45/45 通过
    合约影响: 无

主 session：「收到。combat.js 联盟平摊已修复，测试全绿，合约无变化。下一个任务？」
```

## Skills & 调试

| 工具                  | 用途                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| `/debug`              | 六步调试法（复现→隔离→假设→测试→修复→记录），含症状→模块速查表                 |
| `npm run test`        | 45 条 vitest 测试（damage 14 + alliance 8 + deck 9 + TableLayout 14），< 300ms |
| Playwright MCP        | `browser_console_messages` 读日志 + `browser_evaluate` 读 PixiJS/游戏状态      |
| `window.__PIXI_APP__` | 浏览器控制台访问 PIXI Application 内部状态                                     |
| `[game]` 日志         | `console.debug` 输出结构化 JSON，`window.__GAME_LOG_LEVEL__` 动态控制等级      |

## Agent 间合约（跨层接口 — 修改必须同步更新本表）

Agent 之间通过代码 + CLAUDE.md + Memory 通信。任何 Agent 改了下述接口，必须同步更新本表。改完跑 `npm run test`。

### 合约 1：gameState 响应式对象结构

`createGameState()` 返回的 reactive 对象，被所有 Agent 共享。新增字段由 game-logic 负责。

### 合约 2：gameState.js 导出函数签名

| 函数                                               | 参数          | 调用方            |
| -------------------------------------------------- | ------------- | ----------------- |
| `createGameState()`                                | —             | App.vue           |
| `initGame(state, chars, useWeather?, startRound?)` | —             | useGameController |
| `currentPlayer(state)`                             | state         | 全部              |
| `startAttack(state)`                               | state         | GameShell         |
| `executeAttack(state, targetIdx)`                  | state, number | GameShell         |
| `executeDefense(state)`                            | state         | GameShell         |
| `executeGamble(state)`                             | state         | GameShell         |
| `executeSkill(state)`                              | state         | GameShell         |
| `canUseSkill(state, player)`                       | state, player | UI                |
| `startAlly(state)`                                 | state         | GameShell         |
| `executeAlly(state, targetIdx)`                    | state, number | GameShell         |
| `executeBetray(state)`                             | state         | GameShell         |
| `getAllianceTargets(state)`                        | state         | UI                |
| `serializeGameState(state)`                        | state         | Vue（存档）       |
| `deserializeGameState(state, saveData)`            | state, object | Vue（读档）       |

### 合约 3：PIXI ↔ Vue 桥接

| 接口                                                 | 方向       | 维护 Agent  |
| ---------------------------------------------------- | ---------- | ----------- |
| `usePixiSync(state, getManager)`                     | Vue → PIXI | animation   |
| `useAnimationFlow(state, getManager)`                | Vue → PIXI | animation   |
| `PIXIManager.buildScene(players, deckCount)`         | PIXI       | pixi-render |
| `PIXIManager.updatePlayer(index, player, isCurrent)` | PIXI       | pixi-render |
| `GameShell.onRelayout()`                             | Vue → PIXI | vue-ui      |

### 合约 4：player 对象渲染字段

PlayerTableSprite `_updateStatus()` 依赖: `frozenBy, allyIndex, allianceTurns, betrayalPenalty, stealTarget, dotTarget, fightingSpirit, savepoint, extraAction, ignoreTrapThisTurn, gamblePenalty, consecutiveGambles`

→ game-logic 新增状态标签时，必须告知 pixi-render 同步改 `_updateStatus()` 或 `_updateGambleWarn()`

## 构建关键点

- **`codeSplitting: false`**（vite.config.js）— PixiJS v8 动态 import 在 file:// 协议会失败，必须合并单一 bundle。
- **`resolution` 上限 2x** — `Math.min(dpr, 2)`，移动端 3x 屏 GPU 过载。
- **分发用线上 URL** — 不要依赖 file://（iOS WKWebView 彻底禁止）。
- **Canvas**: 默认 `position: fixed; z-index: 1`；竖屏滚动切为 `position: relative; touch-action: pan-y`。

## 关键文件

| 文件                             | 行数 | 说明                                         |
| -------------------------------- | ---- | -------------------------------------------- |
| `src/game/gameState.js`          | 462  | 状态创建 + 初始化 + 回合推进 + 统一导出      |
| `src/game/combat.js`             | 543  | 攻击/防御/赌命 全流程                        |
| `src/game/skills.js`             | 388  | 9 个角色技能（路由 + 各角色实现）            |
| `src/game/damage.js`             | 162  | 伤害结算 + 死亡 + 游戏结束判定               |
| `src/game/alliance.js`           | 151  | 结盟/背刺/目标筛选                           |
| `src/game/caiyueang.js`          | 155  | 菜月昴死亡回归（存档/读档/深拷贝）           |
| `src/game/weather.js`            | 44   | 天气牌堆 + getter                            |
| `src/game/constants.js`          | 156  | 角色数据 CHARACTERS、阶段/步骤/天气          |
| `src/game/deck.js`               | 60   | 扑克牌创建/洗牌/抽牌/墓地重构                |
| `src/game/gameLogger.js`         | 200  | 开发日志（零依赖，`[game]` JSON 到 console） |
| `src/pixi/core/PIXIManager.js`   | 268  | Application 管理 + 场景树 + 粒子             |
| `src/pixi/layout/TableLayout.js` | 203  | 自适应布局（横屏单/双行，竖屏2列）           |
| `src/bridge/useAnimationFlow.js` | 352  | GSAP 动画触发 + 粒子调度                     |

## 已修复的关键 Bug（禁止重复犯错）

- `new Sprite()` 空纹理设 width/height → NaN scale 崩溃
- `CardSprite._renderEmpty()` 首次调用时 `_dashText` 为 null
- 冰封效果 `nextPlayer` 无深度保护 → 无限递归
- 花色 `SUITS` 为空字符串（必须保持 `♠♥♦♣`）
- `buildScene()` 传 TableLayout 尺寸**不能除以 resolution**
- 竖屏 canvas 用 `position: absolute` → 不占文档流无法滚动

## 开发日志系统

所有游戏逻辑操作自动记录结构化日志到 `console.debug`，格式为 `[game] {"ts":...,"type":"...",...}`。

### 控制台使用

```js
window.__GAME_LOG_LEVEL__ = 0; // DEBUG，所有日志
window.__GAME_LOG_LEVEL__ = 1; // INFO
window.__GAME_LOG_LEVEL__ = 2; // WARN，只看异常

// Chrome/Edge: 在 Console 的 Filter 框输入 [game]
```

### 关键事件类型（`src/game/gameLogger.js` → `CAT`）

| type                                              | 说明                | 关键字段                                      |
| ------------------------------------------------- | ------------------- | --------------------------------------------- |
| `turn_start` / `turn_end`                         | 回合推进            | round, playerIndex, playerName                |
| `attack_start` / `attack_draw` / `attack_execute` | 攻击流程            | attackerIndex, targetIndex, cards, totalValue |
| `damage_calc`                                     | 伤害计算            | rawValue, afterMinus2, allianceSplit          |
| `hp_change`                                       | **HP 变化（统一）** | playerIndex, from, to, delta, reason          |
| `defense_start` / `defense_draw`                  | 防御流程            | playerIndex, cards                            |
| `gamble_start` / `gamble_result`                  | 赌命                | drawnCards, trapIdx, baitIdx                  |
| `trap_trigger`                                    | 陷阱触发            | victimIndex, trapCard, trapValue              |
| `skill_use` / `skill_effect`                      | 技能                | characterId, targetIndex, effect              |
| `ally_form` / `betrayal`                          | 联盟/背刺           | playerA, playerB, turns                       |
| `weather_change` / `weather_effect`               | 天气                | from, to, effect                              |
| `anomaly`                                         | **异常检测**        | 伤害偏差、HP 负值、高值卡低伤害等             |

### 排查 bug 示例

```
▎ 用 Playwright 打开游戏，选4人，过3回合，读所有 [game] 日志，
▎ 筛选 type:'damage_calc' 检查联盟伤害分配是否正确
▎ 筛选 type:'hp_change' 对比 from/to 找出异常扣血
```
