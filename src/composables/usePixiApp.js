import { inject, provide } from 'vue'

const PIXI_KEY = Symbol('pixi-app')

/** 提供 PixiJS Manager 实例（在 GameShell 中调用） */
export function providePixiApp(managerRef) {
  provide(PIXI_KEY, managerRef)
}

/** 注入 PixiJS Manager 实例（子组件中使用） */
export function usePixiApp() {
  const app = inject(PIXI_KEY, null)
  return app
}
