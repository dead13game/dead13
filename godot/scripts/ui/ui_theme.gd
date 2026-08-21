class_name UiTheme
## ============================================================================
## 亡命十三街 UI 视觉常量基座（阶段 0）
## 统一颜色/字号/间距，参考 Vue 版设计语言（src/pixi/core/constants.js、
## ActionBar.vue / GameShell.vue）+ 项目 Kenney Fantasy 基调。
## 用法：脚本里 UiTheme.GOLD / UiTheme.FONT_MD / UiTheme.GAP_SM 等。
## 字号硬性下限 26px（见 CLAUDE.md），本文件只做分级命名，不降低下限。
## ============================================================================

# ── 字号分级（下限 26）──
const FONT_MIN := 26            # 最小可用字号（硬性）
const FONT_SM := 26             # 辅助信息/状态/日志
const FONT_MD := 28             # 常规信息/提示
const FONT_LG := 32             # 顶栏信息/区块标题
const FONT_XL := 40             # 强调/回合数
const FONT_TITLE := 54          # 弹层标题
const FONT_HERO := 84           # 主菜单大标题

# ── 间距 ──
const GAP_XS := 6
const GAP_SM := 12
const GAP_MD := 16
const GAP_LG := 24
const MARGIN := 24              # 屏幕左右边距（场景统一）

# ── 主色（参考 Vue COLORS + Fantasy 暖调）──
const BG_DEEP := Color(0.03, 0.03, 0.12)      # 0x0a0a2e 深空底
const PANEL_BG := Color(0.031, 0.031, 0.118, 0.85)  # rgba(8,8,30,0.85) 底部栏
const FONT_WARM := Color(0.96, 0.93, 0.86)    # fantasy_theme_loader LABEL_FONT
const GOLD := Color(1.0, 0.85, 0.3)           # 名字/强调金色
const WEATHER_GOLD := Color(1.0, 0.835, 0.31) # #ffd54f 天气胶囊

# ── 行动语义色（Vue ActionBar 配色，Kenney Fantasy 边框内用）──
const ATK_RED := Color(0.898, 0.224, 0.208)   # #e53935 攻击
const DEF_GREEN := Color(0.263, 0.627, 0.278) # #43a047 防御
const GAMBLE_ORANGE := Color(0.984, 0.549, 0.0)  # #fb8c00 赌命
const ALLY_CYAN := Color(0.0, 0.671, 0.761)   # #00acc1 结盟
const BETRAY_DARKRED := Color(0.718, 0.11, 0.11) # #b71c1c 背刺
const SKILL_PURPLE := Color(0.482, 0.122, 0.639) # #7b1fa2 技能
const HOLY_ORANGE := Color(1.0, 0.561, 0.0)   # #ff8f00 圣言自明
const CANCEL_GRAY := Color(0.38, 0.38, 0.38)  # #616161 取消
const TARGET_BLUE := Color(0.082, 0.396, 0.753) # #1565c0 目标
const CURRENT_GLOW := Color(0.1, 0.463, 0.824) # #1976d2 当前玩家高亮

# ── 状态 ──
const HP_GREEN := Color(0.263, 0.627, 0.278)  # #43a047
const HP_RED := Color(0.898, 0.224, 0.208)    # #e53935
const STATUS_ORANGE := Color(0.902, 0.318, 0.0) # #e65100 状态标签
const DEAD_RED := Color(0.9, 0.25, 0.25)      # 阵亡
const MUTED := Color(0.8, 0.82, 0.9)          # 角色行/弱化文字
const GRAVE_MUTED := Color(1.0, 1.0, 1.0, 0.4) # 墓地弱化（Vue 0.4 alpha）
