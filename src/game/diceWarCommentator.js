// 骰子战争世锦赛 · 解说员（纯逻辑，零依赖）
//
// 每 10 轮（一段）触发一次解说：根据当前赛场状态构造发给 LLM 的请求参数
// （系统提示词 + 赛场 JSON 快照）。实际网络请求由 Vue 层发起（浏览器 fetch）。
//
// 解说风格与历史背景：见 update_log/骰子战争(1).txt 第九节

import {
  ROSTER,
  CHARACTER_TAGS,
  RECORDS,
  CHAMPIONS_HISTORY,
  PHASE_META,
  TOTAL_ROUNDS,
  SEGMENT_NAMES,
  describeGap,
  getSegmentSummary,
  getMatchupLabel,
} from "./diceWar.js";

/** roster 索引 → 名字 */
function rosterName(idx) {
  return ROSTER[idx]?.name || "";
}

/** 解说触发时机 */
export const KIND = {
  PRE: "pre", // 前段（第1-10轮）：只给数据，情绪铺垫
  MID: "mid", // 中段（第11-20轮）：数据 + 粗略胜率估算 + 口语化
  FINAL: "final", // 末段（第21-30轮/比赛结束）：宣布结果
  OVERTIME: "overtime", // 加赛结束
  CHAMPION: "champion", // 决赛结束，冠军诞生
};

const SYSTEM_BASE = `你是一名"骰子战争世锦赛"官方赛场解说员。解说风格要求：
1. 口语化、情绪化、网络化：常用"我草、拉完了、太顶了、杀疯了、背景板、名场面、差一步美满、封神、脸都不要了、小丑、狂起来了、这还玩个蛋、蛆"等。
2. 表情符号适量：🎲🔥😭🤣👑⚡🌬️⛰️。
3. 爱贴标签、玩梗（角色标签在数据里），重视历史纪录和宿命感，经常说"差一步美满""熬出来的冠军""这不是奇迹，是命硬"。
4. 特殊事件（爆冷、破纪录）要加大情绪，突出历史意义。
5. 只输出解说词本身（2~4 句话，60~120 字），不要输出 JSON，不要用 Markdown，不要自称 AI。`;

const SEGMENT_RULES = {
  [KIND.PRE]:
    "现在是【前段】解说（第1-10轮刚结束）：只给数据，不计算胜率，做情绪铺垫，为后面的比赛造势。",
  [KIND.MID]:
    "现在是【中段】解说（第11-20轮刚结束）：给数据 + 粗略胜率估算 + 口语化解说，别太早下结论。",
  [KIND.FINAL]:
    "现在是【末段】解说（第21-30轮刚结束/比赛结束）：宣布比赛结果；若比分打平则说明进入加赛。若这是决赛的一局，同时播报大比分（七局四胜制，先赢4局者夺冠）。",
  [KIND.OVERTIME]:
    "比赛进入【加赛】并已结束：宣布加赛结果（谁加赛胜出），突出戏剧性和宿命感。若这是决赛的一局，同时播报大比分。",
  [KIND.CHAMPION]:
    "【决赛结束】新的冠军诞生：盛大庆祝冠军，结合角色标签与历届冠军回顾其历史地位（三冠王、首冠、复仇、苦尽甘来等）。",
};

/** 特殊事件检测（爆冷/破纪录/加赛/一分之差等） */
function detectEvents(state, match, kind) {
  const events = [];

  if (kind === KIND.PRE || kind === KIND.MID) {
    const seg = kind === KIND.PRE ? 1 : 2;
    const s = getSegmentSummary(match, seg);
    if (Math.max(s.a, s.b) > RECORDS.singleSegment) {
      events.push(`打破单段纪录（原纪录 ${RECORDS.singleSegment} 分）`);
    }
  }
  if (kind === KIND.FINAL) {
    const s = getSegmentSummary(match, 3);
    if (Math.max(s.a, s.b) > RECORDS.singleSegment) {
      events.push(`打破单段纪录（原纪录 ${RECORDS.singleSegment} 分）`);
    }
    if (match.a.score + match.b.score > RECORDS.singleMatch) {
      events.push(`打破单场总分纪录（原纪录 ${RECORDS.singleMatch} 分）`);
    }
    if (Math.abs(match.a.score - match.b.score) === 1) {
      events.push("一分之差，差一步美满");
    }
    if (match.overtime) events.push("常规时间战平，经历加赛");
  }
  if (kind === KIND.OVERTIME) events.push("常规时间战平，加赛分出胜负");
  if (kind === KIND.CHAMPION && state.series) {
    const { aWins, bWins } = state.series;
    const winnerKey = aWins >= bWins ? "a" : "b";
    const winner = state.series[winnerKey];
    if (aWins === 4 && bWins === 3) {
      events.push(`决赛打满七局，${rosterName(winner)}以4:3绝杀取胜`);
    }
    if (Math.min(aWins, bWins) === 0) events.push("决赛横扫，未失一局");
    const hist = CHAMPIONS_HISTORY.filter((h) => h.champion === rosterName(winner));
    if (hist.length >= 3) events.push(`历史第 ${hist.length} 冠，冲击GOAT地位`);
    else if (hist.length === 1) events.push("再次登顶，第二冠");
  }
  return events;
}

/**
 * 构造 AI 解说请求参数。
 * @param {object} state 世锦赛状态
 * @param {object} match 当前单局
 * @param {string} kind KIND.*
 * @returns {{ system: string, user: string }}
 */
export function buildCommentaryRequest(state, match, kind) {
  const seg = kind === KIND.PRE ? 1 : kind === KIND.MID ? 2 : kind === KIND.FINAL ? 3 : null;
  const segSummary = seg ? getSegmentSummary(match, seg) : null;

  const snapshot = {
    赛事: "骰子战争世锦赛",
    阶段: state.phase ? PHASE_META[state.phase].name : "",
    对局: `${match.a.name} VS ${match.b.name}`,
    对局标签: getMatchupLabel(state),
    当前轮数: match.round,
    段位: seg ? `${SEGMENT_NAMES[seg]}（第${segSummary.from}-${segSummary.to}轮）` : kind === KIND.OVERTIME ? "加赛" : "决赛",
    比分: {
      [match.a.name]: match.a.score,
      [match.b.name]: match.b.score,
    },
    段内得分: segSummary
      ? { [match.a.name]: segSummary.a, [match.b.name]: segSummary.b }
      : undefined,
    分差: describeGap(match.a.name, match.a.score, match.b.name, match.b.score),
    剩余轮数: Math.max(0, TOTAL_ROUNDS - match.round),
    角色标签: {
      [match.a.name]: CHARACTER_TAGS[match.a.name] || "",
      [match.b.name]: CHARACTER_TAGS[match.b.name] || "",
    },
    历史纪录: RECORDS,
    特殊事件: detectEvents(state, match, kind),
    决赛大比分:
      state.phase === "final" && state.series
        ? {
            [rosterName(state.series.a)]: state.series.aWins,
            [rosterName(state.series.b)]: state.series.bWins,
          }
        : undefined,
    历届冠军: CHAMPIONS_HISTORY,
  };
  if (kind === KIND.CHAMPION && state.champion != null) {
    snapshot.冠军 = rosterName(state.champion);
  }

  const system = `${SYSTEM_BASE}\n${SEGMENT_RULES[kind] || ""}`;
  const user = JSON.stringify(snapshot, null, 2);
  return { system, user };
}
