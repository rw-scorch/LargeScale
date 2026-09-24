import { el } from "./dom.js";
import { api, session } from "../api.js";

export function showLogin(root, onDone) {
  const name = el("input", { id: "login-name", placeholder: "name", autocomplete: "username", maxlength: 20 });
  const pass = el("input", { id: "login-pass", type: "password", placeholder: "password", autocomplete: "current-password" });
  const invite = el("input", { id: "login-invite", placeholder: "invite code (first time only)" });
  const msg = el("p", { class: "msg" });
  const go = async kind => {
    msg.textContent = "";
    const r = await api(`/api/${kind}`, { name: name.value.trim(), password: pass.value, invite: invite.value.trim() });
    if (r.error) return (msg.textContent = r.error);
    session.token = r.token;
    onDone(r.account);
  };
  root.replaceChildren(el("div", { class: "card" },
    el("h1", { text: "Large Scale" }),
    el("form", { onsubmit: e => { e.preventDefault(); go("login"); } },
      name, pass, invite,
      el("div", { class: "row" },
        el("button", { id: "login-go", type: "submit", class: "primary", text: "Log in" }),
        el("button", { id: "register-go", type: "button", onclick: () => go("register"), text: "Register" })),
      msg)));
  name.focus();
}
