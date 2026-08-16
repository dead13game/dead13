class_name GameWorldCupConstants
## 世界杯模式常量（从 src/game/worldCupConstants.js 移植）

const GROUP_NAMES: Array = ["A", "B", "C", "D", "E", "F", "G", "H"]
const KNOCKOUT_ROUNDS: Array = ["R16", "QF", "SF", "Final"]

const KNOCKOUT_NAMES: Dictionary = {
	"R16": "16强赛",
	"QF": "四分之一决赛",
	"SF": "半决赛",
	"Final": "决赛",
}

## 比赛配置
const MATCH_CONFIG: Dictionary = {
	"knockoutRounds": 90,      # 常规时间回合数
	"extraTimeRounds": 30,     # 加时赛回合数
	"totalRounds": 120,        # 常规+加时总回合数
	"maxSubstitutions": 999,   # 每队换人次数
	"penaltyFirstTo": 5,       # 点球大战先得5分者胜
	"penaltyCardsPerSide": 2,  # 点球每方抽牌数
}

## 小组赛积分
const POINTS: Dictionary = {
	"WIN": 3,
	"DRAW": 1,
	"LOSS": 0,
}

const AI_TEAM_NAMES: Array = [
	"巴西", "德国", "阿根廷", "法国", "西班牙", "意大利", "英格兰", "荷兰",
	"葡萄牙", "比利时", "克罗地亚", "乌拉圭", "日本", "韩国", "墨西哥", "瑞典",
	"丹麦", "波兰", "瑞士", "塞内加尔", "摩洛哥", "哥伦比亚", "智利", "尼日利亚",
	"喀麦隆", "加纳", "埃及", "沙特", "伊朗", "澳大利亚", "美国",
]

const TEAM_EMOJIS: Array = [
	"🇧🇷", "🇩🇪", "🇦🇷", "🇫🇷", "🇪🇸", "🇮🇹", "🏴", "🇳🇱",
	"🇵🇹", "🇧🇪", "🇭🇷", "🇺🇾", "🇯🇵", "🇰🇷", "🇲🇽", "🇸🇪",
	"🇩🇰", "🇵🇱", "🇨🇭", "🇸🇳", "🇲🇦", "🇨🇴", "🇨🇱", "🇳🇬",
	"🇨🇲", "🇬🇭", "🇪🇬", "🇸🇦", "🇮🇷", "🇦🇺", "🇺🇸",
]
