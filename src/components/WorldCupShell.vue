<template>
  <div class="wc-shell">
    <!-- 比赛进行中：显示游戏 + 记分牌 -->
    <template v-if="uiMode === 'match' || uiMode === 'substitution'">
      <div @click="onScoreboardClick">
        <WorldCupScoreboard
          :player-name="currentPlayerName"
          :opponent-name="currentOpponentName"
          :score="matchState?.score || [0, 0]"
          :match-round="matchState?.matchRound || 1"
          :max-rounds="matchState?.maxRounds || 90"
          :is-group-stage="matchState?.isGroupStage || false"
          :is-extra-time="matchState?.isExtraTime || false"
          :subs-left="wcState.substitutionsLeft"
          :can-sub="subsAvailable"
          :stage-label="stageLabel"
          :penalty="matchState?.penalty || null"
          @substitute="uiMode = 'substitution'"
        />
      </div>

      <!-- 保存并退出按钮（世界杯模式独立按钮） -->
      <button class="wc-save-btn" @click="onWCSaveAndQuit" title="保存并退出">
        💾
      </button>

      <!-- 游戏主界面 -->
      <GameShell
        ref="gameShellRef"
        :state="gameState"
        :world-cup-mode="true"
        @restart="resetWorldCup"
        @saveAndQuit="handleWCSave"
      />

      <!-- 换人面板（覆盖在游戏上方） -->
      <div v-if="uiMode === 'substitution'" class="wc-shell__overlay">
        <WorldCupSubstitution
          :current-char-id="
            opponentSubPending
              ? matchState?.opponentCharId || ''
              : matchState?.playerCharId || ''
          "
          :current-char-name="
            opponentSubPending ? opponentCharName : currentCharName
          "
          :opponent-char-id="
            opponentSubPending
              ? matchState?.playerCharId || ''
              : matchState?.opponentCharId || ''
          "
          :subs-left="wcState.substitutionsLeft"
          :sub-title="opponentSubPending ? '对手换人' : '玩家换人'"
          @confirm="onSubConfirm"
          @skip="onSubSkip"
        />
      </div>
    </template>

    <!-- 点球大战 -->
    <template v-else-if="uiMode === 'penalty'">
      <WorldCupScoreboard
        :player-name="currentPlayerName"
        :opponent-name="currentOpponentName"
        :score="matchState?.score || [0, 0]"
        :match-round="120"
        :max-rounds="120"
        :is-extra-time="true"
        :subs-left="0"
        :can-sub="false"
        stage-label="点球大战"
        :penalty="matchState?.penalty || null"
      />
      <div class="wc-penalty">
        <h2>⚽ 点球大战</h2>
        <p class="wc-penalty__score">
          {{ matchState?.penalty?.playerScore || 0 }}
          :
          {{ matchState?.penalty?.opponentScore || 0 }}
          （先得5分者胜）
        </p>
        <div v-if="penaltyRound" class="wc-penalty__round">
          <div class="wc-penalty__cards">
            <div>
              <p>你的牌：</p>
              <span
                v-for="(c, i) in penaltyRound.playerCards"
                :key="'p' + i"
                class="wc-penalty__card"
              >
                {{ c.rank }}{{ c.suit }}
              </span>
              <p class="wc-penalty__sum">合计：{{ penaltyRound.playerSum }}</p>
            </div>
            <div class="wc-penalty__vs">VS</div>
            <div>
              <p>对手的牌：</p>
              <span
                v-for="(c, i) in penaltyRound.opponentCards"
                :key="'o' + i"
                class="wc-penalty__card"
              >
                {{ c.rank }}{{ c.suit }}
              </span>
              <p class="wc-penalty__sum">
                合计：{{ penaltyRound.opponentSum }}
              </p>
            </div>
          </div>
          <p
            class="wc-penalty__result"
            :class="{
              'wc-penalty__result--win': penaltyRound.winner === 0,
              'wc-penalty__result--lose': penaltyRound.winner === 1,
            }"
          >
            {{
              penaltyRound.winner === 0
                ? "本轮你赢了！"
                : penaltyRound.winner === 1
                  ? "本轮对手赢了！"
                  : "本轮平手"
            }}
          </p>
        </div>
        <button v-if="!penaltyDone" class="wc-btn" @click="onPenaltyRound">
          抽牌比点
        </button>
        <button v-else class="wc-btn wc-btn--next" @click="onFinishPenalty">
          查看结果
        </button>
      </div>
    </template>

    <!-- 比赛结果 -->
    <template v-else-if="uiMode === 'matchResult'">
      <div class="wc-result">
        <h2 class="wc-result__title">
          {{ matchResult?.stage || "比赛" }} 结束
        </h2>
        <p class="wc-result__score">
          {{ currentPlayerName }}
          <strong>{{ matchResult?.score?.[0] || 0 }}</strong>
          :
          <strong>{{ matchResult?.score?.[1] || 0 }}</strong>
          {{ currentOpponentName }}
        </p>
        <p
          class="wc-result__verdict"
          :class="{
            'wc-result__verdict--win': matchResult?.winner === 0,
            'wc-result__verdict--lose': matchResult?.winner === 1,
            'wc-result__verdict--draw': matchResult?.winner === null,
          }"
        >
          {{
            matchResult?.winner === 0
              ? matchResult?.isChampion
                ? "🏆 恭喜夺冠！"
                : "🎉 获胜！"
              : matchResult?.winner === 1
                ? "😞 失利"
                : "🤝 平局"
          }}
        </p>
        <p v-if="matchResult?.decidedByPenalty" class="wc-result__penalty">
          ⚽ 点球大战决胜
        </p>
        <p v-if="matchResult?.eliminated" class="wc-result__eliminated">
          世界杯之旅到此结束
        </p>
        <button class="wc-btn" @click="onContinueAfterResult">
          {{
            matchResult?.isChampion || matchResult?.eliminated
              ? "查看总结"
              : matchResult?.hasNext
                ? "继续"
                : "查看积分榜"
          }}
        </button>
      </div>
    </template>

    <!-- 积分榜 -->
    <template v-else-if="uiMode === 'standings'">
      <WorldCupStandings
        :group-name="wcState.groupName"
        :standings="wcState.groupStandings || []"
        :player-rank="wcState._playerRank || 1"
        @continue="onContinueFromStandings"
      />
    </template>

    <!-- 淘汰赛介绍 -->
    <template v-else-if="uiMode === 'knockoutIntro'">
      <div class="wc-knockout-intro">
        <h2>⚔️ {{ knockoutIntro?.roundName }}</h2>
        <div class="wc-knockout-intro__matchup">
          <span>⭐ {{ currentPlayerName }}</span>
          <span class="wc-knockout-intro__vs">VS</span>
          <span
            >{{ knockoutIntro?.opponent?.emoji }}
            {{ knockoutIntro?.opponent?.name }}</span
          >
        </div>
        <p class="wc-knockout-intro__info">
          90回合制 · {{ MATCH_CONFIG.maxSubstitutions }}次换人机会
        </p>
        <button class="wc-btn" @click="onStartKnockout">开始比赛</button>
      </div>
    </template>

    <!-- 锦标赛结束 -->
    <template v-else-if="uiMode === 'tournamentEnd'">
      <div class="wc-end">
        <h2>
          {{
            wcState.phase === "champion" ? "🏆 世界杯冠军！" : "世界杯之旅结束"
          }}
        </h2>
        <p v-if="wcState.phase === 'champion'" class="wc-end__champion">
          恭喜 {{ currentPlayerName }} 赢得世界杯！
        </p>
        <p v-else>
          {{
            wcState.phase === "eliminated" ? "在淘汰赛中出局" : "小组赛未能出线"
          }}
        </p>
        <button class="wc-btn" @click="$emit('restart')">返回主菜单</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import GameShell from "./GameShell.vue";
import WorldCupScoreboard from "./WorldCupScoreboard.vue";
import WorldCupSubstitution from "./WorldCupSubstitution.vue";
import WorldCupStandings from "./WorldCupStandings.vue";
import { useWorldCupController } from "../composables/useWorldCupController.js";
import { MATCH_CONFIG } from "../game/worldCupConstants.js";
import { CHARACTERS } from "../game/characters/index.js";
import { getKnockoutRoundName } from "../game/worldCup.js";
import { CAT } from "../game/gameLogger.js";
import { dispatch, save as saveGame } from "../game/api.js";
import { buildView } from "../game/view.js";
import {
  isAiPlayer,
  decideTopAction,
  decideTarget,
  decideGamblePick,
  decideNahidaOrder,
  decideLiniyaChoice,
  decideCaiyueangChoice,
} from "../game/ai/index.js";

const props = defineProps({
  useAI: { type: Boolean, default: true },
  useWeather: { type: Boolean, default: false },
  difficulty: { type: String, default: "easy" },
});

const emit = defineEmits(["restart"]);

const {
  wcState,
  matchState,
  gameState,
  uiMode,
  matchResult,
  knockoutIntro,
  currentPlayerName,
  currentOpponentName,
  currentCharName,
  opponentSubPending,
  initWorldCup,
  handleSubstitution,
  handleSkipSubstitution,
  handlePlayerSubstitution,
  handleOpponentSubstitution,
  handleOpponentSkipSubstitution,
  continueAfterMatchResult,
  continueFromStandings,
  enterKnockoutStage,
  startKnockoutMatch,
  doPenaltyRound,
  finishPenalty,
  resetWorldCup,
  rebuildMatchContext,
  restoreWorldCup,
  markAIPlayer,
  setArtifacts,
  applyPlayerArtifact,
} = useWorldCupController();

/** 只读视图:AI 与子组件都读它 */
const view = reactive(buildView(gameState));
watch(
  () => gameState,
  () => Object.assign(view, buildView(gameState)),
  { deep: true },
);

/** view 的 index → 内核 uid */
const uidAt = (index) =>
  gameState.players.find((p) => p.index === index)?.uid ?? null;
const cast = (cmd) => dispatch(gameState, cmd);

// 世界杯模式下点击"保存并退出"按钮
function onWCSaveAndQuit() {
  const gameData = saveGame(gameState);
  const saveData = {
    gameState: gameData,
    gameMode: "worldcup",
  };
  handleWCSave(saveData);
}

// 世界杯存档：保存并退出
function handleWCSave(saveData) {
  // 附加世界杯设置信息
  saveData.wcSetup = {
    teamName: wcState.playerTeamName,
    selectedChar: wcState._lastPlayerChar,
    opponentNames:
      wcState.groupTeams?.filter((t) => !t.isPlayer).map((t) => t.name) || [],
    useWeather: props.useWeather,
    difficulty: props.difficulty,
    useAI: props.useAI,
    artifactId:
      gameState.players.find(
        (p) => p.characterId === matchState?.value?.playerCharId,
      )?.artifact.id ?? null,
    opponentArtifactId:
      gameState.players.find(
        (p) => p.characterId === matchState?.value?.opponentCharId,
      )?.artifact.id ?? null,
  };

  // 序列化锦标赛状态（仅可序列化字段，去除回调引用）
  saveData.wcState = {
    phase: wcState.phase,
    playerTeamName: wcState.playerTeamName,
    groupName: wcState.groupName,
    groupTeams: wcState.groupTeams,
    groupMatches: wcState.groupMatches,
    groupStandings: wcState.groupStandings,
    knockoutRound: wcState.knockoutRound,
    knockoutOpponent: wcState.knockoutOpponent,
    substitutionsLeft: wcState.substitutionsLeft,
    _lastPlayerChar: wcState._lastPlayerChar,
    _groupOpponentChars: wcState._groupOpponentChars,
    _groupFinished: wcState._groupFinished,
    _playerRank: wcState._playerRank,
    _advanced: wcState._advanced,
  };

  // 序列化比赛状态
  if (matchState.value) {
    const { _killedCharId, ...rest } = matchState.value;
    saveData.matchState = rest;
  }

  localStorage.setItem("dead13_save", JSON.stringify(saveData));
  emit("restart");
}

// 世界杯存档：从存档恢复
function restoreFromSave(saveData) {
  if (!saveData.wcState || !saveData.matchState) return;
  restoreWorldCup(saveData);
}

// 暴露给父组件
defineExpose({ initWorldCup, wcState, uiMode, restoreFromSave });

// GameShell ref（用于 DevLogPanel 5 连击 + 对手换人）
const gameShellRef = ref(null);

// 计分板 5 连击 → 打开 DevLogPanel
let sbClickCount = 0;
let sbClickTimer = null;

function onScoreboardClick() {
  sbClickCount++;
  if (sbClickTimer) clearTimeout(sbClickTimer);
  if (sbClickCount >= 5) {
    gameShellRef.value?.toggleDevLog();
    sbClickCount = 0;
  } else {
    sbClickTimer = setTimeout(() => {
      sbClickCount = 0;
    }, 1500);
  }
}

// 点球状态
const penaltyRound = ref(null);
const penaltyDone = ref(false);

// 比赛阶段标签
const stageLabel = computed(() => {
  if (matchState.value?.isGroupStage) {
    const played = wcState.groupMatches.filter(
      (m) => m.isPlayerMatch && m.played,
    ).length;
    return `小组赛 第${played + 1}/3场`;
  }
  if (wcState.knockoutRound) {
    return getKnockoutRoundName(wcState.knockoutRound);
  }
  return "";
});

// 对手角色名（用于换人 UI）
const opponentCharName = computed(() => {
  const charData = CHARACTERS[matchState.value?.opponentCharId];
  return charData?.name || "";
});

// 是否可以换人
const subsAvailable = computed(() => {
  if (!matchState.value) return false;
  return (
    matchState.value.substitutionPending &&
    wcState.substitutionsLeft > 0 &&
    !matchState.value.isGroupStage
  );
});

// 换人确认
function onSubConfirm(charId) {
  if (props.useAI) {
    handleSubstitution(charId);
  } else if (opponentSubPending.value) {
    handleOpponentSubstitution(charId);
  } else {
    handlePlayerSubstitution(charId);
  }
}

function onSubSkip() {
  if (props.useAI) {
    handleSkipSubstitution();
  } else if (opponentSubPending.value) {
    handleOpponentSkipSubstitution();
  } else {
    // 玩家跳过，轮到对手换人
    opponentSubPending.value = true;
  }
}

// 点球
function onPenaltyRound() {
  if (penaltyDone.value) return;
  const result = doPenaltyRound();
  if (result) {
    penaltyRound.value = result;
    if (result.winner !== null && result.winner !== undefined) {
      penaltyDone.value = true;
    }
  }
}

/** 点球结束后跳转到比赛结果 */
function onFinishPenalty() {
  finishPenalty();
}

// 继续
function onContinueAfterResult() {
  continueAfterMatchResult();
}

function onContinueFromStandings() {
  continueFromStandings();
}

function onStartKnockout() {
  startKnockoutMatch();
}

// ---- AI 自动操作 ----
let aiTimer = null;

function isAITurn() {
  if (!matchState.value) return false;
  const p = view.players[view.currentPlayerIndex];
  return !!p?.alive && !!p.isAI;
}

// ── 调度入口 ──

function scheduleAI() {
  if (aiTimer) clearTimeout(aiTimer);
  if (!props.useAI) return;
  // 不在比赛模式、游戏已结束、有人阵亡等待处理 → 都不触发
  if (uiMode.value !== "match" || view.gameOver) return;
  if (view.players.filter((p) => !p.alive).length > 0) return;
  if (view.step !== "pickAction" || !isAITurn()) return;
  aiTimer = setTimeout(aiAct, 600 + Math.random() * 600);
}

watch(() => view.currentPlayerIndex, scheduleAI, { immediate: true });
watch(() => view.step, scheduleAI, { immediate: true });

// ── 主决策 ──

function aiAct() {
  // 双保险：手动模式下已调度的 timer 也直接退出（防止读档时序问题）
  if (!props.useAI) return;
  if (view.step === "pickAction") {
    const decision = decideTopAction(view);
    gameState.devLog?.debug(
      CAT.AI,
      `AI决策: ${decision.action} (${decision.reason})`,
      {
        player: view.players[view.currentPlayerIndex]?.name,
        decision,
      },
    );
    executeTopAction(decision);
  } else {
    executeMiddleStep();
  }

  // 300ms 保底回退定时器
  aiTimer = setTimeout(() => {
    if (view.step !== "pickAction") return;
    if (!isAITurn() || view.gameOver) return;
    if (view.players.some((p) => !p.alive)) return;
    cast({ type: "defense" });
  }, 300);
}

// ── 顶层行动分发 ──

function executeTopAction(decision) {
  if (!props.useAI) return; // 手动模式中止链式调度
  switch (decision.action) {
    case "attack": {
      cast({ type: "attack" });
      aiTimer = setTimeout(() => {
        if (view.step === "attackShowCard") {
          const t = decideTarget(view, { action: "attack" });
          cast({ type: "attackTarget", targetUid: uidAt(t.targetIndex) });
        }
      }, 500);
      break;
    }
    case "defense":
      cast({ type: "defense" });
      break;
    case "gamble": {
      const lb = gameState.messageLog.length;
      cast({ type: "gamble" });
      aiSuppressLog(lb, "对手 执行赌命");
      aiTimer = setTimeout(() => {
        if (view.step === "gamblePick" && view.pendingGamble) {
          const g = decideGamblePick(view, view.pendingGamble.drawnCards);
          const lb2 = gameState.messageLog.length;
          cast({ type: "gambleSubmit", trapIdx: g.trapIdx, baitIdx: g.baitIdx });
          aiSuppressLog(lb2);
        }
      }, 400);
      break;
    }
    case "skill": {
      // 技能被内核拒绝(回合门槛/次数)时不要空转,直接转防御(KB-3)
      if (!view.players[view.currentPlayerIndex]?.canUseSkill) {
        cast({ type: "defense" });
        break;
      }
      cast({ type: "skill" });
      aiTimer = setTimeout(() => executeMiddleStep(), 400);
      break;
    }
  }
}

/** pending.purpose → 旧 AI 认识的技能标签 */
function skillTagOf(purpose) {
  if (purpose === "skill:furina") return "furina";
  if (purpose === "skill:aimiliya.freeze") return "aimiliya";
  if (purpose === "skill:fenjin") return "fenjin";
  return "raiden";
}

// ── 中间步骤自动完成 ──

function executeMiddleStep() {
  if (!props.useAI) return; // 手动模式中止链式调度
  const s = view.step;
  if (s === "pickAction") return;

  if (s === "attackShowCard") {
    const t = decideTarget(view, { action: "attack" });
    cast({ type: "attackTarget", targetUid: uidAt(t.targetIndex) });
  } else if (s === "gamblePick") {
    if (view.pendingGamble) {
      const g = decideGamblePick(view, view.pendingGamble.drawnCards);
      cast({ type: "gambleSubmit", trapIdx: g.trapIdx, baitIdx: g.baitIdx });
    }
  } else if (s === "skillPickTarget") {
    const kind = skillTagOf(view.pending?.purpose ?? "");
    const t = decideTarget(view, { action: "skill", characterId: kind });
    cast({ type: "skillAnswer", answer: uidAt(t.targetIndex) });
  } else if (s === "skillNahida") {
    const order = decideNahidaOrder(view, view.scryCards);
    cast({ type: "skillAnswer", answer: order });
  } else if (s === "liniyaPick") {
    const d = decideLiniyaChoice(view);
    cast({
      type: "skillAnswer",
      answer: { targetUid: uidAt(d.targetIndex), subSkill: d.subSkill },
    });
  } else if (s === "caiyueangPick") {
    const d = decideCaiyueangChoice(view);
    cast({ type: "skillAnswer", answer: { choice: d.choice } });
  } else if (s === "allyPick") {
    const t = decideTarget(view, { action: "ally" });
    cast({ type: "allyTarget", targetUid: uidAt(t.targetIndex) });
  } else {
    // 未知步骤保底
    cast({ type: "cancel" });
    cast({ type: "defense" });
  }
}

// ── 工具 ──

/** 隐藏 AI 战报：删除从 logBefore 开始的新增条目，可选替换消息 */
function aiSuppressLog(logBefore, replacement) {
  const added = gameState.messageLog.length - logBefore;
  if (added > 0) gameState.messageLog.splice(logBefore, added);
  if (replacement) gameState.messageLog.push(replacement);
}
</script>

<style scoped>
.wc-shell {
  min-height: 100vh;
}

/* 保存并退出按钮（世界杯模式专用） */
.wc-save-btn {
  position: fixed;
  top: max(50px, calc(env(safe-area-inset-top) + 38px));
  right: 12px;
  z-index: 25;
  background: rgba(255, 215, 0, 0.12);
  border: 1px solid rgba(255, 215, 0, 0.25);
  color: rgba(255, 215, 0, 0.7);
  font-size: 16px;
  cursor: pointer;
  border-radius: 8px;
  padding: 6px 10px;
  min-width: 44px;
  min-height: 44px;
  transition: all 0.15s;
}
@media (hover: hover) {
  .wc-save-btn:hover {
    background: rgba(255, 215, 0, 0.25);
    color: #ffd700;
  }
}
.wc-shell__overlay {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  justify-content: center;
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}

/* 点球 */
.wc-penalty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 100px 20px 40px;
  color: #fff;
  text-align: center;
  min-height: 100vh;
  background: radial-gradient(ellipse at center, #1a1a2e, #0a0a15);
}
.wc-penalty h2 {
  font-size: 24px;
  margin-bottom: 8px;
}
.wc-penalty__score {
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 20px;
}
.wc-penalty__round {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
  max-width: 400px;
  width: 100%;
}
.wc-penalty__cards {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 12px;
}
.wc-penalty__card {
  display: inline-block;
  background: #fff;
  color: #333;
  padding: 4px 10px;
  border-radius: 4px;
  margin: 2px;
  font-weight: bold;
  font-size: 14px;
}
.wc-penalty__sum {
  font-size: 18px;
  font-weight: bold;
  margin-top: 4px;
  color: #ffd54f;
}
.wc-penalty__vs {
  font-size: 20px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.3);
}
.wc-penalty__result {
  font-size: 16px;
  font-weight: bold;
}
.wc-penalty__result--win {
  color: #4caf50;
}
.wc-penalty__result--lose {
  color: #ef5350;
}

/* 结果 */
.wc-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #fff;
  text-align: center;
  min-height: 100vh;
  background: radial-gradient(ellipse at center, #1a1a2e, #0a0a15);
}
.wc-result__title {
  font-size: 20px;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.8);
}
.wc-result__score {
  font-size: 24px;
  margin-bottom: 12px;
}
.wc-result__score strong {
  font-size: 36px;
  margin: 0 8px;
}
.wc-result__verdict {
  font-size: 22px;
  font-weight: bold;
  margin-bottom: 8px;
}
.wc-result__verdict--win {
  color: #ffd54f;
}
.wc-result__verdict--lose {
  color: #ef5350;
}
.wc-result__verdict--draw {
  color: #ff9800;
}
.wc-result__eliminated {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 20px;
}
.wc-result__penalty {
  font-size: 14px;
  color: #ffd54f;
  margin-bottom: 8px;
  font-weight: bold;
}

/* 淘汰赛介绍 */
.wc-knockout-intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #fff;
  text-align: center;
  min-height: 100vh;
  background: radial-gradient(ellipse at center, #1a1a2e, #0a0a15);
}
.wc-knockout-intro h2 {
  font-size: 26px;
  margin-bottom: 16px;
}
.wc-knockout-intro__matchup {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 18px;
  margin-bottom: 8px;
}
.wc-knockout-intro__vs {
  font-size: 28px;
  font-weight: bold;
  color: #e53935;
}
.wc-knockout-intro__info {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 24px;
}

/* 结束 */
.wc-end {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #fff;
  text-align: center;
  min-height: 100vh;
  background: radial-gradient(ellipse at center, #1a1a2e, #0a0a15);
}
.wc-end h2 {
  font-size: 24px;
  margin-bottom: 12px;
}
.wc-end__champion {
  font-size: 18px;
  margin-bottom: 20px;
  color: #ffd54f;
}

/* 通用按钮 */
.wc-btn {
  padding: 14px 40px;
  background: linear-gradient(135deg, #ff8f00, #e53935);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 20px;
}
.wc-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(229, 57, 53, 0.4);
}
.wc-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.wc-btn--next {
  background: linear-gradient(135deg, #2e7d32, #4caf50);
}
.wc-btn--next:hover {
  box-shadow: 0 4px 16px rgba(76, 175, 80, 0.4);
}
</style>
