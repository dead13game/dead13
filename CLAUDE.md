# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

亡命十三街 — 基于扑克牌的多人对战游戏。Vue 3 驱动 UI，PixiJS v8 渲染牌桌，GSAP 负责动画，Tauri 打包桌面端。

## 常用命令

```bash
npm run dev          # Vite 开发服务器
npm run build        # 生产构建（vite build → postbuild 内联 JS/CSS）
npm run preview      # 预览构建产物
npm run tauri:dev    # Tauri 桌面开发模式
npm run tauri:build  # Tauri 桌面打包
```

**打包分发：** `npm run build` 后，`dist/` 目录可直接通过 `dist.zip` 分享（内联了 JS/CSS，双击 `index.html` 即可运行）。打包用 PowerShell：
```powershell
Compress-Archive -Path dist\* -DestinationPath dist.zip -Force
```

## 架构分层

```
App.vue (开场动画 → 选角界面 → 游戏界面)
  ├─ GameSetup.vue    选角/人数/天气开关
  └─ GameShell.vue    游戏主壳
       ├─ GameCanvas.vue       PixiJS Canvas 层
       ├─ ActionBar.vue        底部操作栏（攻击/防御/赌命/技能/结盟）
       ├─ LogPanel.vue         战报日志
       └─ GameOverPanel.vue    结算面板

src/game/          → 纯逻辑层（零依赖，不引用 Vue/PIXI）
  gameState.js        核心：状态机 + 所有游戏操作（1200行，待拆分）
  constants.js        角色数据 CHARACTERS、阶段 PHASE、步骤 STEP、天气
  deck.js             扑克牌创建/洗牌/抽牌

src/bridge/       → Vue ↔ PIXI 桥接层
  usePixiSync.js      监听 gameState 变化 → 调用 PIXIManager 更新渲染
  useAnimationFlow.js 监听 gameState 变化 → 触发 GSAP 动画 + 粒子

src/pixi/         → PIXI 渲染层
  core/PIXIManager.js    Application 管理、场景构建、粒子系统
  entities/              牌桌精灵、卡牌精灵、牌库精灵
  layout/TableLayout.js  自适应布局（2-4人单行，5-8人双行）
  effects/               粒子特效系统

src/composables/  → Vue 组合式函数
  useGameController.js  顶层游戏流程（选角→开始→重置）
  usePixiApp.js         PixiJS Application 初始化
```

## 核心设计原则

- **`src/game/` 是纯逻辑层，不动。** 游戏规则、状态机、所有操作函数都在这里，不依赖任何框架。
- **单向数据流：** `gameState` (Vue reactive) → `usePixiSync` 监听变化 → `PIXIManager` 更新渲染。
- **动画通过 `useAnimationFlow`** 自动监听 state 变化触发，不对游戏逻辑造成影响。
- **新机制用通用标记**（如 `endTurn` 控制回合推进），而非各角色各自处理特殊逻辑。
- **`endTurn` 模式：** 执行完行动后，`endTurn=true` → 推进到下一玩家；`endTurn=false` → 留在当前玩家获得额外行动。

## 游戏状态机

```
PHASE: SETUP → PEACE(前N回合禁攻) → NORMAL(战斗) → GAME_OVER
STEP:  pickAction → attackShowCard → pickTarget → ... → pickAction
```

`STEP` 驱动 UI 显示不同的操作面板（ActionBar 中 `v-if` 判断 `state.step`）。

## 关键技术细节

### PixiJS v8
- `Application`、`Container`、`Graphics`、`Text` 都需要**显式 import**，v8 不再挂全局。
- Canvas 元素必须 `position: fixed; z-index: 1; pointer-events: none` 覆盖在 Vue DOM 上方。

### Vue 3 `<script setup>`
- `defineExpose` 暴露的值必须是 `ref`/`shallowRef`，普通变量不会随赋值更新。

### GSAP
- 动画 PixiJS 对象时 `scaleX`/`scaleY` 无效，用 `sprite.scale.x` / `sprite.scale.y`。

### CSS
- `position: fixed` 伪元素会覆盖普通流 DOM，body/app 需要明确的 z-index 层级。

### 构建
- `postbuild.mjs` 将 JS 和 CSS 内联到 `index.html`，但 **PixiJS Web Worker 文件保留外部引用**（Web Worker 无法内联）。
- `images/` 目录在 postbuild 时复制到 `dist/images/`。
