<template>
  <div class="uni-shell">
    <!-- 顶栏 -->
    <header class="uni-topbar">
      <span class="uni-topbar__title">🌌 模拟宇宙</span>
      <span>位面 {{ uniState.plane }}</span>
      <span>第 {{ uniState.floor }} 层</span>
      <span>🪙 {{ uniState.shards }}</span>
      <span>🙏 {{ uniState.blessings.length }}</span>
      <span>✨ {{ uniState.curios.length }}</span>
      <span>📐 {{ uniState.equations.length }}</span>
      <button class="uni-btn uni-btn--sm" @click="uni.saveUni()">存档</button>
      <button class="uni-btn uni-btn--sm" @click="onQuit">退出</button>
    </header>

    <!-- 普通层 2 选 1 -->
    <section v-if="uiMode === 'choice'" class="uni-panel">
      <h2>选择本层内容</h2>
      <div class="uni-choice">
        <button
          v-for="(opt, i) in uni.uniState.pendingChoice?.options || []"
          :key="i"
          class="uni-choice__card"
          @click="uni.doChooseContent(i)"
        >
          <span class="uni-choice__icon">{{ regionIcon(opt) }}</span>
          <span>{{ regionName(opt) }}</span>
        </button>
      </div>
    </section>

    <!-- 战斗 -->
    <section v-if="uiMode === 'battle'" class="uni-battle">
      <div class="uni-battle__team">
        <div
          v-for="t in uni.uniState.team"
          :key="t.index"
          class="uni-member"
          :class="{
            'uni-member--dead': !t.alive,
            'uni-member--active': uni.uniState.combat?.activeIdx === t.index,
          }"
        >
          <div class="uni-member__name">{{ t.name }}</div>
          <div class="uni-member__hp">
            <div class="uni-bar">
              <div
                class="uni-bar__fill uni-bar__fill--hp"
                :style="{ width: hpPct(t) + '%' }"
              ></div>
            </div>
            <span>{{ t.hp }}/{{ t.maxHp }}</span>
          </div>
          <div v-if="t.shield > 0" class="uni-member__stat">🛡️{{ t.shield }}</div>
          <div class="uni-member__stat">
            {{ skillName(t) }}
            <span v-if="t.skillCooldown > 0" class="uni-member__cd">冷却{{ t.skillCooldown }}</span>
            <span v-else class="uni-member__ready">✔</span>
          </div>
          <div v-if="t.status.stunned" class="uni-member__flag">💫眩晕</div>
          <div v-if="t.status.puppet" class="uni-member__flag">🎭傀儡</div>
          <div v-if="t.status.dot > 0" class="uni-member__flag">🔥dot</div>
        </div>
      </div>

      <div class="uni-battle__enemies">
        <div
          v-for="e in uni.uniState.combat?.enemies || []"
          :key="e.id"
          class="uni-enemy"
          :class="{
            'uni-enemy--dead': !e.alive,
            'uni-enemy--target': targetMode === 'enemy' && selectedEnemy === e.id,
          }"
          @click="onEnemyClick(e.id)"
        >
          <div class="uni-enemy__name">{{ e.name }}</div>
          <div class="uni-enemy__hp">
            <div class="uni-bar">
              <div
                class="uni-bar__fill uni-bar__fill--enemy"
                :style="{ width: (e.hp / e.maxHp) * 100 + '%' }"
              ></div>
            </div>
            <span>{{ e.hp }}/{{ e.maxHp }}</span>
          </div>
          <div v-if="e.shield > 0" class="uni-enemy__shield">🛡️{{ e.shield }}</div>
          <div v-if="e.stunnedTurns > 0" class="uni-enemy__flag">💫{{ e.stunnedTurns }}</div>
          <div v-if="e.dotTurns > 0" class="uni-enemy__flag">🔥{{ e.dotTurns }}</div>
        </div>
      </div>

      <div class="uni-battle__action">
        <div v-if="active" class="uni-battle__actor">
          <span>{{ active.name }} 的回合</span>
          <span v-for="(c, i) in uni.uniState.combat.pendingPoker" :key="i" class="uni-poker">
            {{ c.rank }}{{ c.suit }}
          </span>
        </div>
        <div class="uni-battle__buttons">
          <button class="uni-btn" :disabled="!canAct" @click="onAttackClick">⚔️ 普攻</button>
          <button class="uni-btn" :disabled="!canAct" @click="uni.doDefense()">🛡️ 防御</button>
          <button
            class="uni-btn"
            :disabled="!canSkill"
            @click="onSkillClick"
          >
            💥 开大{{ skillCdText }}
          </button>
        </div>
        <div v-if="battleMsg" class="uni-battle__msg">{{ battleMsg }}</div>
      </div>
    </section>

    <!-- 转化第三波 -->
    <section v-if="uiMode === 'wave-clear'" class="uni-panel">
      <h2>转化：两波已灭（及格）</h2>
      <p>可以撤退保底，或挑战第三波精英（每消灭 1 个 +150 碎片）</p>
      <div class="uni-choice">
        <button class="uni-btn" @click="uni.doThirdWave(false)">撤退（及格奖励）</button>
        <button class="uni-btn" @click="uni.doThirdWave(true)">挑战第三波</button>
      </div>
    </section>

    <!-- 战斗胜利 -->
    <section v-if="uiMode === 'reward'" class="uni-panel">
      <h2>🎉 战斗胜利</h2>
      <template v-if="pendingPick">
        <p>选择祝福（{{ pendingPick.starRange[0] }}~{{ pendingPick.starRange[1] }} 星）</p>
        <div class="uni-choice">
          <button
            v-for="id in pendingPick.candidates"
            :key="id"
            class="uni-choice__card"
            @click="uni.doBlessingPick(id)"
          >
            {{ uni.blessingName(id) }}
          </button>
        </div>
      </template>
      <template v-else>
        <p v-if="uni.uniState.combat?.lastReward?.shards">
          +{{ uni.uniState.combat.lastReward.shards }} 宇宙碎片
        </p>
        <p v-if="uni.uniState.combat?.lastReward?.blessingPicks">
          可进行 {{ uni.uniState.combat.lastReward.blessingPicks }} 次祝福三选一
        </p>
        <button class="uni-btn" @click="uni.goNext()">前往下一区域</button>
      </template>
    </section>

    <!-- 事件 -->
    <section v-if="uiMode === 'event'" class="uni-panel">
      <h2>{{ ev?.title }}</h2>
      <p class="uni-panel__desc">{{ ev?.desc }}</p>
      <div class="uni-choice">
        <button
          v-for="(opt, i) in ev?.options || []"
          :key="i"
          class="uni-choice__card"
          @click="uni.doEventOption(i)"
        >
          {{ opt.text }}
        </button>
      </div>
    </section>

    <!-- 事件结果 -->
    <section v-if="uiMode === 'event-result'" class="uni-panel">
      <h2>{{ eventResult?.eventTitle }}</h2>
      <p>{{ eventResult?.outcome?.text }}</p>
      <template v-if="skillTargetPending">
        <p>选择角色升级技能（+{{ skillTargetPending }} 级）</p>
        <div class="uni-choice">
          <button
            v-for="t in upgradable"
            :key="t.index"
            class="uni-choice__card"
            @click="uni.doSkillTarget(t.index)"
          >
            {{ t.name }}（Lv{{ t.skillLevel }}）
          </button>
        </div>
      </template>
      <template v-else-if="pendingPick">
        <p>选择祝福（{{ pendingPick.starRange[0] }}~{{ pendingPick.starRange[1] }} 星）</p>
        <div class="uni-choice">
          <button
            v-for="id in pendingPick.candidates"
            :key="id"
            class="uni-choice__card"
            @click="uni.doBlessingPick(id)"
          >
            {{ uni.blessingName(id) }}
          </button>
        </div>
      </template>
      <template v-else>
        <button class="uni-btn" @click="uni.goNext()">前往下一区域</button>
      </template>
    </section>

    <!-- 商店 / 休整 -->
    <section v-if="uiMode === 'shop' || uiMode === 'rest'" class="uni-panel">
      <h2>{{ uiMode === 'shop' ? '🛒 商店' : '🏕️ 休整' }}</h2>
      <p v-if="uiMode === 'rest'" class="uni-panel__desc">全队生命已回满；可购买奇物与祝福；死亡角色可用 150 碎片复活</p>
      <div v-if="uiMode === 'rest'" class="uni-rest-revive">
        <button
          v-for="t in uni.uniState.team.filter((x) => !x.alive)"
          :key="t.index"
          class="uni-btn"
          @click="uni.doRevive(t.index)"
        >
          复活 {{ t.name }}（150 碎片）
        </button>
      </div>
      <div class="uni-shop-section">
        <h3>祝福</h3>
        <div class="uni-shop-list">
          <div v-for="(item, i) in uni.uniState.shopStock?.blessing || []" :key="i" class="uni-shop-item">
            <span>{{ item.star }}星 · {{ uni.blessingName(item.id) }}</span>
            <button
              class="uni-btn uni-btn--sm"
              :disabled="item.sold || uni.uniState.shards < shopPrice('blessing', item.star)"
              @click="uni.doShopBuy('blessing', i)"
            >
              {{ shopPrice('blessing', item.star) }} 碎片
            </button>
          </div>
        </div>
      </div>
      <div class="uni-shop-section">
        <h3>奇物</h3>
        <div class="uni-shop-list">
          <div v-for="(item, i) in uni.uniState.shopStock?.curio || []" :key="i" class="uni-shop-item">
            <span>{{ item.star }}星 · {{ uni.curioName(item.id) }}</span>
            <button
              class="uni-btn uni-btn--sm"
              :disabled="item.sold || uni.uniState.shards < shopPrice('curio', item.star)"
              @click="uni.doShopBuy('curio', i)"
            >
              {{ shopPrice('curio', item.star) }} 碎片
            </button>
          </div>
        </div>
      </div>
      <div v-if="uiMode === 'shop'" class="uni-shop-section">
        <h3>方程</h3>
        <div class="uni-shop-list">
          <div v-for="(item, i) in uni.uniState.shopStock?.equation || []" :key="i" class="uni-shop-item">
            <span>{{ item.star }}星 · {{ uni.equationName(item.id) }}</span>
            <button
              class="uni-btn uni-btn--sm"
              :disabled="item.sold || uni.uniState.shards < shopPrice('equation', item.star)"
              @click="uni.doShopBuy('equation', i)"
            >
              {{ shopPrice('equation', item.star) }} 碎片
            </button>
          </div>
        </div>
      </div>
      <button class="uni-btn" @click="uni.goNext()">离开</button>
    </section>

    <!-- 造物调试台 -->
    <section v-if="uiMode === 'workbench'" class="uni-panel">
      <h2>🔧 造物调试台（热量 {{ uni.uniState.heat }}）</h2>
      <p class="uni-panel__desc">强化祝福（效果 ×2）或覆写祝福/方程，然后挑战首领</p>
      <div class="uni-shop-section">
        <h3>祝福强化（1/2/3 星需 1/2/3 热量）</h3>
        <div class="uni-shop-list">
          <div v-for="(b, i) in uni.uniState.blessings" :key="i" class="uni-shop-item">
            <span>{{ uni.blessingName(b.id) }}（{{ b.star }}星 ×{{ b.enhanced || 1 }}{{ b.heatEnhanced ? '×' + b.heatEnhanced : '' }}）</span>
            <button class="uni-btn uni-btn--sm" :disabled="uni.uniState.heat < b.star" @click="uni.doHeatStrengthen(i)">
              强化（{{ b.star }} 热量）
            </button>
          </div>
        </div>
      </div>
      <div class="uni-shop-section">
        <h3>覆写祝福（{{ uni.uniState.overwritePrice }} 碎片，同星级随机替换）</h3>
        <div class="uni-shop-list">
          <div v-for="(b, i) in uni.uniState.blessings" :key="'o' + i" class="uni-shop-item">
            <span>{{ uni.blessingName(b.id) }}</span>
            <button class="uni-btn uni-btn--sm" @click="uni.doOverwriteBlessing(i)">覆写</button>
          </div>
        </div>
      </div>
      <div class="uni-shop-section">
        <h3>覆写方程（{{ uni.uniState.overwritePrice }} 碎片）</h3>
        <div class="uni-shop-list">
          <div v-for="(e, i) in uni.uniState.equations" :key="'e' + i" class="uni-shop-item">
            <span>{{ uni.equationName(e.id) }}</span>
            <button class="uni-btn uni-btn--sm" @click="uni.doOverwriteEquation(i)">覆写</button>
          </div>
        </div>
      </div>
      <button class="uni-btn uni-btn--primary" @click="uni.startBattle()">⚔️ 挑战首领</button>
    </section>

    <!-- 奇遇 / 财富 -->
    <section v-if="uiMode === 'oddity' || uiMode === 'fortune'" class="uni-panel">
      <h2>{{ uiMode === 'oddity' ? '✨ 奇遇' : '💰 财富' }}</h2>
      <p>{{ uiMode === 'oddity' ? oddityText : '获得 300 宇宙碎片' }}</p>
      <button class="uni-btn" @click="uni.goNext()">前往下一区域</button>
    </section>

    <!-- 终局 -->
    <section v-if="uiMode === 'gameover'" class="uni-panel uni-panel--over">
      <h2>💀 终局</h2>
      <p>到达第 {{ uni.uniState.floor }} 层</p>
      <button class="uni-btn" @click="onQuit">返回主菜单</button>
    </section>

    <DevLogPanel :entries="uni.uniState.devLog?.entries || []" />
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import DevLogPanel from "../components/DevLogPanel.vue";
import { SHOP_PRICE, REGION_META, ODDITY_EFFECTS } from "./logic/uniConstants.js";
import { UNI_SKILLS } from "./logic/uniConstants.js";

const props = defineProps({
  uni: { type: Object, required: true },
});
const emit = defineEmits(["quit"]);

// ---- 状态 ----
const targetMode = ref(null); // null | 'enemy' | 'member'
const selectedEnemy = ref(null);

const uniState = props.uni.uniState;
const active = computed(() => {
  const c = uniState.combat;
  return c && c.activeIdx != null ? uniState.team[c.activeIdx] : null;
});
const canAct = computed(
  () => uniState.combat?.phase === "player-action" && active.value?.alive,
);
const canSkill = computed(() => {
  if (!active.value) return false;
  const r = props.uni.canSkill(active.value.index);
  return r.ok;
});
const skillCdText = computed(() => {
  if (!active.value) return "";
  const info = props.uni.skillInfo(active.value.index);
  if (!info || info.type !== "active") return "";
  return info.cooldown > 0 ? `（冷却${info.cooldown}）` : "";
});
const battleMsg = computed(() => props.uni.battleMsg.value);
const uiMode = computed(() => props.uiMode.value);
const eventResult = computed(() => props.eventResult.value);
const skillTargetPending = computed(() => props.skillTargetPending.value);
const ev = computed(() => props.uni.getCurrentEvent());
const pendingPick = computed(() => props.uni.currentBlessingPick());
const upgradable = computed(() =>
  uniState.team.filter((t) => t.alive && t.charId !== 11),
);
const oddityText = computed(() => {
  const fx = uniState.region?.oddityEffect;
  if (fx === "shards") return "获得 800 宇宙碎片";
  if (fx === "workbench") return "可进行一次造物调试台";
  return "强化 8 个随机祝福";
});

// ---- 方法 ----
function regionIcon(type) {
  return REGION_META[type]?.icon || "❓";
}
function regionName(type) {
  return REGION_META[type]?.name || type;
}
function skillName(t) {
  return UNI_SKILLS[t.charId]?.name || "";
}
function hpPct(t) {
  return Math.max(0, Math.min(100, (t.hp / t.maxHp) * 100));
}
function shopPrice(type, star) {
  return SHOP_PRICE[type]?.[star] || 0;
}

function onAttackClick() {
  targetMode.value = "enemy";
  selectedEnemy.value = null;
  battleMsg.value = "选择目标敌人";
}
function onEnemyClick(enemyId) {
  if (targetMode.value === "enemy") {
    const r = props.uni.doAttack(enemyId);
    if (r.ok) targetMode.value = null;
  }
}
function onSkillClick() {
  const t = active.value;
  const info = props.uni.skillInfo(t.index);
  if (!info) return;
  // 需要选目标的技能：温迪/雷电将军（选敌人）
  if ([1, 3].includes(t.charId)) {
    targetMode.value = "enemy";
    selectedEnemy.value = null;
    battleMsg.value = "选择大招目标";
    return;
  }
  // 纳西妲：选角色（简化：默认选第 1 个其他角色）
  if (t.charId === 4) {
    const member = uniState.team.find((m) => m.alive && m.index !== t.index);
    if (member) {
      const r = props.uni.doSkill(undefined, { members: [member.index] });
      if (r.ok) targetMode.value = null;
    }
    return;
  }
  // 莉奈娅：弹分支（简化：默认盾）
  if (t.charId === 9) {
    const r = props.uni.doSkill(undefined, { branch: "shield" });
    if (r.ok) targetMode.value = null;
    return;
  }
  // 其余无目标技能直接放
  const r = props.uni.doSkill(undefined, {});
  if (r.ok) targetMode.value = null;
}
function onQuit() {
  emit("quit");
}
</script>

<style scoped>
.uni-shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 12px;
  color: #e8e8e8;
  font-size: 14px;
}
.uni-topbar {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.uni-topbar__title {
  font-weight: bold;
  color: #ffab00;
}
.uni-panel {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 16px;
  text-align: center;
}
.uni-panel__desc {
  color: #cfcfcf;
  margin: 8px 0 16px;
}
.uni-panel--over {
  border-color: #ff6b6b;
}
.uni-choice {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.uni-choice__card {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  cursor: pointer;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}
.uni-choice__card:hover {
  background: rgba(255, 171, 0, 0.15);
}
.uni-choice__icon {
  font-size: 22px;
}
.uni-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
}
.uni-btn:hover:not(:disabled) {
  background: rgba(255, 171, 0, 0.2);
}
.uni-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.uni-btn--sm {
  padding: 4px 10px;
  font-size: 12px;
}
.uni-btn--primary {
  background: #ff8f00;
  border-color: #ff8f00;
  font-weight: bold;
  margin-top: 8px;
}
/* 战斗 */
.uni-battle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.uni-battle__team,
.uni-battle__enemies {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.uni-member,
.uni-enemy {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 10px;
}
.uni-member--active {
  border-color: #ffab00;
  box-shadow: 0 0 8px rgba(255, 171, 0, 0.4);
}
.uni-member--dead,
.uni-enemy--dead {
  opacity: 0.35;
}
.uni-member__name,
.uni-enemy__name {
  font-weight: bold;
}
.uni-bar {
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin: 4px 0;
}
.uni-bar__fill {
  height: 100%;
  transition: width 0.3s;
}
.uni-bar__fill--hp {
  background: #4caf50;
}
.uni-bar__fill--enemy {
  background: #f44336;
}
.uni-member__stat,
.uni-enemy__shield,
.uni-enemy__flag,
.uni-member__flag {
  font-size: 12px;
  color: #cfcfcf;
}
.uni-member__cd {
  color: #ff8f00;
}
.uni-member__ready {
  color: #4caf50;
}
.uni-enemy--target {
  border-color: #ff8f00;
  box-shadow: 0 0 8px rgba(255, 143, 0, 0.5);
}
.uni-battle__action {
  grid-column: 1 / -1;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}
.uni-battle__actor {
  margin-bottom: 8px;
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
}
.uni-poker {
  background: #fff;
  color: #333;
  border-radius: 4px;
  padding: 2px 8px;
  font-weight: bold;
  display: inline-block;
}
.uni-battle__buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.uni-battle__msg {
  margin-top: 8px;
  color: #ff8f00;
}
/* 商店 */
.uni-shop-section {
  text-align: left;
  margin: 10px 0;
}
.uni-shop-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.uni-shop-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  padding: 6px 10px;
  border-radius: 6px;
}
.uni-rest-revive {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
@media (max-width: 600px) {
  .uni-battle {
    grid-template-columns: 1fr;
  }
}
</style>
