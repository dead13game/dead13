// 模拟宇宙商店 — 商品生成 / 购买 / 造物调试台（热量强化 + 覆写）
// 纯逻辑层，零依赖（设计文档 docs/simuniverse-design.md §10）

import { LOG_TYPE } from "../../game/gameLogger.js";
import { UNI_CONST, SHOP_PRICE, SHOP_STOCK } from "./uniConstants.js";
import {
  BLESSINGS,
  CURIO_FX,
  CURIOS,
  EQUATIONS,
  blessingPool,
  rollBlessingCandidates,
  gainBlessing,
  gainCurio,
  gainEquation,
} from "./uniBuffs.js";
import { spendShards, addShards } from "./uniState.js";

// ---- 商店 ----

/** 生成商店商品列表（祝福 3×1星+4×2星+3×3星；奇物 4×1星+4×2星；方程 1×1星+1×2星+1×3星） */
export function createShopStock(state) {
  const stock = { blessing: [], curio: [], equation: [] };
  const pickUnique = (pool, n) => {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  };
  for (const spec of SHOP_STOCK.blessing) {
    const pool = blessingPool(spec.star, spec.star);
    for (const b of pickUnique(pool, spec.count)) {
      stock.blessing.push({ id: b.id, star: spec.star, sold: false });
    }
  }
  for (const spec of SHOP_STOCK.curio) {
    const pool = Object.values(CURIOS).filter((c) => c.star === spec.star && !c.negative);
    for (const c of pickUnique(pool, spec.count)) {
      stock.curio.push({ id: c.id, star: spec.star, sold: false });
    }
  }
  for (const spec of SHOP_STOCK.equation) {
    const pool = Object.values(EQUATIONS).filter((e) => e.star === spec.star);
    for (const eq of pickUnique(pool, spec.count)) {
      stock.equation.push({ id: eq.id, star: spec.star, sold: false });
    }
  }
  state.shopStock = stock;
  return stock;
}

/** 商品价格（受奇物修正：公司/中等念头 +25%、邪恶卫星 -25%、铸铁齿轮 +30%） */
export function shopPrice(state, type, star) {
  let p = SHOP_PRICE[type][star] || 0;
  const priceUp = Math.max(CURIO_FX.gongsi?.priceMult || 0, CURIO_FX.zhongdeng?.priceMult || 0);
  if (state?.curios?.some((c) => c.id === "gongsi" || c.id === "zhongdeng") && priceUp) {
    p = Math.floor(p * priceUp);
  }
  if (state?.curios?.some((c) => c.id === "xiee") && CURIO_FX.xiee?.priceCut) {
    p = Math.floor(p * CURIO_FX.xiee.priceCut);
  }
  if (state?.curios?.some((c) => c.id === "zhutie") && CURIO_FX.zhutie?.priceMult) {
    p = Math.floor(p * CURIO_FX.zhutie.priceMult);
  }
  return p;
}

/** 覆写价格（受奇物修正：信仰债券 -30%、机动指环 -100%、末日复眼 +1000%） */
export function overwritePrice(state) {
  let p = state.overwritePrice;
  if (state.curios?.some((c) => c.id === "xinyang") && CURIO_FX.xinyang?.costCut) p = Math.floor(p * CURIO_FX.xinyang.costCut);
  if (state.curios?.some((c) => c.id === "jidong") && CURIO_FX.jidong?.overwriteFree) p = 0;
  if (state.curios?.some((c) => c.id === "mori") && CURIO_FX.mori?.priceMult) p = Math.floor(p * CURIO_FX.mori.priceMult);
  return p;
}

/** 购买商品（type: blessing/curio/equation） */
export function shopBuy(state, type, idx) {
  const stock = state.shopStock?.[type];
  const item = stock?.[idx];
  if (!item) return { ok: false, reason: "无此商品" };
  if (item.sold) return { ok: false, reason: "已售出" };
  const price = shopPrice(state, type, item.star);
  if (!spendShards(state, price)) return { ok: false, reason: "宇宙碎片不足" };
  item.sold = true;
  if (type === "blessing") gainBlessing(state, item.id);
  else if (type === "curio") gainCurio(state, item.id);
  else if (type === "equation") gainEquation(state, item.id);
  state.devLog.info(LOG_TYPE.UNI_REGION, "商店购买", {
    type,
    id: item.id,
    price,
    shards: state.shards,
  });
  return { ok: true, price, id: item.id };
}

// ---- 造物调试台（首领层 / 奇遇） ----

/** 热量强化祝福：消耗热量使该祝福效果 ×2（1/2/3 星需 1/2/3 热量） */
export function heatStrengthen(state, blessingIdx) {
  const b = state.blessings[blessingIdx];
  if (!b) return { ok: false, reason: "无此祝福" };
  const cost = b.star; // 1 星 1 热量，2 星 2 热量，3 星 3 热量
  if (state.heat < cost) return { ok: false, reason: "热量不足" };
  state.heat -= cost;
  b.heatEnhanced = (b.heatEnhanced || 1) + 1;
  state.log.push(`热量强化祝福「${BLESSINGS[b.id]?.name}」（效果倍率 ${b.heatEnhanced}，剩余 ${state.heat} 热量）`);
  state.devLog.info(LOG_TYPE.UNI_REGION, "造物调试台：热量强化", {
    blessingIdx,
    heat: state.heat,
    heatEnhanced: b.heatEnhanced,
  });
  return { ok: true, heatLeft: state.heat };
}

/** 覆写祝福：碎片把指定祝福换成同星级随机祝福（强化状态继承），价格递增 25→200 */
export function overwriteBlessing(state, blessingIdx) {
  const b = state.blessings[blessingIdx];
  if (!b) return { ok: false, reason: "无此祝福" };
  const price = overwritePrice(state);
  if (!spendShards(state, price)) return { ok: false, reason: "宇宙碎片不足" };
  const pool = blessingPool(b.star, b.star).filter((x) => x.id !== b.id);
  if (pool.length === 0) return { ok: false, reason: "无可替换祝福" };
  const next = pool[Math.floor(Math.random() * pool.length)];
  const enhanced = b.enhanced || 1;
  const heatEnhanced = b.heatEnhanced || 1;
  state.blessings[blessingIdx] = { id: next.id, star: next.star, enhanced, heatEnhanced };
  state.overwritePrice = Math.min(UNI_CONST.OVERWRITE_CAP, price + UNI_CONST.OVERWRITE_STEP);
  state.log.push(
    `覆写祝福：「${BLESSINGS[b.id]?.name}」→「${next.name}」（${price} 碎片，下次 ${state.overwritePrice}）`,
  );
  return { ok: true, price, nextId: next.id, nextPrice: state.overwritePrice };
}

/** 覆写方程：同星级随机替换 */
export function overwriteEquation(state, eqIdx) {
  const eq = state.equations[eqIdx];
  if (!eq) return { ok: false, reason: "无此方程" };
  const price = overwritePrice(state);
  if (!spendShards(state, price)) return { ok: false, reason: "宇宙碎片不足" };
  const pool = Object.values(EQUATIONS).filter((e) => e.star === eq.star && e.id !== eq.id);
  if (pool.length === 0) return { ok: false, reason: "无可替换方程" };
  const next = pool[Math.floor(Math.random() * pool.length)];
  state.equations[eqIdx] = { id: next.id, star: next.star, enhanced: eq.enhanced || 1 };
  state.overwritePrice = Math.min(UNI_CONST.OVERWRITE_CAP, price + UNI_CONST.OVERWRITE_STEP);
  state.log.push(
    `覆写方程：「${EQUATIONS[eq.id]?.name}」→「${next.name}」（${price} 碎片）`,
  );
  return { ok: true, price, nextId: next.id };
}

/** 首领层进入时重置热量与覆写价格（enterRegion 调用）；化作尘泥额外 +5 热量 */
export function resetWorkbench(state) {
  state.heat = UNI_CONST.BOSS_HEAT + (state.curios?.some((c) => c.id === "huacheng") ? (CURIO_FX.huacheng?.heat || 5) : 0);
  state.overwritePrice = UNI_CONST.OVERWRITE_BASE;
}

/** 生成 3 星祝福三选一候选（首领胜利奖励/福灵胶） */
export function rollTopBlessingPicks(count = 3) {
  return rollBlessingCandidates(count, 3, 3);
}
