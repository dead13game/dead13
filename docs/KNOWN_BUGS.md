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

## 回归测试索引

| 问题 | 测试 |
| --- | --- |
| KB-3 / KB-8 / KB-9 / KB-10 | `src/game/flow/flow.test.js` |
| KB-7 / KB-11 | `src/game/modes/match.test.js` |
| KB-1(围攻计数) | `src/game/modes/league.test.js` |
| 行为等价 | `src/game/testing/next-replay.test.js`(30 局旧基线回放) |

## 附带修复:不稳定的测试

- `solo` 的「战斗胜利后领取奖励」曾偶发失败:测试直接打空敌方 HP,但没有抹平**敌方护盾**与**随机行动力**,伤害被护盾吸收或行动力不足都会失败。已在测试里显式设置 `enemyShield = 0` / `actionPoints = 50`,连续 25 次全绿。
