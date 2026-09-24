export const BASE_PRICE = {
  food: 1, wood: 1.2, stone: 1.5, clay: 1.3, coal: 2, iron: 3, copper: 3.5, tin: 4, salt: 2, sulfur: 4,
  silver: 12, gold: 25, gems: 40, oil: 6, gas: 5, fuel: 8, steel: 10, concrete: 4, goods: 5,
  bauxite: 3, lithium: 18, uranium: 80, electronics: 30,
};

export const MARKET = {
  elasticity: 0.8,
  fee: 0.03,
  targetStock: 10000,
  floorShare: 0.05,
  maxBuyShare: 0.25,
  maxSellShare: 0.5,
  reversionHours: 6,
  deliverySeconds: 60,
  historyMinutes: 240,
};

export function createMarket(players = 4, rules = MARKET, prices = BASE_PRICE) {
  const book = {};
  for (const [k, p0] of Object.entries(prices)) {
    const T = rules.targetStock * Math.max(1, players / 4);
    book[k] = { p0, T, S: T, history: [] };
  }
  return { rules, book, orders: [], clock: 0, licences: new Map() };
}

export function price(m, k) {
  const r = m.book[k], e = m.rules.elasticity;
  return r.p0 * Math.pow(r.T / Math.max(r.S, r.T * m.rules.floorShare), e);
}

function integral(r, a, b, e) {
  const c = r.p0 * Math.pow(r.T, e) / (1 - e);
  return c * (Math.pow(b, 1 - e) - Math.pow(a, 1 - e));
}

export function quoteBuy(m, k, q) {
  const r = m.book[k];
  if (!r) return { error: "not traded" };
  if (!(q > 0)) return { error: "amount must be positive" };
  const floor = r.T * m.rules.floorShare;
  if (q > (r.S - floor) * m.rules.maxBuyShare / (1 - m.rules.floorShare) || r.S - q < floor) return { error: "market cannot supply that much at once" };
  const cost = integral(r, r.S - q, r.S, m.rules.elasticity) * (1 + m.rules.fee);
  return { cost, avg: cost / q };
}

export function quoteSell(m, k, q) {
  const r = m.book[k];
  if (!r) return { error: "not traded" };
  if (!(q > 0)) return { error: "amount must be positive" };
  if (q > r.S * m.rules.maxSellShare) return { error: "market cannot absorb that much at once" };
  const revenue = integral(r, r.S, r.S + q, m.rules.elasticity) * (1 - m.rules.fee);
  return { revenue, avg: revenue / q };
}

export function buy(m, nation, k, q, deliverTo, now) {
  const qt = quoteBuy(m, k, q);
  if (qt.error) return qt;
  if ((nation.money ?? 0) < qt.cost) return { error: "not enough money" };
  nation.money -= qt.cost;
  m.book[k].S -= q;
  const order = { id: m.orders.length + 1, nation: nation.id, kind: k, q, deliverTo, due: now + m.rules.deliverySeconds };
  m.orders.push(order);
  return { ...qt, order };
}

export function sell(m, nation, k, q, fromNode) {
  if ((fromNode.stock[k] ?? 0) < q) return { error: `only ${Math.floor(fromNode.stock[k] ?? 0)} ${k} at that market` };
  const qt = quoteSell(m, k, q);
  if (qt.error) return qt;
  fromNode.stock[k] -= q;
  nation.money = (nation.money ?? 0) + qt.revenue;
  m.book[k].S += q;
  return qt;
}

export function marketTick(m, dt, now, deliver) {
  const k = 1 - Math.exp(-dt / (m.rules.reversionHours * 3600));
  for (const r of Object.values(m.book)) r.S += (r.T - r.S) * k;
  for (const o of m.orders) if (!o.done && o.due <= now) { o.done = deliver(o) !== false; }
  m.orders = m.orders.filter(o => !o.done);
  m.clock += dt;
  if (m.clock >= 60) {
    m.clock -= 60;
    for (const key of Object.keys(m.book)) {
      const r = m.book[key];
      r.history.push(+price(m, key).toFixed(3));
      if (r.history.length > m.rules.historyMinutes) r.history.shift();
    }
  }
}

export function trend(m, k, minutes = 30) {
  const h = m.book[k].history;
  if (h.length < 2) return "flat";
  const past = h[Math.max(0, h.length - 1 - minutes)], now = h[h.length - 1];
  if (now > past * 1.02) return "up";
  if (now < past * 0.98) return "down";
  return "flat";
}

export const INFO = {
  intel_nation: { base: 60, perPlot: 0.05, seconds: 300, name: "Troops and stacks of one nation" },
  intel_region: { base: 25, perPlot: 0, seconds: 600, name: "Lift fog over one region" },
  intel_deposits: { base: 40, perPlot: 0, seconds: 0, name: "Reveal deposits in one region" },
  intel_prices: { base: 10, perPlot: 0, seconds: 3600, name: "Price forecast for one hour" },
};

export function infoPrice(kind, target) {
  const i = INFO[kind];
  return Math.round(i.base + i.perPlot * (target?.plots ?? 0));
}

export function upgradePrice(node, owners, rpPrice = 3) {
  const f = Math.min(1.5, Math.max(0.6, 1.5 - 0.1 * owners));
  return Math.round(node.cost * rpPrice * f);
}

export function licence(m, nation, node) {
  const key = node.id;
  const set = m.licences.get(key) ?? new Set();
  if (!nation.known.has(node.id)) return { error: "you have not researched that" };
  if (set.has(nation.id)) return { error: "already licensed" };
  set.add(nation.id);
  m.licences.set(key, set);
  const pay = Math.round(upgradePrice(node, set.size) * 0.5);
  nation.money = (nation.money ?? 0) + pay;
  return { pay };
}

export function buyUpgrade(m, nation, node) {
  const owners = m.licences.get(node.id)?.size ?? 0;
  if (!owners) return { error: "nobody has licensed this upgrade yet" };
  if (nation.known.has(node.id)) return { error: "already known" };
  const cost = upgradePrice(node, owners);
  if ((nation.money ?? 0) < cost) return { error: "not enough money" };
  nation.money -= cost;
  return { cost };
}
