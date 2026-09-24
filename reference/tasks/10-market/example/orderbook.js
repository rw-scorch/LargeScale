export const BOOK = {
  fee: 0.03,
  deliverySeconds: 60,
  listingLifeSeconds: 24 * 3600,
  minPrice: 0.01,
  maxListingsPerNation: 40,
};

export function createBook(rules = {}) {
  return { rules: { ...BOOK, ...rules }, listings: new Map(), next: 1, orders: [], history: [] };
}

export function list(book, seller, node, kind, qty, price, now) {
  qty = Math.floor(qty);
  if (!(qty > 0)) return { error: "amount must be positive" };
  if (!(price >= book.rules.minPrice)) return { error: "price too low" };
  if ((node.stock[kind] ?? 0) < qty) return { error: `only ${Math.floor(node.stock[kind] ?? 0)} ${kind} at that market` };
  const mine = [...book.listings.values()].filter(l => l.seller === seller.id).length;
  if (mine >= book.rules.maxListingsPerNation) return { error: "too many listings" };
  node.stock[kind] -= qty;
  const l = { id: book.next++, seller: seller.id, node: node.id, kind, qty, price, at: now, expires: now + book.rules.listingLifeSeconds };
  book.listings.set(l.id, l);
  return { listing: l };
}

export function cancel(book, seller, id, nodes) {
  const l = book.listings.get(id);
  if (!l || l.seller !== seller.id) return { error: "not your listing" };
  book.listings.delete(id);
  const node = nodes.get(l.node);
  if (node) node.stock[l.kind] = (node.stock[l.kind] ?? 0) + l.qty;
  return { returned: l.qty };
}

export function depth(book, kind) {
  return [...book.listings.values()].filter(l => l.kind === kind && l.qty > 0).sort((a, b) => a.price - b.price || a.id - b.id);
}

export function bestPrice(book, kind) {
  const d = depth(book, kind);
  return d.length ? d[0].price : null;
}

export function quote(book, kind, qty) {
  let left = Math.floor(qty), cost = 0;
  const fills = [];
  for (const l of depth(book, kind)) {
    if (left <= 0) break;
    const take = Math.min(left, l.qty);
    cost += take * l.price;
    fills.push({ listing: l.id, qty: take, price: l.price });
    left -= take;
  }
  if (left > 0) return { error: `only ${Math.floor(qty) - left} ${kind} listed`, available: Math.floor(qty) - left };
  return { cost, fills, avg: cost / Math.floor(qty) };
}

export function buy(book, buyer, kind, qty, deliverTo, now, sellers) {
  const q = quote(book, kind, qty);
  if (q.error) return q;
  if ((buyer.money ?? 0) < q.cost) return { error: "not enough money" };
  buyer.money -= q.cost;
  for (const f of q.fills) {
    const l = book.listings.get(f.listing);
    l.qty -= f.qty;
    const seller = sellers.get(l.seller);
    if (seller) seller.money = (seller.money ?? 0) + f.qty * f.price * (1 - book.rules.fee);
    if (l.qty <= 0) book.listings.delete(l.id);
  }
  const order = { id: book.next++, buyer: buyer.id, kind, qty: Math.floor(qty), due: now + book.rules.deliverySeconds, deliverTo };
  book.orders.push(order);
  book.history.push({ t: now, kind, qty: Math.floor(qty), avg: q.avg });
  if (book.history.length > 500) book.history.shift();
  return { ...q, order };
}

export function tickBook(book, now, deliver, nodes) {
  for (const o of book.orders) if (!o.done && o.due <= now) o.done = deliver(o) !== false;
  book.orders = book.orders.filter(o => !o.done);
  for (const l of [...book.listings.values()]) {
    if (l.expires > now) continue;
    book.listings.delete(l.id);
    const node = nodes?.get?.(l.node);
    if (node) node.stock[l.kind] = (node.stock[l.kind] ?? 0) + l.qty;
  }
}

export function lastTraded(book, kind) {
  for (let i = book.history.length - 1; i >= 0; i--) if (book.history[i].kind === kind) return book.history[i].avg;
  return null;
}
