// Deterministic office simulation.
//
// Every screen logged into the same code must show exactly the same thing at the same time, so
// nothing here uses Math.random() or per-device timers. A bot's position, activity and gestures
// are a pure function of:
//   - the wall clock (all devices are NTP-synced; ntfy timestamps correct big skews),
//   - the messages from the topic (statuses, conversations), which every screen receives,
//   - a hash of the bot's name (its personality).
// Walking paths go through the same lanes as before; schedules are computed per time slot.
import { planPath, talkSpots, SEAT_Y } from './layout'
import { TALK_TIMEOUT_MS } from '../lib/constants'

export const SPEED = 1.4 // units per second
export const RISE = 0.45 // seconds to get up from a chair before walking
export const SLOT = 80000 // ms per wander slot
export const clock = { offset: 0 }
export const syncNow = () => Date.now() + clock.offset

/** Shared context set by the app: who sits where on which floor. */
export const world = { seatOf: () => null, layoutOfIdx: () => null, floorsCount: 1 }

// ------------------------------------------------------------------ hashing
export function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
export const rnd = (...parts) => hash(parts.join('|')) / 4294967296

// ------------------------------------------------------------------ paths
export function pathLen(pts) {
  let d = 0
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return d
}
export function pointAt(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (d <= seg || i === pts.length - 1) {
      const k = seg > 0 ? Math.min(1, Math.max(0, d / seg)) : 1
      return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, yaw: seg > 0 ? Math.atan2(b[0] - a[0], b[1] - a[1]) : null }
    }
    d -= seg
  }
  const p = pts[pts.length - 1]
  return { x: p[0], z: p[1], yaw: null }
}
const walkMs = (from, to, layout, seated) => (pathLen(planPath(from, to, layout)) / SPEED + (seated ? RISE : 0)) * 1000
export const rideMs = (a, b) => 1800 + 1000 * Math.abs(a - b)

// ------------------------------------------------------------------ statuses
export function statusAt(history, name, t) {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]
    if (h.t <= t && h.bot === name) return h
  }
  return null
}
const isBusy = (h) => h && (h.status === 'working' || h.status === 'waiting_user' || h.status === 'error')
/** Late at night (22h–7h local): free bots doze at their desk instead of wandering. */
export function isLate(t) {
  const hr = new Date(t).getHours()
  return hr >= 22 || hr < 7
}
export function isSleepy(h, t) {
  if (isBusy(h)) return false
  // during the day a free bot keeps doing its routines (coffee, water, chats, the pet...)
  return isLate(t) && (!h || t - h.t > 3600e3)
}

// ------------------------------------------------------------------ conversations
/** Conversations with an effective end time (end message, or 90 s after the last talk message). */
export function sessions(data, T) {
  const out = []
  for (const s of data.talkLog || []) {
    const end = s.end ?? (T - s.lastT > TALK_TIMEOUT_MS ? s.lastT + TALK_TIMEOUT_MS : Infinity)
    if (end < T - 30 * 60e3) continue
    out.push({ ...s, endT: end })
  }
  return out
}

/** Visitors of one host whose talks overlap form a group; 2+ visitors = a meeting. */
function groupOf(all, s) {
  const g = all.filter((o) => o.to === s.to && o.t0 < s.endT && o.endT > s.t0)
  return g.sort((a, b) => (a.from < b.from ? -1 : 1))
}
function meetSpot(layout, people, who) {
  const i = people.indexOf(who), k = people.length
  const c = layout.meet
  const a = (i / k) * Math.PI * 2 + Math.PI / 2
  const r = 0.75 + k * 0.12
  const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r
  return { kind: 'spot', x, z, az: z, yaw: Math.atan2(c.x - x, c.z - z) }
}

/** Ride timings of a cross-floor conversation (also drawn by the elevator car). */
export function rideFor(s) {
  const a = world.seatOf(s.from), b = world.seatOf(s.to)
  if (!a || !b || a.floorIdx === b.floorIdx) return null
  const wh = walkMs({ ...a.seat }, a.layout.elevator, a.layout, true)
  const goStart = s.t0 + wh
  const goEnd = goStart + rideMs(a.floorIdx, b.floorIdx)
  const spot = talkSpots(b.seat).visitor
  const wv = walkMs({ x: spot.x, z: spot.z, az: spot.az }, b.layout.elevator, b.layout, false)
  const backStart = s.endT + wv
  const backEnd = backStart + rideMs(a.floorIdx, b.floorIdx)
  return { from: a.floorIdx, to: b.floorIdx, goStart, goEnd, backStart, backEnd }
}

// ------------------------------------------------------------------ wandering
const KINDS = ['coffee', 'cooler', 'sofa', 'view', 'books', 'plant', 'phone', 'chat', 'vending', 'printer', 'arcade', 'armchair', 'stroll']
const tripCache = new Map()
/** Who leaves their desk in this slot on this floor, where to, and until when (conflict-free). */
function tripsFor(floorKey, names, layout, slot, data, all) {
  const key = `${floorKey}|${slot}|${data.rev}`
  if (tripCache.has(key)) return tripCache.get(key)
  if (tripCache.size > 400) tripCache.clear()
  const slotStart = slot * SLOT
  const cap = Math.max(1, Math.round(names.length / (isLate(slotStart) ? 4 : 2.2)))
  const taken = new Set()
  const trips = {}
  const order = [...names].sort((a, b) => rnd(a, slot, 'o') - rnd(b, slot, 'o'))
  for (const n of order) {
    if (Object.keys(trips).length >= cap) break
    const personality = 0.22 + 0.5 * rnd(n, 'personality')
    if (rnd(n, slot, 'go') > personality) continue
    const depart = slotStart + 2000 + rnd(n, slot, 'd') * 22000
    const h = statusAt(data.history || [], n, depart)
    if (isBusy(h) || isSleepy(h, depart)) continue
    if (all.some((s) => (s.from === n || s.to === n) && s.t0 < depart + SLOT && s.endT > depart - 5000)) continue
    const likes = [...KINDS].sort((a, b) => rnd(n, 'likes', a) - rnd(n, 'likes', b)).slice(0, 6)
    // a quick chat at a colleague's desk is also an option (if that colleague is free)
    const mates = names.filter((m) => m !== n && !trips[m] && !isBusy(statusAt(data.history || [], m, depart)))
    const extra = []
    if (mates.length) {
      const m = mates[Math.floor(rnd(n, slot, 'mate') * mates.length)]
      const ms = layout.seats[names.indexOf(m)]
      if (ms) extra.push({ kind: 'chat', x: ms.x + 0.5, z: ms.az, az: ms.az, yaw: Math.atan2(-0.5, ms.z - ms.az), mate: m })
    }
    const pois = [...layout.pois, ...extra].filter((p) => !taken.has(`${p.kind}:${p.x},${p.z}`))
    const pick = [...pois].sort((a, b) => (likes.indexOf(b.kind) >= 0) - (likes.indexOf(a.kind) >= 0) || rnd(n, slot, a.kind, a.x) - rnd(n, slot, b.kind, b.x))[0]
    if (!pick) continue
    taken.add(`${pick.kind}:${pick.x},${pick.z}`)
    const seat = layout.seats[names.indexOf(n)]
    const go = walkMs(seat, pick, layout, true) + (pick.route ? pick.route.length * 6500 : 0)
    const stay = 12000 + rnd(n, slot, 's') * 26000
    const back = Math.min(depart + go + stay, slotStart + SLOT - 1500)
    if (back - depart < go + 4000) continue
    trips[n] = { depart, back, poi: pick }
  }
  tripCache.set(key, trips)
  return trips
}

// ------------------------------------------------------------------ events → position
const evCache = new Map()

/**
 * Events (goal changes) for one bot drawn on one floor.
 * role 'home' starts seated; role 'visit' is hidden until it steps out of the elevator.
 */
function eventsFor(ctx, T) {
  const { name, role, floorKey, layout, seat, names, data } = ctx
  const slot = Math.floor(T / SLOT)
  const key = `${floorKey}|${name}|${role}|${data.rev}|${slot}|${Math.floor(T / 15000)}`
  const hit = evCache.get(key)
  if (hit) return hit
  if (evCache.size > 2000) evCache.clear()
  const all = sessions(data, T)
  const ev = []
  const seatGoal = seat ? { kind: 'seat', x: seat.x, z: seat.z, az: seat.az, ex: seat.ex, yaw: 0 } : null
  const elev = { ...layout.elevator, hide: true }
  const homeFloorOf = (n) => world.seatOf(n)?.floorIdx
  const here = (n) => names.includes(n)
  let talkInfo = []

  for (const s of all) {
    if (role === 'home' && s.from === name) {
      if (here(s.to)) {
        const g = groupOf(all, s)
        const tseat = layout.seats[names.indexOf(s.to)]
        const spot = g.length >= 2 ? meetSpot(layout, [s.to, ...g.map((o) => o.from)], name) : talkSpots(tseat, Math.max(0, g.findIndex((o) => o.from === name))).visitor
        ev.push({ t: s.t0, goal: spot, talk: { role: 'visitor', partner: s.to, step: s.step, seed: hash(name), meeting: g.length >= 2, t0: s.t0 } })
        ev.push({ t: s.endT, goal: seatGoal })
      } else if (homeFloorOf(s.to) != null) {
        const r = rideFor(s)
        ev.push({ t: s.t0, goal: elev })
        if (r && isFinite(r.backEnd)) ev.push({ t: r.backEnd, teleport: layout.elevator, goal: seatGoal })
      }
    }
    if (role === 'home' && s.to === name) {
      const g = groupOf(all, s)
      if (g[0] !== s) continue // one host event per group
      const end = Math.max(...g.map((o) => o.endT))
      const spot = g.length >= 2 ? meetSpot(layout, [name, ...g.map((o) => o.from)], name) : talkSpots(seat).host
      ev.push({ t: Math.min(...g.map((o) => o.t0)), goal: spot, talk: { role: 'host', partner: g[0].from, step: g[0].step, seed: hash(g[0].from), meeting: g.length >= 2, t0: Math.min(...g.map((o) => o.t0)) } })
      ev.push({ t: end, goal: seatGoal })
    }
    if (role === 'visit' && s.from === name && here(s.to)) {
      const r = rideFor(s)
      if (!r) continue
      const g = groupOf(all, s)
      const tseat = layout.seats[names.indexOf(s.to)]
      const spot = g.length >= 2 ? meetSpot(layout, [s.to, ...g.map((o) => o.from)], name) : talkSpots(tseat, Math.max(0, g.findIndex((o) => o.from === name))).visitor
      ev.push({ t: r.goEnd, teleport: layout.elevator, goal: spot, talk: { role: 'visitor', partner: s.to, step: s.step, seed: hash(name), meeting: g.length >= 2, t0: r.goEnd } })
      if (isFinite(s.endT)) ev.push({ t: s.endT, goal: { ...elev, gone: true } })
    }
  }

  // wandering (home bots only), from the slots that can still matter
  if (role === 'home') {
    for (let k = slot - 2; k <= slot; k++) {
      const trip = tripsFor(floorKey, names, layout, k, data, all)[name]
      if (!trip) continue
      const g0 = { ...trip.poi, kind: trip.poi.kind, poi: true }
      ev.push({ t: trip.depart, goal: g0 })
      if (trip.poi.route) {
        // a stroll: walk on to the next stops, pausing a few seconds at each
        let tcur = trip.depart + walkMs(seat, g0, layout, true)
        let prev = g0
        for (const [x, z] of trip.poi.route) {
          const g = { kind: 'stroll', x, z, az: z, yaw: rnd(name, x, z) - 0.5, poi: true }
          tcur += 3500
          if (tcur > trip.back) break
          ev.push({ t: tcur, goal: g })
          tcur += walkMs({ x: prev.x, z: prev.z, az: prev.az ?? prev.z }, g, layout, false)
          prev = g
        }
      }
      // back early if work comes in
      const h = (data.history || []).find((x) => x.bot === name && x.t > trip.depart && x.t < trip.back && isBusy(x))
      ev.push({ t: h ? h.t : trip.back, goal: seatGoal })
    }
  }
  ev.sort((a, b) => a.t - b.t)
  talkInfo = ev
  evCache.set(key, talkInfo)
  return talkInfo
}

/**
 * Where the bot is and what it is doing at time T.
 * Returns { x, z, yaw, y, moving, hidden, gone, at: goal|null, seated, sitting, talk }
 */
// Paths between events don't depend on the current time, so they are computed once per event list
// and reused every frame (no planning or allocation in the render loop).
const stateCache = new WeakMap()

export function simBot(ctx, T) {
  const { role, seat, layout } = ctx
  const ev = eventsFor(ctx, T)
  let cache = stateCache.get(ev)
  if (!cache || cache.seat !== seat || cache.layout !== layout) {
    cache = {
      seat, layout, states: [{
        pos: seat ? { x: seat.x, z: seat.z } : { x: layout.elevator.x, z: layout.elevator.z },
        atSeat: role === 'home', hidden: role === 'visit', path: null, pathT0: 0,
        goal: role === 'home' && seat ? { kind: 'seat', x: seat.x, z: seat.z, az: seat.az, ex: seat.ex, yaw: 0 } : null,
        talk: null, departT: -Infinity,
      }],
    }
    stateCache.set(ev, cache)
  }
  const evalAt = (st, t) => {
    if (!st.path) return { ...st.pos, done: true, yaw: null }
    const d = ((t - st.pathT0) / 1000) * SPEED
    const L = st.path.len
    if (d >= L) return { x: st.goal.x, z: st.goal.z, done: true, yaw: null, arrivedAt: st.pathT0 + (L / SPEED) * 1000 }
    if (d < 0) return { ...st.pos, done: false, yaw: null, rising: true }
    return { ...pointAt(st.path.pts, d), done: false }
  }
  // how many events have happened by now
  let k = 0
  while (k < ev.length && ev[k].t <= T) k++
  // extend the cached states up to event k
  for (let i = cache.states.length - 1; i < k; i++) {
    const prev = cache.states[i]
    const e = ev[i]
    if (!e.goal) {
      cache.states.push(prev)
      continue
    }
    const cur = evalAt(prev, e.t)
    let pos = { x: cur.x, z: cur.z }
    let atSeat = prev.atSeat || (cur.done && prev.goal && prev.goal.kind === 'seat')
    let hidden = prev.hidden
    if (e.teleport) {
      pos = { x: e.teleport.x, z: e.teleport.z }
      hidden = false
      atSeat = false
    }
    const from = atSeat && seat ? seat : { x: pos.x, z: pos.z, az: pos.z }
    const pts = planPath(from, e.goal, layout)
    cache.states.push({
      pos, atSeat: false, hidden: e.teleport || e.goal.kind !== 'elevator' ? (e.teleport ? false : false) || hidden && e.goal.kind === 'elevator' : hidden,
      path: { pts, len: pathLen(pts) }, pathT0: e.t + (atSeat ? RISE * 1000 : 0), goal: e.goal, talk: e.talk || null, departT: e.t,
    })
  }
  const st = cache.states[k]
  let hidden = st.hidden
  let gone = false
  const goal = st.goal, talk = st.talk, departT = st.departT
  let arrivedT = -Infinity
  const evalPath = (t) => evalAt(st, t)
  const cur = evalPath(T)
  const arrived = cur.done
  if (arrived && cur.arrivedAt) arrivedT = cur.arrivedAt
  if (arrived && goal && goal.hide) {
    hidden = true
    if (goal.gone) gone = true
  }
  const seated = arrived && goal && goal.kind === 'seat'
  // smooth sit down / stand up from the arrival/departure times
  let y = 0
  if (seated) y = SEAT_Y * Math.min(1, (T - arrivedT) / 350 + (arrivedT === -Infinity ? 1 : 0))
  else if (cur.rising) y = SEAT_Y * Math.max(0, 1 - (T - departT) / (RISE * 1000))
  else if (arrived && goal?.sit) y = 0.42 * Math.min(1, (T - arrivedT) / 400)
  return {
    x: cur.x, z: cur.z, y, yaw: cur.yaw, moving: !arrived && !cur.rising,
    hidden, gone, at: arrived ? goal : null, seated, sitting: arrived && !!goal?.sit,
    talk: arrived && talk ? { ...talk, since: arrivedT } : null,
    arrivedT,
  }
}

// ------------------------------------------------------------------ the cat
/** The office cat: which floor it is on and where, as a function of time. */
export function simPet(T, floorIdx, layout, kind = 'cat') {
  // every floor has its own pet now; its walk is still a function of time (same on every screen)
  const PSLOT = 300000
  const slot = Math.floor(T / PSLOT) * 31 + floorIdx
  const spots = [
    ...layout.pois.map((p) => ({ x: p.x + 0.5, z: p.az ?? p.z, az: p.az ?? p.z })),
    ...layout.seats.map((p) => ({ x: p.ex ?? p.x + 0.8, z: p.az, az: p.az })),
  ].filter((p) => Math.abs(p.x) < layout.W / 2 - 0.5 && Math.abs(p.z) < layout.D / 2 - 0.5)
  if (!spots.length) return null
  const LEG = kind === 'dog' ? 18000 : 25000
  const t = T - slot * PSLOT
  const leg = Math.floor(t / LEG)
  const spotAt = (k) => (k < 0 ? { x: layout.elevator.x + 0.9, z: layout.elevator.z, az: layout.elevator.z } : spots[hash(`cat|${slot}|${k}`) % spots.length])
  const a = spotAt(leg - 1), b = spotAt(leg)
  const pts = planPath(a, b, layout)
  const len = pathLen(pts)
  const d = ((t - leg * LEG) / 1000) * (kind === 'dog' ? 1.3 : 0.9)
  const p = pointAt(pts, Math.min(d, len))
  const resting = d >= len
  const mode = resting ? ['sit', 'groom', 'nap'][hash(`cat|${slot}|${leg}|m`) % 3] : 'walk'
  return { x: p.x, z: p.z, yaw: p.yaw, mode }
}
