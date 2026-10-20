# 经典模式重写方案(契约文档)

> 状态:已定稿,按 P0 → P7 实施。
> 目标读者:实现者(含未来的 AI 会话)。本文档是接口契约,不是讨论稿。

## 0. 一句话

把「step 字符串 + 路由 flag + 模块级注入 + 手抄规则」的内核,换成
**显式 ctx + pending 决策对象 + 角色插件 + 有序 modifier 管道 + schema 存档**,
并用「同 seed 逐步状态 + 事件序列」差分对拍证明规则没变。

## 1. 硬约束(用户已确认)

| 约束 | 内容 |
| --- | --- |
| 等价口径 | 逐步状态投影 + 事件序列(日志文案与顺序、音效队列)全部一致 |
| 存档 | 保留「局内退出重进」;菜月昴存档点复用同一套 schema |
| 修 bug | 重构期间**冻结**行为,已知 bug 进 `KNOWN_BUGS.md`,重构完成后再单独立项 |
| 阶段验收 | 允许中间态不可玩;每个阶段边界只需 `npm run test` 通过(编译/单测层面) |
| 内容边界 | 玩法内容(数值、技能描述、规则意图)有疑义**必须问用户**,不许猜 |

## 2. 现状病灶(带证据,重写要逐条根除)

1. **依赖环**:`combat/gamble/skills/alliance/caiyueang/artifacts` 六个模块靠 `_injectXDeps` 在 `gameState.js` 里注入 `currentPlayer/addLog/ensureDeck/endAction`;测试文件必须再注入一遍(`league.test.js:115`)。
2. **step 共享 + flag 消歧**:`skillPickTarget` 被雷神/芙宁娜/风堇/爱蜜莉雅共用,靠 `pendingFurinaTarget` / `_aimiliyaFreeze` / `_fenjinHeal` 区分,三个 Shell 各自再 if/else 一遍(`GameShell:193-205`、`LeagueShell:402`、`WorldCupShell:631`)。
3. **隐式字段**:`pendingFurinaTarget/_aimiliyaFreeze/_fenjinHeal/_liniyaSubSkill/_caiyueangMode/pendingGamble/pendingVentiCards` 全都没在 `createGameState` 声明。
4. **握手协议伪装成数据**:`_elimPaused + _elimGuard + _gameJustReset` 是内核↔控制器握手,靠「置真 → 下一条命令清掉」传递。
5. **语义反转**:`state.endTurn === false` 表示「额外行动」。
6. **规则多处副本**:加成规则在 `combat.js` 与 `ai/index.js:48` 各一份;结盟合法性在 `alliance.js` 与 `ActionBar:416-462` 各一份。
7. **player schema 三份手抄**:`serialize.js`、`deserializeGameState`、`caiyueang.js:32`。
8. **两套初始化**:`initGame` 与 `reset1v1Game`(自带 `createPlayerForMatch`)已漂移。
9. **逻辑层不纯**:`gameState.js` import `vue`;`combat.js:96` 用 `setTimeout` 翻牌;`skills.js:155` 用 `Date.now()` 造 id;随机源直接 `Math.random`。
10. **UI 反向写**:`GameShell:239-244/402` 直接改 `state.step` 与 4 个私有 flag;`DevLogPanel:221` 截断 `devLog.entries`。
11. **AI 调度三份**:`GameShell:284-437` 的 3 个 setTimeout + 2 个 watch 在 League/WorldCup Shell 里各写一遍。
12. **身份混乱**:`index` 会被 speed 重排后重写,`characterId` 被当身份用于进球判定(`matchState:61`),换人即歧义。

## 3. 目标结构

```
src/game/
  core/            ← 真零依赖(不 import vue/pixi/gsap,不用 setTimeout/Date.now)
    cards.js       牌、牌堆、抽牌、重构
    rng.js         createRng(source) —— 唯一随机源
    uid.js         nextUid()
    player.js      createPlayer / PLAYER_SCHEMA / 字段默认值
    constants.js   PHASE / STEP(兼容旧字符串)/ 天气表
  rules/           ← 纯函数(入参 ctx + 数据,出参数据或 report)
    modifiers.js   collectModifiers / reduceModifiers(有序,priority 固定)
    damage.js      applyDamage → report
    trap.js        陷阱判定(纯)
    alliance.js    结盟/背刺/平摊规则
    weather.js     天气牌堆与效果
    artifacts.js   圣遗物
  characters/      ← 每角色一个模块,无状态,可 JSON 化
    index.js       registry(id → def)
    venti.js zhongli.js ... dev.js
  flow/            ← 唯一允许改 state 的地方
    context.js     createContext
    pending.js     ask / resolve / stepOf
    turn.js        endAction / nextPlayer / roundStart
    commands.js    dispatch(ctx, command)
  modes/
    classic.js match.js league.js worldcup.js
  persistence/
    save.js        schema 驱动 serialize/deserialize
  ai/              ← P3 之后重写,只产 intent
  index.js         ← 唯一对外门面(UI 只许从这里 import)
```

依赖方向:`modes → flow → characters → rules → core`,单向。
`characters` 只依赖 `ctx` 的接口形状(鸭子类型),不 import `flow/`。

## 4. 关键接口

### 4.1 Player(player 上的字段按「事实 / 角色私有 / 效果 / 关系」分区)

```js
{
  uid: 1, index: 0,                  // uid=稳定身份; index=渲染顺序(可重排)
  characterId: 7, name: "玩家 1", teamId: -1,
  hp: 11, maxHp: 11, alive: true,
  defensePile: [], trap: null, bait: null,
  resources: { skillUses: 3, loadUses: 0, holyWordUses: 2, breakCount: 0 },
  effects: { frozenBy: null, stealTarget: null, dotTarget: null,
             damageBonus: {}, ignoreTrapThisTurn: false, savepoint: null },
  relations: { allyUid: null, allianceTurns: 0, betrayalPenalty: 0,
               allyKillBonus: false, consecutiveGambles: 0, gamblePenalty: false },
  char: {},                          // 角色私有状态槽(由 stateSchema 决定默认值)
  artifact: { id: null, active: false, roundsLeft: 0 },
  ai: { enabled: false, difficulty: null },
}
```

- `relations.allyUid` 取代 `allyIndex`(身份唯一,不受重排影响)。**联盟仍是双向冗余**(两人互存),P7 之后再评估归一。
- `moonPhase/fightingSpirit` 从 player 顶层移入 `char`(只有 7/6 号用)。
- 附带 `attackedThisRound` 移入 `relations`。

### 4.2 ctx(替代 `_injectXDeps`)

```js
const ctx = createContext(state, { rng, logger });
ctx = {
  state, rng,
  log(msg), dev(cat, msg, data), sound(key),
  deck: { draw(n), ensure(n), discard(...cards), load() },
  turn: { pass(), grantExtra(), next(), suspend(reason), resync() },
  ask(pending), clearPending(),
  player: { current(), byUid(uid), byIndex(i), alive() },
}
```

- 所有 `rules/characters/flow` 函数第一个参数都是 `ctx`。
- 测试:`createContext(state, { rng: seeded(42) })`,不需要再注入任何东西。

### 4.3 pending(替代 step + 路由 flag)

```js
pending = {
  type: "target" | "gambleSetup" | "scryOrder" | "subSkill" | "saveOrLoad" | "action",
  purpose: "skill:aimiliya.freeze" | "attack" | "ally" | "raid.target" | ...,
  asker: 2,                  // uid
  options: [0, 1, 3],        // 可选目标 uid 列表(仅 target 类)
  data: { ... },             // gamble 的牌、scry 的牌等
}
```

`stepOf(state)` 把 pending 映射回**旧字符串**(`pickAction/attackShowCard/gamblePick/skillPickTarget/skillNahida/liniyaPick/caiyueangPick/allyPick`),
这样 `usePixiSync` / `useAnimationFlow` / ActionBar 的 `v-if` 在 P6 前完全不用改。

### 4.4 角色插件(无状态、可 JSON 化)

```js
export default {
  id: 10,
  meta: { name, title, icon, hp, speed, skillName, skillType, skillDesc, maxUses, loadMaxUses },
  stateSchema: {},                        // → player.char 默认值 + 存档字段
  canUse(ctx, p) { ... },                 // 默认实现: active + 次数 + 天气 + step
  use(ctx, p) { return ctx.ask({ type: "target", purpose: "skill:aimiliya.freeze", ... }) },
  onAnswer(ctx, p, pending, answer) { ... },
  skillTargets(ctx, p) { ... },           // 默认: 其它存活玩家
  hooks: {
    onRoundStart(ctx, p) {},
    onOwnTurnStart(ctx, p) {},
    attackModifiers: [{ id, priority, apply(ctx, p, value) }],
    defenseModifiers: [],
    onDamageDealt(ctx, { attacker, target, report }) {},
    onDamaged(ctx, { target, attacker, report }) {},
    onTrapBroken(ctx, { attacker, target }) {},
    onDefenseBroken(ctx, { attacker, count }) {},
    onKill(ctx, { killer, victim }) {},
    onDeath(ctx, p) {},
  },
};
```

**禁止**:实例上存状态、用 `instanceof` 分发、用继承抽基类。

### 4.5 modifier 管道(顺序即规则)

```js
collectModifiers(ctx, { kind: "attack", source, target, base })
  → [{ id: "weather.sun", priority: 20, apply: (v) => v + 2 }, ...]   // 纯函数,可日志、可给 AI 预览
reduceModifiers(base, mods)
  → { total, steps: [{ id, before, after }] }
```

priority 常量集中在 `rules/modifiers.js`,**顺序必须复刻旧实现**:

```
10  leagueBonus(+attackBonus)
20  weather.sun            (+2)
30  moon.waxing            (+4)
40  spirit                 (+fightingSpirit)
50  liniya.bonus           (+damageBonus[target])
60  ally.attack            (+2)
70  betrayal.penalty       (+2, 目标背刺惩罚)
80  artifact.boost         (×1.5 ceil / crit ×2)   ← 陷阱判定之后
90  besiege.halving        (ceil(dmg/2))           ← 圣遗物之后
95  ... 联盟平摊(不是 modifier,是拆伤害:先 -2 再 /3 floor,盟友吃 floor,目标吃余数)
```

### 4.6 伤害结算

```js
applyDamage(ctx, { target, amount, cause, tags })
  → { absorbed, hpDelta, died, events: [...] }
```

- 只做:防御牌消耗 → 扣血 → clamp → 死亡处理 → 入墓 → 联盟解散 → 模式回调。
- 加成**不进这里**;一切加成在 `collectModifiers/reduceModifiers` 里算完。
- 多受害者(陷阱反弹、盟友平摊)由调用方拆成多次 `applyDamage`,顺序复刻旧实现。

### 4.7 回合推进

```js
state.turn = { extraAction: false, suspend: null, resync: false }
```

- `suspend`: 取代 `_elimPaused`(由 `damage.js` 在淘汰时设置,`endAction` 见到即消费并 return)。
- `resync`: 取代 `_gameJustReset`。
- `extraAction`: 取代 `endTurn === false`。
- 模式回调统一为 `mode.on(event)`:`onRoundStart` / `onPlayerDeath` / `onTeamWipe` / `onPlayerEliminated` / `onRoundLimit`。

### 4.8 存档

- `PLAYER_SCHEMA` + 各角色 `stateSchema` → 自动生成 `toJSON/fromJSON`,不再手抄字段。
- 新存档 `version: 4`;旧存档按约定作废(不做迁移)。
- 菜月昴存档点 = `snapshot(state)`(同 schema),读档 = `restore(state, snapshot)`。

## 5. 等价投影定义(差分对拍比什么)

**比**(逐条命令后快照):
- 每个 player:uid,index,characterId,name,teamId,hp,maxHp,alive,防御牌(id/value/defenseValue/isShield),trap/bait(id/value/faceUp),resources,effects,relations,char,artifact
- deck/grave/weather:长度 + 每张牌 id/value(顺序敏感)
- round,phase,step,currentPlayerIndex,gameOver,winnerIndex,pending(归一化)
- `messageLog` 新增行(顺序)
- `soundQueue` 新增项(顺序)

**不比**:
- `devLog`(调试用)、`pendingAttackCard.faceUp`(纯视觉)、盾牌 id 的时间后缀、`_skipAnim` 等纯控制流内部量。

## 6. 阶段与验收

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0 | 差分基建:种子 RNG、无头驱动、投影、基线 fixture 录制 | 同 seed 跑两遍字节级一致;`npm run test` 绿 |
| P1 | `core/` + `flow/context.js` + `flow/pending.js` | 单测:ctx 可测、pending→step 映射 |
| P2 | `rules/`(modifier/damage/trap/alliance/weather/artifacts) | 单测覆盖加成顺序与取整;差分绿 |
| P3 | `characters/` 12 个插件 + `flow/turn.js` + `commands.js` | 差分绿(经典 4/6/8 人局) |
| P4 | `modes/`(classic/match/league/worldcup) | 差分绿(联赛整轮 + 世界杯小组赛→决赛) |
| P5 | `persistence/` | 存档→读档→继续,差分绿 |
| P6 | UI 收敛(取消反向写、AI 调度单例、selector 收口) | `npm run build` + 手动抽检 |
| P7 | 删除旧实现、更新 CLAUDE.md、`KNOWN_BUGS.md` | 全量测试 + 差分 + 构建 |

基线 fixture 必须在 **P1 动手前**从当前实现录制完成(`src/game/testing/fixtures/`)。

## 6.5 实施进度

| 阶段 | 状态 | 证据 |
| --- | --- | --- |
| P0 差分基建 | ✅ | 30 局基线(19 AI + 11 脚本)/ 1961 命令 / 176KB gz;`replay.test.js` 30 绿 |
| P1 core + flow | ✅ | 26 条单测;`step` 成为 pending 派生量 |
| P2 rules | ✅ | 19 条单测(加成顺序/取整/防御消耗/陷阱三态/平摊) |
| P3 角色 + 引擎 | ✅ | 11 个角色插件;`next-replay.test.js` **30/30**,1961 条命令逐步一致 |
| P4 modes | ✅ | 三种适配器;模式单测 25 条;1v1 完整一命集成测试通过 |
| P5 persistence | ✅ | 存档 v4 + schema 驱动;6 条单测(pending 还原/Infinity 编码/比赛进度) |
| P6 UI 收敛 | ⬜ | — |
| P7 删旧 + 文档 | ⬜ | — |

P4 补充说明:

- `league.js` / `worldCup.js`(赛程、积分、抽签)**暂不迁移**——它们是纯数据编排,不依赖内核;
  P6 重写控制器时再决定搬到 `modes/`,避免无谓 churn。
- 联赛/世界杯的「进入下一命/下一场」不再由 UI 手动 `reset1v1Game`,而是
  `mode.startNextLife(ctx)` / `mode.skipSubstitution(ctx)`,内部复用 `initGame`。
- 模式级规则全部进 `rules` 字段(`peaceRounds / attackGate / attackMinRound / alliance / besiege / blockAllyAttack`),
  不再用「context 是否存在」隐式切换。

回放对拍的工作方式(重要):

1. 基线录制时同时记录**每条命令执行前后的随机数游标**(`rngBefore` / `rngAfter`)与整局随机序列。
2. 新内核回放时不再跑 AI 决策,只按记录的命令执行,并把随机游标拨到 `rngBefore`。
3. 于是洗牌、暴击等内部随机结果与旧实现逐位一致 —— 任何多调用/少调用一次随机数都会立刻暴露。

## 7. 已知 bug(冻结,重构后再修)

| ID | 现象 | 位置 |
| --- | --- | --- |
| KB-1 | 联赛和平期不稳定:首场 4 回合、后续 0 回合 | `gameState.js:261` vs `useLeagueController.js:153/185` |
| KB-2 | 取消技能后 `_fenjinHeal` 写 null 无效,后续目标选择仍路由到风堇 | `GameShell.vue:242` vs `skills.js:302/335` |
| KB-3 | `canUseSkill` 不检查回合门槛(温迪/雷神 10 回合、芙宁娜 4 回合),AI 空转靠 300ms 兜底 | `skills.js:36` vs `:123/186/264` |
| KB-4 | 防御吸收时误报「高值卡低伤害」 | `combat.js:487` |
| KB-5 | `reset1v1Game` 与 `initGame` 双初始化已漂移(缺 `attackedThisRound`、不清 `_gameJustReset`) | `matchState.js:217` |
| KB-6 | `onRoundLimit` 无存在性判断,有 `maxRounds` 无该方法即 TypeError | `gameState.js:394` |
| KB-7 | 用 `characterId` 当身份判定进球,换人/同角色对手时歧义 | `matchState.js:61`、`worldCup.js:262` |
| KB-8 | 牌库与墓地同时为空时 `executeDefense`/`startAttack` 读到 `undefined` 崩溃(4 人局即可复现:104 张牌全压进防御区) | `combat.js:591-593` |
| KB-9 | 菜月昴 AI 死循环:存档不限次且不结束回合,`canUseSkill` 对 id=11 不看 `skillUses` → 无限「存档」 | `skills.js:39`、`caiyueang.js:142` |
| KB-10 | 菜月昴读档会清空自己的存档点(`deepCloneState` 把 savepoint 置 null 后又整体覆盖回去) | `caiyueang.js:40/60` |
| KB-11 | 换人只重置 characterId/hp/skillUses,角色私有状态(斗志/月相)残留在新角色上 | `matchState.js:348-353` |
| KB-12 | `startPenaltyShootout` 置 `matchOver=true`,而 `executePenaltyRound` 又要求 `!matchOver`,控制器只能每轮手动改回 false | `matchState.js:133/373`、`useWorldCupController.js:517` |

## 7.5 本次重构中执行的规则修正(非等价,用户已确认)

这两条**不遵循等价原则**,是对现有错误行为的修正。因此**联赛模式不参与严格差分对比**,
改为「单测 + 脚本化场景测试 + 人工抽检」;经典模式与世界杯 1v1 仍走严格差分。

| ID | 变更 | 旧行为 | 新行为 |
| --- | --- | --- | --- |
| DC-1 | 联赛和平期 | 首场 4 回合、后续 0 回合(依赖 context 安装时机) | 每场固定 4 回合和平期(`peaceRounds: 4`) |
| DC-2 | 联赛/世界杯结盟 | 6 人局满足 `players.length >= 4` 即可跨队结盟/背刺 | 联赛/世界杯禁用 `allyStart/allyTarget/betray`,仅经典模式可用 |

补充确认(与现状一致,不改):

- 角色 12「myracler(开发者)」→ 注册表标 `modes: ["simuniverse"]`,经典/联赛/世界杯选角列表不出现。
- 世界杯每条命重置后重新 4 回合和平期 → 有意设计,保留。

## 8. 风险

1. **取整与顺序**:所有 `Math.floor/ceil` 的位置都是规则。P2 用「旧实现录制的基线」逐局兜住。
2. **AI 覆盖不到的分支**:结盟/背刺/圣言自明/菜月昴读档,`easy` AI 不会触发。P0 需额外录制**脚本化命令序列**(手写命令回放),否则这些路径无基线。
3. **联赛/世界杯**:`context` 是规则开关而不仅是回调,重写时若只保留回调,PEACE/围攻/友军免伤/cardBonus 会静默变化。
4. 回滚:每阶段一个 commit,P0 基线在仓库里,任何阶段失败可回退并且仍有等价性证据。
