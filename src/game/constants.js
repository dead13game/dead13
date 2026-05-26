// 扑克牌数据
export const SUITS = ['', '', '', '']
export const SUIT_NAMES = { '': 'spades', '': 'hearts', '': 'clubs', '': 'diamonds' }
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
export const RANK_VALUES = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 }

// 花色排序（用于决定同点数先后）
export const SUIT_ORDER = { '': 0, '': 1, '': 2, '': 3 }

// 游戏阶段
export const PHASE = {
  SETUP: 'setup',
  PEACE: 'peace',
  NORMAL: 'normal',
  GAME_OVER: 'gameOver'
}

// 行动步骤
export const STEP = {
  PICK_ACTION: 'pickAction',
  PICK_TARGET: 'pickTarget',
  ATTACK_SHOW_CARD: 'attackShowCard',
  GAMBLE_PICK: 'gamblePick',
  SKILL_PICK_TARGET: 'skillPickTarget',
  SKILL_NAHIDA: 'skillNahida',
  ANIMATING: 'animating'
}

// 行动类型
export const ACTION = {
  ATTACK: 'attack',
  DEFENSE: 'defense',
  GAMBLE: 'gamble',
  SKILL: 'skill'
}

// 月相
export const MOON_PHASES = ['waxing', 'full', 'new']
export const MOON_NAMES = { waxing: '弦月', full: '满月', new: ' 新月' }

// 神明角色卡
export const CHARACTERS = [
  {
    id: 'venti',
    name: '温迪',
    title: '风神·巴巴托斯',
    icon: './images/温迪.jpg',
    hp: 11,
    skillName: '千风之诗',
    skillType: 'active',
    skillDesc: '攻击时抽2张牌，点数相加作为本次攻击的总伤害（第7回合解锁）',
    maxUses: 2
  },
  {
    id: 'zhongli',
    name: '钟离',
    title: '岩神·摩拉克斯',
    icon: './images/钟离.jpg',
    hp: 12,
    skillName: '坚如磐石',
    skillType: 'active',
    skillDesc: '获得一个20点防御力的护盾',
    maxUses: 1
  },
  {
    id: 'raiden',
    name: '雷电将军',
    title: '雷神·巴尔泽布',
    icon: './images/雷电将军.jpg',
    hp: 11,
    skillName: '无想的一刀',
    skillType: 'active',
    skillDesc: '造成20点伤害',
    maxUses: 1
  },
  {
    id: 'nahida',
    name: '纳西妲',
    title: '草神·布耶尔',
    icon: './images/纳西妲.jpg',
    hp: 12,
    skillName: '智慧之殿堂',
    skillType: 'active',
    skillDesc: '查看牌库顶3张牌并按任意顺序放回，随后可再行动一次',
    maxUses: 2
  },
  {
    id: 'furina',
    name: '芙宁娜',
    title: '水神·芙卡洛斯',
    icon: './images/芙宁娜.jpg',
    hp: 11,
    skillName: '审判',
    skillType: 'active',
    skillDesc: '本回合攻击无视陷阱（跳过陷阱判定），自动触发攻击',
    maxUses: 3
  },
  {
    id: 'mavuika',
    name: '玛薇卡',
    title: '火神',
    icon: './images/玛薇卡.jpg',
    hp: 12,
    skillName: '焚焰',
    skillType: 'passive',
    skillDesc: '每破除一个陷阱或击穿一层防御获得1层斗志，下次攻击伤害+斗志层数（上限5层）',
    maxUses: Infinity
  },
  {
    id: 'columbina',
    name: '哥伦比娅',
    title: '月神·少女',
    icon: './images/哥伦比亚.jpg',
    hp: 11,
    skillName: '三月交辉之刻',
    skillType: 'passive',
    skillDesc: '每回合自动轮换月相：弦月(+2攻) → 满月(+2防盾) → 新月(赌命抽3)',
    maxUses: Infinity
  }
]

// 天气
export const WEATHER = [
  { id: 'calm', name: '风和日丽', desc: '无效果' },
  { id: 'wind', name: '狂风呼啸', desc: '赌命抽牌数+1' },
  { id: 'trade', name: '黑市交易', desc: '防御牌点数+2' },
  { id: 'sun', name: '烈日当空', desc: '攻击牌点数+2' },
  { id: 'rain', name: '暴雨倾盆', desc: '所有玩家防御区弃1张' },
  { id: 'arms', name: '军备竞赛', desc: '本回合禁止使用角色技能' }
]

// 段位（未来扩展）
export const RANKS_TIER = [
  { name: '异乡人', min: 0, max: 999 },
  { name: '冒险家', min: 1000, max: 1999 },
  { name: '神之眼', min: 2000, max: 2999 },
  { name: '西风骑士', min: 3000, max: 3999 },
  { name: '璃月七星', min: 4000, max: 4999 },
  { name: '愚人众执行官', min: 5000, max: 5999 },
  { name: '尘世七执政', min: 6000, max: 6999 },
  { name: '天理维系者', min: 7000, max: 7999 },
  { name: '原初之人', min: 8000, max: 9999 },
  { name: '降临者', min: 10000, max: Infinity }
]
