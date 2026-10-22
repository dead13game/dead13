# TypeScript 迁移说明

> 本文件记录 JS→TS 全量迁移的目标、约定与进度。**新代码一律按本文件的约定写。**

## 1. 目标与验收标准

| 项 | 终点 |
| --- | --- |
| 源码 | 无 `.js`（`allowJs: false`），全部 `.ts` / `.tsx` / `<script setup lang="ts">` |
| 类型严格度 | `strict: true`，**禁止裸 `any`**（拿不准用 `unknown` + 收窄） |
| 构建 | Vite 不变（esbuild 只擦类型，不改产物语义） |
| 类型检查 | `npm run typecheck`（= `vue-tsc --noEmit`）必须 0 错误 |
| 行为 | `npm run test` 276 条全绿；差分回放（`testing/next-replay.test.ts`）逐位一致 |

## 2. 命令

```bash
npm run typecheck    # 类型检查（vue-tsc --noEmit）
npm run test         # 单元测试（vitest run）
```

`build` 刻意**不**串 `typecheck`：线上部署不应因一处类型瑕疵而中断，类型门禁交给 CI / 提交前自检。

## 3. 目录与类型归属

| 位置 | 内容 |
| --- | --- |
| `src/game/types.ts` | 跨模块共享的内核契约：`Card / Player / CharState / Pending / TurnState / GameState / ModeAdapter / Ctx / Rng / CharacterDef / GameLogger` |
| 各模块内部 | 只在本模块使用的 shape（例如 `flow/commands/` 的命令联合类型、`view.ts` 的 `ViewModel`） |

`src/game/types.ts` 里放的是**边界类型**，不是实现细节。加字段前先问：它是否需要跨模块共享？只在 `rules/` 用的东西就写在 `rules/` 里。

## 4. 硬性约定

1. **类型导入必须写 `import type`**（`verbatimModuleSyntax: true`）。
   否则 esbuild 会保留运行时 import，运行时可能报 "does not provide an export named 'X'"。
2. **import 路径保持 `.js` 后缀**，例如 `import { createDeck } from "./cards.js"`。
   TS（`moduleResolution: bundler`）与 Vite 都会解析到同名的 `.ts`。
   好处：迁移期可以逐个文件改名而不必同时改所有 import。
3. **拆分不了的类型关系用 `Pick` / 参数子集**，不要为了让测试通过而放宽生产签名。
   例：`core/player.ts` 的查询函数接收 `Pick<GameState, "players">`，测试就能只构造两个字段。
4. **不要用类型断言盖住设计问题**。允许的断言场景只有「外部输入（存档 JSON、pending.data）已收窄到明确 shape」，
   且必须紧跟一行中文注释说明不变量。
5. **`player.char` 是宽松索引签名（`number | undefined`）**。
   读它时按原代码的 `?? 0` 兜底习惯来，**不要为消错新增 `?? 0`**——那会把 `undefined` 变成 `0`，是运行时行为变更。

## 5. 分层护栏与 TS

`src/game/guard/layers.test.ts` 用正则扫描源码，检查 `src/game` 不 import vue/pixi/gsap、不使用 `document`/`localStorage`/`fetch` 等宿主 API。

- 扫描扩展名已从「仅 `.js`」改为 `.ts` + `.js`（迁移期并存）。
- **改名成 `.ts` 后若忘了同步这里，护栏会静默失效**——这是迁移中最隐蔽的坑。
- 护栏只认字面量，所以 `types.ts` 里不允许出现被禁的字符串（例如不要在注释里写 `from "vue"`）。

## 6. 进度

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| Phase 0 | 工具链（typescript / vue-tsc / @types/node）+ tsconfig + typecheck 脚本 | ✅ |
| Phase 1 | `src/game/`（76 个非测试文件 + 18 个测试文件） | ✅ 0 错误 |
| Phase 2 | `src/pixi/`、`src/solo/`、`src/audio/`、`src/data/`、`src/main.ts`、`src/bridge/`、`src/composables/` | ✅ 0 错误 |
| Phase 3 | 26 个 Vue SFC → `<script setup lang="ts">` | ✅ 0 错误 |
| Phase 4 | `allowJs: false`、配置文件 TS 化（`vite.config.ts` / `vitest.config.ts`）、审计与文档 | ✅ |

**终态**：`src/` 下 0 个 `.js`、0 个非 TS 的 `.vue`、0 个 `any` / `@ts-ignore`、`npm run typecheck` 0 错误、`npm run test` 276 全绿、`npm run build` 通过。

### 迁移期的两个契约决策

1. **AI 的入参是 `ViewModel` 而不是内核 `Player`。** `ai/` 读的是 `buildView()` 产出的旧字段形状（`skillUses` 平铺、`relations.allyIndex` 等），如果硬标 `Player` 就得改读取路径 = 改 AI 决策。因此 `types.ts` 末尾保留了 `AiViewPlayer` / `AiViewState` 的最小契约，`view.ts` 的 `PlayerView` 是它的超集。
2. **`ModeAdapter` 的少数钩子按「内核调用口径」声明，模式自有形状在各自工厂的返回接口里补。** 例如 `onNewRound/onRoundEnd` 的第二参在 `modes/*` 里是可选、在 `flow/turn.ts` 里是必传；`info` / `cardBonus` / `onMatchEnd` / `match` 由 `LeagueMode` / `BrawlMode` / `MatchMode` 等接口用 `Omit` + 具名类型收窄。这样内核侧只有一处 `ModeTurnHooks` 断言，而不是每个模式各写一遍。


## 7. 类型断言清单（全项目仅这些，审计基线）

迁移完成时的「逃生口」总量，后续若新增要能说清理由：

| 类别 | 数量 | 位置 | 性质 |
| --- | --- | --- | --- |
| `any` / `as any` / `@ts-ignore` / `@ts-expect-error` | **0** | — | 硬禁止 |
| `as unknown as` | 8 | `persistence/schema.ts`（3，通用 JSON 深拷贝泛型）、`diceWar.test.ts`（3，最小 state 夹具 / rng 工厂）、`leagueKernel.test.ts`（2，控制器 ref 收窄） | 全是「输入本就无法静态验证」的边界 |
| 模板内 `$event.target as HTMLInputElement/SelectElement` | 10 | `GameSetup.vue` / `LeagueSetup.vue` / `WorldCupSetup.vue` | lib.dom 的 `Event.target` 是 `EventTarget \| null`，原生事件处理器只能这样收窄；纯类型、构建产物无残留 |
| 非空断言 `x!.y` | 约 67 | 遍布各层 | 均为「上一行已判空」或「不变量保证存在」，多数紧邻中文注释 |

**禁止的是绕过类型系统的 `any`**；上面这些是有意的、可解释的收窄。

## 8. 已知坑

| 坑 | 说明 |
| --- | --- |
| `scripts/postbuild.mjs` | 迁移开始前该文件已被删除（未提交），`npm run build` 的 postbuild 段本来就断。迁移结束后需单独处理。 |
| TS 7（Go 原生版） | `vue-tsc@3` 尚不匹配，故锁 `typescript@5.9.x`。升级前先确认 `vue-tsc` 支持。 |
| `noUncheckedIndexedAccess` | 刻意**未开启**：会引入数百处 `arr[i]` 收窄噪音，收益低。如要开，单独一轮处理。 |
| 迁移期暴露的既有缺陷 | 见 [KNOWN_BUGS.md](KNOWN_BUGS.md) 的「TS 迁移期暴露并修掉的既有缺陷」一节（3 条已修 + 2 条待产品决策）。 |
