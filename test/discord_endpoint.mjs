import { webcrypto } from "node:crypto";

const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const hex = b => [...new Uint8Array(b)].map(v => v.toString(16).padStart(2, "0")).join("");
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "pass" : "FAIL"}  ${what}`); if (!ok) failures++; };

const pair = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const pub = hex(await webcrypto.subtle.exportKey("raw", pair.publicKey));
console.log("put this in .dev.vars as DISCORD_PUBLIC_KEY:", pub);

async function send(bodyObject, { breakIt = false } = {}) {
  const body = JSON.stringify(bodyObject);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = hex(await webcrypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(ts + body)));
  return fetch(BASE + "/discord/interactions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature-ed25519": breakIt ? sig.replace(/^../, "00") : sig, "x-signature-timestamp": ts },
    body,
  });
}

const ping = await send({ type: 1 });
check(ping.status === 200 && (await ping.json()).type === 1, "Discord's ping is answered with a pong");
const bad = await send({ type: 1 }, { breakIt: true });
check(bad.status === 401, "a bad signature is refused");
const unlinked = await send({ type: 2, data: { name: "status" }, member: { user: { id: "123" } } });
const reply = await unlinked.json();
check(unlinked.status === 200 && /link/i.test(reply.data.content), "an unlinked user is told to link first");
console.log(failures ? `${failures} checks failed` : "all checks passed");
process.exit(failures ? 1 : 0);
