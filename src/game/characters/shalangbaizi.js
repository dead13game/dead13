import { PHASE } from "../core/constants.js";
import { PENDING } from "../flow/pending.js";
import { CAT } from "../core/log.js";
import { display } from "../core/cards.js";
import {
  createUnit,
  nextUnitUid,
  unitByUid,
  enemyHeroes,
  isEnemy,
} from "../core/units.js";
import { applyDamage } from "../rules/damage.js";
import {
  ATTACK_MODIFIERS,
  DEFENSE_MODIFIERS,
  collectModifiers,
  reduceModifiers,
} from "../rules/modifiers.js";
import {
  baseCanUse,
  enemyTargetUids,
  withTurnGate,
} from "./helpers.js";

// 砂狼白子 · 无人机部署（主动 2 次）
// 指定一个目标并部署无人机：无人机 5 HP，每回合在「白子行动时」对目标造成 3 点伤害，
// 无视陷阱，吃天气/圣遗物加成，只能有防御牌、永远没有陷阱。
// 白子执行防御时，无人机也从牌库获得一张防御牌；白子阵亡/无人机被击落则消失。

export const DRONE_HP = 5;
export const DRONE_DAMAGE = 3;

function ownedDrone(ctx, player) {
  return (ctx.state.summons ?? []).find(
    (s) => s.ownerUid === player.uid && s.alive,
  );
}

/** 目标不可用时自动索敌：塔按序号顺延，角色取防御值最低者 */
function resolveDroneTarget(ctx, drone, owner) {
  const state = ctx.state;
  const prev = unitByUid(state, drone.char.targetUid);
  if (prev?.alive) return prev;

  if (prev?.kind === "tower") {
    const next = (state.towers ?? [])
      .filter(
        (t) =>
          t.alive &&
          t.teamId === prev.teamId &&
          t.towerIndex > prev.towerIndex,
      )
      .sort((a, b) => a.towerIndex - b.towerIndex)[0];
    if (next) return next;
  }

  const defenseOf = (u) =>
    (u.defensePile ?? []).reduce(
      (sum, c) => sum + (c.defenseValue ?? c.value ?? 0),
      0,
    );

  const heroes = enemyHeroes(state, owner).sort(
    (a, b) => defenseOf(a) - defenseOf(b) || a.hp - b.hp || a.index - b.index,
  );
  if (heroes.length > 0) return heroes[0];

  return (
    (state.towers ?? [])
      .filter((t) => t.alive && isEnemy(owner, t))
      .sort((a, b) => a.towerIndex - b.towerIndex)[0] ?? null
  );
}

/** 无人机在白子回合开始时攻击（无人机没有自己的回合） */
function droneAttack(ctx, player) {
  const drone = ownedDrone(ctx, player);
  if (!drone) return;
  const target = resolveDroneTarget(ctx, drone, player);
  if (!target) return;

  drone.char.targetUid = target.uid;
  const env = {
    kind: "attack",
    source: player,
    target,
    trapTriggered: false,
    besieged: false,
  };
  const { total } = reduceModifiers(
    ctx,
    DRONE_DAMAGE,
    collectModifiers(ATTACK_MODIFIERS),
    env,
  );

  ctx.log(`${drone.name} 攻击 ${target.name}，造成 ${total} 点伤害（无视陷阱）`);
  ctx.dev(CAT.SKILL, `无人机攻击: ${drone.name} → ${target.name} ${total}点`, {
    targetKind: target.kind,
    targetHp: target.hp,
    damage: total,
  });
  const r = applyDamage(ctx, { target, amount: total, cause: "drone" });
  if (r.died) ctx.log(`${target.name} 被无人机击毁`);
}

export default {
  id: 13,
  meta: {
    id: 13,
    name: "砂狼白子",
    title: "无人机",
    icon: null,
    hp: 12,
    speed: 9,
    skillName: "无人机部署",
    skillType: "active",
    skillDesc:
      "指定一个目标并部署无人机（5 HP，每回合3点伤害，无视陷阱，吃天气/圣遗物加成）。召唤当回合无法进行其他行动，最多存在一架",
    maxUses: 2,
    loadMaxUses: 0,
  },
  stateSchema: {},

  canUse(ctx, player) {
    if (ctx.state.phase === PHASE.PEACE) return false;
    if (ownedDrone(ctx, player)) return false;
    return baseCanUse(ctx, player);
  },
  canUseNow: withTurnGate(
    (ctx, player) =>
      ctx.state.phase !== PHASE.PEACE &&
      !ownedDrone(ctx, player) &&
      baseCanUse(ctx, player),
    { requireNormal: true },
  ),

  use(ctx, player) {
    if (ctx.state.phase === PHASE.PEACE) {
      ctx.log("和平阶段禁止召唤无人机");
      return;
    }
    player.resources.skillUses--;
    ctx.ask({
      type: PENDING.TARGET,
      purpose: "skill:shalang.summon",
      asker: player.uid,
      options: enemyTargetUids(ctx, player),
    });
    ctx.log(`${player.name} 释放无人机部署，选择目标`);
  },

  onAnswer(ctx, player, pending, answer) {
    if (pending.purpose !== "skill:shalang.summon") return;
    const target = unitByUid(ctx.state, answer);
    if (!target?.alive) return;
    if (ownedDrone(ctx, player)) {
      ctx.log("无人机最多只能存在一架");
      return;
    }

    const state = ctx.state;
    const drone = createUnit({
      uid: nextUnitUid(state),
      index: 200 + (state.summons?.length ?? 0),
      kind: "drone",
      name: `${player.name}的无人机`,
      hp: DRONE_HP,
      teamId: player.teamId,
      ownerUid: player.uid,
    });
    drone.char = { targetUid: target.uid, targetKind: target.kind };
    state.summons.push(drone);

    ctx.log(`${player.name} 部署无人机，目标：${target.name}`);
    ctx.dev(CAT.SKILL, `部署无人机: ${drone.name} → ${target.name}`, {
      droneUid: drone.uid,
      targetUid: target.uid,
      hp: drone.hp,
    });
    // 召唤当回合不能进行其他行动
    ctx.turn.pass();
  },

  hooks: {
    onTurnStart(ctx, player) {
      if (player.alive) droneAttack(ctx, player);
    },

    /** 白子执行防御 → 无人机也从牌库拿一张防御牌 */
    onDefense(ctx, player) {
      const drone = ownedDrone(ctx, player);
      if (!drone) return;
      ctx.deck.ensure(1);
      const card = ctx.deck.draw(1)[0];
      if (!card) return;
      const originalValue = card.value;
      const { total } = reduceModifiers(
        ctx,
        originalValue,
        collectModifiers(DEFENSE_MODIFIERS),
        { kind: "defense", source: player, target: drone },
      );
      card.defenseValue = total;
      card.value = originalValue;
      card.faceUp = false;
      card.ownerUid = player.uid;
      drone.defensePile.push(card);
      ctx.log(`${drone.name} 从牌库获得防御牌 ${display(card)}（${total}）`);
    },
  },
};
