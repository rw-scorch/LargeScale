import test from "node:test";
import assert from "node:assert/strict";
import { createMarket, price, quoteBuy, quoteSell, buy, sell, marketTick, trend, upgradePrice, licence, buyUpgrade } from "./market.js";

test("buying raises the price and selling lowers it", () => {
  const m = createMarket();
  const p0 = price(m, "iron");
  buy(m, { id: 1, money: 1e6 }, "iron", 1000, 1, 0);
  assert.ok(price(m, "iron") > p0);
  sell(m, { id: 1, money: 0 }, "iron", 2000, { stock: { iron: 2000 } });
  assert.ok(price(m, "iron") < p0);
});

test("one big order costs the same as two halves", () => {
  const a = createMarket(), b = createMarket();
  const big = quoteBuy(a, "wood", 800).cost;
  const n = { id: 1, money: 1e6 };
  const h1 = buy(b, n, "wood", 400, 1, 0).cost;
  const h2 = buy(b, n, "wood", 400, 1, 0).cost;
  assert.ok(Math.abs(big - (h1 + h2)) < 1e-6);
});

test("round trips always lose money", () => {
  const m = createMarket();
  const n = { id: 1, money: 1e6 };
  const node = { stock: { gold: 0 } };
  for (const q of [10, 100, 1000, 2000]) {
    const c = buy(m, n, "gold", q, 1, 0).cost;
    node.stock.gold += q;
    const r = sell(m, n, "gold", q, node).revenue;
    assert.ok(r < c, `q ${q}`);
  }
});

test("orders are capped and need money and goods", () => {
  const m = createMarket();
  assert.ok(quoteBuy(m, "oil", 5000).error);
  assert.equal(buy(m, { id: 1, money: 1 }, "oil", 100, 1, 0).error, "not enough money");
  assert.match(sell(m, { id: 1 }, "oil", 100, { stock: { oil: 5 } }).error, /only 5 oil/);
});

test("stock drifts back to target and deliveries arrive", () => {
  const m = createMarket();
  const n = { id: 1, money: 1e6 };
  buy(m, n, "steel", 2000, 7, 0);
  const low = m.book.steel.S;
  const got = [];
  let early = null;
  for (let t = 60; t <= 6 * 3600; t += 60) {
    marketTick(m, 60, t, o => got.push(o));
    if (t === 3600) early = trend(m, "steel", 60);
  }
  assert.ok(m.book.steel.S > low + (m.book.steel.T - low) * 0.6);
  assert.equal(got.length, 1);
  assert.equal(got[0].deliverTo, 7);
  assert.equal(early, "down");
});

test("upgrades must be licensed before others can buy them, and get cheaper", () => {
  const m = createMarket();
  const node = { id: "masonry", cost: 120 };
  const a = { id: 1, money: 0, known: new Set(["masonry"]) };
  const b = { id: 2, money: 1000, known: new Set() };
  assert.ok(buyUpgrade(m, b, node).error);
  assert.ok(licence(m, a, node).pay > 0);
  assert.ok(licence(m, a, node).error);
  const cost = buyUpgrade(m, b, node).cost;
  assert.equal(cost, upgradePrice(node, 1));
  assert.ok(upgradePrice(node, 6) < upgradePrice(node, 1));
});
