import { Directory } from "./directory.js";
import { World } from "./world.js";
import { parseWorldConfig } from "./worldconfig.js";
import { verifyRequest, handleInteraction, message, optionValue, userIdOf, COMMANDS } from "./discord.js";

export { Directory, World };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function bearer(request, url) {
  const h = request.headers.get("Authorization") ?? "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return url.searchParams.get("token") ?? "";
}

async function body(request) {
  if (request.method !== "POST") return null;
  try { return await request.json(); } catch { return null; }
}

async function discordRoute(request, env) {
  const body = await request.text();
  const ok = await verifyRequest(body, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"), env.DISCORD_PUBLIC_KEY);
  if (!ok) return new Response("bad signature", { status: 401 });
  const interaction = JSON.parse(body);
  const dir = env.DIRECTORY.getByName("directory");
  const reply = await handleInteraction(interaction, {
    async status() {
      const acc = await dir.accountForDiscord(userIdOf(interaction));
      if (!acc) return message("Link your game account first with /link, using the code in the game settings.");
      const worlds = await dir.worldsOf({ id: acc.id });
      if (!worlds.length) return message("You are not in a world yet.");
      const r = await env.WORLD.getByName(worlds[0]).report(acc.id);
      if (r.error || !r.you) return message("No nation there yet.");
      return message(`**${r.world}** — ${r.you.name}: ${r.you.plots} plots, ${r.you.troops} troops${r.you.alive ? "" : ", eliminated"}. ${r.online} online.`);
    },
    async world() {
      const acc = await dir.accountForDiscord(userIdOf(interaction));
      if (!acc) return message("Link your game account first with /link.");
      const worlds = await dir.worldsOf({ id: acc.id });
      if (!worlds.length) return message("You are not in a world yet.");
      const r = await env.WORLD.getByName(worlds[0]).report(acc.id);
      const board = r.top.map((n, i) => `${i + 1}. ${n.name}${n.bot ? " (bot)" : ""} — ${n.plots} plots`).join("\n");
      return message(`**${r.world}**, ${r.online} online\n${board}`);
    },
    async alerts() {
      const acc = await dir.accountForDiscord(userIdOf(interaction));
      if (!acc) return message("Link your game account first with /link.");
      const on = optionValue(interaction, "state") === "on";
      await dir.setPrefs(acc.id, { attack: on, missile: on, war: on, eliminated: on, world: on });
      return message(on ? "Alerts are on. I will message you here." : "Alerts are off.");
    },
    async link() {
      const res = await dir.claimLink(optionValue(interaction, "code"), userIdOf(interaction));
      return message(res.error ? res.error : `Linked to ${res.name}. Alerts will come here.`);
    },
  });
  return json(reply);
}

async function adminRoute(request, env, dir, me, path) {
  if (!me.admin) return json({ error: "not allowed" }, 403);
  const post = request.method === "POST";
  if (path === "/api/admin/accounts" && !post) return json(await dir.listAccounts());
  if (path === "/api/admin/log" && !post) return json(await dir.adminLog());
  const acc = path.match(/^\/api\/admin\/accounts\/(\d+)\/(password|remove)$/);
  if (acc && post) {
    const id = Number(acc[1]);
    if (acc[2] === "password") {
      const r = await dir.setPassword(id, ((await body(request)) ?? {}).password, me);
      return json(r, r.error ? 400 : 200);
    }
    const r = await dir.removeAccount(id, me);
    if (r.error) return json(r, 400);
    await Promise.all(r.worlds.map(w => env.WORLD.getByName(w).accountRemoved(id, me.name).catch(() => null)));
    return json(r);
  }
  const del = path.match(/^\/api\/admin\/worlds\/([A-Za-z0-9_-]+)\/delete$/);
  if (del && post) {
    if (!(await dir.worldConfig(del[1]))) return json({ error: "no such world" }, 404);
    await env.WORLD.getByName(del[1]).wipe(me.name);
    await dir.removeWorld(del[1], me);
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}

export default {
  async scheduled(event, env, ctx) {
    const dir = env.DIRECTORY.getByName("directory");
    const worlds = await dir.allWorlds();
    for (const w of worlds) ctx.waitUntil(env.WORLD.getByName(w.id).heartbeat(Date.now()));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const dir = env.DIRECTORY.getByName("directory");
    const path = url.pathname;
    if (path === "/discord/interactions" && request.method === "POST") return discordRoute(request, env);
    if (!path.startsWith("/api/") && !path.startsWith("/ws/")) return env.ASSETS.fetch(request);
    if (path === "/api/register") {
      const b = await body(request);
      if (!b) return json({ error: "bad request" }, 400);
      const r = await dir.register(b.name, b.password, b.invite);
      return json(r, r.error ? 400 : 200);
    }
    if (path === "/api/login") {
      const b = await body(request);
      if (!b) return json({ error: "bad request" }, 400);
      const r = await dir.login(b.name, b.password);
      return json(r, r.error ? 401 : 200);
    }
    const token = bearer(request, url);
    const me = await dir.session(token);
    if (!me) return json({ error: "log in first" }, 401);
    if (path === "/api/logout") return json(await dir.logout(token));
    if (path === "/api/me") return json(me);
    if (path === "/api/password" && request.method === "POST") {
      const b = (await body(request)) ?? {};
      const r = await dir.changePassword(me, token, b.current, b.password);
      return json(r, r.error ? 400 : 200);
    }
    if (path === "/api/link-code" && request.method === "POST") return json(await dir.linkCode(me));
    if (path === "/api/notify" && request.method === "POST") return json(await dir.setPrefs(me.id, (await body(request)) ?? {}));
    if (path === "/api/worlds" && request.method === "GET") return json(await dir.listWorlds(me));
    if (path === "/api/worlds" && request.method === "POST") {
      if (!me.admin) return json({ error: "only the host can create worlds" }, 403);
      const b = (await body(request)) ?? {};
      const bad = parseWorldConfig(b.config ?? {}).error;
      if (bad) return json({ error: bad }, 400);
      const { id } = await dir.createWorld(me, b.name ?? "New world", b.config ?? {});
      const r = await env.WORLD.getByName(id).init({ name: b.name, ...(b.config ?? {}), id });
      if (r.error) {
        await dir.removeWorld(id);
        return json({ error: r.error }, 500);
      }
      return json({ id, ...r });
    }
    if (path.startsWith("/api/admin/")) return adminRoute(request, env, dir, me, path);
    const joinMatch = path.match(/^\/api\/worlds\/([A-Za-z0-9_-]+)\/join$/);
    if (joinMatch && request.method === "POST") {
      const r = await dir.joinWorld(me, joinMatch[1]);
      return json(r, r.error ? 400 : 200);
    }
    const statusMatch = path.match(/^\/api\/worlds\/([A-Za-z0-9_-]+)\/status$/);
    if (statusMatch) {
      if (!(await dir.isMember(me, statusMatch[1]))) return json({ error: "join first" }, 403);
      return json(await env.WORLD.getByName(statusMatch[1]).status());
    }
    const wsMatch = path.match(/^\/ws\/([A-Za-z0-9_-]+)$/);
    if (wsMatch) {
      if (request.headers.get("Upgrade") !== "websocket") return json({ error: "expected websocket" }, 426);
      if (!(await dir.isMember(me, wsMatch[1]))) return json({ error: "join first" }, 403);
      const headers = new Headers(request.headers);
      headers.set("X-Account", String(me.id));
      headers.set("X-Name", me.name);
      headers.set("X-Admin", me.admin ? "1" : "0");
      return env.WORLD.getByName(wsMatch[1]).fetch(new Request(request.url, { headers }));
    }
    return json({ error: "not found" }, 404);
  },
};
