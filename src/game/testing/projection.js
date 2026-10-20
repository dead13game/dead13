// 差分对拍:状态投影
//
// 投影 = 「可观察行为」的规范化快照。等价性以投影为准,不是以内存对象为准。
// 规则:
//   - 含:一切影响后续判定的字段(HP/牌堆/资源/效果/关系/阶段/待决)
//   - 不含:调试日志、纯视觉字段、时间戳/随机序号
//   - 牌堆用 长度 + 顺序哈希 + 首尾采样,避免基线文件膨胀

const CARD_HASH_BASE = 0x811c9dc5;

function fnv1a(str, h = CARD_HASH_BASE) {
  let hash = h;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 归一化时间/随机 id:'shield-zhongli-1792501174918' → 'shield-zhongli' */
function normId(id) {
  if (typeof id !== "string") return id;
  return id.replace(/-\d{9,}$/, "").replace(/\d{10,}/g, "#");
}

/**
 * Infinity / NaN 不能存活于 JSON(会变成 null),
 * 而 6/7 号角色 maxUses: Infinity 是合法数据 → 统一转成字符串标记。
 */
function normalizeNumbers(v) {
  if (Array.isArray(v)) return v.map(normalizeNumbers);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v)) out[k] = normalizeNumbers(v[k]);
    return out;
  }
  if (typeof v === "number" && !Number.isFinite(v)) return String(v);
  return v;
}

function projCard(card) {
  if (!card) return null;
  return [
    normId(card.id),
    card.value,
    card.defenseValue ?? null,
    card.faceUp ? 1 : 0,
    card.isShield ? 1 : 0,
  ];
}

/** 牌堆投影:长度 + 顺序哈希 + 首尾各 2 张采样 */
function projDeck(cards) {
  if (!Array.isArray(cards)) return { n: 0, h: 0, head: [], tail: [] };
  let h = CARD_HASH_BASE;
  for (const c of cards) h = fnv1a(JSON.stringify(projCard(c)), h);
  return {
    n: cards.length,
    h,
    head: cards.slice(0, 2).map(projCard),
    tail: cards.slice(-2).map(projCard),
  };
}

function projPending(state) {
  return {
    attackCard: state.pendingAttackCard
      ? [normId(state.pendingAttackCard.id), state.pendingAttackCard.value]
      : null,
    venti: state.pendingVentiCards
      ? state.pendingVentiCards.map((c) => [normId(c.id), c.value])
      : null,
    scry: state.scryCards
      ? state.scryCards.map((c) => [normId(c.id), c.value])
      : null,
    gamble: state.pendingGamble
      ? state.pendingGamble.drawnCards.map((c) => [normId(c.id), c.value])
      : null,
    savepoint: state.players.some((p) => p.statusEffects?.savepoint)
      ? "present"
      : null,
  };
}

/** 旧实现(step + 路由 flag)的状态投影 */
export function projectLegacy(state) {
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
      su: p.skillUses,
      fs: p.fightingSpirit ?? 0,
      moon: p.moonPhase ?? 0,
      lu: p.loadUses ?? 0,
      atk: p.attackedThisRound ?? 0,
      fx: [
        p.statusEffects?.frozenBy ?? null,
        p.statusEffects?.ignoreTrapThisTurn ? 1 : 0,
        p.statusEffects?.extraAction ? 1 : 0,
        p.statusEffects?.stealTarget
          ? JSON.stringify(p.statusEffects.stealTarget)
          : null,
        p.statusEffects?.dotTarget
          ? JSON.stringify(p.statusEffects.dotTarget)
          : null,
        JSON.stringify(p.statusEffects?.damageBonus ?? {}),
      ],
      rel: [
        p.relations?.allyIndex ?? null,
        p.relations?.allianceTurns ?? 0,
        p.relations?.betrayalPenalty ?? 0,
        p.relations?.allyKillBonus ? 1 : 0,
        p.relations?.consecutiveGambles ?? 0,
        p.relations?.gamblePenalty ? 1 : 0,
      ],
      art: [
        p.artifactId ?? null,
        p.breakCount ?? 0,
        p.holyWordUses ?? 2,
        p.artifactActive ? 1 : 0,
        p.artifactRoundsLeft ?? 0,
      ],
      ai: [p.isAI ? 1 : 0, p.aiDifficulty ?? null],
    })),
    deck: projDeck(state.deck),
    grave: projDeck(state.grave),
    wdeck: (state.weatherDeck || []).map((w) => w.id),
    weather: [state.currentWeather ?? null, state.nextWeather ?? null, !!state.useWeather],
    pend: projPending(state),
  });
}

export { projCard, projDeck, normId, fnv1a };
