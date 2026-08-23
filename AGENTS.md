# Agent 工作流

亡命十三街 — 基于扑克牌的多人对战游戏。**当前阶段：Vue 3 + PixiJS + Tauri 版**（Godot 4.7 迁移已终止，`godot/` 已移除）。
本项目使用中文交流。本文件对参与开发的所有 AI session 有效。架构参考见 **CLAUDE.md**；本文件只定义工作流与分工。

---

**bug 报告格式**（人类 → AI）：`组件名 / 页面 / 现象`。例：
> "GameShell 的 LogPanel 右侧日志区空白，日志数组有内容但没显示"

AI **收到 bug 报告后负责定位与修复代码/结构**，修完交回验收，不自己开游戏调试。

## 原则

### 协作节奏

1. AI 产出结构/代码/初步 UI 布局 → 给验收清单
2. 人类验收 + 微调位置/动画手感 + 试玩找 bug
3. 人类指明 bug 组件 → AI 修复 → 回到 1

### 其他原则

- **每次 AI 调用带验收标准**：任务必须写明「做完我能怎么验证」
- **批量攒单**：把一周的活攒成一单一次性给 AI
- **AI 负责初步 UI 布局设计**：新 UI 区块/按钮/面板的初始位置、尺寸、间距由 AI 按审美判断给一版合理布局，不再留默认值等人类拖；改完给验收清单
- **视觉手感微调与验收归人类**：最终位置、动画、粒子、音效的手感微调与视觉验收是人类的活——微调 UI 报「组件名+效果」，不翻代码；AI 不自己开游戏试错，只用 `npm run test` 跑测试
- **分工省 80-90% token**：AI 自测 UI + 盲找 bug 要 10-20k token/功能；人类指明组件 + 给堆栈后 AI 1-3k 修完。往返从 3-5 轮变 1-2 轮，且零"看不到画面瞎指方向"的误导

## 架构分层（写代码必须遵守）

| 层 | 目录 | 职责 |
|---|---|---|
| 纯逻辑 | `src/game/`、`src/solo/logic/`、`src/simuniverse/logic/` | 状态机/规则/技能/AI — **零 Vue/PIXI/GSAP 依赖** |
| 桥接 | `src/bridge/` | watch gameState → 驱动 PIXI + GSAP + 音效 |
| 渲染 | `src/pixi/` | PixiJS v8 Application + 精灵 + 布局 + 粒子 |
| UI | `src/components/`、`src/solo/`、`src/simuniverse/` | Vue 3 组件（DOM 渲染，单向数据流） |

- **单向数据流**：`gameState` (reactive) → watch → 渲染。不反向操作
- **PixiJS 对象用 `shallowRef`，不用 `ref()`**；GSAP 动画用 `sprite.scale.x` 不是 `scaleX`
- **角色数据用 `getCharData(player)` 查表**，不直接读 `player.characterName` 等字段
- **Player 嵌套字段写完整路径**：`statusEffects.xxx` / `relations.xxx`

## 三、禁用操作（硬规则）

- **禁止**：`git push` / gh CLI / `git clone` / `git pull`（已写入 `reasonix.toml` 的 `[permissions] deny`）
- **允许**：本地 `git commit`
- push 一律由项目作者手动执行

## 四、行为准则 — 信息不足必须追问

1. Bug 报告太模糊 → 追问错误日志 / 复现步骤 / 预期 vs 实际
2. 功能需求不明确 → 追问技能效果 / 数值 / 次数限制
3. 多个可能原因时 → 列出假设，不赌一个去改
4. 第一次听说的问题 → 先追问细节，不直接动手
5. 拟定方案后先由用户审批
6. 尽可能避免硬编码
7. 善用 ask 工具：ask 不仅补足信息，还能帮用户梳理思路，无上限，不用担心 ask 太多

## 五、接口约定格式（任务开工前先定）

每个任务包开工前，先约定：

- **挂载点**：动画/飘字/粒子挂在哪个层/组件（如 `GameShell` → PIXI 场景 `PlayerSeats[0]`）
- **函数签名**：AI 提供哪些方法、参数是什么

```js
// 伤害飘字（AI 提供骨架，人类调样式）
// 挂载点: src/pixi/entities/PlayerTableSprite → damageLayer
addDamageNumber(text, x, y, color = 0xffffff) {}
```

## 常用命令

```bash
npm run dev          # Vite 开发服务器（人类验收用）
npm run test         # 218 条 vitest 测试（改 src/game/* 逻辑后必跑）
npm run build        # 生产构建（部署用）
npm run tauri:dev    # Tauri 桌面开发
```

## 调试

- 逻辑自测：`npm run test`（9 个测试文件，< 1s）
- 交互调试归人类（分工原则）；AI 只用测试/读代码
- 浏览器控制台：`[game]` 结构化日志（`window.__GAME_LOG_LEVEL__` 控制等级）、`window.__PIXI_APP__` 访问 PIXI 内部状态
