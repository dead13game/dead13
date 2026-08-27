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
          <TeamBadge :team-id="currentPlayerTeam?.id" size="sm" />
          <span class="lsb-name">{{ currentPlayerTeam?.name }}</span>
        </div>
        <div class="lsb-score">
          <span class="lsb-score-num">{{ liveScore[0] }} : {{ liveScore[1] }}</span>
          <span
            v-if="matchState?.isTiebreaker"
            class="lsb-round"
            title="名次积分：第6名1分 ~ 第1名6分"
            >⚔️ 加赛 · 名次分</span
          >
          <span
            v-else
            class="lsb-round"
            title="名次积分：第6名1分 ~ 第1名6分"
            >R{{ matchState?._currentRound || 1 }}/{{
              matchState?.maxRounds ?? 30
            }} · 名次分</span
          >
        </div>
        <div class="lsb-team lsb-team--opponent">
          <span class="lsb-name">{{ currentOpponentTeam?.name }}</span>
          <TeamBadge :team-id="currentOpponentTeam?.id" size="sm" />
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
import TeamBadge from "./TeamBadge.vue";
import LeagueSetup from "./LeagueSetup.vue";
import LeagueDraft from "./LeagueDraft.vue";
import LeagueStandings from "./LeagueStandings.vue";
import LeagueRoundResult from "./LeagueRoundResult.vue";
import { useLeagueController } from "../composables/useLeagueController.js";
import { calculateMatchScore } from "../game/league.js";
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

// ---- 记分牌 5 连击 → 打开 DevLogPanel（与世界杯一致） ----
let scoreboardClicks = 0;
let scoreboardTimer = null;

function onScoreboardClick() {
  scoreboardClicks++;
  if (scoreboardTimer) clearTimeout(scoreboardTimer);
  if (scoreboardClicks >= 5) {
    gameShellRef.value?.toggleDevLog();
    scoreboardClicks = 0;
  } else {
    scoreboardTimer = setTimeout(() => {
      scoreboardClicks = 0;
    }, 1500);
  }
}

// ---- 本轮结果轮次 ----
const roundResultsRound = computed(() => leagueState._currentRound || 1);

// ---- 实时锁定积分（规则v3.0，类似世界杯记分牌）----
// 按已阵亡顺序结算名次积分（6/5/4/3/2/1），团灭时剩余名次自动补全给存活队；
// 双方均有人存活时只计已锁定名次，比赛结束即最终比分。
const liveScore = computed(() => {
  const ms = matchState.value;
  if (!ms) return [0, 0];
  const { playerScore, opponentScore } = calculateMatchScore(
    ms.deathOrder || [],
    0,
    1,
  );
  return [playerScore, opponentScore];
});

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
  // 双保险：即使已调度的 timer 触发，手动模式下直接退出（防止读档时序问题）
  if (!_useAI.value) return;
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
  if (!_useAI.value) return; // 手动模式中止链式调度
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
  if (!_useAI.value) return; // 手动模式中止链式调度
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
  // 先同步设置状态，再恢复游戏（restoreLeague 内部会触发 watch → scheduleAI，
  // 此时 _useAI 已是正确值，避免手动模式被调度 AI）
  _useAI.value = saveData.leagueSetup?.useAI ?? true;
  _artifactId.value = saveData.leagueSetup?.artifactId ?? null;
  _opponentArtifactId.value = saveData.leagueSetup?.opponentArtifactId ?? null;
  restoreLeague(saveData);
  // 兜底：清除 restore 过程中可能残留的 AI 调度
  if (aiTimer) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
  if (_useAI.value) scheduleAI();
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
  if (scoreboardTimer) clearTimeout(scoreboardTimer);
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
  padding-top: max(8px, env(safe-area-inset-top));
  background: rgba(10, 15, 40, 0.94);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  cursor: pointer;
}
.lsb-team {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.lsb-name {
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lsb-score {
  text-align: center;
}
.lsb-score-num {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.lsb-round {
  font-size: 12px;
  color: #ffd700;
  font-weight: 700;
  display: block;
  white-space: nowrap;
}

/* 保存按钮 */
.league-save-btn {
  position: fixed;
  top: max(60px, calc(env(safe-area-inset-top) + 52px));
  right: 12px;
  z-index: 101;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
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

/* 窄屏适配（对齐世界杯记分牌） */
@media (max-width: 500px) {
  .league-scoreboard {
    gap: 8px;
    padding: 6px 10px;
    padding-top: max(6px, env(safe-area-inset-top));
  }
  .lsb-team {
    gap: 4px;
  }
  .lsb-name {
    font-size: 11px;
    max-width: 56px;
  }
  .lsb-score-num {
    font-size: 18px;
  }
  .lsb-round {
    font-size: 10px;
  }
  .league-save-btn {
    right: 8px;
  }
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
