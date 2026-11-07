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
  // Elevator sits near the back-left corner, so it lines up with the building's
  // shaft on every floor (rooms are anchored to the building's back-left corner).
  // glass elevator shaft inside the room's back-left corner; bots step inside to ride
  const elevator = { kind: 'elevator', x: -W / 2 + 0.8, z: -D / 2 + 2.3, az: -D / 2 + 2.3, yaw: -Math.PI / 2 }
  const coolerZ = -D / 2 + 4.0
  const midStart = coolerZ + 1.0
  const midEnd = D / 2 - 1.5
  const mid = midEnd - midStart
  return {
    elevator,
    coolerZ,
    shelfZ: mid > 2.0 ? (midStart + midEnd) / 2 + (mid > 4 ? 0.9 : 0) : null,
    stickyZ: mid > 4 ? midStart + 0.9 : null,
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
  decor.push({ type: 'board', x: -W / 2 + 0.27, z: lw.stickyZ ?? lw.coolerZ + 1.6 }) // "waiting on me" cork board
  const pois = [
    { kind: 'coffee', x: -W / 2 + 3.0, z: -D / 2 + 1.25, yaw: Math.PI },
    { kind: 'cooler', x: -W / 2 + 1.45, z: lw.coolerZ, yaw: -Math.PI / 2 },
    { kind: 'view', x: x0 + 0.4, z: D / 2 - 1.1, yaw: 0 },
    { kind: 'view', x: x0 + 1.9, z: D / 2 - 1.1, yaw: 0.3 },
    // sofa seats in the lounge (lounge centre: W/2-2.4, D/2-2.3)
    { kind: 'sofa', x: W / 2 - 2.75, z: D / 2 - 3.05, az: D / 2 - 2.5, yaw: 0, sit: true },
    { kind: 'sofa', x: W / 2 - 1.55, z: D / 2 - 3.05, az: D / 2 - 2.5, yaw: 0, sit: true },
    { kind: 'plant', x: W / 2 - 1.85, z: -D / 2 + 1.5, yaw: Math.PI / 2 },
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
