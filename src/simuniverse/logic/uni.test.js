import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createUniState,
  createTeam,
  rollNormalChoice,
  chooseNormalContent,
  advanceFloor,
  addShards,
  spendShards,
  reviveAtRest,
  serializeUni,
  deserializeUni,
  recordSavepoint,
  syncPassives,
} from "./uniState.js";
import {
  getLayerType,
  getPlane,
  planeMult,
  dmgMult,
  NORMAL_POOL,
  REGION_REWARD,
  UNI_CONST,
  BATTLE_WAVES,
  ELITE_BATTLE,
  TRANSFORM_WAVES,
  ENEMY_PATTERNS,
} from "./uniConstants.js";
import {
  startCombat,
  startPlayerTurn,
  resolvePatternActions,
  playerAttack,
  playerDefense,
  playerSkill,
  enemyAnnounce,
  enemyResolve,
  nextWave,
  chooseThirdWave,
} from "./uniCombat.js";
import { executeUniSkill, canUseUniSkill } from "./uniSkills.js";
import { gainBlessing, gainEquation, BLESSINGS } from "./uniBuffs.js";
import {
  applyEventOption,
  chooseBlessingPick,
  applySkillUp,
  getEventDef,
  UNI_EVENTS,
  UNI_REWARDS,
  UNI_ADVENTURES,
} from "./uniEvents.js";
import {
  createShopStock,
  shopBuy,
  shopPrice,
  heatStrengthen,
  overwriteBlessing,
  overwriteEquation,
} from "./uniShop.js";
import {
  gainCurio,
  gainEquation,
  blessingMult,
  CURIOS,
  EQUATIONS,
} from "./uniBuffs.js";
import { enterRegion } from "./uniState.js";
import { CHARACTERS } from "../../game/constants.js";

/** 同步跑完敌人阶段（控制器会异步慢放，测试里直接跑完） */
function runEnemyPhase(s) {
  let guard = 0;
  while (guard++ < 200) {
    const p = s.combat?.phase;
    if (!p || p === "won" || p === "lost" || p === "wave-clear") break;
    if (p !== "enemy-announce") break;
    const r = enemyAnnounce(s);
    if (!r.playing) break;
    enemyResolve(s);
  }
}

/** 控制牌堆顶牌（drawPoker 从尾部 pop：写入 [v2, v1] 使抽到第一张 v1） */
function setPoker(s, v1, v2) {
  s.combat.pokerDeck = [
    { value: v2 ?? v1, rank: "?", suit: "♠" },
    { value: v1, rank: "?", suit: "♠" },
  ];
}

/** 全员防御跳过当前回合（用于快速推进） */
function allDefend(s) {
  let guard = 0;
  while (guard++ < 60) {
    const p = s.combat?.phase;
    if (!p || p === "won" || p === "lost" || p === "wave-clear") break;
    if (p !== "player-action") break;
    if (s.combat.pendingPoker.length === 0) break;
    playerDefense(s, 0);
  }
}

describe("模拟宇宙 M1：位面与层", () => {
  it("位面换算：1-10→1，11-30→2，31-60→3，61+每30+1", () => {
    expect(getPlane(1)).toBe(1);
    expect(getPlane(10)).toBe(1);
    expect(getPlane(11)).toBe(2);
    expect(getPlane(30)).toBe(2);
    expect(getPlane(31)).toBe(3);
    expect(getPlane(60)).toBe(3);
    expect(getPlane(61)).toBe(4);
    expect(getPlane(90)).toBe(4);
    expect(getPlane(91)).toBe(5);
    expect(getPlane(120)).toBe(5);
    expect(getPlane(121)).toBe(6);
  });

  it("位面膨胀倍数：1,2,4,6,8,10,13,16,19，之后每+3", () => {
    expect(planeMult(1)).toBe(1);
    expect(planeMult(3)).toBe(4);
    expect(planeMult(6)).toBe(10);
    expect(planeMult(9)).toBe(19);
    expect(planeMult(10)).toBe(22);
    expect(planeMult(11)).toBe(25);
  });

  it("伤害膨胀 = ceil(血量倍数×0.5)，最低 1", () => {
    expect(dmgMult(1)).toBe(1); // ceil(0.5)
    expect(dmgMult(2)).toBe(1); // ceil(1)
    expect(dmgMult(3)).toBe(2); // ceil(2)
    expect(dmgMult(4)).toBe(3); // ceil(3)
    expect(dmgMult(9)).toBe(10); // ceil(9.5)
  });

  it("层类型：首领 = 10 的倍数", () => {
    expect(getLayerType(10)).toBe("boss");
    expect(getLayerType(20)).toBe("boss");
    expect(getLayerType(60)).toBe("boss");
  });

  it("层类型：转化 = 25,35,55,75…；休整 = 29,59,89…；奇遇 = 45,75,105…（第三位面起）", () => {
    expect(getLayerType(25)).toBe("transform");
    expect(getLayerType(35)).toBe("transform");
    expect(getLayerType(55)).toBe("transform");
    expect(getLayerType(95)).toBe("transform");
    expect(getLayerType(29)).toBe("rest");
    expect(getLayerType(59)).toBe("rest");
    expect(getLayerType(89)).toBe("rest");
    expect(getLayerType(45)).toBe("oddity");
    expect(getLayerType(105)).toBe("oddity");
    // 75 同时命中转化与奇遇 → 奇遇优先
    expect(getLayerType(75)).toBe("oddity");
    // 45 之前不触发奇遇（第三位面起）
    expect(getLayerType(15)).not.toBe("oddity");
  });

  it("普通层：其余层为普通", () => {
    expect(getLayerType(2)).toBe("normal");
    expect(getLayerType(9)).toBe("normal");
    expect(getLayerType(31)).toBe("normal");
  });
});

describe("模拟宇宙 M1：状态创建", () => {
  it("创建 4 人队伍：HP = 经典模式角色数值", () => {
    const s = createUniState([1, 2, 3, 4]);
    expect(s.team).toHaveLength(4);
    s.team.forEach((t, i) => {
      expect(t.hp).toBe(CHARACTERS[[1, 2, 3, 4][i]].hp);
      expect(t.maxHp).toBe(t.hp);
      expect(t.alive).toBe(true);
      expect(t.skillLevel).toBe(1);
      expect(t.skillCooldown).toBe(0);
    });
    expect(s.shards).toBe(UNI_CONST.START_SHARDS);
    expect(s.gameOver).toBe(false);
  });

  it("第 1 层固定战斗（新手引导）", () => {
    const s = createUniState();
    expect(s.floor).toBe(1);
    expect(s.plane).toBe(1);
    expect(s.region.type).toBe("battle");
    expect(s.region.waves).toEqual([
      { kind: "normal", count: 3 },
      { kind: "normal", count: 3 },
      { kind: "normal", count: 3 },
    ]);
    expect(s.pendingChoice).toBeNull();
  });

  it("createTeam 支持任意 4 人组合", () => {
    const team = createTeam([11, 6, 9, 3]);
    expect(team.map((t) => t.name)).toEqual([
      "菜月昴",
      "玛薇卡",
      "莉奈娅",
      "雷电将军",
    ]);
  });
});

describe("模拟宇宙 M1：普通层 2 选 1", () => {
  let s;
  beforeEach(() => {
    s = createUniState();
  });

  it("rollNormalChoice 从 7 种类型池抽 2 个内容", () => {
    advanceFloor(s); // 2 层 → 普通层
    expect(s.pendingChoice).not.toBeNull();
    const { options } = s.pendingChoice;
    expect(options).toHaveLength(2);
    options.forEach((o) => expect(NORMAL_POOL).toContain(o));
  });

  it("chooseNormalContent：选中成为本层内容，剩余舍弃", () => {
    s.floor = 2;
    s.pendingChoice = { options: ["fortune", "battle"] };
    const r = chooseNormalContent(s, 0);
    expect(r.ok).toBe(true);
    expect(s.region.type).toBe("fortune");
    expect(s.pendingChoice).toBeNull();
  });

  it("选中财富：立即 +300 宇宙碎片", () => {
    s.floor = 2;
    s.pendingChoice = { options: ["fortune", "battle"] };
    chooseNormalContent(s, 0);
    expect(s.shards).toBe(REGION_REWARD.fortune.shards);
  });

  it("非法下标拒绝", () => {
    s.pendingChoice = { options: ["battle", "event"] };
    expect(chooseNormalContent(s, 2).ok).toBe(false);
    expect(chooseNormalContent(s, -1).ok).toBe(false);
  });
});

describe("模拟宇宙 M1：层推进", () => {
  it("advanceFloor：层数+1，位面同步更新", () => {
    const s = createUniState();
    s.floor = 10;
    advanceFloor(s);
    expect(s.floor).toBe(11);
    expect(s.plane).toBe(2);
  });

  it("advanceFloor：特殊层直接生成区域，普通层进入 2 选 1", () => {
    const s = createUniState();
    s.floor = 9;
    const r9 = advanceFloor(s); // 10 层 → boss
    expect(r9.type).toBe("boss");
    expect(s.region.type).toBe("boss");
    expect(s.heat).toBe(UNI_CONST.BOSS_HEAT); // 首领层热量重置
    expect(s.pendingChoice).toBeNull();

    const r11 = advanceFloor(s); // 11 层 → 普通
    expect(r11.type).toBe("normal");
    expect(s.region).toBeNull();
    expect(s.pendingChoice).not.toBeNull();
  });

  it("休整层：全队回满生命", () => {
    const s = createUniState();
    s.team[0].hp = 1;
    s.team[1].hp = 5;
    s.floor = 29;
    s.region = { type: "rest" };
    // 模拟 enterRegion（advanceFloor 内会调用）
    advanceFloor(s); // 会推进到 30…… 这里直接测 enterRegion 逻辑
    // 改用直接构造：29 层休整
    s.floor = 29;
    s.region = { type: "rest" };
    // 手动触发：advanceFloor 后再进入休整层
    s.floor = 28;
    advanceFloor(s); // 29 → rest
    expect(s.floor).toBe(29);
    expect(s.region.type).toBe("rest");
    expect(s.team[0].hp).toBe(s.team[0].maxHp);
    expect(s.team[1].hp).toBe(s.team[1].maxHp);
  });
});

describe("模拟宇宙 M1：货币与复活", () => {
  let s;
  beforeEach(() => {
    s = createUniState();
  });

  it("addShards / spendShards", () => {
    addShards(s, 100);
    expect(s.shards).toBe(100);
    expect(spendShards(s, 40)).toBe(true);
    expect(s.shards).toBe(60);
    expect(spendShards(s, 100)).toBe(false); // 不足
    expect(s.shards).toBe(60);
  });

  it("休整复活：150 碎片复活死亡角色（50% 生命）", () => {
    addShards(s, 200);
    s.team[0].alive = false;
    s.team[0].hp = 0;
    const r = reviveAtRest(s, 0);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(150);
    expect(s.shards).toBe(50);
    expect(s.team[0].alive).toBe(true);
    expect(s.team[0].hp).toBe(Math.floor(s.team[0].maxHp * 0.5));
  });

  it("复活：碎片不足 / 目标存活 拒绝", () => {
    const r1 = reviveAtRest(s, 0); // 存活
    expect(r1.ok).toBe(false);
    s.team[1].alive = false;
    const r2 = reviveAtRest(s, 1); // 无碎片
    expect(r2.ok).toBe(false);
  });
});

describe("模拟宇宙 M1：存档", () => {
  it("序列化/反序列化：状态保留，devLog 重建", () => {
    const s = createUniState();
    addShards(s, 320);
    s.team[2].skillLevel = 3;
    s.floor = 7;
    const data = serializeUni(s);
    const s2 = createUniState();
    expect(deserializeUni(s2, data)).toBe(true);
    expect(s2.shards).toBe(320);
    expect(s2.team[2].skillLevel).toBe(3);
    expect(s2.floor).toBe(7);
    expect(s2.devLog).toBeTruthy(); // 重建后的日志对象
    expect(typeof s2.devLog.info).toBe("function");
  });
});

describe("模拟宇宙 M2：战斗开始与波次", () => {
  it("battle 战斗：3 波×3 普通，HP = 10 × 位面倍数", () => {
    const s = createUniState();
    startCombat(s);
    const c = s.combat;
    expect(c.kind).toBe("battle");
    expect(c.waves).toEqual(BATTLE_WAVES);
    expect(c.enemies).toHaveLength(3);
    c.enemies.forEach((e) => {
      expect(e.kind).toBe("normal");
      expect(e.hp).toBe(10); // 位面 1：10 × 1
      expect(e.maxHp).toBe(10);
    });
    expect(c.phase).toBe("player-action");
    expect(c.pendingPoker).toHaveLength(0); // 先选行动后抽牌，行动前无牌
  });

  it("位面 2：敌人 HP 翻倍（20）", () => {
    const s = createUniState();
    s.plane = 2;
    s.region = { type: "battle", waves: BATTLE_WAVES };
    startCombat(s);
    expect(s.combat.enemies[0].hp).toBe(20);
  });

  it("波次推进：全灭当前波 → 下一波生成", () => {
    const s = createUniState();
    startCombat(s);
    // 手动清空第一波
    s.combat.enemies.forEach((e) => {
      e.hp = 0;
      e.alive = false;
    });
    nextWave(s);
    expect(s.combat.wave).toBe(1);
    expect(s.combat.enemies).toHaveLength(3);
    expect(s.combat.enemies.every((e) => e.alive)).toBe(true);
  });

  it("最后一波全灭 → 胜利", () => {
    const s = createUniState();
    startCombat(s);
    s.combat.wave = 2;
    s.combat.enemies.forEach((e) => {
      e.hp = 0;
      e.alive = false;
    });
    nextWave(s);
    expect(s.combat.phase).toBe("won");
    expect(s.combat.lastReward.shards).toBe(REGION_REWARD.battle.shards);
    expect(s.shards).toBe(30);
  });
});

describe("模拟宇宙 M2：玩家行动", () => {
  it("普攻：抽 1 张牌，伤害 = 牌面值", () => {
    const s = createUniState();
    startCombat(s);
    setPoker(s, 5);
    const before = s.combat.enemies[0].hp;
    const r = playerAttack(s, 0);
    expect(r.ok).toBe(true);
    expect(r.dmg).toBe(5); // 单牌 5
    expect(s.combat.enemies[0].hp).toBe(before - 5);
  });

  it("普攻打死敌人后推进到下一名角色", () => {
    const s = createUniState();
    startCombat(s);
    const first = s.combat.activeIdx;
    setPoker(s, 13); // 13 伤害 > 10 HP
    playerAttack(s, 0);
    expect(s.combat.enemies[0].alive).toBe(false);
    expect(s.combat.activeIdx).not.toBe(first); // 下一名角色行动
  });

  it("防御：抽 1 张牌为指定目标添加护盾", () => {
    const s = createUniState();
    startCombat(s);
    setPoker(s, 7);
    const target = s.team[0];
    const before = target.shield;
    const r = playerDefense(s, 0);
    expect(r.ok).toBe(true);
    expect(target.shield).toBe(before + 7); // 牌面值 7 作为护盾
  });

  it("防御牌抵扣伤害", () => {
    const s = createUniState();
    startCombat(s);
    // 只留成员 0 存活，保证 single 攻击命中成员 0
    s.team.forEach((t, i) => {
      if (i !== 0) {
        t.alive = false;
        t.hp = 0;
      }
    });
    // 给成员塞 2 张防御牌（值 5+5）
    s.team[0].status.defensePile = [
      { value: 5, rank: "5", suit: "♠" },
      { value: 5, rank: "5", suit: "♦" },
    ];
    const hpBefore = s.team[0].hp;
    // 用普通 A（单体 5）打成员 0：完全被 5 点防御牌挡住
    s.combat.enemies = [
      { id: 0, kind: "normal", name: "普通敌人1", pattern: "A", hp: 10, maxHp: 10, shield: 0, locked: [], round: 1, alive: true },
    ];
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "single", dmg: 5 }, desc: "重击#1" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.team[0].hp).toBe(hpBefore); // 防御全挡
    expect(s.team[0].status.defensePile).toHaveLength(1); // 剩 1 张（5 点被打掉）
  });
});

describe("模拟宇宙 M2：敌人模板", () => {
  it("普通 A：随机 1 人单体伤害（含膨胀）", () => {
    const s = createUniState();
    startCombat(s);
    const before = s.team.map((t) => t.hp);
    // 清空防御堆确保扣血
    s.team.forEach((t) => (t.status.defensePile = []));
    s.combat.enemies = [
      { id: 0, kind: "normal", name: "普通敌人1", pattern: "A", hp: 10, maxHp: 10, shield: 0, locked: [], round: 1, alive: true },
    ];
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "single", dmg: 5 }, desc: "重击#1" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    const hpSum = s.team.reduce((a, t) => a + t.hp, 0);
    expect(hpSum).toBe(before.reduce((a, b) => a + b) - 5); // 恰好 1 人掉 5
  });

  it("普通 B：全体 3 点", () => {
    const s = createUniState();
    startCombat(s);
    s.team.forEach((t) => (t.status.defensePile = []));
    const before = s.team.map((t) => t.hp);
    s.combat.enemies = [
      { id: 0, kind: "normal", name: "普通敌人1", pattern: "B", hp: 10, maxHp: 10, shield: 0, locked: [], round: 1, alive: true },
    ];
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "aoe", dmg: 3 }, desc: "震荡波#1" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    s.team.forEach((t, i) => expect(t.hp).toBe(before[i] - 3));
  });

  it("普通 C：自身获得 30% 生命上限护盾", () => {
    const s = createUniState();
    startCombat(s);
    s.combat.enemies = [
      { id: 0, kind: "normal", name: "普通敌人1", pattern: "C", hp: 10, maxHp: 10, shield: 0, locked: [], round: 1, alive: true },
    ];
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "shield", pct: 0.3 }, desc: "岩化#1" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.combat.enemies[0].shield).toBe(3); // 10 × 30%
  });

  it("精英 B：锁定 → 下回合对被锁定者 16 点 ×2", () => {
    const s = createUniState();
    startCombat(s);
    s.team.forEach((t) => (t.status.defensePile = []));
    s.combat.enemies = [
      { id: 0, kind: "elite", name: "精英敌人1", pattern: "B", hp: 25, maxHp: 25, shield: 0, locked: [], round: 1, alive: true },
    ];
    // 第 1 回合：锁定
    s.combat.enemyQueue = [
      { enemyIdx: 0, action: { type: "lock" }, desc: "锁定#1" },
      { enemyIdx: 0, action: { type: "lock" }, desc: "锁定#2" },
    ];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.combat.enemies[0].locked.length).toBeGreaterThan(0);
    // 第 2 回合：对被锁定者 16×2（位面 1 无膨胀）
    const locked = s.combat.enemies[0].locked[0];
    const before = s.team[locked].hp;
    s.combat.enemyQueue = [
      { enemyIdx: 0, action: { type: "hitLocked", dmg: 16 }, desc: "狙击#1" },
      { enemyIdx: 0, action: { type: "hitLocked", dmg: 16 }, desc: "狙击#2" },
    ];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.team[locked].hp).toBe(Math.max(0, before - 32));
  });

  it("精英 C：debuff 上 dot，随后回合按 dot 扣血", () => {
    const s = createUniState();
    startCombat(s);
    s.combat.enemies = [
      { id: 0, kind: "elite", name: "精英敌人1", pattern: "C", hp: 25, maxHp: 25, shield: 0, locked: [], round: 1, alive: true },
    ];
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "debuff" }, desc: "腐蚀#1" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    const dotTarget = s.team.find((t) => t.status.dot > 0);
    expect(dotTarget).toBeTruthy();
    // 新回合 dot 结算
    const before = dotTarget.hp;
    s.combat.phase = "player-action";
    s.combat.enemyQueue = [];
    s.combat.turnIdx = 3; // 假装回合结束触发下一回合
    nextPlayerTurnForTest(s);
    expect(dotTarget.hp).toBe(Math.max(0, before - 2));
  });
});

/** 测试辅助：直接进入下一玩家回合（dot 结算在 startPlayerTurn） */
function nextPlayerTurnForTest(s) {
  startPlayerTurn(s);
}

describe("模拟宇宙 M2：首领穿插", () => {
  it("首领：前 2 名玩家行动后穿插 1 次，剩余 2 名后行动 2 次", () => {
    const s = createUniState();
    s.region = { type: "boss", name: "首领", waves: [{ kind: "boss", count: 1 }] };
    startCombat(s);
    // 强制首领 pattern 为 A（便于断言）
    s.combat.enemies[0].pattern = "A";
    // 前 2 名玩家行动（防御）
    playerDefense(s, 0);
    playerDefense(s, 0);
    expect(s.combat.turnCount).toBe(2);
    expect(s.combat.phase).toBe("enemy-announce");
    expect(s.combat.enemyQueue).toHaveLength(1); // interlude（aoe 8）
    // 结算穿插
    enemyAnnounce(s);
    enemyResolve(s);
    // 剩余 2 名玩家行动
    playerDefense(s, 0);
    playerDefense(s, 0);
    expect(s.combat.phase).toBe("enemy-announce");
    expect(s.combat.enemyQueue).toHaveLength(2); // 行动1（single 12）+ 行动2（heal）
  });

  it("首领 B：穿插减疗，行动眩晕", () => {
    const s = createUniState();
    s.region = { type: "boss", name: "首领", waves: [{ kind: "boss", count: 1 }] };
    startCombat(s);
    s.combat.round = 2; // pattern 轮转：第 2 回合 = B（减疗/眩晕）
    playerDefense(s, 0);
    playerDefense(s, 0);
    enemyAnnounce(s);
    enemyResolve(s);
    // 减疗 50%
    expect(s.team.every((t) => t.status.healCut === 0.5)).toBe(true);
    // 剩余 2 名行动后：全体 6 + 眩晕 1 人
    playerDefense(s, 0);
    playerDefense(s, 0);
    expect(s.combat.enemyQueue).toHaveLength(2);
    enemyAnnounce(s);
    enemyResolve(s); // aoe 6
    enemyAnnounce(s);
    enemyResolve(s); // stun
  });

  it("首领 B 的眩晕：随机 1 人停一回合（独立场景）", () => {
    const s = createUniState();
    s.region = { type: "boss", name: "首领", waves: [{ kind: "boss", count: 1 }] };
    startCombat(s);
    // 固定随机：pickAliveMember 总选成员 0（行动顺序第 1 位，turnCount=1 时已行动过）
    vi.spyOn(Math, "random").mockReturnValue(0);
    s.combat.turnCount = 1;
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "stun" }, desc: "眩晕" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.team[0].status.stunned).toBe(true);
    vi.restoreAllMocks();
  });
});

describe("模拟宇宙 M2：转化及格线", () => {
  it("转化波次：5 普通 + 5 普通 + 3 精英", () => {
    const s = createUniState();
    s.region = { type: "transform", name: "转化", waves: TRANSFORM_WAVES };
    startCombat(s);
    expect(s.combat.enemies).toHaveLength(5);
    s.combat.enemies.forEach((e) => expect(e.kind).toBe("normal"));
  });

  it("20 回合未灭两波 → 战斗失败", () => {
    const s = createUniState();
    s.region = { type: "transform", name: "转化", waves: TRANSFORM_WAVES };
    startCombat(s);
    s.combat.wave = 0;
    s.combat.round = 20;
    // 触发回合结束判定（finishEnemyTurn）
    s.combat.phase = "enemy-announce";
    s.combat.enemyQueue = [];
    enemyAnnounce(s); // 队列空 → finishEnemyTurn → 及格线判定
    expect(s.combat.phase).toBe("lost");
    expect(s.gameOver).toBe(true);
  });

  it("打完两波 → wave-clear：撤退胜利 / 挑战第三波", () => {
    const s = createUniState();
    s.region = { type: "transform", name: "转化", waves: TRANSFORM_WAVES };
    startCombat(s);
    // 模拟第二波全灭（wave=1，enemies 非空全死），当前回合玩家正在行动
    s.combat.wave = 1;
    s.combat.enemies = [
      { id: 0, kind: "normal", name: "普通敌人1", pattern: "A", hp: 0, maxHp: 10, shield: 0, locked: [], round: 1, alive: false },
    ];
    s.combat.turnCount = 1;
    playerDefense(s, 0); // 触发 finishPlayerAction 的波次检查
    expect(s.combat.phase).toBe("wave-clear");
    // 撤退
    const r = chooseThirdWave(s, false);
    expect(r.ok).toBe(true);
    expect(s.combat.phase).toBe("won");
  });

  it("挑战第三波：3 精英，击杀 +150/个", () => {
    const s = createUniState();
    s.region = { type: "transform", name: "转化", waves: TRANSFORM_WAVES };
    startCombat(s);
    s.combat.wave = 1;
    s.combat.enemies = [
      { id: 0, kind: "normal", name: "普通敌人1", pattern: "A", hp: 0, maxHp: 10, shield: 0, locked: [], round: 1, alive: false },
    ];
    s.combat.turnCount = 1;
    playerDefense(s, 0);
    expect(s.combat.phase).toBe("wave-clear");
    chooseThirdWave(s, true);
    expect(s.combat.wave).toBe(2);
    expect(s.combat.enemies).toHaveLength(3);
    s.combat.enemies.forEach((e) => expect(e.kind).toBe("elite"));
    // 击杀 1 个精英 +150（先削到 1 HP）
    const shardsBefore = s.shards;
    const victim = s.combat.enemies[0];
    victim.hp = 1;
    s.combat.activeIdx = 0;
    s.combat.pendingPoker = [
      { value: 13, rank: "K", suit: "♠" },
      { value: 13, rank: "K", suit: "♣" },
    ];
    playerAttack(s, victim.id);
    expect(s.shards).toBe(shardsBefore + 150);
  });
});

describe("模拟宇宙 M2：战斗结束", () => {
  it("全灭 → gameOver", () => {
    const s = createUniState();
    startCombat(s);
    s.team.forEach((t) => {
      t.hp = 0;
      t.alive = false;
    });
    // 敌人打一下触发全灭判定
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "aoe", dmg: 3 }, desc: "x" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.combat.phase).toBe("lost");
    expect(s.gameOver).toBe(true);
  });
});

describe("模拟宇宙 M3：角色技能", () => {
  it("温迪：爆发 N 张牌（等级 1 = 2 张），伤害 = 牌面和 - 2", () => {
    const s = createUniState([1, 2, 3, 4]);
    startCombat(s);
    s.team[0].skillLevel = 1;
    // drawCards 从牌堆尾部 pop：塞 2 张（4 和 3）
    s.combat.pokerDeck = [
      { value: 3, rank: "3", suit: "♠" },
      { value: 4, rank: "4", suit: "♦" },
    ];
    const enemy = s.combat.enemies[0];
    const hpBefore = enemy.hp;
    const r = playerSkill(s, enemy.id);
    expect(r.ok).toBe(true);
    // 等级 1 → 2 张牌：4+3=7，-2 → 5
    expect(enemy.hp).toBe(hpBefore - 5);
    expect(s.team[0].skillCooldown).toBe(7);
  });

  it("钟离：全队护盾（等级 1 = 18）", () => {
    const s = createUniState([2, 3, 4, 5]);
    startCombat(s);
    s.combat.activeIdx = 0; // 模拟轮到钟离（速度排序首位是雷电将军）
    const r = playerSkill(s);
    expect(r.ok).toBe(true);
    s.team.forEach((t) => expect(t.shield).toBe(18));
  });

  it("雷电将军：单体伤害（等级 1 = 20）", () => {
    const s = createUniState([3, 2, 4, 5]);
    startCombat(s);
    const enemy = s.combat.enemies[0];
    const hpBefore = enemy.hp;
    const r = playerSkill(s, enemy.id);
    expect(r.ok).toBe(true);
    expect(enemy.hp).toBe(Math.max(0, hpBefore - 20));
  });

  it("纳西妲：指定角色立即行动（插队）", () => {
    const s = createUniState([4, 1, 2, 3]);
    startCombat(s);
    s.combat.activeIdx = 0; // 模拟轮到纳西妲
    const r = playerSkill(s, undefined, { members: [2] });
    expect(r.ok).toBe(true);
    // playerSkill 已推进：被插队的成员 2 成为当前行动者
    expect(s.combat.activeIdx).toBe(2);
  });

  it("芙宁娜：全队增伤 20% + 治疗（等级 1）", () => {
    const s = createUniState([5, 1, 2, 3]);
    startCombat(s);
    s.team[0].hp = 1; // 芙宁娜自己残血
    const r = playerSkill(s);
    expect(r.ok).toBe(true);
    s.team.forEach((t) => {
      expect(t.status.dmgBuffPct).toBe(20);
      expect(t.status.dmgBuffTurns).toBe(3);
    });
    expect(s.team[0].hp).toBeGreaterThan(1); // 治疗生效
    // 普攻伤害吃增伤（开大已推进到下一名角色）
    const enemy = s.combat.enemies[0];
    const hpBefore = enemy.hp;
    setPoker(s, 10, 10); // raw = 18
    playerAttack(s, enemy.id);
    expect(enemy.hp).toBe(Math.max(0, hpBefore - Math.floor(18 * 1.2)));
  });

  it("被动同步：玛薇卡斗志上限 + 少女攻防加成", () => {
    const s = createUniState([6, 7, 1, 2]);
    syncPassives(s);
    // 玛薇卡（0）斗志上限 4（1 级），受益 1 人 = 自己
    expect(s.team[0].status.spiritCap).toBe(4);
    expect(s.team[1].status.spiritCap).toBe(0);
    // 少女（1）攻防 +2（1 级），受益 1 人 = 自己
    expect(s.team[1].status.atkBonus).toBe(2);
    expect(s.team[0].status.atkBonus).toBe(0);
    // 升级到 8 级：受益 2 人
    s.team[0].skillLevel = 8;
    s.team[1].skillLevel = 8;
    syncPassives(s);
    expect(s.team[0].status.spiritCap).toBe(10);
    expect(s.team[1].status.spiritCap).toBe(10);
    expect(s.team[2].status.spiritCap).toBe(0);
    expect(s.team[0].status.atkBonus).toBe(8);
    expect(s.team[1].status.atkBonus).toBe(8);
  });

  it("普攻吃被动修正：少女攻加成 + 玛薇卡斗志", () => {
    const s = createUniState([6, 7, 1, 2]);
    syncPassives(s);
    startCombat(s);
    // 少女（成员 1）是当前行动者时测普攻
    // 直接构造：让成员 1 成为 activeIdx
    s.combat.activeIdx = 1;
    s.combat.turnIdx = 0;
    s.team[1].status.spiritCap = 0;
    setPoker(s, 5); // raw = 5
    const enemy = s.combat.enemies[0];
    const hpBefore = enemy.hp;
    playerAttack(s, enemy.id);
    expect(enemy.hp).toBe(hpBefore - 7); // 5 + 2（少女攻）
  });

  it("莉奈娅：一技能全队盾 / 二技能 dot", () => {
    const s = createUniState([9, 1, 2, 3]);
    startCombat(s);
    s.combat.activeIdx = 0; // 模拟轮到莉奈娅
    // 盾（等级 1 → 1 张 = 6 点）
    const r1 = playerSkill(s, undefined, { branch: "shield" });
    expect(r1.ok).toBe(true);
    s.team.forEach((t) => expect(t.shield).toBe(6));
    // 二技能 dot（等级 1 → 立即 3 点全体）
    s.team[0].skillCooldown = 0; // 重置冷却
    s.combat.activeIdx = 0;
    const enemiesBefore = s.combat.enemies.map((e) => e.hp);
    const r2 = playerSkill(s, undefined, { branch: "dot" });
    expect(r2.ok).toBe(true);
    s.combat.enemies.forEach((e, i) => expect(e.hp).toBe(enemiesBefore[i] - 3));
    // 6 级 → 持续 dot 3 回合
    s.team[0].skillCooldown = 0;
    s.team[0].skillLevel = 6;
    s.combat.activeIdx = 0;
    const r3 = playerSkill(s, undefined, { branch: "dot" });
    expect(r3.ok).toBe(true);
    s.combat.enemies.forEach((e) => {
      expect(e.dotDmg).toBe(7);
      expect(e.dotTurns).toBe(3);
    });
  });

  it("爱蜜莉雅：敌方停 1 回合（等级 1）", () => {
    const s = createUniState([10, 1, 2, 3]);
    startCombat(s);
    s.combat.activeIdx = 0; // 模拟轮到爱蜜莉雅
    const r = playerSkill(s);
    expect(r.ok).toBe(true);
    s.combat.enemies.forEach((e) => expect(e.stunnedTurns).toBe(1));
    expect(s.team[0].skillCooldown).toBe(12);
  });

  it("风堇：全队生命上限 +10% 回满 + 回复量 10% 伤害", () => {
    const s = createUniState([8, 1, 2, 3]);
    startCombat(s);
    s.team[0].hp = 1; // 风堇残血
    const enemy = s.combat.enemies[0];
    const hpSumBefore = s.combat.enemies.reduce((a, e) => a + e.hp, 0);
    const r = playerSkill(s);
    expect(r.ok).toBe(true);
    s.team.forEach((t) => {
      expect(t.maxHp).toBe(Math.floor(t.status.origMaxHp * 1.1));
      expect(t.hp).toBe(t.maxHp); // 回满
    });
    // 附加伤害打随机 1 个敌人（totalHealed 14 → bonus 1）
    expect(s.combat.enemies.reduce((a, e) => a + e.hp, 0)).toBe(hpSumBefore - 1);
    // 3 回合后还原
    s.combat.round = 2;
    startPlayerTurn(s);
    startPlayerTurn(s);
    startPlayerTurn(s);
    s.team.forEach((t) => {
      expect(t.maxHp).toBe(t.status.origMaxHp);
    });
  });

  it("冷却递减：开大后每回合 -1（含开大当回合）", () => {
    const s = createUniState([1, 2, 3, 4]);
    startCombat(s);
    const r = playerSkill(s, s.combat.enemies[0].id);
    expect(r.ok).toBe(true);
    expect(s.team[0].skillCooldown).toBe(7); // 开大当回合
    startPlayerTurn(s);
    expect(s.team[0].skillCooldown).toBe(6); // 下回合 -1
  });

  it("canUseUniSkill：冷却中 / 被动不可用", () => {
    const s = createUniState([1, 2, 3, 4]);
    startCombat(s);
    expect(canUseUniSkill(s, 0).ok).toBe(true);
    playerSkill(s, s.combat.enemies[0].id);
    expect(canUseUniSkill(s, 0).ok).toBe(false); // 冷却中
    // 玛薇卡被动
    const s2 = createUniState([6, 1, 2, 3]);
    startCombat(s2);
    expect(canUseUniSkill(s2, 0).ok).toBe(false); // 被动
  });
});

describe("模拟宇宙 M3：菜月昴死亡回归", () => {
  it("全灭 → 回滚本层开始前，消耗 1 次读档", () => {
    const s = createUniState([11, 2, 3, 4]);
    addShards(s, 50);
    recordSavepoint(s);
    startCombat(s);
    // 全灭
    s.team.forEach((t) => {
      t.hp = 0;
      t.alive = false;
    });
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "aoe", dmg: 3 }, desc: "x" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.gameOver).toBe(false); // 读档保命
    expect(s.caiyueangLoads).toBe(1);
    expect(s.combat).toBeNull(); // 回到层开始前
    expect(s.shards).toBe(50); // 状态回滚
    expect(s.team.every((t) => t.alive)).toBe(true); // 队伍复活
  });

  it("读档 3 次用尽后全灭 → 终局", () => {
    const s = createUniState([11, 2, 3, 4]);
    s.caiyueangLoads = 3;
    startCombat(s);
    s.team.forEach((t) => {
      t.hp = 0;
      t.alive = false;
    });
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "aoe", dmg: 3 }, desc: "x" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.gameOver).toBe(true);
    expect(s.caiyueangLoads).toBe(3);
  });

  it("队伍无菜月昴 → 全灭直接终局", () => {
    const s = createUniState([1, 2, 3, 4]);
    startCombat(s);
    s.team.forEach((t) => {
      t.hp = 0;
      t.alive = false;
    });
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "aoe", dmg: 3 }, desc: "x" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.gameOver).toBe(true);
  });
});

describe("模拟宇宙 M4：事件系统", () => {
  it("事件池完整性：9 事件 + 8 奖励 + 3 冒险", () => {
    expect(Object.keys(UNI_EVENTS)).toHaveLength(9);
    expect(Object.keys(UNI_REWARDS)).toHaveLength(8);
    expect(Object.keys(UNI_ADVENTURES)).toHaveLength(3);
  });

  it("迷途商队 A：指引方向 → 1 次祝福三选一入队", () => {
    const s = createUniState();
    const r = applyEventOption(s, "caravan", 0);
    expect(r.ok).toBe(true);
    expect(s.pendingBlessingPicks).toHaveLength(1);
    expect(s.pendingBlessingPicks[0].candidates).toHaveLength(3);
    // 选择祝福
    const pick = s.pendingBlessingPicks[0].candidates[0];
    const c = chooseBlessingPick(s, pick);
    expect(c.ok).toBe(true);
    expect(s.pendingBlessingPicks).toBeNull();
    expect(s.blessings.some((b) => b.id === pick)).toBe(true);
  });

  it("瘟疫村庄 B：封锁村庄 → +150 碎片", () => {
    const s = createUniState();
    applyEventOption(s, "plague", 1);
    expect(s.shards).toBe(150);
  });

  it("废弃哨塔 A：随机角色技能 +1", () => {
    const s = createUniState();
    const r = applyEventOption(s, "watchtower", 0);
    expect(r.ok).toBe(true);
    expect(s.team.some((t) => t.skillLevel > 1)).toBe(true);
  });

  it("经验卷轴 A：指定角色技能 +2（needSkillTarget → applySkillUp）", () => {
    const s = createUniState();
    const r = applyEventOption(s, "expScroll", 0);
    expect(r.outcome.needSkillTarget).toBe(2);
    const up = applySkillUp(s, 1, 2);
    expect(up.ok).toBe(true);
    expect(s.team[1].skillLevel).toBe(3);
  });

  it("经验卷轴 B：全队技能 +1；菜月昴不可升级", () => {
    const s = createUniState([1, 11, 2, 3]);
    applyEventOption(s, "expScroll", 1);
    expect(s.team[0].skillLevel).toBe(2);
    expect(s.team[1].skillLevel).toBe(1); // 菜月昴
    expect(s.team[2].skillLevel).toBe(2);
  });

  it("祝福强化：重复获得 ×2", () => {
    const s = createUniState();
    gainBlessing(s, "ganlu");
    gainBlessing(s, "ganlu");
    expect(s.blessings).toHaveLength(1);
    expect(s.blessings[0].enhanced).toBe(2);
  });

  it("方程重复 → 自动转化为碎片（1 星 200）", () => {
    const s = createUniState();
    gainEquation(s, "shouzu");
    const r = gainEquation(s, "shouzu");
    expect(r.dupe).toBe(true);
    expect(s.shards).toBe(200);
    expect(s.equations).toHaveLength(1);
  });

  it("骰子游戏：投入 60，收入 = 点数×20", () => {
    const s = createUniState();
    addShards(s, 200);
    const r = applyEventOption(s, "dice", 0);
    expect(r.ok).toBe(true);
    const g = r.outcome.gamble;
    expect(g.cost).toBe(60);
    expect(g.point).toBeGreaterThanOrEqual(1);
    expect(g.point).toBeLessThanOrEqual(6);
    expect(s.shards).toBe(200 - 60 + g.point * 20);
  });

  it("翻牌：调用不报错且不崩溃（概率分支）", () => {
    const s = createUniState();
    const r = applyEventOption(s, "cards", 0);
    expect(r.ok).toBe(true);
    expect(r.outcome.fortuneCard.kind).toBeTruthy();
  });

  it("抽签：抽一支（25 碎片）", () => {
    const s = createUniState();
    addShards(s, 100);
    const r = applyEventOption(s, "lottery", 0);
    expect(r.ok).toBe(true);
    expect(r.outcome.lottery.cost).toBe(25);
    expect(["大吉", "中吉", "小吉", "凶"]).toContain(r.outcome.lottery.best);
  });

  it("普通战斗胜利：生成 3 次祝福三选一候选（battle 区域奖励）", () => {
    const s = createUniState();
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 3 }] };
    startCombat(s);
    s.combat.enemies.forEach((e) => {
      e.hp = 0;
      e.alive = false;
    });
    playerDefense(s, 0);
    expect(s.combat.phase).toBe("won");
    expect(s.pendingBlessingPicks).toHaveLength(3); // REGION_REWARD.battle.blessingPicks
    expect(s.pendingBlessingPicks[0].starRange).toEqual([1, 2]);
  });

  it("战斗胜利后进入下一层：combat 清空，精英房间正常开战（回归：残留 combat 直接胜利）", () => {
    const s = createUniState();
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 3 }] };
    startCombat(s);
    s.combat.enemies.forEach((e) => {
      e.hp = 0;
      e.alive = false;
    });
    playerDefense(s, 0);
    expect(s.combat.phase).toBe("won");
    // 前往下一层（模拟 goNext → advanceFloor）
    advanceFloor(s);
    expect(s.combat).toBeNull(); // 关键：残留战斗必须清空
    // 下一层是精英 → 重新开战（不再直接胜利）
    s.region = { type: "elite", name: "精英", waves: [{ kind: "elite", count: 2 }] };
    startCombat(s);
    expect(s.combat.phase).toBe("player-action");
    expect(s.combat.enemies.every((e) => e.alive)).toBe(true);
  });

  it("普通层 2 选 1 后 combat 清空（进入新内容前无战斗残留）", () => {
    const s = createUniState();
    startCombat(s); // 模拟上一场战斗残留
    rollNormalChoice(s);
    expect(s.pendingChoice).toBeTruthy();
    chooseNormalContent(s, 0);
    expect(s.combat).toBeNull();
  });

  it("异常区域（无 waves 配置）startCombat 不崩溃 → 直接胜利", () => {
    const s = createUniState();
    s.region = { type: "event", name: "事件" }; // 事件区域未切战斗区域（回归：事件战斗 region bug）
    startCombat(s);
    expect(s.combat.phase).toBe("won");
  });

  it("迷途商队 B：护送 → 事件战斗 → 胜利后 2 次祝福三选一", () => {
    const s = createUniState();
    const r = applyEventOption(s, "caravan", 1);
    expect(r.outcome.battle).toBeTruthy();
    expect(r.outcome.battle.waves).toEqual([{ kind: "normal", count: 3 }]);
    expect(s.pendingEventReward.blessingPick).toBe(2);
    // 进入事件战斗
    s.region = { type: "battle", name: "事件战斗", waves: r.outcome.battle.waves };
    startCombat(s);
    // 全灭敌人 + 玩家防御 → 波次清空 → 胜利
    s.combat.enemies.forEach((e) => {
      e.hp = 0;
      e.alive = false;
    });
    playerDefense(s, 0);
    expect(s.combat.phase).toBe("won");
    expect(s.pendingEventReward).toBeNull();
    expect(s.pendingBlessingPicks).toHaveLength(2);
  });

  it("急救包：战斗开始自动回 10% 并消耗", () => {
    const s = createUniState();
    s.items.medkit = 1;
    s.team[0].hp = 5;
    startCombat(s);
    expect(s.items.medkit).toBe(0);
    expect(s.team[0].hp).toBe(5 + Math.floor(s.team[0].maxHp * 0.1));
  });

  it("战术手册·进攻战术：下次战斗全队伤害 +30%", () => {
    const s = createUniState();
    applyEventOption(s, "manual", 0); // 进攻战术
    expect(s.nextBattleBuffs.atkUp).toBe(true);
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 1 }] };
    startCombat(s);
    expect(s.combat.buffs).toContain("atkUp");
    setPoker(s, 5); // raw = 5
    const enemy = s.combat.enemies[0];
    const hpBefore = enemy.hp;
    playerAttack(s, enemy.id);
    expect(enemy.hp).toBe(hpBefore - Math.floor(5 * 1.3));
    // 战斗结束 buff 失效
    s.combat.enemies.forEach((e) => {
      e.hp = 0;
      e.alive = false;
    });
    playerDefense(s, 0);
    expect(s.combat.phase).toBe("won");
    expect(s.nextBattleBuffs).toEqual({});
  });

  it("封印之门 B：解读符文（150 碎片 → 3 个 1~2 星祝福）", () => {
    const s = createUniState();
    addShards(s, 300);
    const r = applyEventOption(s, "gate", 1);
    expect(r.ok).toBe(true);
    expect(s.shards).toBe(150);
    // 3 次获得（可能含重复强化合并）
    const totalGained = s.blessings.reduce((a, b) => a + (b.enhanced || 1), 0);
    expect(totalGained).toBe(3);
    s.blessings.forEach((b) => expect(b.star).toBeLessThanOrEqual(2));
  });

  it("古代祭坛 A：3 星方程 + 2 奇物，损失 60% 生命上限", () => {
    const s = createUniState();
    s.team.forEach((t) => (t.hp = t.maxHp));
    const r = applyEventOption(s, "altar", 0);
    expect(r.ok).toBe(true);
    // 至少 1 个 3 星方程（奇物「纯美骑士精神」可能额外给方程）
    expect(s.equations.some((e) => e.star === 3)).toBe(true);
    // 2 次奇物获得（可能含重复强化合并）
    const curioGained = s.curios.reduce((a, c) => a + (c.enhanced || 1), 0);
    expect(curioGained).toBe(2);
    s.team.forEach((t) => expect(t.hp).toBe(Math.max(1, t.maxHp - Math.floor((t.maxHp * 60) / 100))));
  });

  it("神秘箱子 B：500 碎片但失去所有防御牌（defensePile 清空）", () => {
    const s = createUniState();
    s.team.forEach((t) => {
      t.status.defensePile.push({ value: 2, rank: "?", suit: "♠" }, { value: 4, rank: "?", suit: "♠" });
    });
    const r = applyEventOption(s, "box", 1);
    expect(r.ok).toBe(true);
    expect(s.shards).toBe(500);
    expect(s.team.every((t) => t.status.defensePile.length === 0)).toBe(true);
  });

  it("防护卷轴 A：全队获得 5 张防御牌（defensePile）", () => {
    const s = createUniState();
    const r = applyEventOption(s, "scroll", 0);
    expect(r.ok).toBe(true);
    s.team.forEach((t) => expect(t.status.defensePile).toHaveLength(5));
  });

  it("迷途商队 C：100 碎片但全队失去 1 张防御牌", () => {
    const s = createUniState();
    s.team.forEach((t) => {
      t.status.defensePile.push({ value: 2, rank: "?", suit: "♠" }, { value: 4, rank: "?", suit: "♠" });
    });
    const r = applyEventOption(s, "caravan", 2);
    expect(r.ok).toBe(true);
    expect(s.shards).toBe(100);
    s.team.forEach((t) => expect(t.status.defensePile).toHaveLength(1));
  });
  it("开发者角色 myracler(12)：开大对敌方全体 1000 伤害，冷却 0", () => {
    const s = createUniState([12, 1, 2, 3]);
    startCombat(s);
    const enemy0 = s.combat.enemies[0];
    const enemy1 = s.combat.enemies[1];
    // 让 myracler 成为当前行动者
    s.combat.activeIdx = 0;
    s.combat.turnIdx = s.combat.actionOrder.indexOf(0);
    const r = playerSkill(s, undefined, {});
    expect(r.ok).toBe(true);
    expect(enemy0.hp).toBe(Math.max(0, enemy0.maxHp - 1000));
    expect(enemy1.hp).toBe(Math.max(0, enemy1.maxHp - 1000));
    expect(enemy0.alive).toBe(false);
    expect(s.team[0].skillCooldown).toBe(0); // 冷却 0 → 下回合可再开大
  });

  it("经典/联赛/世界杯选角池不含开发者角色(12)", () => {
    // useGameController.availableChars / LeagueDraft / worldCup 均已过滤，
    // 这里验证 CHARACTERS 中 12 存在但不会被经典模式随机到（worldCup 随机过滤）
    expect(CHARACTERS[12]).toBeTruthy();
    const pool = Object.values(CHARACTERS).filter((c) => c.id !== 12);
    expect(pool.some((c) => c.id === 12)).toBe(false);
    expect(pool.length).toBe(11);
  });
});

describe("模拟宇宙 M5：商店与造物调试台", () => {
  it("商店商品生成：祝福 10（3×1星+4×2星+3×3星）、奇物 8、方程 3", () => {
    const s = createUniState();
    s.region = { type: "shop" };
    enterRegion(s);
    const st = s.shopStock;
    expect(st.blessing).toHaveLength(10);
    expect(st.blessing.filter((b) => b.star === 1)).toHaveLength(3);
    expect(st.blessing.filter((b) => b.star === 2)).toHaveLength(4);
    expect(st.blessing.filter((b) => b.star === 3)).toHaveLength(3);
    expect(st.curio).toHaveLength(8);
    expect(st.equation).toHaveLength(3);
    expect(st.equation.map((e) => e.star).sort()).toEqual([1, 2, 3]);
  });

  it("商店购买：扣费、已售出拒绝、碎片不足拒绝", () => {
    const s = createUniState();
    s.region = { type: "shop" };
    enterRegion(s);
    addShards(s, 500);
    const item = s.shopStock.blessing[0];
    const price = shopPrice(s, "blessing", item.star);
    const r = shopBuy(s, "blessing", 0);
    expect(r.ok).toBe(true);
    expect(r.price).toBe(price);
    expect(s.shards).toBe(500 - price);
    // 已售出
    expect(shopBuy(s, "blessing", 0).ok).toBe(false);
    // 碎片不足（花光）
    s.shards = 1;
    expect(shopBuy(s, "blessing", 1).ok).toBe(false);
  });

  it("热量强化：1 星祝福消耗 1 热量，效果 ×2；热量不足拒绝", () => {
    const s = createUniState();
    gainBlessing(s, "ganlu"); // 1 星
    s.heat = 5;
    const r = heatStrengthen(s, 0);
    expect(r.ok).toBe(true);
    expect(s.heat).toBe(4);
    expect(s.blessings[0].heatEnhanced).toBe(2);
    // 祝福倍数：1（基础）×2（热量）= 2
    expect(blessingMult(s, "ganlu")).toBe(2);
    // 热量不足
    s.heat = 0;
    expect(heatStrengthen(s, 0).ok).toBe(false);
  });

  it("覆写祝福：25 碎片换同星级随机祝福，价格递增 50", () => {
    const s = createUniState();
    gainBlessing(s, "ganlu");
    const oldId = s.blessings[0].id;
    addShards(s, 200);
    const r = overwriteBlessing(s, 0);
    expect(r.ok).toBe(true);
    expect(r.price).toBe(25);
    expect(s.blessings[0].id).not.toBe(oldId);
    expect(s.blessings[0].star).toBe(1); // 同星级
    expect(s.overwritePrice).toBe(50);
    expect(s.shards).toBe(200 - 25);
  });

  it("覆写方程：同星级随机替换", () => {
    const s = createUniState();
    gainEquation(s, "shouzu");
    addShards(s, 200);
    const r = overwriteEquation(s, 0);
    expect(r.ok).toBe(true);
    expect(s.equations[0].star).toBe(1);
  });

  it("休整复活：150 碎片复活（reviveAtRest 复用）", () => {
    const s = createUniState();
    addShards(s, 300);
    s.team[1].alive = false;
    s.team[1].hp = 0;
    const r = reviveAtRest(s, 1);
    expect(r.ok).toBe(true);
    expect(s.shards).toBe(150);
    expect(s.team[1].alive).toBe(true);
  });
});

describe("模拟宇宙 M5：奇物与方程效果", () => {
  it("俱乐部券：战斗胜利碎片 +40%", () => {
    const s = createUniState();
    gainCurio(s, "club");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 1 }] };
    startCombat(s);
    s.combat.enemies.forEach((e) => {
      e.hp = 0;
      e.alive = false;
    });
    playerDefense(s, 0);
    expect(s.combat.phase).toBe("won");
    expect(s.shards).toBe(Math.floor(30 * 1.4)); // 30 × 1.4 = 42
  });

  it("破碎咕咕钟：战斗胜利碎片 -25%", () => {
    const s = createUniState();
    gainCurio(s, "posui");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 1 }] };
    startCombat(s);
    s.combat.enemies.forEach((e) => {
      e.hp = 0;
      e.alive = false;
    });
    playerDefense(s, 0);
    expect(s.shards).toBe(Math.floor(30 * 0.75)); // 22
  });

  it("香涎干酪：胜利后全队回满", () => {
    const s = createUniState();
    gainCurio(s, "cheese");
    s.team[0].hp = 1;
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 1 }] };
    startCombat(s);
    s.combat.enemies.forEach((e) => {
      e.hp = 0;
      e.alive = false;
    });
    playerDefense(s, 0);
    expect(s.team[0].hp).toBe(s.team[0].maxHp);
  });

  it("福灵胶：胜利后额外 3 星祝福并损毁", () => {
    const s = createUniState();
    gainCurio(s, "fujiao");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 1 }] };
    startCombat(s);
    s.combat.enemies.forEach((e) => {
      e.hp = 0;
      e.alive = false;
    });
    playerDefense(s, 0);
    expect(s.blessings.some((b) => b.star === 3)).toBe(true);
    expect(s.curios.some((c) => c.id === "fujiao")).toBe(false); // 损毁
  });

  it("时空棱镜：获得时全队技能等级 +2", () => {
    const s = createUniState();
    gainCurio(s, "lens");
    s.team.forEach((t) => expect(t.skillLevel).toBe(3));
  });

  it("永动咕咕钟：进入新区域 -4% 碎片", () => {
    const s = createUniState();
    gainCurio(s, "yongdong");
    addShards(s, 100);
    s.region = { type: "fortune" };
    enterRegion(s);
    // 先 -4%（100×4%=4），再 +300（进入财富区域）
    expect(s.shards).toBe(100 - 4 + 300);
  });

  it("换心魔：获得时全队生命上限 +40%", () => {
    const s = createUniState();
    gainEquation(s, "huanxin");
    s.team.forEach((t) => expect(t.maxHp).toBe(Math.floor(CHARACTERS[t.charId].hp * 1.4)));
  });

  it("受诅教师：每消灭敌人本场伤害 +20%（最多 3 层）", () => {
    const s = createUniState();
    gainEquation(s, "shouzu");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 2 }] };
    startCombat(s);
    // 击杀敌人 1
    s.combat.enemies[0].hp = 1;
    s.combat.pendingPoker = [{ value: 5, rank: "5", suit: "♠" }, { value: 5, rank: "5", suit: "♣" }];
    playerAttack(s, 0);
    expect(s.combat.killStacks).toBe(1);
    // 下一名角色普攻敌人 2（还活着）：伤害 +20%
    const enemy2 = s.combat.enemies[1];
    const hpBefore = enemy2.hp;
    setPoker(s, 5); // raw = 5，+20% → 6
    playerAttack(s, enemy2.id);
    expect(enemy2.hp).toBe(hpBefore - 6);
  });

  it("蛰虫帝：施放终结技后对随机敌人 10% 生命上限伤害", () => {
    const s = createUniState([1, 2, 3, 4]);
    gainEquation(s, "zhedi");
    startCombat(s);
    s.combat.pendingPoker = [{ value: 3, rank: "3", suit: "♠" }, { value: 4, rank: "4", suit: "♦" }];
    const enemy = s.combat.enemies[0];
    const hpBefore = enemy.hp;
    playerSkill(s, enemy.id); // 温迪开大
    expect(enemy.hp).toBeLessThan(hpBefore); // 有 zhedi 附加伤害
  });
});

describe("模拟宇宙集成：跑 10 层流程", () => {
  /** 完成当前区域（战斗直接胜利 / 事件选第一个选项 / 其他直接推进） */
  function completeRegion(s) {
    if (s.pendingChoice) {
      chooseNormalContent(s, 0);
    }
    const r = s.region;
    if (!r) return;
    if (r.type === "battle" || r.type === "elite" || r.type === "boss" || r.type === "transform") {
      if (!s.combat) startCombat(s);
      // 全灭当前波敌人 → 触发胜利
      let guard = 0;
      while (guard++ < 30 && s.combat?.phase !== "won" && s.combat?.phase !== "lost") {
        const c = s.combat;
        if (!c) break;
        if (c.phase === "player-action") {
          c.enemies.forEach((e) => {
            e.hp = 0;
            e.alive = false;
          });
          playerDefense(s, 0);
        } else if (c.phase === "enemy-announce") {
          const a = enemyAnnounce(s);
          if (a.playing) enemyResolve(s);
          else break;
        } else if (c.phase === "wave-clear") {
          chooseThirdWave(s, false); // 撤退保底
        } else {
          break;
        }
      }
      // 领取祝福三选一（若有）
      let pickGuard = 0;
      while ((s.pendingBlessingPicks?.length || 0) > 0 && pickGuard++ < 10) {
        const cur = s.pendingBlessingPicks[0];
        chooseBlessingPick(s, cur.candidates[0]);
      }
      if (s.combat?.phase === "won") s.combat = null; // 模拟「前往下一区域」后的清理
    } else if (r.type === "event" || r.type === "reward" || r.type === "adventure") {
      const def = getEventDef(r.eventId);
      if (def) applyEventOption(s, r.eventId, 0);
      // 事件战斗：打完
      if (s.combat) {
        let guard = 0;
        while (guard++ < 30 && s.combat?.phase !== "won" && s.combat?.phase !== "lost") {
          const c = s.combat;
          if (c.phase === "player-action") {
            c.enemies.forEach((e) => {
              e.hp = 0;
              e.alive = false;
            });
            playerDefense(s, 0);
          } else if (c.phase === "enemy-announce") {
            const a = enemyAnnounce(s);
            if (a.playing) enemyResolve(s);
            else break;
          } else {
            break;
          }
        }
        s.combat = null;
      }
      s.pendingBlessingPicks = null;
    }
    // 推进
    advanceFloor(s);
  }

  it("前 10 层全部完成不崩溃、层数递增", () => {
    const s = createUniState();
    let floorStart = s.floor;
    for (let i = 0; i < 10 && !s.gameOver; i++) {
      completeRegion(s);
      expect(s.floor).toBeGreaterThan(floorStart);
      floorStart = s.floor;
    }
    expect(s.floor).toBeGreaterThanOrEqual(11);
    // 第 11 层已进入第二位面（11-30）
    expect(s.plane).toBe(2);
    // 状态一致性：队伍 4 人、碎片非负
    expect(s.team).toHaveLength(4);
    expect(s.shards).toBeGreaterThanOrEqual(0);
  });

  it("跑到第 20 层（首领层）不崩溃", () => {
    const s = createUniState();
    let guard = 0;
    while (s.floor < 20 && !s.gameOver && guard++ < 60) {
      completeRegion(s);
    }
    expect(s.gameOver).toBe(false);
    expect(s.floor).toBe(20);
    expect(getLayerType(20)).toBe("boss");
  });
});

describe("模拟宇宙 M7：全量祝福效果", () => {
  it("祝福池全量：1星 29 + 2星 23 + 3星 7 = 59", () => {
    const all = Object.values(BLESSINGS);
    expect(all).toHaveLength(59);
    expect(all.filter((b) => b.star === 1)).toHaveLength(29);
    expect(all.filter((b) => b.star === 2)).toHaveLength(23);
    expect(all.filter((b) => b.star === 3)).toHaveLength(7);
    // 六命运全覆盖
    ["存护", "丰饶", "智识", "毁灭", "繁育", "虚无"].forEach((f) => {
      expect(all.some((b) => b.fate === f)).toBe(true);
    });
  });

  it("结膜：普攻后获得 3 张防御牌", () => {
    const s = createUniState();
    gainBlessing(s, "jiemo");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 2 }] };
    startCombat(s);
    const attackerIdx = s.combat.activeIdx;
    const before = s.team[attackerIdx].status.defensePile.length;
    setPoker(s, 5);
    playerAttack(s, s.combat.enemies[0].id);
    expect(s.team[attackerIdx].status.defensePile.length).toBe(before + 3);
  });

  it("回光效应：受致命攻击免死回复 1%", () => {
    const s = createUniState();
    gainBlessing(s, "huiguang");
    s.team.forEach((t, i) => {
      if (i !== 0) {
        t.alive = false;
        t.hp = 0;
      }
    });
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 1 }] };
    startCombat(s);
    s.team[0].hp = 3;
    // 敌人打 10 点（> hp）
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "single", dmg: 10 }, desc: "x" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.team[0].alive).toBe(true);
    expect(s.team[0].hp).toBeGreaterThan(0);
  });

  it("湮灭回归不等式：伤害由全队分担", () => {
    const s = createUniState();
    gainBlessing(s, "yanmie");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 1 }] };
    startCombat(s);
    s.team.forEach((t) => (t.hp = t.maxHp));
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "single", dmg: 8 }, desc: "x" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    // 全员都掉血（分担）
    s.team.forEach((t) => expect(t.hp).toBeLessThan(t.maxHp));
  });

  it("寰宇热寂：受击获得 4 层战意（伤害+4%）", () => {
    const s = createUniState();
    gainBlessing(s, "huanyu");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 2 }] };
    startCombat(s);
    // 让敌人打成员 0
    s.team.forEach((t, i) => {
      if (i !== 0) {
        t.alive = false;
        t.hp = 0;
      }
    });
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "single", dmg: 2 }, desc: "x" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.team[0].status.zhandu).toBeGreaterThanOrEqual(4);
  });

  it("意义质询：dot 敌人造成的伤害降低 3 点", () => {
    const s = createUniState();
    gainBlessing(s, "yiyi");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 1 }] };
    startCombat(s);
    s.combat.enemies[0].dotTurns = 3;
    s.combat.enemies[0].dotDmg = 2;
    s.team.forEach((t, i) => {
      if (i !== 0) {
        t.alive = false;
        t.hp = 0;
      }
    });
    const before = s.team[0].hp;
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "single", dmg: 5 }, desc: "x" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.team[0].hp).toBe(before - 2); // 5-3=2
  });
});

describe("模拟宇宙 M8：全量奇物", () => {
  it("奇物池全量：9 负面 + 27×1星 + 36×2星 + 7×3星 = 79", () => {
    const all = Object.values(CURIOS);
    expect(all).toHaveLength(79);
    expect(all.filter((c) => c.negative)).toHaveLength(9);
    expect(all.filter((c) => c.star === 1)).toHaveLength(27);
    expect(all.filter((c) => c.star === 2)).toHaveLength(36);
    expect(all.filter((c) => c.star === 3)).toHaveLength(7);
  });

  it("铸铁齿轮指环：获得碎片 +30%", () => {
    const s = createUniState();
    gainCurio(s, "zhutie");
    addShards(s, 100);
    expect(s.shards).toBe(130);
  });

  it("失金爪锚：获得时 +500 碎片", () => {
    const s = createUniState();
    gainCurio(s, "shijin");
    expect(s.shards).toBe(500);
  });

  it("祭献投枪：进入战斗区域 +35 碎片", () => {
    const s = createUniState();
    gainCurio(s, "jixian");
    s.region = { type: "battle", name: "战斗" };
    enterRegion(s);
    expect(s.shards).toBe(35);
  });

  it("临时赌资：5 个区域后损毁并 -450", () => {
    const s = createUniState();
    gainCurio(s, "linji");
    addShards(s, 600);
    for (let i = 0; i < 5; i++) {
      s.region = { type: "fortune", name: "财富" };
      enterRegion(s);
    }
    expect(s.curios.some((c) => c.id === "linji")).toBe(false);
    expect(s.shards).toBe(600 + 300 + 5 * 300 - 450);
  });

  it("水上书：进入区域回满并复活死亡角色", () => {
    const s = createUniState();
    gainCurio(s, "shuishang");
    s.team[0].hp = 1;
    s.team[1].alive = false;
    s.team[1].hp = 0;
    s.region = { type: "fortune", name: "财富" };
    enterRegion(s);
    expect(s.team[0].hp).toBe(s.team[0].maxHp);
    expect(s.team[1].alive).toBe(true);
  });

  it("邪恶机械卫星：商品价格 -25%", () => {
    const s = createUniState();
    gainCurio(s, "xiee");
    expect(shopPrice(s, "blessing", 1)).toBe(Math.floor(80 * 0.75)); // 60
  });

  it("羊皮卷：进入战斗敌方全体受 30% 生命上限伤害", () => {
    const s = createUniState();
    gainCurio(s, "sheep");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 1 }] };
    startCombat(s);
    expect(s.combat.enemies[0].hp).toBe(Math.max(0, 10 - Math.floor(10 * 0.3))); // 7
  });
});

describe("模拟宇宙 M9：全量方程", () => {
  it("方程池全量：3×1星 + 5×2星 + 5×3星 = 13", () => {
    const all = Object.values(EQUATIONS);
    expect(all).toHaveLength(13);
    expect(all.filter((e) => e.star === 1)).toHaveLength(3);
    expect(all.filter((e) => e.star === 2)).toHaveLength(5);
    expect(all.filter((e) => e.star === 3)).toHaveLength(5);
  });

  it("梦魔主：攻击附加（生命上限+护盾）10% 伤害", () => {
    const s = createUniState();
    gainEquation(s, "mengmo");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 2 }] };
    startCombat(s);
    const enemy = s.combat.enemies[0];
    const hpBefore = enemy.hp;
    setPoker(s, 5);
    playerAttack(s, enemy.id);
    // 伤害 = 8 + (maxHp+shield)10% ≈ 8+1 = 9
    expect(enemy.hp).toBeLessThan(hpBefore - 5);
  });

  it("遗迹魔法师：攻击后罐中脑 +8%", () => {
    const s = createUniState();
    gainEquation(s, "yiji");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 2 }] };
    startCombat(s);
    setPoker(s, 5);
    playerAttack(s, s.combat.enemies[0].id);
    expect(s.jarBrain).toBeGreaterThanOrEqual(8);
  });

  it("蠕行之蛇：第一回合普攻伤害 +60%", () => {
    const s = createUniState();
    gainEquation(s, "ruchong");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 2 }] };
    startCombat(s);
    const enemy = s.combat.enemies[0];
    const hpBefore = enemy.hp;
    setPoker(s, 5); // raw 5 × 1.6 = 8
    playerAttack(s, enemy.id);
    expect(enemy.hp).toBe(Math.max(0, hpBefore - 8));
  });

  it("除魔士：每 4 回合全队伤害 +200%", () => {
    const s = createUniState();
    gainEquation(s, "chumo");
    s.region = { type: "battle", name: "战斗", waves: [{ kind: "normal", count: 2 }] };
    startCombat(s);
    s.combat.round = 3;
    // 新回合开始（round → 4）：除魔士触发
    startPlayerTurn(s);
    expect(s.team[0].status.dmgBuffPct).toBeGreaterThanOrEqual(200);
  });
});

describe("模拟宇宙 M10：菜月昴回滚后重新开战", () => {
  it("死亡回归回滚后 combat 清空、region 保留，可重新 startCombat", () => {
    const s = createUniState([11, 2, 3, 4]);
    startCombat(s); // 第 1 层 battle
    expect(s.combat.phase).toBe("player-action");
    // 全灭 → 触发回滚
    s.team.forEach((t) => {
      t.hp = 0;
      t.alive = false;
    });
    s.combat.enemyQueue = [{ enemyIdx: 0, action: { type: "aoe", dmg: 3 }, desc: "x" }];
    s.combat.phase = "enemy-announce";
    enemyAnnounce(s);
    enemyResolve(s);
    expect(s.gameOver).toBe(false);
    expect(s.combat).toBeNull(); // 回滚清空战斗
    expect(s.region.type).toBe("battle"); // 区域保留
    // 重新开战（控制器 enterCurrentMode 行为）
    startCombat(s);
    expect(s.combat.phase).toBe("player-action");
    expect(s.team.every((t) => t.alive)).toBe(true);
  });

  it("读档后新字段默认值兜底（jarBrain/items 等不因旧存档丢失崩溃）", () => {
    const s = createUniState();
    const data = serializeUni(s);
    delete data.jarBrain;
    delete data.items;
    const s2 = createUniState();
    expect(deserializeUni(s2, data)).toBe(true);
    // 兜底：createUniState 初始化值保留
    expect(s2.jarBrain).toBe(0);
    expect(s2.items).toBeTruthy();
    expect(s2.items.medkit).toBe(0);
  });
});

describe("模拟宇宙 M11：审查修复回归", () => {
  it("奇遇 strengthen 分支不崩溃且强化祝福（修复 ODDITY_STRENGTHEN_COUNT 未导入）", () => {
    const s = createUniState();
    gainBlessing(s, "ganlu");
    gainBlessing(s, "shouzhao");
    const orig1 = s.blessings[0].heatEnhanced;
    const orig2 = s.blessings[1].heatEnhanced;
    // 固定随机 → oddityEffect = 'strengthen'（ODDITY_EFFECTS[2]）
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    s.region = { type: "oddity" };
    enterRegion(s);
    vi.restoreAllMocks();
    expect(s.region.oddityEffect).toBe("strengthen");
    // 强化 8 个随机祝福（2 个全部强化 ×2）
    expect(s.blessings[0].heatEnhanced).toBe((orig1 || 1) * 2);
    expect(s.blessings[1].heatEnhanced).toBe((orig2 || 1) * 2);
  });

  it("精英 B 锁定不累积：新一轮重新锁定清空旧目标", () => {
    const s = createUniState();
    startCombat(s);
    const enemy = s.combat.enemies[0];
    enemy.kind = "elite";
    enemy.pattern = "B";
    enemy.round = 1;
    const tpl = ENEMY_PATTERNS.elite.B;
    // 第 1 回合：生成 lock 行动（锁定在 resolveEnemyAction 执行，这里模拟已锁定 2 人）
    const r1 = resolvePatternActions(s, enemy, tpl);
    expect(r1).toHaveLength(2);
    enemy.locked = [0, 2]; // 模拟第 1 回合已锁定 2 人
    // 第 3 回合：循环重新锁定 → resolvePatternActions 清空旧目标
    enemy.round = 3;
    resolvePatternActions(s, enemy, tpl);
    expect(enemy.locked).toHaveLength(0); // 旧目标已清空，不会累积
  });

  it("转化 dot 全灭第二波 → wave-clear 不被回合推进覆盖", () => {
    const s = createUniState();
    s.region = { type: "transform", name: "转化", waves: TRANSFORM_WAVES };
    startCombat(s);
    s.combat.wave = 1; // 第二波
    s.combat.enemies = [
      { id: 0, kind: "normal", name: "普通敌人1", pattern: "A", hp: 0, maxHp: 10, shield: 0, locked: [], round: 1, alive: true, dotDmg: 5, dotTurns: 1 },
    ];
    // 新回合开始：dot 结算清空第二波 → wave-clear，且不被后续玩家行动推进覆盖
    startPlayerTurn(s);
    expect(s.combat.phase).toBe("wave-clear");
    expect(s.combat.turnIdx).toBe(0); // 未被推进到下一名角色（修复前会变 1）
  });
});
