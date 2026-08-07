// 音效桥接层 — 监听 gameState.soundQueue → SoundManager 播放
// 单向数据流：game 层 recordSound 写队列 → 本层 watch 消费 → 播放

import { watch } from "vue";
import SoundManager from "../audio/SoundManager.js";

/**
 * 监听游戏状态中的音效事件队列并播放。
 * 在 GameShell.vue 挂载（三种模式共用）。
 * @param {object} state 游戏状态（createGameState 返回）
 */
export function useSoundSync(state) {
  watch(
    () => state.soundQueue?.length ?? 0,
    () => {
      const q = state.soundQueue;
      if (!q || q.length === 0) return;
      // 消费整个队列（同帧多个事件顺序播放）
      const events = q.splice(0, q.length);
      events.forEach((ev) => {
        if (ev?.type && SoundManager.has(ev.type)) {
          SoundManager.play(ev.type);
        }
      });
    },
  );
}
