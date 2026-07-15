/**
 * 角色技能特效注册表 — 预定义各角色的粒子效果参数
 * 每个角色 id 对应一组特效配置
 */
export const SKILL_EFFECTS = {
  // 温迪 — 风神
  venti: {
    draw: {
      color: 0x4fc3f7,
      count: 20,
      speed: 250,
      spread: 120,
      lifetime: 1.0,
      size: 3,
      gravity: 50,
    },
    hit: {
      color: 0x81d4fa,
      count: 25,
      speed: 300,
      spread: 200,
      lifetime: 0.7,
      size: 4,
      gravity: 80,
    },
  },

  // 钟离 — 岩神
  zhongli: {
    draw: {
      color: 0xffb74d,
      count: 15,
      speed: 150,
      spread: 90,
      lifetime: 0.8,
      size: 5,
      gravity: 400,
    },
    hit: {
      color: 0xff9800,
      count: 30,
      speed: 200,
      spread: 150,
      lifetime: 0.6,
      size: 5,
      gravity: 500,
    },
  },

  // 雷电将军 — 雷神
  raiden: {
    draw: {
      color: 0xce93d8,
      count: 22,
      speed: 350,
      spread: 60,
      lifetime: 0.9,
      size: 3,
      gravity: 20,
    },
    hit: {
      color: 0xe040fb,
      count: 40,
      speed: 400,
      spread: 300,
      lifetime: 0.5,
      size: 4,
      gravity: 10,
    },
  },

  // 纳西妲 — 草神
  nahida: {
    draw: {
      color: 0xa5d6a7,
      count: 18,
      speed: 120,
      spread: 200,
      lifetime: 1.2,
      size: 4,
      gravity: -30,
    },
    hit: {
      color: 0x66bb6a,
      count: 20,
      speed: 180,
      spread: 250,
      lifetime: 0.8,
      size: 3,
      gravity: -20,
    },
  },

  // 芙宁娜 — 水神
  furina: {
    draw: {
      color: 0x90caf9,
      count: 16,
      speed: 200,
      spread: 160,
      lifetime: 1.0,
      size: 3,
      gravity: 100,
    },
    hit: {
      color: 0x42a5f5,
      count: 25,
      speed: 250,
      spread: 180,
      lifetime: 0.6,
      size: 4,
      gravity: 60,
    },
  },

  // 玛薇卡 — 火神
  mavuika: {
    draw: {
      color: 0xff7043,
      count: 20,
      speed: 280,
      spread: 100,
      lifetime: 0.7,
      size: 4,
      gravity: -50,
    },
    hit: {
      color: 0xff1744,
      count: 35,
      speed: 350,
      spread: 220,
      lifetime: 0.5,
      size: 4,
      gravity: -80,
    },
  },

  // 哥伦比娅 — 月神
  columbina: {
    draw: {
      color: 0xfff9c4,
      count: 14,
      speed: 160,
      spread: 140,
      lifetime: 1.0,
      size: 3,
      gravity: -10,
    },
    hit: {
      color: 0xffd54f,
      count: 20,
      speed: 220,
      spread: 200,
      lifetime: 0.7,
      size: 3,
      gravity: 20,
    },
  },

  // 风堇 — 晴空
  fenjin: {
    draw: {
      color: 0x80deea,
      count: 20,
      speed: 200,
      spread: 180,
      lifetime: 1.0,
      size: 4,
      gravity: -40,
    },
    hit: {
      color: 0x4dd0e1,
      count: 25,
      speed: 250,
      spread: 200,
      lifetime: 0.6,
      size: 4,
      gravity: 40,
    },
  },

  // 莉奈娅 — 青春
  liniya: {
    draw: {
      color: 0xf48fb1,
      count: 18,
      speed: 220,
      spread: 150,
      lifetime: 0.9,
      size: 3,
      gravity: -20,
    },
    hit: {
      color: 0xec407a,
      count: 22,
      speed: 280,
      spread: 180,
      lifetime: 0.6,
      size: 3,
      gravity: 30,
    },
  },

  // 爱蜜莉雅 — 冰结
  aimiliya: {
    draw: {
      color: 0xb3e5fc,
      count: 16,
      speed: 180,
      spread: 200,
      lifetime: 1.1,
      size: 4,
      gravity: -10,
    },
    hit: {
      color: 0x81d4fa,
      count: 20,
      speed: 200,
      spread: 250,
      lifetime: 0.7,
      size: 4,
      gravity: 10,
    },
  },

  // 菜月昴 — 回归
  caiyueang: {
    draw: {
      color: 0x9575cd,
      count: 24,
      speed: 250,
      spread: 300,
      lifetime: 1.2,
      size: 3,
      gravity: -30,
    },
    hit: {
      color: 0x7e57c2,
      count: 30,
      speed: 300,
      spread: 350,
      lifetime: 0.8,
      size: 3,
      gravity: -50,
    },
  },
};

/** 通用特效 */
export const GENERIC_EFFECTS = {
  // 攻击命中
  hit: {
    color: 0xffffff,
    count: 18,
    speed: 250,
    spread: 200,
    lifetime: 0.5,
    size: 3,
    gravity: 200,
  },
  // 防御破碎
  shield: {
    color: 0xb0bec5,
    count: 12,
    speed: 150,
    spread: 160,
    lifetime: 0.4,
    size: 3,
    gravity: 300,
  },
  // 治疗
  heal: {
    color: 0x69f0ae,
    count: 15,
    speed: 100,
    spread: 300,
    lifetime: 1.0,
    size: 3,
    gravity: -60,
  },
  // 陷阱触发
  trap: {
    color: 0xff5252,
    count: 20,
    speed: 300,
    spread: 250,
    lifetime: 0.5,
    size: 4,
    gravity: 150,
  },
};
