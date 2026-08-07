// 音效事件记录 — 纯逻辑层，零依赖
// 只负责把音效事件写进 state.soundQueue（纯数据），不负责播放。
// 播放由桥接层 useSoundSync 监听队列后交给 SoundManager。
// 单向数据流：game 层记录 → 桥接层播放。

let _soundSeq = 0;

/**
 * 记录一个音效事件
 * @param {object} state 游戏状态
 * @param {string} type 音效类型，见 src/audio/SoundManager.js 的 SFX_FILES 键
 *   attack | defense | gamble | skill | shield_break | kill
 *   match_end | trap_break | trap_reflect | trap_tie
 */
export function recordSound(state, type) {
  if (!state.soundQueue) state.soundQueue = [];
  state.soundQueue.push({ type, seq: ++_soundSeq });
  // 防止队列无限增长（同一帧多个事件）
  if (state.soundQueue.length > 32) {
    state.soundQueue.splice(0, state.soundQueue.length - 32);
  }
}
