import { Directory } from "./directory.js";
import { World } from "./world.js";

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const dir = env.DIRECTORY.getByName("directory");
    const path = url.pathname;
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
    if (path === "/api/worlds" && request.method === "GET") return json(await dir.listWorlds(me));
    if (path === "/api/worlds" && request.method === "POST") {
      const b = (await body(request)) ?? {};
      const { id } = await dir.createWorld(me, b.name ?? "New world", b.config ?? {});
      await env.WORLD.getByName(id).init({ name: b.name, ...(b.config ?? {}) });
      return json({ id });
    }
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
