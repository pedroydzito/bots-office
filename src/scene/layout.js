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

function leftWall(W, D) {
  // glass elevator shaft inside the room's back-left corner; bots step inside to ride
  const elevator = { kind: 'elevator', x: -W / 2 + 0.8, z: -D / 2 + 2.3, az: -D / 2 + 2.3, yaw: -Math.PI / 2 }
  // Everything else on this wall is spread evenly along its free length (after the elevator),
  // so the wall is never crowded at one end and empty at the other.
  const a = -D / 2 + 3.4, b = D / 2 - 1.3
  const items = [['cooler', 0.6], ['board', 1.8], ['shelf', 1.7], ['vending', 0.9]]
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
export function floorLayout(n, W, D) {
  const cols = colsFor(n)
  const rowsN = Math.ceil(Math.max(n, 1) / cols)
  const deskW = (cols - 1) * SX + 1.76
  const x0 = -W / 2 + LEFT + 0.88
  const z0 = -D / 2 + BACK
  const seats = []
  const rows = []
  for (let r = 0; r < rowsN; r++) {
    const cnt = Math.min(cols, n - r * cols)
    if (cnt <= 0) break
    const z = z0 + r * SZ
    rows.push({ z, x1: x0 - 0.88, x2: x0 + (cols - 1) * SX + 0.88, aisle: z - 1.1 })
    // ex: side lane between chairs, so bots step out sideways instead of walking through the chair back
    for (let c = 0; c < cnt; c++) seats.push({ x: x0 + c * SX, z, az: z - 1.1, ex: x0 + c * SX + SX / 2, row: r })
  }
  const xL = -W / 2 + 3.05
  const lw = leftWall(W, D)
  const blockEnd = x0 + (cols - 1) * SX + 0.88
  const deskFront = z0 + (rows.length - 1) * SZ + 1.3
  const decor = []
  // rug under the desks
  decor.push({ type: 'rug', x: (x0 - 1.4 + blockEnd + 1.0) / 2, z: (z0 - 1.7 + deskFront + 0.5) / 2, w: blockEnd + 1.0 - (x0 - 1.4), d: deskFront + 0.5 - (z0 - 1.7), color: '#e9e4f5' })
  // meeting corner on the right if there is room, otherwise a huddle spot by the windows
  const rx1 = blockEnd + 1.4, rx2 = W / 2 - 0.7
  let meet = { x: x0 + 1.3, z: D / 2 - 2.0 }
  if (rx2 - rx1 >= 3.4) {
    meet = { x: (rx1 + rx2) / 2, z: z0 + 0.6 }
    decor.push({ type: 'meeting', x: meet.x, z: meet.z })
    decor.push({ type: 'whiteboard', x: meet.x, z: -D / 2 + 0.32 })
    decor.push({ type: 'plant', x: rx2 - 0.2, z: meet.z + 2.6, k: 0 })
  }
  // extra front space: a cosy corner with bean bags and plants
  const frontFree = D / 2 - deskFront
  if (frontFree > 6.2) {
    const cz = deskFront + (frontFree - 3.5) / 2
    decor.push({ type: 'rug', x: x0 + 1.2, z: cz, w: 3.4, d: 2.6, color: '#f1e7d8', round: true })
    decor.push({ type: 'beanbag', x: x0 + 0.4, z: cz - 0.3, c: '#8F59F9' })
    decor.push({ type: 'beanbag', x: x0 + 2.0, z: cz + 0.3, c: '#F5B70A' })
    decor.push({ type: 'plant', x: x0 + 3.3, z: cz - 0.8, k: 1 })
  }
  if (rx2 - rx1 >= 1.6) decor.push({ type: 'plant', x: W / 2 - 0.9, z: (deskFront + D / 2 - 4.6) / 2, k: 0 })
  // --- more furniture for the open space, each with something bots can do there
  const extraPois = []
  // snack machine against the left wall, near the front
  decor.push({ type: 'vending', x: -W / 2 + 0.55, z: lw.vendingZ })
  extraPois.push({ kind: 'vending', x: -W / 2 + 1.6, z: lw.vendingZ, yaw: -Math.PI / 2 })
  // printer under the TV
  decor.push({ type: 'printer', x: W / 2 - 3.7, z: -D / 2 + 0.6 })
  extraPois.push({ kind: 'printer', x: W / 2 - 3.7, z: -D / 2 + 1.5, yaw: Math.PI })
  // arcade cabinet on the right, between the meeting corner and the lounge
  const az1 = z0 + (rx2 - rx1 >= 3.4 ? 2.8 : 0.4), az2 = D / 2 - 4.9
  if (W / 2 - blockEnd > 2.6 && az2 - az1 > 1.2) {
    const z = (az1 + az2) / 2
    decor.push({ type: 'arcade', x: W / 2 - 0.9, z })
    decor.push({ type: 'lamp', x: W / 2 - 0.8, z: z + 1.3 })
    extraPois.push({ kind: 'arcade', x: W / 2 - 1.9, z, yaw: Math.PI / 2 })
  }
  // armchairs by the windows, between the phone spot and the lounge
  const ax = x0 + 4.6
  if (W / 2 - 4.7 - ax > 1.8) {
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
  const blockCx = x0 + ((cols - 1) * SX) / 2
  const blockCz = z0 + ((rows.length - 1) * SZ) / 2
  return {
    W, D, seats, rows, xL, cols, x0, z0, decor, meet,
    pois: pois.map((p) => ({ ...p, az: p.az ?? p.z })),
    elevator: lw.elevator,
    wall: lw,
    // frame the bots (not the whole room), nudged back so the wall title shows
    focus: { x: blockCx + 0.3, z: blockCz - 0.9 },
    dist: viewDistance(deskW + 3, rows.length * SZ + 3),
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
