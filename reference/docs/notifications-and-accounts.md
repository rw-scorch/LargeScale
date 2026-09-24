# Notifications and accounts

Short answer to "can we send notifications": yes, three ways, and the easiest one for a group of friends is probably a Discord webhook.

## Built already

The project template implements the Discord bot as an HTTP interactions endpoint inside the Worker, with signature verification, four slash commands, account linking, a batching notification queue, a Durable Object alarm to flush it and a ten-minute cron heartbeat. See `project-template/README.md`. The rest of this document is the reasoning behind that choice and what the other routes would cost.

## How anything sends a message by itself

A Worker has no process sitting there waiting, so "by itself" comes from one of three triggers:

1. **A request or a socket message.** Cheapest: while players are connected the world is already ticking, so events can be turned into messages immediately.
2. **A Durable Object alarm.** The object asks to be woken at a time it chooses. This is what fires a queued batch of alerts, a missile arrival, or a world's end date, with nobody connected.
3. **A cron trigger.** The Worker itself runs on a schedule, and can wake every world in turn. This is the safety net for worlds that are asleep with something pending.

Alarms count as billed requests, so batch them: one alarm per world per minute of activity, not one per event.

## Option 1: Discord webhook, the cheapest thing that works

- Create a webhook in your Discord server, store the URL as a Worker secret, and `POST` a JSON message to it from the world object.
- No keys to manage, no permission prompts, and everyone already has Discord on their phone with notifications working.
- Good for: "Kerevo declared war on you", "your border is under attack", "the world woke up", "a missile is inbound, 3 minutes".
- Rate limits are generous, but batch messages: one summary per minute per world, not one per event.
- A per-player mention needs their Discord user id, which they paste into their profile once.

## Option 2: Web push, proper notifications from the game itself

This works and needs no server beyond the Worker, but it has one platform catch.

- **How it works.** The client registers a service worker, calls `pushManager.subscribe` with your VAPID public key, and sends the subscription to your Worker. The Worker later signs a request with the VAPID private key and posts the encrypted payload to the endpoint. All the signing and encryption can be done with WebCrypto inside a Worker, or with a small library.
- **On Android and desktop** this works in a normal browser tab.
- **On iPhone it only works if the player adds the site to their home screen.** Push has been supported since iOS 16.4, but only for web apps installed to the Home Screen; a normal Safari tab has no Push API at all. Since iOS 26, any site added to the Home Screen opens as a web app by default, which makes the ask smaller, but it is still an ask.
- **What this means for the game.** Ship a `manifest.json` with `display: standalone` and icons, detect iOS in a tab, and show a short "add to home screen for alerts" note. The game is a good candidate for this anyway, since it is meant to be opened repeatedly on a phone.
- Store subscriptions in the Directory object, one row per account per device, and drop a subscription when the push endpoint returns 404 or 410.

## Option 3: Email

- Useful for the slow things: "your world has been asleep for three days", "you were eliminated", "invite to a new world".
- Workers have no built-in mail sending, so use an email API such as Resend, Postmark or Mailgun with the key as a secret.
- Keep it rare. Anything urgent belongs in push or Discord.

## What to send, and when

Rules that keep notifications from becoming noise:

| Event | Channel | Rule |
| --- | --- | --- |
| Attack on your territory | push and Discord | at most one per five minutes per attacker |
| Missile or nuke inbound | push and Discord | always, immediately, with the arrival time |
| War declared on you | push and Discord | always |
| Ally or faction request | push | always |
| Chat mention of your nation | push | at most one per minute |
| Research or construction finished | in game only | never push |
| World woke up, world sleeping | Discord | once |
| Weekly summary | email | optional |

What is sent is entirely up to each player's settings: a master switch, a per-event switch for every row above, and a quiet-hours window. The table is the suggested default, not a fixed list.

## Logins

What the server example already does:

- Invite-only registration with a shared code.
- Passwords hashed with PBKDF2 at 100,000 rounds, per-account salt and a server-side pepper.
- Sessions as random tokens stored only as hashes, 30 day expiry, throttled after eight failed attempts.
- Admin rights from a server-side list, rechecked at every login.

Worth adding, in order of value:

1. **Stay signed in on a phone.** Refresh the session token on every connect, so an active player is never logged out mid-world.
2. **A one-time connection ticket.** WebSockets cannot send headers, so the token currently rides in the query string. A short-lived ticket keeps real tokens out of URLs and logs.
3. **Magic links or passkeys instead of passwords.** For a group of friends, an emailed sign-in link is less friction than a password, and passkeys are better again on phones. Both are bigger jobs than the current password flow, so they are a later improvement rather than a starting point.
4. **Device list and sign out everywhere**, which is five lines once sessions are per-device.
5. **Account linking to Discord**, if you go the webhook route, so mentions work without pasting ids.
