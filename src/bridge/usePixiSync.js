import { watch } from 'vue'

/**
 * Vue reactive state → PIXI 渲染同步
 */
export function usePixiSync(state, getManager) {
  // 辅助：安全获取 manager
  const safeSync = (fn) => {
    const m = getManager()
    if (!m) return
    fn(m)
  }

  // 1. 牌库数量
  watch(
    () => state.deck.length,
    (count) => safeSync(m => m.updateDeckCount(count))
  )

  // 2. 整体状态刷新（玩家列表/HP/防御/陷阱/当前玩家切换等）
  //    使用深度监听，任何玩家相关变化都触发全量刷新
  watch(
    () => {
      // 构建一个快照对象，Vue 会自动追踪所有访问的响应式属性
      return state.players.map(p => ({
        index: p.index,
        hp: p.hp,
        alive: p.alive,
        defenseLen: p.defensePile.length,
        defenseIds: p.defensePile.map(c => c.id + '-' + c.value + '-' + (c.faceUp ? '1' : '0')),
        trap: p.trap ? (p.trap.id + '-' + p.trap.value) : null,
        bait: p.bait ? (p.bait.id + '-' + p.bait.value) : null,
        fightingSpirit: p.fightingSpirit,
        moonPhase: p.moonPhase,
        extraAction: p.extraAction,
        ignoreTrapThisTurn: p.ignoreTrapThisTurn
      }))
    },
    () => {
      safeSync(m => m.updateAllPlayers(state.players, state.currentPlayerIndex))
    },
    { deep: true }
  )

  // 3. 攻击牌展示
  watch(
    () => state.pendingAttackCard,
    (card) => {
      safeSync(m => {
        if (card && state.step === 'attackShowCard') {
          const extraCards = state.pendingVentiCards || []
          m.showCenterCard(card, extraCards)
        } else if (!card) {
          m.hideCenterCard()
        }
      })
    }
  )

  // 4. 玩家列表结构变化（重开游戏/增减玩家）
  watch(
    () => state.players.length,
    () => {
      safeSync(m => m.buildScene(state.players, state.deck.length))
    }
  )
}
