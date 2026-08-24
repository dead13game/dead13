import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  ROSTER,
  PHASE_ORDER,
  TOTAL_ROUNDS,
  SEGMENT_LEN,
  FINAL_WINS,
  CAMPS,
  createDiceWar,
  startTournament,
  startNextMatch,
  rollDice,
  rollTwoDice,
  continueAfterSegment,
  getSegmentSummary,
  getMatchupLabel,
  describeGap,
  getSeriesScore,
} from "./diceWar.js";
import { KIND, buildCommentaryRequest } from "./diceWarCommentator.js";
import {
  DICE_WEIGHTS,
  DICE_BOUNDS,
  DICE_TOTAL,
  parseDiceWeights,
  rollWeightedDice,
} from "./diceProbabilities.js";

/**
 * 生成可复现的 rng：掷出指定点数和（2~12）。
 * 基于 骰子概率.csv 的累计权重区间，取桶中点，与 rollWeightedDice 完全一致。
 */
function diceRng(sum) {
  const b = DICE_BOUNDS.find((x) => x.sum === sum);
  if (!b) throw new Error(`非法骰子点数: ${sum}`);
  return () => (b.lo + b.hi) / 2;
}

/** 打一轮：先手 aSum，后手 bSum（可复现） */
function playRound(state, aSum, bSum) {
  rollDice(state, diceRng(aSum));
  rollDice(state, diceRng(bSum));
}

/** 连续打 count 轮，段间自动继续（最后一轮若进入段间则保留，供断言） */
function playRounds(state, count, aSum, bSum) {
  for (let i = 0; i < count; i++) {
    playRound(state, aSum, bSum);
    const m = state.currentMatch;
    if (i < count - 1 && m.phase === "segment") continueAfterSegment(state);
  }
}

/** 模拟打完当前单局（随机骰子） */
function simulateMatch(state) {
  let guard = 0;
  while (state.currentMatch && state.currentMatch.phase !== "over" && guard < 300) {
    const m = state.currentMatch;
    if (m.phase === "rollA" || m.phase === "rollB") rollDice(state);
    else if (m.phase === "segment") continueAfterSegment(state);
    guard++;
  }
}

/** 构造一个"决赛阶段"状态（A=roster[0]，B=roster[1]） */
function craftFinal() {
  const s = createDiceWar();
  startTournament(s);
  s.phase = "final";
  s.advancers = [];
  s.series = { a: 0, b: 1, aWins: 0, bWins: 0 };
  s.matchups = [{ a: 0, b: 1 }];
  s.matchIndex = -1;
  s.currentMatch = null;
  return s;
}

describe("固定16人名单", () => {
  it("共 16 人，原神 8 + 崩铁 8", () => {
    expect(ROSTER.length).toBe(16);
    expect(ROSTER.filter((p) => p.camp === CAMPS.GENSHIN).length).toBe(8);
    expect(ROSTER.filter((p) => p.camp === CAMPS.HSR).length).toBe(8);
  });

  it("名字唯一，头像指向 images 文件夹且文件存在", () => {
    const names = new Set(ROSTER.map((p) => p.name));
    expect(names.size).toBe(16);
    for (const p of ROSTER) {
      expect(p.icon, `${p.name} 缺少 icon`).toMatch(/^\.\/images\//);
      const file = path.join(process.cwd(), p.icon.replace("./", ""));
      expect(existsSync(file), `${p.name} 头像缺失: ${p.icon}`).toBe(true);
    }
  });
});

describe("骰子", () => {
  it("掷骰结果在 2~12 之间（按 骰子概率.csv 权重）", () => {
    for (let i = 0; i < 500; i++) {
      const v = rollTwoDice();
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(12);
    }
  });

  it("diceRng 能精确控制骰子总和", () => {
    expect(rollDice({ currentMatch: { phase: "rollA", aRoll: null } }, diceRng(12))).toEqual({
      player: "a",
      value: 12,
    });
    expect(rollDice({ currentMatch: { phase: "rollA", aRoll: null } }, diceRng(2))).toEqual({
      player: "a",
      value: 2,
    });
  });
});

describe("骰子概率表（src/game/骰子概率.csv）", () => {
  it("CSV 解析出 2~12 的权重并升序排列", () => {
    const csv = "点数和,组合数,概率,大约概率\n2,1,1/36,2.78%\n3,2,2/36,5.56%\n12,1,1/36,2.78%\n7,6,6/36,16.67%\n";
    const w = parseDiceWeights(csv);
    expect(w.map((x) => x.sum)).toEqual([2, 3, 7, 12]);
    expect(w.map((x) => x.weight)).toEqual([1, 2, 6, 1]);
  });

  it("CSV 数据不足时返回 null（触发兜底）", () => {
    expect(parseDiceWeights("")).toBeNull();
    expect(parseDiceWeights("点数和,组合数\n2,x\n")).toBeNull();
  });

  it("生效权重表 = 经典双骰分布 1,2,3,4,5,6,5,4,3,2,1，组合总数 36", () => {
    expect(DICE_WEIGHTS.map((w) => w.weight)).toEqual([1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]);
    expect(DICE_WEIGHTS.map((w) => w.sum)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(DICE_TOTAL).toBe(36);
  });

  it("按权重采样：每个点数区间中点都能精确掷出对应点数", () => {
    for (const b of DICE_BOUNDS) {
      expect(rollWeightedDice(() => (b.lo + b.hi) / 2)).toBe(b.sum);
    }
  });

  it("权重采样边缘：0 与 0.999… 分别落在 2 与 12", () => {
    expect(rollWeightedDice(() => 0)).toBe(2);
    expect(rollWeightedDice(() => 0.999999)).toBe(12);
  });
});

describe("锦标赛结构", () => {
  it("首轮 16 人随机配对成 8 组，无重复", () => {
    const s = createDiceWar();
    startTournament(s, () => 0.5);
    expect(s.matchups.length).toBe(8);
    const seen = new Set();
    for (const { a, b } of s.matchups) {
      seen.add(a);
      seen.add(b);
    }
    expect(seen.size).toBe(16);
  });

  it("单局流程：先手→后手→轮次累加", () => {
    const s = createDiceWar();
    startTournament(s, () => 0.5);
    startNextMatch(s);
    const m = s.currentMatch;
    expect(m.phase).toBe("rollA");
    expect(getMatchupLabel(s)).toBe("第1场");

    const ra = rollDice(s, diceRng(8));
    expect(ra.player).toBe("a");
    expect(m.phase).toBe("rollB");

    const rb = rollDice(s, diceRng(5));
    expect(rb.player).toBe("b");
    expect(m.phase).toBe("rollA");
    expect(m.round).toBe(1);
    expect(m.a.score).toBe(8);
    expect(m.b.score).toBe(5);
    expect(m.lastRoll).toEqual({ round: 1, a: 8, b: 5 });
  });

  it("每 10 轮段间对比（前段）", () => {
    const s = createDiceWar();
    startTournament(s, () => 0.5);
    startNextMatch(s);
    const m = s.currentMatch;
    playRounds(s, 9, 8, 4);
    expect(m.round).toBe(9);
    expect(m.phase).toBe("rollA");
    playRound(s, 8, 4);
    expect(m.round).toBe(10);
    expect(m.phase).toBe("segment");

    const sum = getSegmentSummary(m, 1);
    expect(sum.a).toBe(80);
    expect(sum.b).toBe(40);
    expect(sum.totalA).toBe(80);

    continueAfterSegment(s);
    expect(m.phase).toBe("rollA");
  });

  it("30 轮平局进入加赛，加赛直到分出胜负", () => {
    const s = createDiceWar();
    startTournament(s, () => 0.5);
    startNextMatch(s);
    const m = s.currentMatch;
    playRounds(s, 30, 7, 7); // 双方 210:210
    expect(m.round).toBe(30);
    expect(m.overtime).toBe(true);
    expect(m.tieEntered).toBe(true);
    expect(m.phase).toBe("rollA");

    playRound(s, 12, 2); // 加赛第1轮 A 拉开
    expect(m.round).toBe(31);
    expect(m.phase).toBe("over");
    expect(m.winner).toBe("a");
    expect(m.result.overtime).toBe(true);
    expect(m.a.score).toBe(222);
    expect(m.b.score).toBe(212);
  });

  it("八分之一决赛打完 8 人晋级，进入四分之一", () => {
    const s = createDiceWar();
    startTournament(s);
    let guard = 0;
    while (s.phase === "r16" && guard < 30) {
      if (!startNextMatch(s)) break;
      simulateMatch(s);
      guard++;
    }
    const r16Done = s.finishedMatches.filter((m) => m.phase === "r16");
    expect(r16Done.length).toBe(8);
    for (const rec of r16Done) {
      expect(rec.winner).toBe(rec.a.name === rec.winner ? rec.a.name : rec.b.name);
    }
    expect(s.phase).toBe("qf");
    expect(s.matchups.length).toBe(4);
  });

  it("阶段过渡不吞比赛：八强开赛从第1场开始（回归：曾跳过首场）", () => {
    const s = createDiceWar();
    startTournament(s, () => 0.5);
    // 打完 8 场八分之一决赛
    for (let i = 0; i < 8; i++) {
      startNextMatch(s);
      simulateMatch(s);
    }
    expect(s.phase).toBe("r16");
    expect(s.advancers.length).toBe(8);
    // 阶段结束 → 只推进、不开赛
    expect(startNextMatch(s)).toBeNull();
    expect(s.phase).toBe("qf");
    expect(s.matchups.length).toBe(4);
    expect(s.matchIndex).toBe(-1);
    // 下一次调用创建四分之一决赛第 1 场（matchups[0]），而非第 2 场
    const first = startNextMatch(s);
    expect(first).not.toBeNull();
    expect(s.matchIndex).toBe(0);
    expect(first.a.name).toBe(ROSTER[s.matchups[0].a].name);
    expect(first.b.name).toBe(ROSTER[s.matchups[0].b].name);
  });

  it("完整世锦赛：冠军产生，逐阶段场数与晋级人数正确", () => {
    const s = createDiceWar();
    startTournament(s);
    let guard = 0;
    // 模拟 UI 流程：null = 阶段推进（下一轮循环开新阶段第一场）或锦标赛结束
    while (guard < 120) {
      const next = startNextMatch(s);
      if (!next) {
        if (s.champion != null) break; // 锦标赛结束
        continue; // 阶段已推进，继续开新阶段第一场
      }
      simulateMatch(s);
      guard++;
    }
    expect(s.champion).not.toBeNull();
    expect(s.champion).toBeGreaterThanOrEqual(0);
    expect(s.champion).toBeLessThan(ROSTER.length);

    // 每个阶段都打满：16强 8 场 → 8强 4 场 → 半决赛 2 场 → 决赛 4~7 局
    const byPhase = (ph) => s.finishedMatches.filter((m) => m.phase === ph);
    expect(byPhase("r16").length).toBe(8);
    expect(byPhase("qf").length).toBe(4);
    expect(byPhase("sf").length).toBe(2);
    const finalMatches = byPhase("final");
    expect(finalMatches.length).toBeGreaterThanOrEqual(FINAL_WINS);
    expect(finalMatches.length).toBeLessThanOrEqual(7);
    // 总对局 = 8 + 4 + 2 + 决赛局数
    expect(s.finishedMatches.length).toBe(14 + finalMatches.length);

    // 每场胜者都在本场选手中（无丢人/串场）
    for (const rec of s.finishedMatches) {
      expect([rec.a.name, rec.b.name]).toContain(rec.winner);
    }
    // 决赛每局都是同一对选手
    const finalPair = new Set(finalMatches.flatMap((m) => [m.a.name, m.b.name]));
    expect(finalPair.size).toBe(2);

    // 决赛大比分与胜场一致
    const sc = getSeriesScore(s);
    expect(sc).not.toBeNull();
    expect(Math.max(sc.aWins, sc.bWins)).toBe(FINAL_WINS);
    expect(finalMatches.length).toBe(sc.aWins + sc.bWins);
  });
});

describe("决赛七局四胜", () => {
  it("A 四连胜：只打 4 局即夺冠", () => {
    const s = craftFinal();
    let matches = 0;
    while (startNextMatch(s)) {
      matches++;
      playRounds(s, 30, 12, 2); // A 360 - B 60
      expect(s.currentMatch.phase).toBe("over");
    }
    expect(matches).toBe(4);
    expect(s.champion).toBe(s.series.a);
    expect(s.series.aWins).toBe(4);
    expect(s.series.bWins).toBe(0);
  });

  it("A 0:3 落后连扳四局：7 局打满逆转夺冠", () => {
    const s = craftFinal();
    let matches = 0;
    while (startNextMatch(s)) {
      matches++;
      const aWins = matches <= 3;
      playRounds(s, 30, aWins ? 2 : 12, aWins ? 12 : 2);
      expect(s.currentMatch.phase).toBe("over");
    }
    expect(matches).toBe(7);
    expect(s.champion).toBe(s.series.a);
    expect(s.series.aWins).toBe(4);
    expect(s.series.bWins).toBe(3);
  });
});

describe("解说员请求构造", () => {
  function setupAtSegment() {
    const s = createDiceWar();
    startTournament(s, () => 0.5);
    startNextMatch(s);
    playRounds(s, 10, 8, 6); // 前段：A 80 - B 60
    expect(s.currentMatch.phase).toBe("segment");
    return s;
  }

  it("前段：只给数据，不做胜率估算", () => {
    const s = setupAtSegment();
    const m = s.currentMatch;
    const { system, user } = buildCommentaryRequest(s, m, KIND.PRE);
    expect(system).toContain("前段");
    expect(system).toContain("不计算胜率");
    const snap = JSON.parse(user);
    expect(snap.赛事).toBe("骰子战争世锦赛");
    expect(snap.对局).toContain(m.a.name);
    expect(snap.段内得分[m.a.name]).toBe(80);
    expect(snap.段内得分[m.b.name]).toBe(60);
    expect(snap.分差).toContain("领先");
    expect(snap.角色标签[m.a.name]).toBeTruthy();
    expect(snap.历史纪录.singleSegment).toBe(96);
  });

  it("中段：包含粗略胜率估算要求", () => {
    const s = setupAtSegment();
    const { system } = buildCommentaryRequest(s, s.currentMatch, KIND.MID);
    expect(system).toContain("中段");
    expect(system).toContain("胜率");
  });

  it("末段：宣布结果；决赛附带大比分", () => {
    const s = setupAtSegment();
    const { system, user } = buildCommentaryRequest(s, s.currentMatch, KIND.FINAL);
    expect(system).toContain("宣布比赛结果");
    const snap = JSON.parse(user);
    expect(snap.特殊事件).toEqual(expect.any(Array));
    // 非决赛无大比分
    expect(snap.决赛大比分).toBeUndefined();
  });

  it("决赛：大比分与局分进入快照", () => {
    const s = craftFinal();
    let lastMatch = null;
    while (startNextMatch(s)) {
      playRounds(s, 30, 12, 2); // A 每局必胜
      lastMatch = s.currentMatch;
      expect(lastMatch.phase).toBe("over");
    }
    expect(s.champion).toBe(s.series.a);
    const { system, user } = buildCommentaryRequest(s, lastMatch, KIND.CHAMPION);
    expect(system).toContain("冠军");
    const snap = JSON.parse(user);
    expect(snap.冠军).toBe(ROSTER[0].name);
    expect(snap.决赛大比分).toEqual({
      [ROSTER[0].name]: 4,
      [ROSTER[1].name]: 0,
    });
  });
});

describe("工具函数", () => {
  it("describeGap 分差描述", () => {
    expect(describeGap("A", 10, "B", 7)).toBe("A领先 3 分");
    expect(describeGap("A", 5, "B", 9)).toBe("B领先 4 分");
    expect(describeGap("A", 6, "B", 6)).toBe("双方持平");
  });

  it("阶段顺序固定", () => {
    expect(PHASE_ORDER).toEqual(["r16", "qf", "sf", "final"]);
    expect(TOTAL_ROUNDS).toBe(30);
    expect(SEGMENT_LEN).toBe(10);
    expect(FINAL_WINS).toBe(4);
  });
});
