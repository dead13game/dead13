// 新内核的状态投影 — 必须与 projectLegacy 产出完全同构
//
// 差异点全部在「表示法」而不是「语义」:
//   uid → index 反查、statusEffects/relations 展开、damageBonus 的键从 uid 换回 index
// 一切为了能和旧实现录制的基线逐字段比较。

import { normId, projCard, projDeck, normalizeNumbers } from "./projection.js";

/** uid → 该玩家当前渲染序(= 旧实现的 index) */
function indexOfUid(state, uid) {
  if (uid == null) return null;
  const p = state.players.find((x) => x.uid === uid);
  return p ? p.index : null;
}

/** 旧实现用 index 当键,且对象整型键自动升序;这里保持一致 */
function damageBonusJson(map, state) {
  const entries = Object.entries(map || {})
    .map(([uid, v]) => [indexOfUid(state, Number(uid)), v])
    .filter(([i]) => i !== null)
    .sort((a, b) => a[0] - b[0]);
  const obj = {};
  for (const [i, v] of entries) obj[i] = v;
  return JSON.stringify(obj);
}

function mapCards(cards) {
  return cards ? cards.map((c) => [normId(c.id), c.value]) : null;
}

export function projectNext(state) {
  const idx = (uid) => indexOfUid(state, uid);

  return normalizeNumbers({
    round: state.round,
    phase: state.phase,
    step: state.step,
    cp: state.currentPlayerIndex,
    over: !!state.gameOver,
    winner: state.winnerIndex,
    players: state.players.map((p) => ({
      i: p.index,
      cid: p.characterId,
      name: p.name,
      team: p.teamId,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive ? 1 : 0,
      def: p.defensePile.map(projCard),
      trap: p.trap ? projCard(p.trap) : null,
      bait: p.bait ? projCard(p.bait) : null,
      su: p.resources.skillUses,
      fs: p.char.fightingSpirit ?? 0,
      moon: p.char.moonPhase ?? 0,
      lu: p.resources.loadUses,
      atk: p.relations.attackedThisRound ?? 0,
      fx: [
        idx(p.effects.frozenBy),
        p.effects.ignoreTrapThisTurn ? 1 : 0,
        0, // 旧 statusEffects.extraAction 从未被写入,恒为 false
        p.effects.stealTarget
          ? JSON.stringify({
              idx: idx(p.effects.stealTarget.uid),
              turns: p.effects.stealTarget.turns,
            })
          : null,
        p.effects.dotTarget
          ? JSON.stringify({
              idx: idx(p.effects.dotTarget.uid),
              turns: p.effects.dotTarget.turns,
            })
          : null,
        damageBonusJson(p.effects.damageBonus, state),
      ],
      rel: [
        idx(p.relations.allyUid),
        p.relations.allianceTurns ?? 0,
        p.relations.betrayalPenalty ?? 0,
        p.relations.allyKillBonus ? 1 : 0,
        p.relations.consecutiveGambles ?? 0,
        p.relations.gamblePenalty ? 1 : 0,
      ],
      art: [
        p.artifact.id ?? null,
        p.resources.breakCount ?? 0,
        p.resources.holyWordUses ?? 2,
        p.artifact.active ? 1 : 0,
        p.artifact.roundsLeft ?? 0,
      ],
      ai: [p.ai.enabled ? 1 : 0, p.ai.difficulty ?? null],
    })),
    deck: projDeck(state.deck),
    grave: projDeck(state.grave),
    wdeck: (state.weatherDeck || []).map((w) => w.id),
    weather: [state.currentWeather ?? null, state.nextWeather ?? null, !!state.useWeather],
    pend: {
      attackCard: state.pendingAttackCard
        ? [normId(state.pendingAttackCard.id), state.pendingAttackCard.value]
        : null,
      venti: mapCards(state.pendingVentiCards),
      scry: mapCards(state.scryCards),
      gamble: state.pendingGamble ? mapCards(state.pendingGamble.drawnCards) : null,
      savepoint: state.players.some((p) => p.effects.savepoint) ? "present" : null,
    },
  });
}
