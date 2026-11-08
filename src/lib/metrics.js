// Derived numbers from the status timeline (state.history: [{ t, bot, status, step }], oldest first).

/** Bots as they were at time T (for the timeline replay). Bots with no event yet show as idle. */
export function botsAt(state, T) {
  const last = {}
  for (const h of state.history) {
    if (h.t > T) break
    last[h.bot] = h
  }
  const bots = {}
  for (const [n, b] of Object.entries(state.bots)) {
    const h = last[n]
    bots[n] = h ? { ...b, status: h.status, step: h.step, ts: h.t } : { ...b, status: 'idle', step: '', ts: 0 }
  }
  return bots
}

/** Today's numbers for one bot: tasks finished, errors, time spent working, events per hour. */
export function botMetrics(state, name, now = Date.now()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const t0 = start.getTime()
  const ev = state.history.filter((h) => h.bot === name)
  let done = 0, errors = 0, workMs = 0
  const hours = new Array(24).fill(0)
  for (let i = 0; i < ev.length; i++) {
    const h = ev[i]
    const end = i + 1 < ev.length ? ev[i + 1].t : now
    if (h.t >= t0) {
      if (h.status === 'done') done++
      if (h.status === 'error') errors++
      hours[new Date(h.t).getHours()]++
    }
    if (h.status === 'working') {
      const a = Math.max(h.t, t0), b = Math.min(end, now, h.t + 2 * 3600e3) // a stale "working" counts at most 2h
      if (b > a) workMs += b - a
    }
  }
  return { done, errors, workMs, hours, events: ev.filter((h) => h.t >= t0).length }
}

export function fmtDuration(ms) {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`
}

/**
 * Typical task length for a bot (from "working" until "done", last 48 h) and whether the current
 * task is taking much longer than usual.
 */
const taskCache = new Map()
export function taskStats(state, name, now = Date.now()) {
  const key = `${name}|${state.history.length}|${state.history[state.history.length - 1]?.t || 0}`
  let base = taskCache.get(key)
  if (!base) {
    const ev = state.history.filter((h) => h.bot === name)
    const runs = []
    let start = null
    for (const h of ev) {
      if (h.status === 'working') start ??= h.t
      else {
        if (start != null && h.status === 'done' && h.t - start < 6 * 3600e3 && h.t - start > 20000) runs.push(h.t - start)
        start = null
      }
    }
    const avg = runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : null
    base = { avg, samples: runs.length, currentStart: start }
    if (taskCache.size > 500) taskCache.clear()
    taskCache.set(key, base)
  }
  const b = state.bots[name]
  const elapsed = b?.status === 'working' && base.currentStart != null ? now - base.currentStart : null
  const slow = elapsed != null && base.avg != null && base.samples >= 3 && elapsed > Math.max(10 * 60e3, base.avg * 2.5)
  return { ...base, elapsed, slow }
}
