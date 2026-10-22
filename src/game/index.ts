/**
 * src/game — 纯逻辑层唯一对外入口
 *
 * 分层:
 *   core/         零依赖基础(牌、随机、玩家数据、常量、日志分类)
 *   rules/        纯规则(加成管道、伤害、陷阱、联盟、天气、圣遗物)
 *   characters/   角色插件(每角色一个模块 + registry)
 *   flow/         ctx / pending / turn / commands / setup(唯一写状态的地方)
 *   modes/        classic / match / league / worldcup 适配器
 *   persistence/  存档 schema 与快照
 *
 * UI 只允许:
 *   createSession → dispatch(命令) → buildView(只读视图) → save/load
 *
 * 赛程/积分等数据编排仍由 league.js / worldCup.js 提供,按需直接 import。
 */

export {
  createSession,
  dispatch,
  save,
  load,
  rewireContext,
  createGameState,
  initGame,
} from "./api.js";

export { buildView, attachCtx, getCtx } from "./view.js";

export {
  CHARACTERS,
  CHARACTER_DEFS,
  getCharacter,
  getCharData,
  characterStateFor,
  selectableIds,
} from "./characters/index.js";

export {
  PHASE,
  STEP,
  MOON_NAMES,
  SUITS,
  RANKS,
  RANK_VALUES,
} from "./core/constants.js";

export { ARTIFACTS, getArtifactData } from "./rules/artifacts.js";

export { createClassicMode } from "./modes/classic.js";
export { createMatchMode } from "./modes/match.js";
export { createLeagueMatchMode } from "./modes/league.js";
export { createWorldCupMatchMode } from "./modes/worldcup.js";
