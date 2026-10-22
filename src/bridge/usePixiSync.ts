import { watch } from "vue";
import type { Card } from "../game/types.js";
import type { PlayerView, ViewModel } from "../game/view.js";

/**
 * `usePixiSync` 只需要 PIXIManager 的同步接口。
 *
 * 为什么不在桥接层直接 import PIXIManager：`src/pixi/` 与这里并行迁移，
 * 桥接层只依赖「被调用的方法」这一稳定契约，避免两边的迁移互相阻塞。
 */
export interface PixiSyncManager {
  updateDeckCount(count: number): void;
  updateAllPlayers(players: PlayerView[], currentIndex: number): void;
  buildScene(players: PlayerView[], deckCount: number): void;
  showCenterCard(card: Card | null, extraCards?: Card[]): void;
  hideCenterCard(): void;
}

/**
 * Vue reactive state → PIXI 渲染同步
 *
 * 消费的是 `buildView(state)` 的只读 ViewModel（UI/PIXI 的唯一数据源）。
 */
export function usePixiSync(
  state: ViewModel,
  getManager: () => PixiSyncManager | null | undefined,
): void {
  // 辅助：安全获取 manager
  const safeSync = (fn: (m: PixiSyncManager) => void) => {
    const m = getManager();
    if (!m) return;
    fn(m);
  };

  // 1. 牌库数量
  watch(
    () => state.deck.length,
    (count) => safeSync((m) => m.updateDeckCount(count)),
  );

  // 2. 当前玩家切换 → 更新高亮
  watch(
    () => state.currentPlayerIndex,
    () => {
      safeSync((m) =>
        m.updateAllPlayers(state.players, state.currentPlayerIndex),
      );
    },
  );

  // 3. 整体状态刷新（玩家列表/HP/防御/陷阱/当前玩家切换等）
  //    使用深度监听，任何玩家相关变化都触发全量刷新
  watch(
    () => {
      // 构建一个快照对象，Vue 会自动追踪所有访问的响应式属性
      return state.players.map((p) => ({
        index: p.index,
        characterId: p.characterId,
        hp: p.hp,
        alive: p.alive,
        defenseLen: p.defensePile.length,
        defenseIds: p.defensePile.map(
          (c) => c.id + "-" + c.value + "-" + (c.faceUp ? "1" : "0"),
        ),
        trap: p.trap ? p.trap.id + "-" + p.trap.value : null,
        bait: p.bait ? p.bait.id + "-" + p.bait.value : null,
        fightingSpirit: p.fightingSpirit,
        moonPhase: p.moonPhase,
        extraAction: p.statusEffects.extraAction,
        ignoreTrapThisTurn: p.statusEffects.ignoreTrapThisTurn,
      }));
    },
    () => {
      safeSync((m) =>
        m.updateAllPlayers(state.players, state.currentPlayerIndex),
      );
    },
    { deep: true },
  );

  // 3. 攻击牌展示
  watch(
    () => state.pendingAttackCard,
    (card) => {
      safeSync((m) => {
        if (card && state.step === "attackShowCard") {
          const extraCards = state.pendingVentiCards || [];
          m.showCenterCard(card, extraCards);
        } else if (!card) {
          m.hideCenterCard();
        }
      });
    },
  );

  // 4. 玩家列表结构变化（重开游戏/增减玩家）
  watch(
    () => state.players.length,
    () => {
      safeSync((m) => m.buildScene(state.players, state.deck.length));
    },
  );
}
