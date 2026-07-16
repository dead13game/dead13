import { reactive, ref, computed } from "vue";
import { createGameState, initGame } from "../game/gameState.js";
import { CHARACTERS } from "../game/constants.js";

/**
 * 游戏控制器 — 管理选角、开始、重置等顶层游戏流程
 * 从 App.vue 提取，供 GameSetup + GameShell 共用
 */
export function useGameController() {
  const gameState = createGameState();
  const gameStarted = ref(false);
  const playerCount = ref(2);
  const playerNames = reactive(["", "", "", "", "", "", "", ""]);
  const playerChars = reactive(["", "", "", "", "", "", "", ""]);
  const useWeather = ref(false);
  const aiSlots = reactive([
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  const aiDifficulties = reactive([
    "easy",
    "easy",
    "easy",
    "easy",
    "easy",
    "easy",
    "easy",
    "easy",
  ]);

  // 可用角色（排除已被其他玩家选的）
  function availableChars(playerIdx) {
    const selectedOthers = playerChars.filter((c, i) => i !== playerIdx && c);
    return CHARACTERS.filter(
      (c) => !selectedOthers.includes(c.id) || c.id === playerChars[playerIdx],
    );
  }

  function selectChar(idx, charId) {
    playerChars[idx] = charId;
  }

  // 所有玩家都选好了角色
  const allSelected = computed(() => {
    for (let i = 0; i < playerCount.value; i++) {
      if (!playerChars[i]) return false;
    }
    return true;
  });

  function startGame() {
    const names = playerNames
      .slice(0, playerCount.value)
      .map((n, i) => n.trim() || `玩家 ${i + 1}`);
    const chars = playerChars.slice(0, playerCount.value);
    initGame(gameState, chars, useWeather.value);
    chars.forEach((charId, i) => {
      gameState.players[i].name = names[i];
    });
    // 标记 AI 玩家（用 characterId 配对，因为 initGame 会按HP重排players）
    gameState.players.forEach((p) => {
      const slotIdx = playerChars.indexOf(p.characterId);
      if (slotIdx >= 0) {
        p.isAI = aiSlots[slotIdx] || false;
        p.aiDifficulty = aiSlots[slotIdx] ? aiDifficulties[slotIdx] : "easy";
      }
    });
    gameStarted.value = true;
  }

  function resetGame() {
    gameStarted.value = false;
    for (let i = 0; i < 8; i++) {
      playerNames[i] = "";
      playerChars[i] = "";
    }
  }

  return {
    // state
    gameState,
    gameStarted,
    playerCount,
    playerNames,
    playerChars,
    useWeather,
    // computed
    allSelected,
    // methods
    availableChars,
    selectChar,
    startGame,
    resetGame,
    aiSlots,
    aiDifficulties,
  };
}
