<template>
  <div class="brawl">
    <!-- ════════════════ 设置 ════════════════ -->
    <section v-if="uiMode === 'setup'" class="setup-screen">
      <button class="back-btn" @click="$emit('restart')">← 主菜单</button>
      <div class="setup-screen__glow setup-screen__glow--a"></div>
      <div class="setup-screen__glow setup-screen__glow--b"></div>
      <div class="setup-card">
        <p class="eyebrow">DEAD 13 · NEW MODE</p>
        <h1 class="setup-title">3v3 团战推塔</h1>
        <p class="setup-lead">
          六名英雄 · 每队五座塔 · 六十回合<br />
          拆光对面，或者活到最后。
        </p>

        <div class="setup-grid">
          <button
            class="setup-tile"
            :class="{ 'setup-tile--active': setup.opponentMode === 'ai' }"
            @click="setup.opponentMode = 'ai'"
          >
            <span class="setup-tile__icon">🤖</span>
            <b>单人 vs AI</b>
            <small>简单随机 AI · 随时可调</small>
          </button>
          <button
            class="setup-tile"
            :class="{ 'setup-tile--active': setup.opponentMode === 'hotseat' }"
            @click="setup.opponentMode = 'hotseat'"
          >
            <span class="setup-tile__icon">👥</span>
            <b>同屏双人</b>
            <small>轮流操作 · 共享一块屏幕</small>
          </button>
        </div>

        <div class="setup-line">
          <span class="setup-line__label">天气</span>
          <div class="segmented">
            <button
              :class="{ on: setup.weather }"
              @click="setup.weather = true"
            >
              开启
            </button>
            <button
              :class="{ on: !setup.weather }"
              @click="setup.weather = false"
            >
              关闭
            </button>
          </div>
        </div>

        <div class="setup-line setup-line--artifacts">
          <span class="setup-line__label">蓝方圣遗物（可选）</span>
          <div class="artifact-row">
            <label v-for="i in 3" :key="'art-' + i" class="artifact-slot">
              <span class="artifact-slot__no">{{ i }}</span>
              <select v-model="setup.artifacts.player[i - 1]">
                <option :value="null">不带</option>
                <option :value="1">⚔ 角斗士</option>
                <option :value="2">🎵 乐团</option>
              </select>
            </label>
          </div>
        </div>

        <div
          v-if="setup.opponentMode === 'hotseat'"
          class="setup-line setup-line--artifacts"
        >
          <span class="setup-line__label">红方圣遗物（可选）</span>
          <div class="artifact-row">
            <label v-for="i in 3" :key="'art-o-' + i" class="artifact-slot">
              <span class="artifact-slot__no">{{ i }}</span>
              <select v-model="setup.artifacts.opponent[i - 1]">
                <option :value="null">不带</option>
                <option :value="1">⚔ 角斗士</option>
                <option :value="2">🎵 乐团</option>
              </select>
            </label>
          </div>
        </div>

        <button class="cta" @click="onStartDraft">
          <span>进入 Ban / Pick</span>
          <em>→</em>
        </button>
        <p class="setup-foot">
          15 名角色 · 双方各 Ban 2 选 3 · 先 Ban 后选
        </p>
      </div>
    </section>

    <!-- ════════════════ Ban/Pick ════════════════ -->
    <section v-else-if="uiMode === 'draft'" class="draft-screen">
      <button class="back-btn" @click="$emit('restart')">← 主菜单</button>
      <header class="draft-head">
        <div>
          <p class="eyebrow">BAN / PICK</p>
          <h1 class="draft-title">{{ draftStepLabel }}</h1>
        </div>
        <div class="draft-phase">
          <span
            class="draft-phase__side"
            :class="[
              currentDraftStep?.side === 0
                ? 'draft-phase__side--blue'
                : 'draft-phase__side--red',
            ]"
          >
            {{ currentDraftStep ? sideName(currentDraftStep.side) : "完成" }}
          </span>
          <span class="draft-phase__action">
            {{ currentDraftStep ? (currentDraftStep.type === "ban" ? "禁用" : "选择") : "已就绪" }}
          </span>
          <span class="draft-phase__count">
            {{ Math.min(draft.stepIndex + 1, 10) }} / 10
          </span>
        </div>
      </header>

      <div class="draft-lineups">
        <div class="lineup lineup--blue">
          <span class="lineup__label">{{ playerTeamName }}</span>
          <div class="lineup__cards">
            <div v-for="id in draft.picks[0]" :key="'p0-' + id" class="mini-card">
              <img v-if="draftMeta(id)?.icon" :src="draftMeta(id).icon" />
              <span class="mini-card__fallback">{{ charName(id).slice(0, 1) }}</span>
              <em>{{ charName(id) }}</em>
            </div>
            <div
              v-for="i in Math.max(0, 3 - draft.picks[0].length)"
              :key="'p0-empty-' + i"
              class="mini-card mini-card--empty"
            >
              ?
            </div>
          </div>
        </div>
        <div class="lineup vs-lineup">VS</div>
        <div class="lineup lineup--red">
          <span class="lineup__label">{{ opponentTeamName }}</span>
          <div class="lineup__cards">
            <div v-for="id in draft.picks[1]" :key="'p1-' + id" class="mini-card">
              <img v-if="draftMeta(id)?.icon" :src="draftMeta(id).icon" />
              <span class="mini-card__fallback">{{ charName(id).slice(0, 1) }}</span>
              <em>{{ charName(id) }}</em>
            </div>
            <div
              v-for="i in Math.max(0, 3 - draft.picks[1].length)"
              :key="'p1-empty-' + i"
              class="mini-card mini-card--empty"
            >
              ?
            </div>
          </div>
        </div>
      </div>

      <div class="draft-grid">
        <button
          v-for="id in allCharIds"
          :key="'char-' + id"
          class="draft-card"
          :class="{
            'draft-card--banned': bannedIds.includes(id),
            'draft-card--picked': pickedIds.includes(id),
            'draft-card--active': availableIds.includes(id),
            'draft-card--ai-turn': isAiDraftTurn,
          }"
          :disabled="!availableIds.includes(id) || isAiDraftTurn"
          @click="onDraftClick(id)"
        >
          <div class="draft-card__art">
            <img
              v-if="draftMeta(id)?.icon"
              :src="draftMeta(id).icon"
              :alt="charName(id)"
              loading="lazy"
            />
            <span v-else class="draft-card__fallback">{{
              charName(id).slice(0, 1)
            }}</span>
            <div class="draft-card__shade"></div>
          </div>
          <div class="draft-card__meta">
            <b>{{ charName(id) }}</b>
            <small>{{ draftMeta(id)?.title || "亡命十三街" }}</small>
          </div>
          <span v-if="bannedIds.includes(id)" class="stamp stamp--ban">
            BAN
          </span>
          <span
            v-else-if="pickedIds.includes(id)"
            class="stamp"
            :class="
              draft.picks[0].includes(id) ? 'stamp--blue' : 'stamp--red'
            "
          >
            {{ draft.picks[0].includes(id) ? "蓝方" : "红方" }}
          </span>
          <span v-else class="draft-card__hover">点击{{ currentDraftStep?.type === "ban" ? "禁用" : "选择" }}</span>
        </button>
      </div>

      <div v-if="isAiDraftTurn" class="draft-ai">
        <span class="draft-ai__dot"></span> AI 正在思考…
      </div>

      <footer v-if="draftFinished" class="draft-foot">
        <button class="cta" @click="onStartMatch">
          <span>进入战场</span><em>⚔</em>
        </button>
      </footer>
    </section>

    <!-- ════════════════ 对局 ════════════════ -->
    <section v-else-if="uiMode === 'match'" class="match-screen">
      <header class="hud">
        <div class="hud__round">
          <span class="hud__cap">ROUND</span>
          <b>{{ view.round }}</b>
          <small>/ {{ BRAWL_CONFIG.maxRounds }}</small>
          <i :style="{ width: roundPct + '%' }"></i>
        </div>
        <div class="hud__weather" :title="weatherName(view.currentWeather)">
          <span class="hud__weather-icon">{{ weatherIcon(view.currentWeather) }}</span>
          <span class="hud__weather-text">
            <b>{{ weatherName(view.currentWeather) }}</b>
            <em v-if="view.nextWeather"
              >下回合 {{ weatherName(view.nextWeather) }}</em
            >
          </span>
        </div>
        <span v-if="view.phase === 'peace'" class="hud__peace">
          🕊 和平期 {{ Math.min(view.round, 4) }}/4
        </span>
        <div class="hud__turn">
          <span class="hud__turn-dot"></span>
          <span>{{ currentHero?.name || "-" }}</span>
          <em v-if="isAiTurn">AI</em>
        </div>
        <button class="hud__save" title="保存并退出" @click="onSaveAndQuit">
          💾
        </button>
      </header>

      <div class="tug">
        <span class="tug__name tug__name--blue">{{ playerTeamName }}</span>
        <div class="tug__track" title="双方总血量（英雄 + 塔）">
          <i class="tug__fill tug__fill--blue" :style="{ width: tugPct + '%' }"></i>
          <i
            class="tug__fill tug__fill--red"
            :style="{ width: 100 - tugPct + '%' }"
          ></i>
          <span class="tug__center"></span>
        </div>
        <span class="tug__name tug__name--red">{{ opponentTeamName }}</span>
      </div>

      <div class="arena">
        <!-- 敌方 -->
        <div class="lane lane--enemy">
          <div class="lane__label">
            <span>{{ opponentTeamName }}</span>
            <em>敌方阵地</em>
          </div>
          <div class="towers">
            <BrawlTowerCard
              v-for="t in enemyTowers"
              :key="'et-' + t.uid"
              :tower="t"
              :attackable="t.uid === attackableTowerUid"
              :current="isCurrent(t)"
            />
          </div>
          <div class="heroes">
            <BrawlHeroCard
              v-for="h in enemyHeroes"
              :key="'eh-' + h.uid"
              :unit="h"
              :char-data="charDataOf(h)"
              :current="isCurrent(h)"
            />
          </div>
        </div>

        <!-- 中央 -->
        <div class="arena__center">
          <div class="arena__vs">
            <span>VS</span>
            <em>#{{ view.round }}</em>
          </div>
          <div ref="logRef" class="battle-log">
            <p
              v-for="(m, i) in logLines"
              :key="'log-' + i"
              class="battle-log__line"
              :class="{ 'battle-log__line--new': i === logLines.length - 1 }"
            >
              {{ m }}
            </p>
          </div>
        </div>

        <!-- 我方 -->
        <div class="lane lane--player">
          <div class="heroes">
            <BrawlHeroCard
              v-for="h in playerHeroes"
              :key="'ph-' + h.uid"
              :unit="h"
              :char-data="charDataOf(h)"
              :current="isCurrent(h)"
            />
          </div>
          <div class="towers">
            <BrawlTowerCard
              v-for="t in playerTowers"
              :key="'pt-' + t.uid"
              :tower="t"
              :attackable="t.uid === attackableTowerUid"
              :current="isCurrent(t)"
            />
          </div>
          <div class="lane__label lane__label--player">
            <span>{{ playerTeamName }}</span>
            <em>我方阵地</em>
          </div>
        </div>
      </div>

      <Transition name="draw-pop">
        <div
          v-if="drawToast"
          :key="'draw-' + drawToast.seq"
          class="draw-toast"
        >
          <div class="draw-toast__label">{{ drawLabel(drawToast) }}</div>
          <div class="draw-toast__cards">
            <Card
              v-for="(c, i) in drawToastCards"
              :key="'dc-' + i"
              :card="c"
              :always-face-up="!drawToast.hidden"
              class="draw-toast__card"
            />
          </div>
        </div>
      </Transition>

      <div class="dock">
        <div v-if="isAiTurn" class="dock__ai">
          <span class="dock__ai-dot"></span> 红方思考中…
        </div>
        <ActionBar
          v-else-if="!view.gameOver"
          :state="view"
          :league-mode="true"
          :disabled="isAiTurn"
          :reveal-draw="true"
          @attack="onAttack"
          @defense="onDefense"
          @gamble="onGamble"
          @skill="onSkill"
          @holyWord="onHolyWord"
          @target="onTarget"
          @skillTarget="onSkillTarget"
          @liniyaSkill="onLiniyaSkill"
          @caiyueangSave="onCaiyueangSave"
          @caiyueangLoad="onCaiyueangLoad"
          @gambleSubmit="onGambleSubmit"
          @nahidaOrder="onNahidaOrder"
          @cancel="onCancel"
        />
      </div>
    </section>

    <!-- ════════════════ 结算 ════════════════ -->
    <section
      v-else
      class="result-screen"
      :class="
        result?.winnerTeam === 0
          ? 'result-screen--win'
          : result?.winnerTeam === 1
            ? 'result-screen--lose'
            : 'result-screen--draw'
      "
    >
      <p class="eyebrow">BATTLE RESULT</p>
      <h1 class="result-title">
        {{
          result?.winnerTeam === 0
            ? "胜 利"
            : result?.winnerTeam === 1
              ? "败 北"
              : "平 局"
        }}
      </h1>
      <p class="result-reason">{{ result?.reason || "对局结束" }}</p>

      <div class="result-stats">
        <div class="result-stat">
          <span>拆塔</span>
          <b
            >{{ 5 - playerTowers.filter((t) => t.alive).length }}
            <em>:</em>
            {{ 5 - enemyTowers.filter((t) => t.alive).length }}</b
          >
          <small>蓝方 : 红方</small>
        </div>
        <div class="result-stat">
          <span>存活英雄</span>
          <b
            >{{ playerHeroes.filter((h) => h.alive).length }}
            <em>:</em>
            {{ enemyHeroes.filter((h) => h.alive).length }}</b
          >
          <small>蓝方 : 红方</small>
        </div>
        <div class="result-stat">
          <span>总血量</span>
          <b>{{ totalHp(0) }} <em>:</em> {{ totalHp(1) }}</b>
          <small>含防御塔</small>
        </div>
      </div>

      <div class="result-actions">
        <button class="cta" @click="onRematch"><span>再来一局</span><em>↻</em></button>
        <button class="cta cta--ghost" @click="$emit('restart')">
          <span>返回主菜单</span>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import ActionBar from "./ActionBar.vue";
import Card from "./Card.vue";
import BrawlHeroCard from "./BrawlHeroCard.vue";
import BrawlTowerCard from "./BrawlTowerCard.vue";
import {
  useBrawlController,
  BRAWL_CONFIG,
} from "../composables/useBrawlController.js";
import { buildView } from "../game/view.js";
import { dispatch } from "../game/api.js";
import { WEATHER_DATA } from "../game/rules/weather.js";

const emit = defineEmits(["restart", "saveAndQuit"]);

const {
  gameState,
  uiMode,
  setup,
  draft,
  allCharIds,
  bannedIds,
  pickedIds,
  availableIds,
  currentDraftStep,
  draftFinished,
  isAiDraftTurn,
  playerTeamName,
  opponentTeamName,
  result,
  getCharacter,
  startDraft,
  draftAction,
  aiDraftAction,
  startMatch,
  checkResult,
  saveBrawl,
  restoreBrawl,
  resetBrawl,
} = useBrawlController();

/** 只读视图 */
const view = reactive(buildView(gameState));
watch(
  () => gameState,
  () => Object.assign(view, buildView(gameState)),
  { deep: true },
);

const cast = (cmd) => dispatch(gameState, cmd);

// ---- 设置 / 选人 ----
function onStartDraft() {
  startDraft();
}

function charName(id) {
  return getCharacter(id)?.meta?.name ?? `#${id}`;
}
function draftMeta(id) {
  return getCharacter(id)?.meta ?? null;
}
function sideName(side) {
  return side === 0 ? playerTeamName.value : opponentTeamName.value;
}

const draftStepLabel = computed(() => {
  const step = currentDraftStep.value;
  if (!step) return "Ban/Pick 完成";
  return `${sideName(step.side)} · ${step.type === "ban" ? "禁用" : "选择"}`;
});

function onDraftClick(id) {
  if (isAiDraftTurn.value) return;
  draftAction(id);
}

function onStartMatch() {
  startMatch();
  nextTick(() => scheduleAI());
}

/** AI 自动 Ban/Pick */
let draftTimer = null;
watch(
  () => [uiMode.value, draft.stepIndex],
  () => {
    if (draftTimer) clearTimeout(draftTimer);
    if (uiMode.value !== "draft") return;
    if (!isAiDraftTurn.value) return;
    draftTimer = setTimeout(() => {
      aiDraftAction();
    }, 450);
  },
  { immediate: true },
);

// ---- 棋盘 ----
const playerTowers = computed(() => view.towers.filter((t) => t.teamId === 0));
const enemyTowers = computed(() => view.towers.filter((t) => t.teamId === 1));
const playerHeroes = computed(() => view.players.filter((p) => p.teamId === 0));
const enemyHeroes = computed(() => view.players.filter((p) => p.teamId === 1));
const currentHero = computed(() => view.currentPlayer());

// ---- 战报滚动 ----
const logRef = ref(null);
const logLines = computed(() => (view.messageLog || []).slice(-200));
function scrollLogToBottom() {
  const el = logRef.value;
  if (el) el.scrollTop = el.scrollHeight;
}
watch(
  () => view.messageLog.length,
  () => nextTick(scrollLogToBottom),
  { flush: "post" },
);
onMounted(scrollLogToBottom);

// ---- 抽牌动画 ----
const drawToast = ref(null);
let drawTimer = null;
watch(
  () => view.drawSeq ?? 0,
  () => {
    const feed = view.drawFeed || [];
    const entry = feed[feed.length - 1];
    if (!entry) return;
    // AI 的摸牌不公开（防御/赌命牌应保持隐藏）
    const actor = entry.actorUid ? view.unitByUid(entry.actorUid) : null;
    if (setup.opponentMode === "ai" && actor?.teamId === 1) return;
    drawToast.value = entry;
    if (drawTimer) clearTimeout(drawTimer);
    drawTimer = setTimeout(() => {
      drawToast.value = null;
    }, 1900);
  },
);

function drawLabel(entry) {
  const who = entry.actorUid
    ? view.unitByUid(entry.actorUid)?.name || ""
    : "";
  const kind = {
    attack: "攻击摸牌",
    defense: "防御摸牌（暗牌）",
    gamble: "赌命摸牌",
    "drone-defense": "无人机防御摸牌（暗牌）",
    venti: "千风之诗摸牌",
  }[entry.kind] ?? "摸牌";
  return who ? `${who} · ${kind}` : kind;
}

/** 防御摸牌保持牌背：双方都不应看到防御牌点数 */
const drawToastCards = computed(() =>
  (drawToast.value?.cards ?? []).map((c) => ({
    ...c,
    faceUp: !drawToast.value?.hidden,
  })),
);

const charDataOf = (u) =>
  view.CHARACTERS?.[u.characterId] ?? getCharacter(u.characterId)?.meta ?? null;

function isCurrent(u) {
  return u.index === view.currentPlayerIndex && uiMode.value === "match";
}

const roundPct = computed(() =>
  Math.max(0, Math.min(100, (view.round / BRAWL_CONFIG.maxRounds) * 100)),
);

/** 当前行动方的敌方「可攻击塔」 */
const attackableTowerUid = computed(() => {
  if (view.phase === "peace") return null;
  const p = currentHero.value;
  if (!p) return null;
  const enemyTeam = p.teamId === 0 ? 1 : 0;
  return (
    view.towers
      .filter((t) => t.teamId === enemyTeam && t.alive)
      .sort((a, b) => a.towerIndex - b.towerIndex)[0]?.uid ?? null
  );
});

const tugPct = computed(() => {
  const a = totalHp(0);
  const b = totalHp(1);
  if (a + b <= 0) return 50;
  return Math.max(4, Math.min(96, (a / (a + b)) * 100));
});

function totalHp(team) {
  const heroes = team === 0 ? playerHeroes.value : enemyHeroes.value;
  const towers = team === 0 ? playerTowers.value : enemyTowers.value;
  return (
    heroes.reduce((s, p) => s + Math.max(0, p.hp), 0) +
    towers.reduce((s, t) => s + Math.max(0, t.hp), 0)
  );
}

function weatherName(id) {
  if (!id) return "待变";
  return WEATHER_DATA[id]?.name ?? "待变";
}
function weatherIcon(id) {
  return (
    {
      sun: "☀️",
      rain: "🌧️",
      wind: "🌪️",
      trade: "🪙",
      arms: "⚔️",
      calm: "🌤️",
    }[id] ?? "🌤️"
  );
}

// ---- 动作 ----
function unitIndexToUid(index) {
  return view.units.find((u) => u.index === index)?.uid ?? null;
}

function onAttack() {
  cast({ type: "attack" });
}
function onDefense() {
  cast({ type: "defense" });
}
function onGamble() {
  cast({ type: "gamble" });
}
function onSkill() {
  cast({ type: "skill" });
}
function onHolyWord() {
  cast({ type: "holyWord" });
}
function onTarget(index) {
  const uid = unitIndexToUid(index);
  if (uid != null) cast({ type: "attackTarget", targetUid: uid });
}
function onSkillTarget(index) {
  const purpose = view.pending?.purpose ?? "";
  if (purpose === "investigate:guess") {
    cast({ type: "skillAnswer", answer: index });
    return;
  }
  const uid = unitIndexToUid(index);
  if (uid == null) return;
  if (purpose === "defense.support") {
    cast({ type: "defenseTarget", targetUid: uid });
    return;
  }
  if (purpose === "gamble:trap") {
    cast({ type: "gambleTarget", targetUid: uid });
    return;
  }
  cast({ type: "skillAnswer", answer: uid });
}
function onLiniyaSkill(index, subSkill) {
  const uid = unitIndexToUid(index);
  if (uid != null) {
    cast({ type: "skillAnswer", answer: { targetUid: uid, subSkill } });
  }
}
function onCaiyueangSave() {
  cast({ type: "skillAnswer", answer: { choice: "save" } });
}
function onCaiyueangLoad() {
  cast({ type: "skillAnswer", answer: { choice: "load" } });
}
function onGambleSubmit(trapIdx, baitIdx) {
  cast({ type: "gambleSubmit", trapIdx, baitIdx });
}
function onNahidaOrder(order) {
  cast({ type: "skillAnswer", answer: order });
}
function onCancel() {
  cast({ type: "cancel" });
}

// ---- AI ----
const isAiTurn = computed(() => {
  if (setup.opponentMode !== "ai") return false;
  const p = view.players[view.currentPlayerIndex];
  return !!p?.alive && p.teamId === 1;
});

let aiTimer = null;
function scheduleAI() {
  if (aiTimer) clearTimeout(aiTimer);
  if (uiMode.value !== "match" || view.gameOver) return;
  if (!isAiTurn.value) return;
  aiTimer = setTimeout(aiAct, 600 + Math.random() * 350);
}

watch(() => view.currentPlayerIndex, scheduleAI, { immediate: true });
watch(() => view.step, scheduleAI, { immediate: true });
// 开局/读档时 currentPlayerIndex 可能已经是 0，单靠上面两个 watcher 不会触发
watch(() => view.players.length, scheduleAI);
watch(
  () => uiMode.value,
  (v) => {
    if (v === "match") scheduleAI();
  },
);

function aiAct() {
  if (uiMode.value !== "match" || view.gameOver) return;
  if (!isAiTurn.value) return;
  const s = view.step;

  if (s === "pickAction") {
    const p = view.players[view.currentPlayerIndex];
    const canSkill = !!p?.canUseSkill;
    const r = Math.random();
    // 和平期：不攻击（塔也不行动）
    if (view.phase === "peace") {
      if (canSkill && r < 0.25) cast({ type: "skill" });
      else if (r < 0.75) cast({ type: "defense" });
      else cast({ type: "gamble" });
      return;
    }
    if (canSkill && r < 0.15) cast({ type: "skill" });
    else if (r < 0.6) cast({ type: "attack" });
    else if (r < 0.8) cast({ type: "defense" });
    else cast({ type: "gamble" });
    return;
  }

  const opts = view.pending?.options ?? [];
  const pickUnit = () => {
    const uids = opts.map((uid) => view.unitByUid(uid)).filter(Boolean);
    return uids[Math.floor(Math.random() * uids.length)];
  };

  if (s === "attackShowCard") {
    const t = pickUnit();
    if (t) cast({ type: "attackTarget", targetUid: t.uid });
    else cast({ type: "cancel" });
    return;
  }
  if (s === "skillPickTarget") {
    const purpose = view.pending?.purpose ?? "";
    if (purpose === "investigate:guess") {
      cast({ type: "skillAnswer", answer: 1 + Math.floor(Math.random() * 13) });
      return;
    }
    if (purpose === "defense.support" || purpose === "gamble:trap") {
      const me = view.players[view.currentPlayerIndex];
      cast({
        type: purpose === "defense.support" ? "defenseTarget" : "gambleTarget",
        targetUid: me?.uid ?? null,
      });
      return;
    }
    const t = pickUnit();
    if (t) cast({ type: "skillAnswer", answer: t.uid });
    else cast({ type: "cancel" });
    return;
  }
  if (s === "gamblePick") {
    const n = view.pendingGamble?.drawnCards?.length ?? 2;
    if (n >= 2) {
      const a = Math.floor(Math.random() * n);
      let b = Math.floor(Math.random() * (n - 1));
      if (b >= a) b++;
      cast({ type: "gambleSubmit", trapIdx: a, baitIdx: b });
    }
    return;
  }
  if (s === "skillNahida") {
    const n = view.scryCards?.length ?? 0;
    cast({
      type: "skillAnswer",
      answer: Array.from({ length: n }, (_, i) => i),
    });
    return;
  }
  if (s === "liniyaPick") {
    const t = pickUnit();
    if (t) {
      cast({
        type: "skillAnswer",
        answer: { targetUid: t.uid, subSkill: Math.random() < 0.5 ? 1 : 2 },
      });
    }
    return;
  }
  if (s === "caiyueangPick") {
    cast({ type: "skillAnswer", answer: { choice: "save" } });
    return;
  }
  cast({ type: "cancel" });
}

// ---- 结算 / 存档 ----
watch(
  () => gameState.gameOver,
  (over) => {
    if (!over) return;
    setTimeout(() => checkResult(), 600);
  },
);

function onSaveAndQuit() {
  const data = saveBrawl();
  emit("saveAndQuit", data);
}

function onRematch() {
  resetBrawl();
  startDraft();
}

defineExpose({ restoreBrawl, saveBrawl });

onBeforeUnmount(() => {
  if (aiTimer) clearTimeout(aiTimer);
  if (draftTimer) clearTimeout(draftTimer);
  if (drawTimer) clearTimeout(drawTimer);
});
</script>

<style scoped>
/* ════════════════ 公共 ════════════════ */
.brawl {
  position: relative;
  min-height: 100vh;
  color: #eaeefb;
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, #1d2b5c 0%, transparent 60%),
    radial-gradient(ellipse 70% 45% at 50% 110%, #0c2b3a 0%, transparent 60%),
    linear-gradient(180deg, #070a14 0%, #0a0f1f 100%);
  overflow-x: hidden;
}
.brawl::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(120, 160, 255, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120, 160, 255, 0.045) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(ellipse at center, #000 20%, transparent 78%);
  pointer-events: none;
  z-index: 0;
}
.brawl > section {
  position: relative;
  z-index: 1;
}
.back-btn {
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 40;
  padding: 7px 12px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(10, 14, 28, 0.72);
  color: rgba(220, 230, 255, 0.75);
  font-size: 11px;
  letter-spacing: 0.08em;
  cursor: pointer;
  backdrop-filter: blur(8px);
}
.back-btn:hover {
  color: #fff;
  border-color: rgba(255, 213, 79, 0.5);
}
.eyebrow {
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.42em;
  color: rgba(150, 180, 255, 0.65);
  text-transform: uppercase;
}
.cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 13px 34px;
  border: none;
  border-radius: 12px;
  color: #1a1200;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.08em;
  cursor: pointer;
  background: linear-gradient(135deg, #ffe082, #ffb300 45%, #ff8f00);
  box-shadow:
    0 0 0 1px rgba(255, 213, 79, 0.65),
    0 10px 28px rgba(255, 143, 0, 0.35);
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease;
}
.cta em {
  font-style: normal;
  font-size: 17px;
}
.cta:hover {
  transform: translateY(-2px);
  box-shadow:
    0 0 0 1px rgba(255, 213, 79, 0.9),
    0 14px 36px rgba(255, 143, 0, 0.48);
}
.cta--ghost {
  color: #dbe4ff;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2);
}
.cta--ghost:hover {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.4);
}

/* ════════════════ 设置 ════════════════ */
.setup-screen {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 28px 16px calc(28px + env(safe-area-inset-bottom));
  overflow: hidden;
}
.setup-screen__glow {
  position: absolute;
  width: 520px;
  height: 520px;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.35;
  pointer-events: none;
  animation: glowDrift 12s ease-in-out infinite alternate;
}
.setup-screen__glow--a {
  background: #1e4fff;
  top: -220px;
  left: -160px;
}
.setup-screen__glow--b {
  background: #ff3d5e;
  bottom: -240px;
  right: -140px;
  animation-delay: -6s;
}
@keyframes glowDrift {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(40px, 30px, 0) scale(1.12);
  }
}
.setup-card {
  position: relative;
  width: min(620px, 100%);
  padding: 34px 34px 26px;
  border-radius: 24px;
  background:
    linear-gradient(
      160deg,
      rgba(28, 38, 72, 0.92),
      rgba(10, 14, 28, 0.94) 65%
    );
  border: 1px solid rgba(140, 170, 255, 0.18);
  box-shadow:
    0 40px 90px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(14px);
}
.setup-title {
  margin: 10px 0 6px;
  font-size: clamp(30px, 5vw, 44px);
  letter-spacing: 0.08em;
  background: linear-gradient(100deg, #fff, #b9d4ff 45%, #ffd54f);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 0 40px rgba(120, 170, 255, 0.25);
}
.setup-lead {
  margin: 0 0 22px;
  font-size: 13px;
  line-height: 1.7;
  color: rgba(210, 222, 255, 0.62);
}
.setup-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.setup-tile {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 16px 16px 14px;
  text-align: left;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: #e8eeff;
  cursor: pointer;
  transition: all 0.18s;
}
.setup-tile__icon {
  font-size: 24px;
}
.setup-tile b {
  font-size: 15px;
}
.setup-tile small {
  font-size: 11px;
  color: rgba(200, 215, 250, 0.55);
}
.setup-tile--active {
  border-color: rgba(255, 213, 79, 0.7);
  background: linear-gradient(
    160deg,
    rgba(255, 213, 79, 0.16),
    rgba(255, 143, 0, 0.05)
  );
  box-shadow:
    0 0 0 1px rgba(255, 213, 79, 0.25),
    0 8px 24px rgba(255, 143, 0, 0.18);
}
.setup-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 18px;
}
.setup-line--artifacts {
  align-items: flex-start;
  flex-direction: column;
}
.setup-line__label {
  font-size: 12px;
  letter-spacing: 0.16em;
  color: rgba(180, 200, 245, 0.6);
}
.segmented {
  display: inline-flex;
  padding: 3px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.segmented button {
  padding: 7px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(220, 230, 255, 0.55);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.segmented button.on {
  background: rgba(255, 213, 79, 0.16);
  color: #ffd54f;
  box-shadow: inset 0 0 0 1px rgba(255, 213, 79, 0.35);
}
.artifact-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
  margin-top: 8px;
}
.artifact-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 150px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 11px;
}
.artifact-slot__no {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 800;
  color: #0a0f1f;
  background: rgba(255, 213, 79, 0.85);
}
.artifact-slot select {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: #101832;
  color: #e8eeff;
  font-size: 11px;
}
.setup-foot {
  margin: 16px 0 0;
  text-align: center;
  font-size: 11px;
  color: rgba(190, 205, 240, 0.42);
}
.setup-card .cta {
  width: 100%;
  margin-top: 24px;
}

/* ════════════════ Ban/Pick ════════════════ */
.draft-screen {
  max-width: 1120px;
  margin: 0 auto;
  padding: 64px 16px calc(28px + env(safe-area-inset-bottom));
}
.draft-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.draft-title {
  margin: 6px 0 0;
  font-size: clamp(22px, 4vw, 32px);
  letter-spacing: 0.06em;
}
.draft-phase {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
}
.draft-phase__side {
  font-weight: 900;
}
.draft-phase__side--blue {
  color: #64b5f6;
}
.draft-phase__side--red {
  color: #ff7b7b;
}
.draft-phase__count {
  color: rgba(220, 230, 255, 0.45);
  font-variant-numeric: tabular-nums;
}
.draft-lineups {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.lineup {
  flex: 1;
  min-width: 240px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.lineup--blue {
  border-color: rgba(79, 195, 247, 0.22);
}
.lineup--red {
  border-color: rgba(255, 107, 107, 0.22);
}
.lineup__label {
  display: block;
  font-size: 11px;
  letter-spacing: 0.14em;
  color: rgba(200, 215, 250, 0.65);
  margin-bottom: 8px;
}
.lineup__cards {
  display: flex;
  gap: 8px;
}
.vs-lineup {
  flex: none;
  min-width: 0;
  font-size: 12px;
  font-weight: 900;
  color: rgba(255, 213, 79, 0.7);
  letter-spacing: 0.2em;
}
.mini-card {
  position: relative;
  width: 54px;
  height: 72px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  flex: none;
}
.mini-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 30%;
}
.mini-card__fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 20px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.45);
}
.mini-card em {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 3px;
  font-style: normal;
  font-size: 8px;
  text-align: center;
  color: #fff;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mini-card--empty {
  display: grid;
  place-items: center;
  border-style: dashed;
  color: rgba(255, 255, 255, 0.2);
  font-size: 16px;
}

.draft-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 10px;
}
.draft-card {
  position: relative;
  padding: 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #0d1326;
  cursor: pointer;
  text-align: left;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}
.draft-card--active:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 213, 79, 0.75);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
}
.draft-card--banned {
  opacity: 0.5;
}
.draft-card--picked {
  opacity: 0.5;
}
.draft-card--ai-turn {
  cursor: wait;
}
.draft-card__art {
  position: relative;
  height: 116px;
  overflow: hidden;
}
.draft-card__art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 30%;
}
.draft-card__fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 42px;
  font-weight: 900;
  color: rgba(180, 200, 245, 0.5);
  background: radial-gradient(circle at 30% 20%, #22305c, #0a0f1f);
}
.draft-card__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, #0d1326 4%, transparent 55%);
}
.draft-card__meta {
  padding: 6px 8px 8px;
}
.draft-card__meta b {
  display: block;
  font-size: 12px;
  color: #f2f6ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.draft-card__meta small {
  font-size: 9px;
  color: rgba(200, 215, 250, 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
.stamp {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.12em;
}
.stamp--ban {
  color: #ffd7d7;
  background: rgba(198, 40, 40, 0.85);
  box-shadow: 0 0 12px rgba(255, 60, 60, 0.5);
}
.stamp--blue {
  color: #04121f;
  background: rgba(100, 181, 246, 0.9);
}
.stamp--red {
  color: #1a0505;
  background: rgba(255, 123, 123, 0.9);
}
.draft-card__hover {
  position: absolute;
  right: 8px;
  bottom: 8px;
  font-size: 8px;
  color: rgba(255, 213, 79, 0.75);
  opacity: 0;
  transition: opacity 0.15s;
}
.draft-card--active:hover .draft-card__hover {
  opacity: 1;
}
.draft-ai {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
  font-size: 12px;
  color: rgba(255, 213, 79, 0.8);
}
.draft-ai__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffd54f;
  animation: blink 0.9s ease-in-out infinite;
}
@keyframes blink {
  50% {
    opacity: 0.2;
  }
}
.draft-foot {
  display: flex;
  justify-content: center;
  margin-top: 22px;
}

/* ════════════════ 对局 HUD ════════════════ */
.match-screen {
  max-width: 1180px;
  margin: 0 auto;
  padding: 12px 14px calc(118px + env(safe-area-inset-bottom));
}
.hud {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(23, 32, 61, 0.92), rgba(9, 12, 24, 0.92));
  border: 1px solid rgba(140, 170, 255, 0.16);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}
.hud__round {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
  overflow: hidden;
}
.hud__cap {
  font-size: 8px;
  letter-spacing: 0.22em;
  color: rgba(170, 195, 255, 0.6);
}
.hud__round b {
  font-size: 23px;
  line-height: 1;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.hud__round small {
  font-size: 10px;
  color: rgba(200, 215, 250, 0.4);
}
.hud__round i {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: linear-gradient(90deg, #ffd54f, #ff8f00);
  box-shadow: 0 0 8px rgba(255, 179, 0, 0.7);
}
.hud__weather {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hud__weather-icon {
  font-size: 22px;
  filter: drop-shadow(0 0 8px rgba(255, 213, 79, 0.4));
}
.hud__weather-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.hud__weather-text b {
  font-size: 12px;
  color: #ffe082;
}
.hud__weather-text em {
  font-style: normal;
  font-size: 9px;
  color: rgba(200, 215, 250, 0.45);
}
.hud__peace {
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #b9f6ca;
  background: rgba(105, 240, 174, 0.1);
  border: 1px solid rgba(105, 240, 174, 0.28);
  white-space: nowrap;
}
.hud__turn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 700;
  color: #d8e4ff;
}
.hud__turn-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #69f0ae;
  box-shadow: 0 0 12px #69f0ae;
  animation: turnPulse 1.4s ease-in-out infinite;
}
@keyframes turnPulse {
  50% {
    opacity: 0.35;
  }
}
.hud__turn em {
  font-style: normal;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 4px;
  color: #241a00;
  background: #ffd54f;
}
.hud__save {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.05);
  color: #cfd9f5;
  cursor: pointer;
}

.tug {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0 8px;
}
.tug__name {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.tug__name--blue {
  color: #64b5f6;
}
.tug__name--red {
  color: #ff7b7b;
}
.tug__track {
  position: relative;
  flex: 1;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
}
.tug__fill {
  height: 100%;
  transition: width 0.4s ease;
}
.tug__fill--blue {
  background: linear-gradient(90deg, #1565c0, #64b5f6);
  box-shadow: 0 0 12px rgba(100, 181, 246, 0.6);
}
.tug__fill--red {
  background: linear-gradient(90deg, #ff7b7b, #c62828);
  box-shadow: 0 0 12px rgba(255, 107, 107, 0.55);
}
.tug__center {
  position: absolute;
  left: 50%;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
}

/* ════════════════ 战场 ════════════════ */
.arena {
  display: grid;
  grid-template-rows: auto auto auto;
  gap: 8px;
}
.lane {
  position: relative;
  padding: 8px 10px;
  border-radius: 16px;
  transition: border-color 0.3s;
}
.lane--enemy {
  background:
    radial-gradient(ellipse 70% 90% at 50% 0%, rgba(198, 40, 40, 0.14), transparent 65%),
    linear-gradient(180deg, rgba(30, 18, 30, 0.72), rgba(8, 10, 20, 0.6));
  border: 1px solid rgba(255, 107, 107, 0.2);
}
.lane--player {
  background:
    radial-gradient(ellipse 70% 90% at 50% 100%, rgba(21, 101, 192, 0.16), transparent 65%),
    linear-gradient(0deg, rgba(16, 26, 46, 0.72), rgba(8, 10, 20, 0.6));
  border: 1px solid rgba(100, 181, 246, 0.2);
}
.lane__label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: rgba(255, 123, 123, 0.75);
}
.lane__label em {
  font-style: normal;
  letter-spacing: 0.06em;
  color: rgba(200, 215, 250, 0.35);
}
.lane__label--player {
  justify-content: flex-end;
  margin: 6px 0 0;
  color: rgba(100, 181, 246, 0.8);
}
.towers {
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
}
.heroes {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 8px;
}

.arena__center {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: center;
  padding: 6px 12px;
}
.arena__vs {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}
.arena__vs span {
  font-size: 18px;
  font-weight: 900;
  font-style: italic;
  letter-spacing: 0.08em;
  color: rgba(255, 213, 79, 0.85);
  text-shadow: 0 0 18px rgba(255, 179, 0, 0.5);
}
.arena__vs em {
  font-style: normal;
  font-size: 9px;
  color: rgba(200, 215, 250, 0.4);
}
.battle-log {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 96px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 7px 10px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid rgba(255, 255, 255, 0.08);
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 213, 79, 0.35) transparent;
}
.battle-log::-webkit-scrollbar {
  width: 6px;
}
.battle-log::-webkit-scrollbar-thumb {
  background: rgba(255, 213, 79, 0.3);
  border-radius: 999px;
}
.battle-log::-webkit-scrollbar-track {
  background: transparent;
}
.battle-log__line {
  flex: 0 0 auto;
  margin: 0;
  font-size: 10.5px;
  color: rgba(220, 230, 255, 0.66);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.battle-log__line--new {
  color: #ffe082;
  animation: logIn 0.35s ease;
}
@keyframes logIn {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
}

.dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  justify-content: center;
  max-height: 46vh;
  overflow-y: auto;
  padding: 9px 10px calc(9px + env(safe-area-inset-bottom));
  border-radius: 16px 16px 0 0;
  background:
    linear-gradient(180deg, rgba(14, 19, 36, 0.94), rgba(7, 9, 18, 0.99));
  border-top: 1px solid rgba(140, 170, 255, 0.16);
  box-shadow: 0 -12px 34px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
}
.dock :deep(.action-bar) {
  width: min(1180px, 100%);
}
.dock__ai {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  font-size: 12px;
  color: rgba(255, 213, 79, 0.8);
}
.dock__ai-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffd54f;
  box-shadow: 0 0 12px #ffd54f;
  animation: blink 0.9s ease-in-out infinite;
}

/* 抽牌动画 */
.draw-toast {
  position: fixed;
  left: 50%;
  bottom: 112px;
  transform: translateX(-50%);
  z-index: 35;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 10px 18px 12px;
  border-radius: 16px;
  background:
    linear-gradient(160deg, rgba(32, 43, 82, 0.96), rgba(9, 13, 27, 0.97));
  border: 1px solid rgba(255, 213, 79, 0.35);
  box-shadow:
    0 0 0 1px rgba(255, 213, 79, 0.1),
    0 18px 44px rgba(0, 0, 0, 0.6),
    0 0 34px rgba(255, 179, 0, 0.15);
  pointer-events: none;
}
.draw-toast__label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #ffe082;
}
.draw-toast__cards {
  display: flex;
  gap: 7px;
  align-items: flex-end;
}
.draw-toast__card {
  transform: scale(0.9);
  transform-origin: bottom center;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.45);
}
.draw-pop-enter-active {
  transition:
    opacity 0.24s ease,
    transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.3);
}
.draw-pop-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}
.draw-pop-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(34px) scale(0.72);
}
.draw-pop-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(14px) scale(0.92);
}

/* ════════════════ 结算 ════════════════ */
.result-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 18px;
  text-align: center;
}
.result-screen--win {
  background: radial-gradient(ellipse 60% 50% at 50% 30%, rgba(255, 179, 0, 0.16), transparent 70%);
}
.result-screen--lose {
  background: radial-gradient(ellipse 60% 50% at 50% 30%, rgba(198, 40, 40, 0.18), transparent 70%);
}
.result-title {
  margin: 10px 0 4px;
  font-size: clamp(40px, 9vw, 76px);
  letter-spacing: 0.24em;
  font-weight: 900;
  background: linear-gradient(100deg, #fff, #ffd54f 45%, #ff8f00);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 0 60px rgba(255, 179, 0, 0.35);
}
.result-screen--lose .result-title {
  background: linear-gradient(100deg, #fff, #ff8a80 45%, #c62828);
  -webkit-background-clip: text;
  background-clip: text;
}
.result-reason {
  margin: 0 0 26px;
  font-size: 13px;
  color: rgba(210, 222, 255, 0.6);
}
.result-stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: 28px;
}
.result-stat {
  min-width: 150px;
  padding: 16px 20px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.result-stat span {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: rgba(190, 205, 240, 0.55);
}
.result-stat b {
  font-size: 26px;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.result-stat b em {
  font-style: normal;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.35);
  margin: 0 4px;
}
.result-stat small {
  font-size: 9px;
  color: rgba(190, 205, 240, 0.4);
}
.result-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

@media (max-width: 720px) {
  .setup-card {
    padding: 24px 20px 20px;
  }
  .setup-grid {
    grid-template-columns: 1fr;
  }
  .draft-lineups {
    flex-direction: column;
    gap: 8px;
  }
  .vs-lineup {
    align-self: center;
  }
  .draft-grid {
    grid-template-columns: repeat(auto-fill, minmax(98px, 1fr));
    gap: 8px;
  }
  .match-screen {
    padding: 8px 8px calc(132px + env(safe-area-inset-bottom));
  }
  .hud {
    gap: 8px;
    padding: 8px 10px;
  }
  .hud__weather-text em {
    display: none;
  }
  .arena__center {
    grid-template-columns: 1fr;
  }
  .arena__vs {
    display: none;
  }
  .battle-log {
    max-height: 58px;
  }
  .lane {
    padding: 8px;
  }
  .heroes {
    gap: 6px;
    margin-top: 8px;
  }
  .result-stat {
    min-width: 120px;
    padding: 12px 14px;
  }
}

@media (max-width: 480px) {
  .match-screen {
    padding: 6px 6px calc(118px + env(safe-area-inset-bottom));
  }
  .hud {
    gap: 6px;
    padding: 7px 9px;
  }
  .hud__round b {
    font-size: 18px;
  }
  .hud__weather-text b {
    font-size: 10px;
  }
  .hud__weather-text em {
    display: none;
  }
  .hud__turn {
    margin-left: 0;
    font-size: 10px;
  }
  .hud__turn em {
    display: none;
  }
  .hud__save {
    width: 34px;
    height: 34px;
  }
  .lane {
    padding: 6px;
  }
  .lane__label {
    font-size: 8px;
    margin-bottom: 4px;
  }
  .towers {
    gap: 4px;
  }
  .heroes {
    gap: 4px;
    margin-top: 6px;
  }
  .battle-log {
    max-height: 76px;
    padding: 5px 8px;
  }
  .battle-log__line {
    font-size: 9.5px;
  }
  .arena__center {
    padding: 2px 6px;
    gap: 6px;
  }
  .tug__name {
    font-size: 8px;
  }
  .dock {
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
  }
  .result-stat {
    min-width: 100px;
    padding: 10px 12px;
  }
  .result-stat b {
    font-size: 20px;
  }
  .result-title {
    letter-spacing: 0.14em;
  }
  .draw-toast {
    bottom: 98px;
    padding: 7px 12px 9px;
    border-radius: 12px;
  }
  .draw-toast__card {
    transform: scale(0.78);
  }
}

</style>
