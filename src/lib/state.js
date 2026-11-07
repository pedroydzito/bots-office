// Merged bot-office state. Every ntfy message is a partial update; we merge
// them all (in time order) and persist the result per topic in localStorage,
// because ntfy only keeps ~12h of history.
// Live mode starts empty: roster, teams, looks and chat links all come from
// the topic. The bundled example roster is only used by demo mode.
import demoRoster from '../roster.json'
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
  }
}

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
  if (typeof l.hidden === 'boolean') b.hidden = l.hidden
  // personal desk items and birthday (MM-DD or YYYY-MM-DD)
  if (Array.isArray(l.desk)) b.desk = l.desk.filter((x) => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter((x) => /^(plant|photo|trophy|lamp|cactus|books)$/.test(x)).slice(0, 2)
  if (typeof l.birthday === 'string' && /^(\d{4}-)?\d{2}-\d{2}$/.test(l.birthday.trim())) b.birthday = l.birthday.trim().slice(-5)
  const team = clean(l.team || l.group, 32)
  if (team) b.team = team
  const id = clean(l.id, 64)
  if (id) b.id = id
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
  } else if (typeof p.bot === 'string' && p.status) {
    // Status update
    const name = ensureBot(d, p.bot)
    const status = STATUSES[String(p.status).toLowerCase()]
    if (name && status && t >= (d.bots[name].ts || 0)) {
      const step = clean(p.step, 80)
      d.bots[name] = { ...d.bots[name], status, step, ts: t }
      pushActivity(d, { t, kind: 'status', bot: name, status, step })
      d.history.push({ t, bot: name, status, step })
      countStatus(d, name, status, t)
    }
  }

  if (Array.isArray(p.roster)) {
    const names = []
    for (const item of p.roster.slice(0, MAX_BOTS)) {
      if (typeof item === 'string') {
        const name = ensureBot(d, item)
        if (name) names.push(name)
      } else if (item && typeof item === 'object') {
        const name = ensureBot(d, item.name)
        if (name) {
          setLook(d, name, item)
          names.push(name)
        }
      }
    }
    // The most recent roster decides the order of floors and bots. Parts that arrive within a
    // few seconds of each other belong to the same list and are joined in arrival order.
    if (names.length && t >= d.rosterT - ROSTER_GAP_MS) {
      const continuing = d.rosterT && t - d.rosterT <= ROSTER_GAP_MS && t >= d.rosterT
      const list = continuing ? [...d.rosterOrder] : []
      for (const n of names) if (!list.includes(n)) list.push(n)
      d.rosterOrder = list
      d.rosterT = Math.max(d.rosterT, t)
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
    const bots = {}
    if (u.bots && typeof u.bots === 'object') {
      for (const [k, v] of Object.entries(u.bots).slice(0, MAX_BOTS)) {
        const n = num(v)
        const name = clean(k, 48)
        if (name && n != null) bots[name] = n
      }
    }
    d.usage = {
      total: Math.max(0, Math.min(100, num(u.total_used_pct) ?? 0)),
      resets_at: clean(u.resets_at, 40),
      bots,
      t,
    }
  }

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

/** Bots in the latest roster's order first, then anyone else (e.g. seen only in a status). */
function applyRosterOrder(d) {
  if (!d.rosterOrder.length) return
  const inRoster = new Set(d.rosterOrder)
  d.order = [...d.rosterOrder.filter((n) => d.bots[n]), ...d.order.filter((n) => !inRoster.has(n))]
}

function draft(s) {
  return {
    ...s,
    rosterOrder: [...(s.rosterOrder || [])],
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
const PARTS = ['roster', 'cortex', 'usage']
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
      s = { ...s, bots: { ...r.bots }, order: Array.isArray(r.order) ? r.order.filter((n) => r.bots[n]) : Object.keys(r.bots), chat: r.chat || {}, rosterOrder: r.rosterOrder || [], rosterT: r.rosterT || 0 }
    }
    const c = readJSON(partKey(topic, 'cortex'))
    if (c) s.cortex = c
    const u = readJSON(partKey(topic, 'usage'))
    if (u) s.usage = u
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
      }
    } catch {
      /* corrupt storage: start fresh */
    }
  }
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
  writeJSON(partKey(currentTopic, 'roster'), { bots: s.bots, order: s.order, chat: s.chat, rosterOrder: s.rosterOrder, rosterT: s.rosterT })
  if (s.cortex) writeJSON(partKey(currentTopic, 'cortex'), s.cortex)
  if (s.usage) writeJSON(partKey(currentTopic, 'usage'), s.usage)
  const main = {
    bots: s.bots, order: s.order, routines: s.routines, usage: s.usage, cortex: s.cortex,
    activity: s.activity, history: s.history, talkLog: s.talkLog, mail: s.mail, goals: s.goals, pets: s.pets, stats: s.stats, week: s.week, unlocks: s.unlocks, weather: s.weather, chat: s.chat, talks: s.talks, lastTime: s.lastTime,
    seen: [...seen].slice(-MAX_SEEN),
  }
  if (!writeJSON(storageKey, main)) writeJSON(storageKey, { ...main, activity: s.activity.slice(0, 20), history: s.history.slice(-300), seen: [...seen].slice(-100) })
}

function persist() {
  if (!storageKey) return
  clearTimeout(persistTimer)
  persistTimer = setTimeout(saveNow, 600)
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
      if (seen.has(m.id)) continue
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
    d.history = d.history.filter((h) => h.t >= cutoff).slice(-3000)
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
