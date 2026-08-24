// 模拟宇宙事件系统 — 分支事件 / 奖励 / 冒险
// 纯逻辑层，零依赖（设计文档 docs/simuniverse-design.md §7 + 需求文档第七框架）

import { LOG_TYPE } from "../../game/gameLogger.js";
import { addShards, spendShards, syncPassives } from "./uniState.js";
import {
  rollBlessing,
  rollBlessingCandidates,
  gainBlessing,
  loseRandomBlessing,
  loseBlessingAt,
  rollCurio,
  gainCurio,
  loseRandomCurio,
  rollEquation,
  gainEquation,
  BLESSINGS,
  CURIOS,
  CURIO_FX,
  breakCurio,
} from "./uniBuffs.js";
import { UNI_SKILLS } from "./uniConstants.js";
import { drawPokerUnified } from "./uniCombat.js";

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 治疗全队（百分比，受祝福回复加成与减疗影响——简化：事件治疗不吃减疗） */
function healTeamPct(state, pct, floorMode = false) {
  let healed = 0;
  for (const t of state.team) {
    if (!t.alive) continue;
    const amount = floorMode
      ? Math.ceil((t.maxHp * pct) / 100)
      : Math.floor((t.maxHp * pct) / 100);
    t.hp = Math.min(t.maxHp, t.hp + amount);
    healed += amount;
  }
  return healed;
}

/** 全队损失生命上限百分比的血量（最低减为 1） */
function loseTeamHpPct(state, pct) {
  for (const t of state.team) {
    if (!t.alive) continue;
    const loss = Math.floor((t.maxHp * pct) / 100);
    t.hp = Math.max(1, t.hp - loss);
  }
}

/**
 * 全队获得/失去防御牌（±N 张，统一机制：获得 = 抽 N 张牌、点数加入护盾；失去 = 护盾减少）。
 * 与防御行动/结膜/禳灾/莉奈娅一技能完全一致。
 */
function teamDefenseCards(state, n) {
  if (n >= 0) {
    for (const t of state.team) {
      if (!t.alive) continue;
      const cards = drawPokerUnified(state, n);
      const total = cards.reduce((s, p) => s + p.value, 0);
      t.shield += total;
      state.log.push(`${t.name} 获得 ${n} 张防御牌（${total} 点），防御 +${total}`);
    }
    return n;
  }
  // 失去 |n| 张防御牌：护盾减少（按每张牌面均值 5 点计）
  for (const t of state.team) {
    if (!t.alive) continue;
    t.shield = Math.max(0, t.shield + n * 5);
  }
  return n;
}

/** 提升角色技能等级（n 级，上限 10），同步被动 */
export function applySkillUp(state, charIndex, n) {
  const t = state.team[charIndex];
  if (!t) return { ok: false, reason: "无此角色" };
  if (t.charId === 11) return { ok: false, reason: "菜月昴不可升级" };
  const before = t.skillLevel;
  t.skillLevel = Math.min(10, t.skillLevel + n);
  syncPassives(state);
  state.log.push(`${t.name} 技能等级 +${t.skillLevel - before}（Lv${t.skillLevel}）`);
  return { ok: true, leveled: t.skillLevel - before };
}

/** 随机一名可升级角色技能 +1 */
function randomSkillUp(state, n = 1) {
  const upgradable = state.team.filter((t) => t.alive && t.charId !== 11);
  if (!upgradable.length) return null;
  const t = pick(upgradable);
  return applySkillUp(state, t.index, n);
}

// ================= 事件定义（需求文档第七框架） =================
// 选项效果字段：
//   shards: ±宇宙碎片；healPct: 全队回复%；loseHpPct: 全队损失生命上限%
//   blessingCount: 随机祝福数；blessingPick: 三选一次数（starRange）
//   curioCount: 随机奇物数（excludeNegative）；equationStar: 获得该星级方程
//   defenseCards: ±防御牌张数；skillUpRandom: 随机角色升级；skillUpTarget: 需选角色（返回 needSkillTarget）
//   loseBlessing: 失去随机祝福数；loseCurio: 失去随机奇物数
//   battle: 事件战斗 { kind, count, reward: { blessingPick, blessingStars, shards } }
//   buff: 下次战斗 buff（M5 接入）；medkit: 急救包；planeMaxHp: 本位面生命上限%
//   requireShards: 需要花费碎片（不足选项不可选/自动失败）

export const UNI_EVENTS = {
  "hungry_chest": {
    "id": "hungry_chest",
    "title": "饥饿的宝箱",
    "desc": "你发现了一个上锁的宝箱，锁孔里渗出一缕黑烟。",
    "options": [
      {
        "text": "支付 100 宇宙碎片打开",
        "effects": {
          "requireShards": 100,
          "blessingCount": 1,
          "blessingStars": [
            1,
            1
          ]
        }
      },
      {
        "text": "支付 150 宇宙碎片强行砸开",
        "effects": {
          "requireShards": 150,
          "curioCount": 1
        }
      },
      {
        "text": "放弃",
        "effects": {}
      }
    ]
  },
  "broken_gate": {
    "id": "broken_gate",
    "title": "破损的传送门",
    "desc": "一道快要消散的传送门，还能用，但不稳定。",
    "options": [
      {
        "text": "支付 100 宇宙碎片修复",
        "effects": {
          "requireShards": 100,
          "blessingCount": 1
        }
      },
      {
        "text": "直接进入",
        "effects": {
          "battle": {
            "kind": "elite",
            "count": 2,
            "reward": {
              "skillUpAll": 1
            }
          }
        }
      },
      {
        "text": "无视",
        "effects": {}
      }
    ]
  },
  "hungry_void": {
    "id": "hungry_void",
    "title": "饥饿的虚空",
    "desc": "你感到有什么东西正在吸取你的生命。",
    "options": [
      {
        "text": "献出生命",
        "effects": {
          "loseHpPct": 30,
          "blessingCount": 2,
          "blessingStars": [
            2,
            3
          ]
        }
      },
      {
        "text": "献出护盾",
        "effects": {
          "loseShieldPct": 30,
          "curioCount": 2,
          "curioStars": [
            2,
            2
          ]
        }
      },
      {
        "text": "快速逃离",
        "effects": {
          "shards": 25
        }
      }
    ]
  },
  "old_altar": {
    "id": "old_altar",
    "title": "古老的供桌",
    "desc": "桌上摆着一碗浑浊的液体，旁边刻着一行字：“以物易物。”",
    "options": [
      {
        "text": "献出奇物",
        "effects": {
          "loseCurio": 1,
          "blessingCount": 1,
          "blessingStars": [
            2,
            2
          ]
        }
      },
      {
        "text": "献出祝福",
        "effects": {
          "loseBlessing": 1,
          "shards": 100
        }
      },
      {
        "text": "无视",
        "effects": {}
      }
    ]
  },
  "bandit_camp": {
    "id": "bandit_camp",
    "title": "强盗营地",
    "desc": "一群强盗拦住了去路，但他们愿意谈判。",
    "options": [
      {
        "text": "支付 100 宇宙碎片买路",
        "effects": {
          "requireShards": 100
        }
      },
      {
        "text": "支付随机一名角色的所有护盾",
        "effects": {
          "loseAllShieldRandom": true
        }
      },
      {
        "text": "拒绝，进入战斗",
        "effects": {
          "battle": {
            "kind": "normal",
            "count": 5,
            "reward": {
              "shards": 150
            }
          }
        }
      }
    ]
  },
  "shaky_bridge": {
    "id": "shaky_bridge",
    "title": "摇摇欲坠的桥梁",
    "desc": "一座吊桥，看起来随时会断。",
    "options": [
      {
        "text": "强行通过",
        "effects": {
          "loseHpPct": 10
        }
      },
      {
        "text": "加固桥梁",
        "effects": {
          "requireShards": 150
        }
      },
      {
        "text": "绕行",
        "effects": {
          "loseCurio": 2
        }
      }
    ]
  },
  "sleepy_flowers": {
    "id": "sleepy_flowers",
    "title": "催眠花丛",
    "desc": "一片花丛散发出的香气令人昏昏欲睡。",
    "options": [
      {
        "text": "屏住呼吸快速穿过",
        "effects": {
          "loseHpPct": 10
        }
      },
      {
        "text": "吸入香气",
        "effects": {
          "curioNegative": true
        }
      },
      {
        "text": "点燃花丛",
        "effects": {
          "shards": -100
        }
      }
    ]
  },
  "poison_spring": {
    "id": "poison_spring",
    "title": "有毒的泉水",
    "desc": "路边有一片奇异的泉水。",
    "options": [
      {
        "text": "饮用泉水",
        "effects": {
          "healPct": 20
        }
      },
      {
        "text": "收集泉水",
        "effects": {
          "skillUpTarget": 1
        }
      },
      {
        "text": "绕过",
        "effects": {
          "shards": 150
        }
      }
    ]
  },
  "misty_forest": {
    "id": "misty_forest",
    "title": "迷雾森林",
    "desc": "浓雾笼罩，什么都看不清。",
    "options": [
      {
        "text": "强行穿越",
        "effects": {
          "skillUpTarget": 2,
          "loseHpPct": 20
        }
      },
      {
        "text": "点火照明",
        "effects": {
          "skillUpAll": 1,
          "loseHpPct": 40
        }
      },
      {
        "text": "等待雾散",
        "effects": {}
      }
    ]
  },
  "thorny_path": {
    "id": "thorny_path",
    "title": "荆棘之路",
    "desc": "前面的路被荆棘覆盖了。",
    "options": [
      {
        "text": "直接踩过去",
        "effects": {
          "loseHpPct": 15
        }
      },
      {
        "text": "砍开荆棘",
        "effects": {
          "loseBlessing": 2
        }
      },
      {
        "text": "绕行",
        "effects": {
          "shards": -100
        }
      }
    ]
  },
  "traveling_merchant": {
    "id": "traveling_merchant",
    "title": "旅行商人（车厘子版）",
    "desc": "一个行商，愿意用他的货物换你的资源。",
    "options": [
      {
        "text": "支付 50 宇宙碎片",
        "effects": {
          "requireShards": 50,
          "blessingCount": 1,
          "blessingStars": [
            1,
            1
          ]
        }
      },
      {
        "text": "支付 100 宇宙碎片",
        "effects": {
          "requireShards": 100,
          "defenseCards": 3
        }
      },
      {
        "text": "不理会他",
        "effects": {
          "shards": 50
        }
      }
    ]
  },
  "wandering_doctor": {
    "id": "wandering_doctor",
    "title": "流浪医师",
    "desc": "一位自称能治愈一切伤痛的医师。",
    "options": [
      {
        "text": "支付 100 宇宙碎片",
        "effects": {
          "requireShards": 100,
          "healPct": 50
        }
      },
      {
        "text": "支付 200 宇宙碎片复活一名阵亡角色",
        "effects": {
          "requireShards": 200,
          "revive": true
        }
      },
      {
        "text": "拒绝",
        "effects": {}
      }
    ]
  },
  "mysterious_collector": {
    "id": "mysterious_collector",
    "title": "神秘收藏家",
    "desc": "他愿意用祝福换奇物，用奇物换祝福。",
    "options": [
      {
        "text": "支付 1 个奇物",
        "effects": {
          "loseCurio": 1,
          "blessingCount": 2,
          "blessingStars": [
            1,
            2
          ]
        }
      },
      {
        "text": "支付 2 个随机祝福",
        "effects": {
          "loseBlessing": 2,
          "curioCount": 2,
          "curioStars": [
            1,
            2
          ]
        }
      },
      {
        "text": "离开",
        "effects": {}
      }
    ]
  },
  "indebted_villager": {
    "id": "indebted_villager",
    "title": "欠债的村民",
    "desc": "一群村民请求你的帮助，他们愿意偿还。",
    "options": [
      {
        "text": "支付 120 宇宙碎片帮助他们还钱",
        "effects": {
          "requireShards": 120,
          "blessingCount": 1,
          "blessingStars": [
            1,
            2
          ]
        }
      },
      {
        "text": "帮他们与催债人战斗",
        "effects": {
          "battle": {
            "kind": "elite",
            "count": 2,
            "reward": {
              "shards": 220
            }
          }
        }
      },
      {
        "text": "拒绝",
        "effects": {}
      }
    ]
  },
  "destiny_coin": {
    "id": "destiny_coin",
    "title": "命运硬币",
    "desc": "抛一枚硬币，赌它是正面还是反面。",
    "options": [
      {
        "text": "赌正面",
        "effects": {
          "shards": 100
        }
      },
      {
        "text": "赌反面",
        "effects": {
          "shards": -50
        }
      },
      {
        "text": "不赌",
        "effects": {}
      }
    ]
  },
  "card_guess": {
    "id": "card_guess",
    "title": "抽牌游戏",
    "desc": "对方拿出两张牌，让你猜哪张最大。",
    "options": [
      {
        "text": "猜第一张",
        "effects": {
          "blessingCount": 1,
          "blessingStars": [
            2,
            2
          ]
        }
      },
      {
        "text": "猜第二张",
        "effects": {
          "shards": -100
        }
      },
      {
        "text": "不玩",
        "effects": {}
      }
    ]
  },
  "big_wheel": {
    "id": "big_wheel",
    "title": "大转盘",
    "desc": "转动一个巨大的轮盘。",
    "options": [
      {
        "text": "转动大转盘",
        "effects": {
          "roulette": true
        }
      }
    ]
  },
  "mirror_reflection": {
    "id": "mirror_reflection",
    "title": "镜中倒影",
    "desc": "你看见了自己的倒影，但它不太对劲。",
    "options": [
      {
        "text": "与倒影对话",
        "effects": {
          "curioCount": 2
        }
      },
      {
        "text": "击碎镜子",
        "effects": {
          "loseHpPct": 20,
          "skillUpTarget": 1
        }
      },
      {
        "text": "离开",
        "effects": {}
      }
    ]
  },
  "stone_riddle": {
    "id": "stone_riddle",
    "title": "石碑谜题",
    "desc": "一块刻着谜题的石碑，内容与“数字”有关。",
    "options": [
      {
        "text": "认真解答",
        "effects": {
          "blessingCount": 2,
          "blessingStars": [
            2,
            2
          ]
        }
      },
      {
        "text": "打碎石碑",
        "effects": {
          "curioCount": 1,
          "curioStars": [
            2,
            2
          ]
        }
      },
      {
        "text": "无视",
        "effects": {
          "shards": 100
        }
      }
    ]
  },
  "time_crack": {
    "id": "time_crack",
    "title": "时间裂缝",
    "desc": "一道裂缝，能看见过去或未来的画面。",
    "options": [
      {
        "text": "凝视裂缝",
        "effects": {
          "blessingCount": 1
        }
      },
      {
        "text": "触碰裂缝",
        "effects": {
          "shards": -50,
          "curioCount": 1,
          "curioStars": [
            2,
            2
          ]
        }
      },
      {
        "text": "退后",
        "effects": {
          "shards": 50
        }
      }
    ]
  },
  "echo_cave": {
    "id": "echo_cave",
    "title": "回声洞穴",
    "desc": "你在洞穴里喊一声，回声会以某种方式返回。",
    "options": [
      {
        "text": "大喊",
        "effects": {
          "equationStar": 3,
          "loseHpPct": 20
        }
      },
      {
        "text": "轻声说",
        "effects": {
          "blessingCount": 2,
          "blessingStars": [
            2,
            2
          ]
        }
      },
      {
        "text": "沉默",
        "effects": {
          "shards": 100
        }
      }
    ]
  },
  "abandoned_weapon": {
    "id": "abandoned_weapon",
    "title": "被遗弃的武器",
    "desc": "一把插在石头里的武器。",
    "options": [
      {
        "text": "拔出武器",
        "effects": {
          "skillUpTarget": 2
        }
      },
      {
        "text": "放弃",
        "effects": {
          "shards": 120
        }
      }
    ]
  },
  "rune_trap": {
    "id": "rune_trap",
    "title": "符文陷阱",
    "desc": "你触发了地上奇怪的符文。",
    "options": [
      {
        "text": "支付 150 宇宙碎片",
        "effects": {
          "requireShards": 150
        }
      },
      {
        "text": "硬扛符文",
        "effects": {
          "loseShieldPct": 20
        }
      },
      {
        "text": "献出祝福与奇物",
        "effects": {
          "loseBlessing": 1,
          "loseCurio": 1
        }
      }
    ]
  },
  "crows": {
    "id": "crows",
    "title": "乌鸦群",
    "desc": "一群乌鸦在头顶盘旋，似乎在等待什么。",
    "options": [
      {
        "text": "支付 50 宇宙碎片喂食乌鸦",
        "effects": {
          "requireShards": 50,
          "blessingCount": 1,
          "blessingStars": [
            2,
            2
          ]
        }
      },
      {
        "text": "驱赶乌鸦",
        "effects": {
          "equationStar": 1
        }
      },
      {
        "text": "无视",
        "effects": {
          "shards": 80
        }
      }
    ]
  },
  "ghost_merchant": {
    "id": "ghost_merchant",
    "title": "幽灵商人",
    "desc": "一个半透明的商人，只收“记忆”。",
    "options": [
      {
        "text": "支付 2 个 2 星祝福",
        "effects": {
          "loseBlessingStars": [
            2,
            2
          ],
          "loseBlessingStarsCount": 2,
          "shards": 150
        }
      },
      {
        "text": "献出护盾",
        "effects": {
          "loseShieldPct": 70,
          "blessingCount": 1,
          "blessingStars": [
            3,
            3
          ],
          "curioCount": 1,
          "curioStars": [
            3,
            3
          ]
        }
      },
      {
        "text": "离开",
        "effects": {}
      }
    ]
  },
  "abyss_eye": {
    "id": "abyss_eye",
    "title": "深渊之眼",
    "desc": "一只巨大的眼睛从地面睁开，注视着你。",
    "options": [
      {
        "text": "与它对视",
        "effects": {
          "skillUpTarget": 1,
          "shards": -150
        }
      },
      {
        "text": "移开视线",
        "effects": {}
      }
    ]
  },
  "empty_castle": {
    "id": "empty_castle",
    "title": "空荡的古堡",
    "desc": "一座很有年代感的古堡，但里面什么都没有。",
    "options": [
      {
        "text": "搜索古堡",
        "effects": {
          "healPct": 50
        }
      },
      {
        "text": "探索藏书室",
        "effects": {
          "blessingCount": 2,
          "blessingStars": [
            2,
            2
          ]
        }
      },
      {
        "text": "搜刮财宝",
        "effects": {
          "shards": 100
        }
      }
    ]
  },
  "weird_statue": {
    "id": "weird_statue",
    "title": "怪异的雕像",
    "desc": "一座雕像，看起来和某个人很像。",
    "options": [
      {
        "text": "触摸雕像",
        "effects": {
          "healPct": 20
        }
      },
      {
        "text": "砸碎雕像",
        "effects": {
          "shards": 150,
          "curioCount": 1
        }
      },
      {
        "text": "离开",
        "effects": {
          "equationStar": 2
        }
      }
    ]
  },
  "last_campfire": {
    "id": "last_campfire",
    "title": "最后的篝火",
    "desc": "一团快要熄灭的篝火，旁边有一些物资。",
    "options": [
      {
        "text": "加柴火",
        "effects": {
          "healPct": 10
        }
      },
      {
        "text": "翻找物资",
        "effects": {
          "skillUpAll": 1
        }
      },
      {
        "text": "离开",
        "effects": {
          "shards": 100
        }
      }
    ]
  },
  "abyss_gate": {
    "id": "abyss_gate",
    "title": "深渊之门",
    "desc": "一扇通往未知的门。",
    "options": [
      {
        "text": "进入",
        "effects": {
          "curioCount": 1,
          "curioStars": [
            3,
            3
          ],
          "loseHpPct": 20
        }
      },
      {
        "text": "封印它",
        "effects": {
          "equationStar": 1,
          "equationCount": 2
        }
      },
      {
        "text": "离开",
        "effects": {
          "blessingCount": 2,
          "blessingStars": [
            1,
            2
          ]
        }
      }
    ]
  }
};

// ================= 奖励事件（模拟宇宙最新修改.md §奖励，30 个） =================

export const UNI_REWARDS = {
  "forgotten_treasure": {
    "id": "forgotten_treasure",
    "title": "被遗忘的宝藏",
    "desc": "你在废墟中踢到了一个硬物，拨开碎石，露出了一个古老的箱子。",
    "options": [
      {
        "text": "打开箱子",
        "effects": {
          "shards": 150
        }
      },
      {
        "text": "检查周围",
        "effects": {
          "curioCount": 1,
          "excludeNegative": true,
          "curioStars": [
            2,
            2
          ]
        }
      }
    ]
  },
  "falling_star": {
    "id": "falling_star",
    "title": "坠落之星",
    "desc": "一颗流星划过天际，落在不远处的地面上，砸出一个冒着烟的大坑。",
    "options": [
      {
        "text": "前往坠落点",
        "effects": {
          "blessingCount": 2,
          "blessingStars": [
            1,
            1
          ]
        }
      },
      {
        "text": "收集散落的碎片",
        "effects": {
          "shards": 100
        }
      }
    ]
  },
  "underground_cave": {
    "id": "underground_cave",
    "title": "地下溶洞",
    "desc": "你脚下的地面突然塌陷，露出一个布满发光晶体的地下溶洞。",
    "options": [
      {
        "text": "采集晶体",
        "effects": {
          "shards": 200
        }
      },
      {
        "text": "深入探索",
        "effects": {
          "curioCount": 2,
          "excludeNegative": true,
          "curioStars": [
            1,
            1
          ]
        }
      }
    ]
  },
  "shipwreck": {
    "id": "shipwreck",
    "title": "沉船残骸",
    "desc": "一艘古老的船残骸搁浅在岸边，船体上长满了藤壶，似乎已经在这里躺了很久。",
    "options": [
      {
        "text": "搜索船体",
        "effects": {
          "shards": 120
        }
      },
      {
        "text": "检查船舱",
        "effects": {
          "equationStar": 1
        }
      }
    ]
  },
  "ancient_sarcophagus": {
    "id": "ancient_sarcophagus",
    "title": "远古石棺",
    "desc": "你发现了一具刻满符文的石棺，棺盖半开，里面似乎有什么东西在发光。",
    "options": [
      {
        "text": "查看棺内",
        "effects": {
          "blessingCount": 1,
          "blessingStars": [
            2,
            2
          ]
        }
      },
      {
        "text": "研究符文",
        "effects": {
          "equationStar": 1
        }
      }
    ]
  },
  "blessing_spring": {
    "id": "blessing_spring",
    "title": "祝福之泉",
    "desc": "一汪泉水在月光下泛着微光，水面倒映出不属于天空的星辰。",
    "options": [
      {
        "text": "饮用泉水",
        "effects": {
          "healPct": 50
        }
      },
      {
        "text": "收集泉水",
        "effects": {
          "blessingCount": 1,
          "blessingStars": [
            3,
            3
          ]
        }
      }
    ]
  },
  "golden_fruit": {
    "id": "golden_fruit",
    "title": "金色果实",
    "desc": "一棵挂满金色果实的树，果实在风中轻轻摇晃，散发出香甜的气息。",
    "options": [
      {
        "text": "采摘果实",
        "effects": {
          "blessingCount": 2,
          "blessingStars": [
            1,
            1
          ]
        }
      },
      {
        "text": "收集种子",
        "effects": {
          "shards": 100
        }
      }
    ]
  },
  "warm_campfire": {
    "id": "warm_campfire",
    "title": "温暖篝火",
    "desc": "一堆未熄灭的篝火，旁边堆放着一些物资，看起来是前人留下的。",
    "options": [
      {
        "text": "在篝火旁休息",
        "effects": {
          "healPct": 30
        }
      },
      {
        "text": "翻找物资",
        "effects": {
          "defenseCards": 2
        }
      }
    ]
  },
  "crystal_cave": {
    "id": "crystal_cave",
    "title": "水晶洞穴",
    "desc": "你进入了一个布满水晶的洞穴，洞壁上闪烁着各色光芒，敲击一下就有碎片掉落。",
    "options": [
      {
        "text": "收集水晶碎片",
        "effects": {
          "shards": 180
        }
      },
      {
        "text": "寻找大块水晶",
        "effects": {
          "curioCount": 2,
          "excludeNegative": true,
          "curioStars": [
            1,
            1
          ]
        }
      }
    ]
  },
  "meteor_shower": {
    "id": "meteor_shower",
    "title": "流星雨",
    "desc": "夜空中划过无数流星，坠落在地面上，留下星尘形成的特殊地貌。",
    "options": [
      {
        "text": "追逐流星坠落点",
        "effects": {
          "equationStar": 2
        }
      },
      {
        "text": "收集星尘",
        "effects": {
          "blessingCount": 3,
          "blessingStars": [
            1,
            2
          ]
        }
      }
    ]
  },
  "graveyard_keeper": {
    "id": "graveyard_keeper",
    "title": "守墓人",
    "desc": "一个沉默的守墓人坐在一座古墓前，他指了指墓碑上的文字，一言不发。",
    "options": [
      {
        "text": "阅读墓碑",
        "effects": {
          "equationStar": 1
        }
      },
      {
        "text": "与守墓人交易",
        "effects": {
          "curioCount": 1,
          "excludeNegative": true,
          "curioStars": [
            2,
            2
          ]
        }
      }
    ]
  },
  "ruins_phantom": {
    "id": "ruins_phantom",
    "title": "遗迹幻影",
    "desc": "你在废墟中看到一个转瞬即逝的幻影，它消失的地方留下了一件发光的物品。",
    "options": [
      {
        "text": "拾取物品",
        "effects": {
          "blessingCount": 2,
          "blessingStars": [
            2,
            2
          ]
        }
      },
      {
        "text": "检查幻影消失的位置",
        "effects": {
          "shards": 150
        }
      }
    ]
  },
  "rune_stones": {
    "id": "rune_stones",
    "title": "符文石阵",
    "desc": "一圈高耸的符文石矗立在此，刻满了古老的文字。",
    "options": [
      {
        "text": "激活符文石",
        "effects": {
          "curioCount": 1,
          "curioStars": [
            1,
            1
          ]
        }
      },
      {
        "text": "抄录符文",
        "effects": {
          "blessingCount": 1,
          "blessingStars": [
            1,
            1
          ]
        }
      }
    ]
  },
  "ghost_ship": {
    "id": "ghost_ship",
    "title": "幽灵船（成龙暖心奖励版）",
    "desc": "一艘幽灵船静静地停泊在雾中，甲板上空无一人，但船舱里堆满了物资。",
    "options": [
      {
        "text": "搬运物资",
        "effects": {
          "shards": 150
        }
      },
      {
        "text": "搜索船长室",
        "effects": {
          "curioCount": 2,
          "excludeNegative": true,
          "curioStars": [
            2,
            2
          ]
        }
      }
    ]
  },
  "inverted_tower": {
    "id": "inverted_tower",
    "title": "逆位之塔",
    "desc": "一座高耸的石塔，塔顶闪烁着微弱的蓝色光芒。",
    "options": [
      {
        "text": "攀上塔顶",
        "effects": {
          "curioCount": 1,
          "curioStars": [
            3,
            3
          ]
        }
      },
      {
        "text": "搜索塔底",
        "effects": {
          "shards": 120
        }
      }
    ]
  },
  "traveling_caravan": {
    "id": "traveling_caravan",
    "title": "流浪商队（后街女孩）",
    "desc": "一支路过的商队愿意分享一些物资。",
    "options": [
      {
        "text": "接受赠予",
        "effects": {
          "shards": 100,
          "defenseCards": 2
        }
      },
      {
        "text": "请求交易",
        "effects": {
          "curioCount": 1,
          "excludeNegative": true,
          "curioStars": [
            3,
            3
          ]
        }
      }
    ]
  },
  "elf_messenger": {
    "id": "elf_messenger",
    "title": "精灵信使",
    "desc": "一位精灵信使递给你一个卷轴，然后消失在光影中。",
    "options": [
      {
        "text": "打开卷轴",
        "effects": {
          "skillUpTarget": 2
        }
      },
      {
        "text": "保留卷轴",
        "effects": {
          "equationStar": 1
        }
      }
    ]
  },
  "old_blacksmith": {
    "id": "old_blacksmith",
    "title": "老铁匠",
    "desc": "一位老铁匠正在修理装备，他愿意帮你加固防御。",
    "options": [
      {
        "text": "加固护甲",
        "effects": {
          "defenseCards": 4
        }
      },
      {
        "text": "购买装备",
        "effects": {
          "blessingCount": 1,
          "blessingStars": [
            3,
            3
          ],
          "curioCount": 1,
          "curioStars": [
            3,
            3
          ]
        }
      }
    ]
  },
  "bard": {
    "id": "bard",
    "title": "吟游诗人（Windy）",
    "desc": "一位吟游诗人愿意为你唱一首古老的歌谣，据说歌谣中隐藏着风的力量。",
    "options": [
      {
        "text": "聆听歌谣",
        "effects": {
          "blessingCount": 2,
          "blessingStars": [
            3,
            3
          ],
          "curioCount": 2,
          "curioStars": [
            3,
            3
          ]
        }
      },
      {
        "text": "学唱歌谣",
        "effects": {
          "equationStar": 3,
          "equationCount": 2,
          "blessingCount": 3
        }
      },
      {
        "text": "送他一瓶好酒",
        "effects": {
          "skillUpAll": 3,
          "shards": 300
        }
      }
    ]
  },
  "shaman": {
    "id": "shaman",
    "title": "萨满祭司",
    "desc": "一位萨满祭司正在进行祭祀仪式，她邀请你一同参与。",
    "options": [
      {
        "text": "参与仪式",
        "effects": {
          "blessingCount": 2,
          "blessingStars": [
            2,
            2
          ]
        }
      },
      {
        "text": "接受赐福",
        "effects": {
          "healPct": 50
        }
      }
    ]
  },
  "blessing_tree": {
    "id": "blessing_tree",
    "title": "祝福之树",
    "desc": "一棵巨大的古树，枝叶间挂满了发光的祝福，树下落满了碎片。",
    "options": [
      {
        "text": "摇动树干",
        "effects": {
          "defenseCards": 2
        }
      },
      {
        "text": "捡拾碎片",
        "effects": {
          "shards": 100
        }
      }
    ]
  },
  "mirror_space": {
    "id": "mirror_space",
    "title": "镜像空间",
    "desc": "你走进了一个镜像空间，每一个方向都通向不同的地方。",
    "options": [
      {
        "text": "左转",
        "effects": {
          "curioCount": 1,
          "curioStars": [
            1,
            1
          ]
        }
      },
      {
        "text": "右转",
        "effects": {
          "equationStar": 1
        }
      }
    ]
  },
  "time_echo": {
    "id": "time_echo",
    "title": "时光回响",
    "desc": "你触碰了时空的裂隙，看到了过去和未来的画面。",
    "options": [
      {
        "text": "观看过去",
        "effects": {
          "blessingCount": 2,
          "blessingStars": [
            1,
            2
          ]
        }
      },
      {
        "text": "观看未来",
        "effects": {
          "skillUpTarget": 2
        }
      }
    ]
  },
  "star_bridge": {
    "id": "star_bridge",
    "title": "星界之桥",
    "desc": "一座星光构成的桥梁横跨在虚空中。",
    "options": [
      {
        "text": "走过星桥",
        "effects": {
          "shards": 200
        }
      },
      {
        "text": "采集星光",
        "effects": {
          "curioCount": 2,
          "curioStars": [
            2,
            2
          ]
        }
      }
    ]
  },
  "life_spring": {
    "id": "life_spring",
    "title": "生命之泉",
    "desc": "一汪泉水，水面上漂浮着金色的光点。",
    "options": [
      {
        "text": "饮用泉水",
        "effects": {
          "healPct": 100
        }
      },
      {
        "text": "收集光点",
        "effects": {
          "equationStar": 1
        }
      }
    ]
  },
  "blessing_shards_gift": {
    "id": "blessing_shards_gift",
    "title": "祝福与碎片的馈赠",
    "desc": "你遇到了一位神秘的旅人，他留下的包裹中既有祝福也有碎片。",
    "options": [
      {
        "text": "拆开包裹",
        "effects": {
          "blessingCount": 1,
          "blessingStars": [
            1,
            1
          ],
          "curioCount": 1,
          "curioStars": [
            1,
            1
          ]
        }
      },
      {
        "text": "继续前进",
        "effects": {
          "shards": 100
        }
      }
    ]
  },
  "curio_healing": {
    "id": "curio_healing",
    "title": "奇物与治疗",
    "desc": "你发现了一座奇物收藏室，旁边还有一间医疗室。",
    "options": [
      {
        "text": "参观收藏室",
        "effects": {
          "curioCount": 2,
          "excludeNegative": true,
          "curioStars": [
            1,
            1
          ]
        }
      },
      {
        "text": "使用医疗室",
        "effects": {
          "healPct": 40
        }
      }
    ]
  },
  "equation_blessing": {
    "id": "equation_blessing",
    "title": "方程与祝福",
    "desc": "你找到了一本破旧的手稿，里面记载着方程和祝福的融合之法。",
    "options": [
      {
        "text": "研读手稿",
        "effects": {
          "defenseCards": 3
        }
      },
      {
        "text": "实践手稿",
        "effects": {
          "skillUpAll": 1
        }
      }
    ]
  },
  "stardust_shards": {
    "id": "stardust_shards",
    "title": "星尘与碎片",
    "desc": "你经过一片弥漫着星尘的区域，地面上铺满了宇宙碎片。",
    "options": [
      {
        "text": "收集星尘",
        "effects": {
          "blessingCount": 1,
          "blessingStars": [
            3,
            3
          ]
        }
      },
      {
        "text": "收集碎片",
        "effects": {
          "curioCount": 2,
          "curioStars": [
            2,
            2
          ]
        }
      }
    ]
  },
  "team_supply": {
    "id": "team_supply",
    "title": "全队大补给",
    "desc": "你发现了一个完整的补给站，物资齐全。",
    "options": [
      {
        "text": "全面补给",
        "effects": {
          "defenseCards": 3,
          "blessingCount": 2,
          "blessingStars": [
            1,
            1
          ]
        }
      },
      {
        "text": "精挑细选",
        "effects": {
          "curioCount": 1,
          "curioStars": [
            3,
            3
          ]
        }
      }
    ]
  }
};

export const UNI_ADVENTURES = {
  dice: {
    id: "dice",
    title: "骰子游戏",
    desc: "商人拿出骰子，邀请你玩一局。",
    options: [
      { text: "保守：投入 60 碎片", effects: { gamble: { cost: 60, mult: 20 } } },
      { text: "正常：投入 90 碎片", effects: { gamble: { cost: 90, mult: 30 } } },
      { text: "豪赌：投入 150 碎片", effects: { gamble: { cost: 150, mult: 50 } } },
    ],
  },
  cards: {
    id: "cards",
    title: "翻牌",
    desc: "三张牌扣在桌子上，抽一张。",
    options: [
      { text: "抽一张", effects: { fortuneCard: true } },
    ],
  },
  lottery: {
    id: "lottery",
    title: "抽签",
    desc: "10 支签放在一个竹筒里（1 大吉 / 2 中吉 / 4 小吉 / 3 凶）。",
    options: [
      { text: "抽一支（25 碎片）", effects: { lottery: { cost: 25, count: 1 } } },
      { text: "抽三支取最好（100 碎片）", effects: { lottery: { cost: 100, count: 3 } } },
      { text: "放弃", effects: {} },
    ],
  },
};

/** 事件池（普通层事件类型抽取用） */
export const EVENT_POOL = { ...UNI_EVENTS, ...UNI_REWARDS, ...UNI_ADVENTURES };

/** 按事件 id 取事件定义 */
export function getEventDef(eventId) {
  return EVENT_POOL[eventId] || null;
}

/** 按区域类型随机抽 1 个具体事件（type: event/reward/adventure） */
export function rollEvent(type) {
  const pool =
    type === "reward" ? UNI_REWARDS : type === "adventure" ? UNI_ADVENTURES : UNI_EVENTS;
  const ids = Object.keys(pool);
  return pick(ids);
}

// ================= 选项应用 =================

/**
 * 应用事件选项。
 * @returns {object} { ok, outcome: { text, effects }, needSkillTarget, battle, pendingReward, gamble, lottery, eventId }
 */
export function applyEventOption(state, eventId, optionIdx) {
  const ev = getEventDef(eventId);
  if (!ev || !ev.options[optionIdx]) return { ok: false, reason: "无此选项" };
  const opt = ev.options[optionIdx];
  const fx = opt.effects || {};
  const outcome = { text: opt.text, fx };

  // 花费检查（不足时视为选择失败，无惩罚）
  if (fx.requireShards && !spendShards(state, fx.requireShards)) {
    outcome.failed = "碎片不足";
    return { ok: true, outcome, eventId, eventTitle: ev.title };
  }

  // 货币
  if (fx.shards) addShards(state, fx.shards);

  // 血量
  if (fx.healPct) healTeamPct(state, fx.healPct, fx.ceil);
  if (fx.loseHpPct) loseTeamHpPct(state, fx.loseHpPct);
  if (fx.loseHpAfter3) {
    // 医疗补给 C：回满，3 层之后损失 50%（当前层 ≤ 2 不扣）
    if (state.floor <= 2) {
      healTeamPct(state, 100);
    } else {
      healTeamPct(state, 100);
      loseTeamHpPct(state, fx.loseHpAfter3);
    }
  }

  // 防御牌（±，统一机制：获得=抽牌加盾，见 teamDefenseCards）
  if (fx.defenseCards) teamDefenseCards(state, fx.defenseCards);
  if (fx.loseAllDefense) {
    for (const t of state.team) t.shield = 0;
  }

  // 祝福
  if (fx.blessingCount) {
    const starRange = fx.blessingStars || [1, 3];
    for (let i = 0; i < fx.blessingCount; i++) {
      const id = rollBlessing(starRange[0], starRange[1]);
      if (id) gainBlessing(state, id, { silent: true });
    }
  }
  // 祝福三选一：入待选队列（UI 逐次展示）
  if (fx.blessingPick) {
    const starRange = fx.blessingStars || [1, 3];
    const picks = [];
    for (let i = 0; i < fx.blessingPick; i++) {
      picks.push({
        candidates: rollBlessingCandidates(3, starRange[0], starRange[1]),
        starRange,
      });
    }
    state.pendingBlessingPicks = (state.pendingBlessingPicks || []).concat(picks);
    outcome.pendingPicks = picks.length;
  }

  // 奇物（支持 curioStars 指定星级区间；excludeNegative 排除负面）
  if (fx.curioCount) {
    const stars = fx.curioStars || [1, 3];
    for (let i = 0; i < fx.curioCount; i++) {
      const id = rollCurio(fx.excludeNegative, stars[0], stars[1]);
      if (id) gainCurio(state, id, { silent: true });
    }
  }
  // 负面奇物（诅咒类，如催眠花丛 B）
  if (fx.curioNegative || fx.negativeCurioCount) {
    const negPool = Object.values(CURIOS).filter((c) => c.negative);
    const n = fx.curioNegative ? 1 : fx.negativeCurioCount;
    for (let i = 0; i < n && negPool.length; i++) {
      const id = pick(negPool).id;
      if (id) gainCurio(state, id, { silent: true });
    }
  }

  // 全队护盾量减少%（幽灵商人 B / 符文陷阱 B / 饥饿的虚空 B）
  if (fx.loseShieldPct) {
    const keep = 1 - fx.loseShieldPct / 100;
    for (const t of state.team) {
      if (!t.alive) continue;
      t.shield = Math.floor(t.shield * keep);
    }
  }
  // 随机一名角色失去全部护盾（强盗营地 B）
  if (fx.loseAllShieldRandom) {
    const alive = state.team.filter((t) => t.alive);
    if (alive.length) {
      const t = pick(alive);
      t.shield = 0;
      state.log.push(`${t.name} 失去全部护盾`);
    }
  }
  // 失去指定星级祝福（幽灵商人 A：支付 2 个 2 星祝福）
  if (fx.loseBlessingStars) {
    const stars = fx.loseBlessingStars;
    const count = fx.loseBlessingStarsCount || 1;
    const pool = state.blessings.filter((b) => b.star >= stars[0] && b.star <= stars[1]);
    for (let i = 0; i < count && pool.length; i++) {
      const b = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const idx = state.blessings.indexOf(b);
      if (idx >= 0) loseBlessingAt(state, idx);
    }
  }

  // 复活 1 名阵亡角色（流浪医师 B：复活一名已经阵亡的角色）
  if (fx.revive) {
    const dead = state.team.find((t) => !t.alive);
    if (dead) {
      dead.alive = true;
      dead.hp = dead.maxHp;
      state.log.push(`复活 ${dead.name}（满血）`);
    } else {
      state.log.push("没有阵亡角色，复活效果未触发");
    }
  }

  // 方程（equationStar: 单星级；equationCount: 一次多个同星级）
  if (fx.equationStar) {
    const count = fx.equationCount || 1;
    for (let i = 0; i < count; i++) {
      const id = rollEquation(fx.equationStar, fx.equationStar);
      if (id) gainEquation(state, id);
    }
  }

  // 失去祝福/奇物
  if (fx.loseBlessing) {
    for (let i = 0; i < fx.loseBlessing; i++) loseRandomBlessing(state);
  }
  if (fx.loseCurio) {
    for (let i = 0; i < fx.loseCurio; i++) loseRandomCurio(state);
  }

  // 技能升级
  if (fx.skillUpRandom) {
    randomSkillUp(state, fx.skillUpRandom);
  }
  if (fx.skillUpTarget) {
    // 无可升级角色（全灭只剩菜月昴等）→ 放弃奖励，避免选人面板卡死
    if (state.team.some((t) => t.alive && t.charId !== 11)) {
      outcome.needSkillTarget = fx.skillUpTarget; // UI 选角色后调 applySkillUp
    } else {
      state.log.push("无可升级角色，放弃技能升级奖励");
    }
  }
  if (fx.skillUpAll) {
    for (const t of state.team) {
      if (t.alive && t.charId !== 11) applySkillUp(state, t.index, fx.skillUpAll);
    }
  }
  if (fx.tempSkillBoost) {
    state.tempSkillBoost = fx.tempSkillBoost; // 下次战斗技能等级 +N，战斗结束失效
  }

  // 急救包 / 位面生命上限
  if (fx.medkit) {
    state.items.medkit = (state.items.medkit || 0) + fx.medkit;
  }
  if (fx.planeMaxHp) {
    state.planeMaxHpBoost = fx.planeMaxHp;
    for (const t of state.team) {
      t.maxHp = Math.ceil((t.maxHp * (100 + fx.planeMaxHp)) / 100);
    }
  }

  // 下次战斗 buff（M5 完整接入，先存标记）
  if (fx.buff) {
    state.nextBattleBuffs[fx.buff] = true;
  }

  // 事件战斗
  if (fx.battle) {
    const b = fx.battle;
    state.pendingEventReward = b.reward || null;
    outcome.battle = {
      waves: [{ kind: b.kind, count: b.count }],
      desc: `${b.kind === "elite" ? "精英" : "普通"}敌人 ×${b.count}`,
    };
  }

  // 冒险
  if (fx.gamble) {
    outcome.gamble = runGamble(state, fx.gamble);
  }
  if (fx.fortuneCard) {
    outcome.fortuneCard = runFortuneCard(state);
  }
  if (fx.lottery) {
    outcome.lottery = runLottery(state, fx.lottery);
  }
  // 大转盘：1/3 概率 200 碎片 / 1/3 概率 2 星祝福 / 1/3 概率 80 碎片
  if (fx.roulette) {
    const r = Math.random();
    if (r < 1 / 3) {
      addShards(state, 200);
      outcome.roulette = "大转盘停在金色格：+200 宇宙碎片";
    } else if (r < 2 / 3) {
      const id = rollBlessing(2, 2);
      if (id) gainBlessing(state, id, { silent: true });
      outcome.roulette = "大转盘停在祝福格：获得 1 个 2 星祝福";
    } else {
      addShards(state, 80);
      outcome.roulette = "大转盘停在银色格：+80 宇宙碎片";
    }
  }

  // 事件扣血致死
  if (state.team.every((t) => !t.alive)) {
    state.gameOver = true;
  }

  state.devLog.info(LOG_TYPE.UNI_REGION, `事件：${ev.title} → ${opt.text}`, {
    eventId,
    optionIdx,
    shards: state.shards,
    blessings: state.blessings.length,
    curios: state.curios.length,
    outcome,
  });
  return { ok: true, outcome, eventId, eventTitle: ev.title };
}

/** 处理祝福三选一的选择 */
export function chooseBlessingPick(state, pickedId) {
  const queue = state.pendingBlessingPicks || [];
  const cur = queue[0];
  if (!cur) return { ok: false, reason: "无可选祝福" };
  if (!cur.candidates.includes(pickedId)) return { ok: false, reason: "非法选择" };
  gainBlessing(state, pickedId);
  // 跃迁复眼：强化所有出现的 1 星祝福
  if (state.curios?.some((c) => c.id === "yueqian" && !c.broken) && BLESSINGS[pickedId]?.star === 1) {
    for (const b of state.blessings) {
      if (b.star === 1) b.enhanced = (b.enhanced || 1) + 1;
    }
    state.log.push("跃迁复眼：强化所有 1 星祝福");
  }
  // 至尊胶：获得祝福时 10% 概率再获得 1 个 1~2 星祝福（通过该方式获得 5 个后损毁）
  const zhizun = state.curios?.find((c) => c.id === "zhizun");
  if (zhizun && !zhizun.broken && Math.random() < (CURIO_FX.zhizun?.chance || 0.1)) {
    const extra = rollBlessing(1, 2);
    if (extra) {
      gainBlessing(state, extra, { silent: true });
      zhizun.extraCount = (zhizun.extraCount || 0) + 1;
      state.log.push(`至尊胶：额外获得祝福「${BLESSINGS[extra]?.name}」`);
      if (zhizun.extraCount >= (CURIO_FX.zhizun?.maxExtra || 5)) breakCurio(state, "zhizun");
    }
  }
  queue.shift();
  if (queue.length === 0) state.pendingBlessingPicks = null;
  return { ok: true, remaining: queue.length };
}

/** 骰子游戏：投入 → 掷 1-6 → 收入 = 点数 × 倍数 */
function runGamble(state, g) {
  if (!spendShards(state, g.cost)) return { failed: "碎片不足" };
  const point = Math.floor(Math.random() * 6) + 1;
  const gain = point * g.mult;
  addShards(state, gain);
  state.log.push(`骰子掷出 ${point} 点，获得 ${gain} 碎片（投入 ${g.cost}）`);
  return { point, gain, cost: g.cost };
}

/** 翻牌：40% 2 祝福 / 30% 2 奇物(含负面) / 30% 1 方程 */
function runFortuneCard(state) {
  const r = Math.random();
  if (r < 0.4) {
    for (let i = 0; i < 2; i++) {
      const id = rollBlessing(1, 3);
      if (id) gainBlessing(state, id, { silent: true });
    }
    return { kind: "blessing", count: 2 };
  }
  if (r < 0.7) {
    for (let i = 0; i < 2; i++) {
      const id = rollCurio(false);
      if (id) gainCurio(state, id, { silent: true });
    }
    return { kind: "curio", count: 2 };
  }
  const id = rollEquation(1, 3);
  if (id) gainEquation(state, id);
  return { kind: "equation", count: 1 };
}

/** 抽签：大吉(3×3星祝福)/中吉(1加权奇物)/小吉(2×1~2星祝福)/凶(损失20%生命上限) —— 只抽签不结算 */
function drawLotteryOne(state) {
  const r = Math.random();
  if (r < 0.1) {
    return { level: 4, name: "大吉", kind: "bless3" };
  }
  if (r < 0.3) {
    // 中吉：1 个加权奇物（约定：加权奇物 = 3 星奇物）
    return { level: 3, name: "中吉", kind: "curio3" };
  }
  if (r < 0.7) {
    return { level: 2, name: "小吉", kind: "bless12" };
  }
  return { level: 1, name: "凶", kind: "loseHp" };
}

/** 结算单支签的效果（仅对 best 调用，避免「抽三支取最好」三支全结算） */
function applyLotteryDraw(state, d) {
  if (!d) return;
  switch (d.kind) {
    case "bless3":
      for (let i = 0; i < 3; i++) {
        const id = rollBlessing(3, 3);
        if (id) gainBlessing(state, id, { silent: true });
      }
      break;
    case "curio3": {
      const id = rollCurio(false, 3, 3);
      if (id) gainCurio(state, id, { silent: true });
      break;
    }
    case "bless12":
      for (let i = 0; i < 2; i++) {
        const id = rollBlessing(1, 2);
        if (id) gainBlessing(state, id, { silent: true });
      }
      break;
    case "loseHp":
      loseTeamHpPct(state, 20);
      break;
    default:
      break;
  }
}

function runLottery(state, lot) {
  if (!spendShards(state, lot.cost)) return { failed: "碎片不足" };
  let best = null;
  const draws = [];
  for (let i = 0; i < lot.count; i++) {
    const d = drawLotteryOne(state);
    draws.push(d);
    if (!best || d.level > best.level) best = d;
  }
  // 「取最好」：只结算等级最高的一支（大吉 > 中吉 > 小吉 > 凶）
  applyLotteryDraw(state, best);
  state.log.push(`抽签：${draws.map((d) => d.name).join("、")}（取${best.name}）`);
  return { cost: lot.cost, draws, best: best.name };
}

/** 重置事件相关临时状态（每层进入时调用，由 uniState 触发） */
export function resetEventTemp(state) {
  // 事件战斗奖励挂起在战斗胜利后消费
}
