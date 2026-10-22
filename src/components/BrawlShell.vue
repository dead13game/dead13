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
              <img v-if="draftMeta(id)?.icon" :src="draftMeta(id)?.icon" />
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
              <img v-if="draftMeta(id)?.icon" :src="draftMeta(id)?.icon" />
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
              :src="draftMeta(id)?.icon"
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

<script setup lang="ts">
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
import type { Command } from "../game/api.js";
import type {
  CharacterMeta,
  DrawFeedEntry,
  WeatherId,
} from "../game/types.js";
import type { PlayerView } from "../game/view.js";

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

/** 对外 emit：存档载荷就是控制器 saveBrawl() 的返回值 */
const emit = defineEmits<{
  (e: "restart"): void;
  (e: "saveAndQuit", payload: ReturnType<typeof saveBrawl>): void;
}>();

/** 只读视图 */
const view = reactive(buildView(gameState));
watch(
  () => gameState,
  () => Object.assign(view, buildView(gameState)),
  { deep: true },
);

const cast = (cmd: Command): boolean => dispatch(gameState, cmd);

// ---- 设置 / 选人 ----
function onStartDraft(): void {
  startDraft();
}

function charName(id: number): string {
  return getCharacter(id)?.meta?.name ?? `#${id}`;
}
function draftMeta(id: number): CharacterMeta | null {
  return getCharacter(id)?.meta ?? null;
}
function sideName(side: 0 | 1): string {
  return side === 0 ? playerTeamName.value : opponentTeamName.value;
}

const draftStepLabel = computed(() => {
  const step = currentDraftStep.value;
  if (!step) return "Ban/Pick 完成";
  return `${sideName(step.side)} · ${step.type === "ban" ? "禁用" : "选择"}`;
});

function onDraftClick(id: number): void {
  if (isAiDraftTurn.value) return;
  draftAction(id);
}

function onStartMatch(): void {
  startMatch();
  nextTick(() => scheduleAI());
}

/** AI 自动 Ban/Pick */
let draftTimer: ReturnType<typeof setTimeout> | null = null;
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
const logRef = ref<HTMLElement | null>(null);
const logLines = computed(() => (view.messageLog || []).slice(-200));
function scrollLogToBottom(): void {
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
const drawToast = ref<DrawFeedEntry | null>(null);
let drawTimer: ReturnType<typeof setTimeout> | null = null;
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

/** 摸牌类型文案（entry.kind 是运行时字符串，查不到就回退「摸牌」） */
const DRAW_KIND_LABELS: Record<string, string> = {
  attack: "攻击摸牌",
  defense: "防御摸牌（暗牌）",
  gamble: "赌命摸牌",
  "drone-defense": "无人机防御摸牌（暗牌）",
  venti: "千风之诗摸牌",
};

function drawLabel(entry: DrawFeedEntry): string {
  const who = entry.actorUid
    ? view.unitByUid(entry.actorUid)?.name || ""
    : "";
  const kind = DRAW_KIND_LABELS[entry.kind] ?? "摸牌";
  return who ? `${who} · ${kind}` : kind;
}

/** 防御摸牌保持牌背：双方都不应看到防御牌点数 */
const drawToastCards = computed(() =>
  (drawToast.value?.cards ?? []).map((c) => ({
    ...c,
    faceUp: !drawToast.value?.hidden,
  })),
);

const charDataOf = (u: PlayerView): CharacterMeta | null =>
  view.CHARACTERS?.[u.characterId] ?? getCharacter(u.characterId)?.meta ?? null;

function isCurrent(u: PlayerView): boolean {
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
      .sort((a, b) => (a.towerIndex ?? 0) - (b.towerIndex ?? 0))[0]?.uid ?? null
  );
});

const tugPct = computed(() => {
  const a = totalHp(0);
  const b = totalHp(1);
  if (a + b <= 0) return 50;
  return Math.max(4, Math.min(96, (a / (a + b)) * 100));
});

function totalHp(team: number): number {
  const heroes = team === 0 ? playerHeroes.value : enemyHeroes.value;
  const towers = team === 0 ? playerTowers.value : enemyTowers.value;
  return (
    heroes.reduce((s, p) => s + Math.max(0, p.hp), 0) +
    towers.reduce((s, t) => s + Math.max(0, t.hp), 0)
  );
}

function weatherName(id: WeatherId | null): string {
  if (!id) return "待变";
  return WEATHER_DATA[id]?.name ?? "待变";
}
function weatherIcon(id: WeatherId | null): string {
  if (!id) return "🌤️";
  const icons: Record<WeatherId, string> = {
    sun: "☀️",
    rain: "🌧️",
    wind: "🌪️",
    trade: "🪙",
    arms: "⚔️",
    calm: "🌤️",
  };
  return icons[id] ?? "🌤️";
}

// ---- 动作 ----
function unitIndexToUid(index: number): number | null {
  return view.units.find((u) => u.index === index)?.uid ?? null;
}

function onAttack(): void {
  cast({ type: "attack" });
}
function onDefense(): void {
  cast({ type: "defense" });
}
function onGamble(): void {
  cast({ type: "gamble" });
}
function onSkill(): void {
  cast({ type: "skill" });
}
function onHolyWord(): void {
  cast({ type: "holyWord" });
}
function onTarget(index: number): void {
  const uid = unitIndexToUid(index);
  if (uid != null) cast({ type: "attackTarget", targetUid: uid });
}
function onSkillTarget(index: number): void {
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
function onLiniyaSkill(index: number, subSkill: number): void {
  const uid = unitIndexToUid(index);
  if (uid != null) {
    cast({ type: "skillAnswer", answer: { targetUid: uid, subSkill } });
  }
}
function onCaiyueangSave(): void {
  cast({ type: "skillAnswer", answer: { choice: "save" } });
}
function onCaiyueangLoad(): void {
  cast({ type: "skillAnswer", answer: { choice: "load" } });
}
function onGambleSubmit(trapIdx: number, baitIdx: number): void {
  cast({ type: "gambleSubmit", trapIdx, baitIdx });
}
function onNahidaOrder(order: number[]): void {
  cast({ type: "skillAnswer", answer: order });
}
function onCancel(): void {
  cast({ type: "cancel" });
}

// ---- AI ----
const isAiTurn = computed(() => {
  if (setup.opponentMode !== "ai") return false;
  const p = view.players[view.currentPlayerIndex];
  return !!p?.alive && p.teamId === 1;
});

let aiTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAI(): void {
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

function aiAct(): void {
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
  const pickUnit = (): PlayerView | undefined => {
    const uids = opts
      .map((uid) => view.unitByUid(uid))
      .filter((u): u is PlayerView => u !== null);
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
      if (!me) return;
      cast(
        purpose === "defense.support"
          ? { type: "defenseTarget", targetUid: me.uid }
          : { type: "gambleTarget", targetUid: me.uid },
      );
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

function onSaveAndQuit(): void {
  const data = saveBrawl();
  emit("saveAndQuit", data);
}

function onRematch(): void {
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


<style scoped src="./brawl/brawl-shared.css"></style>
<style scoped src="./brawl/brawl-setup.css"></style>
<style scoped src="./brawl/brawl-draft.css"></style>
<style scoped src="./brawl/brawl-hud.css"></style>
<style scoped src="./brawl/brawl-board.css"></style>
<style scoped src="./brawl/brawl-result.css"></style>
