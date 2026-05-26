import { SUITS, RANKS, RANK_VALUES } from './constants.js'

/** 创建一副牌（52张，不含大小王） */
export function createDeck() {
  const cards = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
        value: RANK_VALUES[rank],
        faceUp: false
      })
    }
  }
  return cards
}

/** Fisher-Yates 洗牌 */
export function shuffleDeck(deck) {
  const arr = [...deck]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** 创建牌库（默认两副牌，v2.0无大小王） */
export function createFullDeck(numDecks = 2) {
  let deck = []
  for (let i = 0; i < numDecks; i++) {
    deck = deck.concat(createDeck())
  }
  return deck
}

/** 从牌库顶抽 n 张牌 */
export function drawCards(deck, n = 1) {
  const drawn = []
  const remaining = [...deck]
  for (let i = 0; i < n && remaining.length > 0; i++) {
    drawn.push(remaining.pop())
  }
  return { drawn, remaining }
}

/** 重构牌库：洗匀墓地中的牌作为新牌库（排除角色卡） */
export function reshuffleFromGrave(grave, excludeIds = []) {
  const eligible = grave.filter(c => !excludeIds.includes(c.id))
  return shuffleDeck(eligible)
}

/** 获取牌的点数描述 */
export function cardDisplay(card) {
  if (!card) return '无牌'
  return `${card.rank}${card.suit}`
}

/** 获取花色颜色 */
export function cardColor(card) {
  if (card.suit === '' || card.suit === '') return '#D32F2F'
  return '#1a1a1a'
}
