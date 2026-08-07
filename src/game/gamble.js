import { STEP } from "./constants.js";
import { drawCards, cardDisplay } from "./deck.js";
import { CAT } from "./gameLogger.js";
import { recordSound } from "./soundEvents.js";

// 依赖注入（由 gameState.js 调用）
let _currentPlayer, _addLog, _ensureDeck, _endAction;

export function _injectGambleDeps(
  currentPlayerFn,
  addLogFn,
  ensureDeckFn,
  endActionFn,
) {
  _currentPlayer = currentPlayerFn;
  _addLog = addLogFn;
  _ensureDeck = ensureDeckFn;
  _endAction = endActionFn;
}

function currentPlayer(state) {
  return _currentPlayer(state);
}
function addLog(state, msg) {
  _addLog(state, msg);
}
function ensureDeck(state, n) {
  _ensureDeck(state, n);
}
function endAction(state) {
  _endAction(state);
}

// ===== 赌命 =====

export function executeGamble(state) {
  if (state.step !== STEP.PICK_ACTION) return;
  const player = currentPlayer(state);
  ensureDeck(state);

  let drawCount = 2;
  if (player.characterId === 7 && player.moonPhase === 2) {
    // 哥伦比娅新月
    drawCount = 3;
  }
  if (state.currentWeather === "wind") {
    drawCount += 1;
  }

  const r = drawCards(state.deck, drawCount);
  const drawn = r.drawn.map((c) => ({ ...c, faceUp: true }));
  state.deck = r.remaining;

  recordSound(state, "gamble");
  addLog(state, `${player.name} 执行赌命`);
  state.devLog.info(
    CAT.GAMBLE,
    `${player.name} 赌命抽${drawn.length}张: ${drawn.map(cardDisplay).join(" ")}`,
    {
      drawCount,
      cards: drawn.map((c) => ({ display: cardDisplay(c), value: c.value })),
      bonuses: {
        newMoon: player.characterId === 7 && player.moonPhase === 2,
        wind: state.currentWeather === "wind",
      },
    },
  );

  // 连续赌命计数 + 赌命惩罚判定
  player.relations.consecutiveGambles =
    (player.relations.consecutiveGambles || 0) + 1;
  state.devLog.info(
    CAT.GAMBLE,
    `${player.name} 连续赌命 ${player.relations.consecutiveGambles} 次`,
    {
      consecutiveGambles: player.relations.consecutiveGambles,
    },
  );
  if (
    player.relations.consecutiveGambles >= 3 &&
    !player.relations.gamblePenalty
  ) {
    player.relations.gamblePenalty = true;
    addLog(state, `${player.name} 连续赌命3次，被标记惩罚！受到的伤害+1`);
    state.devLog.info(CAT.GAMBLE, `赌命惩罚开始: ${player.name}`, {
      consecutiveGambles: player.relations.consecutiveGambles,
    });
  }

  state.step = STEP.GAMBLE_PICK;
  state.pendingGamble = { drawnCards: drawn };
}

export function submitGamble(state, trapIdx, baitIdx) {
  if (state.step !== STEP.GAMBLE_PICK) return;
  const player = currentPlayer(state);
  const cards = state.pendingGamble?.drawnCards;
  if (!cards || trapIdx === baitIdx) return;

  const trapCard = cards[trapIdx];
  const baitCard = cards[baitIdx];

  if (player.trap) state.grave.push(player.trap);
  if (player.bait) state.grave.push(player.bait);

  trapCard.faceUp = false;
  player.trap = trapCard;
  baitCard.faceUp = true;
  player.bait = baitCard;

  cards.forEach((c, i) => {
    if (i !== trapIdx && i !== baitIdx) state.grave.push(c);
  });

  addLog(state, `${player.name} 设陷阱 诱饵${cardDisplay(baitCard)}`);
  state.devLog.info(
    CAT.GAMBLE,
    `${player.name} 设陷阱: 陷阱=${cardDisplay(trapCard)}(${trapCard.value}) 诱饵=${cardDisplay(baitCard)}(${baitCard.value})`,
    {
      trapValue: trapCard.value,
      baitValue: baitCard.value,
      discarded: cards
        .filter((_, i) => i !== trapIdx && i !== baitIdx)
        .map(cardDisplay),
    },
  );

  state.pendingGamble = null;
  state.step = STEP.PICK_ACTION;
  endAction(state);
}
