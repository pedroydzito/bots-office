# Bot Office

A live, animated isometric 3D office for your Grok Bots. Each team gets a floor, each bot sits at its desk as a little 3D character that types while working, hops when it finishes, pulses when it needs you, shakes on errors, wanders off to the coffee machine when it's resting, and walks over to another bot's desk (taking the elevator if needed) when they talk to each other.

- Static, client-only app (Vite + React + three.js / react-three-fiber). No backend, no secrets.
- **The only network access is to `ntfy.sh`**: a read-only subscription to one topic. No fonts, CDNs, analytics or images are fetched. `vercel.json` sets a CSP with `connect-src https://ntfy.sh`.
- Live data comes from an ntfy topic in the URL hash: `https://<your-site>/#<TOPIC>`.
- Without a `#topic` it runs in **demo mode** with simulated activity (statuses, approvals, conversations).

## Run / deploy

```bash
npm install
npm run dev        # http://localhost:5173/#your-topic
npm run build      # static output in dist/
```

Vercel: import the repo, framework preset "Vite" (already in `vercel.json`). No environment variables needed.

> Pick a long, unguessable topic name. ntfy topics are public: anyone who knows the name can read and post to it. Never put secrets in messages.

## Controls

Drag to rotate, right-drag to pan, scroll to zoom, `WASD` to move, `↑`/`↓` to change floors, `T` toggles Tour, `N` toggles night, `Esc` deselects. Click a bot (in the scene or the right panel) to follow it and see its details.

## Message protocol

Publish JSON to your topic (`POST https://ntfy.sh/<TOPIC>` with the JSON as the body). Each message's ntfy `message` field must be **one JSON object** (or an array of them). Messages are partial updates that are merged, so you can split them however you like, and one object may combine several keys (e.g. `roster` + `groups`).

| Purpose | Shape |
| --- | --- |
| Bot status | `{"bot":"X Writer","status":"working","step":"Drafting tonight's post"}` |
| Bot-to-bot conversation | `{"type":"talk","from":"SDR","to":"Closer","step":"Handing off 3 leads","status":"start"}` |
| End a conversation | `{"type":"talk","from":"SDR","to":"Closer","status":"end"}` |
| Roster | `{"roster":["X Writer","Trend Scout"]}` or `{"roster":[{"name":"SDR","id":"…","shape":"cloud","color":"blue","team":"Sales"}]}` |
| Teams (one floor per team) | `{"groups":{"SDR":"Sales","X Writer":"Content"}}` |
| Chat links (View / Approve / Open chat) | `{"chat":{"SDR":"grokbot://app/v1/agent?id=…"}}` |
| Looks | `{"looks":{"SDR":{"shape":"cloud","color":"#8F59F9","accessory":"none"}}}` |
| Routines | `{"routines":{"bot":"SDR","items":[{"name":"Lead sweep","schedule":"Weekdays 09:30","next_run":"2026-11-10T09:30:00Z"}]}}` |
| Weekly usage | `{"type":"usage","total_used_pct":37,"resets_at":"2026-11-10T00:00:00Z","bots":{"SDR":4.1}}` |
| Cortex (library room) | `{"cortex":{"notes":123,"recent":[{"title":"Pricing notes","updated":"2026-11-07T12:00:00Z"}]}}` |

### Status values

| `status` | Shown as | Animation |
| --- | --- | --- |
| `working` | Working (green dots) | typing at the desk, monitor scrolling |
| `done` | Finished (blue check) | hop + spin + confetti, then relaxed |
| `waiting_user` | Waiting on you (yellow `!`) | bouncing, facing you, pulsing ring; top toast + "Waiting on me" |
| `error` | Error (red ×) | red shake and glow |
| `idle` | Resting (`z`) | eyes closed, leaning back, occasionally wanders off |

`step` is a short line (≤ 60 chars) shown in the speech bubble, panels and Activity feed. Any status older than ~2 hours decays to **resting**.

### Conversations

`{"type":"talk","from":"A","to":"B","step":"…"}` makes **A** get up and walk to **B**'s desk. If B is on a different floor, A walks into the elevator on its own floor and comes out of the elevator on B's floor. B stands up, both face each other, and they take turns with speech bubbles (A says `step`, B replies) and talking gestures. Sending more `talk` messages with the same `from`/`to` updates the `step` and keeps the conversation alive. A `"status":"end"` message, or 90 seconds without a new `talk` message from A, sends A back to its desk. Conversations show in the Activity feed as `A → B: step` and in the "Talking now" panel.

### Looks

Shapes matching the Grok Bot app avatars: `cloud`, `wedge`, `pebble`, `heart`. Also supported: `sphere`, `star4`, `star6`, `clover`, `bubble`, `flower`, `drop`, `pill`, `triangle`, `pentagon`, `hexagon`, `cone`, `trio`, `rounded_square`.

Colors: `violet` #8F59F9, `blue` #1E86FC, `orange` #FD690F, `red` #E5484D, `magenta` #F93498, `brown` #A06B39, `black` #1a1a1a, `none`/`grey` #959595, or any `#rrggbb`.

Accessories: `none`, `glasses`, `antenna`, `stem`, `bow`.

If no chat link is sent for a bot, its roster `id` is used to build `grokbot://app/v1/agent?id=<id>`. Only `grokbot://` and `https://` links are accepted.

## Defaults and persistence

`src/roster.json` ships the default roster (names, ids, shapes, colors, teams), so the office looks right before any message arrives. Messages from the topic are merged on top.

On load the app fetches the topic's history (`https://ntfy.sh/<TOPIC>/json?poll=1&since=12h`) and then streams live updates from `https://ntfy.sh/<TOPIC>/sse`. ntfy only keeps about 12 hours of messages, so the merged state is saved in `localStorage` per topic and survives reloads.

## Posting from scripts

`scripts/post.sh` wraps `curl`:

```bash
export BOT_OFFICE_TOPIC=your-long-random-topic
scripts/post.sh status "X Writer" working "Drafting tonight's post"
scripts/post.sh status "X Writer" waiting_user "Needs your OK to publish"
scripts/post.sh talk "SDR" "Closer" "Handing off 3 hot leads"
scripts/post.sh talk-end "SDR" "Closer"
scripts/post.sh usage 37 2026-11-10T00:00:00Z '{"SDR":4.1,"Closer":2.5}'
scripts/post.sh cortex 123 '[{"title":"Pricing notes","updated":"2026-11-07T12:00:00Z"}]'
scripts/post.sh roster        # publishes src/roster.json (needs jq)
```

Or with plain curl:

```bash
curl -d '{"bot":"SDR","status":"done","step":"Qualified 12 leads"}' https://ntfy.sh/your-long-random-topic
```

## Project layout

```
src/
  roster.json         default roster
  lib/state.js        message merging, persistence, floors
  lib/ntfy.js         history poll + SSE stream (the only network code)
  lib/demo.js         demo-mode simulator
  scene/              three.js office: building, floors, bots, props, Cortex room
  ui/                 HTML overlay panels
scripts/post.sh       publish helper
```
