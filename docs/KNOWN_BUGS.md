# KNOWN_BUGS — 重构期间冻结、已逐条修复的问题

> 本次「经典模式重写」以**行为等价**为门禁,旧实现的 bug 在重构阶段先原样保留,
> 重构完成后再逐条修。下表是修复记录(2026-10 收尾)。

| ID | 现象 | 状态 | 修复方式 |
| --- | --- | --- | --- |
| KB-1 | 联赛和平期不稳:首场 4 回合、后续 0 回合 | ✅ 已修 | 每场固定 `peaceRounds: 4`(DC-1) |
| KB-2 | 取消技能后 `_fenjinHeal` 清理无效,目标选择被路由到风堇 | ✅ 已修 | 由 `pending.purpose` + `dispatch({type:"cancel"})` 取代 |
| KB-3 | `canUseSkill` 不检查回合门槛,AI 选中后被拒、空转 | ✅ 已修 | 拆成两个口径:`canUseSkill`(引擎,保持旧行为)/ `canUseSkillNow`(UI/AI,含回合与阶段门槛);三个 Shell 的 AI 在技能不可用时改防御 |
| KB-4 | 「高值卡低伤害」误报:防御牌吸收伤害时也报警 | ✅ 已修 | 仅在 `beforeDefense === 0` 时才判定异常 |
| KB-5 | `initGame` 与 `reset1v1Game` 两套初始化漂移 | ✅ 已修 | 统一走 `initGame` + `modes/match.startNextLife` |
| KB-6 | `onRoundLimit` 无存在性判断会 TypeError | ✅ 已修 | mode hook 可选链;联赛适配器始终提供 |
| KB-7 | 用 `characterId` 当身份判定进球/恢复名字 | ✅ 已修 | 比赛模式改用稳定 `uid`(`playerUid/opponentUid`),换人与同角色对局不再歧义 |
| KB-8 | 牌库+墓地同时为空时抽牌拿到 `undefined` 崩溃 | ✅ 已修 | `ctx.deck.ensure` 墓地也空时按开局副数重新生成牌库并记 anomaly;攻击/赌命补兜底 |
| KB-9 | 菜月昴 AI 死循环(存档无限且不结束回合) | ✅ 已修 | 同一回合只允许存一次档(`turn.savedBy`,UI/AI 口径);引擎口径保持旧行为以兼容差分基线 |
| KB-10 | 读档清空自己的存档点;且读档恢复计数导致「3 次」永不消耗 | ✅ 已修 | 读档后重新挂回存档点;`loadUses` 按读档前的剩余值 -1 |
| KB-11 | 换人后角色私有状态(斗志/月相)残留 | ✅ 已修 | 换人时 `player.char = structuredClone(characterStateOf(newId))` |
| KB-12 | 点球需要手动把 `matchOver` 改回 false 才能推进 | ✅ 已修 | `executePenaltyRound` 不再依赖 `matchOver` |

## v3.5 修复与新增（2026-10）

| ID | 现象 | 状态 | 修复方式 |
| --- | --- | --- | --- |
| VB-1 | 经典/世界杯天气随机洗牌，无法预期 | ✅ 已修 | 固定 6 天气循环：烈日→暴雨→狂风→黑市→军备→晴朗；联赛同步开启 |
| VB-2 | 世界杯淘汰赛对手从全量池随机 | ✅ 已修 | R16/QF/SF+Final 三份名单；避开本届已交手球队 |
| VB-3 | 世界杯淘汰后没有总结，总结后还能继续下一轮 | ✅ 已修 | `matchHistory` 记录整届战绩；出局/夺冠立即进 `tournamentSummary`，仅返回主菜单 |
| VB-4 | 联赛本轮结果全部显示「胜」，没有主客场 | ✅ 已修 | `主队（主） 胜/负/平 客队（客）` |
| VB-5 | 联赛积分榜顶部轮次总是少一轮 | ✅ 已修 | `countPlayedRounds` 统计玩家实际已赛轮次 |
| VB-6 | 联赛 `currentRound` / `_currentRound` 不同步，18 轮后仍进 draft | ✅ 已修 | 两字段同步；`isLeagueFinished` 兼容两个字段 |
| VB-7 | 附加赛选完人后点不动 | ✅ 已修 | `startMatchWithDraft` 在 `_isTiebreaker` 时走 `startTiebreakerMatch` |
| VB-8 | 无同分时仍然进入 tournamentEnd 页面 | ✅ 已修 | 无同分：最终积分榜「返回主菜单」；有同分才开附加赛 |
| VB-9 | 圣遗物在陷阱之后结算，与「总伤害比陷阱」规则冲突 | ✅ 已修 | `artifact.boost` 移入 `ATTACK_MODIFIERS`（陷阱前）；`POST_TRAP` 只剩围攻 |
| VB-10 | 新角色/无人机/塔缺少统一目标与伤害入口 | ✅ 已修 | `core/units.js` + `ctx.units`；塔/无人机独立数组，不进 PIXI 经典牌桌 |
| VB-11 | 团战战报栏不滚动，长局看不到最新日志 | ✅ 已修 | `battle-log` 固定高度 + `overflow-y:auto` + `flex:0 0 auto`；自动滚到最新一行 |
| VB-12 | 团战没有和平期，第一回合就能攻击/塔就砸人 | ✅ 已修 | `peaceRounds: 4`、`attackGate:"phase"`；和平期塔群待命，第 5 回合开战 |
| VB-13 | 团战陷阱显示真实陷阱点数 | ✅ 已修 | UI 改显示诱饵点数（`unit.bait.value`）；真实陷阱牌始终隐藏，塔/支援陷阱无诱饵显示「陷阱 ?」 |
| VB-14 | 团战摸牌无动画、抽到的牌不显示 | ✅ 已修 | 新增 `drawFeed/drawSeq`；抽牌 toast 动画 + 团战攻击牌明牌；AI 摸牌不公开 |
| VB-15 | 团战防御区显示总护盾值，双方都能算出防御点数 | ✅ 已修 | 只显示防御牌张数；仅最新一张残盾显示剩余值（`maxDefenseValue`）；防御摸牌动画保持暗牌 |
| VB-16 | 陷阱给队友/塔后显示「陷阱 ?」，看不到诱饵点数 | ✅ 已修 | 陷阱牌携带 `decoyValue`；给队友/塔时沿用施放者的诱饵点数，诱饵实体仍留在施放者处 |

### v3.5 新角色

| id | 角色 | 机制 |
| --- | --- | --- |
| 13 | 砂狼白子 | 主动 2 次部署无人机（5 HP / 3 伤害 / 无陷阱 / 吃天气圣遗物）；召唤当回合不能做别的；主人阵亡一起消失 |
| 14 | 橘雪梨 | 普攻变「调查」：猜陷阱点数，猜中拆陷阱 + 20 伤害；猜错无事；无陷阱则 7 点普攻 |
| 15 | 沃雅妮莎 | 防御 +1 领唱；自己的防御牌被击破 +1；主动消耗全部（单次≤20）每层 1 伤害 |
| 16 | 薇斯纳 | 连续攻击第 3/4/5+ 次 ×1.5/×2/×3（保底 10/15/20）；非攻击操作/冻结中断 |

### v3.5 团战

- 新增 `modes/brawl.js`、`BrawlShell.vue`、`useBrawlController.js`；6 英雄 + 每队 5 塔、5 回合复活、60 回合判定、防御/陷阱支援、劣势补给。
- 塔：必须按 1→5 拆；己方塔 ≥3 → 2 点 / <3 → 3 点，打敌方全体英雄+无人机；塔吃天气与围攻减半，不吃劣势补给。
- AI：团战只保留简单随机 AI（用户要求暂时取消熟练/地狱）。

### 回归测试索引（v3.5）

| 问题 | 测试 |
| --- | --- |
| 天气 / 圣遗物乘区 / 新角色 / 防御与陷阱支援 | `src/game/characters/v35.test.js`、`src/game/flow/v35-flow.test.js`、`src/game/rules/rules.test.js` |
| 世界杯名单与积分 | `src/game/worldCup.test.js` |
| 联赛轮次/同分/附加赛 | `src/game/league.test.js`、`src/composables/useLeagueController.test.js` |
| 团战塔/复活/60 回合 | `src/game/modes/brawl.test.js` |
| 团战 Ban/Pick/存档 | `src/composables/useBrawlController.test.js` |

## 回归测试索引

| 问题 | 测试 |
| --- | --- |
| KB-3 / KB-8 / KB-9 / KB-10 | `src/game/flow/flow.test.js` |
| KB-7 / KB-11 | `src/game/modes/match.test.js` |
| KB-1(围攻计数) | `src/game/modes/league.test.js` |
| 行为等价 | `src/game/testing/next-replay.test.js`(30 局旧基线回放) |

## 附带修复:不稳定的测试

- `solo` 的「战斗胜利后领取奖励」曾偶发失败:测试直接打空敌方 HP,但没有抹平**敌方护盾**与**随机行动力**,伤害被护盾吸收或行动力不足都会失败。已在测试里显式设置 `enemyShield = 0` / `actionPoints = 50`,连续 25 次全绿。
