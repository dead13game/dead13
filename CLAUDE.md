# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

亡命十三街 — 基于扑克牌的多人对战游戏。Vue 3 驱动 UI，PixiJS v8 渲染牌桌，GSAP 负责动画，Tauri 打包桌面端。

**线上地址：** `https://drtion.github.io/dead4thirteen/`（GitHub Pages 自动部署）

## 常用命令

```bash
npm run dev          # Vite 开发服务器
npm run build        # 生产构建（vite build → postbuild 内联 JS/CSS）
npm run preview      # 预览构建产物
npm run tauri:dev    # Tauri 桌面开发模式
npm run tauri:build  # Tauri 桌面打包
git push             # 推送后 GitHub Actions 自动部署到 Pages
```

**分发：** 线上 URL 是最推荐的方式。离线分发：`npm run build` 后 `dist/` 可 zip 分享，但注意各浏览器对 file:// 协议支持不一致（见下文）。

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
  core/PIXIManager.js    Application 管理、场景构建、粒子系统、rebuildLayout()
  entities/              牌桌精灵、卡牌精灵、牌库精灵
  layout/TableLayout.js  自适应布局（横屏单/双行，竖屏1-2列网格）
  effects/               粒子特效系统

src/composables/  → Vue 组合式函数
  useGameController.js  顶层游戏流程（选角→开始→重置）
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

## 构建与部署

### 构建
- **`codeSplitting: false`** — 关键配置。PixiJS v8 环境检测用动态 `import()`，正常构建会产生 3 个外部 chunk（browserAll/init/webworkerAll）。file:// 协议下动态 import 被拦截导致 PIXI 初始化失败，所以必须关闭代码分割，所有代码合并到单一 bundle（739KB）。
- `postbuild.mjs` 将 JS 和 CSS 内联到 `index.html`，`<script type="module">` 保留以支持 `import.meta`。视频路径从 `amine-xxx.mp4` 修正为 `./assets/amine-xxx.mp4`。
- `images/` 目录在 postbuild 时复制到 `dist/images/`。

### file:// 协议兼容性（重要）

不同浏览器对 file:// 的 ES module 支持差异巨大：

| 环境 | 桌面 Chrome | Android 夸克 | QQ 浏览器 | iOS Safari/WKWebView |
|------|------------|-------------|----------|---------------------|
| file:// module | ✅ | ✅ | ❌ | ❌（禁所有子资源） |

**结论：不要依赖 file:// 分发。用线上 URL（GitHub Pages）或 `npm run preview` 本地服务器。** iOS WKWebView 彻底禁止 file:// 页面加载任何本地子资源（图片/视频/JS），无法绕过。

### GitHub Pages 部署
- Workflow: `.github/workflows/deploy.yml` — push 到 main 自动触发构建+部署
- 仓库: `drtion/dead4thirteen`
- 构建在 Ubuntu 上跑 `npm ci → npm run build`，产出直接部署到 Pages

## TableLayout 布局逻辑

| 屏幕 | 人数 | 布局 |
|------|------|------|
| 横屏 | 2-4人 | 单行水平排列，桌面 260×280 |
| 横屏 | 5-8人 | 双行网格，桌面 230×200 |
| 竖屏 | 2-3人 | 单列居中纵排，桌面自适应 |
| 竖屏 | 4人 | 2×2 网格 |
| 竖屏 | 5-6人 | 2列×3行 |
| 竖屏 | 7-8人 | 2列×4行，最小 130×160 |

竖屏时牌库和攻击展示区自动移到屏幕下方 35% 区域。顶部信息栏有 "⟳" 按钮可手动触发 `PIXIManager.rebuildLayout()` 重排。

## 已修复的 Bug

| Bug | 修复 |
|-----|------|
| 玛薇卡 `fightingSpirit` 永不重置 | `executeAttack`/`executeRaidenSkill` 攻击后清零 |
| `CardSprite._renderEmpty()` 首次调用 crash | 初始化 `_dashText=null` + `removeChild` 前空值检查 |
| `SUITS` 花色编码丢失（四个空字符串） | 恢复 `♠♥♦♣`，修复 `Card.vue` 和 `CardSprite.js` 红黑判重 |
| 冰封无限递归 | `nextPlayer` 加 `_depth` guard |
| 死代码 | 删 `usePixiApp.js`/`cardColor()`/`WEATHER` 数组 |

## 关键技术细节

### PixiJS v8
- `Application`、`Container`、`Graphics`、`Text` 都需要**显式 import**，v8 不再挂全局。
- Canvas 元素必须 `position: fixed; z-index: 1; pointer-events: none` 覆盖在 Vue DOM 上方。
- `resolution` 上限 2x（`Math.min(dpr, 2)`），避免移动端 3x 屏 GPU 过载。
- `buildScene()` 创建 TableLayout 时必须传 `renderer.width/resolution` 逻辑尺寸，不能用默认值。

### Vue 3 `<script setup>`
- `defineExpose` 暴露的值必须是 `ref`/`shallowRef`，普通变量不会随赋值更新。

### GSAP
- 动画 PixiJS 对象时 `scaleX`/`scaleY` 无效，用 `sprite.scale.x` / `sprite.scale.y`。

### CSS
- `position: fixed` 伪元素会覆盖普通流 DOM，body/app 需要明确的 z-index 层级。
- 移动端 `100dvh` 优于 `100vh`（iOS Safari 地址栏问题），但需保留 `100vh` fallback。
- iPhone 刘海屏需要 `env(safe-area-inset-*)` padding。
- 触控按钮最小 44×44px，间距 ≥ 8px。

### 移动端
- viewport: `viewport-fit=cover, maximum-scale=1.0, user-scalable=no`
- `touch-action: manipulation` 消除点击延迟
- `overscroll-behavior: none` 防下拉刷新
- `-webkit-tap-highlight-color: transparent` 去 iOS 点击高亮
