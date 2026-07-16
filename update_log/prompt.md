## 任务：为亡命十三街创建结构化游戏逻辑日志系统

### 背景

当前项目没有运行时可读的游戏逻辑日志。出 bug（伤害计算错误、攻击目标错误、回合异常）时无从排查。需要一个零依赖的日志模块放在 `src/game/` 中，在所有关键操作点记录结构化日志。

### 设计约束

- **必须放在 `src/game/`** — 纯逻辑层，零依赖，不引用 Vue/PIXI/浏览器 API
- **输出到浏览器 console** — 用 `console.debug`（生产环境可被过滤）
- **每行一个 JSON 对象** — 方便 `JSON.parse` 和 Playwright 抓取
- **统一前缀 `[game]`** — 方便 `console.filter` 筛选

### 日志模块设计

创建 `src/game/gameLogger.js`，导出以下内容：

```js
// 日志等级：debug < info < warn
export const LogLevel = { DEBUG: 0, INFO: 1, WARN: 2 }

// 全局日志等级，可通过 window.__GAME_LOG_LEVEL__ 动态调整
let currentLevel = LogLevel.DEBUG

export function setLogLevel(level) { currentLevel = level }

// 核心函数：记录一条结构化日志
export function gameLog(type, data, level = LogLevel.DEBUG) {
  if (level < currentLevel) return
  const entry = {
    ts: Date.now(),       // 时间戳，方便追踪时序
    type,                 // 事件类型（见下方清单）
    ...data               // 事件数据
  }
  console.debug(`[game] ${JSON.stringify(entry)}`)
}

必须覆盖的事件类型和字段

每个事件类型都要有明确的 type 字段和关键数据字段。以下是完整清单：

回合与阶段
回合推进:     { type: 'turn_start',    round, playerIndex, playerName, phase, step }
回合结束:     { type: 'turn_end',      round, playerIndex, playerName, nextPlayerIndex }
阶段切换:     { type: 'phase_change',  from, to, round }
步骤切换:     { type: 'step_change',   from, to, playerIndex, playerName }
游戏结束:     { type: 'game_over',     winnerIndex, winnerName, round, reason }

攻击流程（最重要）
开始攻击:     { type: 'attack_start',  attackerIndex, attackerName }
抽攻击牌:     { type: 'attack_draw',   attackerIndex, cards, totalValue }
选择目标:     { type: 'attack_target', attackerIndex, targetIndex, targetName, targetAllyIndex }
伤害计算:     { type: 'damage_calc',   rawValue, afterMinus2, allianceSplit,
                                        mainTarget: {index, damage}, allyTarget: {index, damage} }
攻击执行:     { type: 'attack_execute',attackerIndex, targetIndex, damage,
                                        targetHpBefore, targetHpAfter, targetAlive }
攻击结果:     { type: 'attack_result', targetIndex, damage, hpLoss, killed }

防御
防御开始:     { type: 'defense_start', playerIndex, playerName }
防御抽牌:     { type: 'defense_draw',  playerIndex, cards }
防御放置:     { type: 'defense_place', playerIndex, defenseCount }

赌命
赌命开始:     { type: 'gamble_start',  playerIndex }
赌命选牌:     { type: 'gamble_cards',  playerIndex, drawnCards, trapIdx, baitIdx }
陷阱触发:     { type: 'trap_trigger',  victimIndex, victimName, trapCard, trapValue, baitCard, baitValue }
赌命结果:     { type: 'gamble_result', victimIndex, success, damage }

技能（每个角色一个 type）
技能使用:     { type: 'skill_use',     characterId, playerIndex, playerName, skillName, targetIndex }
技能效果:     { type: 'skill_effect',  characterId, playerIndex, effect, value, targetIndex }

HP 变化（所有来源统一用这个）
HP变化:       { type: 'hp_change',     playerIndex, playerName, from, to, delta, reason }
                                        // reason: 'attack'|'defense'|'gamble'|'skill'|'dot'|'heal'|'weather'|'betrayal'

状态效果
状态添加:     { type: 'status_add',    playerIndex, status, duration, source }
状态移除:     { type: 'status_remove', playerIndex, status }
状态触发:     { type: 'status_tick',   playerIndex, status, remainingTurns, effect }

结盟/背刺
结盟请求:     { type: 'ally_invite',   fromIndex, fromName, toIndex, toName }
结盟确认:     { type: 'ally_form',     playerA, playerB, turns }
背刺执行:     { type: 'betrayal',      betrayerIndex, betrayedIndex, penalty }

天气
天气切换:     { type: 'weather_change',from, to, round, effect }
天气效果:     { type: 'weather_effect', weatherName, affectedPlayers, effect }

AI 行动（如果有）
AI决策:       { type: 'ai_decision',   playerIndex, action, reason, targets }

抽牌/墓地
牌库抽牌:     { type: 'deck_draw',     playerIndex, cards, remaining }
墓地重构:     { type: 'grave_reshuffle', graveCount, newDeckCount }

接入点

在 gameState.js 的以下函数中添加日志调用（只需在关键位置加一行）：

createGameState()    → 不记（初始化）
nextPlayer()         → turn_end + turn_start + phase_change
startAttack()        → attack_start + attack_draw
executeAttack()      → damage_calc + attack_execute + hp_change + attack_result
executeDefense()     → defense_start + defense_draw + defense_place
executeGamble()      → gamble_start + gamble_cards + trap_trigger + hp_change
executeSkill()       → skill_use + skill_effect + hp_change
各角色技能函数        → skill_use + skill_effect + status_add + hp_change
executeAlly()        → ally_form
executeBetray()      → betrayal + hp_change
applyWeather()       → weather_change + weather_effect
applyDot()           → status_tick + hp_change(delta<0)
startAttack()        → attack_start + attack_draw
executeAttack()      → damage_calc + attack_execute + hp_change + attack_result
executeDefense()     → defense_start + defense_draw + defense_place
executeGamble()      → gamble_start + gamble_cards + trap_trigger + hp_change
executeSkill()       → skill_use + skill_effect + hp_change
各角色技能函数        → skill_use + skill_effect + status_add + hp_change
executeAlly()        → ally_form
executeBetray()      → betrayal + hp_change
applyWeather()       → weather_change + weather_effect
applyDot()           → status_tick + hp_change(delta<0)
reshuffleFromGrave() → grave_reshuffle

实现步骤

1. 创建 src/game/gameLogger.js — 核心日志模块（约40行）
2. 在 src/game/gameState.js 中 import { gameLog } from './gameLogger.js'
3. 在关键函数中插入日志调用（优先覆盖：攻击流程、HP变化、回合推进）
4. 暴露 window.__GAME_LOG_LEVEL__ 用于动态控制日志等级

使用方式

开发者调试：
// 浏览器控制台
window.__GAME_LOG_LEVEL__ = 0  // DEBUG，所有日志
window.__GAME_LOG_LEVEL__ = 1  // INFO，只看关键操作
window.__GAME_LOG_LEVEL__ = 2  // WARN，只看异常

Playwright/Claude Code 自动检查：
// 读所有日志
const logs = await page.evaluate(() => {
  // 拦截 console.debug，收集 [game] 日志
})
// 按 type 筛选
const hpChanges = logs.filter(l => l.type === 'hp_change')
const attacks = logs.filter(l => l.type === 'damage_calc')
// 验证
attacks.forEach(a => {
  if (a.afterMinus2 !== a.rawValue - 2) console.error('伤害计算错误', a)
})

Claude Code 排查 bug 时：

▎ 「用 Playwright 打开游戏，选4人，过3回合，读所有 [game] 日志，筛选 type:'damage_calc' 检查联盟伤害分配是否正确」

---
```
