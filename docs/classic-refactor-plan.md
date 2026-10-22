# 内核架构速查(经典/联赛/世界杯共用)

> 这份文档替代了重构期的长篇方案。历史阶段与取舍见 `git log`;这里只保留"改代码前必须知道的东西"。

## 1. 一句话

**规则是纯函数,状态只有一个写入口,界面只读派生视图。**

```
UI/控制器 ──dispatch(命令)──▶ flow/commands ──▶ rules / characters ──▶ state
    ▲                                                                │
    └──────────── buildView(state) 只读视图 ◀─────────────────────────┘
```

## 2. 目录

```
src/game/
  core/         cards.js rng.js player.js constants.js log.js      ← 零依赖
  rules/        modifiers.js damage.js trap.js alliance.js weather.js artifacts.js
  characters/   每角色一个模块 + index.js(registry)
  flow/         context.js pending.js turn.js commands.js setup.js
  modes/        classic.js match.js league.js worldcup.js + constants
  persistence/  schema.js save.js snapshot.js
  api.js        createSession / dispatch / save / load
  view.js       buildView(只读投影,UI 与 AI 都读它)
  index.js      门面
```

依赖方向:`modes → flow → characters → rules → core`,没有反向边。
`characters` 只依赖 `ctx` 的接口形状,不 import `flow/`。

## 3. 三个入口

| 入口 | 用途 |
| --- | --- |
| `createSession({ state, chars, weather, startRound, teamIds, mode })` | 建房:initGame + ctx + 回合引擎接线 |
| `dispatch(state, cmd)` | **唯一写入口**(命令表见 CLAUDE.md) |
| `buildView(state)` | 只读视图;UI/桥接/AI 全部读它 |
| `save(state)` / `load(state, data, { modeFactory })` | 存档 v4 |

命令处理函数自己决定是否结束行动(`ctx.turn.pass()` / `ctx.turn.extra()`),命令层不统一收尾。

## 4. 状态模型

```js
state = {
  phase: "setup" | "peace" | "normal" | "gameOver",
  pending: null | { type, purpose, asker, options, data },  // 唯一的「等待作答」
  step,                       // pending 的派生字符串,只为 UI 模板保留
  turn: { extraAction, suspend, resync, savedBy },
  players: [/* 见 §5 */],
  deck, grave, weatherDeck, currentWeather, deckCount,
  round, peaceRounds, peaceStartRound, messageLog, soundQueue, gameOver,
}
```

- **要加"某个技能要求玩家再点一下"** → 用 `ctx.ask({type:"target", purpose:"skill:xxx", ...})`,不要新增 step 或 flag。
- `state.step` 只由 `flow/pending.js#setPending` 写。
- 取消待决 = `dispatch({type:"cancel"})`。

## 5. Player 字段分区

```js
{ uid, index, characterId, name, teamId, hp, maxHp, alive,
  defensePile, trap, bait,
  resources: { skillUses, loadUses, holyWordUses, breakCount },
  effects:   { frozenBy, stealTarget, dotTarget, damageBonus, ignoreTrapThisTurn, savepoint },
  relations: { allyUid, allianceTurns, betrayalPenalty, allyKillBonus,
               consecutiveGambles, gamblePenalty, attackedThisRound },
  char: {},                                   // 角色私有状态(插件 stateSchema)
  artifact: { id, active, roundsLeft },
  ai: { enabled, difficulty } }
```

- `uid` 是稳定身份(创建顺序,换人不改);`index` 只是渲染序。
- 新字段必须先加到 `createPlayerDefaults()`,否则存档往返会丢。

## 6. 加成与伤害

```js
collectModifiers(ctx, env) → reduceModifiers(ctx, base, mods, env) → { total, steps }
applyDamage(ctx, { target, amount, cause }) → { remaining, absorbed, hpDelta, died }
```

顺序即规则(`rules/modifiers.js` 的 `PRIORITY`):
`联赛加成 → 天气 → 月相 → 斗志 → 莉奈娅加成 → 联盟 → 背刺惩罚 → 陷阱判定 → 圣遗物(×1.5/暴击) → 围攻减半 → 联盟平摊(-2 后 ÷3 向下取整)`。

- 加法可交换,**乘除与取整的位置不能动**;要插新加成,改 priority 常量并跑差分。
- 一次攻击可能产生多个受害者(陷阱反弹、盟友平摊),调用方分别调 `applyDamage`。

## 7. 加/改角色

1. 新建 `characters/xxx.js`,导出 `{ id, meta, stateSchema, canUse, use, onAnswer, hooks }`
2. 在 `characters/index.js` 的 `CHARACTER_DEFS` 里注册
3. 状态放 `player.char`(默认值写进 `stateSchema`),不要往 player 顶层加角色字段
4. UI 需要的展示字段在 `view.js#renderPlayer` 里映射
5. `canUse` = 引擎口径(必须与旧行为一致);`canUseNow` = 是否给 AI/UI 点亮,可加回合/阶段门槛

可用钩子:`onRoundStart`(带 `priority`)、`onDamageDealt`(斗志/被动回血)、`attackModifiers` / `defenseModifiers`。

## 8. 模式适配器

```js
{ id, rules: { peaceRounds, attackGate, attackMinRound, alliance, allyMinPlayers,
               besiege, blockAllyAttack },
  onNewRound(ctx, round) → "halt" | undefined,
  checkGameOver(ctx), onPlayerDeath?(ctx, p),
  serialize?(), ... }
```

- 模式差异只写在 `rules`,不要用"context 是否存在"隐式切换。
- `1v1` 的 `startNextLife(ctx)` 复用 `initGame`,保留比分/回合/天气/名字。

## 9. 存档

- 字段真相:`persistence/schema.js` 的 `STATE_FIELDS` + `createPlayerDefaults()`
- `Infinity/NaN` 会编码成字符串(6/7 号角色 `maxUses: Infinity`)
- 读档必须用 `modeFactory` 重建 mode(含函数,不可序列化)

## 10. 验证

```bash
npm run test                          # 390 条,<2s
npx vitest run src/game/testing/next-replay.test.js   # 旧基线命令回放 30 局
```

差分回放的工作方式:基线记录每条命令 + **执行前后的随机数游标**;回放时不再跑 AI,只拨游标执行命令,再逐字段比对投影 + 日志 + 音效。所以:
**多调一次/少调一次随机数、日志文案变化、音效顺序变化都会被抓到。**

## 11. 常见坑

1. 新字段漏加进 `createPlayerDefaults()` → 存档丢字段、读档后行为漂移
2. 直接在 `commands` 里 `state.step = ...` → step 与 pending 不一致
3. 在规则里 import `flow/` → 形成环;规则只能吃 `ctx` 的接口
4. 往 `canUse` 里加回合门槛 → 差分基线会红;门槛放 `canUseNow`
5. 改伤害顺序/取整 → 必须同步看 `next-replay` 是否全绿
6. `characterStateFor(id)` 返回的是共享 schema,赋值给 player 时必须 `structuredClone`
7. 联赛忘了每回合清零 `relations.attackedThisRound` → 整场被判围攻
8. 模式 hook 里直接改当前玩家 → 用 `ctx.turn.suspend/resync`,不要手改 `currentPlayerIndex`

## 12. 重构阶段(已完成)

| 阶段 | 内容 |
| --- | --- |
| P0 | 差分对拍基建 + 30 局基线(19 AI + 11 脚本) |
| P1 | `core` + `flow`(ctx / pending / step 派生) |
| P2 | `rules`(有序加成管道、伤害报告、陷阱三态、联盟、天气、圣遗物) |
| P3 | 11 个角色插件 + 回合引擎 + 命令层,旧基线回放 30/30 |
| P4 | `modes`(classic / match / league / worldcup) |
| P5 | schema 驱动存档 v4 |
| P6 | 三种模式 UI 全部切到 `dispatch` + `buildView` |
| P7 | 删除旧内核 21 个文件,更新 CLAUDE.md / KNOWN_BUGS |

---

> 以下 §13–§16 原在 `CLAUDE.md` 常驻（2026-10-22 移出）：属于**查表用**的参考资料，
> 改到对应层时再来读，不必每轮注入。

## 13. 关键文件地图

| 文件 | 说明 |
| --- | --- |
| `src/game/index.js` | 门面:只导出 api / view / characters / modes |
| `src/game/api.js` | `createSession` / `dispatch` / `save` / `load` |
| `src/game/view.js` | 只读 view-model(`renderPlayer` 映射 + 选择器) |
| `src/game/core/cards.js` | 牌/洗牌/抽牌(随机源显式传入) |
| `src/game/core/rng.js` | 唯一随机入口(种子版用于回放) |
| `src/game/core/player.js` | Player 工厂 + 字段分区默认值 |
| `src/game/core/units.js` | 英雄/塔/无人机统一查询、可攻击目标、拆塔顺序、`unitByIndexOrUid` |
| `src/game/rules/modifiers.js` | 有序加成管道(priority 即规则) |
| `src/game/rules/damage.js` | 伤害结算唯一入口(返回报告) |
| `src/game/rules/trap.js` | 陷阱三态(反弹/平局/击破) |
| `src/game/rules/alliance.js` | 结盟/平摊/解散 |
| `src/game/rules/artifacts.js` | 圣遗物 + 圣言自明 |
| `src/game/characters/*.js` | 15 个角色插件(meta/stateSchema/canUse/use/onAnswer/hooks) |
| `src/game/flow/context.js` | 显式 ctx(日志/音效/牌堆/玩家/turn 接线) |
| `src/game/flow/pending.js` | 决策模型 + step 派生 |
| `src/game/flow/turn.js` | 回合引擎(pass/extra/suspend/resync) |
| `src/game/flow/commands.js` | 全部命令(攻击/防御/赌命/技能/结盟/圣言/取消) |
| `src/game/flow/setup.js` | 局面创建与初始化 |
| `src/game/modes/*.js` | classic / match / league / worldcup / brawl 适配器 |
| `src/game/modes/brawl.js` | 3v3 团战：塔行动/复活/劣势补给/60 回合判定 |
| `src/composables/useBrawlController.js` | 团战 Ban/Pick、开局、存档、简单随机 AI 调度 |
| `src/components/BrawlShell.vue` | 团战 DOM 棋盘 UI（英雄卡/塔卡/BanPick/结算） |
| `src/game/persistence/*.js` | 存档 schema / 读写 / 菜月昴快照 |
| `src/game/league.js` | 联赛数据(球队/赛程/积分/加成) |
| `src/game/worldCup.js` | 世界杯赛程编排 |
| `src/game/ai/index.js` | AI 公共 API(读 view) |
| `src/game/ai/skilled.js` | AI 熟练难度 |
| `src/game/ai/hell.js` | AI 地狱难度(偷看牌库) |
| `src/game/ai/easy.js` | AI 简单难度 |
| `src/game/testing/next-replay.test.js` | 旧基线命令回放对拍(30 局) |
| `src/game/gameLogger.js` | 开发日志(`[game]` JSON) |
| `src/game/guard/` | 结构护栏(G3 分层依赖 / G2 目标解析) |
| `src/audio/SoundManager.js` | 音效播放 |
| `src/pixi/core/PIXIManager.js` | Application 管理 + 场景树 + 粒子 |
| `src/pixi/layout/TableLayout.js` | 自适应布局（横屏单/双行，竖屏2列） |
| `src/bridge/useAnimationFlow.js` | GSAP 动画触发 + 粒子调度 |
| `src/solo/logic/solo.js` | 单机模式状态机（地图/成长/卡组/金币/存档） |
| `src/solo/logic/soloCombat.js` | 单机战斗（抽3选2/牌堆坟场/护盾/斗志/AI） |
| `src/solo/logic/soloConstants.js` | 技能卡池 13 张 / 敌人 / 节点链 / 数值常量 |
| `src/solo/SoloShell.vue` | 单机 UI 主壳（地图/战斗/商店/事件/营地/结算） |

## 14. PIXI ↔ Vue 桥接

| 接口 | 方向 |
| --- | --- |
| `usePixiSync(view, getManager)` | view → PIXI |
| `useAnimationFlow(view, getManager)` | view → PIXI |
| `PIXIManager.buildScene(players, deckCount)` | PIXI |
| `PIXIManager.updatePlayer(index, player, isCurrent)` | PIXI |
| `GameShell.onRelayout()` | Vue → PIXI |

`view` 由 `buildView(state)` 产出：**只读派生**，不是第二份状态；写操作一律 `dispatch`。

## 15. player 渲染字段（经 view 映射）

`view.js` 的 `renderPlayer()` 把内核字段映射成 UI 读的形状，`PlayerTableSprite._updateStatus()` 依赖：
`statusEffects.frozenBy`、`relations.allyIndex`、`relations.allianceTurns`、`relations.betrayalPenalty`、
`statusEffects.stealTarget`、`statusEffects.dotTarget`、`fightingSpirit`、`statusEffects.savepoint`、
`statusEffects.extraAction`、`statusEffects.ignoreTrapThisTurn`、`relations.gamblePenalty`、`relations.consecutiveGambles`

→ **新增状态标签的顺序**：内核算字段（`effects.xxx` / `char.xxx`）→ `view.js` 映射 → `_updateStatus()`。

v3.5 新增映射：`chorus`（沃雅妮莎领唱）、`attackStreak`（薇斯纳连击）、`statusEffects.drone`（无人机 HP/盾），
以及 `towers` / `summons` / `units` / `unitByUid`（团战塔与召唤物，不影响经典 `players`）。

## 16. 开发日志事件表

所有游戏逻辑操作记录结构化日志到 `console.debug`，格式 `[game] {"ts":...,"type":"...",...}`。

```js
window.__GAME_LOG_LEVEL__ = 0; // DEBUG，所有日志
window.__GAME_LOG_LEVEL__ = 1; // INFO
window.__GAME_LOG_LEVEL__ = 2; // WARN，只看异常
// Chrome/Edge: Console 的 Filter 框输入 [game]
```

| type | 说明 | 关键字段 |
| --- | --- | --- |
| `turn_start` / `turn_end` | 回合推进 | round, playerIndex, playerName |
| `attack_start` / `attack_draw` / `attack_execute` | 攻击流程 | attackerIndex, targetIndex, cards, totalValue |
| `damage_calc` | 伤害计算 | rawValue, afterMinus2, allianceSplit |
| `hp_change` | **HP 变化（统一）** | playerIndex, from, to, delta, reason |
| `defense_start` / `defense_draw` | 防御流程 | playerIndex, cards |
| `gamble_start` / `gamble_result` | 赌命 | drawnCards, trapIdx, baitIdx |
| `trap_trigger` | 陷阱触发 | victimIndex, trapCard, trapValue |
| `skill_use` / `skill_effect` | 技能 | characterId, targetIndex, effect |
| `ally_form` / `betrayal` | 联盟/背刺 | playerA, playerB, turns |
| `weather_change` / `weather_effect` | 天气 | from, to, effect |
| `solo_*` 系列 | 单机（节点/抽牌/伤害/护盾/事件/结算） | nodeType, cardId, dmg, gold… |
| `anomaly` | **异常检测** | 伤害偏差、HP 负值、高值卡低伤害等 |

**排查示例**：打开游戏过 3 回合 → Console Filter 输入 `[game]` → 筛 `type:'damage_calc'` 查联盟分配，
筛 `type:'hp_change'` 对比 from/to 找异常扣血。

