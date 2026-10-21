// 局面初始化 — 取代旧 createGameState + initGame(那两份里混着 match/league 的隐式分支)

import { PHASE, STEP } from "../core/constants.js";
import { createFullDeck, shuffle } from "../core/cards.js";
import { createPlayer } from "../core/player.js";
import { CAT } from "../core/log.js";
import { createRng } from "../core/rng.js";
import { setupWeatherDeck } from "../rules/weather.js";
import { characterStateFor, CHARACTERS } from "../characters/index.js";

/** 全新的空局面(纯数据,可 JSON 化) */
export function createGameState() {
  return {
    players: [],
    // v3.5：团战防御塔与召唤物与角色分开放，经典模式的 PIXI/AI 只看到英雄
    towers: [],
    summons: [],
    unitSeq: 0,
    // v3.5：最近摸牌事件（只驱动 UI 抽牌动画，不入存档）
    drawFeed: [],
    drawSeq: 0,
    currentPlayerIndex: 0,

    phase: PHASE.SETUP,
    step: STEP.PICK_ACTION,
    pending: null,

    deck: [],
    grave: [],

    weatherDeck: [],
    currentWeather: null,
    nextWeather: null,
    useWeather: false,

    round: 0,
    peaceRounds: 0,
    peaceStartRound: 0,

    messageLog: [],
    soundQueue: [],
    soundSeq: 0,
    idSeq: 1e12,

    gameOver: false,
    winnerIndex: -1,

    turn: { extraAction: false, suspend: null, resync: false, savedBy: null },

    mode: null,

    // 兼容字段:UI/动画直接读它们,P6 收敛到 pending.data
    pendingAttackCard: null,
    pendingVentiCards: null,
    scryCards: null,
    pendingGamble: null,
  };
}

/**
 * 初始化一局。
 * @param {object} state
 * @param {object} options
 * @param {number[]} options.chars     角色 id 列表(按座次)
 * @param {boolean} [options.weather]  是否启用天气
 * @param {number} [options.startRound]
 * @param {number} [options.deckCount] 牌库副数
 * @param {number[]} [options.teamIds] 与 chars 对齐的队伍 id
 * @param {object} options.mode        模式 adapter(提供 rules 与生命周期)
 * @param {object} [options.rng]
 * @param {boolean} [options.keepLog]      保留 messageLog(1v1 每条命重开用)
 * @param {boolean} [options.forcePeace]   强制从和平期开始(即使 startRound 很大)
 * @param {number} [options.peaceStartRound] 和平期起点(默认 0)
 */
export function initGame(state, options) {
  const {
    chars,
    weather = false,
    startRound = 1,
    deckCount = 2,
    teamIds = null,
    mode,
    rng = createRng(),
    keepLog = false,
    forcePeace = false,
    peaceStartRound = 0,
  } = options;

  const ctxRng = rng;
  const keptLog = keepLog ? state.messageLog : null;

  state.players = [];
  state.towers = [];
  state.summons = [];
  state.unitSeq = 0;
  state.drawFeed = [];
  state.drawSeq = 0;
  state.currentPlayerIndex = 0;
  state.phase = PHASE.SETUP;
  state.step = STEP.PICK_ACTION;
  state.pending = null;
  state.deck = [];
  state.grave = [];
  state.weatherDeck = [];
  state.currentWeather = null;
  state.nextWeather = null;
  state.round = 0;
  state.messageLog = keptLog ?? [];
  state.soundQueue = [];
  state.gameOver = false;
  state.winnerIndex = -1;
  state.useWeather = !!weather;
  state.turn = {
    extraAction: false,
    suspend: null,
    resync: false,
    savedBy: null,
  };
  state.mode = mode ?? state.mode;
  state.pendingAttackCard = null;
  state.pendingVentiCards = null;
  state.scryCards = null;
  state.pendingGamble = null;
  state.peaceStartRound = peaceStartRound;

  state.deckCount = deckCount;
  state.deck = shuffle(createFullDeck(deckCount), ctxRng);

  chars.forEach((charId, i) => {
    const meta = CHARACTERS[charId];
    if (!meta) return;
    state.players.push(
      createPlayer({
        uid: i + 1,
        index: i,
        characterId: charId,
        meta,
        teamId: teamIds ? teamIds[i] : undefined,
        charState: characterStateFor(charId),
      }),
    );
  });

  // 按 speed 降序(数字大=行动快),同速按原索引升序
  state.players.sort((a, b) => {
    const sa = CHARACTERS[a.characterId]?.speed ?? 5;
    const sb = CHARACTERS[b.characterId]?.speed ?? 5;
    if (sa !== sb) return sb - sa;
    return a.index - b.index;
  });
  state.players.forEach((p, i) => {
    p.index = i;
  });

  if (weather) {
    setupWeatherDeck({ state, rng: ctxRng });
  }

  const rules = state.mode?.rules ?? {};
  const peaceRounds = rules.peaceRounds ?? 4;
  state.phase = PHASE.PEACE;
  state.peaceRounds = peaceRounds;

  state.round = startRound;
  state.step = STEP.PICK_ACTION;

  if (!forcePeace && startRound > peaceRounds) {
    state.phase = PHASE.NORMAL;
  }

  if (!keepLog) {
    state.messageLog.push("亡命十三街开始");
    state.messageLog.push(
      `角色：${state.players.map((p) => CHARACTERS[p.characterId].name).join(" · ")}`,
    );
    state.messageLog.push(
      `行动顺序：${state.players.map((p) => p.name).join(" → ")}`,
    );
    if (state.phase === PHASE.PEACE) {
      state.messageLog.push(`和平发育（第1-${peaceRounds}回合禁止攻击）`);
    }
  }

  state.devLog?.info?.(
    CAT.STATE,
    `游戏初始化 ${state.players.length}人局，${state.useWeather ? "启用" : "无"}天气`,
    {
      players: state.players.map((p) => ({
        name: p.name,
        char: CHARACTERS[p.characterId].name,
        hp: p.hp,
      })),
      phase: state.phase,
      peaceRounds,
      startingRound: startRound,
    },
  );

  return state;
}
