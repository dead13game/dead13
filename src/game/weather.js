import { shuffleDeck } from "./deck.js";

const WDATA = {
  calm: { name: "风和日丽", desc: "无效果" },
  wind: { name: "狂风呼啸", desc: "赌命抽牌数+1" },
  trade: { name: "黑市交易", desc: "防御牌点数+2" },
  sun: { name: "烈日当空", desc: "攻击牌点数+2" },
  rain: { name: "暴雨倾盆", desc: "所有玩家防御区减1张" },
  arms: { name: "军备竞赛", desc: "禁止使用角色技能" },
};

export function setupWeatherDeck(state) {
  const weatherCards = [
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
  state.weatherDeck = shuffleDeck(weatherCards.map((id) => ({ id })));
}

export function drawWeather(state) {
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
  return WDATA[state.currentWeather] || null;
}

export function getNextWeather(state) {
  return WDATA[state.nextWeather] || null;
}
