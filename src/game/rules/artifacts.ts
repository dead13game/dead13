// 圣遗物 — 纯规则
//
// 与旧 artifacts.js 行为一致,但去掉模块级依赖注入:
// 所有函数吃 ctx,状态字段改为 player.artifact / player.resources.breakCount。

import { CAT } from "../core/log.js";
import type { Ctx, Player } from "../types.js";

/** 圣遗物公共字段 */
export interface ArtifactBase {
  id: number;
  name: string;
  desc: string;
}

/** 角斗士：伤害倍率 */
export interface DamageBoostArtifact extends ArtifactBase {
  type: "damage_boost";
  damageMultiplier: number;
}

/** 乐团：暴击 */
export interface CritArtifact extends ArtifactBase {
  type: "crit";
  critChance: number;
  critMultiplier: number;
}

/** 圣遗物数据（按 type 判别，读字段前先判 type） */
export type ArtifactData = DamageBoostArtifact | CritArtifact;

/**
 * 圣遗物表。
 * 键是数字 id，但运行时一律以字符串下标访问（JS 对象的数字键就是字符串），
 * 因此这里用 Record<string, …> 同时兼容 `ARTIFACTS[1]` 与 `ARTIFACTS["1"]`。
 */
export const ARTIFACTS: Record<string, ArtifactData> = {
  1: {
    id: 1,
    name: "角斗士的终幕礼",
    desc: "你对其他玩家造成的伤害提高50%（向上取整）",
    type: "damage_boost",
    damageMultiplier: 1.5,
  },
  2: {
    id: 2,
    name: "流浪大地的乐团",
    desc: "你的攻击有50%概率触发暴击，暴击时伤害×2",
    type: "crit",
    critChance: 0.5,
    critMultiplier: 2,
  },
};

export function getArtifactData(
  artifactId: number | string | null | undefined,
): ArtifactData | null {
  if (artifactId == null) return null;
  return ARTIFACTS[String(artifactId)] ?? null;
}

/** 圣言自明是否可用:8 次击破 + 有次数 + 未激活 + 处于行动步 */
export function canUseHolyWord(
  ctx: Ctx,
  player: Player | null | undefined,
): boolean {
  const { state } = ctx;
  if (!player || !player.alive) return false;
  if (player.resources.breakCount < 8) return false;
  if (player.resources.holyWordUses <= 0) return false;
  if (player.artifact.active) return false;
  return state.pending == null && !state.gameOver;
}

/** 发动圣言自明:消耗 8 击破,激活 2 回合,获得额外行动 */
export function executeHolyWord(ctx: Ctx): boolean {
  const p = ctx.players.current();
  // 没有当前行动者时无事可做（理论上不会发生，这里只是收窄类型）
  if (!p) return false;
  if (!canUseHolyWord(ctx, p)) {
    ctx.devWarn(CAT.SKILL, `${p.name} 尝试发动圣言自明但条件不满足`, {
      breakCount: p.resources.breakCount,
      holyWordUses: p.resources.holyWordUses,
      artifactActive: p.artifact.active,
    });
    return false;
  }

  p.resources.breakCount -= 8;
  p.resources.holyWordUses--;
  p.artifact.active = true;
  p.artifact.roundsLeft = 2;

  const artData = getArtifactData(p.artifact.id);
  ctx.log(
    `${p.name} 发动圣言自明！圣遗物【${artData?.name || "未知"}】激活（${p.resources.holyWordUses}次剩余）`,
  );
  ctx.dev(CAT.SKILL, `${p.name} 圣言自明: 激活 ${artData?.name}`, {
    artifactId: p.artifact.id,
    holyWordUsesRemaining: p.resources.holyWordUses,
    breakCountRemaining: p.resources.breakCount,
    roundsLeft: p.artifact.roundsLeft,
  });

  ctx.turn.extra();
  return true;
}

/** applyArtifactBoost 的返回值 */
export interface ArtifactBoostResult {
  value: number;
  crit: boolean;
}

/**
 * 攻击值应用圣遗物加成(在陷阱判定之后、围攻减半之前)。
 * 返回 { value, crit }。
 */
export function applyArtifactBoost(
  ctx: Ctx,
  attacker: Player,
  attackValue: number,
): ArtifactBoostResult {
  if (!attacker.artifact.active || !attacker.artifact.id) {
    return { value: attackValue, crit: false };
  }
  const artData = getArtifactData(attacker.artifact.id);
  if (!artData) return { value: attackValue, crit: false };

  if (artData.type === "damage_boost") {
    const boost = Math.ceil(attackValue * (artData.damageMultiplier - 1));
    const finalValue = attackValue + boost;
    ctx.log(`角斗士的终幕礼 +${boost}`);
    ctx.dev(
      CAT.DAMAGE,
      `圣遗物伤害加成: ${attackValue} → ${finalValue} (角斗士 +${boost})`,
      {
        originalValue: attackValue,
        boostedValue: finalValue,
        boost,
      },
    );
    return { value: finalValue, crit: false };
  }

  if (artData.type === "crit" && ctx.rng.chance(artData.critChance)) {
    const finalValue = attackValue * artData.critMultiplier;
    ctx.log("流浪大地的乐团 暴击！伤害×2");
    ctx.dev(
      CAT.DAMAGE,
      `圣遗物暴击: ${attackValue} → ${finalValue} (流浪大地的乐团)`,
      {
        originalValue: attackValue,
        critValue: finalValue,
      },
    );
    return { value: finalValue, crit: true };
  }

  return { value: attackValue, crit: false };
}

/** 陷阱击破计数 +2(明暗两张牌) */
export function recordTrapBreak(
  ctx: Ctx,
  attacker: Player | null | undefined,
): void {
  if (!attacker || !attacker.alive) return;
  if (attacker.artifact.id == null) return;
  attacker.resources.breakCount += 2;
  ctx.devDebug(
    CAT.DAMAGE,
    `${attacker.name} 陷阱击破 +2 (总: ${attacker.resources.breakCount})`,
    {
      breakCount: attacker.resources.breakCount,
      artifactId: attacker.artifact.id,
    },
  );
}

/** 防御牌击破计数:每张 +1 */
export function recordDefenseBreak(
  ctx: Ctx,
  attacker: Player | null | undefined,
  count: number,
): void {
  if (!attacker || !attacker.alive || count <= 0) return;
  if (attacker.artifact.id == null) return;
  attacker.resources.breakCount += count;
  ctx.devDebug(
    CAT.DAMAGE,
    `${attacker.name} 防御击破 +${count} (总: ${attacker.resources.breakCount})`,
    {
      breakCount: attacker.resources.breakCount,
      artifactId: attacker.artifact.id,
    },
  );
}

/** 新回合:圣遗物剩余回合递减 */
export function tickArtifactRounds(ctx: Ctx): void {
  for (const p of ctx.state.players) {
    if (!p.alive || !p.artifact.active) continue;
    p.artifact.roundsLeft--;
    if (p.artifact.roundsLeft <= 0) {
      p.artifact.active = false;
      p.artifact.roundsLeft = 0;
      ctx.log(`${p.name} 的圣遗物效果已结束`);
      ctx.dev(CAT.SKILL, `${p.name} 圣遗物效果结束`, {
        artifactId: p.artifact.id,
      });
    }
  }
}
