// 命令层入口 — 分发器 + 公共导出（取代原 flow/commands.js 尾部）
import type { Ctx } from "../../types.js";
import { attack, attackTarget } from "./attack.js";
import { defense, defenseTarget } from "./defense.js";
import { gamble, gambleSubmit, gambleTarget } from "./gamble.js";
import { skill, skillAnswer } from "./skill.js";
import { ally, allyTarget, betray } from "./ally.js";
import { holyWord, cancel } from "./misc.js";

// ════════════════════════════════════════
//  命令对象（dispatch 的唯一入参）
// ════════════════════════════════════════
//
// 判别联合放在门面：dispatch 是按 type 分发的那一端，需要知道「命令形状」；
// 各命令模块仍以位置参数导出（modes/ 与测试直接调用 attackTarget(ctx, uid)），
// 避免为了类型把已有调用点全部改成传对象。
//
// 加新命令时：在这里加一个 interface + 并入 Command 联合，并补 dispatch 的分支，
// 漏掉任何一处都会被 TS 的穷尽性检查抓到。

export interface AttackCommand {
  type: "attack";
}

export interface AttackTargetCommand {
  type: "attackTarget";
  targetUid: number;
}

export interface DefenseCommand {
  type: "defense";
}

export interface DefenseTargetCommand {
  type: "defenseTarget";
  targetUid: number;
}

export interface GambleCommand {
  type: "gamble";
}

export interface GambleSubmitCommand {
  type: "gambleSubmit";
  trapIdx: number;
  baitIdx: number;
}

export interface GambleTargetCommand {
  type: "gambleTarget";
  targetUid: number;
}

export interface SkillCommand {
  type: "skill";
}

/** 作答载荷随 purpose 变化（目标 uid / 子技能对象 / 排序数组 / {choice}），故为 unknown */
export interface SkillAnswerCommand {
  type: "skillAnswer";
  answer: unknown;
}

export interface AllyCommand {
  type: "ally";
}

export interface AllyTargetCommand {
  type: "allyTarget";
  targetUid: number;
}

export interface BetrayCommand {
  type: "betray";
}

export interface HolyWordCommand {
  type: "holyWord";
}

export interface CancelCommand {
  type: "cancel";
}

/** dispatch 接受的命令联合（按 type 判别） */
export type Command =
  | AttackCommand
  | AttackTargetCommand
  | DefenseCommand
  | DefenseTargetCommand
  | GambleCommand
  | GambleSubmitCommand
  | GambleTargetCommand
  | SkillCommand
  | SkillAnswerCommand
  | AllyCommand
  | AllyTargetCommand
  | BetrayCommand
  | HolyWordCommand
  | CancelCommand;

/**
 * 唯一写入口：把命令分发到对应命令族。
 *
 * 用 switch 而不是「表 + 索引」:switch 能把 command 收窄成具体命令类型,
 * 每个分支拿到 `(ctx, cmd: XxxCommand)` 的精确签名,无需强制类型断言。
 */
export function dispatch(ctx: Ctx, command: Command): boolean {
  switch (command.type) {
    case "attack":
      return attack(ctx);
    case "attackTarget":
      return attackTarget(ctx, command.targetUid);
    case "defense":
      return defense(ctx);
    case "defenseTarget":
      return defenseTarget(ctx, command.targetUid);
    case "gamble":
      return gamble(ctx);
    case "gambleSubmit":
      return gambleSubmit(ctx, command.trapIdx, command.baitIdx);
    case "gambleTarget":
      return gambleTarget(ctx, command.targetUid);
    case "skill":
      return skill(ctx);
    case "skillAnswer":
      return skillAnswer(ctx, command.answer);
    case "ally":
      return ally(ctx);
    case "allyTarget":
      return allyTarget(ctx, command.targetUid);
    case "betray":
      return betray(ctx);
    case "holyWord":
      return holyWord(ctx);
    case "cancel":
      return cancel(ctx);
    default:
      // 类型上是 never（联合已穷尽）；运行时仍可能是 JS/旧存档传来的未知命令，
      // 保持旧实现的报错文案。
      throw new Error(
        `commands: 未知命令 ${String((command as { type: string }).type)}`,
      );
  }
}

// 公共 API：与原 flow/commands.js 完全一致
export { canUseSkill, canUseSkillNow, isIdle } from "./query.js";
export { attack, attackTarget } from "./attack.js";
export { defense, defenseTarget, placeDefenseCard } from "./defense.js";
export { gamble, gambleSubmit, gambleTarget } from "./gamble.js";
export { skill, skillAnswer } from "./skill.js";
export { ally, allyTarget, betray } from "./ally.js";
export { holyWord, cancel } from "./misc.js";
