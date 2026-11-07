// Merged bot-office state. Every ntfy message is a partial update; we merge
// them all (in time order) and persist the result per topic in localStorage,
// because ntfy only keeps ~12h of history.
import roster from '../roster.json'
import { createStore } from './createStore'
import { SHAPES, ACCESSORIES } from './constants'

const MAX_BOTS = 150
const MAX_ACTIVITY = 80
const MAX_SEEN = 500
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
  if (typeof l.shape === 'string' && SHAPES.includes(l.shape.trim().toLowerCase())) b.shape = l.shape.trim().toLowerCase()
  if (typeof l.color === 'string' && l.color.length <= 16) b.color = l.color.trim()
  if (typeof l.accessory === 'string' && ACCESSORIES.includes(l.accessory.trim().toLowerCase())) b.accessory = l.accessory.trim().toLowerCase()
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
      if (st === 'end' || st === 'stop' || st === 'done') {
        if (cur && cur.to === to && t >= cur.t) {
          delete d.talks[from]
          pushActivity(d, { t, kind: 'talk', from, to, step: step || 'wrapped up', end: true })
        }
      } else if (!cur || t >= cur.lastT || cur.to !== to) {
        const same = cur && cur.to === to
        d.talks[from] = {
          to,
          step: step || (same ? cur.step : 'quick sync'),
          t: same ? cur.t : t,
          lastT: Math.max(t, same ? cur.lastT : 0),
        }
        pushActivity(d, { t, kind: 'talk', from, to, step: step || 'quick sync' })
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
    }
  }

  if (Array.isArray(p.roster)) {
    for (const item of p.roster.slice(0, MAX_BOTS)) {
      if (typeof item === 'string') ensureBot(d, item)
      else if (item && typeof item === 'object') {
        const name = ensureBot(d, item.name)
        if (name) setLook(d, name, item)
      }
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
  for (const b of roster) {
    const name = ensureBot(d, b.name)
    setLook(d, name, b)
  }
  return d
}

function draft(s) {
  return {
    ...s,
    bots: { ...s.bots },
    order: [...s.order],
    routines: { ...s.routines },
    chat: { ...s.chat },
    talks: { ...s.talks },
    activity: [...s.activity],
  }
}

export const dataStore = createStore(withRoster(blank()))

let storageKey = null
let seen = new Set()
let persistTimer = null

export function loadTopic(topic) {
  storageKey = topic ? `bot-office:v1:${topic}` : null
  seen = new Set()
  let s = withRoster(blank())
  if (storageKey) {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const p = JSON.parse(raw)
        s = {
          ...s,
          bots: { ...s.bots, ...(p.bots || {}) },
          order: [...new Set([...s.order, ...(p.order || [])])].filter((n) => (p.bots || {})[n] || s.bots[n]),
          routines: p.routines || {},
          usage: p.usage || null,
          cortex: p.cortex || null,
          activity: p.activity || [],
          chat: p.chat || {},
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

function persist() {
  if (!storageKey) return
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    const s = dataStore.get()
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        bots: s.bots, order: s.order, routines: s.routines, usage: s.usage, cortex: s.cortex,
        activity: s.activity, chat: s.chat, talks: s.talks, lastTime: s.lastTime,
        seen: [...seen].slice(-MAX_SEEN),
      }))
    } catch {
      /* quota / private mode */
    }
  }, 600)
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
      console.warn('bad message', e)
    }
    d.lastTime = Math.max(d.lastTime, m.time)
  }
  if (!changed) return
  if (seen.size > MAX_SEEN * 2) seen = new Set([...seen].slice(-MAX_SEEN))
  d.activity.sort((a, b) => b.t - a.t)
  d.activity = d.activity.slice(0, MAX_ACTIVITY)
  d.rev = s0.rev + 1
  dataStore.set(() => d)
  persist()
}

/** Derive floors (one per team, in roster order) + the Cortex room on top. */
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
  return teams.map((t, i) => ({ key: t, name: t, num: i + 1, bots: byTeam[t] }))
}
