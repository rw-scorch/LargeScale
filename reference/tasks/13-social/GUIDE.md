# Piece 13: Social

## Goal

The parts that make it a game with friends rather than against strangers:

- typed chat in three channels
- a hand-drawn flag
- a nation name and colour

## Already decided

- In-game chat with proper typing: global, faction and private, with typing indicators.
- The flag is hand-drawn in game with a pixel editor, plus name and colour.

## Depends on

Piece 2 for sockets, piece 11 for faction membership.

## Example code

Two modules, a browser demo and 5 tests.

### `example/chat.js`

- `cleanText` strips control characters and text-direction overrides, collapses whitespace and cuts at 280 characters. The direction overrides matter: without stripping them, one player can flip the layout of everyone's chat.
- `channelFor` resolves a message to `global`, `faction` (only if the sender is in one) or `private` (a stable key for the pair).
- `TokenBucket` rate-limits: a burst of 5, refilling at one message every 2 seconds.
- `ChatHub.post` returns the stored message and who should receive it. It keeps 200 messages per channel.
- `setTyping` and `whoIsTyping` drive the typing indicator, expiring after 4 seconds.

### `example/flag.js`

- 32 by 20 pixels, 16 fixed colours, which keeps flags small, readable at any zoom and impossible to abuse with photographs.
- `encodeFlag` and `decodeFlag` use a run-length string, for example `f1.F_FBCAF_F_F8`. A plain flag is under 60 characters, and the worst case is about 1.3 KB. `decodeFlag` rejects anything malformed, so it is safe to accept from a client.
- `floodFill` is the fill tool, and `flagToRGBA` draws the flag at any whole scale.

### `example/flag-editor.html`

A working editor using the pack's tool icons: pencil, fill, eraser, colour picker, undo, redo, grid, mirror and clear. It saves the encoded string as you draw and shows it. Serve the kit and open `tasks/13-social/example/flag-editor.html`.

## Steps

1. **Chat panel.**
   - Tabs for global, faction and private, using `chat_global`, `chat_faction`, `chat_private`.
   - Bubbles with `frame_chat_bubble_self` and `frame_chat_bubble_other`.
   - An input bar with `chat_send`.
   - `chat_typing` showing "X is typing".
   - Unread counts per tab.
   - On mobile, the panel slides up over the map and keeps the map visible behind it.
2. **Server.** Put `ChatHub` in the world object. Validate every message, then send only to the recipient list. Private messages must never be broadcast. Keep recent history in the `chat` table and include it in `hello`.
3. **Flag, name and colour.**
   - A nation setup screen on first join: name (3 to 20 characters, unique in the world), colour from a palette of 8 that stay distinguishable on the map, and the flag editor.
   - The server stores the encoded flag string, re-decodes it to check it, and sends it to everyone.
   - Clients draw flags in the diplomacy list, chat avatars, the scoreboard and above capitals at close zoom.
4. **Notifications.** Chat mentions of your nation name raise a small alert. This is how people call for help.
5. **Scoreboard.** Plots, population, era and troops per nation, sorted, with flags. Include it in `state` messages a few times a minute. This is often where most social pressure comes from.

## Done when

- The tests pass.
- Three players can hold a global conversation, a faction conversation the third cannot see, and a private one.
- Spamming is throttled without dropping honest messages.
- A flag drawn in the editor shows up on the map and in the scoreboard for everyone.

## Pitfalls

- Chat is stored, so treat it like any other data: cap it, and let the host clear it.
- Make sure a private channel key is the same from both sides (the example sorts the ids).
- Do not let a nation name collide with another, or private messages by name become confusing.

## Thoughts

For a persistent world, the chat log is the story of the game. Consider a "world log" tab that mixes major events (wars declared, nations eliminated, eras reached, wonders built) with chat, so someone returning after a day can scroll and see what happened.
