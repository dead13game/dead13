// 音效桥接层 — 监听 gameState.soundQueue → SoundManager 播放
// 单向数据流：game 层 recordSound 写队列 → 本层 watch 消费 → 播放

import { watch } from "vue";
import SoundManager from "../audio/SoundManager.js";
import type { SoundEvent } from "../game/types.js";

/**
 * 带音效队列的最小状态形状。
 *
 * 经典/团战/联赛/世界杯传的是 `buildView(state)` 的 ViewModel，
 * 单机模式传的是 soloState —— 两者都有 `soundQueue`，这里只声明用到的那部分。
 */
interface SoundQueueSource {
  soundQueue?: SoundEvent[];
}

/**
 * 监听游戏状态中的音效事件队列并播放。
 * 在 GameShell.vue 挂载（三种模式共用）。
 * @param state 游戏状态（ViewModel / soloState 均可）
 */
export function useSoundSync(state: SoundQueueSource): void {
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
