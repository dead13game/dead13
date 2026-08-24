// 骰子战争世锦赛 · 娱乐模式纯逻辑（零依赖，不引用 Vue/PIXI/GSAP/浏览器 API）
//
// 规则来源：update_log/骰子战争(1).txt
// - 固定 16 人名单（原神 8 + 崩铁 8），与经典对战角色仅名称重合、无任何机制关联
// - 首轮随机配对 → 每轮胜者重新随机抽签（完全随机，不做赛区规避，允许内战）
// - 八分之一决赛(8场) → 四分之一决赛(4场) → 半决赛(2场) → 决赛(七局四胜)
// - 每局 30 轮常规时间：每轮先手、后手各掷一次骰子（2~12）
// - 骰子点数和权重：update_log/骰子概率.csv（见 diceProbabilities.js，两枚六面骰分布）
// - 每 10 轮一段（前段/中段/末段）输出数据对比；30 轮平局进入加赛，逐轮掷到分胜负
// - 对阵表写在前面的为先手，写在后面的为后手

import { rollWeightedDice } from "./diceProbabilities.js";

export const TOTAL_ROUNDS = 30; // 常规时间轮数
export const SEGMENT_LEN = 10; // 每段轮数
export const FINAL_WINS = 4; // 决赛七局四胜

export const CAMPS = { GENSHIN: "原神", HSR: "崩铁" };

/** 固定 16 人名单（icon 与 images 文件夹对应） */
export const ROSTER = [
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

export const PHASE_ORDER = ["r16", "qf", "sf", "final"];
export const PHASE_META = {
  r16: { name: "八分之一决赛", matchupTitle: "八分之一决赛对阵", listTitle: "八强名单" },
  qf: { name: "四分之一决赛", matchupTitle: "四分之一决赛对阵", listTitle: "四强名单" },
  sf: { name: "半决赛", matchupTitle: "半决赛对阵", listTitle: "决赛名单" },
  final: { name: "决赛", matchupTitle: "决赛对阵", listTitle: "冠军" },
};

export const SEGMENT_NAMES = { 1: "前段", 2: "中段", 3: "末段" };

/** 角色标签（解说员用，来自规则文档解说风格） */
export const CHARACTER_TAGS = {
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
export const CHAMPIONS_HISTORY = [
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

/**
 * 掷一次骰子，返回 2~12。
 * 权重以 update_log/骰子概率.csv 为准（rollWeightedDice 按权重采样）。
 */
export function rollTwoDice(rng = Math.random) {
  return rollWeightedDice(rng);
}

/** Fisher-Yates 洗牌（可选注入 rng，测试用） */
function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 相邻两两配对 */
function pairPlayers(indices) {
  const pairs = [];
  for (let i = 0; i < indices.length; i += 2) {
    pairs.push({ a: indices[i], b: indices[i + 1] });
  }
  return pairs;
}

/** 创建世锦赛状态 */
export function createDiceWar() {
  return {
    phase: null, // null | r16 | qf | sf | final
    matchups: [], // 当前阶段对阵 [{ a, b }]（roster 索引）
    matchIndex: -1,
    advancers: [], // 已晋级者（roster 索引）
    finishedMatches: [], // 已结束单局记录
    champion: null, // 冠军（roster 索引）
    series: null, // 决赛 series { a, b, aWins, bWins }
    currentMatch: null,
    matchCounter: 0, // 全局对局计数（含决赛每一局）
  };
}

/** 开赛：洗牌 → 16 人两两配对 → 八分之一决赛 */
export function startTournament(state, rng = Math.random) {
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

function createMatch(state, aIdx, bIdx) {
  state.matchCounter++;
  const mk = (idx) => ({
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
  };
}

/** 结束当前单局：记录 + 晋级 / 决赛局分 */
function finishMatch(state) {
  const m = state.currentMatch;
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

  const record = {
    matchNo: m.matchNo,
    phase: state.phase,
    a: { name: m.a.name, camp: m.a.camp, icon: m.a.icon, score: m.a.score },
    b: { name: m.b.name, camp: m.b.camp, icon: m.b.icon, score: m.b.score },
    winner: m[winKey].name,
    overtime: m.overtime,
    sets: null,
  };
  state.finishedMatches.push(record);

  if (state.phase === "final") {
    if (winKey === "a") state.series.aWins++;
    else state.series.bWins++;
    record.sets = { aWins: state.series.aWins, bWins: state.series.bWins };
    if (state.series.aWins >= FINAL_WINS || state.series.bWins >= FINAL_WINS) {
      state.champion =
        state.series.aWins >= FINAL_WINS ? state.series.a : state.series.b;
    }
  } else {
    state.advancers.push(m[winKey].idx);
  }
}

/** 阶段推进：胜者重新随机抽签；进入决赛时建立七局四胜 series */
function advancePhase(state, rng = Math.random) {
  if (state.phase === "final") {
    state.champion =
      state.series.aWins >= FINAL_WINS ? state.series.a : state.series.b;
    state.currentMatch = null;
    return false; // 锦标赛结束
  }
  const nextIdx = PHASE_ORDER.indexOf(state.phase) + 1;
  state.phase = PHASE_ORDER[nextIdx];
  if (state.phase === "final") {
    state.series = {
      a: state.advancers[0],
      b: state.advancers[1],
      aWins: 0,
      bWins: 0,
    };
    state.matchups = [{ a: state.series.a, b: state.series.b }];
  } else {
    state.matchups = pairPlayers(shuffle(state.advancers, rng));
  }
  state.advancers = [];
  state.matchIndex = -1;
  return true;
}

/**
 * 开始下一场（或决赛的下一局）。
 * 返回新建的 match；锦标赛已结束返回 null。
 */
export function startNextMatch(state, rng = Math.random) {
  // 决赛：同一对选手继续下一局，直到一方 4 胜
  if (state.phase === "final" && state.series) {
    if (state.series.aWins < FINAL_WINS && state.series.bWins < FINAL_WINS) {
      state.matchIndex = 0;
      state.currentMatch = createMatch(state, state.series.a, state.series.b);
      return state.currentMatch;
    }
    state.currentMatch = null;
    return null;
  }

  state.matchIndex++;
  if (state.matchIndex >= state.matchups.length) {
    if (!advancePhase(state, rng)) return null; // 锦标赛结束
    return startNextMatch(state, rng);
  }
  const { a, b } = state.matchups[state.matchIndex];
  state.currentMatch = createMatch(state, a, b);
  return state.currentMatch;
}

/**
 * 掷一次骰子：依次给先手、后手。返回 { player, value }；非掷骰阶段返回 null。
 */
export function rollDice(state, rng = Math.random) {
  const m = state.currentMatch;
  if (!m || m.phase === "over") return null;

  if (m.phase === "rollA") {
    m.aRoll = rollTwoDice(rng);
    m.phase = "rollB";
    return { player: "a", value: m.aRoll };
  }
  if (m.phase === "rollB") {
    m.bRoll = rollTwoDice(rng);
    m.a.score += m.aRoll;
    m.b.score += m.bRoll;
    m.round++;
    m.lastRoll = { round: m.round, a: m.aRoll, b: m.bRoll };
    m.rolls.push(m.lastRoll);
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
    return { player: "b", value: m.lastRoll.b };
  }
  return null;
}

/** 段间对比展示后继续 */
export function continueAfterSegment(state) {
  const m = state.currentMatch;
  if (m && m.phase === "segment") m.phase = "rollA";
}

/** 某段（1前/2中/3末）的段内得分与截至该段的总分 */
export function getSegmentSummary(match, seg) {
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

/** 当前对局标签：非决赛 "第N场"，决赛 "第N局" */
export function getMatchupLabel(state) {
  if (state.phase === "final") {
    const s = state.series;
    const n = s ? s.aWins + s.bWins + 1 : 1;
    return `第${n}局`;
  }
  return `第${state.matchIndex + 1}场`;
}

/** 分差描述：如 "风堇领先 2 分" / "双方持平" */
export function describeGap(aName, aScore, bName, bScore) {
  if (aScore === bScore) return "双方持平";
  const lead = aScore > bScore ? aName : bName;
  return `${lead}领先 ${Math.abs(aScore - bScore)} 分`;
}

/** 决赛大比分 { aWins, bWins }，非决赛返回 null */
export function getSeriesScore(state) {
  return state.series ? { aWins: state.series.aWins, bWins: state.series.bWins } : null;
}
