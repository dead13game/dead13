// 天气 — 纯规则
//
// v3.5：天气改为固定顺序轮换（不再随机洗牌）。
// 顺序：烈日当空 → 暴雨倾盆 → 狂风呼啸 → 黑市交易 → 军备竞赛 → 风和日丽
// 每 6 回合一个完整循环，牌堆顶 = 当前天气（shift 取顶 → push 回底）。

import type { Ctx, GameState, WeatherCard, WeatherId } from "../types.js";

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

/** v3.5 固定轮换顺序（weatherDeck 按此顺序入队） */
export const WEATHER_CYCLE: WeatherId[] = [
  "sun",
  "rain",
  "wind",
  "trade",
  "arms",
  "calm",
];

/**
 * setupWeatherDeck 只需要 state。
 * 为什么不用完整 Ctx：flow/setup.ts 在 ctx 建好之前就初始化天气牌堆，
 * 只传得进 { state, rng }，这里按最小依赖收窄，避免调用方伪造整个 ctx。
 * rng 声明为可选：本函数不读它，仅为兼容调用方的对象字面量形状。
 */
export interface WeatherDeckCtx {
  state: GameState;
  rng?: unknown;
}

/** 构造天气牌堆（不洗牌） */
export function setupWeatherDeck(ctx: WeatherDeckCtx): WeatherCard[] {
  ctx.state.weatherDeck = WEATHER_CYCLE.map((id) => ({ id }));
  // UI 在开局即可看到「下一位」天气
  ctx.state.nextWeather = WEATHER_CYCLE[0];
  return ctx.state.weatherDeck;
}

/** 抽下一张天气并轮转到牌底 */
export function drawWeather(ctx: Ctx): WeatherId | null {
  const { state } = ctx;
  if (!state.useWeather) return null;
  if (state.weatherDeck.length === 0) return null;
  const w = state.weatherDeck.shift();
  // 上面的长度判断已保证非空，这里只是把 undefined 收窄掉
  if (!w) return null;
  state.weatherDeck.push(w);
  state.currentWeather = w.id;
  state.nextWeather =
    state.weatherDeck.length > 0 ? state.weatherDeck[0].id : null;
  return w.id;
}

export function getCurrentWeather(state: GameState): WeatherInfo | null {
  const id = state.currentWeather;
  return id ? WEATHER_DATA[id] : null;
}

export function getNextWeather(state: GameState): WeatherInfo | null {
  const id = state.nextWeather;
  return id ? WEATHER_DATA[id] : null;
}
