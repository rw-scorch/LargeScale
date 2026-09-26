import { el } from "./dom.js";
import { api } from "../api.js";

export function createPasswordForm(say) {
  const field = (id, label, auto) => el("input", { id, type: "password", placeholder: label, autocomplete: auto, maxlength: 200 });
  const current = field("password-current", "current password", "current-password");
  const fresh = field("password-new", "new password, at least 8 characters", "new-password");
  const again = field("password-again", "new password again", "new-password");
  const save = el("button", { id: "password-save", class: "primary", type: "submit", text: "Change password" });
  const submit = async e => {
    e.preventDefault();
    if (fresh.value.length < 8) return say("The new password needs at least 8 characters.");
    if (fresh.value !== again.value) return say("The two new passwords are not the same.");
    save.disabled = true;
    const r = await api("/api/password", { current: current.value, password: fresh.value });
    save.disabled = false;
    if (r.error) return say(r.error[0].toUpperCase() + r.error.slice(1) + ".");
    for (const f of [current, fresh, again]) f.value = "";
    box.hidden = true;
    say(`Password changed.${r.others ? ` Your ${r.others} other ${r.others === 1 ? "session was" : "sessions were"} logged out.` : ""}`);
  };
  const box = el("form", { id: "password-panel", class: "form", hidden: true, onsubmit: submit },
    el("h2", { text: "Change your password" }), current, fresh, again, save);
  return {
    el: box,
    toggle() {
      box.hidden = !box.hidden;
      if (!box.hidden) current.focus();
    },
  };
}
