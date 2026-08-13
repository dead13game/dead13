<template>
  <div class="solo-shell">
    <!-- 顶部玩家状态栏 -->
    <div class="solo-hud">
      <div class="hud-left">
        <span class="hud-name">⚔️ {{ player.charId === 6 ? "玛薇卡" : "角色" }}</span>
        <span class="hud-hp">
          HP {{ player.hp }}/{{ player.maxHp }}
          <b v-if="combat?.playerShield">🛡{{ combat.playerShield }}</b>
          <span v-if="hpFlash" :key="hpFlash.key" class="hp-flash">-{{ hpFlash.dmg }}</span>
        </span>
        <span
          class="hud-gold"
          :class="{ 'gold--active': goldClicks > 0 }"
          @click="onGoldClick"
          title="连点 3 下打开开发日志"
        >
          💰 {{ player.gold }}<b v-if="goldClicks > 0" class="gold-progress">{{ goldClicks }}/3</b>
        </span>
      </div>
      <div class="hud-right">
        <span class="hud-lv">Lv.{{ player.level }}</span>
        <span class="hud-attrs">
          力{{ player.attrs.str }} 法{{ player.attrs.mag }} 防{{ player.attrs.def }}
        </span>
        <span v-if="combat" class="hud-spirit">🔥斗志 {{ combat.fightingSpirit }}</span>
        <span class="hud-node">第 {{ soloState.nodeIndex + 1 }}/{{ soloState.mapNodes.length }} 节点</span>
        <button class="solo-btn solo-btn--small hud-save" @click="saveAndQuit">
          💾 保存并退出
        </button>
      </div>
    </div>

    <!-- 属性点分配 -->
    <div v-if="player.pendingAttrPoints > 0" class="attr-panel">
      升级！剩余属性点 {{ player.pendingAttrPoints }}
      <button @click="solo.doApplyAttr('str')">力量+1</button>
      <button @click="solo.doApplyAttr('mag')">法力+1</button>
      <button @click="solo.doApplyAttr('def')">防御+1</button>
    </div>

    <!-- ═══ 地图 ═══ -->
    <section v-if="uiMode === 'map'" class="solo-map">
      <h2 class="panel-title">{{ soloState.chapterTitle }}</h2>
      <div class="node-chain">
        <div
          v-for="(n, i) in soloState.mapNodes"
          :key="i"
          class="node-item"
          :class="{
            'node--current': i === soloState.nodeIndex,
            'node--done': i < soloState.nodeIndex,
          }"
        >
          <span class="node-icon">{{ nodeIcon(n) }}</span>
          <span class="node-name">{{ nodeName(n) }}</span>
        </div>
      </div>
      <button class="solo-btn solo-btn--primary" @click="solo.enterNode()">
        ⚔️ 进入下一节点
      </button>
      <div class="deck-preview">
        <b>牌库：</b>
        <span v-for="(cnt, id) in player.deck" :key="id" class="deck-chip">
          {{ cardName(id) }}×{{ cnt }}
        </span>
      </div>
    </section>

    <!-- ═══ 战斗 ═══ -->
    <section v-else-if="uiMode === 'battle'" class="solo-battle">
      <!-- 敌方信息 -->
      <div class="enemy-panel">
        <div class="enemy-name">👹 {{ combat.enemyName }}</div>
        <div class="enemy-hp">
          <div class="hp-bar">
            <div class="hp-fill" :style="{ width: (combat.enemyHp / combat.enemyMaxHp) * 100 + '%' }"></div>
          </div>
          HP {{ combat.enemyHp }}/{{ combat.enemyMaxHp }}
          <b v-if="combat.enemyShield">🛡{{ combat.enemyShield }}</b>
          <span v-if="combat.enemyBuff === 'fightingSpirit'" class="enemy-spirit">🔥{{ combat.enemySpirit }}</span>
        </div>
        <!-- 敌方资源面板：行动力/抽牌数/牌堆 -->
        <div class="enemy-stats">
          <span>⚡ 行动力 {{ combat.enemyActionPoints ?? 0 }}</span>
          <span>🃏 抽牌数 {{ combat.enemyDrawCount ?? 0 }}</span>
          <span>🂠 牌堆 {{ combat.enemyPile?.length ?? 0 }}</span>
        </div>
        <!-- 敌方手牌（牌格化，待打出牌放大高亮） -->
        <div class="enemy-hand">
          <span v-if="Object.keys(combat.enemyHand || {}).length === 0" class="enemy-hand-empty">
            敌方手牌为空
          </span>
          <div
            v-for="(cnt, id) in combat.enemyHand"
            :key="id"
            class="enemy-card"
            :class="{ 'enemy-card--pending': combat.enemyPendingPlay?.cardId === id }"
          >
            <div class="card-name">{{ cardName(id) }}</div>
            <div class="card-cost">⚡{{ cardCost(id) }}</div>
            <div class="card-count">×{{ cnt }}</div>
          </div>
        </div>
        <!-- 敌方出牌大预览横幅 -->
        <div v-if="combat.enemyPendingPlay" class="enemy-banner">
          <span class="banner-label">👹 敌方出牌</span>
          <b class="banner-card">{{ cardName(combat.enemyPendingPlay.cardId) }}</b>
          <b class="banner-count">×{{ combat.enemyPendingPlay.count }}</b>
        </div>
        <!-- 敌方行动中提示 -->
        <div
          v-else-if="combat.phase === 'enemy-announce' || combat.phase === 'enemy-resolve'"
          class="enemy-acting"
        >
          👹 敌方行动中…
        </div>
        <div class="round-info">回合 {{ combat.round }}/30</div>
      </div>

      <!-- 抽 3 选 2：扑克选择 -->
      <div v-if="combat.phase === 'pick-poker'" class="poker-pick">
        <p class="pick-hint">
          选 2 张作行动力，剩 1 张为抽牌数（已选 {{ selectedActs.length }}/2）
        </p>
        <div class="poker-row">
          <button
            v-for="(p, i) in combat.pendingPoker"
            :key="i"
            class="poker-card"
            :class="{ 'poker--picked': selectedActs.includes(i) }"
            @click="onPickPoker(i)"
          >
            {{ p.rank }}{{ p.suit }}
          </button>
        </div>
        <!-- 选满 2 张后预览数值 + 确认 -->
        <div v-if="pokerPreview" class="poker-preview">
          <div class="preview-row">
            <span>⚡ 行动力：<b>{{ pokerPreview.actionPoints }}</b></span>
            <span class="preview-detail">
              （{{ pokerPreview.base }} + 斗志 {{ pokerPreview.spiritBonus }}）
            </span>
          </div>
          <div class="preview-row">
            <span>🃏 抽牌数：<b>{{ pokerPreview.drawCount }}</b></span>
            <span class="preview-detail">（{{ pokerPreview.drawCard }}{{ pokerPreview.drawSuit }}）</span>
          </div>
          <div class="preview-actions">
            <button class="solo-btn solo-btn--primary" @click="confirmPokerPick">
              ✅ 确认
            </button>
            <button class="solo-btn solo-btn--ghost" @click="resetPokerPick">
              重新选择
            </button>
          </div>
        </div>
      </div>

      <!-- 出牌阶段 -->
      <div v-else-if="combat.phase === 'play'" class="play-area">
        <div class="play-info">
          <span class="ap">⚡行动力 {{ combat.actionPoints }}</span>
          <span class="dc">🃏抽牌数 {{ combat.drawCount }}</span>
          <span class="plays">出牌 {{ combat.playsThisTurn }} 次</span>
        </div>

        <div class="hand-area">
          <div
            v-for="(cnt, id) in combat.playerHand"
            :key="id"
            class="hand-card"
            :class="{ 'hand--picking': pickingId === id }"
            @click="onPickCard(id)"
          >
            <div class="card-name">{{ cardName(id) }}</div>
            <div class="card-cost">⚡{{ cardCost(id) }}</div>
            <div class="card-count">×{{ cnt }}</div>
          </div>
          <p v-if="Object.keys(combat.playerHand).length === 0" class="empty-hand">手牌为空</p>
        </div>

        <!-- 数量选择器 -->
        <div v-if="pickingId" class="count-picker">
          <span>{{ cardName(pickingId) }} 打出数量：</span>
          <button @click="pickCount = Math.max(1, pickCount - 1)">−</button>
          <b>{{ pickCount }}</b>
          <button @click="pickCount = Math.min(combat.playerHand[pickingId], pickCount + 1)">＋</button>
          <button class="solo-btn solo-btn--small" @click="confirmPlay">打出</button>
          <button class="solo-btn solo-btn--small" @click="viewingCard = pickingId">📖 详情</button>
          <button class="solo-btn solo-btn--ghost" @click="cancelPick">取消</button>
        </div>

        <p v-if="battleMsg" class="battle-msg">{{ battleMsg }}</p>
        <button class="solo-btn solo-btn--end" @click="solo.doEndTurn()">⏭ 结束回合</button>
      </div>

      <!-- 最近打出队列（底部滚动条，敌黄我默认） -->
      <div class="played-queue-wrap">
        <div class="played-queue">
          <template v-for="(item, i) in combat?.playedQueue || []" :key="i">
            <span
              v-if="i > 0 && item.round !== (combat?.playedQueue || [])[i - 1].round"
              class="played-sep"
            ></span>
            <div
              class="played-item"
              :class="{ 'played--enemy': item.side === 'enemy' }"
              @click="selectedPlayed = item"
            >
              {{ cardName(item.cardId) }}×{{ item.count }}
            </div>
          </template>
          <span v-if="!(combat?.playedQueue || []).length" class="played-empty">
            暂无出牌记录
          </span>
        </div>
      </div>
    </section>

    <!-- 出牌详情弹层 -->
    <div v-if="selectedPlayed" class="played-detail" @click="selectedPlayed = null">
      <div class="played-detail__card" @click.stop>
        <h3 class="detail-title" :class="{ 'detail--enemy': selectedPlayed.side === 'enemy' }">
          {{ cardName(selectedPlayed.cardId) }}
        </h3>
        <p class="detail-desc">{{ cardFullDesc(selectedPlayed.cardId) }}</p>
        <p class="detail-meta">
          {{ selectedPlayed.side === "enemy" ? "👹 敌方打出" : "🗡 我方打出" }}
          ×{{ selectedPlayed.count }}
        </p>
        <button class="solo-btn solo-btn--small" @click="selectedPlayed = null">
          关闭
        </button>
      </div>
    </div>

    <!-- 手牌详情弹层（点「详情」查看） -->
    <div v-if="viewingCard" class="played-detail" @click="viewingCard = null">
      <div class="played-detail__card" @click.stop>
        <h3 class="detail-title">{{ cardName(viewingCard) }}</h3>
        <p class="detail-desc">{{ cardFullDesc(viewingCard) }}</p>
        <p class="detail-meta">
          手牌持有 ×{{ combat?.playerHand?.[viewingCard] || 0 }}
        </p>
        <button class="solo-btn solo-btn--small" @click="viewingCard = null">
          关闭
        </button>
      </div>
    </div>

    <!-- ═══ 胜利领卡 ═══ -->
    <section v-else-if="uiMode === 'reward'" class="solo-reward">
      <h2 class="panel-title">🎉 战斗胜利！</h2>
      <p class="reward-info">
        +{{ combat?.lastReward?.gold }} 金币 +{{ combat?.lastReward?.exp }} 经验
        <span v-if="combat?.lastReward?.attrPoint">+{{ combat.lastReward.attrPoint }} 属性点</span>
      </p>
      <!-- 已领卡：显示获得 + 前往下一节点 -->
      <template v-if="rewardClaimed">
        <p>✅ 已获得「{{ lastClaimedCard }}」</p>
        <button class="solo-btn solo-btn--primary" @click="goNext">
          ➡️ 前往下一节点（{{ nextNodeLabel }}）
        </button>
      </template>
      <!-- 未领卡：3 选 1 -->
      <template v-else>
        <p>选择一张卡加入牌库：</p>
        <div class="reward-row">
          <button
            v-for="id in rewardCandidates"
            :key="id"
            class="reward-card"
            @click="claim(id)"
          >
            <div class="card-name">{{ cardName(id) }}</div>
            <div class="card-cost">⚡{{ cardCost(id) }}</div>
            <div class="card-desc">{{ cardDesc(id) }}</div>
          </button>
        </div>
      </template>
    </section>

    <!-- ═══ 事件 ═══ -->
    <section v-else-if="uiMode === 'event'" class="solo-event">
      <h2 class="panel-title">{{ eventData?.title }}</h2>
      <p class="event-desc">{{ eventData?.desc }}</p>
      <!-- 结算结果 -->
      <div v-if="eventResult" class="event-result">
        <p>{{ eventResultText }}</p>
        <button class="solo-btn solo-btn--primary" @click="goNext">
          ➡️ 前往下一节点（{{ nextNodeLabel }}）
        </button>
      </div>
      <!-- 选项 -->
      <div v-else class="event-options">
        <button
          v-for="(opt, i) in eventData?.options"
          :key="i"
          class="solo-btn solo-btn--option"
          @click="resolveEvent(i)"
        >
          {{ opt.text }}
        </button>
      </div>
    </section>

    <!-- ═══ 商店 ═══ -->
    <section v-else-if="uiMode === 'shop'" class="solo-shop">
      <h2 class="panel-title">🛒 商店</h2>
      <div class="shop-section">
        <p><b>买卡</b>（普通 {{ SHOP_PRICE.buyCommon }} / 稀有 {{ SHOP_PRICE.buyRare }}）：</p>
        <div class="shop-cards">
          <button
            v-for="id in shopList"
            :key="id"
            class="shop-card"
            @click="buyCard(id)"
          >
            <span class="card-name">{{ cardName(id) }}</span>
            <span class="card-cost">⚡{{ cardCost(id) }}</span>
            <span class="card-price">{{ shopBuyPrice(id) }}💰</span>
          </button>
        </div>
      </div>
      <div class="shop-actions">
        <button class="solo-btn" @click="removePicker = true">🗑 删卡（{{ removePrice }}💰）</button>
        <button class="solo-btn" @click="heal()">💖 回满（{{ healPrice }}💰）</button>
      </div>
      <p v-if="shopMsg" class="battle-msg">{{ shopMsg }}</p>
      <button class="solo-btn solo-btn--primary" @click="solo.completeNode()">
        ➡️ 前往下一节点（{{ nextNodeLabel }}）
      </button>
    </section>

    <!-- 删卡选择弹层 -->
    <div v-if="removePicker" class="played-detail" @click="removePicker = false">
      <div class="played-detail__card" @click.stop>
        <h3 class="detail-title">🗑 选择要删除的卡（{{ removePrice }}💰）</h3>
        <div class="remove-list">
          <button
            v-for="(cnt, id) in player.deck"
            :key="id"
            class="solo-btn solo-btn--option"
            @click="removeCardPick(id)"
          >
            {{ cardName(id) }} ×{{ cnt }}
          </button>
          <p v-if="Object.keys(player.deck).length === 0" class="enemy-hand-empty">
            牌库为空，无卡可删
          </p>
        </div>
        <button class="solo-btn solo-btn--small" @click="removePicker = false">
          取消
        </button>
      </div>
    </div>

    <!-- ═══ 营地 ═══ -->
    <section v-else-if="uiMode === 'camp'" class="solo-camp">
      <h2 class="panel-title">🏕️ 营地</h2>
      <p>休整一番：回血或升级一张卡</p>
      <div class="camp-actions">
        <button class="solo-btn" @click="campHeal()">💖 回满（{{ healPrice }}💰）</button>
        <button
          v-for="(cnt, id) in player.deck"
          :key="id"
          class="solo-btn solo-btn--ghost"
          @click="campUpgrade(id)"
        >
          ⬆ {{ cardName(id) }}（{{ SHOP_PRICE.upgrade }}💰）
        </button>
      </div>
      <p v-if="shopMsg" class="battle-msg">{{ shopMsg }}</p>
      <button class="solo-btn solo-btn--primary" @click="solo.completeNode()">
        ➡️ 前往下一节点（{{ nextNodeLabel }}）
      </button>
    </section>

    <!-- ═══ 结算 ═══ -->
    <section v-else-if="uiMode === 'gameover'" class="solo-gameover">
      <h2 class="panel-title" :class="soloState.victory ? 'title-win' : 'title-lose'">
        {{ soloState.victory ? "🏆 通关！" : "💀 游戏结束" }}
      </h2>
      <p>等级 {{ player.level }} · 金币 {{ player.gold }} · 牌库 {{ deckTotal }} 张</p>
      <div class="gameover-actions">
        <button class="solo-btn solo-btn--primary" @click="restart">🔄 再来一局</button>
        <button class="solo-btn solo-btn--ghost" @click="goMenu">🏠 返回主菜单</button>
      </div>
    </section>

    <!-- 开发日志（钱袋连点 3 下打开） -->
    <DevLogPanel ref="devLogRef" :entries="soloState.devLog.entries" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { SOLO_CARDS, SOLO_ENEMIES, SHOP_PRICE, CARD_RARITY, DEFAULT_CHAR_ID, NODE_META } from "./logic/soloConstants.js";
import { rollCardCandidates, shopCatalog } from "./logic/solo.js";
import { SOLO_EVENTS } from "./logic/soloEvents.js";
import DevLogPanel from "../components/DevLogPanel.vue";
import { useSoundSync } from "../bridge/useSoundSync.js";

onMounted(() => {
  // 调试钩子：浏览器控制台可查 solo 状态（window.__SOLO_STATE__）
  window.__SOLO_STATE__ = soloState;
});

// 音效桥接：监听 soloState.soundQueue → SoundManager 播放
// 放在 setup 顶层（组件作用域内），卸载时 watch 自动清理，避免重复叠加
useSoundSync(soloState);

const props = defineProps({ solo: { type: Object, required: true } });
const emit = defineEmits(["quit"]);
const solo = props.solo;

const player = computed(() => soloState.player);
const combat = computed(() => soloState.combat);
// 顶层解构 ref/reactive：嵌套在 props 对象里的 ref 模板不会自动解包，必须提为顶层变量
const uiMode = solo.uiMode;
const battleMsg = solo.battleMsg;
const soloState = solo.soloState;
const eventResult = solo.eventResult;
const rewardClaimed = solo.rewardClaimed;

// 下一节点标签 + 前往
const nextNodeLabel = computed(() => solo.nextNodeInfo()?.label || "？");
function goNext() {
  solo.goNext();
}

// 事件结算文案
const eventResultText = computed(() => {
  const r = eventResult.value;
  if (!r) return "";
  if (r.outcome?.dead) return "💀 你在事件中倒下了…";
  const parts = [];
  if (r.outcome?.note) parts.push(r.outcome.note);
  if (r.outcome?.gold) parts.push(`金币 ${r.outcome.gold > 0 ? "+" : ""}${r.outcome.gold}`);
  if (r.outcome?.hp) parts.push(`HP ${r.outcome.hp > 0 ? "+" : ""}${r.outcome.hp}`);
  if (r.outcome?.gainedCard) parts.push(`获得卡牌「${cardName(r.outcome.gainedCard)}」`);
  if (r.outcome?.removedCard) parts.push(`失去卡牌「${cardName(r.outcome.removedCard)}」`);
  if (r.check && !r.check.success) parts.push(`（检定失败：${r.check.total} vs DC${r.check.dc}）`);
  return parts.join("，") || "事件完成";
});

// 已领卡牌名
const lastClaimedCard = computed(() => {
  const c = combat.value;
  return c?.lastReward?.claimedCard || "";
});

// 出牌详情弹层
const selectedPlayed = ref(null);
// 手牌详情弹层（点「📖 详情」查看）
const viewingCard = ref(null);
/** 完整卡牌效果描述（详情弹层用） */
function cardFullDesc(id) {
  const c = SOLO_CARDS[id];
  if (!c) return "";
  const typeName = {
    physical: "物理",
    magic: "法术",
    defense: "防御",
    utility: "功能",
  }[c.type];
  const parts = [`【${typeName}】`, `行动力 ${c.cost}`];
  if (c.hits) parts.push(`${c.base} 伤害×${c.hits} 段 + 力量修正`);
  else if (c.type === "physical") parts.push(`${c.base} 伤害 + 力量修正`);
  else if (c.type === "magic" && c.heal) parts.push(`回复 ${c.base} HP + 法力修正`);
  else if (c.type === "magic") parts.push(`${c.base} 效果 + 法力修正`);
  else if (c.type === "defense") parts.push(`获得 ${c.base} 护盾 + 防御修正`);
  if (c.armorPen) parts.push(`穿透 ${c.armorPen} 护盾`);
  if (c.actionDrain) parts.push(`目标下回合行动力 -${c.actionDrain}`);
  if (c.actionRefund) parts.push(`回复 ${c.actionRefund} 行动力`);
  if (c.fightingSpirit) parts.push(`斗志 +${c.fightingSpirit}`);
  if (c.drawBonus) parts.push(`补抽 ${c.drawBonus} 张`);
  return parts.join(" · ");
}

// 玩家 HP 伤害飘字（敌方攻击时显示 -X）
const hpFlash = ref(null);
watch(
  () => player.value.hp,
  (now, prev) => {
    if (prev > now) {
      const key = Date.now();
      hpFlash.value = { dmg: prev - now, key };
      setTimeout(() => {
        if (hpFlash.value?.key === key) hpFlash.value = null;
      }, 1100);
    }
  },
);

// 扑克选择（选 2 张 → 预览 → 确认）
const selectedActs = ref([]);
function onPickPoker(i) {
  const c = combat.value;
  if (!c) return;
  const picked = selectedActs.value;
  if (picked.includes(i)) {
    selectedActs.value = picked.filter((x) => x !== i);
    return;
  }
  if (picked.length < 2) {
    selectedActs.value = [...picked, i];
  }
  // 选满 2 张后等待玩家点「确认」（第 3 张自动为抽牌数）
}
function resetPokerPick() {
  selectedActs.value = [];
}
/** 选牌数值预览（选满 2 张时显示） */
const pokerPreview = computed(() => {
  const c = combat.value;
  if (!c || c.phase !== "pick-poker" || selectedActs.value.length !== 2) {
    return null;
  }
  const poker = c.pendingPoker;
  if (!poker || poker.length !== 3) return null;
  const [a, b] = selectedActs.value;
  const drawIdx = [0, 1, 2].find((i) => !selectedActs.value.includes(i));
  const base = poker[a].value + poker[b].value;
  const spiritBonus = Math.floor(c.fightingSpirit / 5); // 每 5 层斗志 +1 行动力
  return {
    actionPoints: base + spiritBonus,
    base,
    spiritBonus,
    drawCount: poker[drawIdx].value,
    drawCard: poker[drawIdx].rank,
    drawSuit: poker[drawIdx].suit,
  };
});
function confirmPokerPick() {
  const c = combat.value;
  const picked = selectedActs.value;
  if (!c || picked.length !== 2) return;
  const drawIdx = [0, 1, 2].find((i) => !picked.includes(i));
  solo.doPickPoker(picked[0], picked[1], drawIdx);
  selectedActs.value = [];
}

// 出牌数量选择
const pickingId = ref(null);
const pickCount = ref(1);
function onPickCard(id) {
  pickingId.value = pickingId.value === id ? null : id;
  pickCount.value = 1;
}
function confirmPlay() {
  solo.doPlayCard(pickingId.value, pickCount.value);
  pickingId.value = null;
}
function cancelPick() {
  pickingId.value = null;
}

// 奖励候选
const rewardCandidates = ref([]);
watch(
  () => uiMode.value,
  (m) => {
    if (m === "reward") {
      const rarity = combat.value?.lastReward?.rarity || "common";
      rewardCandidates.value = rollCardCandidates(rarity);
    }
    if (m === "map" || m === "battle") selectedActs.value = [];
  },
);
function claim(id) {
  solo.claimReward(id);
}

// 事件
const eventData = computed(() => {
  const node = soloState.mapNodes[soloState.nodeIndex];
  return node?.type === "event" ? SOLO_EVENTS[node.eventId] : null;
});
function resolveEvent(i) {
  solo.resolveEventOption(i);
}

// 商店
const shopList = computed(() => shopCatalog(soloState));
const shopMsg = ref("");
function buyCard(id) {
  const r = solo.doShopBuy(id);
  shopMsg.value = r.ok ? `买了 ${cardName(id)}` : r.reason || "";
}
const removePrice = computed(() => {
  return (
    SHOP_PRICE.removeBase +
    soloState.player.removedCount * SHOP_PRICE.removeIncrement
  );
});
// 删卡选择弹层
const removePicker = ref(false);
function removeCardPick(id) {
  const r = solo.doShopRemove(id);
  shopMsg.value = r.ok ? `删掉了 ${cardName(id)}` : r.reason || "";
  removePicker.value = false;
}
const healPrice = computed(() => {
  const need = player.value.maxHp - player.value.hp;
  return Math.ceil(need / SHOP_PRICE.healPer5) * SHOP_PRICE.healPer5;
});
function heal() {
  const r = solo.doShopHeal();
  shopMsg.value = r.ok ? `回复 ${r.healed} HP` : r.reason || "";
}

// 营地
function campHeal() {
  const r = solo.doCampHeal();
  shopMsg.value = r.ok ? `回复 ${r.healed} HP` : r.reason || "";
}
function campUpgrade(id) {
  const r = solo.doCampUpgrade(id);
  shopMsg.value = r.ok ? `升级了 ${cardName(id)}` : r.reason || "";
}

// 结算
const deckTotal = computed(() =>
  Object.values(player.value.deck).reduce((a, b) => a + b, 0),
);
function restart() {
  solo.initSolo(DEFAULT_CHAR_ID);
}
function goMenu() {
  solo.quitSolo();
  emit("quit");
}

// 保存并退出（回主菜单，主菜单可「继续单机」读档）
function saveAndQuit() {
  solo.saveSolo();
  goMenu();
}

// 开发日志：钱袋连点 3 下（2 秒内）打开，点击时显示进度
const devLogRef = ref(null);
const goldClicks = ref(0);
let goldClickTimer = null;
function onGoldClick() {
  goldClicks.value += 1;
  if (goldClickTimer) clearTimeout(goldClickTimer);
  if (goldClicks.value >= 3) {
    devLogRef.value?.toggleDevLog();
    goldClicks.value = 0;
  } else {
    goldClickTimer = setTimeout(() => {
      goldClicks.value = 0;
    }, 2000);
  }
}

// 工具
function cardName(id) {
  return SOLO_CARDS[id]?.name || id;
}
function cardCost(id) {
  return SOLO_CARDS[id]?.cost ?? 0;
}
function cardDesc(id) {
  const c = SOLO_CARDS[id];
  if (!c) return "";
  if (c.heal) return `回复 ${c.base}+法力 HP`;
  if (c.type === "physical") return `${c.base}+力量 伤害`;
  if (c.type === "magic") return `${c.base}+法力 效果`;
  if (c.type === "defense") return `获得 ${c.base}+防御 护盾`;
  return "特殊效果";
}
function cardRarity(id) {
  return CARD_RARITY[id] || "common";
}
/** 商店买卡价格（按稀有度表） */
function shopBuyPrice(id) {
  return cardRarity(id) === "rare"
    ? SHOP_PRICE.buyRare
    : SHOP_PRICE.buyCommon;
}
function nodeIcon(node) {
  return NODE_META[node.type]?.icon || "•";
}
function nodeName(node) {
  return NODE_META[node.type]?.name || node.type;
}
</script>

<style scoped>
.solo-shell {
  max-width: 720px;
  margin: 0 auto;
  padding: 12px;
  color: #eee;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}
.solo-hud {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 10px;
  font-size: 14px;
}
.hud-left, .hud-right { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.hud-hp { color: #ff6b6b; }
.hud-gold { color: #ffd93d; cursor: pointer; user-select: none; }
.gold--active { transform: scale(1.15); color: #fff; }
.gold-progress { color: #ffd93d; font-size: 11px; margin-left: 2px; }
.hud-lv { color: #6c5ce7; }
.hud-attrs { color: #74b9ff; }
.hud-spirit { color: #ff9f43; }
.hud-node { color: #888; }
.hud-save { margin-left: 4px; background: #6c5ce7; color: #fff; }
.attr-panel {
  background: #2d3436;
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
}
.panel-title { font-size: 18px; margin: 8px 0; color: #dfe6e9; }

.solo-btn {
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 14px;
  cursor: pointer;
  background: #2d3436;
  color: #dfe6e9;
}
.solo-btn--primary { background: #1976d2; color: #fff; }
.solo-btn--ghost { background: transparent; border: 1px solid #555; }
.solo-btn--small { padding: 4px 10px; font-size: 13px; }
.solo-btn--end { margin-top: 10px; width: 100%; background: #e17055; color: #fff; }
.solo-btn--option { width: 100%; margin: 6px 0; text-align: left; }

/* 地图 */
.solo-map { text-align: center; }
.node-chain { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
.node-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 8px 12px;
  opacity: 0.5;
}
.node--current { opacity: 1; border-color: #1976d2; }
.node--done { opacity: 0.7; }
.node-icon { font-size: 18px; }
.deck-preview { margin-top: 10px; font-size: 13px; color: #aaa; text-align: left; }
.deck-chip {
  display: inline-block;
  background: #2d3436;
  border-radius: 4px;
  padding: 2px 6px;
  margin: 2px;
}

/* 战斗 */
.enemy-panel { background: #1a1a2e; border-radius: 10px; padding: 10px; margin-bottom: 10px; }
.enemy-name { font-size: 16px; font-weight: bold; color: #ff6b6b; }
.hp-bar { height: 8px; background: #333; border-radius: 4px; overflow: hidden; margin: 6px 0; }
.hp-fill { height: 100%; background: #e17055; transition: width 0.3s; }
.enemy-spirit { color: #ff9f43; margin-left: 6px; }
.round-info { font-size: 12px; color: #888; }
.enemy-stats { display: flex; gap: 12px; font-size: 13px; color: #ccc; margin: 4px 0; }
.enemy-hand { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.enemy-card {
  width: 84px;
  background: #1a1a2e;
  border: 2px solid #444;
  border-radius: 8px;
  padding: 4px;
  text-align: center;
  font-size: 12px;
  transition: transform 0.15s, border-color 0.15s;
}
.enemy-card--pending {
  border-color: #ffd93d;
  background: #4a3b1a;
  transform: scale(1.12);
  animation: enemy-pulse 0.6s ease-in-out infinite;
  z-index: 2;
}
.enemy-hand-empty { font-size: 12px; color: #666; }
.enemy-banner {
  margin-top: 6px;
  background: #3a2a0e;
  border: 1px solid #ffd93d;
  border-radius: 8px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.banner-label { color: #ff9f43; }
.banner-card { color: #fff; font-size: 16px; }
.banner-count { color: #ffd93d; font-size: 16px; }
.enemy-acting { font-size: 13px; color: #ff9f43; margin-top: 4px; min-height: 18px; }
@keyframes enemy-pulse {
  0%, 100% { transform: scale(1.12); }
  50% { transform: scale(1.2); }
}
.hp-flash {
  display: inline-block;
  color: #ff6b6b;
  font-weight: bold;
  font-size: 16px;
  margin-left: 6px;
  animation: hp-float 1.1s ease-out forwards;
}
@keyframes hp-float {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-18px); }
}

/* 最近打出队列 */
.played-queue-wrap {
  margin-top: 12px;
  border-top: 1px solid #333;
  padding-top: 8px;
}
.played-queue {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  min-height: 34px;
}
.played-item {
  flex-shrink: 0;
  background: #2d3436;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
  color: #dfe6e9;
  white-space: nowrap;
  transition: transform 0.1s;
}
.played-item:hover { transform: scale(1.06); }
.played-sep {
  flex-shrink: 0;
  width: 2px;
  align-self: stretch;
  background: #1976d2;
  opacity: 0.6;
  margin: 2px 1px;
}
.played--enemy {
  border-color: #ffd93d;
  color: #ffd93d;
  background: #3a2f10;
}
.played-empty { color: #666; font-size: 12px; padding: 6px; }

/* 出牌详情弹层 */
.played-detail {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.played-detail__card {
  background: #1a1a2e;
  border: 1px solid #555;
  border-radius: 12px;
  padding: 16px 20px;
  max-width: 320px;
  width: 90%;
  text-align: center;
}
.detail-title { margin: 0 0 8px; font-size: 18px; color: #fff; }
.detail--enemy { color: #ffd93d; }
.detail-desc { color: #ccc; font-size: 14px; line-height: 1.6; margin: 8px 0; }
.detail-meta { color: #888; font-size: 13px; margin-bottom: 10px; }
.remove-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }

.poker-pick { text-align: center; margin: 10px 0; }
.pick-hint { font-size: 14px; color: #aaa; }
.poker-row { display: flex; justify-content: center; gap: 12px; margin: 10px 0; }
.poker-card {
  width: 64px;
  height: 88px;
  border-radius: 8px;
  border: 2px solid #666;
  background: #fff;
  color: #1a1a2e;
  font-size: 20px;
  font-weight: bold;
  cursor: pointer;
}
.poker--picked { border-color: #1976d2; background: #bbdefb; transform: translateY(-6px); }

.poker-preview {
  margin: 10px auto 0;
  max-width: 340px;
  background: #1a1a2e;
  border: 1px solid #1976d2;
  border-radius: 8px;
  padding: 10px 14px;
  text-align: left;
}
.preview-row { display: flex; gap: 8px; align-items: baseline; font-size: 14px; margin: 4px 0; }
.preview-row b { color: #ffd93d; }
.preview-detail { color: #888; font-size: 12px; }
.preview-actions { display: flex; gap: 8px; margin-top: 10px; }

.play-info { display: flex; gap: 14px; margin: 8px 0; font-size: 14px; }
.ap { color: #ffd93d; }
.dc { color: #74b9ff; }
.plays { color: #aaa; }

.hand-area { display: flex; flex-wrap: wrap; gap: 8px; min-height: 90px; }
.hand-card {
  width: 92px;
  background: #1a1a2e;
  border: 2px solid #444;
  border-radius: 8px;
  padding: 6px;
  text-align: center;
  cursor: pointer;
}
.hand--picking { border-color: #ffd93d; }
.card-name { font-size: 13px; font-weight: bold; }
.card-cost { font-size: 12px; color: #ffd93d; }
.card-count { font-size: 12px; color: #74b9ff; }
.empty-hand { color: #666; }
.count-picker { display: flex; gap: 8px; align-items: center; margin: 8px 0; font-size: 14px; }
.battle-msg { color: #ff7675; font-size: 13px; }

/* 奖励 */
.solo-reward { text-align: center; }
.reward-info { color: #ffd93d; }
.reward-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 10px; }
.reward-card {
  width: 110px;
  background: #1a1a2e;
  border: 2px solid #1976d2;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  color: #eee;
}
.card-desc { font-size: 12px; color: #aaa; margin-top: 4px; }

/* 事件 */
.solo-event { text-align: left; }
.event-desc { background: #1a1a2e; border-radius: 8px; padding: 10px; color: #ccc; }

/* 商店 */
.shop-section { margin-bottom: 10px; }
.shop-cards { display: flex; flex-wrap: wrap; gap: 8px; }
.shop-card {
  background: #1a1a2e;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  display: flex;
  gap: 8px;
  align-items: center;
  color: #eee;
}
.card-price { color: #ffd93d; }
.shop-actions, .camp-actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }

/* 结算 */
.solo-gameover { text-align: center; padding-top: 30px; }
.title-win { color: #ffd93d; }
.title-lose { color: #ff6b6b; }
.gameover-actions { display: flex; gap: 10px; justify-content: center; margin-top: 16px; }
</style>
