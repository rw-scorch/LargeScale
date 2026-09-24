import test from "node:test";
import assert from "node:assert/strict";
import { createBook, list, cancel, depth, bestPrice, quote, buy, tickBook, lastTraded } from "./orderbook.js";

const node = (id, stock = {}) => ({ id, stock });

test("listing takes the goods off the seller's shelf", () => {
  const b = createBook();
  const n = node(1, { iron: 100 });
  const seller = { id: 7, money: 0 };
  assert.equal(list(b, seller, n, "iron", 150, 3, 0).error, "only 100 iron at that market");
  const { listing } = list(b, seller, n, "iron", 60, 3, 0);
  assert.equal(n.stock.iron, 40);
  assert.equal(listing.price, 3);
  assert.equal(bestPrice(b, "iron"), 3);
});

test("buyers take the cheapest listings first and sellers are paid minus the fee", () => {
  const b = createBook();
  const nodes = new Map();
  const a = node(1, { iron: 100 }), c = node(2, { iron: 100 });
  nodes.set(1, a); nodes.set(2, c);
  const s1 = { id: 1, money: 0 }, s2 = { id: 2, money: 0 };
  list(b, s1, a, "iron", 40, 5, 0);
  list(b, s2, c, "iron", 40, 2, 0);
  assert.equal(quote(b, "iron", 50).cost, 40 * 2 + 10 * 5);
  const buyer = { id: 9, money: 1000 };
  const res = buy(b, buyer, "iron", 50, 3, 0, new Map([[1, s1], [2, s2]]));
  assert.equal(buyer.money, 1000 - res.cost);
  assert.ok(Math.abs(s2.money - 80 * 0.97) < 1e-9);
  assert.ok(Math.abs(s1.money - 50 * 0.97) < 1e-9);
  assert.equal(depth(b, "iron").length, 1);
  assert.equal(depth(b, "iron")[0].qty, 30);
});

test("you cannot buy more than is listed", () => {
  const b = createBook();
  const s = { id: 1, money: 0 };
  list(b, s, node(1, { oil: 20 }), "oil", 20, 6, 0);
  const q = quote(b, "oil", 50);
  assert.match(q.error, /only 20 oil listed/);
  assert.equal(q.available, 20);
});

test("orders are delivered after the delivery time", () => {
  const b = createBook();
  const s = { id: 1, money: 0 };
  const n = node(1, { steel: 50 });
  list(b, s, n, "steel", 50, 10, 0);
  const buyer = { id: 2, money: 10000 };
  buy(b, buyer, "steel", 30, 5, 0, new Map([[1, s]]));
  const got = [];
  for (let t = 10; t <= 120; t += 10) tickBook(b, t, o => got.push(o), new Map());
  assert.equal(got.length, 1);
  assert.equal(got[0].deliverTo, 5);
  assert.equal(got[0].qty, 30);
  assert.equal(lastTraded(b, "steel"), 10);
});

test("cancelled and expired listings go back to the seller", () => {
  const b = createBook({ listingLifeSeconds: 100 });
  const n = node(1, { wood: 50 });
  const nodes = new Map([[1, n]]);
  const s = { id: 1, money: 0 };
  const { listing } = list(b, s, n, "wood", 30, 2, 0);
  assert.equal(cancel(b, { id: 2 }, listing.id, nodes).error, "not your listing");
  assert.equal(cancel(b, s, listing.id, nodes).returned, 30);
  assert.equal(n.stock.wood, 50);
  list(b, s, n, "wood", 20, 2, 0);
  tickBook(b, 200, () => true, nodes);
  assert.equal(n.stock.wood, 50);
  assert.equal(depth(b, "wood").length, 0);
});
