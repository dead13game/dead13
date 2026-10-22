// 骰子战争世锦赛 · 娱乐模式纯逻辑（零依赖，不引用 Vue/PIXI/GSAP/浏览器 API）
//
// 规则来源：update_log/骰子战争(1).txt
// - 固定 16 人名单（原神 8 + 崩铁 8），与经典对战角色仅名称重合、无任何机制关联
// - 首轮随机配对 → 每轮胜者重新随机抽签（完全随机，不做赛区规避，允许内战）
// - 八分之一决赛(8场) → 四分之一决赛(4场) → 半决赛(2场) → 决赛
// - 每局 30 轮常规时间：每轮先手、后手各掷一次骰子（2~12）
// - 骰子点数和权重：src/game/骰子概率.csv（见 diceProbabilities.js，两枚六面骰分布）
// - 每 10 轮一段（前段/中段/末段）输出数据对比；30 轮平局进入加赛，逐轮掷到分胜负
// - 对阵表写在前面的为先手，写在后面的为后手
// - 两种赛制（仅改局制，单局玩法不变）：
//   · 经典世锦赛：各阶段一局定胜负，决赛七局四胜
//   · 登神长阶：16进8 一局定胜负 / 8进4 五局三胜 / 4进2 十一局六胜 / 决赛十九局十胜

import { rollWeightedDice } from "./diceProbabilities.js";
import type { DiceMatch, DiceRoll, DiceSeries } from "./types.js";

export const TOTAL_ROUNDS = 30; // 常规时间轮数
export const SEGMENT_LEN = 10; // 每段轮数
export const FINAL_WINS = 4; // 经典世锦赛决赛七局四胜（= FORMATS.classic.wins.final）

/** 世锦赛阶段 id（state.phase 的取值，未开赛为 null） */
export type DiceWarPhaseId = "r16" | "qf" | "sf" | "final";

/** 掷骰 rng（默认 Math.random；测试注入可复现序列） */
export type RngFn = () => number;

/** 一种赛制 */
export interface DiceWarFormat {
  id: string;
  name: string;
  /** 阶段 → 该对阵需要赢下的局数 */
  wins: Record<string, number>;
}

/**
 * 赛制表：各阶段需赢下多少「局」才算拿下该对阵（晋级 / 夺冠）。
 * - classic：各阶段一局定胜负，决赛七局四胜。
 * - ladder（登神长阶）：16进8 一局定胜负；8进4 五局三胜；4进2 十一局六胜；决赛十九局十胜。
 */
export const FORMATS: Record<string, DiceWarFormat> = {
  classic: {
    id: "classic",
    name: "经典世锦赛",
    wins: { r16: 1, qf: 1, sf: 1, final: FINAL_WINS },
  },
  ladder: {
    id: "ladder",
    name: "登神长阶",
    wins: { r16: 1, qf: 3, sf: 6, final: 10 },
  },
};
export const DEFAULT_FORMAT = "classic";

/** 当前赛制配置（未知赛制回退经典） */
export function getFormat(state: DiceWarState | null): DiceWarFormat {
  return FORMATS[state?.format ?? ""] || FORMATS[DEFAULT_FORMAT];
}

/** 当前（或指定）阶段需赢下的局数；一局定胜负为 1 */
export function getWinTarget(
  state: DiceWarState,
  phase: string | null = state.phase,
): number {
  // String(phase) 与 JS 对象下标转换一致：null → "null"，未命中 → 1
  return getFormat(state).wins[String(phase)] ?? 1;
}

/** 局制文案：1 → "一局定胜负"；3 → "5局3胜"；6 → "11局6胜"；10 → "19局10胜" */
export function describeSeries(winTarget: number): string {
  if (!winTarget || winTarget <= 1) return "一局定胜负";
  return `${winTarget * 2 - 1}局${winTarget}胜`;
}

export const CAMPS = { GENSHIN: "原神", HSR: "崩铁" };

/** 名单里的一行 */
export interface RosterMember {
  name: string;
  camp: string;
  icon: string;
}

/** 固定 16 人名单（icon 与 images 文件夹对应） */
export const ROSTER: RosterMember[] = [
  { name: "芙宁娜", camp: CAMPS.GENSHIN, icon: "./images/芙宁娜.jpg" },
  { name: "莉奈娅", camp: CAMPS.GENSHIN, icon: "./images/莉奈娅.jpg" },
  { name: "哥伦比娅", camp: CAMPS.GENSHIN, icon: "./images/哥伦比亚.jpg" },
  { name: "钟离", camp: CAMPS.GENSHIN, icon: "./images/钟离.jpg" },
  { name: "雷电将军", camp: CAMPS.GENSHIN, icon: "./images/雷电将军.jpg" },
  { name: "纳西妲", camp: CAMPS.GENSHIN, icon: "./images/纳西妲.jpg" },
  { name: "万叶", camp: CAMPS.GENSHIN, icon: "./images/万叶.jpg" },
  { name: "温迪", camp: CAMPS.GENSHIN, icon: "./images/温迪.jpg" },
  { name: "刃", camp: CAMPS.HSR, icon: "./images/刃.jpg" },
  { name: "银狼", camp: CAMPS.HSR, icon: "./images/银狼.jpg" },
  { name: "风堇", camp: CAMPS.HSR, icon: "./images/风堇.jpg" },
  { name: "知更鸟", camp: CAMPS.HSR, icon: "./images/知更鸟.jpg" },
  { name: "流萤", camp: CAMPS.HSR, icon: "./images/流萤.jpg" },
  { name: "那刻夏", camp: CAMPS.HSR, icon: "./images/那刻夏.jpg" },
  { name: "白厄", camp: CAMPS.HSR, icon: "./images/白厄.jpg" },
  { name: "花火", camp: CAMPS.HSR, icon: "./images/花火.jpg" },
];

export const PHASE_ORDER: DiceWarPhaseId[] = ["r16", "qf", "sf", "final"];

/** 阶段文案（对阵标题 / 晋级名单标题） */
export interface PhaseMeta {
  name: string;
  matchupTitle: string;
  listTitle: string;
}

export const PHASE_META: Record<DiceWarPhaseId, PhaseMeta> = {
  r16: { name: "八分之一决赛", matchupTitle: "八分之一决赛对阵", listTitle: "八强名单" },
  qf: { name: "四分之一决赛", matchupTitle: "四分之一决赛对阵", listTitle: "四强名单" },
  sf: { name: "半决赛", matchupTitle: "半决赛对阵", listTitle: "决赛名单" },
  final: { name: "决赛", matchupTitle: "决赛对阵", listTitle: "冠军" },
};

export const SEGMENT_NAMES: Record<number, string> = { 1: "前段", 2: "中段", 3: "末段" };

/** 角色标签（解说员用，来自规则文档解说风格） */
export const CHARACTER_TAGS: Record<string, string> = {
  芙宁娜: "水神，早期亚军，中段断电，第十届复苏",
  莉奈娅: "GOAT，历史唯一三冠王（第2/5/6届）",
  哥伦比娅: "少女，第二个双冠王（第3/8届），内战内行外战不行",
  钟离: "老岩神，前段战神中段断电，两届亚军，单段96分纪录保持者",
  雷电将军: "断电将军，雷神归来，第九届冠军",
  纳西妲: "第四届0:3逆转夺冠，第七届重赛亚军",
  万叶: "第四届0:3被逆转的背景板，差一步美满",
  温迪: "老将",
  刃: "第一届冠军，崩铁初代GOAT",
  银狼: "天才神经刀，摔骰子冠军，磁力骰子事件主角（第七届冠军被取消后重赛恢复）",
  风堇: "加赛之王，差一步美满，两届亚军后第十届终夺冠",
  知更鸟: "稳定核心，纪录王，单场244分历史最高，第九届亚军",
  流萤: "末轮双1出局的「1+1绝杀」受害者",
  那刻夏: "小丑，嘴臭新人，禁赛哥（曾差一分赢GOAT后被禁赛5场）",
  白厄: "最蛆对局参与者（银狼 vs 白厄 184:186）",
  花火: "新人",
};

/** 历史纪录（解说员用） */
export const RECORDS = {
  singleSegment: 96, // 单段最高分（钟离第十届首轮对白厄）
  singleMatch: 244, // 单场最高分（知更鸟第十届首轮对刃）
};

/** 历届冠军（解说员用） */
export interface ChampionRecord {
  season: number;
  champion: string;
  runnerUp: string;
}

export const CHAMPIONS_HISTORY: ChampionRecord[] = [
  { season: 1, champion: "刃", runnerUp: "雷电将军" },
  { season: 2, champion: "莉奈娅", runnerUp: "芙宁娜" },
  { season: 3, champion: "哥伦比娅", runnerUp: "风堇" },
  { season: 4, champion: "纳西妲", runnerUp: "万叶" },
  { season: 5, champion: "莉奈娅", runnerUp: "哥伦比娅" },
  { season: 6, champion: "莉奈娅", runnerUp: "钟离" },
  { season: 7, champion: "银狼", runnerUp: "纳西妲" },
  { season: 8, champion: "哥伦比娅", runnerUp: "风堇" },
  { season: 9, champion: "雷电将军", runnerUp: "知更鸟" },
  { season: 10, champion: "风堇", runnerUp: "钟离" },
];

/** 单局结束摘要 */
export interface DiceWarMatchResult {
  aScore: number;
  bScore: number;
  winnerName: string;
  loserName: string;
  overtime: boolean;
}

/** 当前对阵的局分（不含 a/b 选手下标） */
export interface DiceSeriesScore {
  aWins: number;
  bWins: number;
  winTarget: number;
}

/**
 * 一场单局 —— 复用 types.ts 的 DiceMatch 契约。
 * （`result` / `seriesScore` 的形状已在 types.ts 里对齐为 `DiceMatchResult` / `DiceSeriesScore`，
 *  下面的本地接口与它们结构相同，保留是为了不破坏本文件的既有导入路径。）
 */
export interface DiceWarMatch extends Omit<DiceMatch, "result" | "seriesScore"> {
  result: DiceWarMatchResult | null;
  seriesScore: DiceSeriesScore | null;
}

/** 已结束的单局记录（state.finishedMatches 的一行） */
export interface FinishedMatchSide {
  name: string;
  camp: string;
  icon: string;
  score: number;
}

export interface FinishedMatchRecord {
  matchNo: number;
  phase: DiceWarPhaseId | null;
  a: FinishedMatchSide;
  b: FinishedMatchSide;
  winner: string;
  overtime: boolean;
  /** 多局阶段记录局分，一局定胜负为 null */
  sets: { aWins: number; bWins: number } | null;
}

/** 世锦赛状态（独立于 GameState，由 diceWar UI 持有） */
export interface DiceWarState {
  format: string;
  phase: DiceWarPhaseId | null;
  matchups: DiceSeries[];
  matchIndex: number;
  advancers: number[];
  finishedMatches: FinishedMatchRecord[];
  champion: number | null;
  series: DiceSeries | null;
  currentMatch: DiceWarMatch | null;
  matchCounter: number;
}

/** 段内得分摘要 */
export interface SegmentSummary {
  seg: number;
  from: number;
  to: number;
  a: number;
  b: number;
  totalA: number;
  totalB: number;
}

/** rollDice 的返回值 */
export interface DiceRollResult {
  player: "a" | "b";
  value: number;
}

/** 当前对阵的系列赛局分（含选手下标） */
export interface SeriesScoreView {
  aWins: number;
  bWins: number;
  winTarget: number;
  a: number;
  b: number;
}

/**
 * 掷一次骰子，返回 2~12。
 * 权重以 src/game/骰子概率.csv 为准（rollWeightedDice 按权重采样）。
 */
export function rollTwoDice(rng: RngFn = Math.random): number {
  return rollWeightedDice(rng);
}

/** Fisher-Yates 洗牌（可选注入 rng，测试用） */
function shuffle<T>(arr: readonly T[], rng: RngFn = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 一组对阵（系列赛）：aWins/bWins 为该对阵内的局分 */
function makeSeries(a: number, b: number): DiceSeries {
  return { a, b, aWins: 0, bWins: 0 };
}

/** 相邻两两配对（每对包装成系列赛对象） */
function pairPlayers(indices: readonly number[]): DiceSeries[] {
  const pairs: DiceSeries[] = [];
  for (let i = 0; i < indices.length; i += 2) {
    pairs.push(makeSeries(indices[i], indices[i + 1]));
  }
  return pairs;
}

/** 创建世锦赛状态 */
export function createDiceWar(format: string = DEFAULT_FORMAT): DiceWarState {
  return {
    format: FORMATS[format] ? format : DEFAULT_FORMAT, // classic | ladder
    phase: null, // null | r16 | qf | sf | final
    matchups: [], // 当前阶段对阵 [{ a, b, aWins, bWins }]（roster 索引 + 局分）
    matchIndex: -1,
    advancers: [], // 已晋级者（roster 索引）
    finishedMatches: [], // 已结束单局记录
    champion: null, // 冠军（roster 索引）
    series: null, // 当前正在进行的对阵系列赛（matchups[matchIndex]）
    currentMatch: null,
    matchCounter: 0, // 全局对局计数（含系列赛每一局）
  };
}

/** 开赛：洗牌 → 16 人两两配对 → 八分之一决赛 */
export function startTournament(
  state: DiceWarState,
  rng: RngFn = Math.random,
  format: string = state.format || DEFAULT_FORMAT,
): void {
  state.format = FORMATS[format] ? format : DEFAULT_FORMAT;
  state.phase = "r16";
  state.matchups = pairPlayers(
    shuffle(ROSTER.map((_, i) => i), rng),
  );
  state.matchIndex = -1;
  state.advancers = [];
  state.finishedMatches = [];
  state.champion = null;
  state.series = null;
  state.currentMatch = null;
  state.matchCounter = 0;
}

function createMatch(state: DiceWarState, aIdx: number, bIdx: number): DiceWarMatch {
  state.matchCounter++;
  const mk = (idx: number) => ({
    idx,
    name: ROSTER[idx].name,
    camp: ROSTER[idx].camp,
    icon: ROSTER[idx].icon,
    score: 0,
  });
  return {
    matchNo: state.matchCounter,
    a: mk(aIdx),
    b: mk(bIdx),
    round: 0, // 已完成轮数
    phase: "rollA", // rollA(等先手) | rollB(等后手) | segment(段间对比) | over(结束)
    aRoll: null, // 本轮先手已掷值（未结算）
    bRoll: null, // 本轮后手已掷值（未结算）
    lastRoll: null, // 最近一轮结果 { round, a, b }
    rolls: [], // [{ round, a, b }]（含加赛轮）
    overtime: false,
    tieEntered: false, // 本轮进入加赛（UI 提示"双方战平"）
    winner: null, // 'a' | 'b'
    result: null, // 结束摘要
    seriesScore: null, // 本局结束后当前对阵的局分 { aWins, bWins, winTarget }
    seriesDone: false, // 本局是否终结了当前对阵（达 winTarget）
  };
}

/** 一局结束：记局分；达 winTarget 则对阵落定（非决赛晋级 / 决赛夺冠） */
function finishMatch(state: DiceWarState): void {
  // 只在 rollDice 判定出胜负时调用，此时当前局必然存在；`!` 仅做类型收窄
  const m = state.currentMatch!;
  m.winner = m.a.score >= m.b.score ? "a" : "b";
  m.phase = "over";
  const winKey = m.winner;
  const loseKey = winKey === "a" ? "b" : "a";
  m.result = {
    aScore: m.a.score,
    bScore: m.b.score,
    winnerName: m[winKey].name,
    loserName: m[loseKey].name,
    overtime: m.overtime,
  };

  const winTarget = getWinTarget(state);
  const series = state.series || state.matchups[state.matchIndex];
  if (series) {
    if (winKey === "a") series.aWins++;
    else series.bWins++;
  }
  const aWins = series ? series.aWins : 0;
  const bWins = series ? series.bWins : 0;
  m.seriesScore = { aWins, bWins, winTarget };
  m.seriesDone = aWins >= winTarget || bWins >= winTarget;

  const record: FinishedMatchRecord = {
    matchNo: m.matchNo,
    phase: state.phase,
    a: { name: m.a.name, camp: m.a.camp, icon: m.a.icon, score: m.a.score },
    b: { name: m.b.name, camp: m.b.camp, icon: m.b.icon, score: m.b.score },
    winner: m[winKey].name,
    overtime: m.overtime,
    sets: winTarget > 1 ? { aWins, bWins } : null, // 多局阶段记录局分
  };
  state.finishedMatches.push(record);

  if (m.seriesDone) {
    if (state.phase === "final") {
      state.champion = m[winKey].idx;
    } else {
      state.advancers.push(m[winKey].idx);
    }
  }
}

/** 阶段推进：胜者重新随机抽签（保留 series 供大比分展示） */
function advancePhase(state: DiceWarState, rng: RngFn = Math.random): boolean {
  if (state.phase === "final") {
    // 决赛阶段已打完：冠军已在 finishMatch 判定（保留 series 供冠军页展示）
    if (state.champion == null && state.series) {
      state.champion =
        state.series.aWins >= state.series.bWins ? state.series.a : state.series.b;
    }
    state.currentMatch = null;
    return false; // 锦标赛结束
  }
  // 未开赛(null) 时 indexOf 也是 -1 → +1 后落在 r16，与原实现一致
  const nextIdx =
    (state.phase == null ? -1 : PHASE_ORDER.indexOf(state.phase)) + 1;
  state.phase = PHASE_ORDER[nextIdx];
  if (state.phase === "final") {
    state.matchups = [makeSeries(state.advancers[0], state.advancers[1])];
  } else {
    state.matchups = pairPlayers(shuffle(state.advancers, rng));
  }
  state.advancers = [];
  state.matchIndex = -1;
  state.series = null;
  return true;
}

/**
 * 开始下一场（同一对阵未定胜负则继续下一局）。
 * - 返回新建的 match：本阶段还有对阵，或当前对阵还有下一局。
 * - 返回 null：两种情况——
 *   ① 阶段已打完并推进到下一阶段（matchups 已生成，尚未开赛，由 UI 展示晋级名单后再次调用本函数开第一场）；
 *   ② 锦标赛已结束（冠军已产生）。
 *   调用方通过 state.champion 是否非空区分。
 */
export function startNextMatch(
  state: DiceWarState,
  rng: RngFn = Math.random,
): DiceWarMatch | null {
  const winTarget = getWinTarget(state);

  if (state.matchIndex < 0) {
    // 阶段第一个对阵：开赛
    if (!state.matchups.length) return null;
    state.matchIndex = 0;
  } else {
    // 当前对阵已分出胜负（达 winTarget）→ 进入下一个对阵
    const cur = state.matchups[state.matchIndex];
    const done = !!cur && (cur.aWins >= winTarget || cur.bWins >= winTarget);
    if (done) {
      state.matchIndex++;
      if (state.matchIndex >= state.matchups.length) {
        // 本阶段打完 → 推进阶段（本调用不开赛）
        if (!advancePhase(state, rng)) {
          state.currentMatch = null;
          return null; // 锦标赛结束（冠军已产生）
        }
        state.currentMatch = null;
        return null; // 阶段已推进，等 UI 展示晋级名单后再开第一场
      }
    }
  }

  const series = state.matchups[state.matchIndex];
  state.series = series;
  state.currentMatch = createMatch(state, series.a, series.b);
  return state.currentMatch;
}

/**
 * 掷一次骰子：依次给先手、后手。返回 { player, value }；非掷骰阶段返回 null。
 */
export function rollDice(
  state: DiceWarState,
  rng: RngFn = Math.random,
): DiceRollResult | null {
  const m = state.currentMatch;
  if (!m || m.phase === "over") return null;

  if (m.phase === "rollA") {
    m.aRoll = rollTwoDice(rng);
    m.phase = "rollB";
    return { player: "a", value: m.aRoll };
  }
  if (m.phase === "rollB") {
    m.bRoll = rollTwoDice(rng);
    // rollB 阶段 aRoll 必然已掷出；`?? 0` 与 JS 的 `x += null`（= +0）等价
    m.a.score += m.aRoll ?? 0;
    m.b.score += m.bRoll;
    m.round++;
    const roll: DiceRoll = { round: m.round, a: m.aRoll ?? 0, b: m.bRoll };
    m.lastRoll = roll;
    m.rolls.push(roll);
    m.aRoll = null;
    m.bRoll = null;

    if (m.overtime) {
      // 加赛：直到一方领先
      if (m.a.score === m.b.score) m.phase = "rollA";
      else finishMatch(state);
    } else if (m.round >= TOTAL_ROUNDS) {
      if (m.a.score === m.b.score) {
        // 常规时间结束平局 → 加赛
        m.overtime = true;
        m.tieEntered = true;
        m.phase = "rollA";
      } else {
        finishMatch(state);
      }
    } else if (m.round % SEGMENT_LEN === 0) {
      m.phase = "segment"; // 前段/中段对比 + 解说
    } else {
      m.phase = "rollA";
    }
    return { player: "b", value: roll.b };
  }
  return null;
}

/**
 * 连续掷骰：最多掷 n 次（每 2 次完成 1 轮）。
 * 「10连」语义：n=20 = 快进 10 轮；但掷骰途中若进入 AI 解说挂起状态
 * （段间对比 segment / 单局结束 over，含加赛分胜负）立即停止——不能越过
 * 解说点继续快进。返回实际掷骰次数。
 * @param state 世锦赛状态
 * @param n 最多掷骰次数
 * @param rng 随机源（默认 Math.random）
 * @returns 实际掷骰次数（可能小于 n：撞解说点提前停 / 无可掷）
 */
export function rollDiceN(
  state: DiceWarState,
  n: number,
  rng: RngFn = Math.random,
): number {
  let rolled = 0;
  while (rolled < n) {
    const r = rollDice(state, rng);
    if (!r) break; // 非掷骰阶段 / 单局已结束，无可掷
    rolled++; // 每次掷出都计入完成次数
    const m = state.currentMatch;
    // 本轮掷出后进入解说挂起状态 → 停，把解说点完整留给 UI
    if (m && (m.phase === "segment" || m.phase === "over")) break;
  }
  return rolled;
}

/** 段间对比展示后继续 */
export function continueAfterSegment(state: DiceWarState): void {
  const m = state.currentMatch;
  if (m && m.phase === "segment") m.phase = "rollA";
}

/** 某段（1前/2中/3末）的段内得分与截至该段的总分 */
export function getSegmentSummary(match: DiceWarMatch, seg: number): SegmentSummary {
  const from = (seg - 1) * SEGMENT_LEN + 1;
  const to = seg * SEGMENT_LEN;
  const rows = match.rolls.filter((r) => r.round >= from && r.round <= to);
  const a = rows.reduce((s, r) => s + r.a, 0);
  const b = rows.reduce((s, r) => s + r.b, 0);
  const totalA = match.rolls
    .filter((r) => r.round <= to)
    .reduce((s, r) => s + r.a, 0);
  const totalB = match.rolls
    .filter((r) => r.round <= to)
    .reduce((s, r) => s + r.b, 0);
  return { seg, from, to, a, b, totalA, totalB };
}

/** 当前对局标签：多局阶段 "第N局"，单局阶段 "第N场" */
export function getMatchupLabel(state: DiceWarState): string {
  const winTarget = getWinTarget(state);
  if (winTarget > 1 && state.series) {
    const n = state.series.aWins + state.series.bWins + 1;
    return `第${n}局`;
  }
  return `第${state.matchIndex + 1}场`;
}

/** 分差描述：如 "风堇领先 2 分" / "双方持平" */
export function describeGap(
  aName: string,
  aScore: number,
  bName: string,
  bScore: number,
): string {
  if (aScore === bScore) return "双方持平";
  const lead = aScore > bScore ? aName : bName;
  return `${lead}领先 ${Math.abs(aScore - bScore)} 分`;
}

/**
 * 当前对阵的系列赛局分 { aWins, bWins, winTarget, a, b }。
 * 单局阶段（一局定胜负）或未开赛返回 null。
 */
export function getSeriesScore(state: DiceWarState): SeriesScoreView | null {
  const winTarget = getWinTarget(state);
  if (winTarget <= 1) return null;
  const s = state.series;
  if (!s) return null;
  return { aWins: s.aWins, bWins: s.bWins, winTarget, a: s.a, b: s.b };
}
