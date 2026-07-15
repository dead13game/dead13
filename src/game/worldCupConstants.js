// 世界杯模式常量

/** 小组名称 */
export const GROUP_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** 淘汰赛轮次 */
export const KNOCKOUT_ROUNDS = ["R16", "QF", "SF", "Final"];

/** 淘汰赛轮次中文名 */
export const KNOCKOUT_NAMES = {
  R16: "16强赛",
  QF: "四分之一决赛",
  SF: "半决赛",
  Final: "决赛",
};

/** 比赛配置 */
export const MATCH_CONFIG = {
  knockoutRounds: 90, // 常规时间回合数
  extraTimeRounds: 30, // 加时赛回合数
  totalRounds: 120, // 常规+加时总回合数
  maxSubstitutions: 3, // 每队换人次数
  penaltyFirstTo: 5, // 点球大战先得5分者胜
  penaltyCardsPerSide: 2, // 点球每方抽牌数
};

/** 小组赛积分 */
export const POINTS = {
  WIN: 3,
  DRAW: 1,
  LOSS: 0,
};

/** AI 队伍名称池（用于小组赛对手和淘汰赛对手） */
export const AI_TEAM_NAMES = [
  "巴西",
  "德国",
  "阿根廷",
  "法国",
  "西班牙",
  "意大利",
  "英格兰",
  "荷兰",
  "葡萄牙",
  "比利时",
  "克罗地亚",
  "乌拉圭",
  "日本",
  "韩国",
  "墨西哥",
  "瑞典",
  "丹麦",
  "波兰",
  "瑞士",
  "塞内加尔",
  "摩洛哥",
  "哥伦比亚",
  "智利",
  "尼日利亚",
  "喀麦隆",
  "加纳",
  "埃及",
  "沙特",
  "伊朗",
  "澳大利亚",
  "美国",
];

/** 队伍表情符号 */
export const TEAM_EMOJIS = [
  "🇧🇷",
  "🇩🇪",
  "🇦🇷",
  "🇫🇷",
  "🇪🇸",
  "🇮🇹",
  "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "🇳🇱",
  "🇵🇹",
  "🇧🇪",
  "🇭🇷",
  "🇺🇾",
  "🇯🇵",
  "🇰🇷",
  "🇲🇽",
  "🇸🇪",
  "🇩🇰",
  "🇵🇱",
  "🇨🇭",
  "🇸🇳",
  "🇲🇦",
  "🇨🇴",
  "🇨🇱",
  "🇳🇬",
  "🇨🇲",
  "🇬🇭",
  "🇪🇬",
  "🇸🇦",
  "🇮🇷",
  "🇦🇺",
  "🇺🇸",
];
