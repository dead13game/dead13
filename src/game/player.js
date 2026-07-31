/**
 * Player 工厂函数
 * 纯逻辑层，零依赖
 */

/**
 * 创建玩家对象
 * @param {number} index - 数组中的位置索引
 * @param {object} charData - CHARACTERS 字典中的角色数据
 * @param {string} [name] - 玩家显示名称
 * @param {number} [teamId] - 队伍ID（-1=无队伍，0/1=联赛队伍）
 * @returns {object} player 对象
 */
export function createPlayer(index, charData, name, teamId) {
  return {
    index,
    teamId: teamId ?? -1, // -1 表示无队伍（经典模式），>=0 表示联赛模式中的队伍
    name: name || `玩家 ${index + 1}`,
    characterId: charData.id, // 数字，查 CHARACTERS 获取静态数据
    hp: charData.hp,
    maxHp: charData.hp,
    alive: true,
    defensePile: [],
    trap: null,
    bait: null,
    skillUses: charData.maxUses,
    fightingSpirit: 0,
    moonPhase: 0,
    loadUses: charData.loadMaxUses,
    // 状态效果
    statusEffects: {
      frozenBy: null,
      stealTarget: null,
      dotTarget: null,
      damageBonus: {},
      ignoreTrapThisTurn: false,
      extraAction: false,
      savepoint: null,
    },
    // 关系
    relations: {
      allyIndex: null,
      allianceTurns: 0,
      betrayalPenalty: 0,
      allyKillBonus: false,
      consecutiveGambles: 0,
      gamblePenalty: false,
    },
    // 圣遗物
    artifactId: null, // 选择的圣遗物ID (null=未选择, 1=角斗士, 2=流浪大地)
    breakCount: 0, // 击破计数（累计8次可发动圣言自明）
    holyWordUses: 2, // 剩余圣言自明次数（每局最多2次）
    artifactActive: false, // 圣遗物效果是否激活中
    artifactRoundsLeft: 0, // 圣遗物效果剩余回合数
    // AI
    isAI: false,
    aiDifficulty: null, // 'easy' | 'skilled' | 'hell'
  };
}
