class_name UniShop
## 模拟宇宙商店（从 src/simuniverse/logic/uniShop.js 移植）
## 商品生成 / 购买 / 造物调试台（热量强化 + 覆写）

const UniConstants = preload("res://scripts/game/uni_constants.gd")
const UniBuffs = preload("res://scripts/game/uni_buffs.gd")
const UniCore = preload("res://scripts/game/uni_core.gd")

static func _s(v: Variant) -> String:
	return "" if v == null else str(v)

## 生成商店商品列表
static func create_shop_stock(state: Dictionary) -> Dictionary:
	var stock: Dictionary = {"blessing": [], "curio": [], "equation": []}
	var pick_unique := func(pool: Array, n: int) -> Array:
		var arr: Array = pool.duplicate()
		for i in range(arr.size() - 1, 0, -1):
			var j: int = randi() % (i + 1)
			var tmp = arr[i]
			arr[i] = arr[j]
			arr[j] = tmp
		return arr.slice(0, mini(n, arr.size()))
	for spec in UniConstants.SHOP_STOCK["blessing"]:
		var pool: Array = UniBuffs.blessing_pool(int(spec["star"]), int(spec["star"]))
		for b in pick_unique.call(pool, int(spec["count"])):
			stock["blessing"].append({"id": _s(b.get("id", "")), "star": int(spec["star"]), "sold": false})
	for spec in UniConstants.SHOP_STOCK["curio"]:
		var pool2: Array = []
		for c in UniBuffs.CURIOS.values():
			if int(c.get("star", 0)) == int(spec["star"]) and not c.get("negative", false):
				pool2.append(c)
		for c in pick_unique.call(pool2, int(spec["count"])):
			stock["curio"].append({"id": _s(c.get("id", "")), "star": int(spec["star"]), "sold": false})
	for spec in UniConstants.SHOP_STOCK["equation"]:
		var pool3: Array = []
		for e in UniBuffs.EQUATIONS.values():
			if int(e.get("star", 0)) == int(spec["star"]):
				pool3.append(e)
		for eq in pick_unique.call(pool3, int(spec["count"])):
			stock["equation"].append({"id": _s(eq.get("id", "")), "star": int(spec["star"]), "sold": false})
	state["shopStock"] = stock
	return stock

## 商品价格（受奇物修正）
static func shop_price(state: Dictionary, type: String, star: int) -> int:
	var p: int = int(UniConstants.SHOP_PRICE.get(type, {}).get(star, 0))
	var price_up: float = maxf(float(UniBuffs.CURIO_FX.get("gongsi", {}).get("priceMult", 0)), float(UniBuffs.CURIO_FX.get("zhongdeng", {}).get("priceMult", 0)))
	if (UniCore.has_curio(state, "gongsi") or UniCore.has_curio(state, "zhongdeng")) and price_up > 0:
		p = ceili(float(p) * price_up)
	if UniCore.has_curio(state, "xiee") and UniBuffs.CURIO_FX.get("xiee", {}).has("priceCut"):
		p = ceili(float(p) * float(UniBuffs.CURIO_FX["xiee"]["priceCut"]))
	if UniCore.has_curio(state, "zhutie") and UniBuffs.CURIO_FX.get("zhutie", {}).has("priceMult"):
		p = ceili(float(p) * float(UniBuffs.CURIO_FX["zhutie"]["priceMult"]))
	return p

## 覆写价格（受奇物修正）
static func overwrite_price(state: Dictionary) -> int:
	var p: int = int(state.get("overwritePrice", 25))
	if UniCore.has_curio(state, "xinyang") and UniBuffs.CURIO_FX.get("xinyang", {}).has("costCut"):
		p = ceili(float(p) * float(UniBuffs.CURIO_FX["xinyang"]["costCut"]))
	if UniCore.has_curio(state, "jidong") and UniBuffs.CURIO_FX.get("jidong", {}).get("overwriteFree", false):
		p = 0
	if UniCore.has_curio(state, "mori") and UniBuffs.CURIO_FX.get("mori", {}).has("priceMult"):
		p = ceili(float(p) * float(UniBuffs.CURIO_FX["mori"]["priceMult"]))
	return p

## 购买商品
static func shop_buy(state: Dictionary, type: String, idx: int) -> Dictionary:
	var stock: Array = state.get("shopStock", {}).get(type, [])
	if idx < 0 or idx >= stock.size():
		return {"ok": false, "reason": "无此商品"}
	var item: Dictionary = stock[idx]
	if item.get("sold", false):
		return {"ok": false, "reason": "已售出"}
	var price: int = shop_price(state, type, int(item.get("star", 1)))
	if not UniCore.spend_shards(state, price):
		return {"ok": false, "reason": "宇宙碎片不足"}
	item["sold"] = true
	if type == "blessing":
		UniBuffs.gain_blessing(state, _s(item.get("id", "")))
	elif type == "curio":
		UniBuffs.gain_curio(state, _s(item.get("id", "")))
	elif type == "equation":
		UniBuffs.gain_equation(state, _s(item.get("id", "")))
	return {"ok": true, "price": price, "id": item.get("id", "")}

# ---- 造物调试台 ----

## 热量强化祝福：消耗热量使该祝福效果 ×2
static func heat_strengthen(state: Dictionary, blessing_idx: int) -> Dictionary:
	var blessings: Array = state.get("blessings", [])
	if blessing_idx < 0 or blessing_idx >= blessings.size():
		return {"ok": false, "reason": "无此祝福"}
	var b: Dictionary = blessings[blessing_idx]
	var cost: int = int(b.get("star", 1))
	if int(state.get("heat", 0)) < cost:
		return {"ok": false, "reason": "热量不足"}
	state["heat"] = int(state["heat"]) - cost
	b["heatEnhanced"] = int(b.get("heatEnhanced", 1)) + 1
	state["log"].append("热量强化祝福「%s」（效果倍率 %d，剩余 %d 热量）" % [
		_s(UniBuffs.BLESSINGS.get(b.get("id", ""), {}).get("name", b.get("id", ""))),
		int(b["heatEnhanced"]), int(state["heat"])])
	return {"ok": true, "heatLeft": int(state["heat"])}

## 覆写祝福：碎片把指定祝福换成同星级随机祝福
static func overwrite_blessing(state: Dictionary, blessing_idx: int) -> Dictionary:
	var blessings: Array = state.get("blessings", [])
	if blessing_idx < 0 or blessing_idx >= blessings.size():
		return {"ok": false, "reason": "无此祝福"}
	var b: Dictionary = blessings[blessing_idx]
	var price: int = overwrite_price(state)
	if not UniCore.spend_shards(state, price):
		return {"ok": false, "reason": "宇宙碎片不足"}
	var pool: Array = []
	for x in UniBuffs.blessing_pool(int(b.get("star", 1)), int(b.get("star", 1))):
		if _s(x.get("id", "")) != _s(b.get("id", "")):
			pool.append(x)
	if pool.is_empty():
		return {"ok": false, "reason": "无可替换祝福"}
	var next: Dictionary = pool[randi() % pool.size()]
	var enhanced: int = int(b.get("enhanced", 1))
	var heat_enhanced: int = int(b.get("heatEnhanced", 1))
	blessings[blessing_idx] = {"id": next.get("id", ""), "star": next.get("star", 0), "enhanced": enhanced, "heatEnhanced": heat_enhanced}
	state["overwritePrice"] = mini(int(UniConstants.UNI_CONST["OVERWRITE_CAP"]), price + int(UniConstants.UNI_CONST["OVERWRITE_STEP"]))
	state["log"].append("覆写祝福：「%s」→「%s」（%d 碎片，下次 %d）" % [
		_s(UniBuffs.BLESSINGS.get(b.get("id", ""), {}).get("name", b.get("id", ""))),
		_s(next.get("name", "")), price, int(state["overwritePrice"])])
	return {"ok": true, "price": price, "nextId": next.get("id", ""), "nextPrice": int(state["overwritePrice"])}

## 覆写方程：同星级随机替换
static func overwrite_equation(state: Dictionary, eq_idx: int) -> Dictionary:
	var equations: Array = state.get("equations", [])
	if eq_idx < 0 or eq_idx >= equations.size():
		return {"ok": false, "reason": "无此方程"}
	var eq: Dictionary = equations[eq_idx]
	var price: int = overwrite_price(state)
	if not UniCore.spend_shards(state, price):
		return {"ok": false, "reason": "宇宙碎片不足"}
	var pool: Array = []
	for e in UniBuffs.EQUATIONS.values():
		if int(e.get("star", 0)) == int(eq.get("star", 1)) and _s(e.get("id", "")) != _s(eq.get("id", "")):
			pool.append(e)
	if pool.is_empty():
		return {"ok": false, "reason": "无可替换方程"}
	var next: Dictionary = pool[randi() % pool.size()]
	equations[eq_idx] = {"id": next.get("id", ""), "star": next.get("star", 0), "enhanced": int(eq.get("enhanced", 1))}
	state["overwritePrice"] = mini(int(UniConstants.UNI_CONST["OVERWRITE_CAP"]), price + int(UniConstants.UNI_CONST["OVERWRITE_STEP"]))
	state["log"].append("覆写方程：「%s」→「%s」（%d 碎片）" % [
		_s(UniBuffs.EQUATIONS.get(eq.get("id", ""), {}).get("name", eq.get("id", ""))),
		_s(next.get("name", "")), price])
	return {"ok": true, "price": price, "nextId": next.get("id", "")}

## 首领层进入时重置热量与覆写价格
static func reset_workbench(state: Dictionary) -> void:
	var heat: int = int(UniConstants.UNI_CONST["BOSS_HEAT"])
	if UniCore.has_curio(state, "huacheng"):
		heat += int(UniBuffs.CURIO_FX.get("huacheng", {}).get("heat", 5))
	state["heat"] = heat
	state["overwritePrice"] = int(UniConstants.UNI_CONST["OVERWRITE_BASE"])

## 生成 3 星祝福三选一候选
static func roll_top_blessing_picks(count: int = 3) -> Array:
	return UniBuffs.roll_blessing_candidates(count, 3, 3)
