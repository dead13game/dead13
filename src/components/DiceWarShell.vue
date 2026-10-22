<template>
  <div class="dicewar">
    <header class="dw-header">
      <button class="dw-back" @click="onQuit">← 返回</button>
      <div class="dw-header__title">
        <span class="dw-logo">🎲</span>
        <div>
          <h2>娱乐模式 · {{ formatName }}</h2>
          <p v-if="phaseMeta">
            {{ phaseMeta.name }}
            <template v-if="match"> · {{ matchupLabel }}</template>
            <template v-if="seriesScore">
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
          <li>16 人随机配对，每轮胜者重新抽签：16强 → 8强 → 半决赛 → 决赛</li>
          <li>每局 30 轮：每轮先手、后手各掷一次骰子（2~12，模拟两个六面骰），自动累加总分</li>
          <li>每 10 轮一段输出数据对比（前段/中段/末段）；30 轮平局进入加赛，逐轮掷到分胜负</li>
          <li>每 10 轮 AI 解说员解说一次（需在「解说设置」填写密钥）</li>
          <li>局制：经典世锦赛（决赛七局四胜）／登神长阶（8进4 五局三胜 · 4进2 十一局六胜 · 决赛十九局十胜）</li>
        </ul>
      </div>
      <div class="dw-start-btns">
        <button class="dw-primary dw-primary--big" @click="onStartTournament('classic')">
          🎲 开始世锦赛
        </button>
        <button
          class="dw-primary dw-primary--big dw-primary--ladder"
          @click="onStartTournament('ladder')"
        >
          🏔 登神长阶
        </button>
      </div>
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
      <p v-if="isSeriesPhase" class="dw-hint">本阶段局制：{{ seriesRuleText }}，每局 30 轮。</p>
      <button class="dw-primary dw-primary--big" @click="onStartFirstMatch">
        🎲 开始{{ isSeriesPhase ? '第1局' : '第一场' }}
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
          <div v-if="seriesScore" class="dw-series-mini">
            {{ matchupLabel }} · 局分 {{ seriesScore.aWins }} - {{ seriesScore.bWins }}
          </div>
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
      <div
        v-if="match.phase === 'rollA' || match.phase === 'rollB'"
        class="dw-rollbar"
      >
        <button class="dw-primary dw-primary--mid" @click="onRoll">
          🎲 掷骰子（{{ match.phase === 'rollA' ? '先手 ' + match.a.name : '后手 ' + match.b.name }}）
        </button>
        <button
          class="dw-primary dw-primary--ten dw-primary--mid"
          @click="onRollTen"
          title="一次触发 20 次掷骰（快进 10 轮），最多推进到下一次 AI 解说点即止"
        >
          🔟 10连
        </button>
      </div>

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
        <template v-if="champion">
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
          <template v-if="seriesScore">
            <div class="dw-panel__line sets">
              系列赛大比分：{{ match.a.name }} {{ seriesScore.aWins }} - {{ seriesScore.bWins }}
              {{ match.b.name }}（{{ seriesRuleText }}）
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
      <p v-if="isSeriesPhase" class="dw-hint">{{ phaseMeta?.name }}局制：{{ seriesRuleText }}。</p>
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
          决赛大比分（{{ seriesRuleText }}） {{ seriesScore.aWins }} - {{ seriesScore.bWins }}
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
import { reactive, ref, computed, watch, nextTick, onMounted } from "vue";
import {
  ROSTER,
  PHASE_META,
  SEGMENT_NAMES,
  TOTAL_ROUNDS,
  SEGMENT_LEN,
  CHAMPIONS_HISTORY,
  FORMATS,
  createDiceWar,
  startTournament,
  startNextMatch,
  rollDice,
  rollDiceN,
  continueAfterSegment,
  getSegmentSummary,
  getMatchupLabel,
  getSeriesScore,
  getWinTarget,
  describeSeries,
  describeGap,
} from "../game/diceWar.js";
import { KIND, buildCommentaryRequest } from "../game/diceWarCommentator.js";
import SoundManager from "../audio/SoundManager.js";

const props = defineProps({
  restore: { type: Boolean, default: false },
});
const emit = defineEmits(["quit"]);

// 骰子世锦赛存档键（独立于经典/单机/模拟宇宙存档）
const SAVE_KEY = "dead13_dicewar_save";

// ---- 状态 ----
const dw = reactive(createDiceWar());
const uiMode = ref("setup"); // setup | matchups | match | phaseDone | champion
const advancersList = ref([]); // 上一阶段晋级名单快照
const prevPhaseName = ref("");
const rollFlash = ref(0); // 骰子弹跳动画 key

// 读档/初始化期间抑制解说统计 watch 的自动触发，改由装载逻辑按需触发
const isRestoring = ref(false);

// ---- 世锦赛存档 ----
function captureIndices() {
  return advancersList.value.map((p) => ROSTER.indexOf(p));
}
function gatherState() {
  return {
    uiMode: uiMode.value,
    advList: captureIndices(),
    prevPhaseName: prevPhaseName.value,
    dw: JSON.parse(JSON.stringify(dw)),
  };
}
function persistSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gatherState()));
  } catch {
    /* 存储满/不可用：忽略，不阻断游玩 */
  }
}
function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}
function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}
/** 载入存档，若找不到档或解析失败返回 false */
function loadPersisted() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    if (data && data.dw) {
      // 重建整棵状态，直接展开回 reactive dw（未知/旧档回退经典赛制）
      const fresh = createDiceWar(data.dw.format || "classic");
      Object.assign(fresh, data.dw);
      // 归一化旧存档：系列赛对象补齐局分字段，series 重新指向当前对阵
      fresh.matchups = (fresh.matchups || []).map((s) => ({
        a: s.a,
        b: s.b,
        aWins: s.aWins || 0,
        bWins: s.bWins || 0,
      }));
      fresh.series =
        fresh.matchIndex >= 0 && fresh.matchups[fresh.matchIndex]
          ? fresh.matchups[fresh.matchIndex]
          : null;
      isRestoring.value = true;
      Object.assign(dw, fresh);
      uiMode.value = data.uiMode || "setup";
      advancersList.value = (data.advList || []).map((i) => (ROSTER[i] ? ROSTER[i] : null)).filter(Boolean);
      prevPhaseName.value = data.prevPhaseName || "";
      isRestoring.value = false;
      return true;
    }
  } catch {
    /* 坏档：当作不存在 */
  }
  return false;
}
/** 载入后按挂起状态触发一次解说（读档恢复观感），成功后可从外部刷新 */
function refreshCommentaryIfHanging() {
  const m = dw.currentMatch;
  if (dw.champion != null && uiMode.value === "champion") {
    return KIND.CHAMPION;
  }
  if (m) {
    if (m.phase === "segment") {
      const seg = m.round / SEGMENT_LEN;
      return seg === 1 ? KIND.PRE : KIND.MID;
    }
    if (m.phase === "over") {
      return m.overtime ? KIND.OVERTIME : KIND.FINAL;
    }
  }
  return null;
}

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
const formatName = computed(() => (FORMATS[dw.format] || FORMATS.classic).name);
const seriesRuleText = computed(() => describeSeries(getWinTarget(dw)));
const isSeriesPhase = computed(() => getWinTarget(dw) > 1);
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
  if (isSeriesPhase.value) return `【${matchupLabel.value}结束】`;
  return m.overtime ? "【加赛结束】" : "【比赛结束】";
});
const resultText = computed(() => {
  const m = match.value;
  if (!m?.result) return "";
  const w = m.result.winnerName;
  if (isSeriesPhase.value) return `${w}拿下本局`;
  return m.overtime ? `${w}加赛胜出，晋级` : `${w}胜出，晋级`;
});
const nextButtonText = computed(() => {
  if (champion.value) return "查看冠军 🏆";
  if (isSeriesPhase.value) return "下一局 →";
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
function onStartTournament(format = "classic") {
  startTournament(dw, Math.random, format);
  commentary.value = { status: "idle", kind: "", text: "", error: "" };
  uiMode.value = "matchups";
  clearSave(); // 新一届取代旧档
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
  persistSave(); // 每掷一步留档，刷新/误退都不丢
}

function onRollTen() {
  SoundManager.play("click");
  const rolled = rollDiceN(dw, SEGMENT_LEN * 2); // 20 次掷 = 10 轮（10连）
  if (rolled > 0) rollFlash.value++;
  persistSave();
}

function onContinueSegment() {
  continueAfterSegment(dw);
}

function onNextMatch() {
  const prevPhase = dw.phase;
  const adv = [...dw.advancers];
  const next = startNextMatch(dw);
  if (next) {
    uiMode.value = "match";
    persistSave();
    return;
  }
  // startNextMatch 返回 null：锦标赛结束（冠军产生）或阶段已推进
  if (dw.champion != null) {
    uiMode.value = "champion";
    return; // 完赛跳转，不清档（退出时清）
  }
  // 阶段已推进：展示上一阶段晋级名单 + 新一轮对阵，开赛由「开始新一轮」触发
  advancersList.value = adv.map((i) => ROSTER[i]);
  prevPhaseName.value = PHASE_META[prevPhase].listTitle;
  uiMode.value = "phaseDone";
  persistSave();
}

function onRestart() {
  startTournament(dw);
  commentary.value = { status: "idle", kind: "", text: "", error: "" };
  uiMode.value = "matchups";
  clearSave();
}

function onQuit() {
  // 开场前无进度 → 清档；中途退出 → 自动留档；夺冠收官 → 清档（完成无需续）
  if (dw.phase) {
    if (dw.champion != null) clearSave();
    else persistSave();
  } else {
    clearSave();
  }
  emit("quit");
}

// ---- 观察：段间/结束/冠军 → 触发解说 ----
watch(
  () => dw.currentMatch?.phase,
  (ph) => {
    if (!ph) return;
    if (isRestoring.value) return; // 读档阶段，避免重复触发解/音效
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
    if (c != null && !isRestoring.value) triggerCommentary(KIND.CHAMPION);
  },
);

// ---- 装载入口：供「继续世锦赛」读档恢复现场 ----
onMounted(() => {
  if (!props.restore) return;
  const ok = loadPersisted();
  if (!ok) return;
  commentary.value = { status: "idle", kind: "", text: "", error: "" };
  // 读档后停留在解说挂起点（段间/结束/冠军）则重新请求一次解说，保持观感连贯
  nextTick(() => {
    const kind = refreshCommentaryIfHanging();
    if (kind) triggerCommentary(kind);
  });
});

</script>

<style scoped src="./dicewar/dicewar-shell.css"></style>
