/**
 * src/game/ — 纯逻辑层统一入口
 *
 * 外部层（PIXI / Vue / Bridge）只从这个文件导入游戏逻辑，
 * 不直接引用子模块，确保合约边界清晰。
 *
 * 子模块索引：
 *   constants.js  — 角色数据、阶段/步骤常量、工具函数
 *   deck.js       — 扑克牌创建/洗牌/抽牌/墓地重构
 *   gameState.js  — 状态创建 + 初始化 + 回合推进 + 统一导出
 *   player.js     — Player 工厂函数
 *   serialize.js  — 存档/读档
 *   combat.js     — 攻击/防御
 *   gamble.js     — 赌命
 *   damage.js     — 伤害结算/死亡/游戏结束
 *   skills.js     — 技能路由 + 各角色实现
 *   alliance.js   — 结盟/背刺
 *   caiyueang.js  — 菜月昴死亡回归
 *   ai/index.js   — AI 决策（easy/skilled/hell）
 *   weather.js    — 天气牌堆
 *   matchState.js — 比赛状态机（世界杯）
 *   worldCup.js   — 世界杯赛程
 *   league.js     — 联赛状态机
 *   leagueConstants.js — 联赛常量（球队/赛程）
 */

// ── constants.js ──
export {
  SUITS,
  RANKS,
  RANK_VALUES,
  PHASE,
  STEP,
  MOON_NAMES,
  CHARACTERS,
  getCharData,
} from "./constants.js";

// ── deck.js ──
export {
  createFullDeck,
  shuffleDeck,
  drawCards,
  reshuffleFromGrave,
  cardDisplay,
} from "./deck.js";

// ── gameState.js ──
export {
  // 核心 API
  createGameState,
  initGame,
  currentPlayer,
  addLog,
  ensureDeck,
  endAction,
  // 存档
  serializeGameState,
  deserializeGameState,
  // 子模块 re-export（向后兼容）
  applyDamage,
  dissolveAlliance,
  checkGameOver,
  alivePlayers,
  getCurrentWeather,
  getNextWeather,
  startAttack,
  executeAttack,
  executeDefense,
  executeGamble,
  submitGamble,
  canUseSkill,
  executeSkill,
  executeRaidenSkill,
  executeFurinaSwap,
  executeFenjinSkill,
  executeLiniyaSkill,
  executeAimiliyaSkill,
  submitNahidaScry,
  executeSkillCaiyueang,
  startAlly,
  executeAlly,
  executeBetray,
  getAllianceTargets,
  executeCaiyueangSave,
  executeCaiyueangLoad,
} from "./gameState.js";

// ── ai ──
export {
  isAiPlayer,
  decideTopAction,
  decideTarget,
  decideGamblePick,
  decideNahidaOrder,
  decideLiniyaChoice,
  decideCaiyueangChoice,
} from "./ai/index.js";

// ── league ──
export {
  createLeagueState,
  getTeamTier,
  getCardBonus,
  getRoundMatches,
  getPlayerMatchForRound,
  isPlayerHome,
  getPlayerOpponent,
  simulateNonPlayerMatches,
  simulateMatch,
  recordMatchResult,
  getMatchResult,
  getPlayerResult,
  calculateStandings,
  isLeagueFinished,
  checkTiebreakerNeeded,
  calculateMatchScore,
} from "./league.js";

// ── leagueConstants ──
export {
  LEAGUE_TEAMS,
  TIER_LABELS,
  TIER_1,
  TIER_2,
  TIER_3,
  LEAGUE_MATCH_CONFIG,
  RANK_POINTS,
  LEAGUE_POINTS,
  TOTAL_ROUNDS,
  LEAGUE_SCHEDULE,
} from "./leagueConstants.js";
