// 联赛模式常量 — 球队数据、赛程、配置
// 纯逻辑层，零依赖

/** 10支球队（按ID索引） */
export const LEAGUE_TEAMS = [
  null, // 占位，让 teamId 从 1 开始
  { id: 1, name: "曼城", emoji: "🔵", tier: 1 },
  { id: 2, name: "利物浦", emoji: "🔴", tier: 1 },
  { id: 3, name: "阿森纳", emoji: "🔴", tier: 1 },
  { id: 4, name: "曼联", emoji: "🔴", tier: 1 },
  { id: 5, name: "切尔西", emoji: "🔵", tier: 2 },
  { id: 6, name: "热刺", emoji: "⚪", tier: 2 },
  { id: 7, name: "纽卡斯尔联", emoji: "⚫", tier: 2 },
  { id: 8, name: "埃弗顿", emoji: "🔵", tier: 3 },
  { id: 9, name: "西汉姆联", emoji: "🟤", tier: 3 },
  { id: 10, name: "狼队", emoji: "🟠", tier: 3 },
];

/** 等级标签 */
export const TIER_LABELS = { 1: "🏆 争冠级", 2: "⚔️ 欧战级", 3: "🛡️ 保级级" };

/** 等级分组 */
export const TIER_1 = [1, 2, 3, 4];
export const TIER_2 = [5, 6, 7];
export const TIER_3 = [8, 9, 10];

/** 联赛比赛配置 */
export const LEAGUE_MATCH_CONFIG = {
  maxRounds: 60, // 60回合上限
  deckCount: 3, // 3副牌（6人用）
  playersPerTeam: 3,
};

/** 排名积分映射：排名 → 积分数 */
export const RANK_POINTS = {
  1: 7,
  2: 5,
  3: 4,
  4: 3,
  5: 2,
  6: 0,
};

/** 联赛积分 */
export const LEAGUE_POINTS = {
  WIN: 3,
  DRAW: 1,
  LOSS: 0,
};

/** 总轮次 */
export const TOTAL_ROUNDS = 18;

/**
 * 18轮对阵表
 * LEAGUE_SCHEDULE[round][match] = { home: teamId, away: teamId }
 * round 从 1 开始
 */
export const LEAGUE_SCHEDULE = [
  null, // 占位，让 round 从 1 开始
  // 第1轮
  [
    { home: 1, away: 10 },
    { home: 4, away: 9 },
    { home: 2, away: 8 },
    { home: 3, away: 7 },
    { home: 5, away: 6 },
  ],
  // 第2轮
  [
    { home: 1, away: 7 },
    { home: 8, away: 6 },
    { home: 9, away: 5 },
    { home: 10, away: 3 },
    { home: 4, away: 2 },
  ],
  // 第3轮
  [
    { home: 1, away: 9 },
    { home: 10, away: 8 },
    { home: 4, away: 7 },
    { home: 2, away: 6 },
    { home: 3, away: 5 },
  ],
  // 第4轮
  [
    { home: 1, away: 8 },
    { home: 9, away: 7 },
    { home: 10, away: 6 },
    { home: 4, away: 5 },
    { home: 2, away: 3 },
  ],
  // 第5轮
  [
    { home: 1, away: 6 },
    { home: 7, away: 5 },
    { home: 8, away: 3 },
    { home: 9, away: 2 },
    { home: 10, away: 4 },
  ],
  // 第6轮
  [
    { home: 1, away: 3 },
    { home: 5, away: 2 },
    { home: 6, away: 4 },
    { home: 7, away: 10 },
    { home: 8, away: 9 },
  ],
  // 第7轮
  [
    { home: 1, away: 5 },
    { home: 6, away: 3 },
    { home: 7, away: 2 },
    { home: 8, away: 4 },
    { home: 9, away: 10 },
  ],
  // 第8轮
  [
    { home: 1, away: 2 },
    { home: 3, away: 4 },
    { home: 5, away: 10 },
    { home: 6, away: 9 },
    { home: 7, away: 8 },
  ],
  // 第9轮
  [
    { home: 1, away: 4 },
    { home: 2, away: 10 },
    { home: 3, away: 9 },
    { home: 5, away: 8 },
    { home: 6, away: 7 },
  ],
  // 第10轮（下半程：主客场对调）
  [
    { home: 10, away: 1 },
    { home: 9, away: 4 },
    { home: 8, away: 2 },
    { home: 7, away: 3 },
    { home: 6, away: 5 },
  ],
  // 第11轮
  [
    { home: 7, away: 1 },
    { home: 6, away: 8 },
    { home: 5, away: 9 },
    { home: 3, away: 10 },
    { home: 2, away: 4 },
  ],
  // 第12轮
  [
    { home: 9, away: 1 },
    { home: 8, away: 10 },
    { home: 7, away: 4 },
    { home: 6, away: 2 },
    { home: 5, away: 3 },
  ],
  // 第13轮
  [
    { home: 8, away: 1 },
    { home: 7, away: 9 },
    { home: 6, away: 10 },
    { home: 5, away: 4 },
    { home: 3, away: 2 },
  ],
  // 第14轮
  [
    { home: 6, away: 1 },
    { home: 5, away: 7 },
    { home: 3, away: 8 },
    { home: 2, away: 9 },
    { home: 4, away: 10 },
  ],
  // 第15轮
  [
    { home: 3, away: 1 },
    { home: 2, away: 5 },
    { home: 4, away: 6 },
    { home: 10, away: 7 },
    { home: 9, away: 8 },
  ],
  // 第16轮
  [
    { home: 5, away: 1 },
    { home: 3, away: 6 },
    { home: 2, away: 7 },
    { home: 4, away: 8 },
    { home: 10, away: 9 },
  ],
  // 第17轮
  [
    { home: 2, away: 1 },
    { home: 4, away: 3 },
    { home: 10, away: 5 },
    { home: 9, away: 6 },
    { home: 8, away: 7 },
  ],
  // 第18轮
  [
    { home: 4, away: 1 },
    { home: 10, away: 2 },
    { home: 9, away: 3 },
    { home: 8, away: 5 },
    { home: 7, away: 6 },
  ],
];
