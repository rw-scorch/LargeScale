import { el } from "./dom.js";

const SHEET = "/assets/sheets/ui";

const loadImage = src => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

export const iconsReady = Promise.all([fetch(`${SHEET}.json`).then(r => r.json()), loadImage(`${SHEET}.png`)]).then(([sheet, img]) => {
  const w = img.naturalWidth, h = img.naturalHeight;
  const rules = Object.entries(sheet.frames).map(([id, f]) => `.i-${id}{--x:${f.x};--y:${f.y};--w:${f.w};--h:${f.h}}`);
  const style = document.createElement("style");
  style.textContent = `.icon{display:inline-block;flex:none;--k:1.5;width:calc(var(--w,16) * var(--k) * 1px);height:calc(var(--h,16) * var(--k) * 1px);background:url(${SHEET}.png) no-repeat;background-size:calc(${w}px * var(--k)) calc(${h}px * var(--k));background-position:calc(var(--x) * var(--k) * -1px) calc(var(--y) * var(--k) * -1px);image-rendering:pixelated;vertical-align:middle}\n${rules.join("\n")}`;
  document.head.append(style);
}).catch(() => {});

export const icon = (id, k = null) => el("i", { class: `icon i-${id}`, "aria-hidden": "true", style: k ? `--k:${k}` : null });
