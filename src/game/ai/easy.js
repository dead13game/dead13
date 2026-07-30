import { getCharData } from "../constants.js";
import { canUseSkill } from "../skills.js";
import { alivePlayers } from "../damage.js";
import { canAttackAi } from "./index.js";

// ════════════════════════════════════════════════════════════
//  简单难度实现
// ════════════════════════════════════════════════════════════

export function decideEasyTop(state, player) {
  const r = Math.random();
  const canAtk = canAttackAi(state);
  const canSkill =
    getCharData(player).skillType === "active" &&
    player.skillUses > 0 &&
    state.currentWeather !== "arms";

  if (r < 0.55 && canAtk) return { action: "attack", reason: "random(55%)" };
  if (r < 0.82) return { action: "defense", reason: "random(27%)" };
  if (r < 0.94) return { action: "gamble", reason: "random(12%)" };
  if (canSkill) return { action: "skill", reason: "random(6%)" };
  return { action: "defense", reason: "fallback" };
}

export function decideEasyTarget(state, player) {
  const alive = alivePlayers(state).filter(
    (p) =>
      p.index !== player.index &&
      !(player.teamId >= 0 && p.teamId === player.teamId),
  );
  return { targetIndex: alive[0]?.index ?? 0, reason: "first opponent" };
}

export function decideEasyGamble(state, player, cards) {
  return { trapIdx: 0, baitIdx: 1, reason: "first two" };
}

export function decideEasyNahida(state, player, scryCards) {
  return [0, 1, 2, 3, 4];
}

export function decideEasyLiniya(state, player) {
  const targets = alivePlayers(state).filter((p) => p.index !== player.index);
  return {
    subSkill: 2,
    targetIndex: targets[0]?.index ?? 0,
    reason: "dot",
  };
}

export function decideEasyCaiyueang(state, player) {
  return { choice: "save", reason: "always save" };
}
