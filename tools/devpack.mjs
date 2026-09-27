import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: a } = parseArgs({ options: {
  transcript: { type: "string" },
  out: { type: "string" },
  title: { type: "string", default: "Conversation record" },
  intro: { type: "string", default: "" },
  keep: { type: "string", default: "3000" },
}});
if (!a.transcript || !a.out) {
  console.error("usage: node tools/devpack.mjs --transcript <session.jsonl> --out <conversation.md> [--title ...] [--intro ...]");
  process.exit(1);
}

const secrets = [];
if (existsSync(".dev.vars")) {
  for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && m[2].length >= 4) secrets.push(m[2]);
  }
}
for (const s of (process.env.REDACT ?? "").split(",")) if (s.trim().length >= 4) secrets.push(s.trim());
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const redact = t => {
  let out = t.replace(EMAIL, m => (/anthropic\.com$/.test(m) ? m : "[email removed]"));
  for (const s of secrets) out = out.split(s).join("[removed]");
  return out;
};

const LIMIT = Number(a.keep);
const shorten = t => (t.length > LIMIT ? `${t.slice(0, LIMIT >> 1)}\n\n[... ${Math.round((t.length - LIMIT) / 1000)} KB shortened ...]\n\n${t.slice(-(LIMIT >> 2))}` : t);
const clean = t => t
  .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
  .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, "")
  .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, "")
  .replace(/<command-(name|message|args)>[\s\S]*?<\/command-\1>/g, "")
  .replace(/<\/?pasted_content[^>]*>/g, "")
  .trim();
const when = ts => ts ? ts.slice(0, 16).replace("T", " ") : "";
const toolLine = (name, input = {}) => {
  const first = s => String(s ?? "").split("\n")[0].slice(0, 160);
  if (name === "Bash" || name === "PowerShell") return `[${name}: ${first(input.description ?? input.command)}]`;
  if (["Read", "Edit", "Write"].includes(name)) return `[${name}: ${first(input.file_path).replace(/^.*large-scale-gh[\\/]/, "")}]`;
  if (name === "Grep" || name === "Glob") return `[${name}: ${first(input.pattern)}]`;
  if (name === "AskUserQuestion") return (input.questions ?? []).map(q => `[Asked: ${first(q.question)} Options: ${(q.options ?? []).map(o => o.label).join("; ")}]`).join("\n");
  if (name === "Artifact") return `[Artifact: ${input.action ?? "publish"} ${first(input.file_path ?? input.url ?? "")}]`;
  return `[${name}]`;
};

const entries = readFileSync(a.transcript, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const asked = new Set();
const turns = [];
let cur = null;
const push = (who, ts, text) => {
  if (!text) return;
  if (cur && cur.who === who) { cur.parts.push(text); return; }
  cur = { who, ts, parts: [text] };
  turns.push(cur);
};

for (const e of entries) {
  if (e.isSidechain || e.isMeta || (e.type !== "user" && e.type !== "assistant")) continue;
  const content = e.message?.content;
  if (e.type === "user") {
    if (e.isCompactSummary) { push("note", e.timestamp, "*The conversation was compacted here; Claude continued from a summary of what came before.*"); continue; }
    if (typeof content === "string") { push("Ryan", e.timestamp, shorten(clean(content))); continue; }
    for (const b of content ?? []) {
      if (b.type === "text") push("Ryan", e.timestamp, shorten(clean(b.text)));
      else if (b.type === "image") push("Ryan", e.timestamp, "[image]");
      else if (b.type === "tool_result" && asked.has(b.tool_use_id)) {
        const text = typeof b.content === "string" ? b.content : (b.content ?? []).map(c => c.text ?? "").join("\n");
        push("Ryan", e.timestamp, `(answer) ${clean(text)}`);
      }
    }
    continue;
  }
  for (const b of content ?? []) {
    if (b.type === "text") push("Claude", e.timestamp, clean(b.text));
    else if (b.type === "tool_use") {
      if (b.name === "AskUserQuestion") asked.add(b.id);
      push("Claude", e.timestamp, toolLine(b.name, b.input));
    }
  }
}

const body = turns.map(t => t.who === "note" ? t.parts.join("\n\n") : `### ${t.who} (${when(t.ts)})\n\n${t.parts.join("\n\n")}`).join("\n\n");
const doc = redact(`# ${a.title}\n\n${a.intro}\n\n${body}\n`);
writeFileSync(a.out, doc);
const left = secrets.filter(s => doc.includes(s)).length + (doc.match(EMAIL) ?? []).filter(m => !/anthropic\.com$/.test(m)).length;
console.log(JSON.stringify({ turns: turns.length, ryan: turns.filter(t => t.who === "Ryan").length, bytes: doc.length, secretsChecked: secrets.length, secretsLeft: left }));
if (left) process.exit(1);
