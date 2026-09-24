const enc = new TextEncoder();

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function verifyRequest(body, signature, timestamp, publicKeyHex) {
  if (!signature || !timestamp || !publicKeyHex) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, hexToBytes(signature), enc.encode(timestamp + body));
  } catch {
    return false;
  }
}

export const TYPE = { PING: 1, COMMAND: 2, COMPONENT: 3, AUTOCOMPLETE: 4, MODAL: 5 };
export const REPLY = { PONG: 1, MESSAGE: 4, DEFER: 5 };
export const FLAG_EPHEMERAL = 64;

export const COMMANDS = [
  { name: "status", description: "How your nation is doing right now" },
  { name: "world", description: "Who is winning, and who is online" },
  { name: "alerts", description: "Turn game alerts on or off for you",
    options: [{ name: "state", description: "on or off", type: 3, required: true, choices: [{ name: "on", value: "on" }, { name: "off", value: "off" }] }] },
  { name: "link", description: "Link this Discord account to your game account",
    options: [{ name: "code", description: "the code shown in the game settings", type: 3, required: true }] },
];

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export function message(text, ephemeral = true) {
  return { type: REPLY.MESSAGE, data: { content: text.slice(0, 1800), flags: ephemeral ? FLAG_EPHEMERAL : 0 } };
}

export function optionValue(interaction, name) {
  return (interaction.data?.options ?? []).find(o => o.name === name)?.value ?? null;
}

export function userIdOf(interaction) {
  return interaction.member?.user?.id ?? interaction.user?.id ?? null;
}

export async function handleInteraction(interaction, handlers) {
  if (interaction.type === TYPE.PING) return { type: REPLY.PONG };
  if (interaction.type !== TYPE.COMMAND) return message("I only answer slash commands.");
  const fn = handlers[interaction.data?.name];
  if (!fn) return message("Unknown command.");
  try {
    return await fn(interaction);
  } catch (err) {
    return message("Something went wrong: " + String(err).slice(0, 200));
  }
}

export async function postWebhook(url, content, username = "Large Scale") {
  if (!url) return false;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, content: content.slice(0, 1900), allowed_mentions: { parse: ["users"] } }),
  });
  return r.ok;
}

export async function directMessage(token, discordUserId, content) {
  if (!token || !discordUserId) return false;
  const ch = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!ch.ok) return false;
  const { id } = await ch.json();
  const r = await fetch(`https://discord.com/api/v10/channels/${id}/messages`, {
    method: "POST",
    headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ content: content.slice(0, 1900) }),
  });
  return r.ok;
}

export function mention(discordId) {
  return discordId ? `<@${discordId}>` : "";
}
