# CLAUDE.md

亡命十三街 — 基于扑克牌的多人对战游戏。Vue 3 驱动 UI，PixiJS v8 渲染牌桌，GSAP 负责动画，Tauri 打包桌面端。
本项目使用中文与用户交流。

**当前形态：Vue 3 + PixiJS + Tauri 版（Godot 4.7 迁移已终止，`godot/` 已移除，git 历史可找回）。**

**线上地址：** `https://dead13game.github.io/dead13`（GitHub Pages 自动部署）

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
禁止批量拉代码（git clone / git pull），如确实需要先向用户确认

> 以上 git push / gh CLI / git clone / git pull 已写入 `reasonix.toml` 的 `[permissions] deny`，任何模式（含 yolo）都会硬阻断。
> **允许本地 commit**（`git commit` 可执行），仅 push 禁止——任务完成、测试通过后可自行提交。

## 核心设计原则（最重要，每次变更必须遵守）

1. **`src/game/` 分层且零依赖。** `core/ rules/ characters/ flow/ modes/ persistence/` 不引用 Vue、PIXI、GSAP 或浏览器 API(控制器传进来的 `reactive` 除外)。规则全在 `rules/`,角色全在 `characters/`,状态写入全在 `flow/`。**由 `src/game/guard/` 机器守护。**
2. **单向数据流：** `state`(Vue reactive)→ `buildView(state)` 只读视图 → `usePixiSync` / 组件 → 渲染。**UI 不直接写 state**,所有动作走 `dispatch(state, command)`。
3. **新机制用 `pending` 决策对象,不用 step 字符串 + flag。** `state.step` 是 `pending` 的派生量(仅为兼容 UI 模板保留),`setPending` 是唯一写入口。
4. **PixiJS 对象用 `shallowRef`，不用 `ref()`。** Vue 深度响应式代理会破坏纹理引用。GSAP 动画用 `sprite.scale.x` 不是 `scaleX`。
5. **伤害计算：先 -2 再 2:1 联盟分配，向下取整（`Math.floor`）。** 加成顺序写在 `rules/modifiers.js` 的 priority 常量里,顺序即规则。
6. **角色数据用 `getCharData(player)` / `CHARACTERS` 查表。** 角色专属状态放 `player.char`(由插件 `stateSchema` 声明),通用状态放 `resources/effects/relations`。
7. **Player 字段分区写完整路径。** 资源 → `player.resources.xxx`,效果 → `player.effects.xxx`,关系 → `player.relations.xxx`,圣遗物 → `player.artifact.xxx`。
8. **行动顺序按 `CHARACTERS[id].speed` 在开局排序一次。** speed 降序（大=先动）,同速按创建顺序;`player.uid` 是稳定身份,`index` 只是渲染序。

## 行为准则 — 信息不足时必须追问（最重要）

**绝对禁止在信息不完整时猜测或假设。** 以下情况必须停下来追问用户，不继续执行：

1. **Bug 报告太模糊** — 用户只说「XX 有 bug」但没有给错误日志、复现步骤、预期/实际行为。追问：「请提供控制台报错或 `[game]` 日志，并描述预期行为 vs 实际行为」
2. **功能需求不明确** — 用户说「加一个新角色」但没给技能名称、效果、数值。追问：「新角色的技能是什么？效果数值？是否有使用次数限制？」
3. **多个可能原因时** — bug 有 2 个以上可能的原因时，不要赌一个去改。列出所有假设，追问用户或读日志排除后再改。
4. **第一次听说的问题** — 用户描述的问题不在已修复 Bug 列表或你的认知范围内，先追问细节，不要直接动手。

**好的提问示范：**

> 「你说的『攻击伤害不对』，具体是哪个角色攻击哪个目标？伤害值预期多少、实际多少？控制台 `[game]` 日志里 `damage_calc` 那行输出是什么？」

**善用question** — 不确定的地方不要猜测，question用户获得最准确的方向,不用担心question太多,有疑问无上限问

## 改动完成前的自检（逐项确认，不允许沉默跳过）

1. **修 bug → 先写一条会失败的复现测试**；完成 = 它变绿 + 全量测试全绿
   - 例外：CSS / 视觉 / 文案类可豁免，但必须在 `docs/KNOWN_BUGS.md` 条目里注明「视觉类，无自动化测试」
2. 修 bug → `docs/KNOWN_BUGS.md` 加一条，写明测试文件 + 用例名
3. 新增角色/单位 → 只改 `src/game/characters/index.js` 的角色表；新代码按 `characterId` 判断，不写角色名字面量
4. 新增内容数据 → 放 `src/data/*.json`，遵守 schema
5. 改完跑 `npm run test`（含结构护栏 `src/game/guard/`：分层依赖 + 目标解析单一入口）

## 护栏规则

- 结构护栏与功能测试冲突时，**以功能测试为准 + 立即上报**；两边都不许自行改
- 新增豁免需用户批准
- 禁止删除 / skip / 弱化 `src/game/guard/` 下的测试

## 任务结束必须报告

读取 N 文件 / N 行、补读 N 次、测试 N 次（红→绿）、返工 N 次

## 架构

| 层       | 目录                 | 职责                                                                                                                                                                              |
| -------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 纯逻辑   | `src/game/`        | `core`(牌/随机/玩家/单位)+`rules`(加成/伤害/陷阱/联盟/天气)+`characters`(15 角色插件)+`flow`(ctx/pending/turn/commands)+`modes`(经典/1v1/联赛/世界杯/团战)+`persistence`;零依赖 |
| 桥接     | `src/bridge/`      | 监听只读 view → 驱动 PIXI + GSAP + 音效                                                                                                                                          |
| 渲染     | `src/pixi/`        | PixiJS v8 Application + 精灵 + 布局 + 粒子                                                                                                                                        |
| 控制器   | `src/composables/` | useGameController / useLeagueController / useWorldCupController / useBrawlController(建房、存档、模式编排)                                                                                             |
| 爬塔     | `src/solo/`        | 单机模式（logic/ 纯逻辑 + useSoloController + SoloShell）                                                                                                                         |
| 音频     | `src/audio/`       | SoundManager 音效播放（由`src/game/soundEvents.js` 触发）                                                                                                                       |
| UI       | `src/components/`  | Vue 3 组件（ActionBar、League*/WorldCup* 系列等）                                                                                                                                 |

**参考文档**

| 文档 | 内容 |
| --- | --- |
| [docs/classic-refactor-plan.md](docs/classic-refactor-plan.md) | 内核速查：分层/状态模型/加成顺序/加角色步骤/常见坑 + **§13 文件地图 · §14 PIXI 桥接 · §15 渲染字段 · §16 日志事件表** |
| [docs/KNOWN_BUGS.md](docs/KNOWN_BUGS.md) | 修复记录 + 回归测试索引 + **关键陷阱（改 `src/game/`、`src/pixi/`、`src/bridge/` 前先扫一眼）** + 结构债 |
| [docs/solo-roguelike-design.md](docs/solo-roguelike-design.md) | 单机模式设计 |
| [docs/simuniverse-design.md](docs/simuniverse-design.md) | 模拟宇宙设计（**已下线**，留作重做参考） |

## 游戏模式

| 模式     | 入口                               | 逻辑文件                                             | 说明                                                                                                                                                                                                  |
| -------- | ---------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 经典对战 | `App.vue` gameMode               | `src/game/flow/commands.js` + `modes/classic.js` | 2-8 人扑克对战，选角色 + 天气                                                                                                                                                                         |
| 世界杯   | `App.vue` wcStarted              | `src/game/worldCup.js` + `modes/match.js`        | 小组赛 A-H → 淘汰赛 R16/QF/SF/Final；常规 90 回合 + 加时 30；点球先得 5 分、每方抽 2 张                                                                                                              |
| 联赛     | `App.vue` leagueStarted          | `src/game/league.js` + `modes/league.js`         | 10 支英超球队，tier 1-3（🏆争冠/⚔️欧战/🛡️保级）；每场 4 回合和平期；3V3 围攻/补给/名次积分；队标`public/team-badges/{teamId}.png`                                                               |
| 3v3 团战 | `App.vue` gameMode='brawl'       | `src/game/modes/brawl.js` + `useBrawlController.js` | 双方各 3 英雄 + 5 塔（10 HP）；前 4 回合和平期；Ban/Pick 15 角色；5 回合复活；60 回合按拆塔/存活/总血量判定；AI/同屏双人；DOM 渲染；存档走 `dead13_save` |
| 单机     | `App.vue` gameMode='solo'        | `src/solo/logic/solo.js`                           | 技能卡肉鸽：章节爬塔/抽3选2/事件检定/商店营地（DOM 渲染）                                                                                                                                             |
| 娱乐模式 | `App.vue` gameMode='dicewar'     | `src/game/diceWar.js` + `diceWarCommentator.js`  | 骰子战争世锦赛：16 人（原神8+崩铁8）随机配对淘汰；每局 30 轮先/后手各掷 2~12，每 10 轮段间对比，平局加赛；决赛七局四胜；每 10 轮 AI 解说（密钥存 `dead13_ai_settings`，浏览器直连 LLM，无本地兜底） |

1v1 比赛由 `modes/match.js` 在经典内核之上叠加:进球、每命重置、换人、加时、点球。
模式差异全部写在各自 adapter 的 `rules` 字段里(`peaceRounds / attackGate / alliance / besiege` 等),不再靠 context 是否存在隐式切换。

## 游戏状态机

```
PHASE: SETUP → PEACE(前N回合禁攻) → NORMAL(战斗) → GAME_OVER
PENDING:  action | target(purpose) | gambleSetup | scryOrder | liniya | saveOrLoad
STEP:     由 pending 派生 = pickAction / attackShowCard / skillPickTarget / gamblePick /
          skillNahida / liniyaPick / caiyueangPick / allyPick
```

- **唯一的「等待玩家作答」载体是 `state.pending`**;`state.step` 只是它的派生字符串,供 ActionBar 的 `v-if` 与动画桥接使用。
- `pending.asker` 是 uid,`pending.options` 是可选目标 uid 列表,`pending.purpose` 是语义标签(`attack` / `ally` / `skill:aimiliya.freeze` …),UI/AI 都读它,不再判 `_fenjinHeal` 之类私有 flag。
- 取消待决 = `dispatch({ type: "cancel" })`。

## 调试工具

| 工具                    | 用途                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run test`        | 276 条 vitest 测试（23 文件：core/flow/rules/modes/persistence/api + 差分回放 + TableLayout + 角色/团战 v3.5 + solo + diceWar + guard），< 2s |
| 手动跑 test             | 改`src/game/*` 后必须跑 `npm run test`（项目无自动 hook，靠自觉）                                                       |
| `window.__PIXI_APP__` | 浏览器控制台访问 PIXI Application 内部状态                                                                                  |
| `[game]` 日志         | 结构化 JSON；开关与事件表见 `docs/classic-refactor-plan.md` §16                                                          |

## 内核入口与命令(取代旧的 gameState.js 导出)

| 入口                                                                                                          | 说明                                     |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `createSession({ state, chars, weather, startRound, teamIds, mode })`                                       | 建房:initGame + ctx + turn engine + mode |
| `dispatch(state, command)`                                                                                  | **唯一写入口**                     |
| `buildView(state)`                                                                                          | 只读 view-model(UI/PIXI/AI 都读它)       |
| `save(state)` / `load(state, data, { modeFactory })`                                                      | 存档 v4                                  |
| `createClassicMode()` / `createMatchMode()` / `createLeagueMatchMode()` / `createWorldCupMatchMode()` | 模式适配器                               |

命令一览(`dispatch` 的 `type`):

| type | 参数 | 说明 |
| ----------------------------- | --------------------------------------------------------------------------- | -------------------------- |
| `attack` / `attackTarget` | `targetUid` | 摸牌进入待决 → 选目标结算 |
| `defense` / `defenseTarget` | `targetUid`（团战支援） | 抽防御牌；团战可选自己/队友/己方塔 |
| `gamble` / `gambleSubmit` / `gambleTarget` | `trapIdx, baitIdx` / `targetUid` | 赌命；团战可把陷阱布置给队友/塔 |
| `skill` / `skillAnswer` | `answer`(目标 uid 或 `{targetUid, subSkill}` / 排序数组 / `{choice}`) | 技能与作答 |
| `ally` / `allyTarget` | `targetUid` | 结盟 |
| `betray` | — | 背刺 |
| `holyWord` | — | 圣言自明 |
| `cancel` | — | 取消待决 |

## 历史坑与查表

已修复的坑、PIXI 层陷阱、字段映射细节、文件地图、日志事件表**全部在 docs**（见上方参考文档）。

- 改 `src/game/`、`src/pixi/`、`src/bridge/` 前 → 先扫 `docs/KNOWN_BUGS.md` 的「关键陷阱」
- 改内核结构 / 加角色 / 调伤害顺序 → 读 `docs/classic-refactor-plan.md`

代码注释里的「为什么」优先于文档；文档与代码冲突时**以代码为准，并顺手修文档**。

## Notes

- 拟定方案后先由用户审批
- 尽可能避免硬编码
