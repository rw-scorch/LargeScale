import { COMMANDS } from "../src/discord.js";

const appId = process.env.DISCORD_APP_ID;
const token = process.env.DISCORD_TOKEN;
const guild = process.env.DISCORD_GUILD_ID;

if (!appId || !token) {
  console.error("Set DISCORD_APP_ID and DISCORD_TOKEN first.");
  process.exit(1);
}

const url = guild
  ? `https://discord.com/api/v10/applications/${appId}/guilds/${guild}/commands`
  : `https://discord.com/api/v10/applications/${appId}/commands`;

const r = await fetch(url, {
  method: "PUT",
  headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
  body: JSON.stringify(COMMANDS),
});

console.log(r.status, await r.text());
console.log(guild ? "Registered to one server, live immediately." : "Registered globally, can take an hour to appear.");
