const KEY = "ls_token";

export const session = {
  get token() { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } },
  set token(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} },
};

export async function api(path, body, method = body ? "POST" : "GET") {
  let r;
  try {
    r = await fetch(path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${session.token}` }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    return { error: "cannot reach the server" };
  }
  try { return await r.json(); } catch { return { error: `server error ${r.status}` }; }
}
