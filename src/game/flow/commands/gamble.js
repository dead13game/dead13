// 命令层 · gamble — 由 flow/commands.js 拆分而来（纯搬运，行为不变）
import { display } from "../../core/cards.js";
import { CAT } from "../../core/log.js";
import { PENDING } from "../pending.js";
import { friendlyTargets, isFriendly, unitByUid } from "../../core/units.js";
import { resetAttackStreak } from "../../characters/helpers.js";
import { isIdle } from "./query.js";

export function gamble(ctx) {
  const state = ctx.state;
  if (!isIdle(ctx)) return false;
  const player = ctx.players.current();
  resetAttackStreak(player);

  ctx.deck.ensure(1);

  let drawCount = 2;
  if (player.characterId === 7 && player.char.moonPhase === 2) drawCount = 3;
  if (state.currentWeather === "wind") drawCount += 1;

  const drawn = ctx.deck.draw(drawCount).map((c) => ({ ...c, faceUp: true }));
  if (drawn.length < 2) {
    // 抽不满 2 张就无法设陷阱/诱饵;记录后放弃本次行动(不崩)
    ctx.devError(CAT.ANOMALY, "牌库耗尽,无法执行赌命", {
      deck: state.deck.length,
      grave: state.grave.length,
    });
    return false;
  }

  ctx.sound("gamble");
  ctx.drawEvent(drawn, { kind: "gamble", actorUid: player.uid });
  ctx.log(`${player.name} 执行赌命`);
  ctx.dev(
    CAT.GAMBLE,
    `${player.name} 赌命抽${drawn.length}张: ${drawn.map(display).join(" ")}`,
    {
      drawCount,
      cards: drawn.map((c) => ({ display: display(c), value: c.value })),
      bonuses: {
        newMoon: player.characterId === 7 && player.char.moonPhase === 2,
        wind: state.currentWeather === "wind",
      },
    },
  );

  player.relations.consecutiveGambles =
    (player.relations.consecutiveGambles || 0) + 1;
  ctx.dev(
    CAT.GAMBLE,
    `${player.name} 连续赌命 ${player.relations.consecutiveGambles} 次`,
    { consecutiveGambles: player.relations.consecutiveGambles },
  );

  if (
    player.relations.consecutiveGambles >= 3 &&
    !player.relations.gamblePenalty
  ) {
    player.relations.gamblePenalty = true;
    ctx.log(`${player.name} 连续赌命3次，被标记惩罚！受到的伤害+1`);
    ctx.dev(CAT.GAMBLE, `赌命惩罚开始: ${player.name}`, {
      consecutiveGambles: player.relations.consecutiveGambles,
    });
  }

  // 兼容字段(动画桥接与 ActionBar 读它)
  state.pendingGamble = { drawnCards: drawn };
  ctx.ask({
    type: PENDING.GAMBLE,
    purpose: "gamble",
    asker: player.uid,
    data: { cards: drawn },
  });
  return true;
}

export function gambleSubmit(ctx, trapIdx, baitIdx) {
  const state = ctx.state;
  const pending = state.pending;
  if (!pending || pending.type !== PENDING.GAMBLE) return false;
  if (trapIdx === baitIdx) return false;

  const player = ctx.players.current();
  const cards = pending.data.cards;
  const trapCard = cards[trapIdx];
  const baitCard = cards[baitIdx];
  if (!trapCard || !baitCard) return false;

  if (player.trap) state.grave.push(player.trap);
  if (player.bait) state.grave.push(player.bait);

  trapCard.faceUp = false;
  // 对外展示的「陷阱点数」始终是诱饵点数；真正的陷阱牌隐藏
  trapCard.decoyValue = baitCard.value;
  player.trap = trapCard;
  baitCard.faceUp = true;
  player.bait = baitCard;

  cards.forEach((c, i) => {
    if (i !== trapIdx && i !== baitIdx) state.grave.push(c);
  });

  ctx.log(`${player.name} 设陷阱 诱饵${display(baitCard)}`);
  ctx.dev(
    CAT.GAMBLE,
    `${player.name} 设陷阱: 陷阱=${display(trapCard)}(${trapCard.value}) 诱饵=${display(baitCard)}(${baitCard.value})`,
    {
      trapValue: trapCard.value,
      baitValue: baitCard.value,
      discarded: cards
        .filter((_, i) => i !== trapIdx && i !== baitIdx)
        .map(display),
    },
  );

  state.pendingGamble = null;

  // 团战：陷阱可以布置给自己/队友/己方塔（诱饵仍留在自己这里）
  const rules = state.mode?.rules ?? {};
  if (rules.supportGamble) {
    const options = friendlyTargets(state, player)
      .filter((u) => u.kind !== "drone")
      .map((u) => u.uid);
    if (options.length > 1) {
      ctx.ask({
        type: PENDING.TARGET,
        purpose: "gamble:trap",
        asker: player.uid,
        options,
      });
      ctx.log(`${player.name} 选择陷阱布置目标`);
      return true;
    }
  }

  ctx.turn.pass();
  return true;
}

/** 团战：把陷阱移到指定友方单位/塔 */
export function gambleTarget(ctx, targetUid) {
  const state = ctx.state;
  const pending = state.pending;
  if (!pending || pending.purpose !== "gamble:trap") return false;
  const actor = ctx.players.current();
  const target = unitByUid(state, targetUid);
  if (!target?.alive) return false;
  if (!isFriendly(actor, target)) {
    ctx.log("只能把陷阱布置在己方单位上");
    return false;
  }

  if (target.uid !== actor.uid) {
    if (!actor.trap) return false;
    if (target.trap) state.grave.push(target.trap);
    target.trap = actor.trap;
    target.trap.faceUp = false;
    // 诱饵仍留在施放者这里，但陷阱的公开点数继续沿用该诱饵
    target.trap.decoyValue = actor.bait?.value ?? target.trap.decoyValue;
    actor.trap = null;
    ctx.log(`${actor.name} 把陷阱布置在 ${target.name}`);
    ctx.dev(CAT.GAMBLE, `陷阱转移: ${actor.name} → ${target.name}`, {
      targetUid: target.uid,
      trapValue: target.trap.value,
    });
  }

  state.pending = null;
  if (!state.gameOver) ctx.turn.pass();
  return true;
}

// ════════════════════════════════════════
//  技能
// ════════════════════════════════════════
