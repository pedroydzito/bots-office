// Merged bot-office state. Every ntfy message is a partial update; we merge
// them all (in time order) and persist the result per topic in localStorage,
// because ntfy only keeps ~12h of history.
// Live mode starts empty: roster, teams, looks and chat links all come from
// the topic. The bundled example roster is only used by demo mode.
import demoRoster from '../roster.json'
import { cleanLook } from './look'
import { createStore } from './createStore'
import { normalizeShape, ACCESSORIES } from './constants'

const MAX_BOTS = 150
const MAX_ACTIVITY = 80
const MAX_SEEN = 500
// Roster messages this close together are parts of one list (ntfy caps a message at 4 KB,
// so long rosters arrive split across several messages sent back to back).
const ROSTER_GAP_MS = 15000
const STATUSES = {
  working: 'working', busy: 'working', running: 'working',
  done: 'done', finished: 'done', success: 'done',
  idle: 'idle', resting: 'idle',
  waiting_user: 'waiting_user', waiting: 'waiting_user', needs_user: 'waiting_user',
  error: 'error', failed: 'error',
}

const clean = (s, n) =>
  typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : ''
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() && isFinite(+v) ? +v : null)

function blank() {
  return {
    bots: {}, order: [], routines: {}, usage: null, cortex: null,
    activity: [], chat: {}, talks: {}, lastTime: 0, rev: 0,
    // latest roster list (names in order) and the time of its last part
    rosterOrder: [], rosterT: 0,
    // status timeline (for replay + metrics) and outside weather
    history: [], weather: null, talkLog: [], reactions: [],
    // mail between floors, team goals, office pets, all-time stats for achievements, weekly counts
    mail: [], goals: {}, pets: {}, stats: {}, week: null, unlocks: [],
    usageHist: [], // [{ t, total, account? }] for the weekly-limit forecast
    // several Grok accounts can publish to the same office: roster order and weekly limit per account
    rosterByAcct: {}, // { principal: { order: [names], t }, captacao: {...} }
    usageByAcct: {}, // { principal: { total, resets_at, bots, t }, captacao: {...} }
  }
}

/** Grok account a message/bot belongs to. Messages without one come from the original (main) account. */
export const DEFAULT_ACCOUNT = 'principal'
export const accountOf = (v) => {
  const a = clean(typeof v === 'string' ? v : '', 24).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]/g, '')
  return a || DEFAULT_ACCOUNT
}
const ACCOUNT_LABELS = { principal: 'Principal', captacao: 'Captação' }
export const accountLabel = (a) => ACCOUNT_LABELS[a || DEFAULT_ACCOUNT] || String(a).charAt(0).toUpperCase() + String(a).slice(1)
/** Accounts in a stable order: the main one first, then the others alphabetically. */
export const sortAccounts = (list) => [...new Set(list)].sort((x, y) => (x === DEFAULT_ACCOUNT ? -1 : y === DEFAULT_ACCOUNT ? 1 : x.localeCompare(y)))

function ensureBot(d, rawName) {
  const name = clean(rawName, 48)
  if (!name) return null
  if (!d.bots[name]) {
    if (d.order.length >= MAX_BOTS) return null
    d.bots[name] = {
      name, id: null, shape: 'cloud', color: 'none', accessory: 'none',
      team: 'Other', status: 'idle', step: '', ts: 0,
    }
    d.order.push(name)
  }
  return name
}

function setLook(d, name, l) {
  if (!l || typeof l !== 'object') return
  const b = { ...d.bots[name] }
  const shape = normalizeShape(l.shape)
  if (shape) b.shape = shape
  if (typeof l.color === 'string' && l.color.length <= 16) b.color = l.color.trim()
  if (typeof l.accessory === 'string' && ACCESSORIES.includes(l.accessory.trim().toLowerCase())) b.accessory = l.accessory.trim().toLowerCase()
  if (typeof l.photo === 'string' && l.photo.length < 12000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(l.photo)) {
    b.photo = l.photo
    if (!l.shape) b.shape = 'photo'
  }
  // hidden in the Grok app: still on its floor, drawn quieter with a tag
  // accept the usual spellings: hidden/isHidden/is_hidden true|"true"|1, visible:false, status/visibility "hidden"
  const truthy = (v) => v === true || v === 1 || (typeof v === 'string' && /^(true|1|yes|sim)$/i.test(v.trim()))
  const falsy = (v) => v === false || v === 0 || (typeof v === 'string' && /^(false|0|no|nao|não)$/i.test(v.trim()))
  const hv = l.hidden ?? l.isHidden ?? l.is_hidden
  if (hv != null) b.hidden = truthy(hv) ? true : falsy(hv) ? false : b.hidden
  if (l.visible != null) b.hidden = falsy(l.visible) ? true : truthy(l.visible) ? false : b.hidden
  const vis = typeof l.visibility === 'string' ? l.visibility : ''
  if (/^hidden$/i.test(vis)) b.hidden = true
  else if (/^(visible|shown)$/i.test(vis)) b.hidden = false
  // personal desk items and birthday (MM-DD or YYYY-MM-DD)
  if (Array.isArray(l.desk)) b.desk = l.desk.filter((x) => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter((x) => /^(plant|photo|trophy|lamp|cactus|books)$/.test(x)).slice(0, 2)
  if (typeof l.birthday === 'string' && /^(\d{4}-)?\d{2}-\d{2}$/.test(l.birthday.trim())) b.birthday = l.birthday.trim().slice(-5)
  const team = clean(l.team || l.group, 32)
  if (team) b.team = team
  const role = clean(l.role, 24)
  if (role) b.role = role
  const id = clean(l.id, 64)
  if (id) b.id = id
  // which Grok account the bot lives in (only set when the message says so; default = main account)
  if (typeof l.account === 'string' && l.account.trim()) b.account = accountOf(l.account)
  // a manager/partner desk next to another bot's desk ("beside": "Lima_")
  const beside = clean(l.beside, 48)
  if (beside) b.beside = beside
  d.bots[name] = b
}

const SAFE_LINK = /^(grokbot:\/\/|https:\/\/)[^\s"'<>]+$/i

function pushActivity(d, e) {
  d.activity.push(e)
}

/** Timeline of conversations (start, last message, end) — the shared input of the office simulation. */
function logTalk(d, from, to, step, t, ending) {
  const open = [...d.talkLog].reverse().find((x) => x.from === from && x.end == null && t - x.lastT <= 90000)
  if (ending) {
    if (open && open.to === to) {
      const i = d.talkLog.indexOf(open)
      d.talkLog[i] = { ...open, end: t }
    }
    return
  }
  if (open && open.to === to) {
    const i = d.talkLog.indexOf(open)
    d.talkLog[i] = { ...open, lastT: Math.max(open.lastT, t), step: step || open.step }
    return
  }
  if (open) d.talkLog[d.talkLog.indexOf(open)] = { ...open, end: t } // switched partner
  d.talkLog.push({ from, to, t0: t, lastT: t, step: step || 'papo rápido', end: null })
}

// ---------------------------------------------------------------- achievements
export const ACHIEVEMENTS = {
  first: { label: 'Primeira tarefa', test: (st) => st.done >= 1 },
  ten: { label: '10 tarefas', test: (st) => st.done >= 10 },
  fifty: { label: '50 tarefas', test: (st) => st.done >= 50 },
  hundred: { label: '100 tarefas', test: (st) => st.done >= 100 },
  early: { label: 'Madrugador', test: (st) => st.early },
  owl: { label: 'Coruja', test: (st) => st.owl },
  clean: { label: 'Semana sem erros', test: (st, t) => st.done >= 5 && t - (st.lastError || st.first) > 7 * 24 * 3600e3 },
}

function isoWeek(t) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const w1 = new Date(d.getFullYear(), 0, 4)
  return `${d.getFullYear()}-${1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7)}`
}

/** All-time per-bot counters, weekly done counts per bot, and achievement unlocks. */
function countStatus(d, name, status, t) {
  const prev = d.stats[name] || { done: 0, errors: 0, first: t, lastError: 0, early: false, owl: false, got: [] }
  const st = { ...prev }
  if (status === 'done') {
    st.done++
    const h = new Date(t).getHours()
    if (h < 7) st.early = true
    if (h >= 22) st.owl = true
    const wk = isoWeek(t)
    const week = d.week && d.week.id === wk ? { ...d.week, bots: { ...d.week.bots } } : { id: wk, bots: {} }
    week.bots[name] = (week.bots[name] || 0) + 1
    d.week = week
  }
  if (status === 'error') {
    st.errors++
    st.lastError = t
  }
  for (const [k, a] of Object.entries(ACHIEVEMENTS)) {
    if (!st.got.includes(k) && a.test(st, t)) {
      st.got = [...st.got, k]
      // never announce the same trophy twice for a bot (stats can be rebuilt from history)
      if (d.unlocks.some((u) => u.bot === name && u.key === k)) continue
      d.unlocks = [...d.unlocks, { bot: name, key: k, label: a.label, t }].slice(-50)
      pushActivity(d, { t, kind: 'unlock', bot: name, step: a.label })
    }
  }
  d.stats[name] = st
}

function applyPayload(d, p, t) {
  if (!p || typeof p !== 'object') return
  if (Array.isArray(p)) {
    p.slice(0, 200).forEach((x) => applyPayload(d, x, t))
    return
  }

  // Bot-to-bot conversation
  if (p.type === 'talk' || (typeof p.from === 'string' && typeof p.to === 'string')) {
    const from = ensureBot(d, p.from)
    const to = ensureBot(d, p.to)
    if (from && to && from !== to) {
      const step = clean(p.step, 80)
      const st = clean(p.status, 12).toLowerCase()
      const cur = d.talks[from]
      logTalk(d, from, to, step, t, st === 'end' || st === 'stop' || st === 'done')
      if (st === 'end' || st === 'stop' || st === 'done') {
        if (cur && cur.to === to && t >= cur.t) {
          delete d.talks[from]
          pushActivity(d, { t, kind: 'talk', from, to, step: step || 'encerrado', end: true })
        }
      } else if (!cur || t >= cur.lastT || cur.to !== to) {
        const same = cur && cur.to === to
        d.talks[from] = {
          to,
          step: step || (same ? cur.step : 'papo rápido'),
          t: same ? cur.t : t,
          lastT: Math.max(t, same ? cur.lastT : 0),
        }
        pushActivity(d, { t, kind: 'talk', from, to, step: step || 'papo rápido' })
      }
    }
  } else if (typeof p.bot === 'string' && !p.status && p.progress != null && d.bots[p.bot]) {
    // progress-only update: {"bot":"A","progress":60}
    const pr = parseFloat(p.progress)
    if (isFinite(pr) && d.bots[p.bot].status === 'working') d.bots[p.bot] = { ...d.bots[p.bot], progress: Math.max(0, Math.min(100, pr)), ts: Math.max(d.bots[p.bot].ts || 0, t) }
  } else if (typeof p.bot === 'string' && p.status) {
    // Status update
    const name = ensureBot(d, p.bot)
    const status = STATUSES[String(p.status).toLowerCase()]
    if (name && status && t >= (d.bots[name].ts || 0)) {
      const step = clean(p.step, 80)
      // optional progress 0-100 ("progress": 40 or "40%"); cleared when the task ends
      const pr = typeof p.progress === 'number' ? p.progress : typeof p.progress === 'string' ? parseFloat(p.progress) : NaN
      const progress = status === 'working' && isFinite(pr) ? Math.max(0, Math.min(100, pr)) : status === 'working' && d.bots[name].status === 'working' && d.bots[name].step === step ? d.bots[name].progress : undefined
      // "ask": "approval" (yes/no) or "reply" (just answer the bot); only meaningful while waiting
      const askRaw = String(p.ask || p.kind || '').toLowerCase()
      const ask = status === 'waiting_user' ? (/aprov|approv|decis/.test(askRaw) ? 'approval' : /respo|reply|answer|pergunt|question/.test(askRaw) ? 'reply' : undefined) : undefined
      d.bots[name] = { ...d.bots[name], status, step, ts: t, progress, ask }
      pushActivity(d, { t, kind: 'status', bot: name, status, step })
      d.history.push({ t, bot: name, status, step })
      countStatus(d, name, status, t)
    }
  }

  if (Array.isArray(p.roster)) {
    // every account sends its own roster; one account's roster never replaces another's
    const acct = accountOf(p.account)
    const names = []
    for (const item of p.roster.slice(0, MAX_BOTS)) {
      if (typeof item === 'string') {
        const name = ensureBot(d, item)
        if (name) names.push(name)
      } else if (item && typeof item === 'object') {
        const name = ensureBot(d, item.name)
        if (name) {
          setLook(d, name, p.account && !item.account ? { ...item, account: acct } : item)
          names.push(name)
        }
      }
    }
    // The most recent roster of each account decides the order of its bots. Parts that arrive within
    // a few seconds of each other belong to the same list and are joined in arrival order.
    const prev = d.rosterByAcct[acct] || { order: [], t: 0 }
    // a part we already have (seen again on reload / replay) changes nothing
    const fresh = names.some((n) => !prev.order.includes(n)) || t > prev.t + ROSTER_GAP_MS
    if (names.length && fresh && t >= prev.t - ROSTER_GAP_MS) {
      const continuing = prev.t && t - prev.t <= ROSTER_GAP_MS && t >= prev.t
      const list = continuing ? [...prev.order] : []
      for (const n of names) if (!list.includes(n)) list.push(n)
      d.rosterByAcct = { ...d.rosterByAcct, [acct]: { order: list, t: Math.max(prev.t, t) } }
      joinRosters(d)
    }
  }

  if (p.groups && typeof p.groups === 'object' && !Array.isArray(p.groups)) {
    for (const [k, v] of Object.entries(p.groups).slice(0, MAX_BOTS)) {
      const name = ensureBot(d, k)
      const team = clean(v, 32)
      if (name && team) d.bots[name] = { ...d.bots[name], team }
    }
  }

  if (p.chat && typeof p.chat === 'object' && !Array.isArray(p.chat)) {
    for (const [k, v] of Object.entries(p.chat).slice(0, MAX_BOTS)) {
      const name = ensureBot(d, k)
      if (name && typeof v === 'string' && v.length < 600 && SAFE_LINK.test(v.trim())) d.chat[name] = v.trim()
    }
  }

  if (p.looks && typeof p.looks === 'object' && !Array.isArray(p.looks)) {
    for (const [k, v] of Object.entries(p.looks).slice(0, MAX_BOTS)) {
      const name = ensureBot(d, k)
      if (name) setLook(d, name, v)
    }
  }

  if (p.routines) {
    const list = Array.isArray(p.routines) ? p.routines : [p.routines]
    for (const r of list.slice(0, 50)) {
      if (!r || typeof r.bot !== 'string' || !Array.isArray(r.items)) continue
      const name = ensureBot(d, r.bot)
      if (!name) continue
      d.routines[name] = r.items.slice(0, 30).filter((i) => i && typeof i === 'object').map((i) => ({
        name: clean(i.name, 60), schedule: clean(i.schedule, 60), next_run: clean(i.next_run, 40),
      }))
    }
  }

  const u = p.type === 'usage' ? p : p.usage && typeof p.usage === 'object' ? p.usage : null
  if (u) {
    const acct = accountOf(u.account || p.account)
    const bots = {}
    if (u.bots && typeof u.bots === 'object') {
      for (const [k, v] of Object.entries(u.bots).slice(0, MAX_BOTS)) {
        const n = num(v)
        const name = clean(k, 48)
        if (name && n != null) bots[name] = n
      }
    }
    const total = Math.max(0, Math.min(100, num(u.total_used_pct) ?? 0))
    const prevU = d.usageByAcct[acct]
    if (!prevU || t >= (prevU.t || 0)) {
      const entry = { total, resets_at: clean(u.resets_at, 40), bots, t, account: acct }
      d.usageByAcct = { ...d.usageByAcct, [acct]: entry }
      // d.usage keeps meaning "the main account" for older parts of the app (report, health)
      if (acct === DEFAULT_ACCOUNT) d.usage = entry
    }
    d.usageHist = [...(d.usageHist || []).filter((h) => t - h.t < 8 * 24 * 3600e3), { t, total, ...(acct !== DEFAULT_ACCOUNT ? { account: acct } : {}) }].slice(-300)
  }

  // {"decision":{"bot":"Closer","action":"approve|reject","note":"..."}} — your answer, published from the site
  if (p.decision && typeof p.decision === 'object' && typeof p.decision.bot === 'string') {
    const name = clean(p.decision.bot, 48)
    const action = p.decision.action === 'reject' ? 'reject' : 'approve'
    if (d.bots[name]) pushActivity(d, { t, kind: 'decision', bot: name, action, step: clean(p.decision.note, 120) })
  }

  // {"office":{"name":"Minha empresa"}} — shared office settings (same on every device)
  if (p.office && typeof p.office === 'object') {
    const name = clean(p.office.name, 40)
    const look = cleanLook(p.office.look)
    d.office = { ...(d.office || {}), ...(name ? { name } : {}), ...(look ? { look: { ...(d.office?.look || {}), ...look } } : {}) }
  }

  // {"handoff":{"from":"A","to":"B","what":"Roteiro"}} — same as mail: A passes work to B
  if (p.handoff && typeof p.handoff === 'object') p = { type: 'mail', from: p.handoff.from, to: p.handoff.to, step: p.handoff.what || p.handoff.step }
  // {"type":"mail","from":"A","to":"B","step":"Relatório"} — an envelope travels to B's desk
  if (p.type === 'mail' && typeof p.from === 'string' && typeof p.to === 'string') {
    const from = ensureBot(d, p.from), to = ensureBot(d, p.to)
    if (from && to && from !== to) {
      d.mail = [...d.mail.filter((m) => t - m.t < 30 * 60e3), { from, to, t, subject: clean(p.step || p.subject, 60) || 'Mensagem' }].slice(-40)
      pushActivity(d, { t, kind: 'mail', from, to, step: clean(p.step || p.subject, 60) || 'Mensagem' })
    }
  }

  // {"goals":{"Sales":{"label":"Leads qualificados","target":40}}} — weekly goal per team (TV)
  if (p.goals && typeof p.goals === 'object' && !Array.isArray(p.goals)) {
    const g = { ...d.goals }
    for (const [team, v] of Object.entries(p.goals).slice(0, 30)) {
      const target = num(v?.target)
      if (target && target > 0) g[clean(team, 32)] = { label: clean(v.label, 40) || 'Meta da semana', target: Math.min(100000, target) }
    }
    d.goals = g
  }

  // {"pets":{"Ops":"dog","Design":"cat","Sales":"fish"}}
  if (p.pets && typeof p.pets === 'object' && !Array.isArray(p.pets)) {
    const g = { ...d.pets }
    for (const [team, v] of Object.entries(p.pets).slice(0, 30)) if (['cat', 'dog', 'fish', 'none'].includes(String(v))) g[clean(team, 32)] = String(v)
    d.pets = g
  }

  // {"react":{"bot":"Closer","kind":"heart"}} — reactions from people watching, shown over the bot
  if (p.react && typeof p.react === 'object' && typeof p.react.bot === 'string') {
    const kind = clean(p.react.kind, 12).toLowerCase()
    if (['like', 'heart', 'party', 'clap', 'laugh'].includes(kind) && d.bots[clean(p.react.bot, 48)]) {
      d.reactions = [...d.reactions.filter((r) => t - r.t < 60000), { bot: clean(p.react.bot, 48), kind, t }].slice(-40)
    }
  }

  // {"weather":"rain"} — clear | cloudy | rain | storm | snow (sent by your own bots/scripts)
  if (typeof p.weather === 'string' && /^(clear|sun|sunny|cloudy|clouds|rain|storm|snow)$/i.test(p.weather.trim())) {
    const w = p.weather.trim().toLowerCase()
    d.weather = { kind: w === 'sun' || w === 'sunny' ? 'clear' : w === 'clouds' ? 'cloudy' : w, t }
  }

  if (p.cortex && typeof p.cortex === 'object') {
    const c = p.cortex
    d.cortex = {
      notes: num(c.notes) ?? d.cortex?.notes ?? 0,
      recent: Array.isArray(c.recent)
        ? c.recent.slice(0, 12).filter((r) => r && typeof r === 'object').map((r) => ({ title: clean(r.title, 80), updated: clean(r.updated, 40) }))
        : d.cortex?.recent || [],
      t,
    }
  }
}

function withRoster(s) {
  const d = draft(s)
  for (const b of demoRoster) {
    const name = ensureBot(d, b.name)
    setLook(d, name, b)
  }
  return d
}

/** The office list = every account's latest roster, main account first (its teams set the floor order). */
function joinRosters(d) {
  const accts = sortAccounts(Object.keys(d.rosterByAcct || {}))
  const list = []
  for (const a of accts) for (const n of d.rosterByAcct[a].order) if (!list.includes(n)) list.push(n)
  d.rosterOrder = list
  d.rosterT = Math.max(0, ...accts.map((a) => d.rosterByAcct[a].t || 0))
}

const acctOfBot = (d, n) => d.bots[n]?.account || DEFAULT_ACCOUNT

/**
 * A roster only lists bots of its own account: drop names that belong to another account
 * (older caches mixed them up) and forget an account's roster time when nothing is left.
 */
function sanitizeRosters(d) {
  const out = {}
  for (const [a, r] of Object.entries(d.rosterByAcct || {})) {
    if (!r || !Array.isArray(r.order)) continue
    const order = r.order.filter((n) => d.bots[n] && acctOfBot(d, n) === a)
    if (order.length) out[a] = { order, t: r.t || 0 }
  }
  d.rosterByAcct = out
  joinRosters(d)
}

/**
 * Office order, account by account (main account first): an account with a known roster shows that
 * roster; an account whose roster this browser doesn't have (yet) keeps its last known bots, so one
 * account's roster can never make another account's bots disappear. Bots outside every roster only
 * stay while they are active (a status in the last 30 min).
 */
function applyRosterOrder(d) {
  sanitizeRosters(d)
  const prev = [...new Set([...d.order, ...Object.keys(d.bots)])].filter((n) => d.bots[n])
  if (!Object.keys(d.rosterByAcct).length) {
    d.order = prev
    return
  }
  const recent = Date.now() - 30 * 60e3
  const list = []
  for (const a of sortAccounts([...Object.keys(d.rosterByAcct), ...prev.map((n) => acctOfBot(d, n))])) {
    const r = d.rosterByAcct[a]
    // no roster for this account in this browser: its last known bots (one per id), never dropped
    const ids = new Set()
    const names = r ? r.order : prev.filter((n) => acctOfBot(d, n) === a && d.bots[n].id && !ids.has(d.bots[n].id) && ids.add(d.bots[n].id))
    for (const n of names) if (!list.includes(n)) list.push(n)
  }
  d.order = [...list, ...prev.filter((n) => !list.includes(n) && (d.bots[n]?.ts || 0) > recent)]
}

function draft(s) {
  return {
    ...s,
    rosterOrder: [...(s.rosterOrder || [])],
    rosterByAcct: { ...(s.rosterByAcct || {}) },
    usageByAcct: { ...(s.usageByAcct || {}) },
    bots: { ...s.bots },
    order: [...s.order],
    routines: { ...s.routines },
    chat: { ...s.chat },
    talks: { ...s.talks },
    activity: [...s.activity],
    history: [...(s.history || [])],
    talkLog: [...(s.talkLog || [])],
    reactions: s.reactions || [],
    mail: s.mail || [],
    usageHist: s.usageHist || [],
    stats: { ...(s.stats || {}) },
    unlocks: [...(s.unlocks || [])],
  }
}

export const dataStore = createStore(blank())

let storageKey = null
let seen = new Set()
let persistTimer = null

const keyFor = (topic) => `bot-office:v1:${topic}`
// Roster, Cortex and usage live in their own keys so they survive even if the main
// snapshot (activity, history ids) ever fails to save (quota, private mode).
const PARTS = ['roster', 'cortex', 'usage', 'usageacct']
const ROSTER_V = 2
const partKey = (topic, part) => `${keyFor(topic)}:${part}`
let currentTopic = null

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** topic = live mode (empty office + cached state); null = demo mode (example roster). */
export function loadTopic(topic) {
  clearTimeout(persistTimer)
  storageKey = topic ? keyFor(topic) : null
  currentTopic = topic || null
  seen = new Set()
  let s = topic ? blank() : withRoster(blank())
  if (storageKey) {
    // 1) the saved roster: show the last known office immediately, even with no new messages
    const r = readJSON(partKey(topic, 'roster'))
    if (r && r.bots && typeof r.bots === 'object') {
      // older caches had a single roster: it belonged to the main account
      // rosters saved before v2 (single list, or the first multi-account build) may mix accounts:
      // start them over; the 12 h replay rebuilds them, and meanwhile every cached bot stays visible
      const byAcct = r.v === ROSTER_V && r.rosterByAcct && typeof r.rosterByAcct === 'object' ? r.rosterByAcct : {}
      s = { ...s, bots: { ...r.bots }, order: Array.isArray(r.order) ? r.order.filter((n) => r.bots[n]) : Object.keys(r.bots), chat: r.chat || {}, rosterOrder: r.rosterOrder || [], rosterT: r.rosterT || 0, rosterByAcct: byAcct }
    }
    const c = readJSON(partKey(topic, 'cortex'))
    if (c) s.cortex = c
    const u = readJSON(partKey(topic, 'usage'))
    if (u) s.usage = u
    const ua = readJSON(partKey(topic, 'usageacct'))
    s.usageByAcct = ua && typeof ua === 'object' ? ua : u ? { [DEFAULT_ACCOUNT]: u } : {}
  }
  if (storageKey) {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const p = JSON.parse(raw)
        const bots = { ...(p.bots || {}), ...s.bots }
        // keep live status fields from the main snapshot, looks/team from the roster part
        for (const n of Object.keys(p.bots || {})) if (s.bots[n]) bots[n] = { ...p.bots[n], ...s.bots[n], status: p.bots[n].status, step: p.bots[n].step, ts: p.bots[n].ts }
        s = {
          ...s,
          bots,
          order: [...new Set([...s.order, ...(p.order || [])])].filter((n) => bots[n]),
          routines: p.routines || {},
          usage: s.usage || p.usage || null,
          cortex: s.cortex || p.cortex || null,
          activity: p.activity || [],
          history: p.history || [],
          talkLog: p.talkLog || [],
          mail: p.mail || [],
          office: p.office || null,
          usageHist: p.usageHist || [],
          goals: p.goals || {},
          pets: p.pets || {},
          stats: p.stats || {},
          week: p.week || null,
          unlocks: p.unlocks || [],
          weather: p.weather || null,
          chat: { ...(p.chat || {}), ...s.chat },
          talks: p.talks || {},
          lastTime: p.lastTime || 0,
        }
        seen = new Set(p.seen || [])
        // cached bots that are no longer in the roster (renamed/removed) don't come back on load
        applyRosterOrder(s)
      }
    } catch {
      /* corrupt storage: start fresh */
    }
  }
  if (storageKey) applyRosterOrder(s)
  dataStore.set(() => ({ ...s, rev: (dataStore.get().rev || 0) + 1 }))
}

/** Drop the cached office state for a topic (used on sign out). */
export function forgetTopic(topic) {
  clearTimeout(persistTimer)
  if (storageKey === keyFor(topic)) storageKey = null
  try {
    localStorage.removeItem(keyFor(topic))
    for (const part of PARTS) localStorage.removeItem(partKey(topic, part))
  } catch {
    /* ignore */
  }
}

function saveNow() {
  clearTimeout(persistTimer)
  if (!storageKey || !currentTopic) return
  const s = dataStore.get()
  // small, important parts first and separately
  writeJSON(partKey(currentTopic, 'roster'), { bots: s.bots, order: s.order, chat: s.chat, rosterOrder: s.rosterOrder, rosterT: s.rosterT, rosterByAcct: s.rosterByAcct, v: ROSTER_V })
  if (s.cortex) writeJSON(partKey(currentTopic, 'cortex'), s.cortex)
  if (s.usage) writeJSON(partKey(currentTopic, 'usage'), s.usage)
  if (s.usageByAcct && Object.keys(s.usageByAcct).length) writeJSON(partKey(currentTopic, 'usageacct'), s.usageByAcct)
  const main = {
    bots: s.bots, order: s.order, routines: s.routines, usage: s.usage, cortex: s.cortex,
    activity: s.activity, office: s.office, history: compactHistory(s.history), talkLog: s.talkLog, mail: s.mail, usageHist: s.usageHist, goals: s.goals, pets: s.pets, stats: s.stats, week: s.week, unlocks: s.unlocks, weather: s.weather, chat: s.chat, talks: s.talks, lastTime: s.lastTime,
    seen: [...seen].slice(-MAX_SEEN),
  }
  if (!writeJSON(storageKey, main)) writeJSON(storageKey, { ...main, activity: s.activity.slice(0, 20), history: s.history.slice(-300), seen: [...seen].slice(-100) })
}

// older entries keep only what the timeline needs (drop long step texts) to save space
function compactHistory(h) {
  const old = Date.now() - 12 * 3600e3
  return h.map((x) => (x.t < old && x.step ? { t: x.t, bot: x.bot, status: x.status } : x))
}

function persist() {
  if (!storageKey) return
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(saveNow, { timeout: 2000 }) : saveNow()), 1500)
}

// don't lose the last updates when the tab is closed or hidden
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', saveNow)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveNow())
}

/** msgs: [{ id?, time (ms), payload }] */
export function ingest(msgs) {
  const s0 = dataStore.get()
  const d = draft(s0)
  let changed = false
  const sorted = [...msgs].sort((a, b) => a.time - b.time)
  for (const m of sorted) {
    if (m.id) {
      if (seen.has(m.id)) {
        const p = m.payload
        if (p && typeof p === 'object' && Array.isArray(p.roster)) {
          try {
            applyPayload(d, { roster: p.roster, ...(p.account ? { account: p.account } : {}) }, m.time)
            changed = true
          } catch {
            /* ignore */
          }
        }
        continue
      }
      seen.add(m.id)
    }
    try {
      applyPayload(d, m.payload, m.time)
      changed = true
    } catch (e) {
      console.warn('bot-office: skipped a malformed message')
    }
    d.lastTime = Math.max(d.lastTime, m.time)
  }
  if (!changed) return
  applyRosterOrder(d)
  if (seen.size > MAX_SEEN * 2) seen = new Set([...seen].slice(-MAX_SEEN))
  d.activity.sort((a, b) => b.t - a.t)
  d.activity = d.activity.slice(0, MAX_ACTIVITY)
  if (d.history.length !== (s0.history || []).length) {
    // keep ~2 days of status changes, oldest first
    d.history.sort((a, b) => a.t - b.t)
    const cutoff = Date.now() - 48 * 3600e3
    d.history = d.history.filter((h) => h.t >= cutoff).slice(-2000)
  }
  d.talkLog.sort((a, b) => a.t0 - b.t0)
  d.talkLog = d.talkLog.filter((x) => (x.end ?? x.lastT + 90000) > Date.now() - 45 * 60e3).slice(-200)
  d.rev = s0.rev + 1
  dataStore.set(() => d)
  persist()
}

/**
 * Derive floors, one per team. floors[0] is the ground floor. The first team of the latest
 * roster gets the highest floor (right under the Cortex, which the app adds on top).
 */
export function deriveFloors(s) {
  const teams = []
  const byTeam = {}
  for (const n of s.order) {
    const b = s.bots[n]
    if (!b) continue
    if (!byTeam[b.team]) {
      byTeam[b.team] = []
      teams.push(b.team)
    }
    byTeam[b.team].push(n)
  }
  return teams.reverse().map((t, i) => ({ key: t, name: t, num: i + 1, bots: byTeam[t] }))
}
