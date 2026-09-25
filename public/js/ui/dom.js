export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "text") e.textContent = v;
    else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid);
  return e;
}

export function armed(label, sure, action, props = {}) {
  let at = -Infinity;
  const b = el("button", { ...props, text: label });
  b.addEventListener("click", async () => {
    if (performance.now() - at > 4000) {
      at = performance.now();
      b.textContent = sure;
      b.classList.add("danger");
      setTimeout(() => { if (performance.now() - at >= 3990) { b.textContent = label; b.classList.remove("danger"); } }, 4000);
      return;
    }
    at = -Infinity;
    b.textContent = label;
    b.classList.remove("danger");
    await action();
  });
  return b;
}

export const fmt = n => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(Math.round(n)));
