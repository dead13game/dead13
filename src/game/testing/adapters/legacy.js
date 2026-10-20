// 差分对拍适配器:旧实现(step 字符串 + 路由 flag + _injectDeps)
//
// 这个文件是「历史行为的唯一权威」:它逐条复刻 GameShell.vue 的 AI 驱动逻辑,
// 把 UI 里散落的开关固化成命令。重构完成后它保留在仓库里作为基线生成器,
// 但不再被生产代码引用。

import {
  createGameState,
  initGame,
  startAttack,
  executeAttack,
  executeDefense,
  executeGamble,
  submitGamble,
  executeSkill,
  executeRaidenSkill,
  executeFurinaSwap,
  executeFenjinSkill,
  executeLiniyaSkill,
  executeAimiliyaSkill,
  submitNahidaScry,
  executeCaiyueangSave,
  executeCaiyueangLoad,
  executeAlly,
  startAlly,
  executeBetray,
  executeHolyWord,
  decideTopAction,
  decideTarget,
  decideGamblePick,
  decideNahidaOrder,
  decideLiniyaChoice,
  decideCaiyueangChoice,
} from "../../index.js";
import { projectLegacy } from "../projection.js";

/** 技能目标步的消歧:复刻 GameShell.onSkillTarget / executeMiddleStep */
function skillTargetKind(state) {
  if (state.pendingFurinaTarget) return "furina";
  if (state._aimiliyaFreeze) return "aimiliya";
  if (state._fenjinHeal !== undefined) return "fenjin";
  return "raiden";
}

export function createLegacyAdapter() {
  // 脚本模式下,命令队列挂在 state 上(WeakMap 避免污染投影)
  const scripts = new WeakMap();

  return {
    name: "legacy",

    create(config) {
      const state = createGameState();
      initGame(state, config.chars, !!config.weather, config.startRound ?? 1);
      state.players.forEach((p, i) => {
        p.isAI = true;
        p.aiDifficulty = config.difficulty ?? "easy";
      });
      if (config.preState) config.preState(state);
      if (config.script) scripts.set(state, { list: config.script, i: 0 });
      return state;
    },

    isOver(state) {
      return !!state.gameOver;
    },

    /** KB-8:牌库与墓地同时为空时,executeDefense/startAttack 会读到 undefined 而崩溃 */
    isExhausted(state) {
      return state.deck.length === 0 && state.grave.length === 0;
    },

    projection(state) {
      return projectLegacy(state);
    },

    eventCursor() {
      return { log: 0, sound: 0 };
    },

    drain(state, cursor) {
      const logs = state.messageLog.slice(cursor.log).map((m) => String(m));
      const queue = state.soundQueue || [];
      const sounds = queue.filter((e) => e.seq > cursor.sound).map((e) => e.type);
      const lastSeq = queue.length ? queue[queue.length - 1].seq : cursor.sound;
      return {
        logs,
        sounds,
        cursor: { log: state.messageLog.length, sound: lastSeq },
      };
    },

    decide(state) {
      // 脚本模式:按预置命令逐条执行,用于覆盖 AI 永远不会走的分支
      const script = scripts.get(state);
      if (script) {
        if (script.i >= script.list.length) return null;
        return script.list[script.i++];
      }

      const step = state.step;

      if (step === "pickAction") {
        const d = decideTopAction(state);
        switch (d.action) {
          case "attack":
            return { type: "attack" };
          case "defense":
            return { type: "defense" };
          case "gamble":
            return { type: "gamble" };
          case "skill":
            return { type: "skill" };
          case "ally":
            return { type: "ally" };
          case "betray":
            return { type: "betray" };
          case "holyWord":
            return { type: "holyWord" };
          default:
            return { type: "defense" };
        }
      }

      if (step === "attackShowCard") {
        const t = decideTarget(state, { action: "attack" });
        return { type: "attackTarget", args: { targetIndex: t.targetIndex } };
      }

      if (step === "gamblePick") {
        if (!state.pendingGamble) return { type: "resetStep" };
        const g = decideGamblePick(state, state.pendingGamble.drawnCards);
        return {
          type: "gambleSubmit",
          args: { trapIdx: g.trapIdx, baitIdx: g.baitIdx },
        };
      }

      if (step === "skillPickTarget") {
        const kind = skillTargetKind(state);
        const t = decideTarget(state, { action: "skill", characterId: kind });
        return { type: "skillTarget", args: { targetIndex: t.targetIndex, kind } };
      }

      if (step === "skillNahida") {
        return {
          type: "nahidaOrder",
          args: { order: decideNahidaOrder(state, state.scryCards) },
        };
      }

      if (step === "liniyaPick") {
        const d = decideLiniyaChoice(state);
        return {
          type: "liniya",
          args: { targetIndex: d.targetIndex, subSkill: d.subSkill },
        };
      }

      if (step === "caiyueangPick") {
        const d = decideCaiyueangChoice(state);
        return { type: "caiyueang", args: { choice: d.choice } };
      }

      if (step === "allyPick") {
        const t = decideTarget(state, { action: "ally" });
        return { type: "allyTarget", args: { targetIndex: t.targetIndex } };
      }

      // 未知步骤兜底(与 GameShell executeMiddleStep 的 else 分支一致)
      return { type: "unknownStep" };
    },

    apply(state, cmd) {
      switch (cmd.type) {
        case "attack":
          startAttack(state);
          break;
        case "defense":
          executeDefense(state);
          break;
        case "gamble":
          executeGamble(state);
          break;
        case "gambleSubmit":
          submitGamble(state, cmd.args.trapIdx, cmd.args.baitIdx);
          break;
        case "attackTarget":
          executeAttack(state, cmd.args.targetIndex);
          break;
        case "skill":
          executeSkill(state);
          break;
        case "skillTarget": {
          const idx = cmd.args.targetIndex;
          const kind = cmd.args.kind ?? skillTargetKind(state);
          if (kind === "furina") executeFurinaSwap(state, idx);
          else if (kind === "aimiliya") executeAimiliyaSkill(state, idx);
          else if (kind === "fenjin") executeFenjinSkill(state, idx);
          else executeRaidenSkill(state, idx);
          break;
        }
        case "nahidaOrder":
          submitNahidaScry(state, cmd.args.order);
          break;
        case "liniya":
          executeLiniyaSkill(state, cmd.args.targetIndex, cmd.args.subSkill);
          break;
        case "caiyueang":
          if (cmd.args.choice === "save") executeCaiyueangSave(state);
          else executeCaiyueangLoad(state);
          break;
        case "ally":
          startAlly(state);
          break;
        case "allyTarget":
          executeAlly(state, cmd.args.targetIndex);
          break;
        case "betray":
          executeBetray(state);
          break;
        case "holyWord":
          executeHolyWord(state);
          break;
        case "resetStep":
          // GameShell 的 else 兜底:强改 step 后强制防御
          state.step = "pickAction";
          break;
        case "unknownStep":
          state.step = "pickAction";
          executeDefense(state);
          break;
        default:
          throw new Error(`legacy adapter: 未知命令 ${cmd.type}`);
      }
    },
  };
}
