// 脚本化场景:覆盖 AI 永远不会触发(或极难触发)的分支
//
// 为什么需要:AI 只会在 attack/defense/gamble/skill 里选,结盟、背刺、圣言自明
// 三个指令在 19 局 AI 对局里出现 0 次。这恰好是重写最容易静默改坏的部分。
//
// 手法:
//   - 队伍用同一角色,消除「按 speed 重排后 index 漂移」的心智负担
//   - preState(state) 直接摆状态(陷阱、护盾、击破计数、牌堆顶)
//   - 牌堆顶用 push 控制:drawCards 用 pop,所以最后一个元素最先被抽到
//   - script 是逐条原子命令,顺序必须与当前 step 匹配

const CARD = (value, id) => ({
  id: id ?? `X-${value}`,
  suit: "♠",
  rank: String(value),
  value,
  faceUp: false,
});

/** 依次抽取 values[0], values[1] ...(drawCards 从尾部 pop) */
function forceDraw(state, ...values) {
  for (let i = values.length - 1; i >= 0; i--) {
    state.deck.push(CARD(values[i], `F-${values[i]}-${state.deck.length}`));
  }
}

export function buildScriptedCases() {
  return [
    {
      id: "script-ally-betray",
      seed: 101,
      chars: [1, 1, 1, 1], // 全员温迪:同速,index 即行动顺序
      weather: false,
      startRound: 4,
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
      preState(state) {
        forceDraw(state, 3, 13);
      },
    },
    {
      id: "script-holyword-artifact",
      seed: 102,
      chars: [6, 6, 6, 6], // 全员玛薇卡(被动技,主动技能不可用,只能靠圣言自明增伤)
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
      preState(state) {
        for (const p of state.players) {
          p.artifactId = 1; // 角斗士的终幕礼
          p.breakCount = 8;
          p.holyWordUses = 2;
        }
        forceDraw(state, 13);
      },
    },
    {
      id: "script-trap-reflect",
      seed: 103,
      chars: [1, 1, 1, 1],
      weather: false,
      startRound: 4,
      limit: 12,
      // 攻击 5 点 vs 陷阱 13 → 反弹
      script: [
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 1 } },
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
      ],
      preState(state) {
        state.players[1].trap = { ...CARD(13, "T-13"), faceUp: false };
        forceDraw(state, 5);
      },
    },
    {
      id: "script-trap-tie",
      seed: 104,
      chars: [1, 1, 1, 1],
      weather: false,
      startRound: 4,
      limit: 12,
      // 攻击 7 点 vs 陷阱 7 → 平局双方受伤
      script: [
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 1 } },
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
      ],
      preState(state) {
        state.players[1].trap = { ...CARD(7, "T-7"), faceUp: false };
        forceDraw(state, 7);
      },
    },
    {
      id: "script-trap-break",
      seed: 105,
      chars: [1, 1, 1, 1],
      weather: false,
      startRound: 4,
      limit: 12,
      // 攻击 13 点 vs 陷阱 5 → 击破(击破计数 + 斗志)
      script: [
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 1 } },
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
      ],
      preState(state) {
        state.players[1].trap = { ...CARD(5, "T-5"), faceUp: false };
        state.players[1].defensePile.push({ ...CARD(4, "D-4"), faceUp: false });
        forceDraw(state, 13);
      },
    },
    {
      id: "script-alliance-split",
      seed: 106,
      chars: [1, 1, 1, 1],
      weather: false,
      startRound: 4,
      limit: 14,
      // P0 与 P2 结盟,P1 攻击 P0 → 伤害 (13-2)/3 平摊
      script: [
        { type: "ally" },
        { type: "allyTarget", args: { targetIndex: 2 } },
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 0 } },
        { type: "defense" },
        { type: "defense" },
      ],
      preState(state) {
        forceDraw(state, 13);
      },
    },
    {
      id: "script-freeze-skip",
      seed: 107,
      chars: [10, 10, 10, 10], // 全员爱蜜莉雅
      weather: false,
      startRound: 4,
      limit: 14,
      // 冻结 P1 → P1 的回合被 nextPlayer 跳过
      script: [
        { type: "skill" },
        { type: "skillTarget", args: { targetIndex: 1, kind: "aimiliya" } },
        { type: "defense" }, // 冻结不结束回合 → P0 额外行动
        { type: "defense" }, // 跳过 P1 后轮到 P2
        { type: "defense" },
      ],
    },
    {
      id: "script-venti-double",
      seed: 108,
      chars: [1, 1, 1, 1],
      weather: false,
      startRound: 10, // 千风之诗需第 10 回合
      limit: 12,
      script: [
        { type: "skill" }, // 抽 2 张(3+9=12)进入 attackShowCard
        { type: "attackTarget", args: { targetIndex: 1 } },
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
      ],
      preState(state) {
        forceDraw(state, 9, 3);
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
      preState(state) {
        forceDraw(state, 11);
      },
    },
    {
      id: "script-fenjin-heal",
      seed: 110,
      chars: [8, 8, 8, 8], // 全员风堇
      weather: false,
      startRound: 4,
      limit: 16,
      script: [
        { type: "skill" }, // 生命上限 +3 并回满,对目标造成回复量×2
        { type: "skillTarget", args: { targetIndex: 1, kind: "fenjin" } },
        { type: "defense" },
        { type: "defense" },
        { type: "defense" },
      ],
      preState(state) {
        state.players[0].hp = 4; // 制造回复量
      },
    },
    {
      id: "script-zhongli-shield",
      seed: 111,
      chars: [2, 2, 2, 2], // 全员钟离
      weather: false,
      startRound: 4,
      limit: 16,
      // P0 开盾 → P1 攻击 P0,伤害先进护盾牌
      script: [
        { type: "skill" },
        { type: "attack" },
        { type: "attackTarget", args: { targetIndex: 0 } },
        { type: "defense" },
        { type: "defense" },
      ],
      preState(state) {
        forceDraw(state, 13);
      },
    },
  ];
}
