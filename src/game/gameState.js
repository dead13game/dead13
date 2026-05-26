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
    // 纳西妲：已发动技能后可再行动
    extraAction: false,
    // 天气已处理标记
    weatherProcessed: false
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
    round: 0,
    messageLog: [],
    gameOver: false,
    winnerIndex: -1,
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
    round: 0,
    messageLog: [],
    gameOver: false,
    winnerIndex: -1,
    scryCards: null,
    pendingAttackCard: null,
    pendingVentiCards: null,
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

/** 抽天气 */
function drawWeather(state) {
  if (!state.useWeather) return null
  if (state.weatherDeck.length === 0) return null
  const w = state.weatherDeck.shift()
  state.weatherDeck.push(w) // 放回底部
  state.currentWeather = w.id
  return w.id
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

    checkGameOver(state)
  }

  if (!state.gameOver && state.players[next]?.alive) {
    state.currentPlayerIndex = next
    state.step = STEP.PICK_ACTION
    // 重置芙宁娜状态
    const p = currentPlayer(state)
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

/** 造成伤害 */
function dealDamage(state, targetIdx, damage, skipTrap = false) {
  const target = state.players.find(p => p.index === targetIdx)
  if (!target?.alive) return 0

  let remainingDmg = damage

  // 防御判定
  while (remainingDmg > 0 && target.defensePile.length > 0) {
    const topCard = target.defensePile[target.defensePile.length - 1]
    if (!topCard.faceUp) topCard.faceUp = true

    if (topCard.value >= remainingDmg) {
      topCard.value -= remainingDmg
      remainingDmg = 0
      if (topCard.value === 0) {
        target.defensePile.pop()
        log(state, `${target.name} 防御牌抵消`)
      } else {
        log(state, `${target.name} 残盾 ${topCard.value}点`)
      }
    } else {
      remainingDmg -= topCard.value
      log(state, `${target.name} 防御牌 ${cardDisplay(topCard)} 被击穿`)
      target.defensePile.pop()
    }
  }

  if (remainingDmg > 0) {
    target.hp -= remainingDmg
    log(state, `${target.name} 剩余 HP ${target.hp}`)

    if (target.hp <= 0) {
      target.alive = false
      target.hp = 0
      log(state, `${target.name} 阵亡`)
      // 丢弃所有牌
      ;[...target.defensePile, target.trap, target.bait].filter(Boolean).forEach(c => state.grave.push(c))
      target.defensePile = []
      target.trap = null
      target.bait = null
      checkGameOver(state)
    }
  }

  return remainingDmg
}

// ===== 攻击 =====

/** 开始攻击：先抽牌展示，再选目标 */
export function startAttack(state) {
  if (state.step !== STEP.PICK_ACTION) return
  if (state.phase === PHASE.PEACE || state.phase === PHASE.PEACE || state.round < 4) {
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
  const card = state.pendingAttackCard
  if (card) state.grave.push(card)
  state.pendingAttackCard = null
  state.pendingVentiCards = null
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

  // 哥伦比娅弦月 +2
  if (attacker.characterId === 'columbina' && attacker.moonPhase === 0) {
    attackValue += 3
    log(state, `弦月加持`)
  }

  // 玛薇卡斗志
  if (attacker.characterId === 'mavuika' && attacker.fightingSpirit > 0) {
    attackValue += attacker.fightingSpirit
    log(state, `斗志 ${attacker.fightingSpirit}层`)
  }

  // 陷阱判定
  let trapTriggered = false
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
      dealDamage(state, attacker.index, trapValue)
      attackCards.forEach(c => state.grave.push(c))
      if (!state.gameOver) nextPlayer(state)
      return
    } else if (attackValue === trapValue) {
      // 平局：双方都受伤
      log(state, `陷阱平局双方受伤`)
      state.grave.push(target.trap)
      if (target.bait) state.grave.push(target.bait)
      target.trap = null
      target.bait = null
      trapTriggered = true
      dealDamage(state, attacker.index, trapValue)
      // 玛薇卡：即使平局也算击破陷阱
      if (attacker.characterId === 'mavuika') {
        attacker.fightingSpirit = Math.min(5, attacker.fightingSpirit + 1)
        log(state, `斗志 ${attacker.fightingSpirit}层`)
      }
      attackCards.forEach(c => state.grave.push(c))
      if (!state.gameOver) nextPlayer(state)
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

  // 防御判定
  const beforeDefense = target.defensePile.length
  const remainingDmg = dealDamageTarget(state, target, attackValue, attacker)
  
  // 玛薇卡：如果击穿了防御
  if (attacker.characterId === 'mavuika' && target.defensePile.length < beforeDefense && !trapTriggered) {
    const diff = beforeDefense - target.defensePile.length
    if (diff > 0) {
      attacker.fightingSpirit = Math.min(5, attacker.fightingSpirit + diff)
      log(state, `斗志 ${attacker.fightingSpirit}层`)
    }
  }

  attackCards.forEach(c => state.grave.push(c))
  if (attacker.ignoreTrapThisTurn) {
    attacker.ignoreTrapThisTurn = false
  }

  if (!state.gameOver) nextPlayer(state)
}

/** 防御区伤害结算（带日志） */
function dealDamageTarget(state, target, damage, source) {
  let remaining = damage
  while (remaining > 0 && target.defensePile.length > 0) {
    const top = target.defensePile[target.defensePile.length - 1]
    if (!top.faceUp) top.faceUp = true
    if (top.value >= remaining) {
      top.value -= remaining
      remaining = 0
      if (top.value === 0) {
        target.defensePile.pop()
        log(state, `${target.name} 防御牌抵消`)
      } else {
        log(state, `${target.name} 残盾 ${top.value}点`)
      }
    } else {
      remaining -= top.value
      log(state, `${target.name} 防御牌 ${cardDisplay(top)} 被击穿`)
      target.defensePile.pop()
    }
  }
  if (remaining > 0) {
    target.hp -= remaining
    log(state, `${target.name} HP ${target.hp}`)
    if (target.hp <= 0) {
      target.alive = false
      target.hp = 0
      log(state, `${target.name} 阵亡`)
      ;[...target.defensePile, target.trap, target.bait].filter(Boolean).forEach(c => state.grave.push(c))
      target.defensePile = []
      target.trap = null
      target.bait = null
      checkGameOver(state)
    }
  }
  return remaining
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

  // 哥伦比娅满月 +2
  if (player.characterId === 'columbina' && player.moonPhase === 1) {
    cardValue += 3
      }

  // 直接修改value（不影响原始卡）
  card.value = cardValue
  card.faceUp = false
  player.defensePile.push(card)
  log(state, `${player.name} 执行防御`)

  state.step = STEP.PICK_ACTION
  nextPlayer(state)
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
  nextPlayer(state)
}

// ===== 角色技能 =====

/** 检查玩家在当前状态下是否能释放技能 */
export function canUseSkill(state, player) {
  if (!player.alive) return false
  if (player.skillType !== 'active') return false
  if (player.skillUses <= 0) return false

  // 军备竞赛禁止技能
  if (state.currentWeather === 'arms') return false

  // 温迪：技能使用时需要处于攻击选目标阶段（特殊处理）
  // 其他技能在PICK_ACTION阶段可用
  return state.step === STEP.PICK_ACTION
}

/** 释放技能入口 */
export function executeSkill(state) {
  if (state.step !== STEP.PICK_ACTION) return
  const player = currentPlayer(state)
  if (!canUseSkill(state, player)) return false

  switch (player.characterId) {
    case 'venti':   return startSkillVenti(state)
    case 'zhongli': return executeSkillZhongli(state)
    case 'raiden':  return executeSkillRaiden(state)
    case 'nahida':  return startSkillNahida(state)
    case 'furina':  return executeSkillFurina(state)
    default: return false
  }
}

/** 温迪·千风之诗：转为攻击模式，标记技能触发 */
function startSkillVenti(state) {
  const player = currentPlayer(state)
  if (state.phase === PHASE.PEACE || state.phase === PHASE.PEACE) {
    log(state, `和平阶段禁止攻击`)
    return
  }
  if (state.round < 7) {
    log(state, `第7回合后才能使用`)
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

/** 钟离·坚如磐石：获得20点护盾 */
function executeSkillZhongli(state) {
  const player = currentPlayer(state)
  // 创建一个20点护盾作为防御牌
  const shield = { id: `shield-zhongli-${Date.now()}`, suit: '', rank: '盾', value: 20, faceUp: true }
  player.defensePile.push(shield)
  player.skillUses--
  log(state, `${player.name} 释放坚如磐石`)
  nextPlayer(state)
  return true
}

/** 雷电将军·无想的一刀：造成20点伤害 */
function executeSkillRaiden(state) {
  const player = currentPlayer(state)
  if (state.phase === PHASE.PEACE) {
    log(state, `和平阶段禁止攻击`)
    return
  }
  if (state.round < 7) {
    log(state, `第7回合后才能使用`)
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

  let damage = 20
  // 天气
  if (state.currentWeather === 'sun') damage += 2
  // 玛薇卡
  if (attacker.characterId === 'mavuika' && attacker.fightingSpirit > 0) {
    damage += attacker.fightingSpirit
      }

  log(state, `${attacker.name} 无想的一刀 ➜ ${target.name}`)
  dealDamageTarget(state, target, damage, attacker)
  attacker.ignoreTrapThisTurn = false
  if (!state.gameOver) nextPlayer(state)
}

/** 纳西妲·智慧之殿堂：查看牌库顶 */
function startSkillNahida(state) {
  const player = currentPlayer(state)
  if (state.deck.length < 3) {
    state.deck = reshuffleFromGrave(state.grave)
    state.grave = []
  }
  const r = drawCards(state.deck, 3)
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
  currentPlayer(state).extraAction = true
  state.step = STEP.PICK_ACTION
}

/** 芙宁娜·审判：无视陷阱并自动攻击 */
function executeSkillFurina(state) {
  const player = currentPlayer(state)
  if (state.phase === PHASE.PEACE || state.phase === PHASE.PEACE) {
    log(state, `和平阶段禁止攻击`)
    return
  }
  if (state.round < 4) {
    log(state, `第4回合后才能攻击`)
    return
  }
  player.ignoreTrapThisTurn = true
  player.skillUses--
  log(state, `${player.name} 释放审判`)
  // 自动进入攻击流程
  startAttack(state)
  return true
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
