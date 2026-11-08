// Floor plan maths. Coordinates are local to a floor: x right, z toward the
// camera, y up. Back wall at z=-D/2, left wall at x=-W/2 (with the elevator).
// Each room is sized to its own number of bots.
export const SX = 1.75 // seat spacing in a row
export const SZ = 2.9 // row spacing
export const FLOOR_H = 3.8 // storey height
export const SEAT_Y = 0.5

const LEFT = 4.0 // wall + elevator + corridor
const RIGHT = 1.9
const BACK = 3.4 // back wall + coffee lane
const FRONT = 4.4 // lounge / window lane

export function colsFor(n) {
  return n <= 4 ? Math.max(n, 1) : n <= 6 ? 3 : 4
}

function viewDistance(w, d) {
  return Math.min(22, Math.max(12, 4 + Math.max(w, d) * 1.25))
}

function leftWall(W, D, v = 0) {
  // glass elevator shaft inside the room's back-left corner; bots step inside to ride
  const elevator = { kind: 'elevator', x: -W / 2 + 0.95, z: -D / 2 + 2.3, az: -D / 2 + 2.3, yaw: -Math.PI / 2 }
  // Everything else on this wall is spread evenly along its free length (after the elevator),
  // so the wall is never crowded at one end and empty at the other.
  const a = -D / 2 + 3.4, b = D / 2 - 1.3
  const base = [['cooler', 0.6], ['board', 1.8], ['shelf', 1.7], ['vending', 0.9]]
  const ORDERS = [[0, 1, 2, 3], [2, 1, 0, 3], [0, 2, 1, 3], [3, 1, 2, 0], [1, 0, 3, 2], [2, 3, 1, 0]]
  const items = ORDERS[(v >>> 18) % ORDERS.length].map((i) => base[i])
  const total = items.reduce((s, [, w]) => s + w, 0)
  const gap = Math.max(0.3, (b - a - total) / (items.length + 1))
  const z = {}
  const art = []
  let cur = a + gap
  for (const [k, w] of items) {
    z[k] = cur + w / 2
    cur += w + gap
    // a framed picture in the middle of each wide gap
    if (gap > 1.3 && cur - gap / 2 < b - 0.5) art.push(cur - gap / 2)
  }
  return {
    elevator,
    coolerZ: z.cooler,
    boardZ: z.board,
    shelfZ: z.shelf,
    vendingZ: z.vending,
    stickyZ: z.board + 0.4, // kept for older callers
    artZ: art,
  }
}

/** The room size a team of n bots needs on its own (the building uses the largest one). */
export function naturalSize(n) {
  const cols = colsFor(n)
  const rowsN = Math.ceil(Math.max(n, 1) / cols)
  const deskW = (cols - 1) * SX + 1.76
  return { W: Math.max(11.5, LEFT + deskW + RIGHT), D: Math.max(9.6, BACK + (rowsN - 1) * SZ + 1.3 + FRONT) }
}

/**
 * Every storey has the building's full size (W x D). Desks sit near the back-left; the free space
 * is filled with decor (rugs, a meeting corner, bean bags...). The camera frames the desks.
 */
/** Team leads (director, manager, head...) get their own desk by the highlights board. */
const RUGS = ['#e9e4f5', '#e4eef0', '#f1e7d8', '#e8efe2', '#f3e3e6', '#e2e8f3']

export const LEAD_RE = /\b(diretor|diretora|director|gestor|gestora|gerente|head|chefe|lead|coordenador|coordenadora|ceo|cmo|cto|coo|cfo)\b/i

const strHash = (str) => {
  let h = 2166136261
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h
}

export function floorLayout(nAll, W, D, { lead = false, furniture = true, seed = '' } = {}) {
  const n = lead ? nAll - 1 : nAll
  // every floor gets its own personality (same on every screen): corner type, rug colours, games...
  const v = strHash(seed)
  let cols = colsFor(n)
  // a small team in a deep room: a 2-column grid so desks can spread out with their own setups
  if (n >= 3 && n <= 4 && D - BACK - FRONT > 5.5) cols = 2
  const rowsN = Math.ceil(Math.max(n, 1) / cols)
  // a big room with a small team: give everyone more room instead of packing them together
  // keep space for the meeting corner on the right, unless the team is small: then spread out
  const roomForDesks = W - LEFT - RIGHT - (n <= 4 ? 2.4 : 5.2)
  const sx = cols > 1 ? Math.min(2.7, Math.max(SX, (roomForDesks - 1.76) / (cols - 1))) : SX
  const roomForRows = D - BACK - FRONT - 2.4
  const sz = rowsN > 1 ? Math.min(3.8, Math.max(SZ, roomForRows / (rowsN - 1))) : SZ
  const deskW = (cols - 1) * sx + 1.76
  let x0 = -W / 2 + LEFT + 0.88
  let z0 = -D / 2 + BACK
  {
    const dx = ((v >>> 13) % 3) * 0.9
    if (x0 + dx + deskW < W / 2 - 3.2) x0 += dx
    const dz = (v >>> 15) % 2 ? 0.9 : 0
    if (D / 2 - (z0 + dz + (rowsN - 1) * sz + 1.3) > 4.8) z0 += dz
  }
  const seats = []
  const rows = []
  const own = cols > 1 ? sx >= 2.2 : n <= 2
  for (let r = 0; r < rowsN; r++) {
    const cnt = Math.min(cols, n - r * cols)
    if (cnt <= 0) break
    const z = z0 + r * sz
    // spread out: each bot gets its own desk instead of one long shared desk
    if (own) for (let c = 0; c < cnt; c++) rows.push({ z, x1: x0 + c * sx - 0.88, x2: x0 + c * sx + 0.88, aisle: z - 1.1, solo: true })
    else rows.push({ z, x1: x0 - 0.88, x2: x0 + (cols - 1) * sx + 0.88, aisle: z - 1.1 })
    // ex: side lane between chairs, so bots step out sideways instead of walking through the chair back
    for (let c = 0; c < cnt; c++) seats.push({ x: x0 + c * sx, z, az: z - 1.1, ex: x0 + c * sx + sx / 2, row: r })
  }
  const lw0 = leftWall(W, D, v)
  let leadRow = null
  if (lead) {
    // the lead sits beside the "Destaques de hoje" board, facing the team, own desk
    const x = -W / 2 + 1.8, z = lw0.boardZ - 0.5
    seats.unshift({ x, z, az: z - 0.9, row: -1, lead: true })
    leadRow = { z, x1: x - 0.8, x2: x + 0.8, aisle: z - 0.9, solo: true, lead: true }
  }
  const xL = -W / 2 + 3.05
  const lw = leftWall(W, D, v)
  const blockEnd = x0 + (cols - 1) * sx + 0.88
  const deskFront = z0 + (rowsN - 1) * sz + 1.3
  const decor = []
  // rug under the desks
  if (!own) decor.push({ type: 'rug', x: (x0 - 1.4 + blockEnd + 1.0) / 2, z: (z0 - 1.7 + deskFront + 0.5) / 2, w: blockEnd + 1.0 - (x0 - 1.4), d: deskFront + 0.5 - (z0 - 1.7), color: RUGS[v % RUGS.length] })
  // meeting corner on the right if there is room, otherwise a huddle spot by the windows
  const rx1 = blockEnd + 1.4, rx2 = W / 2 - 0.7
  let meet = { x: x0 + 1.3, z: D / 2 - 2.0 }
  if (rx2 - rx1 >= 3.4) {
    meet = { x: (rx1 + rx2) / 2, z: (v >>> 16) % 2 && D / 2 - z0 > 7 ? z0 + 2.2 : z0 + 0.6 }
    decor.push({ type: 'meeting', x: meet.x, z: meet.z })
    decor.push({ type: 'whiteboard', x: meet.x, z: -D / 2 + 0.32 })
    decor.push({ type: 'plant', x: rx2 - 0.2, z: meet.z + 2.6, k: 0 })
  }
  // extra front space: a cosy corner with bean bags and plants
  const extraPois = []
  const frontFree = D / 2 - deskFront
  if (furniture && frontFree > 6.2) {
    const cz = deskFront + (frontFree - 3.5) / 2
    const kind = (v >>> 3) % 4
    if (kind === 0) {
      // bean bags around a round rug
      decor.push({ type: 'rug', x: x0 + 1.2, z: cz, w: 3.4, d: 2.6, color: RUGS[(v >>> 5) % RUGS.length], round: true })
      decor.push({ type: 'beanbag', x: x0 + 0.4, z: cz - 0.3, c: '#8F59F9' })
      decor.push({ type: 'beanbag', x: x0 + 2.0, z: cz + 0.3, c: '#F5B70A' })
      decor.push({ type: 'plant', x: x0 + 3.3, z: cz - 0.8, k: 1 })
    } else if (kind === 1) {
      // ping-pong table
      decor.push({ type: 'pingpong', x: x0 + 1.4, z: cz })
      extraPois.push({ kind: 'arcade', x: x0 + 1.4 - 1.75, z: cz, yaw: Math.PI / 2 })
      decor.push({ type: 'plant', x: x0 + 3.6, z: cz + 0.9, k: 0 })
    } else if (kind === 2) {
      // reading nook: two armchairs, a bookshelf and a lamp
      decor.push({ type: 'rug', x: x0 + 1.4, z: cz, w: 3.2, d: 2.2, color: RUGS[(v >>> 6) % RUGS.length], round: false })
      decor.push({ type: 'armchair', x: x0 + 0.6, z: cz + 0.2, c: '#d9c7b0' })
      decor.push({ type: 'armchair', x: x0 + 2.1, z: cz + 0.2, c: '#b9cbe0' })
      decor.push({ type: 'lamp', x: x0 + 2.9, z: cz - 0.2 })
      extraPois.push({ kind: 'armchair', x: x0 + 0.6, z: cz + 0.2, az: cz - 0.8, yaw: 0, sit: true })
    } else {
      // little indoor garden with a bench
      decor.push({ type: 'bench', x: x0 + 1.4, z: cz + 0.2 })
      for (let i = 0; i < 4; i++) decor.push({ type: 'plant', x: x0 - 0.2 + i * 1.1, z: cz - 0.9 + (i % 2) * 0.25, k: (i + v) % 2 })
      extraPois.push({ kind: 'sofa', x: x0 + 1.4, z: cz + 0.2, az: cz + 1.0, yaw: Math.PI, sit: true })
    }
  }
  if (rx2 - rx1 >= 1.6) decor.push({ type: 'plant', x: W / 2 - 0.9, z: (deskFront + D / 2 - 4.6) / 2, k: 0 })
  // --- more furniture for the open space, each with something bots can do there
  // snack machine against the left wall, near the front
  if (furniture) {
    decor.push({ type: 'vending', x: -W / 2 + 0.55, z: lw.vendingZ })
    extraPois.push({ kind: 'vending', x: -W / 2 + 1.6, z: lw.vendingZ, yaw: -Math.PI / 2 })
  }
  // back wall: TV and the art/shelf group trade places on some floors; some floors use plants instead of art
  const artMid = (-W / 2 + 7.0 + W / 2 - 3.8) / 2
  let bw = (v >>> 20) % 3
  if (bw === 1 && meet.x > artMid - 1) bw = 0 // the meeting whiteboard already sits on the right
  const tvX = bw === 1 ? artMid + 0.3 : W / 2 - 2.5
  const artX = bw === 1 ? W / 2 - 2.6 : artMid
  const artKind = bw === 2 ? 'plants' : 'art'
  // printer under the TV
  decor.push({ type: 'printer', x: tvX - 1.2, z: -D / 2 + 0.6 })
  extraPois.push({ kind: 'printer', x: tvX - 1.2, z: -D / 2 + 1.5, yaw: Math.PI })
  // arcade cabinet on the right, between the meeting corner and the lounge
  const az1 = z0 + (rx2 - rx1 >= 3.4 ? 2.8 : 0.4), az2 = D / 2 - 4.9
  if (furniture && W / 2 - blockEnd > 2.6 && az2 - az1 > 1.2) {
    const z = (az1 + az2) / 2
    decor.push({ type: (v >>> 8) % 2 ? 'foosball' : 'arcade', x: W / 2 - 0.9, z })
    decor.push({ type: 'lamp', x: W / 2 - 0.8, z: z + 1.3 })
    extraPois.push({ kind: 'arcade', x: W / 2 - 1.9, z, yaw: Math.PI / 2 })
  }
  // armchairs by the windows, between the phone spot and the lounge
  const ax = x0 + 4.6
  if (furniture && W / 2 - 4.7 - ax > 1.8) {
    decor.push({ type: 'rug', x: ax + 0.6, z: D / 2 - 1.9, w: 2.6, d: 1.6, color: '#e7eef6', round: true })
    decor.push({ type: 'armchair', x: ax, z: D / 2 - 1.9, c: '#c9d4e3' })
    decor.push({ type: 'armchair', x: ax + 1.25, z: D / 2 - 1.9, c: '#e8cfc4' })
    decor.push({ type: 'lamp', x: ax + 2.2, z: D / 2 - 2.3 })
    extraPois.push({ kind: 'armchair', x: ax, z: D / 2 - 1.9, az: D / 2 - 2.9, yaw: 0, sit: true })
    extraPois.push({ kind: 'armchair', x: ax + 1.25, z: D / 2 - 1.9, az: D / 2 - 2.9, yaw: 0, sit: true })
  }
  // plants to soften corners
  decor.push({ type: 'plant', x: W / 2 - 0.8, z: D / 2 - 4.5, k: 1 })
  const pois = [
    { kind: 'coffee', x: -W / 2 + 3.0, z: -D / 2 + 1.25, yaw: Math.PI },
    { kind: 'cooler', x: -W / 2 + 1.45, z: lw.coolerZ, yaw: -Math.PI / 2 },
    { kind: 'view', x: x0 + 0.4, z: D / 2 - 1.1, yaw: 0 },
    { kind: 'view', x: x0 + 1.9, z: D / 2 - 1.1, yaw: 0.3 },
    // sofa seats in the lounge (lounge centre: W/2-2.4, D/2-2.3)
    { kind: 'sofa', x: W / 2 - 2.75, z: D / 2 - 3.05, az: D / 2 - 2.5, yaw: 0, sit: true },
    { kind: 'sofa', x: W / 2 - 1.55, z: D / 2 - 3.05, az: D / 2 - 2.5, yaw: 0, sit: true },
    { kind: 'plant', x: W / 2 - 1.85, z: -D / 2 + 1.5, yaw: Math.PI / 2 },
    { kind: 'phone', x: x0 + 3.3, z: D / 2 - 1.6, yaw: 0.2 },
    // a stroll along the windows with a few stops
    { kind: 'stroll', x: x0 + 0.4, z: D / 2 - 1.5, yaw: 0, route: [[x0 + 2.4, D / 2 - 1.5], [x0 + 0.9, D / 2 - 1.3]] },
    ...extraPois,
  ]
  if (lw.shelfZ != null) pois.push({ kind: 'books', x: -W / 2 + 1.45, z: lw.shelfZ, yaw: -Math.PI / 2 })
  const flip = (v >>> 12) % 2 === 1
  let lounge = { x: W / 2 - 2.4, z: D / 2 - 2.3 }
  if (flip) {
    const xa = x0 - 0.9, xb = W / 2 - 0.5
    const mx = (x) => xa + xb - x
    const front = deskFront + 0.6
    for (const d of decor) if (d.z >= front && d.x > xa - 0.1) d.x = mx(d.x)
    const shift = mx(lounge.x) - lounge.x
    for (const p of pois) {
      if (p.z < front || p.x < xa - 0.1) continue
      // sofa seats move with the sofa (the sofa itself isn't mirrored)
      if (p.kind === 'sofa') {
        p.x += shift
        continue
      }
      p.x = mx(p.x)
      if (p.yaw != null && p.kind !== 'sofa' && p.kind !== 'armchair') p.yaw = -p.yaw
      if (p.route) p.route = p.route.map(([x, z]) => [mx(x), z])
    }
    lounge = { x: mx(lounge.x), z: lounge.z }
  }
  const blockCx = x0 + ((cols - 1) * sx) / 2
  const blockCz = z0 + ((rowsN - 1) * sz) / 2
  return {
    own, variant: v, lounge, tvX, artX, artKind,
    W, D, seats, rows: leadRow ? [...rows, leadRow] : rows, xL, cols, x0, z0, decor, meet,
    pois: pois.map((p) => ({ ...p, az: p.az ?? p.z })),
    elevator: lw.elevator,
    wall: lw,
    // frame the bots (not the whole room), nudged back so the wall title shows
    focus: { x: blockCx + 0.3, z: blockCz - 0.9 },
    dist: viewDistance(deskW + 3, rowsN * sz + 3),
  }
}

export function cortexLayout(W = 13, D = 12) {
  const lw = leftWall(W, D)
  return {
    W, D, seats: [], rows: [], xL: -W / 2 + 3.05, cols: 0, decor: [], meet: { x: 0, z: 0 },
    pois: [], elevator: lw.elevator, wall: lw,
    focus: { x: 0, z: -0.8 },
    dist: 16,
  }
}

/** Polyline through the lanes: own lane -> left corridor -> target lane. */
export function planPath(a, b, L) {
  const pts = [[a.x, a.z]]
  if (a.ex != null) pts.push([a.ex, a.z], [a.ex, a.az])
  else pts.push([a.x, a.az])
  if (Math.abs(a.az - b.az) > 0.01) pts.push([L.xL, a.az], [L.xL, b.az])
  if (b.ex != null) pts.push([b.ex, b.az], [b.ex, b.z])
  else pts.push([b.x, b.az])
  pts.push([b.x, b.z])
  const out = [pts[0]]
  for (const p of pts.slice(1)) {
    const q = out[out.length - 1]
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01) out.push(p)
  }
  return out
}

export function talkSpots(seat, k = 0) {
  return {
    host: { kind: 'spot', x: seat.x - 0.42, z: seat.az, az: seat.az, yaw: Math.PI / 2 },
    visitor: { kind: 'spot', x: seat.x + 0.42 + k * 0.72, z: seat.az, az: seat.az, yaw: -Math.PI / 2 },
  }
}

/** vertical gap between storeys in the overview (exploded) mode */
export const OVERVIEW_GAP = 2.8
