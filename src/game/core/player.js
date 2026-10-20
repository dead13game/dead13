// Player 数据模型 — 纯数据,可 JSON 化,禁止挂方法/实例状态
//
// 字段分区(见 docs/classic-refactor-plan.md §4.1):
//   事实   hp / maxHp / alive / defensePile / trap / bait
//   资源   resources
//   效果   effects
//   关系   relations(含 attackedThisRound 围攻计数)
//   角色私有 char   ← 由角色插件的 stateSchema 决定默认值
//   圣遗物 artifact
//   AI     ai
//
// 不变量:JSON.stringify(player) 后 parse 回来,行为必须一致。

export const PLAYER_VERSION = 4;

/** 一份全新的 player 默认值(深拷贝,数组/对象每次新建) */
export function createPlayerDefaults() {
  return {
    uid: 0,
    index: 0,
    characterId: 0,
    name: "",
    teamId: -1,

    hp: 0,
    maxHp: 0,
    alive: true,

    defensePile: [],
    trap: null,
    bait: null,

    resources: {
      skillUses: 0,
      loadUses: 0,
      holyWordUses: 2,
      breakCount: 0,
    },

    effects: {
      frozenBy: null, // uid | null
      stealTarget: null, // { uid, turns }
      dotTarget: null, // { uid, turns }
      damageBonus: {}, // uid → 额外伤害
      ignoreTrapThisTurn: false,
      savepoint: null, // 菜月昴存档快照(不参与普通序列化)
    },

    relations: {
      allyUid: null, // 双向冗余:双方各自记录
      allianceTurns: 0,
      betrayalPenalty: 0,
      allyKillBonus: false,
      consecutiveGambles: 0,
      gamblePenalty: false,
      attackedThisRound: 0, // 围攻计数:本回合被攻击次数
    },

    char: {}, // 角色私有状态槽

    artifact: { id: null, active: false, roundsLeft: 0 },

    ai: { enabled: false, difficulty: null },
  };
}

/**
 * 创建玩家。
 * @param {object} args
 * @param {number} args.uid        稳定身份(重排/读档不变)
 * @param {number} args.index      渲染序(会按 speed 重排)
 * @param {number} args.characterId
 * @param {object} args.meta       角色静态数据 { hp, maxUses, loadMaxUses }
 * @param {string} [args.name]
 * @param {number} [args.teamId]
 * @param {object} [args.charState] 角色私有状态初值(来自角色 stateSchema)
 */
export function createPlayer({
  uid,
  index,
  characterId,
  meta,
  name,
  teamId,
  charState,
}) {
  const p = createPlayerDefaults();
  p.uid = uid;
  p.index = index;
  p.characterId = characterId;
  p.name = name ?? `玩家 ${index + 1}`;
  p.teamId = teamId ?? -1;
  p.hp = meta.hp;
  p.maxHp = meta.hp;
  p.resources.skillUses = meta.maxUses ?? 0;
  p.resources.loadUses = meta.loadMaxUses ?? 0;
  p.holyWordUses = meta.holyWordUses ?? 2;
  if (charState) p.char = structuredClone(charState);
  return p;
}

/** 按 characterId 找玩家(注意:不是身份,uid 才是) */
export function playerByUid(state, uid) {
  return state.players.find((p) => p.uid === uid) ?? null;
}

/** 按渲染序找玩家 */
export function playerByIndex(state, index) {
  return state.players.find((p) => p.index === index) ?? null;
}

export function alivePlayers(state) {
  return state.players.filter((p) => p.alive);
}

/** 当前行动者 */
export function currentPlayer(state) {
  return state.players[state.currentPlayerIndex] ?? null;
}
