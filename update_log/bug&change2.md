## 已收集的bug

### player.characterId=="raiden"时，技能释放异常

世界杯模式下，技能释放时变成"fenjin"的技能

log:

```
尼日利亚 行动
  │ {
  │   "hp": 11,
  │   "defCount": 3,
  │   "hasTrap": true,
  │   "skillUses": 1,
  │   "allyIndex": null
  │ }
ℹ [11:45:36.593] [INFO] [技能] [回合69] 尼日利亚 尼日利亚 释放技能: 无想的一刀
  │ {
  │   "characterId": "raiden",
  │   "skillUsesBefore": 1
  │ }
ℹ [11:45:37.566] [INFO] [技能] [回合69] 尼日利亚 风堇重见澄澈晴空: 生命上限11→14 回复3 伤害=6
  │ {
  │   "maxHpChange": "11→14",
  │   "healAmount": 3,
  │   "damage": 6,
  │   "target": "阿根廷",
  │   "targetHpBefore": 11
  │ }
● [11:45:37.567] [DEBUG] [伤害] [回合69] 尼日利亚 对 阿根廷 造成 6 伤害
  │ {
  │   "hpBefore": 11,
  │   "defCount": 4,
  │   "damage": 6
  │ }
```

### 天气系统消失

世界杯模式下击杀对手（得分）后天气系统消失

如下日志中回合11天气系统消失

log:

```
ℹ [21:20:58.203] [INFO] [天气] [回合10] 巴西 天气: 烈日当空
  │ {
  │   "weather": "sun",
  │   "nextWeather": "calm"
  │ }
● [21:20:58.203] [DEBUG] [状态] [回合10] l 轮到 l 行动
  │ {
  │   "hp": 9,
  │   "defCount": 0,
  │   "hasTrap": false,
  │   "skillUses": 3,
  │   "allyIndex": null
  │ }
ℹ [21:20:58.679] [INFO] [攻击] [回合10] l l 攻击抽牌: 4♦ (4)
  │ {
  │   "cardId": "♦-4",
  │   "value": 4,
  │   "deckRemaining": 83
  │ }
ℹ [21:21:00.303] [INFO] [攻击] [回合10] l l → 巴西，基础伤害=4
  │ {
  │   "attackerHp": 9,
  │   "targetHp": 12,
  │   "targetDefCount": 0,
  │   "targetHasTrap": false
  │ }
● [21:21:00.303] [DEBUG] [天气] [回合10] l 烈日当空 +2 → 6
● [21:21:00.303] [DEBUG] [伤害] [回合10] l 攻击值修正完毕: 4 → 6
  │ {
  │   "baseValue": 4,
  │   "finalValue": 6,
  │   "delta": 2
  │ }
● [21:21:00.303] [DEBUG] [伤害] [回合10] l 对 巴西 造成 6 伤害
  │ {
  │   "hpBefore": 12,
  │   "defCount": 0,
  │   "damage": 6
  │ }
● [21:21:00.303] [DEBUG] [伤害] [回合10] l 巴西 HP 12→6 (-6) damage
  │ {
  │   "playerIndex": 1,
  │   "playerName": "巴西",
  │   "from": 12,
  │   "to": 6,
  │   "delta": -6,
  │   "reason": "damage",
  │   "remaining": 6
  │ }
ℹ [21:21:00.303] [INFO] [攻击] [回合10] l 攻击结算完毕: l→巴西，目标HP: 12→6
  │ {
  │   "attackerHp": 9,
  │   "targetHp": 6,
  │   "targetAlive": true,
  │   "actualHpLost": 6,
  │   "trapTriggered": false
  │ }
● [21:21:00.303] [DEBUG] [状态] [回合10] 巴西 轮到 巴西 行动
  │ {
  │   "hp": 6,
  │   "defCount": 0,
  │   "hasTrap": false,
  │   "skillUses": null,
  │   "allyIndex": null
  │ }
ℹ [21:21:01.611] [INFO] [攻击] [回合10] 巴西 巴西 攻击抽牌: K♥ (13)
  │ {
  │   "cardId": "♥-K",
  │   "value": 13,
  │   "deckRemaining": 82
  │ }
ℹ [21:21:03.801] [INFO] [攻击] [回合10] 巴西 巴西 → l，基础伤害=13
  │ {
  │   "attackerHp": 6,
  │   "targetHp": 9,
  │   "targetDefCount": 0,
  │   "targetHasTrap": false
  │ }
● [21:21:03.802] [DEBUG] [天气] [回合10] 巴西 烈日当空 +2 → 15
● [21:21:03.802] [DEBUG] [技能] [回合10] 巴西 玛薇卡斗志 +5 → 20
● [21:21:03.802] [DEBUG] [伤害] [回合10] 巴西 攻击值修正完毕: 13 → 20
  │ {
  │   "baseValue": 13,
  │   "finalValue": 20,
  │   "delta": 7
  │ }
● [21:21:03.802] [DEBUG] [伤害] [回合10] 巴西 对 l 造成 20 伤害
  │ {
  │   "hpBefore": 9,
  │   "defCount": 0,
  │   "damage": 20
  │ }
⚠ [21:21:03.802] [WARN] [异常] [回合10] 巴西 l HP 为负值 -11，已修正为0
● [21:21:03.802] [DEBUG] [伤害] [回合10] 巴西 l HP 9→0 (-9) damage
  │ {
  │   "playerIndex": 0,
  │   "playerName": "l",
  │   "from": 9,
  │   "to": 0,
  │   "delta": -9,
  │   "reason": "damage",
  │   "remaining": 20
  │ }
ℹ [21:21:03.802] [INFO] [状态] [回合10] 巴西 l 阵亡
  │ {
  │   "round": 10,
  │   "hpBeforeDeath": 9
  │ }
ℹ [21:21:03.803] [INFO] [状态] [回合10] 巴西 比赛淘汰: 玩家0被击杀，击杀者1
  │ {
  │   "deadIdx": 0,
  │   "killerIdx": 1,
  │   "round": 10,
  │   "alivePlayers": [
  │     "巴西"
  │   ]
  │ }
ℹ [21:21:03.803] [INFO] [攻击] [回合10] 巴西 攻击结算完毕: 巴西→l，目标HP: 9→0
  │ {
  │   "attackerHp": 6,
  │   "targetHp": 0,
  │   "targetAlive": false,
  │   "actualHpLost": 9,
  │   "trapTriggered": false
  │ }
ℹ [21:21:08.683] [INFO] [防御] [回合11] l l 防御: 4♦ 4→4
  │ {
  │   "cardId": "♦-4",
  │   "originalValue": 4,
  │   "finalValue": 4,
  │   "defCount": 1,
  │   "bonuses": {
  │     "trade": 0,
  │     "fullMoon": 0,
  │     "alliance": 0
  │   }
  │ }
ℹ [21:21:09.836] [INFO] [防御] [回合11] 巴西 巴西 防御: A♥ 1→1
  │ {
  │   "cardId": "♥-A",
  │   "originalValue": 1,
  │   "finalValue": 1,
  │   "defCount": 1,
  │   "bonuses": {
  │     "trade": 0,
  │     "fullMoon": 0,
  │     "alliance": 0
  │   }
  │ }
```

## 逻辑修改(你自己判断在修改bug前执行或是之后)

- player的内部变量重构。我不清楚现有player包含的内容，所以这一项你与我讨论后得出结果
- 行动顺序逻辑重构，不再依照角色血量排序，而是制作一个行动顺序索引，每个角色映射一个数值，需要决定角色行动顺序直接查找索引，返回数值，比较数值大小得到顺序。
