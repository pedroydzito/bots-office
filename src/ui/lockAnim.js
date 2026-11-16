// Face motion for the lock screen, in the spirit of the Grok avatar engine:
// 9 expressions, short clips (look, squash, spin, blink) and a few morphs,
// combined per status so the same state never loops one identical pose.
// Timings are original. The pose is a pure function of (mode, time) so every
// screen showing the same status moves together.

const Z = { x: 0, y: 0, tilt: 0, spin: 0, sx: 1, sy: 1, open: 1, expr: 'neutral', morph: '' }
const smooth = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
const NUM = ['x', 'y', 'tilt', 'spin', 'sx', 'sy', 'open']

function fr(t, p) {
  return { t, ...Z, ...p }
}

function clip(dur, frames, spinTurns = 0) {
  return { dur, frames, spinTurns }
}

const CLIPS = {
  // glance left, breathe, glance right
  idleB: clip(4.2, [
    fr(0, { expr: 'neutral' }),
    fr(0.7, { sx: 1.06, sy: 0.96, open: 0.08 }),
    fr(0.9, { sx: 1.04, sy: 1.02, open: 1 }),
    fr(1.7, { x: -7, tilt: -8, expr: 'neutral' }),
    fr(2.5, { x: 7, tilt: 8 }),
    fr(3.4, { x: 0, tilt: 0, open: 0.08 }),
    fr(3.6, { open: 1, sx: 1, sy: 1 }),
    fr(4.2, { expr: 'neutral' }),
  ]),
  // up, tilt forward, right, up-right
  idleD: clip(6, [
    fr(0, { expr: 'calm' }),
    fr(1.2, { y: -6, tilt: -4, expr: 'calm' }),
    fr(2.2, { y: -1, tilt: 10, x: 2 }),
    fr(3.4, { x: 8, y: -1, tilt: 6, expr: 'neutral' }),
    fr(4.6, { x: 6, y: -6, tilt: -6, expr: 'surprised' }),
    fr(6, { x: 0, y: 0, tilt: 0, expr: 'neutral' }),
  ]),
  // up-left, down, up-right, full turn
  idleA: clip(6.2, [
    fr(0, { expr: 'neutral' }),
    fr(1.1, { x: -8, y: -5, tilt: -12, expr: 'inspecting' }),
    fr(2.2, { x: 0, y: 5, tilt: 4, expr: 'neutral' }),
    fr(3.3, { x: 8, y: -5, tilt: 10, expr: 'surprised' }),
    fr(4.4, { x: 0, y: 0, tilt: 0, spin: 0, expr: 'happy' }),
    fr(6.2, { spin: 360, expr: 'neutral' }),
  ], 1),
  workScan: clip(2.4, [
    fr(0, { expr: 'squinted', sx: 1.08, sy: 0.94 }),
    fr(0.6, { x: -5, y: 2, tilt: -4, expr: 'squinted' }),
    fr(1.2, { x: 5, y: 2, tilt: 4 }),
    fr(1.8, { x: 0, y: 1, open: 0.1 }),
    fr(2.4, { x: 0, y: 0, open: 0.7, expr: 'squinted' }),
  ]),
  workLean: clip(2.6, [
    fr(0, { expr: 'inspecting', sx: 1.02 }),
    fr(0.8, { y: 3, sx: 1.16, sy: 0.92, expr: 'inspecting' }),
    fr(1.8, { y: 1, sx: 1.08, sy: 1, x: -3 }),
    fr(2.6, { x: 0, y: 0, sx: 1, sy: 1, expr: 'neutral' }),
  ]),
  workAha: clip(2.2, [
    fr(0, { expr: 'squinted' }),
    fr(0.45, { expr: 'surprised', sx: 1.18, sy: 1.12, y: -3 }),
    fr(1.1, { expr: 'happy', sx: 1.08, sy: 0.9, y: 2 }),
    fr(1.6, { expr: 'happy', sx: 0.96, sy: 1.08 }),
    fr(2.2, { expr: 'neutral', sx: 1, sy: 1, y: 0 }),
  ]),
  think: clip(3.2, [
    fr(0, { expr: 'neutral', morph: 'thinking' }),
    fr(0.8, { y: -5, tilt: -8, expr: 'calm', morph: 'thinking' }),
    fr(1.8, { y: -6, x: 3, tilt: 6, expr: 'inspecting', morph: 'thinking' }),
    fr(2.6, { y: -2, x: 0, tilt: 0, open: 0.1, morph: 'thinking' }),
    fr(3.2, { y: 0, open: 1, expr: 'neutral', morph: 'thinking' }),
  ]),
  waitSway: clip(3.4, [
    fr(0, { expr: 'calm', morph: 'orbit' }),
    fr(1.1, { x: -4, tilt: -7, expr: 'calm', morph: 'orbit' }),
    fr(2.2, { x: 4, tilt: 7, morph: 'orbit' }),
    fr(3.4, { x: 0, tilt: 0, expr: 'neutral', morph: 'orbit' }),
  ]),
  waitLook: clip(2.8, [
    fr(0, { expr: 'surprised', sy: 1.06, morph: 'orbit' }),
    fr(1.2, { y: -2, expr: 'calm', morph: 'orbit' }),
    fr(2.8, { y: 0, expr: 'neutral', morph: 'orbit' }),
  ]),
  blockedShake: clip(2.1, [
    fr(0, { expr: 'confused' }),
    fr(0.35, { x: -4, tilt: -10, expr: 'confused' }),
    fr(0.7, { x: 4, tilt: 8 }),
    fr(1.05, { x: -2, tilt: -4 }),
    fr(1.5, { x: 0, tilt: 0, expr: 'sad', sy: 0.92 }),
    fr(2.1, { expr: 'confused', sy: 1 }),
  ]),
  blockedSad: clip(3, [
    fr(0, { expr: 'sad', y: 2, sy: 0.94 }),
    fr(1.4, { y: 4, tilt: 5, expr: 'sad', open: 0.75 }),
    fr(3, { y: 1, tilt: 0, expr: 'sad', open: 1 }),
  ]),
  doneHop: clip(2.2, [
    fr(0, { expr: 'neutral' }),
    fr(0.25, { expr: 'happy', sx: 1.14, sy: 0.86, y: 2 }),
    fr(0.55, { expr: 'happy', sx: 0.94, sy: 1.12, y: -4 }),
    fr(0.9, { expr: 'happy', sx: 1.06, sy: 0.96, y: 1 }),
    fr(1.4, { spin: 0, expr: 'happy' }),
    fr(2.2, { spin: 360, y: 0, sx: 1, sy: 1, expr: 'neutral' }),
  ], 1),
  sleepBreath: clip(4.4, [
    fr(0, { expr: 'sleepy', open: 0.35, sy: 0.96 }),
    fr(2.2, { expr: 'sleepy', open: 0.22, sy: 1.04, y: 1 }),
    fr(4.4, { expr: 'sleepy', open: 0.35, sy: 0.96, y: 0 }),
  ]),
}

const LISTS = {
  idle: ['idleB', 'idleB', 'idleD', 'idleB', 'idleA'],
  working: ['workScan', 'workLean', 'workAha', 'workScan', 'workLean'],
  thinking: ['think', 'think', 'workLean'],
  waiting: ['waitSway', 'waitLook', 'waitSway'],
  error: ['blockedShake', 'blockedSad'],
  done: ['doneHop', 'idleB'],
  resting: ['sleepBreath', 'sleepBreath', 'idleD'],
}

function sample(frames, t) {
  let i = 0
  while (i < frames.length - 1 && frames[i + 1].t <= t) i++
  const a = frames[i]
  const b = frames[Math.min(i + 1, frames.length - 1)]
  const span = b.t - a.t
  const k = span <= 0.001 ? 1 : smooth(Math.min(1, Math.max(0, (t - a.t) / span)))
  const out = { expr: k < 0.55 ? a.expr : b.expr, morph: k < 0.55 ? a.morph : b.morph }
  for (const f of NUM) out[f] = lerp(a[f], b[f], k)
  return out
}

function blink(open, ms) {
  if (open < 0.4) return open
  const p = ms % 4600
  if (p > 150) return open
  const k = p < 75 ? p / 75 : (150 - p) / 75
  return open * (1 - 0.92 * k)
}

/** Pose at `ms` for a lock-screen mode. */
export function poseAt(mode, ms) {
  const names = LISTS[mode] || LISTS.idle
  const seq = names.map((n) => CLIPS[n])
  const total = seq.reduce((s, c) => s + c.dur, 0)
  const loop = Math.floor(ms / 1000 / total)
  let t = (ms / 1000) % total
  let turns = loop * seq.reduce((s, c) => s + c.spinTurns, 0)
  for (const c of seq) {
    if (t <= c.dur) {
      const p = sample(c.frames, t)
      p.spin += turns * 360
      p.open = blink(p.open, ms)
      return p
    }
    t -= c.dur
    turns += c.spinTurns
  }
  return { ...Z }
}

export const EXPRESSIONS = ['neutral', 'happy', 'surprised', 'sad', 'sleepy', 'squinted', 'calm', 'inspecting', 'confused']
