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
