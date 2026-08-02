<template>
  <div class="league-shell">
    <!-- 设置界面 -->
    <template v-if="uiMode === 'setup'">
      <LeagueSetup
        :selected-team-id="_selectedTeamId"
        :difficulty="_difficulty"
        :use-a-i="_useAI"
        :artifact-id="_artifactId"
        :opponent-artifact-id="_opponentArtifactId"
        @update:selected-team-id="onSelectTeam"
        @update:use-a-i="onSetUseAI"
        @update:difficulty="onSetDifficulty"
        @update:artifact-id="_artifactId = $event"
        @update:opponent-artifact-id="_opponentArtifactId = $event"
        @start="onStartSetup"
      />
    </template>

    <!-- 选人界面 -->
    <LeagueDraft
      v-else-if="uiMode === 'draft'"
      ref="draftRef"
      :player-team-name="currentPlayerTeam?.name || '你的队伍'"
      :opponent-team-name="currentOpponentTeam?.name || '对手'"
      @draft-complete="onDraftComplete"
    />

    <!-- 比赛进行中 -->
    <template v-else-if="uiMode === 'match'">
      <!-- 记分牌 -->
      <div class="league-scoreboard" @click="onScoreboardClick">
        <div class="lsb-team lsb-team--player">
          <span class="lsb-emoji">{{ currentPlayerTeam?.emoji }}</span>
          <span class="lsb-name">{{ currentPlayerTeam?.name }}</span>
        </div>
        <div class="lsb-score">
          <span class="lsb-round"
            >R{{ matchState?._currentRound || 1 }}/{{
              matchState?.maxRounds || 60
            }}</span
          >
        </div>
        <div class="lsb-team lsb-team--opponent">
          <span class="lsb-name">{{ currentOpponentTeam?.name }}</span>
          <span class="lsb-emoji">{{ currentOpponentTeam?.emoji }}</span>
        </div>
      </div>

      <!-- 保存按钮 -->
      <button class="league-save-btn" @click="onSaveAndQuit" title="保存并退出">
        💾
      </button>

      <!-- 游戏主界面 -->
      <GameShell
        ref="gameShellRef"
        :state="gameState"
        :league-mode="true"
        @restart="resetLeague"
        @saveAndQuit="handleLeagueSave"
      />
    </template>

    <!-- 本轮结果 -->
    <LeagueRoundResult
      v-else-if="uiMode === 'roundResult'"
      :round="roundResultsRound"
      :match-results="roundResults || []"
      :is-last-round="leagueState._currentRound >= 18"
      @continue="continueToNextRound"
      @view-standings="viewStandings"
    />

    <!-- 积分榜 -->
    <LeagueStandings
      v-else-if="uiMode === 'standings'"
      :standings="getStandings()"
      :current-round="leagueState._currentRound - 1"
      :total-rounds="18"
      :is-finished="leagueState._currentRound > 18"
      @continue="onStandingsContinue"
    />

    <!-- 联赛结束 -->
    <div v-else-if="uiMode === 'tournamentEnd'" class="league-end">
      <div class="league-end__card">
        <h2>🏆 联赛结束</h2>
        <p>最终排名已确定</p>
        <LeagueStandings
          :standings="getStandings()"
          :current-round="18"
          :total-rounds="18"
          :is-finished="true"
          @continue="$emit('restart')"
        />
        <button class="league-btn" @click="$emit('restart')">返回主菜单</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import GameShell from "./GameShell.vue";
import LeagueSetup from "./LeagueSetup.vue";
import LeagueDraft from "./LeagueDraft.vue";
import LeagueStandings from "./LeagueStandings.vue";
import LeagueRoundResult from "./LeagueRoundResult.vue";
import { useLeagueController } from "../composables/useLeagueController.js";
import { CAT } from "../game/gameLogger.js";
import {
  startAttack,
  executeAttack,
  executeDefense,
  executeGamble,
  submitGamble,
  executeSkill,
  executeFenjinSkill,
  executeAimiliyaSkill,
  serializeGameState,
} from "../game/gameState.js";
import {
  isAiPlayer,
  decideTopAction,
  decideTarget,
  decideGamblePick,
} from "../game/ai/index.js";

const props = defineProps({
  useAI: { type: Boolean, default: true },
  difficulty: { type: String, default: "skilled" },
});

const emit = defineEmits(["restart", "saveAndQuit"]);

const {
  leagueState,
  matchState,
  gameState,
  uiMode,
  draftResult,
  roundResults,
  currentPlayerTeam,
  currentOpponentTeam,
  initLeague,
  startMatchWithDraft,
  continueToNextRound,
  viewStandings,
  getStandings,
  finishLeague,
  startTiebreaker,
  startTiebreakerMatch,
  saveLeague,
  restoreLeague,
  resetLeague,
  rebuildLeagueContext,
} = useLeagueController();

const draftRef = ref(null);
const gameShellRef = ref(null);
const _selectedTeamId = ref(null);
const _difficulty = ref("skilled");
const _useAI = ref(props.useAI ?? true);
const _artifactId = ref(null);
const _opponentArtifactId = ref(null);
const scoreboardClicks = ref(0);

// ---- 设置事件 ----
function onSelectTeam(teamId) {
  _selectedTeamId.value = teamId;
}

function onSetDifficulty(diff) {
  _difficulty.value = diff;
}

function onSetUseAI(val) {
  _useAI.value = val;
}

function onStartSetup() {
  if (!_selectedTeamId.value) return;
  initLeague(
    _selectedTeamId.value,
    _difficulty.value,
    _artifactId.value,
    _opponentArtifactId.value,
    _useAI.value,
  );
}

// ---- 选人完成 ----
function onDraftComplete(draft) {
  startMatchWithDraft(draft);
}

// ---- 记分牌点击 ----
function onScoreboardClick() {
  // 预留：5连击调试
  scoreboardClicks.value++;
  if (scoreboardClicks.value >= 5) {
    scoreboardClicks.value = 0;
  }
}

// ---- 本轮结果轮次 ----
const roundResultsRound = computed(() => leagueState._currentRound || 1);

// ---- 积分榜继续 ----
function onStandingsContinue() {
  if (leagueState._currentRound > 18) {
    // 联赛已结束
    if (leagueState._tiebreakerNeeded) {
      startTiebreaker();
    } else {
      finishLeague();
    }
  } else {
    // 联赛进行中，继续下一轮
    leagueState._currentRound++;
    uiMode.value = "draft";
  }
}

// ---- 存档 ----
function handleLeagueSave(saveData) {
  const data = saveData || saveLeague();
  emit("saveAndQuit", data);
}

function onSaveAndQuit() {
  const data = saveLeague();
  emit("saveAndQuit", data);
}

// ---- AI 调度（对手3个角色，参考 WorldCupShell） ----
let aiTimer = null;

function isAITurn() {
  const p = gameState.players[gameState.currentPlayerIndex];
  return p?.alive && isAiPlayer(p);
}

function scheduleAI() {
  if (aiTimer) clearTimeout(aiTimer);
  if (!_useAI.value) return;
  if (uiMode.value !== "match" || gameState.gameOver) return;
  if (gameState._elimPaused) return;
  if (matchState.value?.matchOver) return;
  if (gameState.step !== "pickAction" || !isAITurn()) return;
  aiTimer = setTimeout(aiAct, 600 + Math.random() * 600);
}

watch(() => gameState.currentPlayerIndex, scheduleAI, { immediate: true });
watch(() => gameState.step, scheduleAI, { immediate: true });

function aiAct() {
  if (gameState.step === "pickAction") {
    const decision = decideTopAction(gameState);
    gameState.devLog?.debug(
      CAT.AI,
      `联赛AI决策: ${decision.action} (${decision.reason})`,
      {
        player: gameState.players[gameState.currentPlayerIndex]?.name,
        decision,
      },
    );
    executeTopAction(decision);
  } else {
    executeMiddleStep();
  }

  // 保底回退
  aiTimer = setTimeout(() => {
    if (gameState.step !== "pickAction") return;
    if (!isAITurn() || gameState.gameOver) return;
    if (matchState.value?.matchOver) return;
    gameState.devLog?.warn(CAT.AI, "联赛AI触发保底回退，自动执行防御", {
      player: gameState.players[gameState.currentPlayerIndex]?.name,
    });
    executeDefense(gameState);
  }, 300);
}

function executeTopAction(decision) {
  switch (decision.action) {
    case "attack": {
      startAttack(gameState);
      aiTimer = setTimeout(() => {
        if (gameState.step === "attackShowCard") {
          const attacker = gameState.players[gameState.currentPlayerIndex];
          const targets = gameState.players.filter(
            (p) =>
              p.alive &&
              p.index !== attacker.index &&
              p.teamId !== attacker.teamId,
          );
          if (targets.length > 0) {
            const t = decideTarget(gameState, targets);
            if (t?.targetIndex != null) executeAttack(gameState, t.targetIndex);
          }
        }
      }, 500);
      break;
    }
    case "defense":
      executeDefense(gameState);
      break;
    case "gamble": {
      gameState._skipAnim = true;
      const lb = gameState.messageLog.length;
      executeGamble(gameState);
      aiSuppressLog(lb, "对手 执行赌命");
      aiTimer = setTimeout(() => {
        if (gameState.step === "gamblePick" && gameState.pendingGamble) {
          const g = decideGamblePick(
            gameState,
            gameState.pendingGamble.drawnCards,
          );
          const lb2 = gameState.messageLog.length;
          submitGamble(gameState, g.trapIdx, g.baitIdx);
          aiSuppressLog(lb2);
        }
        gameState._skipAnim = false;
      }, 400);
      break;
    }
    case "skill": {
      executeSkill(gameState);
      aiTimer = setTimeout(() => executeMiddleStep(), 400);
      break;
    }
  }
}

function executeMiddleStep() {
  const s = gameState.step;
  if (s === "pickAction") return;

  if (s === "attackShowCard") {
    const attacker = gameState.players[gameState.currentPlayerIndex];
    const targets = gameState.players.filter(
      (p) =>
        p.alive && p.index !== attacker.index && p.teamId !== attacker.teamId,
    );
    if (targets.length > 0) {
      const t = decideTarget(gameState, targets);
      if (t?.targetIndex != null) executeAttack(gameState, t.targetIndex);
    }
  } else if (s === "gamblePick") {
    if (gameState.pendingGamble) {
      const g = decideGamblePick(gameState, gameState.pendingGamble.drawnCards);
      submitGamble(gameState, g.trapIdx, g.baitIdx);
    }
    gameState._skipAnim = false;
  } else if (s === "skillPickTarget") {
    const attacker = gameState.players[gameState.currentPlayerIndex];
    const targets = gameState.players.filter(
      (p) => p.alive && p.index !== attacker.index,
    );
    if (targets.length > 0) {
      const t = decideTarget(gameState, targets);
      if (t?.targetIndex != null) {
        if (gameState._aimiliyaFreeze) {
          executeAimiliyaSkill(gameState, t.targetIndex);
        } else if (gameState._fenjinHeal !== undefined) {
          executeFenjinSkill(gameState, t.targetIndex);
        } else {
          executeSkill(gameState, t.targetIndex);
        }
      }
    }
  }
}

function aiSuppressLog(fromIdx, replaceMsg) {
  const log = gameState.messageLog;
  while (log.length > fromIdx) log.pop();
  if (replaceMsg) log.push(replaceMsg);
}

// ---- 公开方法 ----
function initLeagueFromSetup(
  teamId,
  difficulty,
  artifactId,
  opponentArtId,
  useAI,
) {
  _selectedTeamId.value = teamId;
  _difficulty.value = difficulty;
  initLeague(teamId, difficulty, artifactId, opponentArtId, useAI);
}

/** 读档后同步本组件的设置状态（AI开关/圣遗物） */
function onRestoreLeague(saveData) {
  restoreLeague(saveData);
  _useAI.value = saveData.leagueSetup?.useAI ?? true;
  _artifactId.value = saveData.leagueSetup?.artifactId ?? null;
  _opponentArtifactId.value = saveData.leagueSetup?.opponentArtifactId ?? null;
}

defineExpose({
  initLeagueFromSetup,
  restoreLeague: onRestoreLeague,
  saveLeague,
  uiMode,
  leagueState,
});

onBeforeUnmount(() => {
  if (aiTimer) clearTimeout(aiTimer);
});
</script>

<style scoped>
.league-shell {
  position: relative;
  width: 100%;
  min-height: 100vh;
}

/* 记分牌 */
.league-scoreboard {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 16px;
  background: rgba(10, 15, 40, 0.94);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  cursor: pointer;
}
.lsb-team {
  display: flex;
  align-items: center;
  gap: 6px;
}
.lsb-emoji {
  font-size: 18px;
}
.lsb-name {
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
}
.lsb-score {
  text-align: center;
}
.lsb-round {
  font-size: 13px;
  color: #ffd700;
  font-weight: 700;
}

/* 保存按钮 */
.league-save-btn {
  position: fixed;
  top: 44px;
  right: 12px;
  z-index: 101;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 18px;
  padding: 4px 10px;
  cursor: pointer;
}
.league-save-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}

/* 联赛结束 */
.league-end {
  display: flex;
  justify-content: center;
  padding: 40px 20px;
  min-height: 100vh;
}
.league-end__card {
  background: rgba(10, 15, 40, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 28px;
  max-width: 720px;
  width: 100%;
  color: #e0e0e0;
  text-align: center;
}
.league-end__card h2 {
  margin: 0 0 8px;
}
.league-btn {
  margin-top: 20px;
  padding: 12px 32px;
  background: linear-gradient(135deg, #1a6b3c, #0d4a25);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.league-btn:hover {
  background: linear-gradient(135deg, #1e8a4d, #135e30);
}
</style>
