// 天气 — 纯规则
//
// v3.5：天气改为固定顺序轮换（不再随机洗牌）。
// 顺序：烈日当空 → 暴雨倾盆 → 狂风呼啸 → 黑市交易 → 军备竞赛 → 风和日丽
// 每 6 回合一个完整循环，牌堆顶 = 当前天气（shift 取顶 → push 回底）。

export const WEATHER_DATA = {
  calm: { name: "风和日丽", desc: "无效果" },
  wind: { name: "狂风呼啸", desc: "赌命抽牌数+1" },
  trade: { name: "黑市交易", desc: "防御牌点数+2" },
  sun: { name: "烈日当空", desc: "攻击牌点数+2" },
  rain: { name: "暴雨倾盆", desc: "所有玩家防御区减1张" },
  arms: { name: "军备竞赛", desc: "禁止使用角色技能" },
};

/** v3.5 固定轮换顺序（weatherDeck 按此顺序入队） */
export const WEATHER_CYCLE = ["sun", "rain", "wind", "trade", "arms", "calm"];

/** 构造天气牌堆（不洗牌） */
export function setupWeatherDeck(ctx) {
  ctx.state.weatherDeck = WEATHER_CYCLE.map((id) => ({ id }));
  // UI 在开局即可看到「下一位」天气
  ctx.state.nextWeather = WEATHER_CYCLE[0];
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
  state.nextWeather =
    state.weatherDeck.length > 0 ? state.weatherDeck[0].id : null;
  return w.id;
}

export function getCurrentWeather(state) {
  return WEATHER_DATA[state.currentWeather] || null;
}

export function getNextWeather(state) {
  return WEATHER_DATA[state.nextWeather] || null;
}
