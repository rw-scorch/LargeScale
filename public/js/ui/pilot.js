import { el } from "./dom.js";

export function createPilotPanel(root, game, top = root) {
  const text = el("span", { id: "pilot-text" });
  const letGo = el("button", { id: "pilot-release", class: "primary", text: "Let go", onclick: () => game.stopPilot() });
  const banner = el("div", { id: "pilot-hint", class: "banner", hidden: true }, text, " ", letGo);
  const knob = el("i", { class: "knob" });
  const stick = el("div", { id: "pilot-stick", class: "pilot-stick" }, knob);
  const fire = el("button", { id: "pilot-fire", class: "pilot-fire", text: "Fire" });
  const bomb = el("button", { id: "pilot-bomb", class: "pilot-bomb", text: "Bomb", hidden: true, onclick: () => { state.bomb = true; } });
  const pad = el("div", { id: "pilot-pad", class: "coarse-only", hidden: true }, stick, fire, bomb);
  top.append(banner);
  root.append(pad);
  const state = { move: [0, 0], firing: false, aim: null, tapped: false, bomb: false };

  let stickId = null;
  const stickAt = e => {
    const r = stick.getBoundingClientRect(), R = r.width / 2;
    let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    state.move = [dx, dy];
    knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
  };
  stick.addEventListener("pointerdown", e => { e.preventDefault(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickAt(e); });
  stick.addEventListener("pointermove", e => { if (e.pointerId === stickId) stickAt(e); });
  const stickEnd = e => { if (e.pointerId !== stickId) return; stickId = null; state.move = [0, 0]; knob.style.transform = ""; };
  stick.addEventListener("pointerup", stickEnd);
  stick.addEventListener("pointercancel", stickEnd);

  let fireId = null, from = null, dragged = false;
  fire.addEventListener("pointerdown", e => { e.preventDefault(); fireId = e.pointerId; fire.setPointerCapture(e.pointerId); from = [e.clientX, e.clientY]; dragged = false; state.aim = null; state.firing = false; });
  fire.addEventListener("pointermove", e => {
    if (e.pointerId !== fireId) return;
    const dx = e.clientX - from[0], dy = e.clientY - from[1];
    if (Math.hypot(dx, dy) < 12) return;
    dragged = true;
    state.aim = [dx, dy];
    state.firing = true;
  });
  const fireEnd = e => {
    if (e.pointerId !== fireId) return;
    fireId = null;
    if (!dragged) state.tapped = true;
    state.firing = false;
    state.aim = null;
  };
  fire.addEventListener("pointerup", fireEnd);
  fire.addEventListener("pointercancel", fireEnd);

  return {
    state,
    takeTap() { const t = state.tapped; state.tapped = false; return t; },
    takeBomb() { const b = state.bomb; state.bomb = false; return b; },
    show(on) {
      banner.hidden = pad.hidden = !on;
      if (!on) { state.move = [0, 0]; state.firing = false; state.aim = null; knob.style.transform = ""; }
    },
    update() {
      const p = game.piloting, w = game.world;
      if (!p || !w) return;
      const u = p.kind === "m" ? w.machines.get(p.id) : null, what = u ? u.def.name.toLowerCase() : "company";
      const turns = !!u && ["sea", "air"].includes(u.def.domain), bomber = !!u?.def.bomb;
      bomb.hidden = !bomber;
      text.replaceChildren(`Piloting your ${what}: `,
        el("span", { class: "fine-only", text: `${turns ? "W and S speed up and slow down, A and D turn" : "WASD or the arrows move it"}; the mouse aims and a held click fires${bomber ? "; B drops the bombs" : ""}. Esc lets go.` }),
        el("span", { class: "coarse-only", text: turns ? "the stick's up and down speed up and slow down, left and right turn. Drag from Fire to aim, or tap it to fire at the nearest enemy ahead." : "the stick moves it. Drag from Fire to aim, or tap it to fire at the nearest enemy ahead." }));
    },
  };
}
