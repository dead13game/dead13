<template>
  <div class="wc-shell">
    <!-- 比赛进行中：显示游戏 + 记分牌 -->
    <template v-if="uiMode === 'match' || uiMode === 'substitution'">
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

      <!-- 游戏主界面 -->
      <GameShell
        :state="gameState"
        :world-cup-mode="true"
        @restart="resetWorldCup"
      />

      <!-- 换人面板（覆盖在游戏上方） -->
      <div v-if="uiMode === 'substitution'" class="wc-shell__overlay">
        <WorldCupSubstitution
          :current-char-id="matchState?.playerCharId || ''"
          :current-char-name="currentCharName"
          :opponent-char-id="matchState?.opponentCharId || ''"
          :subs-left="wcState.substitutionsLeft"
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
        <button class="wc-btn" @click="onPenaltyRound" :disabled="penaltyDone">
          {{ penaltyDone ? "点球结束" : "抽牌比点" }}
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
import { ref, computed, watch } from "vue";
import GameShell from "./GameShell.vue";
import WorldCupScoreboard from "./WorldCupScoreboard.vue";
import WorldCupSubstitution from "./WorldCupSubstitution.vue";
import WorldCupStandings from "./WorldCupStandings.vue";
import { useWorldCupController } from "../composables/useWorldCupController.js";
import { MATCH_CONFIG } from "../game/worldCupConstants.js";
import { getKnockoutRoundName } from "../game/worldCup.js";
import {
  startAttack,
  executeAttack,
  executeDefense,
  executeGamble,
  executeSkill,
  submitGamble,
  executeRaidenSkill,
  executeFurinaSwap,
  executeAimiliyaSkill,
  executeCaiyueangSave,
  executeLiniyaSkill,
  submitNahidaScry,
} from "../game/gameState.js";

const props = defineProps({
  useAI: { type: Boolean, default: true },
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
  initWorldCup,
  handleSubstitution,
  handleSkipSubstitution,
  continueAfterMatchResult,
  continueFromStandings,
  enterKnockoutStage,
  startKnockoutMatch,
  doPenaltyRound,
  resetWorldCup,
} = useWorldCupController();

// 暴露给父组件
defineExpose({ initWorldCup, wcState, uiMode });

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
  handleSubstitution(charId);
}

function onSubSkip() {
  handleSkipSubstitution();
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
  const p = gameState.players[gameState.currentPlayerIndex];
  return p?.alive && p.characterId !== matchState.value.playerCharId;
}

function getPlayerIndex() {
  const p = gameState.players.find(
    (p) => p.characterId === matchState.value?.playerCharId,
  );
  return p?.index ?? 0;
}

// ── 调度入口 ──

function scheduleAI() {
  if (aiTimer) clearTimeout(aiTimer);
  if (!props.useAI) return;
  // 不在比赛模式、游戏已结束、有人阵亡等待处理 → 都不触发
  if (uiMode.value !== "match" || gameState.gameOver) return;
  if (gameState.players.filter((p) => !p.alive).length > 0) return;
  if (gameState.step !== "pickAction" || !isAITurn()) return;
  aiTimer = setTimeout(aiAct, 600 + Math.random() * 600);
}

watch(() => gameState.currentPlayerIndex, scheduleAI, { immediate: true });
watch(() => gameState.step, scheduleAI, { immediate: true });

// ── 主决策 ──

function aiAct() {
  if (!isAITurn() || gameState.gameOver || gameState.step !== "pickAction")
    return;
  // 安全检查：有人阵亡时等待 matchContext 处理，不行动
  if (gameState.players.some((p) => !p.alive)) return;

  const canAttack = gameState.phase !== "peace";
  const player = gameState.players[gameState.currentPlayerIndex];
  const canSkill =
    player?.skillType === "active" &&
    player?.skillUses > 0 &&
    gameState.currentWeather !== "arms";

  const r = Math.random();
  if (r < 0.55 && canAttack) aiDoAttack();
  else if (r < 0.82) executeDefense(gameState);
  else if (r < 0.94) aiDoGamble();
  else if (canSkill) aiDoSkill();
  else executeDefense(gameState);

  // 回退：300ms 后仍在 pickAction 且无人阵亡则防御
  aiTimer = setTimeout(() => {
    if (gameState.step !== "pickAction") return;
    if (!isAITurn() || gameState.gameOver) return;
    if (gameState.players.some((p) => !p.alive)) return;
    executeDefense(gameState);
  }, 300);
}

// ── 各行动实现 ──

function aiDoAttack() {
  const targetIdx = getPlayerIndex();
  startAttack(gameState);
  aiTimer = setTimeout(() => {
    if (gameState.step === "attackShowCard")
      executeAttack(gameState, targetIdx);
  }, 500);
}

function aiDoGamble() {
  const targetIdx = getPlayerIndex(); // for auto-complete if needed
  gameState._skipAnim = true;
  const logBefore = gameState.messageLog.length;
  executeGamble(gameState);
  aiSuppressLog(logBefore, "对手 执行赌命");
  aiTimer = setTimeout(() => {
    if (
      gameState.step === "gamblePick" &&
      gameState.pendingGamble?.drawnCards?.length >= 2
    ) {
      const lb = gameState.messageLog.length;
      submitGamble(gameState, 0, 1);
      aiSuppressLog(lb);
    }
    gameState._skipAnim = false;
  }, 400);
}

function aiDoSkill() {
  const targetIdx = getPlayerIndex();
  executeSkill(gameState);
  aiTimer = setTimeout(() => aiAutoComplete(targetIdx), 400);
}

// ── 通用步骤自动完成 ──

/** 在 1v1 中自动完成任何需要选择的中间步骤。未知步骤取消回退 */
function aiAutoComplete(targetIdx) {
  const s = gameState.step;
  if (s === "pickAction") return;

  // 需要选目标的步骤（攻击展示、技能选目标）
  if (s === "attackShowCard") {
    executeAttack(gameState, targetIdx);
    return;
  }
  if (s === "skillPickTarget") {
    if (gameState.pendingFurinaTarget) executeFurinaSwap(gameState, targetIdx);
    else if (gameState._aimiliyaFreeze)
      executeAimiliyaSkill(gameState, targetIdx);
    else executeRaidenSkill(gameState, targetIdx);
    return;
  }
  // 角色特定步骤
  if (s === "caiyueangPick") {
    executeCaiyueangSave(gameState);
    return;
  }
  if (s === "liniyaPick") {
    executeLiniyaSkill(gameState, targetIdx, 2);
    return;
  }
  if (s === "skillNahida" && gameState.scryCards) {
    submitNahidaScry(
      gameState,
      gameState.scryCards.map((_, i) => i),
    );
    return;
  }

  // 未知步骤 → 清除中间状态 → 防御
  gameState.step = "pickAction";
  gameState.pendingFurinaTarget = false;
  gameState._aimiliyaFreeze = null;
  gameState._fenjinHeal = null;
  gameState._liniyaSubSkill = null;
  gameState._caiyueangMode = null;
  executeDefense(gameState);
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
</style>
