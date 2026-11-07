# Bot Office

A live, animated isometric 3D office for your **Grok Bots**. Each team gets its own floor. Each bot sits at a desk as a small 3D character: it types while working, hops when it finishes, pulses when it needs you, shakes on errors, and wanders off for coffee when it's resting. When two bots talk, one walks over to the other's desk, taking the elevator if they're on different floors.

Your bots report what they're doing by posting small JSON messages to a private [ntfy.sh](https://ntfy.sh) topic. Bot Office subscribes to that topic and animates everything live.

![Bot Office screenshot](docs/screenshot.png)
<!-- Screenshot placeholder: add your own at docs/screenshot.png -->

- A static app that runs entirely in the browser (Vite + React + three.js / react-three-fiber). There's no backend, no database and no environment variables.
- **The only network access is to `ntfy.sh`.** The app loads no fonts, CDNs, analytics or remote images. `vercel.json` sets a strict CSP (`connect-src https://ntfy.sh`).
- There's a **demo mode** with simulated example bots, so you can try it before you set anything up.

---

## Deploy your own

1. **Fork** this repository on GitHub.
2. **Import it in Vercel** (*Add New → Project → Import*). The framework preset is **Vite**, which `vercel.json` already sets. You don't need any environment variables. Click *Deploy*.
   (Any static host works: `npm run build`, then serve `dist/`.)
3. **Generate a random topic.** This is your access code, so treat it like a password:

   ```bash
   python3 -c "import secrets;print('hq-'+secrets.token_urlsafe(18))"
   # e.g. hq-3vQd0X0r6kF1pZ9n2bW7aLmC   (don't use this one)
   ```

   Topics may only contain letters, numbers, `-` and `_`, up to 64 characters.
4. **Make your bots post to it** (see [Message protocol](#message-protocol) and the [HQ STATUS block](#hq-status-block-for-your-grok-bots)).

### Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static output in dist/
```

## Logging in

When you open your deployment for the first time, it shows an **Enter access code** screen. Paste your topic and press *Enter*.

- The code is saved in this browser's `localStorage`, so you stay logged in on that browser until you sign out.
- The app never shows the code in the UI, never logs it, and never leaves it in the URL.
- To log in on another device with one link, open `https://<your-site>/#<your-code>`. The app saves the code and immediately strips the `#…` from the address bar and history with `history.replaceState`.
- **Sign out:** open the ⚙ menu (top left) and choose *Sign out*. This removes the code and the cached office state from the browser.
- **View demo** on the login screen opens demo mode with example bots and simulated activity.

## Controls

Drag to rotate, right-drag to pan, scroll to zoom, `WASD` to move, `↑`/`↓` to change floors. `T` toggles Tour, `N` toggles night mode and `Esc` deselects. Click a bot, in the scene or in the right panel, to follow it and see its details.

If a followed bot takes the elevator, the camera rides along to the floor it walks out on. Scroll zoom is smooth.

The interface is in Brazilian Portuguese. Each room is sized to its number of bots, and quality adapts automatically (resolution and shadows drop on slow devices and phones).

---

## Message protocol

Publish JSON to your topic with `POST https://ntfy.sh/<TOPIC>`, using the JSON as the request body. Each ntfy message must be **one JSON object** (or an array of them). Messages are **partial updates that get merged**, so you can split them however you like. One object can also combine several keys, for example `roster` + `groups` + `chat`.

The examples below assume:

```bash
TOPIC=hq-your-secret-topic
```

### `status`: what a bot is doing

```bash
curl -d '{"bot":"Lead Scout","status":"working","step":"Qualifying 12 new leads"}' https://ntfy.sh/$TOPIC
curl -d '{"bot":"Lead Scout","status":"waiting_user","step":"Approve the send list?"}' https://ntfy.sh/$TOPIC
curl -d '{"bot":"Lead Scout","status":"done","step":"Qualified 12 leads"}' https://ntfy.sh/$TOPIC
```

| `status` | Shown as | Animation |
| --- | --- | --- |
| `working` | Working (green dots) | typing at the desk, monitor scrolling |
| `done` | Finished (blue check) | hop, spin and confetti, then relaxed |
| `waiting_user` | Waiting on you (yellow `!`) | bouncing and facing you with a pulsing ring; shows a top toast and the "Waiting on me" list |
| `error` | Error (red ×) | red shake and glow |
| `idle` | Resting (`z`) | eyes closed, leaning back, occasionally wanders off |

These aliases also work: `busy`/`running` → working, `finished`/`success` → done, `resting` → idle, `waiting`/`needs_user` → waiting_user, `failed` → error.
`step` is a short line (≤ 60 characters) that appears in the speech bubble, the panels and the Activity feed. A status older than about 2 hours decays to **resting**.

### `talk`: bot-to-bot conversation

```bash
curl -d '{"type":"talk","from":"Lead Scout","to":"Closer","step":"Handing off 3 hot leads","status":"start"}' https://ntfy.sh/$TOPIC
curl -d '{"type":"talk","from":"Lead Scout","to":"Closer","status":"end"}' https://ntfy.sh/$TOPIC
```

**A** (`from`) walks to **B**'s (`to`) desk, using the elevator if B is on another floor. They face each other and take turns with speech bubbles. Sending more `talk` messages with the same `from`/`to` updates the `step` and keeps the conversation going. A `"status":"end"` message, or 90 seconds without a new `talk` from A, sends A back to its desk.

### `roster`: who exists

```bash
curl -d '{"roster":["Lead Scout","Closer"]}' https://ntfy.sh/$TOPIC
curl -d '{"roster":[
  {"name":"Lead Scout","id":"<grok-bot-id>","shape":"wedge","color":"orange","accessory":"none","team":"Sales"},
  {"name":"Closer","id":"<grok-bot-id>","shape":"heart","color":"magenta","team":"Sales"}
]}' https://ntfy.sh/$TOPIC
```

Every bot in a roster appears on its team's floor **right away** (resting), before it sends any status. The optional `id` is used to build an "Open chat" link (`grokbot://app/v1/agent?id=<id>`) when no explicit `chat` link has been sent.

**The latest roster sets the order.** The order of floors and of bots on each floor always follows the most recent roster, replacing any older order (it does not keep "whoever showed up first"). Floors from top to bottom are: the **Cortex** on top, then the teams in roster order, so the first team in the roster gets the highest floor right under the Cortex. For example a roster listing Ops, Sales, Design, Marketing, YouTube bots gives: Cortex, Ops, Sales, Design, Marketing, YouTube. Bots that are not in the latest roster (for example ones that only sent a `status`) are listed after the roster's bots.

**Long rosters can be split.** ntfy turns any message over 4 KB into an attachment, which the site does not read. Split a long list into several `{"roster":[…]}` messages sent back to back: roster messages that arrive within **15 seconds** of each other are treated as parts of the same list and joined in the order they arrived. A roster message that comes later than that starts a new list. `scripts/post.sh roster` does the splitting for you (parts of at most ~3,500 bytes).

**Photo bots.** Some Grok bots use a round photo instead of a shape. Send a tiny thumbnail as a data URL and the bot becomes a round "coin" character with the photo on its face (and in the panels):

```json
{"looks":{"Closer":{"shape":"photo","photo":"data:image/jpeg;base64,/9j/4AAQ..."}}}
```

Only `data:image/png|jpeg|webp;base64,…` is accepted (max ~12 KB; a 64×64 JPEG is ~2 KB), so the app still never fetches anything outside ntfy.sh. `scripts/post.sh photo "Closer" face.jpg` builds and sends it for you (needs ImageMagick). Without a photo, `photo`/`circle` render as a plain circle.

### `groups`: teams (one floor per team)

```bash
curl -d '{"groups":{"Lead Scout":"Sales","Closer":"Sales","Post Writer":"Marketing"}}' https://ntfy.sh/$TOPIC
```

Floors are created in the order the teams first appear. Bots without a team go to **Other**.

### `chat`: links for View / Approve / Open chat

```bash
curl -d '{"chat":{"Closer":"grokbot://app/v1/agent?id=<grok-bot-id>"}}' https://ntfy.sh/$TOPIC
```

Only `grokbot://` and `https://` links are accepted.

### `looks`: avatar shape, color, accessory

```bash
curl -d '{"looks":{"Closer":{"shape":"heart","color":"#F93498","accessory":"bow"}}}' https://ntfy.sh/$TOPIC
```

- **Shapes:** `cloud`, `wedge`, `pebble`, `heart` match the Grok Bot avatars. Also available: `sphere`, `star4`, `star6`, `clover`, `bubble`, `flower`, `drop`, `pill`, `triangle`, `pentagon`, `hexagon`, `cone`, `trio`, `rounded_square`.
- **Colors:** `violet` #8F59F9, `blue` #1E86FC, `orange` #FD690F, `red` #E5484D, `magenta` #F93498, `brown` #A06B39, `black` #1a1a1a, `green` #2FB36B, `yellow` #F5B70A, `teal` #14B8A6, `none`/`grey` #959595, or any `#rrggbb`.
- **Accessories:** `none`, `glasses`, `antenna`, `stem`, `bow`.

A `looks` entry may also set `team` and `id`.

### `routines`: scheduled jobs

```bash
curl -d '{"routines":{"bot":"Lead Scout","items":[{"name":"Lead sweep","schedule":"Weekdays 09:30","next_run":"2026-11-10T09:30:00Z"}]}}' https://ntfy.sh/$TOPIC
```

`routines` can also be an array of `{bot, items}` objects. Each message replaces that bot's whole routine list.

### `usage`: weekly usage meter

```bash
curl -d '{"type":"usage","total_used_pct":37,"resets_at":"2026-11-10T00:00:00Z","bots":{"Lead Scout":4.1,"Closer":2.5}}' https://ntfy.sh/$TOPIC
```

`{"usage":{…same fields…}}` also works.

### `cortex`: the library room on the top floor

```bash
curl -d '{"cortex":{"notes":123,"recent":[{"title":"Pricing notes","updated":"2026-11-07T12:00:00Z"}]}}' https://ntfy.sh/$TOPIC
```

### Persistence

On load, the app fetches the topic's recent history (`/json?poll=1&since=12h`) and then streams live updates over SSE (`/sse`). ntfy only keeps about 12 hours of messages, so the office is saved in this browser's `localStorage` (per access code) and shown **immediately** on the next visit, even if nothing new was published in the last 12 hours:

- **Roster**: the bots, their order, teams, looks and chat links. Saved in its own key, so the last known office always comes back.
- **Cortex**: the last note count and recent titles.
- **Weekly limit (`usage`)**: the last percentage, reset time and per-bot numbers.
- Statuses, routines and the activity feed are saved too.

Each of these is saved separately and also when you close or hide the tab, so a full browser storage can't wipe the roster. Signing out deletes all of it for that code. If you clear the browser or open the site on another device, re-send your `roster` (and `cortex`/`usage`) so the office is complete right away.

### Posting from a shell

`scripts/post.sh` wraps `curl`:

```bash
export BOT_OFFICE_TOPIC=hq-your-secret-topic
scripts/post.sh status "Lead Scout" working "Qualifying 12 new leads"
scripts/post.sh talk "Lead Scout" "Closer" "Handing off 3 hot leads"
scripts/post.sh talk-end "Lead Scout" "Closer"
scripts/post.sh usage 37 2026-11-10T00:00:00Z '{"Lead Scout":4.1}'
scripts/post.sh roster my-roster.json   # same format as src/roster.json (needs jq); split into ≤3.5 KB parts
scripts/post.sh raw '{"groups":{"Closer":"Sales"}}'
```

---

## HQ STATUS block for your Grok Bots

Paste this into each Grok Bot's description or instructions. Replace `<BOT NAME>` with the bot's exact name and `<TOPIC>` with your access code.

```text
HQ STATUS
You report your progress to my office dashboard. Use an HTTP POST to
https://ntfy.sh/<TOPIC> with a JSON body (one JSON object per request, no other text).
Your name in the office is exactly "<BOT NAME>".

- When you start a task:   {"bot":"<BOT NAME>","status":"working","step":"<what you're doing, max 60 chars>"}
- On meaningful progress:  same as above with an updated "step" (at most every few minutes)
- When you need me:        {"bot":"<BOT NAME>","status":"waiting_user","step":"<what you need from me>"}
- When you finish:         {"bot":"<BOT NAME>","status":"done","step":"<one-line result>"}
- If something fails:      {"bot":"<BOT NAME>","status":"error","step":"<short error>"}
- When you go idle:        {"bot":"<BOT NAME>","status":"idle","step":""}
- When you hand off to or ask another bot:
    {"type":"talk","from":"<BOT NAME>","to":"<OTHER BOT NAME>","step":"<topic>","status":"start"}
  and when done: {"type":"talk","from":"<BOT NAME>","to":"<OTHER BOT NAME>","status":"end"}

Rules: keep "step" short and plain. Never include passwords, tokens, personal
data or private content in these messages. If a post fails, keep working; status
reporting must never block the real task.
```

Send the roster, teams and looks once from your own machine, for example with `scripts/post.sh roster my-roster.json`. That way the bots only need to send `status` and `talk`.

---

## Security

- **Your topic is a secret.** ntfy.sh topics are public: anyone who knows the name can **read** every message and **post** fake ones. Use a long random topic (see above). Don't put it in the repo, screenshots, issues or commits.
- **Never send secrets or private data** in messages. Assume anything you post could be read by whoever has the topic.
- If the topic leaks, generate a new one, update your bots, sign out and log in again with the new code.
- The app only keeps the code in `localStorage` on your own browser. It removes `#code` from the URL, never renders the code, and only sends it to `ntfy.sh` as part of the subscription URL. Note that browser devtools' Network tab still shows those request URLs.
- For stronger protection, run your own ntfy server with access control. You would need to change `BASE` in `src/lib/ntfy.js` and `connect-src` in `vercel.json`.
- All incoming text is length-limited and rendered as plain text, and links are restricted to `grokbot://` and `https://`.

## Project layout

```
src/
  App.jsx             login gate + office
  roster.json         example roster (demo mode only)
  lib/auth.js         access code storage (localStorage, #hash capture)
  lib/state.js        message merging, persistence, floors
  lib/ntfy.js         history poll + SSE stream (the only network code)
  lib/demo.js         demo-mode simulator
  scene/              three.js office: building, floors, bots, props, Cortex room
  ui/                 HTML overlay panels, login screen, settings menu
scripts/post.sh       publish helper
```

## License

MIT
