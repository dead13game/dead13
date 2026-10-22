// 命令层入口 — 分发器 + 公共导出（取代原 flow/commands.js 尾部）
import { attack, attackTarget } from "./attack.js";
import { defense, defenseTarget } from "./defense.js";
import { gamble, gambleSubmit, gambleTarget } from "./gamble.js";
import { skill, skillAnswer } from "./skill.js";
import { ally, allyTarget, betray } from "./ally.js";
import { holyWord, cancel } from "./misc.js";

const HANDLERS = {
  attack: (ctx) => attack(ctx),
  attackTarget: (ctx, cmd) => attackTarget(ctx, cmd.targetUid),
  defense: (ctx) => defense(ctx),
  defenseTarget: (ctx, cmd) => defenseTarget(ctx, cmd.targetUid),
  gamble: (ctx) => gamble(ctx),
  gambleSubmit: (ctx, cmd) => gambleSubmit(ctx, cmd.trapIdx, cmd.baitIdx),
  gambleTarget: (ctx, cmd) => gambleTarget(ctx, cmd.targetUid),
  skill: (ctx) => skill(ctx),
  skillAnswer: (ctx, cmd) => skillAnswer(ctx, cmd.answer),
  ally: (ctx) => ally(ctx),
  allyTarget: (ctx, cmd) => allyTarget(ctx, cmd.targetUid),
  betray: (ctx) => betray(ctx),
  holyWord: (ctx) => holyWord(ctx),
  cancel: (ctx) => cancel(ctx),
};

export function dispatch(ctx, command) {
  const handler = HANDLERS[command.type];
  if (!handler) throw new Error(`commands: 未知命令 ${command.type}`);
  return handler(ctx, command);
}

// 公共 API：与原 flow/commands.js 完全一致
export { canUseSkill, canUseSkillNow, isIdle } from "./query.js";
export { attack, attackTarget } from "./attack.js";
export { defense, defenseTarget, placeDefenseCard } from "./defense.js";
export { gamble, gambleSubmit, gambleTarget } from "./gamble.js";
export { skill, skillAnswer } from "./skill.js";
export { ally, allyTarget, betray } from "./ally.js";
export { holyWord, cancel } from "./misc.js";
