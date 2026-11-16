# Bot Office

A live, animated isometric 3D office for your **Grok Bots**. Each team gets its own floor. Each bot sits at a desk as a small 3D character: it types while working, hops when it finishes, pulses when it needs you, shakes on errors, and wanders off for coffee when it's resting. When two bots talk, one walks over to the other's desk, taking the elevator if they're on different floors.

Your bots report what they're doing by posting small JSON messages to a private Supabase office. Bot Office loads the latest roster and usage, then follows a live Realtime channel and animates everything.

![Bot Office screenshot](docs/screenshot.png)
<!-- Screenshot placeholder: add your own at docs/screenshot.png -->

- A static app that runs entirely in the browser (Vite + React + three.js / react-three-fiber). Vercel needs no environment variables. The database is one Supabase project; the publishable key is public and the access code is the secret.
- **The only network access is that Supabase project** (HTTPS and the Realtime WebSocket). The app loads no fonts, CDNs, analytics or remote images. `vercel.json` sets a strict CSP for `https://sqwcsncrlzznxwksrche.supabase.co` and `wss://sqwcsncrlzznxwksrche.supabase.co`.
- There's a **demo mode** with simulated example bots, so you can try it before you set anything up.

---

## Deploy your own

1. **Fork** this repository on GitHub.
2. **Import it in Vercel** (*Add New → Project → Import*). The framework preset is **Vite**, which `vercel.json` already sets. You don't need any environment variables. Click *Deploy*.
   (Any static host works: `npm run build`, then serve `dist/`.)
3. **Generate a random access code.** This is the only secret, so treat it like a password:

   ```bash
   python3 -c "import secrets;print('hq-'+secrets.token_urlsafe(18))"
   # e.g. hq-3vQd0X0r6kF1pZ9n2bW7aLmC   (don't use this one)
   ```

   The code may only contain letters, numbers, `-` and `_`, up to 64 characters. The same code you used with ntfy keeps working; only the transport changes.
4. **Make your bots post to it** (see [Message protocol](#message-protocol) and the [HQ STATUS block](#hq-status-block-for-your-grok-bots)).

### Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static output in dist/
```

## Setup do Supabase e migração do ntfy

O app não cria as tabelas sozinho. Depois do merge, aplique a migration **uma vez** no projeto `sqwcsncrlzznxwksrche` (SQL Editor do Supabase, como `postgres`). O arquivo é `supabase/migrations/20261116201548_office.sql`.

O que a migration faz, e o que ela não faz:

- Cria o schema `office` (`events`, `snapshots`, `maintenance`) e três funções em `public`: `office_publish`, `office_fetch`, `office_cleanup`.
- Não lê nem altera `public.leads` nem nenhuma outra tabela.
- Anon **não** recebe `select`/`insert` nas tabelas. RLS fica ligado, sem policies. Tudo passa pelas funções, que recebem o código de acesso e gravam só o sha256.
- **Não** adicione o schema `office` em *Exposed schemas* da Data API. Se adicionar, as tabelas continuam fechadas, mas o schema deixa de ser interno.
- O Realtime do projeto precisa estar ligado, com canais **públicos** permitidos. O browser assina o canal `office:` + sha256 do código. Não há `postgres_changes` nessas tabelas.

O que fazer na prática:

1. Cole e rode o SQL. Se der erro de `pgcrypto`, habilite a extensão e rode de novo.
2. Faça o deploy (o `connect-src` do `vercel.json` já aponta para o Supabase).
3. **Mande de novo o roster e o usage de cada conta** (`principal`, `captacao`, …). O histórico do ntfy não é importado, e um navegador novo só vê o que estiver no Supabase. Quem já abriu o escritório continua vendo o cache local até chegar mensagem nova.
4. Os bots que usam `scripts/post.sh` passam a publicar no Supabase com o mesmo comando. `BOT_OFFICE_TOPIC` continua sendo o código de acesso. Se a variável não estiver definida, o script lê o arquivo `scripts/topic` (não commite esse arquivo). `BOT_OFFICE_ACCOUNT` padrão é `principal`.
5. Bots que dão POST direto em `https://ntfy.sh/...` precisam do bloco [HQ STATUS](#hq-status-block-for-your-grok-bots) novo. Enquanto apontarem para o ntfy, o escritório não recebe.
6. Status idêntico repetido em menos de 2 minutos é ignorado pelo `post.sh` (`skipped: identical status`). Um aviso depois disso ainda sai, para o bot não parecer descansando.

A limpeza dos eventos com mais de 7 dias roda sozinha, no máximo uma vez por hora, dentro do `office_publish`. Roster e usage **não** são apagados. Para forçar: `select public.office_cleanup();` no SQL Editor. Opcional, com pg_cron: `select cron.schedule('office-cleanup', '15 4 * * *', $$select public.office_cleanup()$$);`

## Logging in

When you open your deployment for the first time, it shows an **Enter access code** screen. Paste your topic and press *Enter*.

- The code is saved in this browser's `localStorage`, so you stay logged in on that browser until you sign out.
- The app never shows the code in the UI, never logs it, and never leaves it in the URL.
- To log in on another device with one link, open `https://<your-site>/#<your-code>`. The app saves the code and immediately strips the `#…` from the address bar and history with `history.replaceState`.
- For a wall display, open `https://<your-site>/?tv=salas#ver:<your-code>`: TV mode parked on the whole campus (all rooms), logged in view-only. Plain `?tv` cuts from bot to bot instead. `?salas` shows all rooms with the interface hidden, without fullscreen or the TV camera tour.
- Lock screen: `https://<your-site>/?bloqueio#ver:<your-code>` shows only the bot eyes on black; the background takes the colour of the bot that is working (name and step in the corner), rotating between working bots. `?bloqueio&demo` previews it with demo data. It can also be turned on from Settings → Tela de bloqueio or with B (Esc or double-click leaves).
- **Sign out:** open the ⚙ menu (top left) and choose *Sign out*. This removes the code and the cached office state from the browser.
- **View demo** on the login screen opens demo mode with example bots and simulated activity.

## Controls

Drag to rotate, right-drag to pan, scroll to zoom, `WASD` to move, `↑`/`↓` to change floors. `T` toggles Tour, `N` toggles night mode and `Esc` deselects. Click a bot, in the scene or in the right panel, to follow it and see its details.

If a followed bot takes the elevator, the camera rides along to the floor it walks out on. Scroll zoom is smooth.

The interface is in Brazilian Portuguese. Each room is sized to its number of bots, and quality adapts automatically (resolution and shadows drop on slow devices and phones).

---


### Extras

- **Approve / reject with a note**: from the bot card or the approval queue (`A`). The site publishes `{"decision":{"bot":"Closer","action":"approve|reject","note":"..."}}` to your topic, so your automation can pass the answer back to the bot. The "Open chat" link is still there.
- **Approval queue** (`A`): everything waiting on you, oldest first, with how long it has been waiting.
- **Stuck bots**: a bot "working" on the same step for 20+ minutes gets a "parado há…" tag.
- **Activity filters**: all, errors, conversations, this floor.
- **System health** (`H` or settings): connection, last message, average delay, messages in the last hour, bots silent for 2h+, local storage used.
- **Weekly limit by team** and a **forecast** ("at this pace you hit 100% on Thursday ~14h") from the usage messages of the week; warning above 80%.
- **Keyboard shortcuts**: `?` shows them all.
- **Several offices**: settings → Escritórios. Switch between saved access codes, name them, remove them.
- **View-only link**: from Escritórios, copy a `/#ver:<code>` link. That device can watch but not approve, react or reply. Anyone who knows the access code can still publish.
- **Routines**: countdown to the next run, and "atrasada" in red when a run is 5+ minutes overdue without news.
- **Names**: every bot shows a small name label (settings → Mostrar nomes to turn it off).

- **Grok Bot shapes and colours (exact names)**: shapes `blob, pebble, bean, egg, squircle, tablet, capsule, cylinder, hex, gem, crystal, wedge, shield, dome, arch, cloud, teardrop, leaf, square, sparkle, clover, flower, heart, house, star`; colours `black, brown, red, orange, yellow, green, cyan, blue, violet, magenta, gray`. Old names still work as aliases (`circle`=blob, `hexagon`=hex, `drop`=teardrop, `rounded_square`=square, `pill`=capsule, `star4`=sparkle, `grey`=gray). Eyes follow the app's style (two slanted ovals).
- **Hidden bots**: `"hidden": true` in the roster or `looks` keeps the bot on its team's floor, but quieter: washed-out, translucent, a bit smaller, with an "oculto" tag.
- **Installable app (PWA)**: install it from the browser menu ("Add to home screen" / "Install"). It opens instantly from cache and updates in the background; live data always comes straight from Supabase. `/?tv=1` opens directly in TV mode (also an app shortcut).

- **Mail**: `{"type":"mail","from":"A","to":"B","step":"Relatório"}` — an envelope lifts off A's desk and lands on B's (through the elevator if B is on another floor).
- **Team goals on the TV**: `{"goals":{"Sales":{"label":"Leads qualificados","target":40}}}`. The TV shows this week's finished tasks against the goal.
- **Pets**: each floor has one — `{"pets":{"Ops":"dog","Design":"cat","Sales":"fish"}}` (fish = aquarium). Without it each team gets one picked from its name.
- **Achievements**: first task, 10/50/100 tasks, early bird, night owl, a week without errors. Trophies appear on the bot's desk and a banner announces it.
- **Seasons**: festa junina bunting in June, pumpkins and ghosts at the end of October, a Christmas tree and lights in December (`?festa=junina|halloween|natal` previews them).
- **TV mode** now works like a documentary camera, cutting from bot to bot and favouring whoever is busy.

- **Reactions**: in a bot's card, send a like, heart, party, clap or laugh. It is published to the topic as `{"react":{"bot":"Closer","kind":"heart"}}`, so it floats over the bot on every screen.
- **Timeline markers**: errors (red), approval requests (amber) and meetings (purple) are dots above the timeline; click one to jump there.

- **Same office on every screen**: what each bot does and where it walks is computed from the clock and the topic's messages only (no randomness per device), so a laptop and a phone logged into the same code show exactly the same scene at the same time.
- **Whole building** (*Prédio* / `B`): every floor open and live, stacked in a cutaway.
- **Search** (`Ctrl+K` or `/`): find a bot by name, team or task; the camera flies to it.
- **Sound** (settings): ambient office sound, background music and interface sounds, all synthesized in the browser, soft and quiet.
- **Wall boards**: "Esperando por mim" (pending requests) and "Destaques de hoje" (today's highlights); each room has a status lamp and each floor a status strip on the facade.
- **Desk items and birthdays**: `{"looks":{"Closer":{"desk":["trophy","plant"],"birthday":"03-14"}}}` (items: plant, photo, trophy, lamp, cactus, books). On the birthday a cake appears on the desk.
- Bots idle for over an hour nap on their desk; at night the room lights go off when everyone is resting.

- **Meetings**: when 3 or more bots talk to the same bot, they all gather in a circle by the windows.
- **Timeline** (*Linha do tempo*): scrub or play back the last 12 hours of status changes; the office replays them. Status history is kept for 48 hours in the browser.
- **Notifications**: in the settings menu, turn on browser notifications and/or an alert sound for when a bot starts waiting on you.
- **Floor celebration**: when every bot on a floor is done, the floor throws confetti.
- **Metrics**: the bot card shows today's finished tasks, time spent working, errors and activity per hour.
- **Office cat**: strolls around, naps on the rug and changes floors now and then.
- **TV mode**: settings menu or `F`. Full screen, no panels, guided tour. Good for a spare monitor.

## Message protocol

Publish one JSON object (or an array of them) as the `payload` of `office_publish`. Messages are **partial updates that get merged**, so you can split them however you like. One object can also combine several keys, for example `roster` + `groups` + `chat`.

`scripts/post.sh` is the supported way. The examples below also show the raw call. The access code goes in the body, never in the URL.

```bash
export BOT_OFFICE_TOPIC=hq-your-secret-topic
export BOT_OFFICE_URL=https://sqwcsncrlzznxwksrche.supabase.co
export BOT_OFFICE_KEY=sb_publishable_FftQEYa2xe4wQCndfscbrg_ydE47IQX

office() {
  curl -fsS \
    -H "apikey: $BOT_OFFICE_KEY" \
    -H "Authorization: Bearer $BOT_OFFICE_KEY" \
    -H "Content-Type: application/json" \
    --data "{\"access_code\":\"$BOT_OFFICE_TOPIC\",\"payload\":$1}" \
    "$BOT_OFFICE_URL/rest/v1/rpc/office_publish"
  echo
}
```

### `status`: what a bot is doing

```bash
office '{"bot":"Lead Scout","status":"working","step":"Qualifying 12 new leads"}'
office '{"bot":"Lead Scout","status":"waiting_user","step":"Approve the send list?"}'
office '{"bot":"Lead Scout","status":"done","step":"Qualified 12 leads"}'
```

| `status` | Shown as | Animation |
| --- | --- | --- |
| `working` | Working (green dots) | typing at the desk, monitor scrolling |
| `done` | Finished (blue check) | hop, spin and confetti, then relaxed |
| `waiting_user` | Waiting on you (yellow `!`) | bouncing and facing you with a pulsing ring; shows a top toast and the "Waiting on me" list |
| `error` | Error (red ×) | red shake and glow |
| `idle` | Resting (`z`) | eyes closed, leaning back, occasionally wanders off |

These aliases also work: `busy`/`running` → working, `finished`/`success` → done, `resting` → idle, `waiting`/`needs_user` → waiting_user, `failed` → error.
`step` is a short line (≤ 60 characters) that appears in the speech bubble, the panels and the Activity feed. A `working` status with no new message for 30 minutes decays to **resting** (the bot probably finished without saying so); `waiting_user` and `error` decay after about 2 hours.

### `talk`: bot-to-bot conversation

```bash
office '{"type":"talk","from":"Lead Scout","to":"Closer","step":"Handing off 3 hot leads","status":"start"}'
office '{"type":"talk","from":"Lead Scout","to":"Closer","status":"end"}'
```

**A** (`from`) walks to **B**'s (`to`) desk, using the elevator if B is on another floor. They face each other and take turns with speech bubbles. Sending more `talk` messages with the same `from`/`to` updates the `step` and keeps the conversation going. A `"status":"end"` message, or 90 seconds without a new `talk` from A, sends A back to its desk.

### `roster`: who exists

```bash
office '{"roster":["Lead Scout","Closer"]}'
office '{"roster":[
  {"name":"Lead Scout","id":"<grok-bot-id>","shape":"wedge","color":"orange","accessory":"none","team":"Sales"},
  {"name":"Closer","id":"<grok-bot-id>","shape":"heart","color":"magenta","team":"Sales"}
]}'
```

Every bot in a roster appears on its team's floor **right away** (resting), before it sends any status. The optional `id` is used to build an "Open chat" link (`grokbot://app/v1/agent?id=<id>`) when no explicit `chat` link has been sent.

**The latest roster sets the order.** The order of floors and of bots on each floor always follows the most recent roster, replacing any older order (it does not keep "whoever showed up first"). Floors from top to bottom are: the **Cortex** on top, then the teams in roster order, so the first team in the roster gets the highest floor right under the Cortex. For example a roster listing Ops, Sales, Design, Marketing, YouTube bots gives: Cortex, Ops, Sales, Design, Marketing, YouTube. Bots that are not in the latest roster (for example ones that only sent a `status`) are listed after the roster's bots.

**Long rosters can be split.** Split a long list into several `{"roster":[…]}` messages sent back to back: roster messages that arrive within **15 seconds** of each other are treated as parts of the same list and joined in the order they arrived. A roster message that comes later than that starts a new list. `scripts/post.sh roster` does the splitting for you (parts of at most ~3,500 bytes). The latest list of each account is stored for good, so a new browser still sees it after the event history expires.

**Photo bots.** Some Grok bots use a round photo instead of a shape. Send a tiny thumbnail as a data URL and the bot becomes a round "coin" character with the photo on its face (and in the panels):

```json
{"looks":{"Closer":{"shape":"photo","photo":"data:image/jpeg;base64,/9j/4AAQ..."}}}
```

Only `data:image/png|jpeg|webp;base64,…` is accepted (max ~12 KB; a 64×64 JPEG is ~2 KB), so the app still never fetches images from the network. `scripts/post.sh photo "Closer" face.jpg` builds and sends it for you (needs ImageMagick). Without a photo, `photo`/`circle` render as a plain circle.

### Várias contas Grok no mesmo escritório (`account`)

Mais de uma conta Grok Bot pode publicar no mesmo tópico. Cada conta manda o próprio roster com o campo `account`; o site guarda **um roster por conta** e junta tudo (a conta principal primeiro, ela define a ordem dos andares). O roster de uma conta nunca substitui nem apaga os bots de outra.

```json
{"account":"captacao","roster":[{"name":"Sócio","id":"…","shape":"circle","color":"black","team":"Staff","role":"gerente","beside":"Lima_","account":"captacao"}]}
{"type":"usage","account":"captacao","total_used_pct":42,"resets_at":"2026-11-18T21:34:00Z","bots":{"Captador":20}}
```

- Mensagem sem `account` = conta `principal` (compatível com o que já existia).
- `usage` é por conta: o painel mostra o limite semanal de cada conta e "Quem mais gasta" junta o uso por bot de todas. Se uma conta não manda uso por bot, aparece "Uso por bot indisponível" (nada é estimado).
- A ficha do bot mostra de qual conta ele é.
- Os nomes precisam ser únicos entre as contas (o site casa bots pelo nome).
- `role: "gerente"` (ou `sócio`, `manager`, `partner`) ganha uma segunda mesa executiva ao lado da mesa do líder do andar; `beside: "<bot>"` diz ao lado de quem (esse bot fica com a mesa de líder).
- `scripts/post.sh` usa `BOT_OFFICE_ACCOUNT` (padrão `principal`) para marcar roster e uso.

### `groups`: teams (one floor per team)

```bash
office '{"groups":{"Lead Scout":"Sales","Closer":"Sales","Post Writer":"Marketing"}}'
```

Floors are created in the order the teams first appear. Bots without a team go to **Other**.

### `chat`: links for View / Approve / Open chat

```bash
office '{"chat":{"Closer":"grokbot://app/v1/agent?id=<grok-bot-id>"}}'
```

Only `grokbot://` and `https://` links are accepted.

### `looks`: avatar shape, color, accessory

```bash
office '{"looks":{"Closer":{"shape":"heart","color":"#F93498","accessory":"bow"}}}'
```

- **Shapes:** `cloud`, `wedge`, `pebble`, `heart` match the Grok Bot avatars. Also available: `sphere`, `star4`, `star6`, `clover`, `bubble`, `flower`, `drop`, `pill`, `triangle`, `pentagon`, `hexagon`, `cone`, `trio`, `rounded_square`.
- **Colors:** `violet` #8F59F9, `blue` #1E86FC, `orange` #FD690F, `red` #E5484D, `magenta` #F93498, `brown` #A06B39, `black` #1a1a1a, `green` #2FB36B, `yellow` #F5B70A, `teal` #14B8A6, `none`/`grey` #959595, or any `#rrggbb`.
- **Accessories:** `none`, `glasses`, `antenna`, `stem`, `bow`.

A `looks` entry may also set `team` and `id`.

### `routines`: scheduled jobs

```bash
office '{"routines":{"bot":"Lead Scout","items":[{"name":"Lead sweep","schedule":"Weekdays 09:30","next_run":"2026-11-10T09:30:00Z"}]}}'
```

`routines` can also be an array of `{bot, items}` objects. Each message replaces that bot's whole routine list.

### `usage`: weekly usage meter

```bash
office '{"type":"usage","total_used_pct":37,"resets_at":"2026-11-10T00:00:00Z","bots":{"Lead Scout":4.1,"Closer":2.5}}'
```

`{"usage":{…same fields…}}` also works.

### `cortex`: the library room on the top floor

```bash
office '{"cortex":{"notes":123,"recent":[{"title":"Pricing notes","updated":"2026-11-07T12:00:00Z"}]}}'
```

### `weather`: the sky outside

```bash
office '{"weather":"rain"}'   # clear | cloudy | rain | storm | snow
```

Rain, snow and storm lightning fall around the building; cloudy and rainy skies dim the light. With the light mode on **Auto**, the office also follows your local time, with warm tones at dawn and dusk.

### Persistence

On load, the app asks Supabase for the latest roster and the latest usage of every account (kept forever, and one account never replaces another) plus the event history of the last 7 days, then subscribes to a Realtime Broadcast channel named from the hash of the access code. A message with no `account` belongs to `principal`.

The office is also saved in this browser's `localStorage` (per access code) and shown **immediately** on the next visit, before the fetch returns:

- **Roster**: the bots, their order, teams, looks and chat links. Saved in its own key, so the last known office always comes back.
- **Cortex**: the last note count and recent titles.
- **Weekly limit (`usage`)**: the last percentage, reset time and per-bot numbers, per account.
- Statuses, routines and the activity feed are saved too.

Each of these is saved separately and also when you close or hide the tab. Signing out deletes the cache for that code. A new browser does not need a re-send to see the roster and the weekly limit; those live in Supabase. Cortex, pets, goals and the other one-off settings stay in the 7-day event history (and in the browser cache). Status history in the timeline is still the recent window the client keeps.

### Posting from a shell

`scripts/post.sh` calls `office_publish`. `BOT_OFFICE_ACCOUNT` defaults to `principal`. If `BOT_OFFICE_TOPIC` is unset, the script reads a file named `topic` in the same directory (do not commit it). The same status repeated within 2 minutes is skipped.

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
https://sqwcsncrlzznxwksrche.supabase.co/rest/v1/rpc/office_publish
with these headers and no other text:
  apikey: sb_publishable_FftQEYa2xe4wQCndfscbrg_ydE47IQX
  Authorization: Bearer sb_publishable_FftQEYa2xe4wQCndfscbrg_ydE47IQX
  Content-Type: application/json
The body is {"access_code":"<TOPIC>","payload":{...one object...}}.
Your name in the office is exactly "<BOT NAME>".

- When you start a task:
  {"access_code":"<TOPIC>","payload":{"bot":"<BOT NAME>","status":"working","step":"<what you're doing, max 60 chars>"}}
- On meaningful progress: same as above with an updated "step" (at most every few minutes)
- When you need me:
  {"access_code":"<TOPIC>","payload":{"bot":"<BOT NAME>","status":"waiting_user","step":"<what you need from me>"}}
- When you finish:
  {"access_code":"<TOPIC>","payload":{"bot":"<BOT NAME>","status":"done","step":"<one-line result>"}}
- If something fails:
  {"access_code":"<TOPIC>","payload":{"bot":"<BOT NAME>","status":"error","step":"<short error>"}}
- When you go idle:
  {"access_code":"<TOPIC>","payload":{"bot":"<BOT NAME>","status":"idle","step":""}}
- When you hand off to or ask another bot:
  {"access_code":"<TOPIC>","payload":{"type":"talk","from":"<BOT NAME>","to":"<OTHER BOT NAME>","step":"<topic>","status":"start"}}
  and when done:
  {"access_code":"<TOPIC>","payload":{"type":"talk","from":"<BOT NAME>","to":"<OTHER BOT NAME>","status":"end"}}

Rules: keep "step" short and plain. Never include passwords, tokens, personal
data or private content in these messages. If a post fails, keep working; status
reporting must never block the real task.
```

Send the roster, teams and looks once from your own machine, for example with `scripts/post.sh roster my-roster.json`. That way the bots only need to send `status` and `talk`.

---

## Security

- **Your access code is a secret.** Anyone who knows it can read and post for that office, because the code is the only credential. The publishable Supabase key is public and cannot read the tables by itself. Use a long random code. Don't put the code in the repo, screenshots, issues or commits (`scripts/topic` is gitignored).
- The database stores only the sha256 of the code. Anon has no direct access to the office tables.
- **Never send secrets or private data** in messages. Assume anything you post could be read by whoever has the code.
- If the code leaks, generate a new one, update your bots, sign out and log in again. The old office stays under the old hash; it is not deleted automatically.
- The app only keeps the code in `localStorage` on your own browser. It removes `#code` from the URL and never renders the code. The browser sends it in the body of `office_publish` / `office_fetch`, so devtools' Network tab still shows it.
- All incoming text is length-limited and rendered as plain text, and links are restricted to `grokbot://` and `https://`.

## Project layout

```
src/
  App.jsx             login gate + office
  roster.json         example roster (demo mode only)
  lib/auth.js         access code storage (localStorage, #hash capture)
  lib/state.js        message merging, persistence, floors
  lib/transport.js    Supabase fetch + Realtime broadcast (the only network code)
  lib/demo.js         demo-mode simulator
  scene/              three.js office: building, floors, bots, props, Cortex room
  ui/                 HTML overlay panels, login screen, settings menu
scripts/post.sh       publish helper (same CLI; posts to Supabase)
supabase/migrations/  office schema and RPCs (apply by hand; not auto-run)
```

## License

MIT

### Team leads, hidden bots and the office look

- A bot whose name contains *Diretor, Gestor, Gerente, Head, Chefe, Lead, Coordenador, CEO/CMO/CTO…* gets its own desk next to the "Destaques de hoje" board (floors with 3+ bots).
- Bots with `"hidden": true` are not drawn: their seat stays empty and hovering the chair shows whose place it is. The full list is in **Painel do sistema → Ocultos no Grok**.
- **Personalizar escritório** (settings) picks a style (Decorado, Aconchegante, Minimalista), floor and wall finish and which decor is shown. It is published as `{"office":{"look":{...}}}`, so every screen shows the same office.

### Progress and hand-offs

- `{"bot":"A","status":"working","step":"Editando vídeo","progress":40}` shows a progress bar over the bot and in its card. A progress-only update also works: `{"bot":"A","progress":70}`.
- `{"handoff":{"from":"A","to":"B","what":"Roteiro pronto"}}` (same as `{"type":"mail",...}`) flies an envelope with a trail from A's desk to B's (across floors via the elevator) and shows "Recebeu de / Passou para" in both cards.
- `"role": "ceo"` (or `principal`, `fundador`) in a bot's roster entry marks the company's main bot: executive desk with a gold plaque, slightly bigger bot, gold name tag. `"role": "lead"` gives any bot the lead desk on its floor.
- When every bot on a floor is `done`, the team gathers by the lounge for a minute to celebrate. A hand-off to another floor is carried there in person by the sender (via the elevator).
- **Painel do sistema → Gerar relatório da semana** creates a shareable PNG (tasks, errors, usage, top bots, teams). The bot card shows the average task time and flags a task that is taking much longer than usual.
- `waiting_user` can say what kind of answer it needs: `"ask": "approval"` shows Aprovar / Recusar; `"ask": "reply"` shows Responder (opens the bot's chat). Without `ask`, the step is read: words like "aprovar", "posso publicar?", "confirma" mean approval, anything else is a question to answer.
