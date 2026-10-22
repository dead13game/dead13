// 命令层公共入口 — 实现在 ./commands/ 下按命令族拆分
//
//   commands/query.js     canUseSkill / canUseSkillNow / isIdle
//   commands/attack.js    attack / attackTarget（含围攻、陷阱、圣遗物、联盟平摊）
//   commands/defense.js   defense / defenseTarget / placeDefenseCard
//   commands/gamble.js    gamble / gambleSubmit / gambleTarget
//   commands/skill.js     skill / skillAnswer
//   commands/ally.js      ally / allyTarget / betray
//   commands/misc.js      holyWord / cancel
//   commands/index.js     HANDLERS 分发器 + 公共导出
//
// 本文件只做 re-export，保持 import 路径 `flow/commands.js` 不变。
// 改某个命令族时只需读对应的那个文件。

export * from "./commands/index.js";
