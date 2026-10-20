# KNOWN_BUGS — 重构期间冻结、待单独修复的问题

> 本次「经典模式重写」以**行为等价**为门禁:旧实现里的 bug 在重构阶段被原样保留,
> 以免「重构」与「改规则」混在一起无法验证。下面按状态列出。
>
> 状态:**已修** = 重构顺带消除; **待修** = 行为仍与旧实现一致,需要单独立项。

| ID | 现象 | 状态 | 位置 / 说明 |
| --- | --- | --- | --- |
| KB-1 | 联赛和平期不稳:首场 4 回合、后续 0 回合(依赖 context 安装时机) | ✅ 已修 | 每场固定 `peaceRounds: 4`(DC-1) |
| KB-2 | 取消技能后 `_fenjinHeal` 清理无效,后续目标选择被路由到风堇 | ✅ 已修 | 由 `pending.purpose` + `dispatch({type:"cancel"})` 取代 |
| KB-3 | `canUseSkill` 不检查回合门槛(温迪/雷神 10 回合、芙宁娜 4 回合),AI 选中后被拒、空转 | ⏳ 待修 | `characters/venti.js` `use()` 内才检查;`canUse` 仍是 `baseCanUse` |
| KB-4 | 「高值卡低伤害」误报:防御牌吸收伤害时也报警 | ⏳ 待修 | `flow/commands.js` 的 anomaly 分支未检查 `defenseConsumed` |
| KB-5 | `initGame` 与 `reset1v1Game` 两套初始化漂移 | ✅ 已修 | 统一走 `initGame` + `modes/match.startNextLife` |
| KB-6 | `onRoundLimit` 无存在性判断,有 `maxRounds` 却未提供会 TypeError | ✅ 已修 | mode hook 可选链;联赛适配器始终提供 |
| KB-7 | 用 `characterId` 当身份判定进球/恢复名字,换人后或同角色对手时歧义 | ⏳ 待修 | `modes/match.js` 仍按 `characterId` 判进球 |
| KB-8 | 牌库+墓地同时为空时抽牌拿到 `undefined` 崩溃 | ⏳ 部分 | 防御已兜底(记录异常并返回),`attack()` 仍会崩 |
| KB-9 | 菜月昴 AI 死循环:存档不限次且不结束回合 | ⏳ 待修 | `characters/caiyueang.js` `canUse` 只看是否有 pending |
| KB-10 | 读档会清空自己的存档点(`deepCloneState` 置 null 后被整体覆盖) | ⏳ 待修 | `persistence/snapshot.js` 按旧行为保留 |
| KB-11 | 换人只换角色/血量/技能次数,角色私有状态(斗志/月相)残留 | ⏳ 待修 | `modes/match.executeSubstitution` |
| KB-12 | `startPenaltyShootout` 置 `matchOver=true`,导致点球无法推进,控制器每轮手动改回 false | ✅ 已修 | `modes/match.executePenaltyRound` 不再依赖 `matchOver` |

## 修复这些 bug 的建议顺序

1. **KB-9**(AI 死循环,会直接卡死对局)
2. **KB-8**(资源耗尽崩溃,长局必现)
3. **KB-3**(AI 空转,靠 300ms 兜底掩盖,影响手感与日志)
4. **KB-7**(身份歧义,换人/同角色对局时进球算错)
5. 其余(KB-4 / KB-10 / KB-11)为体验或数据准确性问题

修复时请同步补测试:每个 KB 至少一条回归用例,并更新本文档状态列。
