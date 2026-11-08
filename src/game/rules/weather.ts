// 天气 — 纯规则
//
// 每回合从天气池里独立随机抽一种（同一天气可以连续出现，不保证 6 回合内各来一次）。
// 「下一位」在上一回合就已掷好：UI 的预览即真实结果，不会因为再掷一次而对不上。
// 天气池只作为随机取值的来源，抽取不消费、不轮转 —— 这是与 v3.5 固定循环的差别。

import type { Ctx, GameState, Rng, WeatherCard, WeatherId } from "../types.js";

/** 天气静态文案（UI 查表用） */
export interface WeatherInfo {
  name: string;
  desc: string;
}

export const WEATHER_DATA: Record<WeatherId, WeatherInfo> = {
  calm: { name: "风和日丽", desc: "无效果" },
  wind: { name: "狂风呼啸", desc: "赌命抽牌数+1" },
  trade: { name: "黑市交易", desc: "防御牌点数+2" },
  sun: { name: "烈日当空", desc: "攻击牌点数+2" },
  rain: { name: "暴雨倾盆", desc: "所有玩家防御区减1张" },
  arms: { name: "军备竞赛", desc: "禁止使用角色技能" },
};

/** 天气池（随机取下标，不消费、不轮转） */
export const WEATHER_CYCLE: WeatherId[] = [
  "sun",
  "rain",
  "wind",
  "trade",
  "arms",
  "calm",
];

/**
 * setupWeatherDeck 只需要 state + rng。
 * 为什么不用完整 Ctx：flow/setup.ts 在 ctx 建好之前就初始化天气，
 * 只传得进 { state, rng }，这里按最小依赖收窄，避免调用方伪造整个 ctx。
 */
export interface WeatherDeckCtx {
  state: GameState;
  rng: Rng;
}

/** 掷一种天气（均匀随机，允许重复） */
function rollWeather(rng: Rng): WeatherId {
  // 池是编译期常量、恒非空；pick 的 undefined 只是类型层面的收窄
  return rng.pick(WEATHER_CYCLE) ?? WEATHER_CYCLE[0];
}

/** 铺天气池，并预先掷好「下一位」——开局界面即可看到下回合天气 */
export function setupWeatherDeck(ctx: WeatherDeckCtx): WeatherCard[] {
  ctx.state.weatherDeck = WEATHER_CYCLE.map((id) => ({ id }));
  // 未启用天气时不预掷，避免 UI 显示一个不会发生的「下一位」
  if (ctx.state.useWeather) ctx.state.nextWeather = rollWeather(ctx.rng);
  return ctx.state.weatherDeck;
}

/** 抽下一张天气：用掉上一轮掷好的「下一位」，再掷一个新的下一位 */
export function drawWeather(ctx: Ctx): WeatherId | null {
  const { state } = ctx;
  if (!state.useWeather) return null;
  const id = state.nextWeather ?? rollWeather(ctx.rng);
  state.currentWeather = id;
  state.nextWeather = rollWeather(ctx.rng);
  return id;
}

export function getCurrentWeather(state: GameState): WeatherInfo | null {
  const id = state.currentWeather;
  return id ? WEATHER_DATA[id] : null;
}

export function getNextWeather(state: GameState): WeatherInfo | null {
  const id = state.nextWeather;
  return id ? WEATHER_DATA[id] : null;
}
