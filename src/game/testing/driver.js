// 差分对拍:无头驱动
//
// 适配器契约(新旧实现各写一份,驱动本身不感知内核结构):
//   create(config) -> state
//   isOver(state) -> boolean
//   decide(state) -> { type, args? } | null     // 产出一条原子命令
//   apply(state, cmd) -> void                   // 执行一条原子命令
//   projection(state) -> plain object           // 可观察状态快照
//   eventCursor() -> any                        // 事件游标
//   drain(state, cursor) -> { logs, sounds, cursor }
//
// 驱动只做三件事:循环决策/执行/记录、事件游标推进、卡死兜底。

import { installSeededRandom } from "./seededRandom.js";

const MAX_STEPS = 6000;
const STUCK_LIMIT = 2;

export function runTrace(adapter, config) {
  const limit = config.limit ?? MAX_STEPS;
  const restore = installSeededRandom(config.seed);
  try {
    const state = adapter.create(config);
    const trace = {
      id: config.id,
      config: { ...config },
      initial: adapter.projection(state),
      steps: [],
      notes: [],
    };

    let cursor = adapter.eventCursor();
    let prevSnap = trace.initial;
    let stuck = 0;
    const seen = new Map();
    seen.set(JSON.stringify(trace.initial), 1);

    while (!adapter.isOver(state) && trace.steps.length < limit) {
      // 牌库+墓地同时为空 = 旧实现的崩溃点(executeDefense 取不到牌)。
      // 这不是可观察状态,而是缺陷边界:在它之前停机,保证两边比到同一个点。
      if (adapter.isExhausted && adapter.isExhausted(state)) {
        trace.exhausted = true;
        trace.notes.push(`deck-exhausted @step=${trace.steps.length}`);
        break;
      }
      const cmd = adapter.decide(state);
      if (!cmd) {
        trace.notes.push(`decide=null @step=${state.step}`);
        break;
      }
      adapter.apply(state, cmd);
      const snap = adapter.projection(state);
      const snapKey = JSON.stringify(snap);
      const unchanged = snapKey === JSON.stringify(prevSnap);
      stuck = unchanged ? stuck + 1 : 0;

      // KB-9:AI 可以进入真正的状态环(菜月昴无限存档)。投影完全复现 3 次即判定死循环。
      const loopCount = (seen.get(snapKey) ?? 0) + 1;
      seen.set(snapKey, loopCount);

      const ev = adapter.drain(state, cursor);
      cursor = ev.cursor;
      trace.steps.push({ cmd: cmdKey(cmd), snap, logs: ev.logs, sounds: ev.sounds });
      prevSnap = snap;

      if (loopCount > 3) {
        trace.looped = true;
        trace.notes.push(`loop-detected @step=${trace.steps.length}`);
        break;
      }

      if (stuck >= STUCK_LIMIT) {
        if (state.step !== "pickAction") {
          // 非决策步卡住 = 适配器/内核 bug,不能靠兜底掩盖
          throw new Error(
            `${config.id}: 在 step=${state.step} 连续 ${stuck} 次无状态变化,命令=${cmdKey(cmd)}`,
          );
        }
        // 复刻 GameShell 的「300ms 保底回退:强制防御」
        adapter.apply(state, { type: "defense", args: { fallback: true } });
        const s2 = adapter.projection(state);
        const ev2 = adapter.drain(state, cursor);
        cursor = ev2.cursor;
        trace.steps.push({
          cmd: "defense(fallback)",
          snap: s2,
          logs: ev2.logs,
          sounds: ev2.sounds,
        });
        trace.notes.push(`fallback defense @step=${trace.steps.length}`);
        prevSnap = s2;
        stuck = 0;
      }
    }

    trace.final = adapter.projection(state);
    trace.finished = adapter.isOver(state);
    trace.truncated = trace.steps.length >= limit;
    trace.stepCount = trace.steps.length;
    trace.logCount = trace.steps.reduce((n, s) => n + s.logs.length, 0);
    return trace;
  } finally {
    restore();
  }
}

function cmdKey(cmd) {
  if (!cmd.args || Object.keys(cmd.args).length === 0) return cmd.type;
  return cmd.type + ":" + JSON.stringify(cmd.args);
}
