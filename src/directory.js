import { DurableObject } from "cloudflare:workers";
import { hashPassword, randomToken, sha256, sameText, validName } from "./auth.js";

const SESSION_DAYS = 30;

export class Directory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, name TEXT UNIQUE COLLATE NOCASE, hash TEXT, salt TEXT, admin INTEGER DEFAULT 0, created INTEGER);
        CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, account INTEGER, expires INTEGER);
        CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, name TEXT, host INTEGER, created INTEGER, config TEXT);
        CREATE TABLE IF NOT EXISTS members (world TEXT, account INTEGER, joined INTEGER, PRIMARY KEY (world, account));
        CREATE TABLE IF NOT EXISTS attempts (name TEXT PRIMARY KEY, count INTEGER, since INTEGER);
        CREATE TABLE IF NOT EXISTS notify (account INTEGER PRIMARY KEY, discord TEXT, prefs TEXT);
        CREATE TABLE IF NOT EXISTS links (code TEXT PRIMARY KEY, account INTEGER, expires INTEGER);
        CREATE TABLE IF NOT EXISTS bans (world TEXT, account INTEGER, t INTEGER, PRIMARY KEY (world, account));
        CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, who TEXT, op TEXT, detail TEXT);
      `);
    });
  }

  isAdminName(name) {
    return (this.env.ADMIN_NAMES ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean).includes(name.toLowerCase());
  }

  async register(name, password, invite) {
    if (!this.env.INVITE_CODE || !sameText(invite ?? "", this.env.INVITE_CODE)) return { error: "wrong invite code" };
    if (!validName(name)) return { error: "name must be 3 to 20 letters, numbers, _ or -" };
    if (typeof password !== "string" || password.length < 8 || password.length > 200) return { error: "password must be at least 8 characters" };
    if (this.ctx.storage.sql.exec("SELECT id FROM accounts WHERE name = ?", name).toArray().length) return { error: "name taken" };
    const { hash, salt } = await hashPassword(password, null, this.env.PEPPER);
    this.ctx.storage.sql.exec("INSERT INTO accounts (name, hash, salt, admin, created) VALUES (?, ?, ?, ?, ?)", name, hash, salt, this.isAdminName(name) ? 1 : 0, Date.now());
    return this.login(name, password);
  }

  throttled(name) {
    const row = this.ctx.storage.sql.exec("SELECT count, since FROM attempts WHERE name = ?", name.toLowerCase()).toArray()[0];
    return row && row.count >= 8 && Date.now() - row.since < 15 * 60 * 1000;
  }

  noteFailure(name) {
    const key = name.toLowerCase(), now = Date.now();
    const row = this.ctx.storage.sql.exec("SELECT count, since FROM attempts WHERE name = ?", key).toArray()[0];
    if (!row || now - row.since > 15 * 60 * 1000) this.ctx.storage.sql.exec("INSERT OR REPLACE INTO attempts (name, count, since) VALUES (?, 1, ?)", key, now);
    else this.ctx.storage.sql.exec("UPDATE attempts SET count = count + 1 WHERE name = ?", key);
  }

  async login(name, password) {
    if (typeof name !== "string" || typeof password !== "string") return { error: "bad request" };
    if (this.throttled(name)) return { error: "too many attempts, wait 15 minutes" };
    const acc = this.ctx.storage.sql.exec("SELECT * FROM accounts WHERE name = ?", name).toArray()[0];
    const check = await hashPassword(password, acc?.salt ?? "AAAAAAAAAAAAAAAAAAAAAA", this.env.PEPPER);
    if (!acc || !sameText(check.hash, acc.hash)) { this.noteFailure(name); return { error: "wrong name or password" }; }
    this.ctx.storage.sql.exec("DELETE FROM attempts WHERE name = ?", name.toLowerCase());
    const admin = this.isAdminName(acc.name) ? 1 : 0;
    if (admin !== acc.admin) this.ctx.storage.sql.exec("UPDATE accounts SET admin = ? WHERE id = ?", admin, acc.id);
    const token = randomToken();
    this.ctx.storage.sql.exec("INSERT INTO sessions (token, account, expires) VALUES (?, ?, ?)", await sha256(token), acc.id, Date.now() + SESSION_DAYS * 86400000);
    return { token, account: { id: acc.id, name: acc.name, admin: !!admin } };
  }

  async session(token) {
    if (typeof token !== "string" || token.length < 20) return null;
    const row = this.ctx.storage.sql.exec("SELECT a.id, a.name, a.admin, s.expires FROM sessions s JOIN accounts a ON a.id = s.account WHERE s.token = ?", await sha256(token)).toArray()[0];
    if (!row || row.expires < Date.now()) return null;
    return { id: row.id, name: row.name, admin: !!row.admin };
  }

  async logout(token) {
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE token = ?", await sha256(token));
    return { ok: true };
  }

  createWorld(account, name, config) {
    const id = randomToken(9);
    this.ctx.storage.sql.exec("INSERT INTO worlds (id, name, host, created, config) VALUES (?, ?, ?, ?, ?)", id, String(name).slice(0, 40), account.id, Date.now(), JSON.stringify(config ?? {}));
    this.ctx.storage.sql.exec("INSERT OR IGNORE INTO members (world, account, joined) VALUES (?, ?, ?)", id, account.id, Date.now());
    return { id };
  }

  removeWorld(id, who = null) {
    const w = this.ctx.storage.sql.exec("SELECT name FROM worlds WHERE id = ?", id).toArray()[0];
    this.ctx.storage.sql.exec("DELETE FROM members WHERE world = ?", id);
    this.ctx.storage.sql.exec("DELETE FROM bans WHERE world = ?", id);
    this.ctx.storage.sql.exec("DELETE FROM worlds WHERE id = ?", id);
    if (who) this.log(who, "delete world", { world: id, name: w?.name ?? null });
    return { ok: true };
  }

  log(who, op, detail = {}) {
    this.ctx.storage.sql.exec("INSERT INTO admin_log (t, who, op, detail) VALUES (?, ?, ?, ?)", Date.now(), typeof who === "string" ? who : who.name, op, JSON.stringify(detail));
  }

  adminLog(limit = 30) {
    return this.ctx.storage.sql.exec("SELECT t, who, op, detail FROM admin_log ORDER BY id DESC LIMIT ?", limit).toArray().map(r => ({ ...r, detail: JSON.parse(r.detail) }));
  }

  renameWorld(id, name, who) {
    this.ctx.storage.sql.exec("UPDATE worlds SET name = ? WHERE id = ?", String(name).slice(0, 40), id);
    this.log(who, "rename world", { world: id, name });
    return { ok: true };
  }

  banMember(world, account, who) {
    this.ctx.storage.sql.exec("INSERT OR IGNORE INTO bans (world, account, t) VALUES (?, ?, ?)", world, account, Date.now());
    this.ctx.storage.sql.exec("DELETE FROM members WHERE world = ? AND account = ?", world, account);
    const acc = this.ctx.storage.sql.exec("SELECT name FROM accounts WHERE id = ?", account).toArray()[0];
    this.log(who, "remove player", { world, account, name: acc?.name ?? null });
    return { ok: true };
  }

  listAccounts() {
    return this.ctx.storage.sql.exec(
      "SELECT a.id, a.name, a.admin, a.created, (SELECT COUNT(*) FROM members m WHERE m.account = a.id) AS worlds, (SELECT MAX(expires) FROM sessions s WHERE s.account = a.id) AS lastExpiry FROM accounts a ORDER BY a.created",
    ).toArray().map(r => ({ id: r.id, name: r.name, admin: !!r.admin, created: r.created, worlds: r.worlds, lastLogin: r.lastExpiry ? r.lastExpiry - SESSION_DAYS * 86400000 : null }));
  }

  async setPassword(id, password, who) {
    const acc = this.ctx.storage.sql.exec("SELECT id, name FROM accounts WHERE id = ?", id).toArray()[0];
    if (!acc) return { error: "no such account" };
    if (typeof password !== "string" || password.length < 8 || password.length > 200) return { error: "password must be at least 8 characters" };
    const { hash, salt } = await hashPassword(password, null, this.env.PEPPER);
    this.ctx.storage.sql.exec("UPDATE accounts SET hash = ?, salt = ? WHERE id = ?", hash, salt, id);
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE account = ?", id);
    this.ctx.storage.sql.exec("DELETE FROM attempts WHERE name = ?", acc.name.toLowerCase());
    this.log(who, "set password", { account: id, name: acc.name });
    return { ok: true, name: acc.name };
  }

  async changePassword(me, token, current, password) {
    const acc = this.ctx.storage.sql.exec("SELECT id, name, hash, salt FROM accounts WHERE id = ?", me.id).toArray()[0];
    if (!acc) return { error: "no such account" };
    if (typeof current !== "string" || typeof password !== "string") return { error: "bad request" };
    if (this.throttled(acc.name)) return { error: "too many attempts, wait 15 minutes" };
    const check = await hashPassword(current, acc.salt, this.env.PEPPER);
    if (!sameText(check.hash, acc.hash)) { this.noteFailure(acc.name); return { error: "your current password is wrong" }; }
    if (password.length < 8 || password.length > 200) return { error: "password must be at least 8 characters" };
    if (password === current) return { error: "the new password is the same as the old one" };
    const { hash, salt } = await hashPassword(password, null, this.env.PEPPER);
    this.ctx.storage.sql.exec("UPDATE accounts SET hash = ?, salt = ? WHERE id = ?", hash, salt, acc.id);
    const keep = await sha256(token);
    const others = this.ctx.storage.sql.exec("SELECT COUNT(*) AS n FROM sessions WHERE account = ? AND token != ?", acc.id, keep).toArray()[0].n;
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE account = ? AND token != ?", acc.id, keep);
    this.ctx.storage.sql.exec("DELETE FROM attempts WHERE name = ?", acc.name.toLowerCase());
    return { ok: true, others };
  }

  removeAccount(id, who) {
    const acc = this.ctx.storage.sql.exec("SELECT id, name FROM accounts WHERE id = ?", id).toArray()[0];
    if (!acc) return { error: "no such account" };
    if (acc.id === who.id) return { error: "you cannot remove your own account" };
    if (this.isAdminName(acc.name)) return { error: "admin accounts are set by ADMIN_NAMES in wrangler.jsonc" };
    const worlds = this.ctx.storage.sql.exec("SELECT world FROM members WHERE account = ?", id).toArray().map(r => r.world);
    for (const table of ["sessions", "members", "bans", "notify", "links"]) this.ctx.storage.sql.exec(`DELETE FROM ${table} WHERE account = ?`, id);
    this.ctx.storage.sql.exec("DELETE FROM attempts WHERE name = ?", acc.name.toLowerCase());
    this.ctx.storage.sql.exec("DELETE FROM accounts WHERE id = ?", id);
    this.log(who, "remove account", { account: id, name: acc.name, worlds: worlds.length });
    return { ok: true, name: acc.name, worlds };
  }

  listWorlds(account) {
    return this.ctx.storage.sql.exec(
      "SELECT w.id, w.name, w.host = ? AS host, (SELECT COUNT(*) FROM members m WHERE m.world = w.id) AS players, EXISTS(SELECT 1 FROM members m WHERE m.world = w.id AND m.account = ?) AS member, EXISTS(SELECT 1 FROM bans b WHERE b.world = w.id AND b.account = ?) AS removed FROM worlds w ORDER BY w.created DESC",
      account.id, account.id, account.id,
    ).toArray();
  }

  joinWorld(account, id, maxPlayers = 8) {
    const w = this.ctx.storage.sql.exec("SELECT id FROM worlds WHERE id = ?", id).toArray()[0];
    if (!w) return { error: "no such world" };
    if (this.ctx.storage.sql.exec("SELECT 1 FROM bans WHERE world = ? AND account = ?", id, account.id).toArray().length) return { error: "the host removed you from this world" };
    const n = this.ctx.storage.sql.exec("SELECT COUNT(*) AS n FROM members WHERE world = ?", id).one().n;
    const already = this.ctx.storage.sql.exec("SELECT 1 FROM members WHERE world = ? AND account = ?", id, account.id).toArray().length;
    if (!already && n >= maxPlayers) return { error: "world is full" };
    this.ctx.storage.sql.exec("INSERT OR IGNORE INTO members (world, account, joined) VALUES (?, ?, ?)", id, account.id, Date.now());
    return { ok: true };
  }

  isMember(account, id) {
    return this.ctx.storage.sql.exec("SELECT 1 FROM members WHERE world = ? AND account = ?", id, account.id).toArray().length > 0;
  }

  linkCode(account) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.ctx.storage.sql.exec("DELETE FROM links WHERE account = ?", account.id);
    this.ctx.storage.sql.exec("INSERT INTO links (code, account, expires) VALUES (?, ?, ?)", code, account.id, Date.now() + 15 * 60 * 1000);
    return { code, minutes: 15 };
  }

  claimLink(code, discordId) {
    const row = this.ctx.storage.sql.exec("SELECT account, expires FROM links WHERE code = ?", String(code).toUpperCase()).toArray()[0];
    if (!row || row.expires < Date.now()) return { error: "that code is wrong or has expired" };
    this.ctx.storage.sql.exec("DELETE FROM links WHERE code = ?", String(code).toUpperCase());
    const acc = this.ctx.storage.sql.exec("SELECT name FROM accounts WHERE id = ?", row.account).toArray()[0];
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO notify (account, discord, prefs) VALUES (?, ?, COALESCE((SELECT prefs FROM notify WHERE account = ?), '{}'))", row.account, String(discordId), row.account);
    return { account: row.account, name: acc?.name ?? "unknown" };
  }

  accountForDiscord(discordId) {
    const row = this.ctx.storage.sql.exec("SELECT n.account, n.prefs, a.name FROM notify n JOIN accounts a ON a.id = n.account WHERE n.discord = ?", String(discordId)).toArray()[0];
    return row ? { id: row.account, name: row.name, prefs: JSON.parse(row.prefs || "{}") } : null;
  }

  setPrefs(accountId, prefs) {
    const cur = this.ctx.storage.sql.exec("SELECT prefs FROM notify WHERE account = ?", accountId).toArray()[0];
    const merged = { ...JSON.parse(cur?.prefs || "{}"), ...prefs };
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO notify (account, discord, prefs) VALUES (?, COALESCE((SELECT discord FROM notify WHERE account = ?), NULL), ?)", accountId, accountId, JSON.stringify(merged));
    return merged;
  }

  notifyTargets(accountIds) {
    if (!accountIds.length) return [];
    const marks = accountIds.map(() => "?").join(",");
    return this.ctx.storage.sql.exec(`SELECT account, discord, prefs FROM notify WHERE account IN (${marks})`, ...accountIds)
      .toArray().map(r => ({ account: r.account, discord: r.discord, prefs: JSON.parse(r.prefs || "{}") }));
  }

  worldsOf(account) {
    return this.ctx.storage.sql.exec("SELECT world FROM members WHERE account = ?", account.id).toArray().map(r => r.world);
  }

  allWorlds() {
    return this.ctx.storage.sql.exec("SELECT id, name FROM worlds").toArray();
  }

  worldConfig(id) {
    const w = this.ctx.storage.sql.exec("SELECT id, name, host, config FROM worlds WHERE id = ?", id).toArray()[0];
    return w ? { id: w.id, name: w.name, host: w.host, config: JSON.parse(w.config) } : null;
  }
}
