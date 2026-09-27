# Dev packs

One pack per working session, so the project can be picked up in a new chat, on another machine, or by someone else.

| Pack | Contents |
| --- | --- |
| `large-scale-dev-pack-2026-09-24.zip` | the session summary, the full conversation record, `HANDOVER.md`, `CLAUDE.md`, both milestone plans and the map data notes, as of the end of that session |
| `large-scale-dev-pack-2026-09-27.zip` | the session summary and conversation record for 25 to 27 September (milestone two steps 1 to 7, milestone three, the Gunpowder era, schedules and overtime), `HANDOVER.md`, `CLAUDE.md`, the four milestone plans and the map data notes |

The Markdown files next to each zip are the same summary and conversation, unzipped so they can be read and searched on GitHub.

Secrets are never put in a pack. The pepper and invite code are removed from the conversation record.

To start a new chat from a pack: open the repository in Claude Code and say "Read CLAUDE.md and continue from the open items". For a chat without the repository, paste `HANDOVER.md` from the pack.

To make a pack, run `tools/devpack.mjs` on the session transcript. It keeps the spoken turns, shows each command as one bracketed line, and removes the invite code and pepper from `.dev.vars`, email addresses, and any other strings passed in `REDACT`. It exits with an error if any of them is left:

```powershell
$env:REDACT = "other-secret"; node tools/devpack.mjs --transcript "$HOME\.claude\projects\C--Users-striv-large-scale-gh\<session>.jsonl" --out devpack\conversation-<date>.md --title "Conversation record, <dates>"
```
