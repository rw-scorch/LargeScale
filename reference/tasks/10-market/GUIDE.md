# Piece 10: Market

## Goal

One automatic market that everyone trades with, never with each other directly:

- It buys and sells resources.
- It sells information.
- It lets upgrades change hands through licences.
- Prices move with supply and demand, so what the others are doing shows up in your prices.

## Already decided

- No manual player-to-player deals.
- A single in-menu market that sells and buys upgrades, information and resources.
- Automatic supply-and-demand pricing.
- Goods are physical, so what you sell must be at a market building, and what you buy is delivered to one.

## Depends on

Piece 7 (goods at nodes) and piece 9 (upgrades to trade).

## The market is now a board of player listings

Round four changed the shape of this piece. Nothing is sold by the world itself. Players list goods at their own price, and buyers take the cheapest listings first. `example/orderbook.js` implements that, with 5 tests:

- `list(book, seller, node, kind, qty, price, now)` takes the goods off the seller's stockpile straight away, so a listing is real stock rather than a promise.
- `depth` and `bestPrice` give the order book for a good, cheapest first.
- `quote(book, kind, qty)` prices a purchase across as many listings as it needs, and refuses if too little is listed.
- `buy` charges the buyer, pays each seller minus a 3 percent fee, and queues a delivery.
- `tickBook` delivers orders after the delivery time and returns expired listings to their seller.
- `cancel` puts a listing back on the seller's shelf.

Consequences: there is no world stock and no single price, so the curve pricing below is no longer the main model. Keep it only as a fallback for a world with too few players to make a real board. Everything else in this guide still holds: physical delivery, market buildings, and era limits on what can be listed or bought.

## Example code

`example/market.js` and 6 tests.

### Book

For each resource:

| Field | Meaning |
| --- | --- |
| base price `p0` | 23 goods priced, from food at 1 to uranium at 80 |
| target stock `T` | 10,000, scaled up with more than 4 players |
| current stock `S` | Starts equal to `T` |

### Price

`p0 × (T / S)^0.8`, with the stock never counted below 5 percent of target. When players buy, stock falls and the price rises. When they sell, it falls.

### Order cost

The exact area under the price curve, plus a 3 percent fee on each side. Because it is the exact area:

- Buying 800 costs the same as buying 400 twice, so splitting orders gains nothing.
- A buy followed by a sell of the same amount always loses money, so there is no loop to farm.

### Limits

- One buy takes at most a quarter of the stock above the floor.
- One sell adds at most half the current stock.

### Delivery

`buy` takes money now and queues an order. `marketTick` delivers it after 60 seconds by calling your `deliver` function, which adds the goods to the chosen node.

### Selling

`sell` needs the goods to be at the named node, and removes them from it.

### Drift

Every tick, stock drifts back toward target with a 6-hour time constant. This stands for the rest of the world trading, so a price spike fades over the afternoon.

### History and trend

- `history` keeps one price per minute for 4 hours, for the chart (`mkt_chart`).
- `trend` says up, down or flat over a window, for the `price_up`, `price_down` and `price_flat` arrows.

### What the market sells now

The third question round changed this: with no fog of war, selling intelligence makes no sense. The market sells things instead, delivered physically to a market building: resources, vehicles, aircraft and ships. Prices for a finished machine work the same way as for a resource, with a much smaller stock and a much steeper curve, so buying a squadron is possible once and expensive twice. The information table below is kept only as a record of what was replaced.

### Information products, replaced

`INFO` lists what can be bought, and `infoPrice` prices it:

| Product | What it gives | Price |
| --- | --- | --- |
| Nation intel | A nation's troops and stacks for 5 minutes | 60 plus 0.05 per plot the target owns |
| Region | Fog lifted from a region | 25 |
| Deposits | Deposits revealed in a region | 40 |
| Price forecast | Prices for the next hour | 10 |

### Upgrades

- A nation that has researched a node can `licence` it once, earning half its current price.
- After that, anyone can `buyUpgrade` it for `node cost × 3 × f`, where `f` starts at 1.4 with one owner and falls by 0.1 per extra owner, never below 0.6.
- The more common an upgrade is, the cheaper it gets. This helps whoever is behind.

## Steps

1. **Market buildings.** Trading requires one: `market_stall` in Tribal, `trading_post` in Medieval, ports later. Deliveries and sales happen at the one you pick.
2. **Market panel.**
   - Tabs for resources, upgrades and info (`mkt_tab_resources`, `mkt_tab_upgrades`, `mkt_tab_info`).
   - Rows in `frame_listing_row`: icon, price, trend arrow, and a small chart on tap.
   - Buy and sell buttons (`mkt_buy`, `mkt_sell`) with an amount slider.
   - A live quote from `quoteBuy` or `quoteSell` before confirming.
3. Run the market inside the world object and save the book every minute. Show everyone the same prices.
4. **Information.** On purchase, give the buyer a timed view. The server includes the target's stacks in that player's `state` messages until it expires.
5. **Upgrade licences.** Show "You can licence this" on researched nodes, with the payout. Show "Available on the market" on nodes others have licensed.
6. **Tune the base prices** after pieces 5 to 7 so that mining at home is always cheaper than buying, and selling surplus is worth the trip to the market.

## Done when

- The tests pass.
- Buying a lot of iron visibly raises its price for everyone, and the price slowly recovers.
- There is no way to make money by buying and immediately selling.
- A nation that fell behind can buy its way back to parity in one branch at a clear cost.

## Pitfalls

- Money must be checked and taken in the same step as the stock change. The world object's single thread makes this safe as long as nothing awaits between them.
- Watch the upgrade licence loop: two friends licensing everything to each other for money. The half-price payout and the one licence per nation per node limit it. If it still feels exploitable, pay the licence fee over time instead of up front.

## Open question

Is the licence model what you meant by "sells and buys upgrades"? A simpler alternative is that the market only sells upgrades any nation has researched, at a price that drops as more nations have them, with no licensing step.
