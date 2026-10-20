// 天气 — 纯规则
//
// 牌堆顺序、轮转方式与旧 weather.js 一致:shift 取顶 → push 回底。

import { shuffle } from "../core/cards.js";

export const WEATHER_DATA = {
  calm: { name: "风和日丽", desc: "无效果" },
  wind: { name: "狂风呼啸", desc: "赌命抽牌数+1" },
  trade: { name: "黑市交易", desc: "防御牌点数+2" },
  sun: { name: "烈日当空", desc: "攻击牌点数+2" },
  rain: { name: "暴雨倾盆", desc: "所有玩家防御区减1张" },
  arms: { name: "军备竞赛", desc: "禁止使用角色技能" },
};

const WEATHER_POOL = [
  "calm",
  "calm",
  "calm",
  "calm",
  "wind",
  "trade",
  "sun",
  "rain",
  "arms",
];

export function setupWeatherDeck(ctx) {
  ctx.state.weatherDeck = shuffle(
    WEATHER_POOL.map((id) => ({ id })),
    ctx.rng,
  );
  return ctx.state.weatherDeck;
}

/** 抽下一张天气并轮转到牌底 */
export function drawWeather(ctx) {
  const { state } = ctx;
  if (!state.useWeather) return null;
  if (state.weatherDeck.length === 0) return null;
  const w = state.weatherDeck.shift();
  state.weatherDeck.push(w);
  state.currentWeather = w.id;
  state.nextWeather = state.weatherDeck.length > 0 ? state.weatherDeck[0].id : null;
  return w.id;
}

export function getCurrentWeather(state) {
  return WEATHER_DATA[state.currentWeather] || null;
}

export function getNextWeather(state) {
  return WEATHER_DATA[state.nextWeather] || null;
}
