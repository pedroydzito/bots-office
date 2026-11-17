// A small 2D face engine for the lock screen, modelled on how the Grok Bot avatar animates:
// - clips: short keyframed animations with tracks (position, rotation [pitch, yaw, roll], scale,
//   squash, lids, expression) and a cubic-bezier ease per keyframe
// - expressions: eye shapes (vertical capsules, arcs, lines) that the eyes morph between
// - states: a shuffled playlist of clips plus an optional face held for the whole state
// The eyes sit on an invisible sphere (the background is the body) and are projected orthographically,
// so turning the head slides and foreshortens them and a full spin carries them round the back.
import CLIPS from './faceClips.json'

// ---- expressions: each eye = quadratic curve p0 -> p1 -> p2 stroked with round caps (half-width `w`)
function capsule(w, h, tilt = 0, dx = 0) {
  const l = Math.max(0, (h - w) / 2), a = (tilt * Math.PI) / 180
  const s = Math.sin(a) * l, c = Math.cos(a) * l
  return { off: [dx, 0], w: w / 2, p: [[-s, -c], [0, 0], [s, c]] }
}
const curve = (off, w, p0, p1, p2) => ({ off, w, p: [p0, p1, p2] })
const pair = (e) => [e, e]
export const EXPRESSIONS = {
  neutral: pair(capsule(0.26, 0.57)),
  happy: pair(curve([0.03, 0.03], 0.1305, [0.16, -0.04], [0, 0.2], [-0.16, -0.04])),
  surprised: pair(capsule(0.42, 0.86, 0, 0.03)),
  inspecting: [capsule(0.54, 0.54, 0, 0.04), capsule(0.27, 0.27, 0, 0.04)],
  sad: pair(capsule(0.26, 0.5, -28, -0.05)),
  sleepy: pair(curve([0.01, 0], 0.13, [-0.11, 0.025], [0, -0.075], [0.11, 0.025])),
  squinted: pair(capsule(0.26, 0.5, 90, 0.01)),
  calm: pair(curve([0.05, 0], 0.125, [-0.2, 0], [0, -0.06], [0.2, 0])),
  confused: pair(curve([-0.1, 0], 0.1305, [0.01, 0.16], [-0.17, 0], [0.01, -0.16])),
}

// ---- states (which clips play, which face holds)
const WORK = ['Working_A', 'Working_B', 'Working_C', 'Working_D', 'Working_E', 'Working_F']
export const STATES = {
  idle: { clips: ['Idle_B', 'Idle_B', 'Idle_D', 'Idle_B', 'Idle_A'] },
  // the lock screen sits idle for long stretches: now and then it does something livelier
  idleExtra: { clips: ['Bodymoves_A', 'Rotation_A', 'Logo_A', 'Logo_B', 'Marketing_A', 'Marketing_B', 'Marketing_C', 'Marketing_D', 'Rotation_C'] },
  bored: { clips: ['Idle_B'], face: 'sleepy' },
  listening: { clips: ['Idle_D'], face: 'calm' },
  curious: { clips: ['Working_B'], face: 'inspecting' },
  working: { clips: WORK },
  streaming: { clips: ['Streaming_A', 'Streaming_B', 'Streaming_C'] },
  finished: { clips: ['Done_B', 'Done_A'], face: 'happy' },
  excited: { clips: ['Done_C'] },
  approving: { clips: ['Rotation_C'] },
  celebrate: { clips: ['Rotation_A'], face: 'happy' },
  waiting: { clips: ['Idle_D'], face: 'surprised' },
  blocked: { clips: ['Blocked_A', 'Blocked_B'] },
  thinking: { clips: ['Idle_B'] },
  sad: { clips: ['Blocked_B'] },
  drowsy: { clips: ['Blocked_C'] },
  suspicious: { clips: ['Idle_D'], face: 'squinted' },
  playful: { clips: ['Bodymoves_A'] },
}

// ---- easing / interpolation
function bezier([x1, y1, x2, y2], x) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  let t = x
  for (let i = 0; i < 6; i++) {
    const f = ((ax * t + bx) * t + cx) * t - x, d = (3 * ax * t + 2 * bx) * t + cx
    if (Math.abs(f) < 1e-4 || Math.abs(d) < 1e-6) break
    t = Math.min(1, Math.max(0, t - f / d))
  }
  return ((ay * t + by) * t + cy) * t
}
function sample(keys, t) {
  if (!keys || !keys.length) return null
  if (t <= keys[0][0]) return keys[0][1]
  const last = keys[keys.length - 1]
  if (t >= last[0]) return last[1]
  let i = 0
  while (i < keys.length - 2 && keys[i + 1][0] <= t) i++
  const [t0, a, e] = keys[i], [t1, b] = keys[i + 1]
  const k = bezier(e || [0.42, 0, 0.58, 1], (t - t0) / Math.max(t1 - t0, 1e-6))
  return a.map((v, j) => v + (b[j] - v) * k)
}
const lerp = (a, b, k) => a + (b - a) * k
function mixEye(a, b, k) {
  return { off: [lerp(a.off[0], b.off[0], k), lerp(a.off[1], b.off[1], k)], w: lerp(a.w, b.w, k), p: a.p.map((q, i) => [lerp(q[0], b.p[i][0], k), lerp(q[1], b.p[i][1], k)]) }
}
const shuffle = (a) => {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

const BLINK = 0.22 // s, close + open
const MORPH = 0.28 // s, expression change
const REST = [-30, 36, 0] // resting 3/4 view: looking a bit up and to the right, which leans the eyes like the app icon
const GAP = 0.5, SHIFT_Y = 0.06, SIZE = 1.45

export function createFace() {
  let state = 'idle', queue = [], clip = null, clipT = 0, once = null
  let face = null // expression forced by the state
  let expr = 'neutral', from = EXPRESSIONS.neutral, fromT = 99, blinkT = 99
  let lastExprKey = null

  const next = () => {
    if (once) return (clip = CLIPS[once.shift()], once.length || (once = null), clip)
    if (!queue.length) queue = shuffle(STATES[state].clips)
    return CLIPS[queue.shift()]
  }
  const setExpr = (name) => {
    if (name === 'blink') return void (blinkT = 0)
    if (!EXPRESSIONS[name] || name === expr) return
    from = current()
    expr = name
    fromT = 0
  }
  const current = () => {
    const to = EXPRESSIONS[expr]
    const k = Math.min(1, fromT / MORPH)
    return k >= 1 ? to : to.map((e, i) => mixEye(from[i], e, k * k * (3 - 2 * k)))
  }

  return {
    /** switch the playlist; `face` overrides expressions from the clips */
    set(s) {
      if (s === state || !STATES[s]) return
      state = s
      queue = []
      face = STATES[s].face || null
      if (face) setExpr(face)
      else setExpr('neutral')
      clip = null
    },
    /** play these clips once, then return to the state's playlist */
    play(...names) {
      once = names.filter((n) => CLIPS[n])
      clip = null
    },
    get state() {
      return state
    },
    /** advance by dt seconds and return the pose to draw */
    tick(dt) {
      dt = Math.min(dt, 0.25)
      fromT += dt
      blinkT += dt
      if (!clip) (clip = next()), (clipT = 0), (lastExprKey = null)
      clipT += dt
      if (clipT > clip.d) {
        clip = next()
        clipT = 0
        lastExprKey = null
      }
      const tr = clip.tr
      // expression track: step events (the latest one passed)
      const ex = tr.expression
      if (ex) {
        let k = null
        for (let i = 0; i < ex.length; i++) if (ex[i][0] <= clipT) k = i
        if (k != null && k !== lastExprKey) {
          lastExprKey = k
          const v = ex[k][1]
          if (v === 'blink') setExpr('blink')
          else if (!face) setExpr(v)
        }
      }
      const rot = sample(tr.rotation, clipT) || [0, 0, 0]
      const pos = sample(tr.position, clipT) || [0, 0]
      const zoom = (sample(tr.scale, clipT) || [0.6])[0]
      const sq = sample(tr.squash, clipT) || [1, 1]
      let lids = (sample(tr.lids, clipT) || [0])[0]
      if (blinkT < BLINK) lids = Math.max(lids, Math.sin((Math.PI * blinkT) / BLINK))
      return { rot, pos, zoom: Math.min(1.2, zoom / 0.6), sq, lids: Math.min(1, Math.max(0, lids)), eyes: current() }
    },
  }
}

// ---- projection
function rotate([x, y, z], [p, yw, r]) {
  const a = (p * Math.PI) / 180, b = (yw * Math.PI) / 180, c = (r * Math.PI) / 180
  // pitch (x axis; negative looks up), then yaw (y axis; positive turns right), then roll
  let y1 = y * Math.cos(a) + z * Math.sin(a), z1 = -y * Math.sin(a) + z * Math.cos(a)
  let x2 = x * Math.cos(b) + z1 * Math.sin(b), z2 = -x * Math.sin(b) + z1 * Math.cos(b)
  return [x2 * Math.cos(c) - y1 * Math.sin(c), x2 * Math.sin(c) + y1 * Math.cos(c), z2]
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

/** SVG paths (in a -1..1, y-up space) for the two eyes, plus per-eye stroke widths and opacity */
export function project(pose) {
  const rot = add(pose.rot, REST)
  // the body is the whole screen, so the face drifts only a little: keep most of the head turn as
  // foreshortening and lean of the eyes rather than travel across the screen
  const mid = rotate([0, SHIFT_Y, 1], rot)
  return pose.eyes.map((eye, i) => {
    const side = i ? 1 : -1
    const cx = side * GAP * 0.5 + eye.off[0], cy = SHIFT_Y + eye.off[1]
    const cz = Math.sqrt(Math.max(0.05, 1 - cx * cx - cy * cy))
    const open = Math.max(0.04, 1 - pose.lids)
    const pts = []
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, u = 1 - t
      const qx = u * u * eye.p[0][0] + 2 * u * t * eye.p[1][0] + t * t * eye.p[2][0]
      const qy = (u * u * eye.p[0][1] + 2 * u * t * eye.p[1][1] + t * t * eye.p[2][1]) * open
      const v = rotate([cx + qx, cy + qy, cz], rot)
      pts.push([(v[0] - mid[0] * 0.7) * pose.sq[0] * pose.zoom * SIZE + pose.pos[0] * 1.5, (v[1] - mid[1] * 0.7 - SHIFT_Y) * pose.sq[1] * pose.zoom * SIZE + pose.pos[1] * 1.5 + 0.12])
    }
    const n = rotate([cx, cy, cz], rot)[2]
    // lids squeeze thin shapes too: a closed eye is a short flat line
    const w = eye.w * pose.zoom * SIZE * (0.55 + 0.45 * open) * (0.6 + 0.4 * Math.max(0, n))
    const d = 'M' + pts.map((q) => `${q[0].toFixed(4)} ${(-q[1]).toFixed(4)}`).join('L')
    return { d, w, visible: Math.max(0, Math.min(1, n * 6)) }
  })
}
