// Floor plan maths. Coordinates are local to a floor: x right, z toward the
// camera, y up. Back wall at z=-D/2, left wall at x=-W/2 (with the elevator).
export const SX = 1.75 // seat spacing in a row
export const SZ = 2.9 // row spacing
export const FLOOR_H = 3.8 // building storey height
export const SEAT_Y = 0.5

export function colsFor(n) {
  return n <= 4 ? Math.max(n, 1) : n <= 6 ? 3 : 4
}

export function buildingSize(maxBots) {
  const rows = Math.ceil(Math.max(maxBots, 1) / colsFor(maxBots))
  return { W: 17, D: Math.max(14.5, rows * SZ + 7.6) }
}

export function floorLayout(n, W, D) {
  const cols = colsFor(n)
  const rowsN = Math.ceil(Math.max(n, 1) / cols)
  const x0 = -W / 2 + 4.9
  const z0 = -D / 2 + 3.5
  const seats = []
  const rows = []
  for (let r = 0; r < rowsN; r++) {
    const cnt = Math.min(cols, n - r * cols)
    if (cnt <= 0) break
    const z = z0 + r * SZ
    rows.push({ z, x1: x0 - 0.88, x2: x0 + (cols - 1) * SX + 0.88, aisle: z - 1.1 })
    for (let c = 0; c < cnt; c++) seats.push({ x: x0 + c * SX, z, az: z - 1.1, row: r })
  }
  const xL = -W / 2 + 3.15
  const pois = [
    { kind: 'coffee', x: -W / 2 + 3.2, z: -D / 2 + 1.25, yaw: Math.PI },
    { kind: 'cooler', x: -W / 2 + 1.45, z: -D / 2 + 4.6, yaw: -Math.PI / 2 },
    { kind: 'books', x: -W / 2 + 1.45, z: D / 2 - 6.4, yaw: -Math.PI / 2 },
    { kind: 'view', x: -0.6, z: D / 2 - 1.2, yaw: 0 },
    { kind: 'view', x: 1.8, z: D / 2 - 1.2, yaw: 0.3 },
  ].map((p) => ({ ...p, az: p.z }))
  const elevator = { kind: 'elevator', x: -W / 2 + 0.55, z: D / 2 - 3.3, az: D / 2 - 3.3, yaw: -Math.PI / 2 }
  const elevatorDoor = { x: -W / 2 + 1.3, z: D / 2 - 3.3 }
  return { W, D, seats, rows, xL, pois, elevator, elevatorDoor, x0, z0, cols }
}

/** Polyline through the lanes: own lane -> left corridor -> target lane. */
export function planPath(a, b, L) {
  const pts = [[a.x, a.z], [a.x, a.az]]
  if (Math.abs(a.az - b.az) > 0.01) {
    pts.push([L.xL, a.az], [L.xL, b.az])
  }
  pts.push([b.x, b.az], [b.x, b.z])
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
