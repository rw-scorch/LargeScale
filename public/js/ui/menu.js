import { el } from "./dom.js";
import { createLiveView } from "./liveview.js";

export function createMenu(root) {
  const body = el("div", { class: "menu-body" });
  const brand = el("header", { class: "brand" },
    el("div", { class: "logo" }, el("span", { class: "logo-mark" }), el("span", { class: "logo-text" }, el("b", { text: "Large" }), el("b", { text: "Scale" }))),
    el("p", { class: "tagline", text: "One world on a real map. Eight rulers. Weeks of war." }));
  const side = el("section", { class: "menu-side" }, brand, body);
  const live = el("section", { class: "menu-live" });
  root.classList.add("menu");
  root.replaceChildren(side, live);
  const view = createLiveView(live);
  return {
    body,
    live: view,
    stop() {
      view.stop();
      root.classList.remove("menu");
    },
  };
}
