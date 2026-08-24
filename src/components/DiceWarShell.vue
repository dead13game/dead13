<template>
  <div class="dicewar">
    <header class="dw-header">
      <button class="dw-back" @click="onQuit">← 返回</button>
      <div class="dw-header__title">
        <span class="dw-logo">🎲</span>
        <div>
          <h2>娱乐模式 · 骰子战争世锦赛</h2>
          <p v-if="phaseMeta">
            {{ phaseMeta.name }}
            <template v-if="match"> · {{ matchupLabel }}</template>
            <template v-if="isFinal && seriesScore">
              · 大比分 {{ seriesScore.aWins }} - {{ seriesScore.bWins }}
            </template>
          </p>
        </div>
      </div>
      <button class="dw-ai-btn" @click="showAISettings = true">🤖 解说设置</button>
    </header>

    <!-- 参赛名单 -->
    <section v-if="uiMode === 'setup'" class="dw-setup">
      <h3>参赛名单（16 人 · 原神 8 + 崩铁 8）</h3>
      <div class="dw-roster">
        <div v-for="(p, i) in ROSTER" :key="i" class="dw-roster__card">
          <img :src="p.icon" :alt="p.name" />
          <span class="dw-roster__name">{{ p.name }}</span>
          <span class="dw-roster__camp" :class="p.camp === '崩铁' ? 'is-hsr' : ''">
            {{ p.camp }}
          </span>
        </div>
      </div>
      <div class="dw-rules">
        <h4>规则速览</h4>
        <ul>
          <li>16 人随机配对，每轮胜者重新抽签：16强 → 8强 → 半决赛 → 决赛（七局四胜）</li>
          <li>每局 30 轮：每轮先手、后手各掷一次骰子（2~12，模拟两个六面骰），自动累加总分</li>
          <li>每 10 轮一段输出数据对比（前段/中段/末段）；30 轮平局进入加赛，逐轮掷到分胜负</li>
          <li>每 10 轮 AI 解说员解说一次（需在「解说设置」填写密钥）</li>
        </ul>
      </div>
      <button class="dw-primary dw-primary--big" @click="onStartTournament">
        🎲 开始世锦赛
      </button>
    </section>

    <!-- 对阵表 -->
    <section v-else-if="uiMode === 'matchups'" class="dw-matchups">
      <h3>⚔️ {{ phaseMeta?.matchupTitle }}</h3>
      <p class="dw-hint">对阵表写在前面的是先手，写在后面的就是后手</p>
      <div v-for="(mu, i) in dw.matchups" :key="i" class="dw-mu">
        <span class="dw-mu__idx">第{{ i + 1 }}场：</span>
        <span class="dw-mu__player">
          <img :src="ROSTER[mu.a].icon" :alt="ROSTER[mu.a].name" />
          {{ ROSTER[mu.a].name }}
        </span>
        <span class="dw-mu__vs">VS</span>
        <span class="dw-mu__player">
          {{ ROSTER[mu.b].name }}
          <img :src="ROSTER[mu.b].icon" :alt="ROSTER[mu.b].name" />
        </span>
      </div>
      <p v-if="isFinal" class="dw-hint">决赛采用七局四胜制，每局 30 轮。</p>
      <button class="dw-primary dw-primary--big" @click="onStartFirstMatch">
        🎲 开始第一场
      </button>
    </section>

    <!-- 赛场板 -->
    <section v-else-if="uiMode === 'match'" class="dw-arena">
      <div class="dw-scoreboard">
        <div class="dw-player" :class="{ 'is-current': match.phase === 'rollA' }">
          <span class="dw-player__role">先手</span>
          <img class="dw-player__avatar" :src="match.a.icon" :alt="match.a.name" />
          <div class="dw-player__name">{{ match.a.name }}</div>
          <div class="dw-player__camp" :class="match.a.camp === '崩铁' ? 'is-hsr' : ''">
            {{ match.a.camp }}
          </div>
          <div class="dw-player__score">{{ match.a.score }}</div>
          <div class="dw-player__dice">
            <span v-if="match.aRoll != null" :key="'a' + rollFlash" class="dw-dice dice-pop">
              {{ match.aRoll }}
            </span>
            <span v-else class="dw-dice dw-dice--idle">—</span>
          </div>
        </div>

        <div class="dw-center">
          <div class="dw-vs">VS</div>
          <div class="dw-round">第 {{ currentRound }} 轮</div>
          <div v-if="match.overtime" class="dw-overtime">⚡ 加赛</div>
          <div v-else class="dw-remain">剩 {{ Math.max(0, TOTAL_ROUNDS - match.round) }} 轮</div>
        </div>

        <div class="dw-player" :class="{ 'is-current': match.phase === 'rollB' }">
          <span class="dw-player__role">后手</span>
          <img class="dw-player__avatar" :src="match.b.icon" :alt="match.b.name" />
          <div class="dw-player__name">{{ match.b.name }}</div>
          <div class="dw-player__camp" :class="match.b.camp === '崩铁' ? 'is-hsr' : ''">
            {{ match.b.camp }}
          </div>
          <div class="dw-player__score">{{ match.b.score }}</div>
          <div class="dw-player__dice">
            <span v-if="match.bRoll != null" :key="'b' + rollFlash" class="dw-dice dice-pop">
              {{ match.bRoll }}
            </span>
            <span v-else class="dw-dice dw-dice--idle">
              {{ match.phase === 'rollB' ? '？' : '—' }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="match.lastRoll" class="dw-lastround">
        第{{ match.lastRoll.round }}轮：{{ match.a.name }} +{{ match.lastRoll.a }}，{{ match.b.name }}
        +{{ match.lastRoll.b }} | 总分 {{ match.a.score }} - {{ match.b.score }}
      </div>

      <div v-if="match.tieEntered" class="dw-tie-banner">
        【常规时间结束】双方战平，进入加赛 ⚡
      </div>

      <!-- 掷骰按钮 -->
      <button
        v-if="match.phase === 'rollA'"
        class="dw-primary dw-primary--big"
        @click="onRoll"
      >
        🎲 掷骰子吧（先手 {{ match.a.name }}）
      </button>
      <button
        v-else-if="match.phase === 'rollB'"
        class="dw-primary dw-primary--big"
        @click="onRoll"
      >
        🎲 掷骰子吧（后手 {{ match.b.name }}）
      </button>

      <!-- 段间对比 -->
      <div v-if="match.phase === 'segment'" class="dw-panel dw-panel--segment">
        <h3>{{ segTitle }}</h3>
        <div class="dw-panel__line big">
          {{ match.a.name }} {{ segSummary.totalA }} - {{ segSummary.totalB }}
          {{ match.b.name }}
        </div>
        <div class="dw-panel__line">
          段内得分：{{ match.a.name }} {{ segSummary.a }}，{{ match.b.name }}
          {{ segSummary.b }}
        </div>
        <div class="dw-panel__line">
          总分：{{ match.a.name }} {{ segSummary.totalA }}，{{ match.b.name }}
          {{ segSummary.totalB }}
        </div>
        <div class="dw-panel__line">分差：{{ gapText(match) }}</div>
        <button class="dw-primary" @click="onContinueSegment">继续 →</button>
      </div>

      <!-- 单局结束 -->
      <div v-if="match.phase === 'over'" class="dw-panel dw-panel--result">
        <h3>{{ resultTitle }}</h3>
        <template v-if="champion && isFinal">
          <div class="dw-panel__line big">
            {{ match.a.name }} {{ seriesScore.aWins }} - {{ seriesScore.bWins }}
            {{ match.b.name }}
          </div>
          <div class="dw-panel__line result">冠军：{{ champion.name }} 🏆</div>
          <div class="dw-panel__line sub">
            本局 {{ match.a.name }} {{ match.a.score }} - {{ match.b.score }}
            {{ match.b.name }}
          </div>
        </template>
        <template v-else>
          <div class="dw-panel__line big">
            {{ match.a.name }} {{ match.a.score }} - {{ match.b.score }}
            {{ match.b.name }}
          </div>
          <template v-if="!match.overtime">
            <div class="dw-panel__line">
              段内得分：{{ match.a.name }} {{ seg3.a }}，{{ match.b.name }} {{ seg3.b }}
            </div>
          </template>
          <div class="dw-panel__line result">结果：{{ resultText }}</div>
          <template v-if="isFinal && seriesScore">
            <div class="dw-panel__line sets">
              大比分：{{ match.a.name }} {{ seriesScore.aWins }} - {{ seriesScore.bWins }}
              {{ match.b.name }}
            </div>
          </template>
        </template>
        <button class="dw-primary dw-primary--big" @click="onNextMatch">
          {{ nextButtonText }}
        </button>
      </div>

      <!-- 解说框 -->
      <div class="dw-commentary">
        <div class="dw-commentary__head">
          🎙️ 赛场解说
          <span v-if="commentaryKindLabel" class="dw-commentary__kind">
            {{ commentaryKindLabel }}
          </span>
        </div>
        <div v-if="commentary.status === 'loading'" class="dw-commentary__loading">
          解说员正在酝酿… 🎲
        </div>
        <div v-else-if="commentary.status === 'done'" class="dw-commentary__text">
          {{ commentary.text }}
        </div>
        <div v-else-if="commentary.status === 'error'" class="dw-commentary__error">
          {{ commentary.error }}
          <button class="dw-ghost" @click="showAISettings = true">去设置</button>
        </div>
        <div v-else class="dw-commentary__idle">
          每完成 10 轮，解说员将基于赛场状态解说一段。
        </div>
      </div>
    </section>

    <!-- 晋级名单 + 下一轮对阵 -->
    <section v-else-if="uiMode === 'phaseDone'" class="dw-phase">
      <h3>🏅 {{ prevPhaseName }}</h3>
      <div class="dw-adv">
        <div v-for="(p, i) in advancersList" :key="i" class="dw-adv__card">
          <img :src="p.icon" :alt="p.name" />
          <span>{{ p.name }}</span>
          <em :class="p.camp === '崩铁' ? 'is-hsr' : ''">{{ p.camp }}</em>
        </div>
      </div>
      <h3>⚔️ {{ phaseMeta?.matchupTitle }}</h3>
      <p class="dw-hint">对阵表写在前面的是先手，写在后面的就是后手</p>
      <div v-for="(mu, i) in dw.matchups" :key="i" class="dw-mu">
        <span class="dw-mu__idx">第{{ i + 1 }}场：</span>
        <span class="dw-mu__player">
          <img :src="ROSTER[mu.a].icon" :alt="ROSTER[mu.a].name" />
          {{ ROSTER[mu.a].name }}
        </span>
        <span class="dw-mu__vs">VS</span>
        <span class="dw-mu__player">
          {{ ROSTER[mu.b].name }}
          <img :src="ROSTER[mu.b].icon" :alt="ROSTER[mu.b].name" />
        </span>
      </div>
      <p v-if="isFinal" class="dw-hint">决赛采用七局四胜制。</p>
      <button class="dw-primary dw-primary--big" @click="onStartFirstMatch">
        🎲 开始{{ isFinal ? '决赛' : '新一轮' }}
      </button>
    </section>

    <!-- 冠军 -->
    <section v-else-if="uiMode === 'champion'" class="dw-champion">
      <h2 class="dw-champion__title">👑 {{ champion.name }} 夺冠！</h2>
      <div class="dw-champion__card">
        <img :src="champion.icon" :alt="champion.name" />
        <div class="dw-champion__name">{{ champion.name }}</div>
        <div class="dw-champion__camp" :class="champion.camp === '崩铁' ? 'is-hsr' : ''">
          {{ champion.camp }}
        </div>
        <div v-if="seriesScore" class="dw-champion__score">
          决赛大比分 {{ seriesScore.aWins }} - {{ seriesScore.bWins }}
        </div>
      </div>
      <div class="dw-history">
        <h4>历届冠军</h4>
        <div class="dw-history__head"><span>届数</span><b>冠军</b><em>亚军</em></div>
        <div v-for="h in CHAMPIONS_HISTORY" :key="h.season" class="dw-history__row">
          <span>第{{ h.season }}届</span><b>{{ h.champion }}</b><em>{{ h.runnerUp }}</em>
        </div>
      </div>
      <div class="dw-actions">
        <button class="dw-primary dw-primary--big" @click="onRestart">🎲 再来一届</button>
        <button class="dw-ghost" @click="onQuit">返回主菜单</button>
      </div>
    </section>

    <!-- AI 解说设置弹窗 -->
    <div v-if="showAISettings" class="dw-modal-mask" @click.self="showAISettings = false">
      <div class="dw-modal">
        <h3>🤖 AI 解说设置</h3>
        <p class="dw-modal__tip">
          每 10 轮（一段）解说员将基于赛场状态调用你配置的 AI 接口生成解说词。密钥仅保存在本机浏览器
          localStorage，请求直接使用，不会上传到游戏服务器。
        </p>
        <label>
          接口地址（OpenAI 兼容 /chat/completions）
          <input v-model="aiSettings.endpoint" type="text" placeholder="https://api.deepseek.com/v1/chat/completions" />
        </label>
        <label>
          API 密钥
          <input v-model="aiSettings.apiKey" type="password" placeholder="sk-..." />
        </label>
        <label>
          模型名
          <input v-model="aiSettings.model" type="text" placeholder="deepseek-chat" />
        </label>
        <div class="dw-modal__actions">
          <button class="dw-ghost" @click="testAI">测试连接</button>
          <span v-if="aiTestResult" class="dw-modal__test">{{ aiTestResult }}</span>
        </div>
        <div class="dw-modal__actions">
          <button class="dw-ghost" @click="showAISettings = false">取消</button>
          <button class="dw-primary" @click="saveAISettings">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch } from "vue";
import {
  ROSTER,
  PHASE_META,
  SEGMENT_NAMES,
  TOTAL_ROUNDS,
  SEGMENT_LEN,
  CHAMPIONS_HISTORY,
  createDiceWar,
  startTournament,
  startNextMatch,
  rollDice,
  continueAfterSegment,
  getSegmentSummary,
  getMatchupLabel,
  getSeriesScore,
  describeGap,
} from "../game/diceWar.js";
import { KIND, buildCommentaryRequest } from "../game/diceWarCommentator.js";
import SoundManager from "../audio/SoundManager.js";

const emit = defineEmits(["quit"]);

// ---- 状态 ----
const dw = reactive(createDiceWar());
const uiMode = ref("setup"); // setup | matchups | match | phaseDone | champion
const advancersList = ref([]); // 上一阶段晋级名单快照
const prevPhaseName = ref("");
const rollFlash = ref(0); // 骰子弹跳动画 key

// ---- AI 解说 ----
const AI_DEFAULTS = {
  endpoint: "https://api.deepseek.com/v1/chat/completions",
  apiKey: "",
  model: "deepseek-chat",
};
const showAISettings = ref(false);
const aiSettings = ref(loadAISettings());
const aiTestResult = ref(null);
const commentary = ref({ status: "idle", kind: "", text: "", error: "" });
let reqSeq = 0; // 解说请求序号，防止旧响应覆盖新请求

function loadAISettings() {
  try {
    const raw = localStorage.getItem("dead13_ai_settings");
    if (raw) return { ...AI_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...AI_DEFAULTS };
}

function saveAISettings() {
  localStorage.setItem("dead13_ai_settings", JSON.stringify(aiSettings.value));
  showAISettings.value = false;
  aiTestResult.value = null;
}

async function testAI() {
  aiTestResult.value = null;
  const s = aiSettings.value;
  if (!s.apiKey) {
    aiTestResult.value = "请先填写密钥";
    return;
  }
  try {
    const res = await fetch(s.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${s.apiKey}`,
      },
      body: JSON.stringify({
        model: s.model,
        messages: [{ role: "user", content: "请只回复两个字：连接成功" }],
        max_tokens: 10,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    aiTestResult.value = text ? `✅ ${text}` : "✅ 连接成功（无返回内容）";
  } catch (e) {
    aiTestResult.value = `❌ ${e.message || e}`;
  }
}

async function triggerCommentary(kind) {
  const m = dw.currentMatch;
  if (!m) return;
  const seq = ++reqSeq;
  commentary.value = { status: "loading", kind, text: "", error: "" };

  const settings = aiSettings.value;
  if (!settings.apiKey || !settings.endpoint) {
    commentary.value = {
      status: "error",
      kind,
      text: "",
      error: "未配置 AI 密钥，点击右上角「解说设置」填写",
    };
    return;
  }
  const { system, user } = buildCommentaryRequest(dw, m, kind);
  try {
    const res = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 1.2,
        max_tokens: 300,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${errText.slice(0, 120)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error(data?.error?.message || "接口无返回内容");
    if (seq !== reqSeq) return;
    commentary.value = { status: "done", kind, text: text.trim(), error: "" };
  } catch (e) {
    if (seq !== reqSeq) return;
    commentary.value = {
      status: "error",
      kind,
      text: "",
      error: `AI 解说失败：${e.message || e}`,
    };
  }
}

// ---- 派生数据 ----
const phaseMeta = computed(() => (dw.phase ? PHASE_META[dw.phase] : null));
const match = computed(() => dw.currentMatch);
const seriesScore = computed(() => getSeriesScore(dw));
const matchupLabel = computed(() => getMatchupLabel(dw));
const isFinal = computed(() => dw.phase === "final");
const champion = computed(() =>
  dw.champion != null ? ROSTER[dw.champion] : null,
);
const currentRound = computed(() => (match.value ? match.value.round + 1 : 1));

const segSummary = computed(() => {
  const m = match.value;
  if (!m || m.phase !== "segment") return null;
  const seg = m.round / SEGMENT_LEN;
  return getSegmentSummary(m, seg);
});
const seg3 = computed(() => {
  const m = match.value;
  return m ? getSegmentSummary(m, 3) : null;
});
const segTitle = computed(() => {
  const m = match.value;
  if (!m) return "";
  const seg = m.round / SEGMENT_LEN;
  return `【${SEGMENT_NAMES[seg]}结束】`;
});
const resultTitle = computed(() => {
  const m = match.value;
  if (!m) return "";
  if (isFinal.value && champion.value) return "【决赛结束】";
  if (isFinal.value) return `【${matchupLabel.value}结束】`;
  return m.overtime ? "【加赛结束】" : "【比赛结束】";
});
const resultText = computed(() => {
  const m = match.value;
  if (!m?.result) return "";
  const w = m.result.winnerName;
  if (isFinal.value) return `${w}胜出`;
  return m.overtime ? `${w}加赛胜出，晋级` : `${w}胜出，晋级`;
});
const nextButtonText = computed(() => {
  if (isFinal.value) return champion.value ? "查看冠军 🏆" : "下一局 →";
  return "下一场 →";
});
const gapText = (m) => describeGap(m.a.name, m.a.score, m.b.name, m.b.score);

const KIND_LABELS = {
  [KIND.PRE]: "前段解说",
  [KIND.MID]: "中段解说",
  [KIND.FINAL]: "末段解说",
  [KIND.OVERTIME]: "加赛解说",
  [KIND.CHAMPION]: "冠军解说",
};
const commentaryKindLabel = computed(() => KIND_LABELS[commentary.value.kind] || "");

// ---- 动作 ----
function onStartTournament() {
  startTournament(dw);
  commentary.value = { status: "idle", kind: "", text: "", error: "" };
  uiMode.value = "matchups";
}

function onStartFirstMatch() {
  startNextMatch(dw);
  uiMode.value = "match";
}

function onRoll() {
  const r = rollDice(dw);
  if (!r) return;
  SoundManager.play("click");
  rollFlash.value++;
}

function onContinueSegment() {
  continueAfterSegment(dw);
}

function onNextMatch() {
  const prevPhase = dw.phase;
  const adv = [...dw.advancers];
  const next = startNextMatch(dw);
  if (!next) {
    uiMode.value = "champion";
    return;
  }
  if (dw.phase !== prevPhase) {
    // 上一阶段结束 → 展示晋级名单 + 新一轮对阵
    advancersList.value = adv.map((i) => ROSTER[i]);
    prevPhaseName.value = PHASE_META[prevPhase].listTitle;
    uiMode.value = "phaseDone";
  } else {
    uiMode.value = "match";
  }
}

function onRestart() {
  startTournament(dw);
  commentary.value = { status: "idle", kind: "", text: "", error: "" };
  uiMode.value = "matchups";
}

function onQuit() {
  emit("quit");
}

// ---- 观察：段间/结束/冠军 → 触发解说 ----
watch(
  () => dw.currentMatch?.phase,
  (ph) => {
    if (!ph) return;
    if (ph === "segment") {
      const seg = dw.currentMatch.round / SEGMENT_LEN;
      triggerCommentary(seg === 1 ? KIND.PRE : KIND.MID);
    } else if (ph === "over") {
      SoundManager.play("match_end");
      triggerCommentary(dw.currentMatch.overtime ? KIND.OVERTIME : KIND.FINAL);
    }
  },
);
watch(
  () => dw.champion,
  (c) => {
    if (c != null) triggerCommentary(KIND.CHAMPION);
  },
);
</script>

<style scoped>
.dicewar {
  max-width: 860px;
  margin: 0 auto;
  padding: 16px;
  color: #e8e8f0;
  min-height: 100vh;
}

/* 顶栏 */
.dw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 4px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 18px;
}
.dw-header__title {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
}
.dw-logo {
  font-size: 28px;
}
.dw-header__title h2 {
  font-size: 17px;
  color: #fff;
}
.dw-header__title p {
  font-size: 12px;
  color: #ffb74d;
  margin-top: 2px;
}
.dw-back,
.dw-ai-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e0e0e0;
  border-radius: 10px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  transition: all 0.2s;
}
.dw-back:hover,
.dw-ai-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}

/* 通用按钮 */
.dw-primary {
  background: linear-gradient(135deg, #ff8f00, #ff5722);
  border: none;
  color: #fff;
  font-size: 15px;
  font-weight: bold;
  border-radius: 12px;
  padding: 12px 22px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(255, 111, 0, 0.35);
  transition: all 0.2s;
  margin-top: 14px;
}
.dw-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 111, 0, 0.5);
}
.dw-primary--big {
  font-size: 17px;
  padding: 14px 30px;
}
.dw-ghost {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #cfcfcf;
  border-radius: 10px;
  padding: 9px 16px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.dw-ghost:hover {
  background: rgba(255, 255, 255, 0.14);
}

/* 名单 */
.dw-setup h3,
.dw-matchups h3,
.dw-phase h3,
.dw-champion h2 {
  color: #fff;
  margin-bottom: 14px;
  text-align: center;
}
.dw-roster {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
}
.dw-roster__card {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 10px 6px 8px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.dw-roster__card img {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 183, 77, 0.5);
}
.dw-roster__name {
  font-size: 13px;
  color: #fff;
  font-weight: bold;
}
.dw-roster__camp,
.dw-player__camp,
.dw-adv__card em,
.dw-champion__camp {
  font-size: 11px;
  color: #4fc3f7;
  font-style: normal;
  background: rgba(79, 195, 247, 0.15);
  border-radius: 20px;
  padding: 1px 10px;
}
.dw-roster__camp.is-hsr,
.dw-player__camp.is-hsr,
.dw-adv__card em.is-hsr,
.dw-champion__camp.is-hsr {
  color: #ff8a65;
  background: rgba(255, 138, 101, 0.15);
}

.dw-rules {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 14px 18px;
  margin: 16px 0 6px;
  text-align: left;
}
.dw-rules h4 {
  color: #ffb74d;
  font-size: 14px;
  margin-bottom: 8px;
}
.dw-rules li {
  font-size: 13px;
  line-height: 1.9;
  color: #c9c9d8;
}

/* 对阵表 */
.dw-hint {
  text-align: center;
  font-size: 12px;
  color: #9e9e9e;
  margin-bottom: 12px;
}
.dw-mu {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 8px;
  font-size: 14px;
}
.dw-mu__idx {
  color: #ffb74d;
  font-weight: bold;
  margin-right: 4px;
}
.dw-mu__player {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #fff;
  font-weight: bold;
}
.dw-mu__player img {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
}
.dw-mu__vs {
  color: #ff7043;
  font-weight: bold;
  font-size: 13px;
}

/* 赛场板 */
.dw-scoreboard {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 12px;
  margin: 8px 0 14px;
}
.dw-player {
  flex: 1;
  max-width: 280px;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 14px 10px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  transition: all 0.3s;
  position: relative;
}
.dw-player.is-current {
  border-color: #ffb74d;
  box-shadow: 0 0 24px rgba(255, 183, 77, 0.25);
}
.dw-player__role {
  position: absolute;
  top: 8px;
  left: 10px;
  font-size: 11px;
  color: #ffb74d;
  background: rgba(255, 183, 77, 0.15);
  padding: 1px 8px;
  border-radius: 20px;
}
.dw-player__avatar {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid rgba(255, 183, 77, 0.6);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
}
.dw-player__name {
  font-size: 18px;
  font-weight: bold;
  color: #fff;
}
.dw-player__score {
  font-size: 44px;
  font-weight: 900;
  line-height: 1.1;
  background: linear-gradient(135deg, #ffd54f, #ff8f00);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.dw-player__dice {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dw-dice {
  font-size: 30px;
  font-weight: 900;
  color: #fff;
  background: radial-gradient(circle at 35% 30%, #ffb74d, #e65100);
  border-radius: 12px;
  min-width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(230, 81, 0, 0.5);
}
.dw-dice--idle {
  background: rgba(255, 255, 255, 0.08);
  color: #777;
  box-shadow: none;
}
.dice-pop {
  animation: dicePop 0.45s cubic-bezier(0.2, 1.6, 0.4, 1);
}
@keyframes dicePop {
  0% {
    transform: scale(0.3) rotate(-30deg);
    opacity: 0;
  }
  100% {
    transform: scale(1) rotate(0);
    opacity: 1;
  }
}

.dw-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 74px;
}
.dw-vs {
  font-size: 26px;
  font-weight: 900;
  color: #ff7043;
  text-shadow: 0 0 18px rgba(255, 112, 67, 0.6);
}
.dw-round {
  font-size: 13px;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 3px 12px;
}
.dw-overtime {
  font-size: 13px;
  color: #ff1744;
  font-weight: bold;
  animation: pulse 1.2s ease-in-out infinite;
}
.dw-remain {
  font-size: 12px;
  color: #9e9e9e;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.dw-lastround {
  text-align: center;
  font-size: 13px;
  color: #cfcfcf;
  margin: 4px 0 10px;
}
.dw-tie-banner {
  text-align: center;
  font-size: 15px;
  font-weight: bold;
  color: #ffd54f;
  background: rgba(255, 213, 79, 0.12);
  border: 1px solid rgba(255, 213, 79, 0.35);
  border-radius: 10px;
  padding: 8px;
  margin-bottom: 10px;
  animation: pulse 1.2s ease-in-out infinite;
}

/* 面板（段间/结束） */
.dw-panel {
  background: rgba(10, 12, 30, 0.85);
  border: 1px solid rgba(255, 183, 77, 0.35);
  border-radius: 14px;
  padding: 18px;
  margin-top: 14px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.dw-panel h3 {
  color: #ffb74d;
  font-size: 18px;
  margin-bottom: 12px;
}
.dw-panel__line {
  font-size: 14px;
  color: #d8d8e4;
  line-height: 2;
}
.dw-panel__line.big {
  font-size: 22px;
  font-weight: 900;
  color: #fff;
}
.dw-panel__line.result {
  color: #ffd54f;
  font-weight: bold;
}
.dw-panel__line.sets {
  color: #4fc3f7;
  font-weight: bold;
}
.dw-panel__line.sub {
  font-size: 12px;
  color: #9e9e9e;
}

/* 解说框 */
.dw-commentary {
  margin-top: 16px;
  background: linear-gradient(160deg, rgba(30, 22, 60, 0.9), rgba(16, 14, 40, 0.9));
  border: 1px solid rgba(180, 130, 255, 0.3);
  border-radius: 14px;
  padding: 14px 18px;
  text-align: left;
}
.dw-commentary__head {
  color: #b388ff;
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 8px;
}
.dw-commentary__kind {
  font-size: 11px;
  color: #9575cd;
  background: rgba(149, 117, 205, 0.18);
  border-radius: 20px;
  padding: 1px 10px;
  margin-left: 6px;
}
.dw-commentary__loading {
  color: #b388ff;
  font-size: 14px;
  animation: pulse 1s ease-in-out infinite;
}
.dw-commentary__text {
  color: #f0eaff;
  font-size: 14px;
  line-height: 1.9;
}
.dw-commentary__idle {
  color: #8e8e9e;
  font-size: 13px;
}
.dw-commentary__error {
  color: #ff8a80;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* 晋级名单 */
.dw-adv {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
  margin-bottom: 22px;
}
.dw-adv__card {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 10px 6px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.dw-adv__card img {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 183, 77, 0.5);
}
.dw-adv__card span {
  font-size: 13px;
  color: #fff;
  font-weight: bold;
}

/* 冠军 */
.dw-champion__title {
  font-size: 26px;
  background: linear-gradient(135deg, #ffd54f, #ff8f00, #ff5722);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 18px;
}
.dw-champion__card {
  background: linear-gradient(160deg, rgba(255, 183, 77, 0.15), rgba(255, 87, 34, 0.08));
  border: 2px solid rgba(255, 183, 77, 0.5);
  border-radius: 18px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}
.dw-champion__card img {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;
  border: 4px solid rgba(255, 213, 79, 0.8);
  box-shadow: 0 0 40px rgba(255, 183, 77, 0.5);
}
.dw-champion__name {
  font-size: 24px;
  font-weight: 900;
  color: #fff;
}
.dw-champion__score {
  font-size: 14px;
  color: #ffd54f;
  font-weight: bold;
}

.dw-history {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 20px;
}
.dw-history h4 {
  color: #ffb74d;
  font-size: 14px;
  margin-bottom: 8px;
  text-align: center;
}
.dw-history__head,
.dw-history__row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  font-size: 13px;
  padding: 3px 0;
  text-align: center;
}
.dw-history__head {
  color: #9e9e9e;
  font-size: 12px;
}
.dw-history__row b {
  color: #ffd54f;
}
.dw-history__row em {
  color: #bdbdbd;
  font-style: normal;
}
.dw-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

/* 弹窗 */
.dw-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.dw-modal {
  background: #1a1a2e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 22px;
  max-width: 460px;
  width: 100%;
  color: #e0e0e0;
}
.dw-modal h3 {
  color: #ffb74d;
  margin-bottom: 8px;
  font-size: 17px;
}
.dw-modal__tip {
  font-size: 12px;
  color: #9e9e9e;
  line-height: 1.8;
  margin-bottom: 14px;
}
.dw-modal label {
  display: block;
  font-size: 13px;
  color: #cfcfcf;
  margin-bottom: 12px;
}
.dw-modal input {
  width: 100%;
  margin-top: 6px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 9px 12px;
  color: #fff;
  font-size: 13px;
  outline: none;
}
.dw-modal input:focus {
  border-color: #ffb74d;
}
.dw-modal__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}
.dw-modal__actions .dw-primary {
  margin-top: 0;
}
.dw-modal__test {
  font-size: 12px;
  color: #aed581;
}

@media (max-width: 600px) {
  .dw-player__avatar {
    width: 68px;
    height: 68px;
  }
  .dw-player__score {
    font-size: 34px;
  }
  .dw-dice {
    font-size: 24px;
    min-width: 40px;
    height: 40px;
  }
}
</style>
