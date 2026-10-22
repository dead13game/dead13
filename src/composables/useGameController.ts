import { reactive, ref, computed } from "vue";
import { createGameState } from "../game/flow/setup.js";
import { createSession } from "../game/api.js";
import { createClassicMode } from "../game/modes/classic.js";
import { CHARACTERS } from "../game/characters/index.js";
import type { CharacterMeta, GameState } from "../game/types.js";

/**
 * 游戏控制器 — 管理选角、开始、重置等顶层游戏流程
 * 从 App.vue 提取，供 GameSetup + GameShell 共用
 */
export function useGameController() {
  const gameState = reactive<GameState>(createGameState());
  const gameStarted = ref(false);
  const playerCount = ref(2);
  const playerNames = reactive<string[]>(["", "", "", "", "", "", "", ""]);
  // 选角槽位：初始是空串占位，selectChar 写入数字角色 id
  const playerChars = reactive<Array<number | "">>([
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  const useWeather = ref(false);
  const aiSlots = reactive<boolean[]>([
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  const aiDifficulties = reactive<string[]>([
    "easy",
    "easy",
    "easy",
    "easy",
    "easy",
    "easy",
    "easy",
    "easy",
  ]);
  const playerArtifacts = reactive<Array<number | null>>([
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);

  // 可用角色（排除已被其他玩家选的）
  function availableChars(playerIdx: number): CharacterMeta[] {
    const selectedOthers = playerChars.filter(
      (c, i) => i !== playerIdx && c,
    );
    return Object.values(CHARACTERS).filter(
      (c) => !selectedOthers.includes(c.id) || c.id === playerChars[playerIdx],
    );
  }

  function selectChar(idx: number, charId: number) {
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
    // 选角完成后槽位一定是数字 id（allSelected 已守卫），空串只存在于初始占位
    const chars = playerChars.slice(0, playerCount.value) as number[];

    createSession({
      state: gameState,
      chars,
      weather: useWeather.value,
      mode: createClassicMode(),
    });

    // 按「创建槽位」标注 AI 与圣遗物。uid 在 initGame 里就是 slot+1,
    // 训练过按 characterId 反查(同角色重复时会串位)。
    gameState.players.forEach((p) => {
      const slotIdx = p.uid - 1;
      if (slotIdx < 0 || slotIdx >= playerCount.value) return;
      p.name = names[slotIdx] ?? p.name;
      p.ai.enabled = !!aiSlots[slotIdx];
      p.ai.difficulty = aiSlots[slotIdx] ? aiDifficulties[slotIdx] : "easy";
      if (!aiSlots[slotIdx]) {
        p.artifact.id = playerArtifacts[slotIdx] ?? null;
      }
    });

    gameStarted.value = true;
  }

  function resetGame() {
    gameStarted.value = false;
    for (let i = 0; i < 8; i++) {
      playerNames[i] = "";
      playerChars[i] = "";
      playerArtifacts[i] = null;
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
    playerArtifacts,
  };
}
