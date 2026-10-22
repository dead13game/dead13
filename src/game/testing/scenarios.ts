// 脚本化场景:覆盖 AI 永远不会触发(或极难触发)的分支
//
// 设计要点:场景只描述「意图」(摆一张陷阱 / 给所有人装圣遗物 / 牌堆顶放什么),
// 不直接操作具体字段 —— 旧适配器与新内核各自实现 api,同一份场景两边都能跑。
//
// 牌堆顶控制:drawCards 用 pop,所以 forceDraw(a, b) 先抽 a 再抽 b。

import type { Card, GameState, Rank } from "../types.js";

/** 场景脚本里的一条命令(args 原样喂给回放器) */
export interface ScriptStep {
  type: string;
  args?: {
    targetIndex?: number;
    kind?: string;
    choice?: string;
    subSkill?: number;
    order?: number[];
  };
}

/** 场景 api:新旧适配器各实现一份,场景只依赖这份接口 */
export interface ScenarioApi {
  forceDraw(...values: number[]): void;
  setTrap(playerIndex: number, value: number, id: string): void;
  addDefense(playerIndex: number, value: number, id: string): void;
  setHp(playerIndex: number, hp: number): void;
  setArtifactAll(id: number): void;
  setBreakAll(n: number): void;
  setHolyWordAll(n: number): void;
}

/** 一个脚本化场景 */
export interface ScriptedCase {
  id: string;
  seed: number;
  chars: number[];
  weather: boolean;
  startRound: number;
  limit: number;
  script: ScriptStep[];
  applyPlan(api: ScenarioApi): void;
}

export function makeCard(value: number, id?: string): Card {
  return {
    id: id ?? `X-${value}`,
    suit: "♠",
    // 合成牌的 rank 直接取点数字符串("13"/"9"),仅供对拍基线使用,不在 Rank 枚举内
    rank: String(value) as Rank,
    value,
    faceUp: false,
  };
}

export function buildScriptedCases(): ScriptedCase[] {
  return [
    {
      id: "script-ally-betray",
      seed: 101,
      chars: [1, 1, 1, 1], // 全员温迪:同速,index 即行动顺序
      weather: false,
      startRound: 5,
      limit: 24,
      // P0 与 P2 结盟 → 三人行动 → P0 背刺 P2 → P1 攻击带背刺惩罚的 P0
      script: [
        { type: "ally" },
        { type: "allyTarget", args: { targetIndex: 2 } },
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
        { type: "betray" },
        { type: "defense" },
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 0 } },
        { type: "defense" },
        { type: "defense" },
      ],
      applyPlan(api) {
        api.forceDraw(3, 13);
      },
    },
    {
      id: "script-holyword-artifact",
      seed: 102,
      chars: [6, 6, 6, 6], // 全员玛薇卡(被动技,只能靠圣言自明增伤)
      weather: false,
      startRound: 4,
      limit: 16,
      script: [
        { type: "holyWord" }, // 消耗 8 击破 → 额外行动 + 圣遗物激活 2 回合
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 1 } }, // 13 → 角斗士 +7 = 20
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
      ],
      applyPlan(api) {
        api.setArtifactAll(1);
        api.setBreakAll(8);
        api.setHolyWordAll(2);
        api.forceDraw(13);
      },
    },
    {
      id: "script-trap-reflect",
      seed: 103,
      chars: [1, 1, 1, 1],
      weather: false,
      startRound: 4,
      limit: 12,
      script: [
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 1 } },
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
      ],
      applyPlan(api) {
        api.setTrap(1, 13, "T-13");
        api.forceDraw(5);
      },
    },
    {
      id: "script-trap-tie",
      seed: 104,
      chars: [1, 1, 1, 1],
      weather: false,
      startRound: 4,
      limit: 12,
      script: [
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 1 } },
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
      ],
      applyPlan(api) {
        api.setTrap(1, 7, "T-7");
        api.forceDraw(7);
      },
    },
    {
      id: "script-trap-break",
      seed: 105,
      chars: [1, 1, 1, 1],
      weather: false,
      startRound: 4,
      limit: 12,
      script: [
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 1 } },
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
      ],
      applyPlan(api) {
        api.setTrap(1, 5, "T-5");
        api.addDefense(1, 4, "D-4");
        api.forceDraw(13);
      },
    },
    {
      id: "script-alliance-split",
      seed: 106,
      chars: [1, 1, 1, 1],
      weather: false,
      startRound: 5,
      limit: 14,
      script: [
        { type: "ally" },
        { type: "allyTarget", args: { targetIndex: 2 } },
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 0 } },
        { type: "defense" },
        { type: "defense" },
      ],
      applyPlan(api) {
        api.forceDraw(13);
      },
    },
    {
      id: "script-freeze-skip",
      seed: 107,
      chars: [10, 10, 10, 10], // 全员爱蜜莉雅
      weather: false,
      startRound: 4,
      limit: 14,
      script: [
        { type: "skill" },
        { type: "skillTarget", args: { targetIndex: 1, kind: "aimiliya" } },
        { type: "defense" }, // 冻结不结束回合 → P0 额外行动
        { type: "defense" }, // 跳过 P1 后轮到 P2
        { type: "defense" },
      ],
      applyPlan() {},
    },
    {
      id: "script-venti-double",
      seed: 108,
      chars: [1, 1, 1, 1],
      weather: false,
      startRound: 10, // 千风之诗需第 10 回合
      limit: 12,
      script: [
        { type: "skill" },
        { type: "attackTarget", args: { targetIndex: 1 } },
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
      ],
      applyPlan(api) {
        api.forceDraw(9, 3); // 先抽 3 再抽 9 → 合计 12
      },
    },
    {
      id: "script-caiyueang-load",
      seed: 109,
      chars: [11, 11, 11, 11], // 全员菜月昴
      weather: false,
      startRound: 4,
      limit: 20,
      script: [
        { type: "skill" },
        { type: "caiyueang", args: { choice: "save" } }, // 存档不结束回合
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 1 } },
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
        { type: "skill" },
        { type: "caiyueang", args: { choice: "load" } }, // 深拷贝回滚
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
      ],
      applyPlan(api) {
        api.forceDraw(11);
      },
    },
    {
      id: "script-fenjin-heal",
      seed: 110,
      chars: [8, 8, 8, 8], // 全员风堇
      weather: false,
      startRound: 5,
      limit: 16,
      script: [
        { type: "skill" }, // 生命上限 +3 并回满,对目标造成回复量×2
        { type: "skillTarget", args: { targetIndex: 1, kind: "fenjin" } },
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
      ],
      applyPlan(api) {
        api.setHp(0, 4); // 制造回复量
      },
    },
    {
      id: "script-zhongli-shield",
      seed: 111,
      chars: [2, 2, 2, 2], // 全员钟离
      weather: false,
      startRound: 4,
      limit: 16,
      script: [
        { type: "skill" },
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 0 } },
        { type: "defense" },
        { type: "defense" },
      ],
      applyPlan(api) {
        api.forceDraw(13);
      },
    },
  ];
}

/**
 * 旧实现的局面形状(顶层 resources/statusEffects 时代)。
 * 旧适配器已下线,这里只保留字段声明给 legacyScenarioApi 用。
 */
export interface LegacyScenarioPlayer {
  hp: number;
  trap: Card | null;
  defensePile: Card[];
  artifactId: number | null;
  breakCount: number;
  holyWordUses: number;
}

export interface LegacyScenarioState {
  deck: Card[];
  players: LegacyScenarioPlayer[];
}

/** 旧实现的场景 api(给 adapters/legacy.js 用) */
export function legacyScenarioApi(state: LegacyScenarioState): ScenarioApi {
  return {
    forceDraw(...values) {
      for (let i = values.length - 1; i >= 0; i--) {
        state.deck.push(makeCard(values[i], `F-${values[i]}-${state.deck.length}`));
      }
    },
    setTrap(playerIndex, value, id) {
      state.players[playerIndex].trap = { ...makeCard(value, id), faceUp: false };
    },
    addDefense(playerIndex, value, id) {
      state.players[playerIndex].defensePile.push({
        ...makeCard(value, id),
        faceUp: false,
      });
    },
    setHp(playerIndex, hp) {
      state.players[playerIndex].hp = hp;
    },
    setArtifactAll(id) {
      for (const p of state.players) p.artifactId = id;
    },
    setBreakAll(n) {
      for (const p of state.players) p.breakCount = n;
    },
    setHolyWordAll(n) {
      for (const p of state.players) p.holyWordUses = n;
    },
  };
}

/** 新内核的场景 api(给 next-replay 测试用) */
export function nextScenarioApi(state: GameState): ScenarioApi {
  return {
    forceDraw(...values) {
      for (let i = values.length - 1; i >= 0; i--) {
        state.deck.push(makeCard(values[i], `F-${values[i]}-${state.deck.length}`));
      }
    },
    setTrap(playerIndex, value, id) {
      state.players[playerIndex].trap = { ...makeCard(value, id), faceUp: false };
    },
    addDefense(playerIndex, value, id) {
      state.players[playerIndex].defensePile.push({
        ...makeCard(value, id),
        faceUp: false,
      });
    },
    setHp(playerIndex, hp) {
      state.players[playerIndex].hp = hp;
    },
    setArtifactAll(id) {
      for (const p of state.players) {
        // 圣遗物表用数字 id;PlayerArtifact.id 声明为 string|null,
        // 这里借一个宽类型视图赋值,不改运行期(仍是同一个 artifact 对象)。
        const artifact: { id: number | string | null } = p.artifact;
        artifact.id = id;
      }
    },
    setBreakAll(n) {
      for (const p of state.players) p.resources.breakCount = n;
    },
    setHolyWordAll(n) {
      for (const p of state.players) p.resources.holyWordUses = n;
    },
  };
}
