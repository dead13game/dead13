import { reactive } from 'vue'
import { PHASE, STEP, CHARACTERS, MOON_PHASES, MOON_NAMES } from './constants.js'
import { createFullDeck, shuffleDeck, drawCards, reshuffleFromGrave, cardDisplay } from './deck.js'

/** 创建玩家对象 */
function createPlayer(index, charData, name) {
  return {
    index,
    name: name || `玩家 ${index + 1}`,
    characterId: charData.id,
    characterName: charData.name,
    characterTitle: charData.title,
    characterIcon: charData.icon,
    hp: charData.hp,
    maxHp: charData.hp,
    alive: true,
    defensePile: [],
    trap: null,       // 陷阱区盖牌
    bait: null,       // 陷阱区诱饵（明牌）
    // 技能状态
    skillUses: charData.maxUses,
    skillName: charData.skillName,
    skillDesc: charData.skillDesc,
    skillType: charData.skillType,
    maxUses: charData.maxUses,
    // 玛薇卡：斗志
    fightingSpirit: 0,
    // 哥伦比娅：月相
    moonPhase: 0, // 0=弦月 1=满月 2=新月
    // 芙宁娜：本回合是否已触发无视陷阱
    ignoreTrapThisTurn: false,
    // 纳西妲/芙宁娜等：已废弃，改用 state.endTurn
    extraAction: false,
    // 天气已处理标记
    weatherProcessed: false,
    // 菜月昴：读档次数
    loadUses: 3,
    loadMaxUses: 3,
    // 莉奈娅：偷取/DoT
    stealTarget: null,    // { idx, turns }
    dotTarget: null,      // { idx, turns }
    damageBonus: {},      // { [targetIdx]: bonus } 永久伤害加成
    // 爱蜜莉雅：冻结
    frozenBy: null,       // 被谁冻结（有值=跳过下次行动）
    // 菜月昴：存档
    savepoint: null,
    // 联盟
    allyIndex: null,         // 盟友 index
    allianceTurns: 0,        // 盟约剩余回合
    betrayalPenalty: 0,      // 背刺惩罚剩余回合
    allyKillBonus: false     // 盟友击杀奖励待触发
  }
}

/** 创建游戏状态 */
export function createGameState() {
  return reactive({
    players: [],
    currentPlayerIndex: 0,
    phase: PHASE.SETUP,
    step: STEP.PICK_ACTION,
    deck: [],
    grave: [],
    weatherDeck: [],
    currentWeather: null,
    nextWeather: null,
    round: 0,
    messageLog: [],
    gameOver: false,
    winnerIndex: -1,
    // 通用：执行完行动后是否推进到下一玩家（false=留在当前玩家）
    endTurn: true,
    // 用于查看牌库顶（纳西妲）
    scryCards: null,
    pendingAttackCard: null,
    pendingVentiCards: null,
    // 游戏配置
    useWeather: false
  })
}

/** 添加日志 */
function log(state, msg) {
  state.messageLog.push(msg)
}

/** 初始化游戏 */
export function initGame(state, playerChars, useWeather = false) {
  Object.assign(state, {
    players: [],
    currentPlayerIndex: 0,
    phase: PHASE.SETUP,
    step: STEP.PICK_ACTION,
    deck: [],
    grave: [],
    weatherDeck: [],
    currentWeather: null,
    nextWeather: null,
    round: 0,
    messageLog: [],
    gameOver: false,
    winnerIndex: -1,
    scryCards: null,
    pendingAttackCard: null,
    pendingVentiCards: null,
    endTurn: true,
    useWeather
  })

  // 创建牌库（两副牌）
  state.deck = shuffleDeck(createFullDeck(2))

  // 创建玩家
  playerChars.forEach((charId, i) => {
    const charData = CHARACTERS.find(c => c.id === charId)
    if (charData) {
      state.players.push(createPlayer(i, charData))
    }
  })

  // 开局按血量排序一次（血量少先行动，同血量原编号小的先）
  state.players.sort((a, b) => {
    if (a.hp !== b.hp) return a.hp - b.hp
    return a.index - b.index
  })
  state.players.forEach((p, i) => { p.index = i })

  // 设置天气牌堆
  if (useWeather) {
    setupWeatherDeck(state)
  }

  state.phase = PHASE.PEACE
  state.peaceRounds = state.players.length
  state.round = 1
  state.step = STEP.PICK_ACTION

  log(state, `亡命十三街开始`)
  log(state, `角色：${state.players.map(p => p.characterName).join(' · ')}`)
  log(state, `行动顺序：${state.players.map(p => p.name).join(' → ')}`)
  log(state, `和平发育（第1-2回合禁止攻击）`)
}

/** 设置天气牌堆 */
function setupWeatherDeck(state) {
  const weatherCards = [
    'calm', 'calm', 'calm', 'calm',
    'wind', 'trade', 'sun', 'rain', 'arms'
  ]
  state.weatherDeck = shuffleDeck(weatherCards.map(id => ({ id })))
}

/** 抽天气（顺序翻顶放底） */
function drawWeather(state) {
  if (!state.useWeather) return null
  if (state.weatherDeck.length === 0) return null
  // 翻顶部
  const w = state.weatherDeck.shift()
  state.weatherDeck.push(w) // 放回底部
  state.currentWeather = w.id
  // 预取下一张
  state.nextWeather = state.weatherDeck.length > 0 ? state.weatherDeck[0].id : null
  return w.id
}

/**
 * 统一行动结束出口
 * endTurn=true  → 进入下一位玩家
 * endTurn=false → 留在当前玩家，重置行动步骤
 */
function endAction(state) {
  if (state.endTurn) {
    state.endTurn = true
    nextPlayer(state)
  } else {
    state.endTurn = true
    state.step = STEP.PICK_ACTION
    log(state, `${currentPlayer(state).name} 获得额外行动`)
  }
}

/** 推进到下一玩家 */
function nextPlayer(state) {
  let next = state.currentPlayerIndex + 1
  while (next < state.players.length && !state.players[next].alive) {
    next++
  }

  if (next >= state.players.length || !state.players[next]?.alive) {
    // 新回合
    state.round++
    next = 0
    while (next < state.players.length && !state.players[next].alive) {
      next++
    }

    // 切换阶段
    if (state.phase === PHASE.PEACE && state.round > state.peaceRounds) {
      state.phase = PHASE.NORMAL
      log(state, `第${state.round}回合 战斗开始`)
    } else {
      log(state, `------ 第${state.round}回合 ------`)
    }

    // 天气
    if (state.useWeather) {
      drawWeather(state)
      const weatherName = state.currentWeather
      const wData = { calm: '风和日丽', wind: '狂风呼啸', trade: '黑市交易', sun: '烈日当空', rain: '暴雨倾盆', arms: '军备竞赛' }
      log(state, `${wData[weatherName]}`)
      if (weatherName === 'rain') {
        // 暴雨倾盆：所有人防御区弃顶部1张
        for (const p of state.players) {
          if (p.alive && p.defensePile.length > 0) {
            const discarded = p.defensePile.pop()
            state.grave.push(discarded)
            log(state, `${p.name} 防御牌被暴雨冲走`)
          }
        }
      }
    }

    // 哥伦比娅月相轮换
    for (const p of state.players) {
      if (p.alive && p.characterId === 'columbina') {
        p.moonPhase = (p.moonPhase + 1) % 3
        log(state, `哥伦比娅月相 ${MOON_NAMES[p.moonPhase]}`)
      }
    }

    // 联盟回合处理
    for (const p of state.players) {
      if (!p.alive) continue
      // 盟约递减
      if (p.allianceTurns > 0) {
        p.allianceTurns--
        if (p.allianceTurns <= 0) {
          // 解除联盟
          const ally = state.players.find(a => a.index === p.allyIndex)
          if (ally) { ally.allyIndex = null; ally.allianceTurns = 0 }
          p.allyIndex = null
          log(state, `${p.name} 联盟到期`)
        }
      }
      // 背刺惩罚递减
      if (p.betrayalPenalty > 0) {
        p.betrayalPenalty--
        if (p.betrayalPenalty <= 0) {
          log(state, `${p.name} 背刺惩罚结束`)
        }
      }
      // 盟友击杀奖励
      if (p.allyKillBonus && p.allyIndex !== null) {
        p.allyKillBonus = false
        log(state, `${p.name} 盟友击杀奖励：立即执行一次防御或赌命`)
        // 给予一次额外操作机会（设为不结束回合的效果）
        state.endTurn = false
        // 这里在下一次 endAction 时会让该玩家留在回合
      }
    }

    // 莉奈娅被动：回合开始处理偷取和DoT
    for (const p of state.players) {
      if (!p.alive) continue

      // DoT：每回合5伤害无视陷阱
      if (p.dotTarget && p.dotTarget.turns > 0) {
        const target = state.players.find(t => t.index === p.dotTarget.idx)
        if (target?.alive) {
          log(state, `${target.name} 受到莉奈娅DoT 5点伤害（无视陷阱）`)
          applyDamage(state, target, 5)
          p.dotTarget.turns--
          if (p.dotTarget.turns <= 0) p.dotTarget = null
        } else {
          p.dotTarget = null
        }
      }

      // 偷取防御牌
      if (p.stealTarget && p.stealTarget.turns > 0) {
        const target = state.players.find(t => t.index === p.stealTarget.idx)
        if (target?.alive && target.defensePile.length > 0) {
          const stolen = target.defensePile.pop()
          stolen.faceUp = true
          p.defensePile.push(stolen)
          log(state, `${p.name} 偷取了 ${target.name} 的防御牌`)
        }
        p.stealTarget.turns--
        if (p.stealTarget.turns <= 0) p.stealTarget = null
      }
    }

    checkGameOver(state)
  }

  if (!state.gameOver && state.players[next]?.alive) {
    state.currentPlayerIndex = next
    const p = currentPlayer(state)

    // 爱蜜莉雅冻结：跳过本次行动
    if (p.frozenBy !== null) {
      log(state, `${p.name} 被冻结，跳过行动`)
      p.frozenBy = null
      nextPlayer(state)
      return
    }

    state.step = STEP.PICK_ACTION
    // 重置芙宁娜状态
    p.ignoreTrapThisTurn = false
    log(state, `当前 ${p.name} 行动`)
  }
}

/** 当前玩家 */
export function currentPlayer(state) {
  return state.players[state.currentPlayerIndex]
}

/** 存活玩家 */
export function alivePlayers(state) {
  return state.players.filter(p => p.alive)
}

/** 检查游戏结束 */
function checkGameOver(state) {
  const alive = alivePlayers(state)
  if (alive.length <= 1) {
    state.gameOver = true
    state.winnerIndex = alive[0]?.index ?? -1
    state.phase = PHASE.GAME_OVER
    if (alive.length === 1) {
      log(state, `${alive[0].name} 获胜`)
    } else {
      log(state, `全员阵亡`)
    }
  }
}

/** 对一名玩家造成伤害（处理防御结算、扣血、死亡） */
function applyDamage(state, player, damage) {
  let remaining = damage

  // 防御判定
  while (remaining > 0 && player.defensePile.length > 0) {
    const top = player.defensePile[player.defensePile.length - 1]
    if (!top.faceUp) top.faceUp = true

    if (top.value >= remaining) {
      top.value -= remaining
      remaining = 0
      if (top.value === 0) {
        player.defensePile.pop()
        if (!top.isShield) state.grave.push(top)
        log(state, `${player.name} 防御牌抵消`)
      } else {
        log(state, `${player.name} 残盾 ${top.value}点`)
      }
    } else {
      remaining -= top.value
      log(state, `${player.name} 防御牌 ${cardDisplay(top)} 被击穿`)
      player.defensePile.pop()
      if (!top.isShield) state.grave.push(top)
    }
  }

  // 扣血
  if (remaining > 0) {
    player.hp -= remaining
    log(state, `${player.name} HP ${player.hp}`)

    if (player.hp <= 0) {
      player.alive = false
      player.hp = 0
      log(state, `${player.name} 阵亡`)

      // 联盟击杀奖励：告知击杀者的盟友
      // 注：这里不知道谁是击杀者，需要在调用处处理
      // 通过 state._lastKiller 追踪

      // 丢弃所有牌入墓地（护盾牌除外）
      ;[...player.defensePile, player.trap, player.bait].filter(Boolean).filter(c => !c.isShield).forEach(c => state.grave.push(c))
      player.defensePile = []
      player.trap = null
      player.bait = null
      // 死亡时解除联盟
      if (player.allyIndex !== null) {
        const ally = state.players.find(a => a.index === player.allyIndex)
        if (ally) { ally.allyIndex = null; ally.allianceTurns = 0 }
        player.allyIndex = null
      }
      checkGameOver(state)
    }
  }

  return remaining
}

// ===== 攻击 =====

/** 开始攻击：先抽牌展示，再选目标 */
export function startAttack(state) {
  if (state.step !== STEP.PICK_ACTION) return
  if (state.phase === PHASE.PEACE || state.round < 4) {
    log(state, `第4回合后才能攻击`)
    return
  }

  if (state.deck.length === 0) {
    state.deck = reshuffleFromGrave(state.grave)
    state.grave = []
    log(state, `牌库重构`)
  }

  const r = drawCards(state.deck, 1)
  const card = r.drawn[0]
  state.deck = r.remaining
  card.faceUp = false  // 先背面朝上

  state.pendingAttackCard = card
  state.step = STEP.ATTACK_SHOW_CARD
  log(state, `${currentPlayer(state).name} 攻击 摸出${cardDisplay(card)}`)

  // 动画进行到一半时翻牌
  setTimeout(() => {
    if (state.pendingAttackCard === card) {
      card.faceUp = true
    }
  }, 320)
}

/** 取消攻击：弃掉已抽到的牌 */
export function cancelAttack(state) {
  if (state.step !== STEP.ATTACK_SHOW_CARD) return
  // 回收温迪技能抽出的双牌
  if (state.pendingVentiCards) {
    state.pendingVentiCards.forEach(c => state.grave.push(c))
    state.pendingVentiCards = null
  } else if (state.pendingAttackCard) {
    // 回收普通攻击牌
    state.grave.push(state.pendingAttackCard)
  }
  state.pendingAttackCard = null
  state.step = STEP.PICK_ACTION
}

/** 执行攻击（使用已抽好的 pendingAttackCard） */
export function executeAttack(state, targetIdx) {
  const attacker = currentPlayer(state)
  const target = state.players.find(p => p.index === targetIdx)
  if (!target?.alive) return

  let attackValue
  let attackCards = []

  // 使用已抽好的攻击牌
  const card = state.pendingAttackCard
  state.pendingAttackCard = null
  if (!card) return

  // 温迪技能：用真实的双卡替换
  if (state.pendingVentiCards) {
    attackCards = state.pendingVentiCards
    attackValue = attackCards[0].value + attackCards[1].value
    state.pendingVentiCards = null
    log(state, `${attacker.name} 千风之诗 ${cardDisplay(attackCards[0])} ${cardDisplay(attackCards[1])}`)
  } else {
    attackCards = [card]
    attackValue = card.value
    log(state, `${attacker.name} 攻击 ${target.name}`)
  }

  // 天气：烈日当空 +2
  if (state.currentWeather === 'sun') {
    attackValue += 2
    log(state, `烈日当空`)
  }

  // 哥伦比娅弦月 +4
  if (attacker.characterId === 'columbina' && attacker.moonPhase === 0) {
    attackValue += 4
    log(state, `弦月加持`)
  }

  // 玛薇卡斗志
  if (attacker.characterId === 'mavuika' && attacker.fightingSpirit > 0) {
    attackValue += attacker.fightingSpirit
    log(state, `斗志 ${attacker.fightingSpirit}层`)
  }

  // 莉奈娅永久伤害加成
  if (attacker.characterId === 'liniya' && attacker.damageBonus[targetIdx] > 0) {
    attackValue += attacker.damageBonus[targetIdx]
    log(state, `永久伤害+${attacker.damageBonus[targetIdx]}`)
  }

  // 联盟攻击加成（背叛时不享受）
  if (attacker.allyIndex !== null && attacker.allianceTurns > 0 && attacker.betrayalPenalty <= 0) {
    attackValue += 2
    log(state, `联盟攻击+2`)
  }
  // 打背刺者伤害+2
  if (attacker !== target && target.betrayalPenalty > 0) {
    attackValue += 2
    log(state, `惩罚背刺者+2`)
  }

  // 陷阱判定
  let trapTriggered = false
  const hadTrap = !!target.trap  // 风堇被动用
  if (target.trap && !attacker.ignoreTrapThisTurn) {
    target.trap.faceUp = true
    const trapValue = target.trap.value
    log(state, `${target.name} 触发陷阱`)

    if (attackValue < trapValue) {
      // 反弹伤害
      log(state, `陷阱反弹 ${attacker.name}`)
      state.grave.push(target.trap)
      if (target.bait) state.grave.push(target.bait)
      target.trap = null
      target.bait = null
      trapTriggered = true
      applyDamage(state, attacker, trapValue)
      attackCards.forEach(c => state.grave.push(c))
      if (!state.gameOver) endAction(state)
      return
    } else if (attackValue === trapValue) {
      // 平局：双方都受伤
      log(state, `陷阱平局双方受伤`)
      state.grave.push(target.trap)
      if (target.bait) state.grave.push(target.bait)
      target.trap = null
      target.bait = null
      trapTriggered = true
      applyDamage(state, attacker, trapValue)
      applyDamage(state, target, trapValue)
      // 玛薇卡：即使平局也算击破陷阱
      if (attacker.characterId === 'mavuika') {
        attacker.fightingSpirit = Math.min(5, attacker.fightingSpirit + 1)
        log(state, `斗志 ${attacker.fightingSpirit}层`)
      }
      attackCards.forEach(c => state.grave.push(c))
      if (!state.gameOver) endAction(state)
      return
    } else {
      log(state, `陷阱被破`)
      // 玛薇卡获得斗志
      if (attacker.characterId === 'mavuika') {
        attacker.fightingSpirit = Math.min(5, attacker.fightingSpirit + 1)
        log(state, `斗志 ${attacker.fightingSpirit}层`)
      }
      state.grave.push(target.trap)
      if (target.bait) state.grave.push(target.bait)
      target.trap = null
      target.bait = null
    }
  }

  // 联盟平摊（陷阱未触发时）
  if (!trapTriggered && target.allyIndex !== null && target.allianceTurns > 0) {
    const ally = state.players.find(p => p.index === target.allyIndex)
    if (ally && ally.alive && ally.index !== attacker.index) {
      const allyDmg = Math.floor(attackValue / 3)
      attackValue -= allyDmg  // 目标只承受剩余2/3
      log(state, `联盟平摊：${target.name} ${attackValue}点, ${ally.name} ${allyDmg}点`)
      applyDamage(state, ally, allyDmg)
    }
  }

  // 防御判定
  const beforeDefense = target.defensePile.length
  const remainingDmg = applyDamage(state, target, attackValue)
  
  // 玛薇卡：如果击穿了防御
  const defenseConsumed = beforeDefense - target.defensePile.length
  if (attacker.characterId === 'mavuika' && defenseConsumed > 0 && !trapTriggered) {
    attacker.fightingSpirit = Math.min(5, attacker.fightingSpirit + defenseConsumed)
    log(state, `斗志 ${attacker.fightingSpirit}层`)
  }

  // 联盟击杀奖励
  if (!target.alive && attacker.allyIndex !== null) {
    const ally = state.players.find(p => p.index === attacker.allyIndex)
    if (ally?.alive) {
      ally.allyKillBonus = true
      log(state, `${ally.name} 获得联盟击杀奖励`)
    }
  }

  // 风堇被动：每消耗对方陷阱/防御牌回复1点生命
  if (attacker.characterId === 'fenjin') {
    let healCount = 0
    if (hadTrap && !trapTriggered) healCount++  // 陷阱被破（不是反弹/平局）
    healCount += defenseConsumed
    if (healCount > 0) {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + healCount)
      log(state, `${attacker.name} 风堇被动回复 ${healCount} 点（当前 HP ${attacker.hp}）`)
    }
  }

  attackCards.forEach(c => state.grave.push(c))
  if (attacker.ignoreTrapThisTurn) {
    attacker.ignoreTrapThisTurn = false
  }

  if (!state.gameOver) endAction(state)
}


// ===== 防御 =====

/** 执行防御 */
export function executeDefense(state) {
  if (state.step !== STEP.PICK_ACTION) return
  const player = currentPlayer(state)

  if (state.deck.length === 0) {
    state.deck = reshuffleFromGrave(state.grave)
    state.grave = []
  }

  const r = drawCards(state.deck, 1)
  const card = r.drawn[0]
  state.deck = r.remaining

  // 天气：黑市交易 +2
  let cardValue = card.value
  if (state.currentWeather === 'trade') {
    cardValue += 2
      }

  // 哥伦比娅满月 +3
  if (player.characterId === 'columbina' && player.moonPhase === 1) {
    cardValue += 3
  }

  // 联盟防御+2
  if (player.allyIndex !== null && player.allianceTurns > 0 && player.betrayalPenalty <= 0) {
    cardValue += 2
    log(state, `联盟防御+2`)
  }

  // 直接修改value（不影响原始卡）
  card.value = cardValue
  card.faceUp = false
  player.defensePile.push(card)
  log(state, `${player.name} 执行防御`)

  state.step = STEP.PICK_ACTION
  endAction(state)
}

// ===== 赌命 =====

/** 执行赌命 */
export function executeGamble(state) {
  if (state.step !== STEP.PICK_ACTION) return
  const player = currentPlayer(state)

  if (state.deck.length === 0) {
    state.deck = reshuffleFromGrave(state.grave)
    state.grave = []
  }

  // 基础抽2张
  let drawCount = 2
  // 哥伦比娅新月 +1
  if (player.characterId === 'columbina' && player.moonPhase === 2) {
    drawCount = 3
      }
  // 天气狂风呼啸 +1
  if (state.currentWeather === 'wind') {
    drawCount += 1
      }

  const r = drawCards(state.deck, drawCount)
  const drawn = r.drawn.map(c => ({ ...c, faceUp: true }))
  state.deck = r.remaining

  log(state, `${player.name} 执行赌命 摸出${drawn.map(cardDisplay).join(' ')}`)

  // 需要玩家手动选择陷阱和诱饵
  state.step = STEP.GAMBLE_PICK
  state.pendingGamble = { drawnCards: drawn }
}

/** 提交赌命选择（玩家选哪个盖陷阱，哪个明诱饵） */
export function submitGamble(state, trapIdx, baitIdx) {
  if (state.step !== STEP.GAMBLE_PICK) return
  const player = currentPlayer(state)
  const cards = state.pendingGamble?.drawnCards
  if (!cards || trapIdx === baitIdx) return

  const trapCard = cards[trapIdx]
  const baitCard = cards[baitIdx]

  // 丢弃旧的
  if (player.trap) state.grave.push(player.trap)
  if (player.bait) state.grave.push(player.bait)

  trapCard.faceUp = false
  player.trap = trapCard
  baitCard.faceUp = true
  player.bait = baitCard

  // 多余的弃掉
  cards.forEach((c, i) => {
    if (i !== trapIdx && i !== baitIdx) state.grave.push(c)
  })

  log(state, `${player.name} 设陷阱 诱饵${cardDisplay(baitCard)}`)

  state.pendingGamble = null
  state.step = STEP.PICK_ACTION
  endAction(state)
}

// ===== 角色技能 =====

/** 检查玩家在当前状态下是否能释放技能 */
export function canUseSkill(state, player) {
  if (!player.alive) return false
  if (player.skillType !== 'active') return false
  // 菜月昴存档回溯无限使用
  if (player.characterId === 'caiyueang') return state.step === STEP.PICK_ACTION
  if (player.skillUses <= 0) return false

  // 军备竞赛禁止技能
  if (state.currentWeather === 'arms') return false

  return state.step === STEP.PICK_ACTION
}

/** 释放技能入口 */
export function executeSkill(state) {
  if (state.step !== STEP.PICK_ACTION) return
  const player = currentPlayer(state)
  if (!canUseSkill(state, player)) return false

  switch (player.characterId) {
    case 'venti':     return startSkillVenti(state)
    case 'zhongli':   return executeSkillZhongli(state)
    case 'raiden':    return executeSkillRaiden(state)
    case 'nahida':    return startSkillNahida(state)
    case 'furina':    return executeSkillFurina(state)
    case 'fenjin':    return executeSkillFenjin(state)
    case 'liniya':    return executeSkillLiniya(state)
    case 'aimiliya':  return executeSkillAimiliya(state)
    case 'caiyueang': return executeSkillCaiyueang(state)
    default: return false
  }
}

/** 温迪·千风之诗：转为攻击模式，标记技能触发 */
function startSkillVenti(state) {
  const player = currentPlayer(state)
  if (state.phase === PHASE.PEACE) {
    log(state, `和平阶段禁止攻击`)
    return
  }
  if (state.round < 10) {
    log(state, `第10回合后才能使用`)
    return
  }

  if (state.deck.length < 2) {
    state.deck = state.deck.concat(reshuffleFromGrave(state.grave))
    state.grave = []
  }

  const r = drawCards(state.deck, 2)
  const cards = r.drawn.map(c => ({ ...c, faceUp: false }))
  state.deck = r.remaining

  state.pendingVentiCards = cards
  state.pendingAttackCard = { ...cards[0], value: cards[0].value + cards[1].value, faceUp: true }
  state.step = STEP.ATTACK_SHOW_CARD
  player.skillUses--
  log(state, `${player.name} 千风之诗 ${cardDisplay(cards[0])} ${cardDisplay(cards[1])}`)

  // 翻牌
  cards.forEach(c => c.faceUp = true)
}

/** 钟离·坚如磐石：获得 18 + 已损失生命值×2 的护盾 */
function executeSkillZhongli(state) {
  const player = currentPlayer(state)
  const lostHp = player.maxHp - player.hp
  const shieldValue = 18 + lostHp * 2
  const shield = { id: `shield-zhongli-${Date.now()}`, suit: '', rank: '盾', value: shieldValue, faceUp: true, isShield: true }
  player.defensePile.push(shield)
  player.skillUses--
  log(state, `${player.name} 释放坚如磐石 护盾${shieldValue}点`)
  endAction(state)
  return true
}

/** 雷电将军·无想的一刀：造成27点伤害 */
function executeSkillRaiden(state) {
  const player = currentPlayer(state)
  if (state.phase === PHASE.PEACE) {
    log(state, `和平阶段禁止攻击`)
    return
  }
  if (state.round < 10) {
    log(state, `第10回合后才能使用`)
    return
  }
  state.step = STEP.SKILL_PICK_TARGET
  log(state, `${player.name} 释放无想的一刀`)
}

/** 执行雷电将军技能（选目标后） */
export function executeRaidenSkill(state, targetIdx) {
  const attacker = currentPlayer(state)
  const target = state.players.find(p => p.index === targetIdx)
  if (!target?.alive) return

  attacker.skillUses--

  let damage = 27
  // 天气
  if (state.currentWeather === 'sun') damage += 2
  // 玛薇卡
  if (attacker.characterId === 'mavuika' && attacker.fightingSpirit > 0) {
    damage += attacker.fightingSpirit
      }

  log(state, `${attacker.name} 无想的一刀 ➜ ${target.name}`)
  applyDamage(state, target, damage)
  attacker.ignoreTrapThisTurn = false
  if (!state.gameOver) endAction(state)
}

/** 纳西妲·智慧之殿堂：查看牌库顶5张并排序 */
function startSkillNahida(state) {
  const player = currentPlayer(state)
  if (state.deck.length < 5) {
    state.deck = reshuffleFromGrave(state.grave)
    state.grave = []
  }
  const r = drawCards(state.deck, 5)
  state.scryCards = r.drawn.map(c => ({ ...c, faceUp: true }))
  state.deck = r.remaining

  player.skillUses--
  state.step = STEP.SKILL_NAHIDA
  log(state, `${player.name} 释放智慧之殿堂`)
}

/** 提交纳西妲排序（orderArr = [顶, 中, 底] 牌索引） */
export function submitNahidaScry(state, orderArr) {
  if (state.step !== STEP.SKILL_NAHIDA || !state.scryCards) return
  const cards = orderArr.map(i => state.scryCards[i])
  // 按 底→中→顶 顺序入牌库（最后入的在顶部，最先被抽到）
  cards.reverse()
  cards.forEach(c => { c.faceUp = false })
  state.deck.push(...cards)
  state.scryCards = null

  log(state, `${currentPlayer(state).name} 牌库顶重排`)
  state.endTurn = false
  state.step = STEP.PICK_ACTION
  endAction(state)
}

/** 芙宁娜·审判：选择目标交换陷阱明暗，获得无视陷阱buff和额外行动 */
function executeSkillFurina(state) {
  const player = currentPlayer(state)
  if (state.phase === PHASE.PEACE) {
    log(state, `和平阶段禁止攻击`)
    return
  }
  if (state.round < 4) {
    log(state, `第4回合后才能攻击`)
    return
  }
  player.ignoreTrapThisTurn = true
  player.skillUses--
  state.pendingFurinaTarget = true
  state.step = STEP.SKILL_PICK_TARGET
  log(state, `${player.name} 释放审判，选择要交换陷阱的目标`)
}

/** 执行芙宁娜技能：交换目标陷阱明暗，获得额外行动 */
export function executeFurinaSwap(state, targetIdx) {
  const player = currentPlayer(state)
  const target = state.players.find(p => p.index === targetIdx)
  if (!target?.alive) return

  // 交换陷阱和诱饵的明暗
  const temp = target.trap
  target.trap = target.bait
  target.bait = temp
  if (target.trap) target.trap.faceUp = false
  if (target.bait) target.bait.faceUp = true

  state.pendingFurinaTarget = false
  state.endTurn = false
  log(state, `${target.name}的陷阱明暗交换`)
  endAction(state)
}

// ===== 风堇·重见澄澈晴空 =====

function executeSkillFenjin(state) {
  const player = currentPlayer(state)
  if (state.phase === PHASE.PEACE) {
    log(state, `和平阶段禁止攻击`)
    return
  }
  player.skillUses--
  state.step = STEP.SKILL_PICK_TARGET
  state._fenjinHeal = null  // 将在选目标后计算
  log(state, `${player.name} 释放重见澄澈晴空`)
}

export function executeFenjinSkill(state, targetIdx) {
  const player = currentPlayer(state)
  const target = state.players.find(p => p.index === targetIdx)
  if (!target?.alive) return

  const oldMaxHp = player.maxHp
  player.maxHp += 3
  const healAmount = player.maxHp - player.hp  // 相当于回满的量
  player.hp = player.maxHp
  const damage = healAmount * 2

  log(state, `${player.name} 生命上限 ${oldMaxHp}→${player.maxHp}，回复 ${healAmount} 点`)
  log(state, `对 ${target.name} 造成 ${damage} 点伤害`)
  applyDamage(state, target, damage)
  if (!state.gameOver) endAction(state)
}

// ===== 莉奈娅·青春之力的馈赠 =====

function executeSkillLiniya(state) {
  const player = currentPlayer(state)
  if (state.phase === PHASE.PEACE) {
    log(state, `和平阶段禁止攻击`)
    return
  }
  player.skillUses--
  state._liniyaSubSkill = true
  state.step = STEP.LINIYA_PICK
  log(state, `${player.name} 释放青春之力的馈赠，选择子技能和目标`)
}

export function executeLiniyaSkill(state, targetIdx, subSkill) {
  const player = currentPlayer(state)
  const target = state.players.find(p => p.index === targetIdx)
  if (!target?.alive) return

  if (subSkill === 1) {
    // 技能一：偷取防御牌3回合 + 永久伤害+2
    player.stealTarget = { idx: targetIdx, turns: 3 }
    player.damageBonus[targetIdx] = (player.damageBonus[targetIdx] || 0) + 2
    log(state, `${player.name} 偷取 ${target.name} 的防御牌（3回合），对其伤害+2`)
  } else {
    // 技能二：每回合5点DoT伤害无视陷阱持续5回合
    player.dotTarget = { idx: targetIdx, turns: 5 }
    log(state, `${player.name} 对 ${target.name} 施加5回合DoT（每回合5点无视陷阱）`)
  }

  state._liniyaSubSkill = null
  state.step = STEP.PICK_ACTION
  endAction(state)
}

// ===== 爱蜜莉雅·冻结 =====

function executeSkillAimiliya(state) {
  const player = currentPlayer(state)
  player.skillUses--
  state.step = STEP.SKILL_PICK_TARGET
  state._aimiliyaFreeze = true
  log(state, `${player.name} 释放冻结`)
}

export function executeAimiliyaSkill(state, targetIdx) {
  const player = currentPlayer(state)
  const target = state.players.find(p => p.index === targetIdx)
  if (!target?.alive) return

  target.frozenBy = player.index
  log(state, `${target.name} 被冻结，将跳过下一次行动`)
  state._aimiliyaFreeze = null
  state.step = STEP.PICK_ACTION
  endAction(state)
}

// ===== 菜月昴·死亡回归 =====

function executeSkillCaiyueang(state) {
  const player = currentPlayer(state)
  // 直接存档/读档，不需要选目标
  state._caiyueangMode = true
  state.step = STEP.CAIYUEANG_PICK
  log(state, `${player.name} 死亡回归 — 选择存档或读档`)
}

export function executeCaiyueangSave(state) {
  const player = currentPlayer(state)
  // 深拷贝当前游戏状态
  player.savepoint = deepCloneState(state)
  state._caiyueangMode = null
  state.endTurn = false  // 存档不结束回合
  log(state, `${player.name} 存档完成`)
  endAction(state)
}

export function executeCaiyueangLoad(state) {
  const player = currentPlayer(state)
  if (!player.savepoint) {
    log(state, `没有存档点可以回溯`)
    state._caiyueangMode = null
    state.step = STEP.PICK_ACTION
    return
  }
  if (player.loadUses <= 0) {
    log(state, `读档次数已用完`)
    state._caiyueangMode = null
    state.step = STEP.PICK_ACTION
    return
  }
  player.loadUses--
  restoreState(state, player.savepoint)
  state.endTurn = false  // 读档不结束回合
  log(state, `${player.name} 死亡回归！回溯到存档点（剩余读档${player.loadUses}次）`)
  state._caiyueangMode = null
  endAction(state)
}

// 深拷贝游戏状态（用于存档）
function deepCloneState(state) {
  return {
    players: state.players.map(p => ({
      index: p.index, name: p.name, characterId: p.characterId,
      characterName: p.characterName, characterTitle: p.characterTitle,
      characterIcon: p.characterIcon,
      hp: p.hp, maxHp: p.maxHp, alive: p.alive,
      defensePile: p.defensePile.map(c => ({ ...c })),
      trap: p.trap ? { ...p.trap } : null,
      bait: p.bait ? { ...p.bait } : null,
      skillUses: p.skillUses, skillName: p.skillName,
      skillDesc: p.skillDesc, skillType: p.skillType, maxUses: p.maxUses,
      fightingSpirit: p.fightingSpirit, moonPhase: p.moonPhase,
      ignoreTrapThisTurn: p.ignoreTrapThisTurn, extraAction: p.extraAction,
      weatherProcessed: p.weatherProcessed, loadUses: p.loadUses, loadMaxUses: p.loadMaxUses,
      allyIndex: p.allyIndex, allianceTurns: p.allianceTurns,
      betrayalPenalty: p.betrayalPenalty, allyKillBonus: p.allyKillBonus,
      stealTarget: p.stealTarget ? { ...p.stealTarget } : null,
      dotTarget: p.dotTarget ? { ...p.dotTarget } : null,
      damageBonus: { ...p.damageBonus },
      frozenBy: p.frozenBy, savepoint: null  // 存档点本身不复刻
    })),
    deck: state.deck.map(c => ({ ...c })),
    grave: state.grave.map(c => ({ ...c })),
    currentPlayerIndex: state.currentPlayerIndex,
    phase: state.phase, step: state.step,
    round: state.round, currentWeather: state.currentWeather,
    peaceRounds: state.peaceRounds
  }
}

// 从存档恢复状态
function restoreState(state, sp) {
  // 恢复玩家
  sp.players.forEach((sp, i) => {
    Object.assign(state.players[i], sp)
    // 恢复深层对象
    state.players[i].defensePile = sp.defensePile.map(c => ({ ...c }))
    state.players[i].trap = sp.trap ? { ...sp.trap } : null
    state.players[i].bait = sp.bait ? { ...sp.bait } : null
    state.players[i].stealTarget = sp.stealTarget ? { ...sp.stealTarget } : null
    state.players[i].dotTarget = sp.dotTarget ? { ...sp.dotTarget } : null
    state.players[i].damageBonus = { ...sp.damageBonus }
    state.players[i].loadUses = sp.loadUses
    state.players[i].loadMaxUses = sp.loadMaxUses
    state.players[i].allyIndex = sp.allyIndex
    state.players[i].allianceTurns = sp.allianceTurns
    state.players[i].betrayalPenalty = sp.betrayalPenalty
    state.players[i].allyKillBonus = sp.allyKillBonus
  })
  state.deck = sp.deck.map(c => ({ ...c }))
  state.grave = sp.grave.map(c => ({ ...c }))
  state.currentPlayerIndex = sp.currentPlayerIndex
  state.phase = sp.phase
  state.step = STEP.PICK_ACTION
  state.round = sp.round
  state.currentWeather = sp.currentWeather
  state.peaceRounds = sp.peaceRounds
  checkGameOver(state)
}

// ===== 联盟机制 =====

/** 开始结盟：进入选目标阶段 */
export function startAlly(state) {
  if (state.phase === PHASE.PEACE) return
  if (state.players.length < 4) {
    log(state, `仅4人局及以上可结盟`)
    return
  }
  const player = currentPlayer(state)
  if (player.allyIndex !== null) {
    log(state, `已有盟友，不可再结盟`)
    return
  }
  if (player.betrayalPenalty > 0) {
    log(state, `背刺惩罚中，${player.betrayalPenalty}回合内不可结盟`)
    return
  }
  state.step = STEP.ALLY_PICK
  log(state, `${player.name} 选择结盟目标`)
}

/** 执行结盟 */
export function executeAlly(state, targetIdx) {
  const player = currentPlayer(state)
  const target = state.players.find(p => p.index === targetIdx)
  if (!target?.alive) return
  if (target.allyIndex !== null) {
    log(state, `${target.name} 已有盟友`)
    return
  }
  player.allyIndex = targetIdx
  player.allianceTurns = 5
  target.allyIndex = player.index
  target.allianceTurns = 5
  log(state, `${player.name} 与 ${target.name} 结盟（5回合）`)
  state.step = STEP.PICK_ACTION
  endAction(state)
}

/** 背刺盟友 */
export function executeBetray(state) {
  const player = currentPlayer(state)
  if (player.allyIndex === null) {
    log(state, `没有盟友可以背刺`)
    return
  }
  const ally = state.players.find(p => p.index === player.allyIndex)
  if (!ally?.alive) return

  // 抽攻击牌
  if (state.deck.length === 0) {
    state.deck = reshuffleFromGrave(state.grave)
    state.grave = []
  }
  const r = drawCards(state.deck, 1)
  const card = r.drawn[0]
  state.deck = r.remaining
  card.faceUp = true

  let dmg = card.value + 4  // 背刺+4
  log(state, `${player.name} 背刺 ${ally.name}！${cardDisplay(card)} +4 = ${dmg}`)

  // 应用伤害
  const oldHp = ally.hp
  applyDamage(state, ally, dmg)

  // 惩罚：防御牌和陷阱全部亮明
  for (const c of player.defensePile) c.faceUp = true
  if (player.trap) player.trap.faceUp = true
  if (player.bait) player.bait.faceUp = true
  player.betrayalPenalty = 10
  player.allianceTurns = 0

  // 解除联盟
  ally.allyIndex = null
  ally.allianceTurns = 0
  player.allyIndex = null

  // 击杀奖励
  if (!ally.alive) {
    player.hp = player.maxHp
    // +2防御牌
    for (let i = 0; i < 2; i++) {
      if (state.deck.length === 0) {
        state.deck = reshuffleFromGrave(state.grave)
        state.grave = []
      }
      const rr = drawCards(state.deck, 1)
      state.deck = rr.remaining
      rr.drawn[0].faceUp = false
      player.defensePile.push(rr.drawn[0])
    }
    log(state, `${player.name} 击杀盟友！回满血+2防御`)
  }

  log(state, `${player.name} 背刺惩罚：10回合不可结盟，防御/陷阱全明，被打伤害+2`)
  state.grave.push(card)
  state.step = STEP.PICK_ACTION
  endAction(state)
}

/** 检查联盟目标是否可选（排除自己、死人、已有盟友者、惩罚中者） */
export function getAllianceTargets(state) {
  const player = currentPlayer(state)
  return state.players.filter(p =>
    p.alive &&
    p.index !== player.index &&
    p.allyIndex === null &&
    p.betrayalPenalty <= 0
  )
}

/** 获取玩家盟友 */
export function getAlly(state, player) {
  if (player.allyIndex === null) return null
  return state.players.find(p => p.index === player.allyIndex) || null
}

// ===== 天气系统 =====

/** 获取当前天气数据 */
export function getCurrentWeather(state) {
  const weatherNames = {
    calm: { name: '风和日丽', desc: '无效果', icon: '' },
    wind: { name: '狂风呼啸', desc: '赌命抽牌数+1', icon: '' },
    trade: { name: '黑市交易', desc: '防御牌点数+2', icon: '' },
    sun: { name: '烈日当空', desc: '攻击牌点数+2', icon: '' },
    rain: { name: '暴雨倾盆', desc: '所有玩家防御区减1张', icon: '' },
    arms: { name: '军备竞赛', desc: '禁止使用角色技能', icon: '' }
  }
  return weatherNames[state.currentWeather] || null
}

export function getNextWeather(state) {
  const weatherNames = {
    calm: { name: '风和日丽', desc: '无效果' },
    wind: { name: '狂风呼啸', desc: '赌命抽牌数+1' },
    trade: { name: '黑市交易', desc: '防御牌点数+2' },
    sun: { name: '烈日当空', desc: '攻击牌点数+2' },
    rain: { name: '暴雨倾盆', desc: '所有玩家防御区减1张' },
    arms: { name: '军备竞赛', desc: '禁止使用角色技能' }
  }
  return weatherNames[state.nextWeather] || null
}
