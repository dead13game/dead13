class_name UniEvents
## 模拟宇宙事件系统（从 src/simuniverse/logic/uniEvents.js 移植）
## 分支事件 / 奖励 / 冒险

const UniConstants = preload("res://scripts/game/uni_constants.gd")
const UniBuffs = preload("res://scripts/game/uni_buffs.gd")
const UniCore = preload("res://scripts/game/uni_core.gd")

const DEF_CARD_SHIELD: int = 2

static func _s(v: Variant) -> String:
	return "" if v == null else str(v)

static func _pick(arr: Array) -> Variant:
	if arr.is_empty():
		return null
	return arr[randi() % arr.size()]

# ================= 事件定义 =================

const UNI_EVENTS: Dictionary = {
	"caravan": {
		"id": "caravan", "title": "迷途商队",
		"desc": "你遇到一支迷路的商队，商人们神色疲惫，货物散落一地。",
		"options": [
			{"text": "指引方向", "effects": {"blessingPick": 1, "blessingStars": [1, 3]}},
			{"text": "护送他们", "effects": {"battle": {"kind": "normal", "count": 3, "reward": {"blessingPick": 2, "blessingStars": [1, 3]}}}},
			{"text": "搜刮货物", "effects": {"shards": 100, "defenseCards": -1}},
		],
	},
	"plague": {
		"id": "plague", "title": "瘟疫村庄",
		"desc": "一个村庄正遭受瘟疫侵袭，村口燃着苍白的火焰。",
		"options": [
			{"text": "提供医疗援助", "effects": {"healPct": 15, "blessingPick": 1, "blessingStars": [1, 3]}},
			{"text": "封锁村庄", "effects": {"shards": 150}},
		],
	},
	"watchtower": {
		"id": "watchtower", "title": "废弃哨塔",
		"desc": "一座废弃的哨塔矗立在路边，顶层似乎有东西在发光。",
		"options": [
			{"text": "攀登哨塔", "effects": {"skillUpRandom": 1}},
			{"text": "搜索底层", "effects": {"shards": 100}},
			{"text": "绕行", "effects": {}},
		],
	},
	"abyss": {
		"id": "abyss", "title": "深渊裂缝",
		"desc": "一道裂缝正在吞噬周围的地面，裂缝深处传来低沉的轰鸣。",
		"options": [
			{"text": "调查裂缝", "effects": {"battle": {"kind": "elite", "count": 2, "reward": {"skillUpTarget": 2}}}},
			{"text": "封住裂缝", "effects": {"shards": 150, "defenseCards": -3}},
			{"text": "无视", "effects": {}},
		],
	},
	"tablet": {
		"id": "tablet", "title": "古老石碑",
		"desc": "石碑上刻着看不懂的符文，在月光下泛着微光。",
		"options": [
			{"text": "解读符文", "effects": {"blessingCount": 2}},
			{"text": "触摸石碑", "effects": {"blessingCount": 1}},
			{"text": "标记位置", "effects": {}},
		],
	},
	"ghostship": {
		"id": "ghostship", "title": "幽灵船",
		"desc": "一艘废弃的战舰搁浅在岸边，船身散发着诡异的光芒。",
		"options": [
			{"text": "搜索船舱", "effects": {"blessingCount": 1, "defenseCards": -1}},
			{"text": "烧毁船只", "effects": {"shards": 150, "defenseCards": -1}},
			{"text": "快速离开", "effects": {}},
		],
	},
	"spring": {
		"id": "spring", "title": "幻象之泉",
		"desc": "泉水倒映出你内心最渴望的东西。",
		"options": [
			{"text": "饮用泉水", "effects": {"blessingCount": 10}},
			{"text": "观察倒影", "effects": {"curioCount": 5, "excludeNegative": true}},
			{"text": "破坏泉水", "effects": {"shards": 800}},
		],
	},
	"gate": {
		"id": "gate", "title": "封印之门",
		"desc": "一扇刻满符文的门挡住了去路。",
		"options": [
			{"text": "暴力破门", "effects": {"battle": {"kind": "elite", "count": 2, "reward": {"shards": 250, "blessingPick": 1, "blessingStars": [3, 3]}}}},
			{"text": "解读符文", "effects": {"requireShards": 150, "blessingCount": 3, "blessingStars": [1, 2]}},
			{"text": "绕路", "effects": {}},
		],
	},
	"altar": {
		"id": "altar", "title": "古代祭坛",
		"desc": "祭坛上有一件正在发光的物品。",
		"options": [
			{"text": "取走物品", "effects": {"equationStar": 3, "curioCount": 2, "curioStars": [2, 2], "loseHpPct": 60}},
			{"text": "献祭物品", "effects": {"loseBlessing": 2, "shards": 300}},
			{"text": "祈祷", "effects": {"loseCurio": 1, "healPct": 50}},
		],
	},
	# ── 用户规范 30 分支事件（扩充至 30，非替换） ──
	"hungrybox": {
		"id": "hungrybox", "title": "饥饿的宝箱",
		"desc": "你发现了一个上锁的宝箱，锁孔里渗出一缕黑烟。",
		"options": [
			{"text": "支付100宇宙碎片打开 → 1个随机1星祝福", "effects": {"requireShards": 100, "blessingCount": 1, "blessingStars": [1, 1]}},
			{"text": "支付150宇宙碎片强行砸开 → 1个随机奇物", "effects": {"requireShards": 150, "curioCount": 1, "curioStars": [1, 3]}},
			{"text": "放弃", "effects": {}},
		],
	},
	"brokenportal": {
		"id": "brokenportal", "title": "破损的传送门",
		"desc": "一道快要消散的传送门，还能用，但不稳定。",
		"options": [
			{"text": "支付100宇宙碎片修复 → 1个随机祝福", "effects": {"requireShards": 100, "blessingCount": 1, "blessingStars": [1, 3]}},
			{"text": "直接进入 → 战斗（2精英），胜利后全角色技能+1", "effects": {"battle": {"kind": "elite", "count": 2, "reward": {"skillUpAll": 1}}}},
			{"text": "无视", "effects": {}},
		],
	},
	"hungryvoid": {
		"id": "hungryvoid", "title": "饥饿的虚空",
		"desc": "你感到有什么东西正在吸取你的生命。",
		"options": [
			{"text": "失去全体30%生命上限的生命 → 2个随机2~3星祝福", "effects": {"loseHpPct": 30, "blessingCount": 2, "blessingStars": [2, 3]}},
			{"text": "失去全体30%护盾量 → 2个随机2星奇物", "effects": {"loseShieldPct": 30, "curioCount": 2, "curioStars": [2, 2]}},
			{"text": "快速逃离 → 25宇宙碎片", "effects": {"shards": 25}},
		],
	},
	"oldaltar": {
		"id": "oldaltar", "title": "古老的供桌",
		"desc": "桌上摆着一碗浑浊的液体，旁边刻着一行字：「以物易物。」",
		"options": [
			{"text": "失去1个随机奇物 → 1个2星祝福", "effects": {"loseCurio": 1, "blessingCount": 1, "blessingStars": [2, 2]}},
			{"text": "失去1个随机祝福 → 100宇宙碎片", "effects": {"loseBlessing": 1, "shards": 100}},
			{"text": "无视", "effects": {}},
		],
	},
	"banditcamp": {
		"id": "banditcamp", "title": "强盗营地",
		"desc": "一群强盗拦住了去路，但他们愿意谈判。",
		"options": [
			{"text": "支付100宇宙碎片买路 → 直接通过", "effects": {"requireShards": 100}},
			{"text": "支付随机一名角色的所有护盾 → 直接通过", "effects": {"loseAllShield": true}},
			{"text": "拒绝，进入战斗 → 普通敌人×5，胜利后150碎片", "effects": {"battle": {"kind": "normal", "count": 5, "reward": {"shards": 150}}}},
		],
	},
	"swaybridge": {
		"id": "swaybridge", "title": "摇摇欲坠的桥梁",
		"desc": "一座吊桥，看起来随时会断。",
		"options": [
			{"text": "强行通过 → 全体失去10%生命上限", "effects": {"loseHpPct": 10}},
			{"text": "加固桥梁 → 支付150宇宙碎片", "effects": {"requireShards": 150}},
			{"text": "绕行 → 失去2个随机奇物", "effects": {"loseCurio": 2}},
		],
	},
	"sleepflower": {
		"id": "sleepflower", "title": "催眠花丛",
		"desc": "一片花丛散发出的香气令人昏昏欲睡。",
		"options": [
			{"text": "屏住呼吸快速穿过 → 全体损失10%生命上限", "effects": {"loseHpPct": 10}},
			{"text": "吸入香气 → 获得1个随机负面奇物", "effects": {"curioCount": 1, "curioStars": [0, 0]}},
			{"text": "点燃花丛 → 失去100宇宙碎片", "effects": {"loseShards": 100}},
		],
	},
	"poisonspring": {
		"id": "poisonspring", "title": "有毒的泉水",
		"desc": "路边有一片奇异的泉水。",
		"options": [
			{"text": "饮用泉水 → 全体恢复20%生命上限", "effects": {"healPct": 20}},
			{"text": "收集泉水 → 指定角色技能+1", "effects": {"skillUpTarget": 1}},
			{"text": "绕过 → 获得150宇宙碎片", "effects": {"shards": 150}},
		],
	},
	"mistforest": {
		"id": "mistforest", "title": "迷雾森林",
		"desc": "浓雾笼罩，什么都看不清。",
		"options": [
			{"text": "强行穿越 → 指定角色技能+2，全体损失20%生命", "effects": {"skillUpTarget": 2, "loseHpPct": 20}},
			{"text": "点火照明 → 全体技能+1，全体损失40%生命", "effects": {"skillUpAll": 1, "loseHpPct": 40}},
			{"text": "等待雾散 → 无事发生", "effects": {}},
		],
	},
	"thornroad": {
		"id": "thornroad", "title": "荆棘之路",
		"desc": "前面的路被荆棘覆盖了。",
		"options": [
			{"text": "直接踩过去 → 全体损失15%生命上限", "effects": {"loseHpPct": 15}},
			{"text": "砍开荆棘 → 失去2个随机祝福", "effects": {"loseBlessing": 2}},
			{"text": "绕行 → 损失100宇宙碎片", "effects": {"loseShards": 100}},
		],
	},
	"traveler": {
		"id": "traveler", "title": "旅行商人（车厘子版）",
		"desc": "一个行商，愿意用他的货物换你的资源。",
		"options": [
			{"text": "支付50宇宙碎片 → 1个1星祝福", "effects": {"requireShards": 50, "blessingCount": 1, "blessingStars": [1, 1]}},
			{"text": "支付100宇宙碎片 → 全角色3张防御牌", "effects": {"requireShards": 100, "defenseCards": 3}},
			{"text": "不理会他 → 获得50宇宙碎片", "effects": {"shards": 50}},
		],
	},
	"healdoctor": {
		"id": "healdoctor", "title": "流浪医师",
		"desc": "一位自称能治愈一切伤痛的医师。",
		"options": [
			{"text": "支付100宇宙碎片 → 全队恢复50%生命", "effects": {"requireShards": 100, "healPct": 50}},
			{"text": "支付200宇宙碎片 → 复活一名阵亡角色", "effects": {"requireShards": 200, "revive": 1}},
			{"text": "拒绝", "effects": {}},
		],
	},
	"collector": {
		"id": "collector", "title": "神秘收藏家",
		"desc": "他愿意用祝福换奇物，用奇物换祝福。",
		"options": [
			{"text": "支付1个奇物 → 2个随机1~2星祝福", "effects": {"loseCurio": 1, "blessingCount": 2, "blessingStars": [1, 2]}},
			{"text": "支付2个随机祝福 → 2个1~2星奇物", "effects": {"loseBlessing": 2, "curioCount": 2, "curioStars": [1, 2], "excludeNegative": true}},
			{"text": "离开", "effects": {}},
		],
	},
	"debtvillager": {
		"id": "debtvillager", "title": "欠债的村民",
		"desc": "一群村民请求你的帮助，他们愿意偿还。",
		"options": [
			{"text": "支付120宇宙碎片帮助他们还钱 → 1个随机1~2星祝福", "effects": {"requireShards": 120, "blessingCount": 1, "blessingStars": [1, 2]}},
			{"text": "帮他们与催债人战斗 → 精英×2，胜利后220碎片", "effects": {"battle": {"kind": "elite", "count": 2, "reward": {"shards": 220}}}},
			{"text": "拒绝", "effects": {}},
		],
	},
	"fatecoin": {
		"id": "fatecoin", "title": "命运硬币",
		"desc": "抛一枚硬币，赌它是正面还是反面。",
		"options": [
			{"text": "赌正面 → 获得100宇宙碎片", "effects": {"shards": 100}},
			{"text": "赌反面 → 失去50宇宙碎片", "effects": {"loseShards": 50}},
			{"text": "不赌", "effects": {}},
		],
	},
	"cardgame": {
		"id": "cardgame", "title": "抽牌游戏",
		"desc": "对方拿出两张牌，让你猜哪张最大。",
		"options": [
			{"text": "猜第一张 → 获得1个2星祝福", "effects": {"blessingCount": 1, "blessingStars": [2, 2]}},
			{"text": "猜第二张 → 失去100宇宙碎片", "effects": {"loseShards": 100}},
			{"text": "不玩", "effects": {}},
		],
	},
	"wheel": {
		"id": "wheel", "title": "大转盘",
		"desc": "转动一个巨大的轮盘。",
		"options": [
			{"text": "1/3概率获得200宇宙碎片", "effects": {"chanceShards": 200, "chance": 0.33}},
			{"text": "1/3概率获得1个2星祝福", "effects": {"chanceBlessing": 1, "chance": 0.33}},
			{"text": "2/3概率获得80宇宙碎片", "effects": {"chanceShards": 80, "chance": 0.67}},
		],
	},
	"mirrorimage": {
		"id": "mirrorimage", "title": "镜中倒影",
		"desc": "你看见了自己的倒影，但它不太对劲。",
		"options": [
			{"text": "与倒影对话 → 获得2个随机奇物", "effects": {"curioCount": 2, "curioStars": [1, 3]}},
			{"text": "击碎镜子 → 全队损失20%生命，指定角色技能+1", "effects": {"loseHpPct": 20, "skillUpTarget": 1}},
			{"text": "离开", "effects": {}},
		],
	},
	"stonepuzzle": {
		"id": "stonepuzzle", "title": "石碑谜题",
		"desc": "一块刻着谜题的石碑，内容与「数字」有关。",
		"options": [
			{"text": "认真解答 → 获得2个2星祝福", "effects": {"blessingCount": 2, "blessingStars": [2, 2]}},
			{"text": "打碎石碑 → 获得1个2星奇物", "effects": {"curioCount": 1, "curioStars": [2, 2]}},
			{"text": "无视 → 获得100宇宙碎片", "effects": {"shards": 100}},
		],
	},
	"timecrack": {
		"id": "timecrack", "title": "时间裂缝",
		"desc": "一道裂缝，能看见过去或未来的画面。",
		"options": [
			{"text": "凝视裂缝 → 获得1个随机祝福", "effects": {"blessingCount": 1, "blessingStars": [1, 3]}},
			{"text": "触碰裂缝 → 失去50碎片，获得1个2星奇物", "effects": {"loseShards": 50, "curioCount": 1, "curioStars": [2, 2]}},
			{"text": "退后 → 获得50宇宙碎片", "effects": {"shards": 50}},
		],
	},
	"echocave": {
		"id": "echocave", "title": "回声洞穴",
		"desc": "你在洞穴里喊一声，回声会以某种方式返回。",
		"options": [
			{"text": "大喊 → 获得1个3星方程，全体损失20%生命上限", "effects": {"equationStar": 3, "loseHpPct": 20}},
			{"text": "轻声说 → 获得2个随机2星祝福", "effects": {"blessingCount": 2, "blessingStars": [2, 2]}},
			{"text": "沉默 → 获得100宇宙碎片", "effects": {"shards": 100}},
		],
	},
	"abandonedweapon": {
		"id": "abandonedweapon", "title": "被遗弃的武器",
		"desc": "一把插在石头里的武器。",
		"options": [
			{"text": "拔出武器 → 指定角色技能+2", "effects": {"skillUpTarget": 2}},
			{"text": "放弃 → 获得120宇宙碎片", "effects": {"shards": 120}},
		],
	},
	"runetrap": {
		"id": "runetrap", "title": "符文陷阱",
		"desc": "你触发了地上奇怪的符文。",
		"options": [
			{"text": "支付150宇宙碎片", "effects": {"requireShards": 150}},
			{"text": "全体护盾量减少20%", "effects": {"loseShieldPct": 20}},
			{"text": "失去1个随机祝福和1个随机奇物", "effects": {"loseBlessing": 1, "loseCurio": 1}},
		],
	},
	"crow": {
		"id": "crow", "title": "乌鸦群",
		"desc": "一群乌鸦在头顶盘旋，似乎在等待什么。",
		"options": [
			{"text": "支付50碎片喂食乌鸦 → 1个随机2星祝福", "effects": {"requireShards": 50, "blessingCount": 1, "blessingStars": [2, 2]}},
			{"text": "驱赶乌鸦 → 获得1个1星方程", "effects": {"equationStar": 1}},
			{"text": "无视 → 获得80宇宙碎片", "effects": {"shards": 80}},
		],
	},
	"ghostmerchant": {
		"id": "ghostmerchant", "title": "幽灵商人",
		"desc": "一个半透明的商人，只收「记忆」。",
		"options": [
			{"text": "支付2个2星祝福 → 获得150碎片", "effects": {"loseBlessing": 2, "shards": 150}},
			{"text": "全体护盾量减少70% → 1个3星祝福+1个3星奇物", "effects": {"loseShieldPct": 70, "blessingCount": 1, "blessingStars": [3, 3], "curioCount": 1, "curioStars": [3, 3]}},
			{"text": "离开", "effects": {}},
		],
	},
	"abysseye": {
		"id": "abysseye", "title": "深渊之眼",
		"desc": "一只巨大的眼睛从地面睁开，注视着你。",
		"options": [
			{"text": "与它对视 → 指定角色技能+1，但失去150碎片", "effects": {"skillUpTarget": 1, "loseShards": 150}},
			{"text": "移开视线", "effects": {}},
		],
	},
	"emptycastle": {
		"id": "emptycastle", "title": "空荡的古堡",
		"desc": "一座很有年代感的古堡，但里面什么都没有。",
		"options": [
			{"text": "全体恢复50%生命上限", "effects": {"healPct": 50}},
			{"text": "获得2个2星祝福", "effects": {"blessingCount": 2, "blessingStars": [2, 2]}},
			{"text": "获得100宇宙碎片", "effects": {"shards": 100}},
		],
	},
	"weirdstatue": {
		"id": "weirdstatue", "title": "怪异的雕像",
		"desc": "一座雕像，看起来和某个人很像。",
		"options": [
			{"text": "触摸雕像 → 全体恢复20%生命上限", "effects": {"healPct": 20}},
			{"text": "砸碎雕像 → 获得150碎片+1个随机奇物", "effects": {"shards": 150, "curioCount": 1, "curioStars": [1, 3]}},
			{"text": "离开 → 获得1个2星方程", "effects": {"equationStar": 2}},
		],
	},
	"lastcampfire": {
		"id": "lastcampfire", "title": "最后的篝火",
		"desc": "一团快要熄灭的篝火，旁边有一些物资。",
		"options": [
			{"text": "加柴火 → 全体恢复10%生命上限", "effects": {"healPct": 10}},
			{"text": "翻找物资 → 全体角色技能+1", "effects": {"skillUpAll": 1}},
			{"text": "离开 → 获得100宇宙碎片", "effects": {"shards": 100}},
		],
	},
	"abyssgate": {
		"id": "abyssgate", "title": "深渊之门",
		"desc": "一扇通往未知的门。",
		"options": [
			{"text": "进入 → 1个3星奇物，全体损失20%生命上限", "effects": {"curioCount": 1, "curioStars": [3, 3], "loseHpPct": 20}},
			{"text": "封印它 → 获得2个1星方程", "effects": {"equationCount": 2, "equationStars": [1, 1]}},
			{"text": "离开 → 获得2个1~2星随机祝福", "effects": {"blessingCount": 2, "blessingStars": [1, 2]}},
		],
	},
}

const UNI_REWARDS: Dictionary = {
	"medkit": {
		"id": "medkit", "title": "医疗补给",
		"desc": "你发现了一箱完好的医疗物资。",
		"options": [
			{"text": "快速恢复", "effects": {"healPct": 20}},
			{"text": "储备药品", "effects": {"medkit": 2}},
			{"text": "消毒物资", "effects": {"healPct": 100, "loseHpAfter3": 50}},
		],
	},
	"potion": {
		"id": "potion", "title": "强化药剂",
		"desc": "桌上摆着三瓶不同颜色的药剂。",
		"options": [
			{"text": "红色药剂", "effects": {"blessingCount": 2}},
			{"text": "蓝色药剂", "effects": {"curioCount": 2, "excludeNegative": true}},
			{"text": "绿色药剂", "effects": {"healPct": 40, "ceil": true}},
		],
	},
	"manual": {
		"id": "manual", "title": "战术手册",
		"desc": "一本残留着战斗笔记的手册。",
		"options": [
			{"text": "进攻战术", "effects": {"buff": "atkUp"}},
			{"text": "防守战术", "effects": {"buff": "defUp"}},
			{"text": "速攻战术", "effects": {"buff": "enemyStun"}},
		],
	},
	"scroll": {
		"id": "scroll", "title": "防护卷轴",
		"desc": "卷轴上的符文隐隐发光。",
		"options": [
			{"text": "护盾符文", "effects": {"defenseCards": 5}},
			{"text": "反伤符文", "effects": {"buff": "reflect"}},
			{"text": "免疫符文", "effects": {"buff": "immuneFirst"}},
		],
	},
	"expScroll": {
		"id": "expScroll", "title": "经验卷轴",
		"desc": "卷轴记载着战斗的感悟。",
		"options": [
			{"text": "专注研读", "effects": {"skillUpTarget": 2}},
			{"text": "分享经验", "effects": {"skillUpAll": 1}},
			{"text": "实战转化", "effects": {"tempSkillBoost": 3}},
		],
	},
	"weapon": {
		"id": "weapon", "title": "附魔武器",
		"desc": "刀刃上流淌着微弱的光芒。",
		"options": [
			{"text": "火焰附魔", "effects": {"buff": "dmgUp50"}},
			{"text": "精炼材料", "effects": {"shards": 250}},
		],
	},
	"crystal": {
		"id": "crystal", "title": "生命结晶",
		"desc": "晶石在手心散发着温度。",
		"options": [
			{"text": "吸收能量", "effects": {"planeMaxHp": 20}},
			{"text": "转化力量", "effects": {"healPct": 30, "blessingCount": 2}},
			{"text": "交换物品", "effects": {"shards": 200}},
		],
	},
	"box": {
		"id": "box", "title": "神秘箱子",
		"desc": "一个锁着的箱子，上面刻着一行字：「选择你的代价」。",
		"options": [
			{"text": "打开箱子", "effects": {"blessingCount": 2, "blessingStars": [3, 3]}},
			{"text": "砸开箱子", "effects": {"shards": 500, "loseAllDefense": true}},
			{"text": "放弃箱子", "effects": {"shards": 200}},
		],
	},
	# ── 用户规范 30 奖励事件（扩充，非替换） ──
	"forgottenbox": {
		"id": "forgottenbox", "title": "被遗忘的宝藏",
		"desc": "你在废墟中踢到了一个硬物，拨开碎石，露出了一个古老的箱子。",
		"options": [
			{"text": "打开箱子 → 获得150宇宙碎片", "effects": {"shards": 150}},
			{"text": "检查周围 → 获得1个2星奇物（不含负面）", "effects": {"curioCount": 1, "curioStars": [2, 2], "excludeNegative": true}},
		],
	},
	"fallingstar": {
		"id": "fallingstar", "title": "坠落之星",
		"desc": "一颗流星划过天际，落在不远处的地面上，砸出一个冒着烟的大坑。",
		"options": [
			{"text": "前往坠落点 → 获得2个1星祝福", "effects": {"blessingCount": 2, "blessingStars": [1, 1]}},
			{"text": "收集散落的碎片 → 获得100宇宙碎片", "effects": {"shards": 100}},
		],
	},
	"undergroundcave": {
		"id": "undergroundcave", "title": "地下溶洞",
		"desc": "你脚下的地面突然塌陷，露出一个布满发光晶体的地下溶洞。",
		"options": [
			{"text": "采集晶体 → 获得200宇宙碎片", "effects": {"shards": 200}},
			{"text": "深入探索 → 获得2个1星奇物（不含负面）", "effects": {"curioCount": 2, "curioStars": [1, 1], "excludeNegative": true}},
		],
	},
	"shipwreck": {
		"id": "shipwreck", "title": "沉船残骸",
		"desc": "一艘古老的船残骸搁浅在岸边，船体上长满了藤壶。",
		"options": [
			{"text": "搜索船体 → 获得120宇宙碎片", "effects": {"shards": 120}},
			{"text": "检查船舱 → 获得1个1星方程", "effects": {"equationStar": 1}},
		],
	},
	"sarcophagus": {
		"id": "sarcophagus", "title": "远古石棺",
		"desc": "你发现了一具刻满符文的石棺，棺盖半开，里面似乎有什么东西在发光。",
		"options": [
			{"text": "查看棺内 → 获得1个2星祝福", "effects": {"blessingCount": 1, "blessingStars": [2, 2]}},
			{"text": "研究符文 → 获得1个1星方程", "effects": {"equationStar": 1}},
		],
	},
	"blessingwell": {
		"id": "blessingwell", "title": "祝福之泉",
		"desc": "一汪泉水在月光下泛着微光，水面倒映出不属于天空的星辰。",
		"options": [
			{"text": "饮用泉水 → 全队恢复50%生命上限", "effects": {"healPct": 50}},
			{"text": "收集泉水 → 获得1个3星祝福", "effects": {"blessingCount": 1, "blessingStars": [3, 3]}},
		],
	},
	"goldenfruit": {
		"id": "goldenfruit", "title": "金色果实",
		"desc": "一棵挂满金色果实的树，果实在风中轻轻摇晃，散发出香甜的气息。",
		"options": [
			{"text": "采摘果实 → 获得2个1星祝福", "effects": {"blessingCount": 2, "blessingStars": [1, 1]}},
			{"text": "收集种子 → 获得100宇宙碎片", "effects": {"shards": 100}},
		],
	},
	"warmfire": {
		"id": "warmfire", "title": "温暖篝火",
		"desc": "一堆未熄灭的篝火，旁边堆放着一些物资，看起来是前人留下的。",
		"options": [
			{"text": "在篝火旁休息 → 全队恢复30%生命上限", "effects": {"healPct": 30}},
			{"text": "翻找物资 → 所有角色获得2张防御牌", "effects": {"defenseCards": 2}},
		],
	},
	"crystalcave": {
		"id": "crystalcave", "title": "水晶洞穴",
		"desc": "你进入了一个布满水晶的洞穴，洞壁上闪烁着各色光芒。",
		"options": [
			{"text": "收集水晶碎片 → 获得180宇宙碎片", "effects": {"shards": 180}},
			{"text": "寻找大块水晶 → 获得2个1星奇物（不含负面）", "effects": {"curioCount": 2, "curioStars": [1, 1], "excludeNegative": true}},
		],
	},
	"meteor": {
		"id": "meteor", "title": "流星雨",
		"desc": "夜空中划过无数流星，坠落在地面上，留下星尘形成的特殊地貌。",
		"options": [
			{"text": "追逐流星坠落点 → 获得1个2星方程", "effects": {"equationStar": 2}},
			{"text": "收集星尘 → 获得3个1~2星祝福", "effects": {"blessingCount": 3, "blessingStars": [1, 2]}},
		],
	},
	"graveyard": {
		"id": "graveyard", "title": "守墓人",
		"desc": "一个沉默的守墓人坐在一座古墓前，他指了指墓碑上的文字，一言不发。",
		"options": [
			{"text": "阅读墓碑 → 获得1个1星方程", "effects": {"equationStar": 1}},
			{"text": "与守墓人交易 → 获得1个2星奇物（不含负面）", "effects": {"curioCount": 1, "curioStars": [2, 2], "excludeNegative": true}},
		],
	},
	"phantomruin": {
		"id": "phantomruin", "title": "遗迹幻影",
		"desc": "你在废墟中看到一个转瞬即逝的幻影，它消失的地方留下了一件发光的物品。",
		"options": [
			{"text": "拾取物品 → 获得2个2星祝福", "effects": {"blessingCount": 2, "blessingStars": [2, 2]}},
			{"text": "检查幻影消失的位置 → 获得150宇宙碎片", "effects": {"shards": 150}},
		],
	},
	"runestone": {
		"id": "runestone", "title": "符文石阵",
		"desc": "一圈高耸的符文石矗立在此，刻满了古老的文字。",
		"options": [
			{"text": "激活符文石 → 获得1个1星奇物", "effects": {"curioCount": 1, "curioStars": [1, 1]}},
			{"text": "抄录符文 → 获得1个1星祝福", "effects": {"blessingCount": 1, "blessingStars": [1, 1]}},
		],
	},
	"ghostship_reward": {
		"id": "ghostship_reward", "title": "幽灵船（成龙暖心奖励版）",
		"desc": "一艘幽灵船静静地停泊在雾中，甲板上空无一人，但船舱里堆满了物资。",
		"options": [
			{"text": "搬运物资 → 获得150宇宙碎片", "effects": {"shards": 150}},
			{"text": "搜索船长室 → 获得2个2星奇物（不含负面）", "effects": {"curioCount": 2, "curioStars": [2, 2], "excludeNegative": true}},
		],
	},
	"invertedtower": {
		"id": "invertedtower", "title": "逆位之塔",
		"desc": "一座高耸的石塔，塔顶闪烁着微弱的蓝色光芒。",
		"options": [
			{"text": "攀上塔顶 → 获得1个3星奇物", "effects": {"curioCount": 1, "curioStars": [3, 3]}},
			{"text": "搜索塔底 → 获得120宇宙碎片", "effects": {"shards": 120}},
		],
	},
	"caravan_gift": {
		"id": "caravan_gift", "title": "流浪商队（后街女孩）",
		"desc": "一支路过的商队愿意分享一些物资。",
		"options": [
			{"text": "接受赠予 → 100碎片+所有角色2张防御牌", "effects": {"shards": 100, "defenseCards": 2}},
			{"text": "请求交易 → 获得1个3星奇物（不含负面）", "effects": {"curioCount": 1, "curioStars": [3, 3], "excludeNegative": true}},
		],
	},
	"elfmessenger": {
		"id": "elfmessenger", "title": "精灵信使",
		"desc": "一位精灵信使递给你一个卷轴，然后消失在光影中。",
		"options": [
			{"text": "打开卷轴 → 指定角色技能+2", "effects": {"skillUpTarget": 2}},
			{"text": "保留卷轴 → 获得1个1星方程", "effects": {"equationStar": 1}},
		],
	},
	"blacksmith": {
		"id": "blacksmith", "title": "老铁匠",
		"desc": "一位老铁匠正在修理装备，他愿意帮你加固防御。",
		"options": [
			{"text": "加固护甲 → 所有角色获得4张防御牌", "effects": {"defenseCards": 4}},
			{"text": "购买装备 → 获得1个3星祝福和1个3星奇物", "effects": {"blessingCount": 1, "blessingStars": [3, 3], "curioCount": 1, "curioStars": [3, 3]}},
		],
	},
	"bard": {
		"id": "bard", "title": "吟游诗人（Windy）",
		"desc": "一位吟游诗人愿意为你唱一首古老的歌谣，据说歌谣中隐藏着风的力量。",
		"options": [
			{"text": "聆听歌谣 → 2个3星祝福+2个3星奇物", "effects": {"blessingCount": 2, "blessingStars": [3, 3], "curioCount": 2, "curioStars": [3, 3]}},
			{"text": "学唱歌谣 → 2个3星方程+3个随机祝福", "effects": {"equationCount": 2, "equationStars": [3, 3], "blessingCount": 3, "blessingStars": [1, 3]}},
			{"text": "送他一瓶好酒 → 全队技能+3并获得300碎片", "effects": {"skillUpAll": 3, "shards": 300}},
		],
	},
	"shaman": {
		"id": "shaman", "title": "萨满祭司",
		"desc": "一位萨满祭司正在进行祭祀仪式，她邀请你一同参与。",
		"options": [
			{"text": "参与仪式 → 获得2个2星祝福", "effects": {"blessingCount": 2, "blessingStars": [2, 2]}},
			{"text": "接受赐福 → 全队恢复50%生命上限", "effects": {"healPct": 50}},
		],
	},
	"blessingtree": {
		"id": "blessingtree", "title": "祝福之树",
		"desc": "一棵巨大的古树，枝叶间挂满了发光的祝福，树下落满了碎片。",
		"options": [
			{"text": "摇动树干 → 所有角色获得2张防御牌", "effects": {"defenseCards": 2}},
			{"text": "捡拾碎片 → 获得100宇宙碎片", "effects": {"shards": 100}},
		],
	},
	"mirrorworld": {
		"id": "mirrorworld", "title": "镜像空间",
		"desc": "你走进了一个镜像空间，每一个方向都通向不同的地方。",
		"options": [
			{"text": "左转 → 获得1个1星奇物", "effects": {"curioCount": 1, "curioStars": [1, 1]}},
			{"text": "右转 → 获得1个1星方程", "effects": {"equationStar": 1}},
		],
	},
	"timeecho": {
		"id": "timeecho", "title": "时光回响",
		"desc": "你触碰了时空的裂隙，看到了过去和未来的画面。",
		"options": [
			{"text": "观看过去 → 获得2个1~2星祝福", "effects": {"blessingCount": 2, "blessingStars": [1, 2]}},
			{"text": "观看未来 → 指定角色技能+2", "effects": {"skillUpTarget": 2}},
		],
	},
	"starbridge": {
		"id": "starbridge", "title": "星界之桥",
		"desc": "一座星光构成的桥梁横跨在虚空中。",
		"options": [
			{"text": "走过星桥 → 获得200宇宙碎片", "effects": {"shards": 200}},
			{"text": "采集星光 → 获得2个2星奇物", "effects": {"curioCount": 2, "curioStars": [2, 2]}},
		],
	},
	"lifewell": {
		"id": "lifewell", "title": "生命之泉",
		"desc": "一汪泉水，水面上漂浮着金色的光点。",
		"options": [
			{"text": "饮用泉水 → 全队回满血量", "effects": {"healPct": 100}},
			{"text": "收集光点 → 获得1个1星方程", "effects": {"equationStar": 1}},
		],
	},
	"giftparcel": {
		"id": "giftparcel", "title": "祝福与碎片的馈赠",
		"desc": "你遇到了一位神秘的旅人，他留下的包裹中既有祝福也有碎片。",
		"options": [
			{"text": "拆开包裹 → 1个1星祝福+1个1星奇物", "effects": {"blessingCount": 1, "blessingStars": [1, 1], "curioCount": 1, "curioStars": [1, 1]}},
			{"text": "继续前进 → 获得100宇宙碎片", "effects": {"shards": 100}},
		],
	},
	"curiogallery": {
		"id": "curiogallery", "title": "奇物与治疗",
		"desc": "你发现了一座奇物收藏室，旁边还有一间医疗室。",
		"options": [
			{"text": "参观收藏室 → 获得2个1星奇物（不含负面）", "effects": {"curioCount": 2, "curioStars": [1, 1], "excludeNegative": true}},
			{"text": "使用医疗室 → 全队恢复40%生命上限", "effects": {"healPct": 40}},
		],
	},
	"grimoire": {
		"id": "grimoire", "title": "方程与祝福",
		"desc": "你找到了一本破旧的手稿，里面记载着方程和祝福的融合之法。",
		"options": [
			{"text": "研读手稿 → 所有角色获得3张防御牌", "effects": {"defenseCards": 3}},
			{"text": "实践手稿 → 所有角色技能+1", "effects": {"skillUpAll": 1}},
		],
	},
	"stardust": {
		"id": "stardust", "title": "星尘与碎片",
		"desc": "你经过一片弥漫着星尘的区域，地面上铺满了宇宙碎片。",
		"options": [
			{"text": "收集星尘 → 获得1个3星祝福", "effects": {"blessingCount": 1, "blessingStars": [3, 3]}},
			{"text": "收集碎片 → 获得2个2星奇物", "effects": {"curioCount": 2, "curioStars": [2, 2]}},
		],
	},
	"fullsupply": {
		"id": "fullsupply", "title": "全队大补给",
		"desc": "你发现了一个完整的补给站，物资齐全。",
		"options": [
			{"text": "全面补给 → 3张防御牌+2个1星祝福", "effects": {"defenseCards": 3, "blessingCount": 2, "blessingStars": [1, 1]}},
			{"text": "精挑细选 → 获得1个3星奇物", "effects": {"curioCount": 1, "curioStars": [3, 3]}},
		],
	},
}

const UNI_ADVENTURES: Dictionary = {
	"dice": {
		"id": "dice", "title": "骰子游戏",
		"desc": "商人拿出骰子，邀请你玩一局。",
		"options": [
			{"text": "保守：投入 60 碎片", "effects": {"gamble": {"cost": 60, "mult": 20}}},
			{"text": "正常：投入 90 碎片", "effects": {"gamble": {"cost": 90, "mult": 30}}},
			{"text": "豪赌：投入 150 碎片", "effects": {"gamble": {"cost": 150, "mult": 50}}},
		],
	},
	"cards": {
		"id": "cards", "title": "翻牌",
		"desc": "三张牌扣在桌子上，抽一张。",
		"options": [
			{"text": "抽一张", "effects": {"fortuneCard": true}},
		],
	},
	"lottery": {
		"id": "lottery", "title": "抽签",
		"desc": "10 支签放在一个竹筒里（1 大吉 / 2 中吉 / 4 小吉 / 3 凶）。",
		"options": [
			{"text": "抽一支（25 碎片）", "effects": {"lottery": {"cost": 25, "count": 1}}},
			{"text": "抽三支取最好（100 碎片）", "effects": {"lottery": {"cost": 100, "count": 3}}},
			{"text": "放弃", "effects": {}},
		],
	},
}

## 按事件 id 取事件定义
static func get_event_def(event_id: String) -> Variant:
	if UNI_EVENTS.has(event_id):
		return UNI_EVENTS[event_id]
	if UNI_REWARDS.has(event_id):
		return UNI_REWARDS[event_id]
	if UNI_ADVENTURES.has(event_id):
		return UNI_ADVENTURES[event_id]
	return null

## 按区域类型随机抽 1 个具体事件（type: event/reward/adventure）
static func roll_event(type: String) -> String:
	var pool: Dictionary = UNI_EVENTS
	if type == "reward":
		pool = UNI_REWARDS
	elif type == "adventure":
		pool = UNI_ADVENTURES
	var ids: Array = pool.keys()
	return _s(_pick(ids))

# ================= 效果辅助 =================

## 治疗全队（百分比）
static func _heal_team_pct(state: Dictionary, pct: float, floor_mode: bool = false) -> float:
	var healed: float = 0.0
	for t in state.get("team", []):
		if not t.get("alive", false):
			continue
		var amount: int = ceili(float(t.get("maxHp", 1)) * pct / 100.0) if floor_mode else floori(float(t.get("maxHp", 1)) * pct / 100.0)
		t["hp"] = minf(float(t.get("maxHp", 1)), float(t.get("hp", 0)) + amount)
		healed += amount
	return healed

## 全队损失生命上限百分比的血量（最低减为 1）
static func _lose_team_hp_pct(state: Dictionary, pct: float) -> void:
	for t in state.get("team", []):
		if not t.get("alive", false):
			continue
		var loss: int = floori(float(t.get("maxHp", 1)) * pct / 100.0)
		t["hp"] = maxf(1.0, float(t.get("hp", 0)) - loss)

## 全队获得/失去防御牌
static func _team_defense_cards(state: Dictionary, n: int) -> int:
	if n >= 0:
		for t in state.get("team", []):
			if not t.get("alive", false):
				continue
			for i in range(n):
				t["status"]["defensePile"].append({"value": DEF_CARD_SHIELD, "rank": "?", "suit": "♠"})
		return n
	for t in state.get("team", []):
		if not t.get("alive", false):
			continue
		for i in range(-n):
			var pile: Array = t["status"]["defensePile"]
			if pile.is_empty():
				break
			pile.pop_back()
	return n

## 提升角色技能等级
static func apply_skill_up(state: Dictionary, char_index: int, n: int) -> Dictionary:
	var team: Array = state.get("team", [])
	if char_index < 0 or char_index >= team.size():
		return {"ok": false, "reason": "无此角色"}
	var t: Dictionary = team[char_index]
	if int(t.get("charId", 0)) == 11:
		return {"ok": false, "reason": "菜月昴不可升级"}
	var before: int = int(t.get("skillLevel", 1))
	t["skillLevel"] = mini(10, before + n)
	UniCore.sync_passives(state)
	state["log"].append("%s 技能等级 +%d（Lv%d）" % [_s(t.get("name", "")), int(t["skillLevel"]) - before, int(t["skillLevel"])])
	return {"ok": true, "leveled": int(t["skillLevel"]) - before}

## 随机一名可升级角色技能 +1
static func _random_skill_up(state: Dictionary, n: int = 1) -> Variant:
	var upgradable: Array = []
	for t in state.get("team", []):
		if t.get("alive", false) and int(t.get("charId", 0)) != 11:
			upgradable.append(t)
	if upgradable.is_empty():
		return null
	var t: Dictionary = upgradable[randi() % upgradable.size()]
	return apply_skill_up(state, int(t.get("index", 0)), n)

# ================= 选项应用 =================

## 应用事件选项
static func apply_event_option(state: Dictionary, event_id: String, option_idx: int) -> Dictionary:
	var ev: Variant = get_event_def(event_id)
	if ev == null:
		return {"ok": false, "reason": "无此事件"}
	var options: Array = ev.get("options", [])
	if option_idx < 0 or option_idx >= options.size():
		return {"ok": false, "reason": "无此选项"}
	var opt: Dictionary = options[option_idx]
	var fx: Dictionary = opt.get("effects", {})
	var outcome: Dictionary = {"text": opt.get("text", ""), "fx": fx}

	# 花费检查
	if fx.has("requireShards") and not UniCore.spend_shards(state, int(fx["requireShards"])):
		outcome["failed"] = "碎片不足"
		return {"ok": true, "outcome": outcome, "eventId": event_id, "eventTitle": ev.get("title", "")}

	# 货币
	if fx.has("shards"):
		UniCore.add_shards(state, int(fx["shards"]))
	if fx.has("loseShards"):
		state["shards"] = maxi(0, int(state.get("shards", 0)) - int(fx["loseShards"]))
	if fx.has("chanceShards"):
		if randf() < float(fx.get("chance", 1.0)):
			UniCore.add_shards(state, int(fx["chanceShards"]))
			outcome["chanceShardsWon"] = true
	if fx.has("chanceBlessing"):
		if randf() < float(fx.get("chance", 1.0)):
			var star_rb: Array = fx.get("blessingStars", [1, 3])
			var bidx: String = UniBuffs.roll_blessing(int(star_rb[0]), int(star_rb[1]))
			if bidx != "":
				UniBuffs.gain_blessing(state, bidx)
			outcome["chanceBlessingWon"] = true

	# 血量
	if fx.has("healPct"):
		_heal_team_pct(state, float(fx["healPct"]), fx.get("ceil", false))
	if fx.has("loseHpPct"):
		_lose_team_hp_pct(state, float(fx["loseHpPct"]))
	if fx.has("loseHpAfter3"):
		if int(state.get("floor", 1)) <= 2:
			_heal_team_pct(state, 100.0)
		else:
			_heal_team_pct(state, 100.0)
			_lose_team_hp_pct(state, float(fx["loseHpAfter3"]))
	# 护盾
	if fx.has("loseShieldPct"):
		var ls: float = float(fx["loseShieldPct"]) / 100.0
		for t in state.get("team", []):
			t["shield"] = maxf(0.0, float(t.get("shield", 0)) * (1.0 - ls))
	if fx.get("loseAllShield", false):
		var with_shield: Array = []
		for t in state.get("team", []):
			if float(t.get("shield", 0)) > 0:
				with_shield.append(t)
		if not with_shield.is_empty():
			var victim: Dictionary = with_shield[randi() % with_shield.size()]
			victim["shield"] = 0.0

	# 防御牌
	if fx.has("defenseCards"):
		_team_defense_cards(state, int(fx["defenseCards"]))
	if fx.get("loseAllDefense", false):
		for t in state.get("team", []):
			t["status"]["defensePile"] = []

	# 祝福
	if fx.has("blessingCount"):
		var star_range: Array = fx.get("blessingStars", [1, 3])
		for i in range(int(fx["blessingCount"])):
			var id: String = UniBuffs.roll_blessing(int(star_range[0]), int(star_range[1]))
			if id != "":
				UniBuffs.gain_blessing(state, id, {"silent": true})
	# 祝福三选一
	if fx.has("blessingPick"):
		var star_range2: Array = fx.get("blessingStars", [1, 3])
		var picks: Array = []
		for i in range(int(fx["blessingPick"])):
			picks.append({"candidates": UniBuffs.roll_blessing_candidates(3, int(star_range2[0]), int(star_range2[1])), "starRange": star_range2})
		var pending: Array = state.get("pendingBlessingPicks", [])
		pending.append_array(picks)
		state["pendingBlessingPicks"] = pending
		outcome["pendingPicks"] = picks.size()

	# 奇物
	if fx.has("curioCount"):
		var star_r: Array = fx.get("curioStars", [1, 3])
		for i in range(int(fx["curioCount"])):
			var cid: String = UniBuffs.roll_curio(fx.get("excludeNegative", false), int(star_r[0]), int(star_r[1]))
			if cid != "":
				UniBuffs.gain_curio(state, cid, {"silent": true})

	# 方程
	if fx.has("equationStar"):
		var eid: String = UniBuffs.roll_equation(int(fx["equationStar"]), int(fx["equationStar"]))
		if eid != "":
			UniBuffs.gain_equation(state, eid)
	if fx.has("equationCount"):
		var esr: Array = fx.get("equationStars", [1, 3])
		for i in range(int(fx["equationCount"])):
			var eid2: String = UniBuffs.roll_equation(int(esr[0]), int(esr[1]))
			if eid2 != "":
				UniBuffs.gain_equation(state, eid2)

	# 失去祝福/奇物
	if fx.has("loseBlessing"):
		for i in range(int(fx["loseBlessing"])):
			UniBuffs.lose_random_blessing(state)
	if fx.has("loseCurio"):
		for i in range(int(fx["loseCurio"])):
			UniBuffs.lose_random_curio(state)

	# 技能升级
	if fx.has("skillUpRandom"):
		_random_skill_up(state, int(fx["skillUpRandom"]))
	if fx.has("skillUpTarget"):
		var upgradable2: bool = false
		for t in state.get("team", []):
			if t.get("alive", false) and int(t.get("charId", 0)) != 11:
				upgradable2 = true
				break
		if upgradable2:
			outcome["needSkillTarget"] = int(fx["skillUpTarget"])
		else:
			state["log"].append("无可升级角色，放弃技能升级奖励")
	if fx.has("skillUpAll"):
		for t in state.get("team", []):
			if t.get("alive", false) and int(t.get("charId", 0)) != 11:
				apply_skill_up(state, int(t.get("index", 0)), int(fx["skillUpAll"]))
	if fx.has("tempSkillBoost"):
		state["tempSkillBoost"] = int(fx["tempSkillBoost"])

	# 复活 1 名阵亡角色
	if fx.has("revive"):
		var dead: Array = []
		for t in state.get("team", []):
			if not t.get("alive", false):
				dead.append(t)
		if not dead.is_empty():
			var t2: Dictionary = dead[randi() % dead.size()]
			t2["alive"] = true
			t2["hp"] = maxf(1.0, ceili(float(t2.get("maxHp", 1)) * 0.5))
			t2["status"]["defensePile"] = []
			t2["status"]["stunned"] = false
			t2["status"]["puppet"] = null
			t2["status"]["lockedBy"] = null
			state["log"].append("复活 %s" % _s(t2.get("name", "")))
		else:
			state["log"].append("无人阵亡，复活效果浪费")

	# 急救包 / 位面生命上限
	if fx.has("medkit"):
		state["items"]["medkit"] = int(state.get("items", {}).get("medkit", 0)) + int(fx["medkit"])
	if fx.has("planeMaxHp"):
		state["planeMaxHpBoost"] = int(fx["planeMaxHp"])
		for t in state.get("team", []):
			t["maxHp"] = ceili(float(t.get("maxHp", 1)) * (100 + int(fx["planeMaxHp"])) / 100.0)

	# 下次战斗 buff
	if fx.has("buff"):
		state["nextBattleBuffs"][_s(fx["buff"])] = true

	# 事件战斗
	if fx.has("battle"):
		var b: Dictionary = fx["battle"]
		state["pendingEventReward"] = b.get("reward", null)
		outcome["battle"] = {
			"waves": [{"kind": b.get("kind", "normal"), "count": b.get("count", 3)}],
			"desc": "%s敌人 ×%d" % ["精英" if b.get("kind", "") == "elite" else "普通", int(b.get("count", 3))],
		}

	# 冒险
	if fx.has("gamble"):
		outcome["gamble"] = _run_gamble(state, fx["gamble"])
	if fx.get("fortuneCard", false):
		outcome["fortuneCard"] = _run_fortune_card(state)
	if fx.has("lottery"):
		outcome["lottery"] = _run_lottery(state, fx["lottery"])

	# 事件扣血致死
	var all_dead: bool = true
	for t in state.get("team", []):
		if t.get("alive", false):
			all_dead = false
			break
	if all_dead:
		state["gameOver"] = true

	return {"ok": true, "outcome": outcome, "eventId": event_id, "eventTitle": ev.get("title", "")}

## 处理祝福三选一的选择
static func choose_blessing_pick(state: Dictionary, picked_id: String) -> Dictionary:
	var queue: Array = state.get("pendingBlessingPicks", [])
	if queue.is_empty():
		return {"ok": false, "reason": "无可选祝福"}
	var cur: Dictionary = queue[0]
	if not cur.get("candidates", []).has(picked_id):
		return {"ok": false, "reason": "非法选择"}
	UniBuffs.gain_blessing(state, picked_id)
	queue.pop_front()
	if queue.is_empty():
		state["pendingBlessingPicks"] = []
	return {"ok": true, "remaining": queue.size()}

## 骰子游戏
static func _run_gamble(state: Dictionary, g: Dictionary) -> Dictionary:
	if not UniCore.spend_shards(state, int(g.get("cost", 0))):
		return {"failed": "碎片不足"}
	var point: int = randi() % 6 + 1
	var gain: int = point * int(g.get("mult", 10))
	UniCore.add_shards(state, gain)
	state["log"].append("骰子掷出 %d 点，获得 %d 碎片（投入 %d）" % [point, gain, int(g.get("cost", 0))])
	return {"point": point, "gain": gain, "cost": int(g.get("cost", 0))}

## 翻牌
static func _run_fortune_card(state: Dictionary) -> Dictionary:
	var r: float = randf()
	if r < 0.4:
		for i in range(2):
			var id: String = UniBuffs.roll_blessing(1, 3)
			if id != "":
				UniBuffs.gain_blessing(state, id, {"silent": true})
		return {"kind": "blessing", "count": 2}
	if r < 0.7:
		for i in range(2):
			var cid: String = UniBuffs.roll_curio(false)
			if cid != "":
				UniBuffs.gain_curio(state, cid, {"silent": true})
		return {"kind": "curio", "count": 2}
	var eid: String = UniBuffs.roll_equation(1, 3)
	if eid != "":
		UniBuffs.gain_equation(state, eid)
	return {"kind": "equation", "count": 1}

## 抽签单次判定（只判定等级，不应用效果；应用见 _apply_lottery）
static func _draw_lottery_one(state: Dictionary) -> Dictionary:
	var r: float = randf()
	if r < 0.1:
		return {"level": 4, "name": "大吉"}
	if r < 0.3:
		return {"level": 3, "name": "中吉"}
	if r < 0.7:
		return {"level": 2, "name": "小吉"}
	return {"level": 1, "name": "凶"}

## 应用单支抽签结果（大吉=3个3星祝福 / 中吉=1个3星奇物 / 小吉=2个1-2星祝福 / 凶=失去20%生命上限）
static func _apply_lottery(state: Dictionary, d: Dictionary) -> void:
	match int(d.get("level", 1)):
		4:
			for i in range(3):
				var id: String = UniBuffs.roll_blessing(3, 3)
				if id != "":
					UniBuffs.gain_blessing(state, id, {"silent": true})
		3:
			var cid: String = UniBuffs.roll_curio(false, 3, 3)
			if cid != "":
				UniBuffs.gain_curio(state, cid, {"silent": true})
		2:
			for i in range(2):
				var id2: String = UniBuffs.roll_blessing(1, 2)
				if id2 != "":
					UniBuffs.gain_blessing(state, id2, {"silent": true})
		_:
			_lose_team_hp_pct(state, 20.0)

## 抽签：抽 count 支，只应用最好的一支（设计：抽三支取最好）
static func _run_lottery(state: Dictionary, lot: Dictionary) -> Dictionary:
	if not UniCore.spend_shards(state, int(lot.get("cost", 0))):
		return {"failed": "碎片不足"}
	var best: Variant = null
	var draws: Array = []
	for i in range(int(lot.get("count", 1))):
		var d: Dictionary = _draw_lottery_one(state)
		draws.append(d)
		if best == null or int(d.get("level", 0)) > int(best.get("level", 0)):
			best = d
	# 只应用最好一支的效果
	if best != null:
		_apply_lottery(state, best)
	var names: Array = []
	for d in draws:
		names.append(_s(d.get("name", "")))
	state["log"].append("抽签：%s（取%s）" % ["、".join(names), _s(best.get("name", "") if best != null else "无")])
	return {"cost": int(lot.get("cost", 0)), "draws": draws, "best": _s(best.get("name", "") if best != null else "无")}
