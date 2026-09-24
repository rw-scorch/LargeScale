import { el } from "./dom.js";

export function createSpawnHint(root, game) {
  const box = el("div", { id: "spawn-hint", class: "banner", hidden: true }, "Tap the map where you want to start. Pick open land away from others.");
  root.append(box);
  return {
    update() {
      const n = game.world?.nations.get(game.world.you);
      box.hidden = !game.world || !!n?.spawned || game.world.frozen;
    },
    async tryAt(x, y) {
      const r = await game.conn.request({ t: "spawn", x, y });
      if (!r.ok) return game.toast(r.error ?? "cannot start there");
      game.focus(y * game.world.w + x, 6);
    },
  };
}
