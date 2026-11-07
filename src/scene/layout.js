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
  return Math.min(22, Math.max(13, 5 + Math.max(w, d) * 1.3))
}

function leftWall(W, D) {
  const elevator = { kind: 'elevator', x: -W / 2 + 0.55, z: D / 2 - 2.3, az: D / 2 - 2.3, yaw: -Math.PI / 2 }
  const coolerZ = -D / 2 + 2.7
  const midStart = coolerZ + 1.0
  const midEnd = elevator.z - 1.2
  const mid = midEnd - midStart
  return {
    elevator,
    coolerZ,
    shelfZ: mid > 2.0 ? (midStart + midEnd) / 2 + (mid > 4 ? 0.9 : 0) : null,
    stickyZ: mid > 4 ? midStart + 0.9 : null,
  }
}

export function floorLayout(n) {
  const cols = colsFor(n)
  const rowsN = Math.ceil(Math.max(n, 1) / cols)
  const deskW = (cols - 1) * SX + 1.76
  const W = Math.max(11.5, LEFT + deskW + RIGHT)
  const D = Math.max(9.6, BACK + (rowsN - 1) * SZ + 1.3 + FRONT)
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
  const pois = [
    { kind: 'coffee', x: -W / 2 + 3.0, z: -D / 2 + 1.25, yaw: Math.PI },
    { kind: 'cooler', x: -W / 2 + 1.45, z: lw.coolerZ, yaw: -Math.PI / 2 },
    { kind: 'view', x: x0 + 0.4, z: D / 2 - 1.1, yaw: 0 },
    { kind: 'view', x: x0 + 1.9, z: D / 2 - 1.1, yaw: 0.3 },
  ]
  if (lw.shelfZ != null) pois.push({ kind: 'books', x: -W / 2 + 1.45, z: lw.shelfZ, yaw: -Math.PI / 2 })
  const blockCx = x0 + ((cols - 1) * SX) / 2
  const blockCz = z0 + ((rows.length - 1) * SZ) / 2 + 0.4
  return {
    W, D, seats, rows, xL, cols, x0, z0,
    pois: pois.map((p) => ({ ...p, az: p.z })),
    elevator: lw.elevator,
    wall: lw,
    focus: { x: blockCx * 0.6, z: blockCz * 0.5 - D * 0.07 },
    dist: viewDistance(deskW + 2, rows.length * SZ + 2),
  }
}

export function cortexLayout() {
  const W = 13, D = 12
  const lw = leftWall(W, D)
  return {
    W, D, seats: [], rows: [], xL: -W / 2 + 3.05, cols: 0,
    pois: [], elevator: lw.elevator, wall: lw,
    focus: { x: 0, z: -0.8 },
    dist: 18,
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
