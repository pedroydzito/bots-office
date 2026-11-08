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
const RUGS = ['#cbb8ec', '#b5d3dc', '#e3c7a2', '#c2d9b4', '#ebbcc8', '#b8c6e6', '#d9cfa8', '#9fc7c0']

export const LEAD_RE = /\b(diretor|diretora|director|gestor|gestora|gerente|head|chefe|lead|coordenador|coordenadora|ceo|cmo|cto|coo|cfo)\b/i

const strHash = (str) => {
  let h = 2166136261
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h
}

// ---- filling big empty areas: a coarse grid marks what is taken (desks, decor, walkways), then
// per-floor "kits" (rug + armchairs, pool table, plant clusters, bookcase islands...) go where they fit
const KITS = [
  { w: 3.2, d: 2.4, items: (x, z, c) => [{ type: 'rug', x, z, w: 3.0, d: 2.2, color: c, round: true }, { type: 'armchair', x: x - 0.7, z, c: '#d9c7b0' }, { type: 'armchair', x: x + 0.7, z, c: '#b9cbe0' }], pois: (x, z) => [{ kind: 'armchair', x: x - 0.7, z, az: z - 1.0, yaw: 0, sit: true }] },
  { w: 2.2, d: 1.6, items: (x, z) => [{ type: 'plant', x: x - 0.6, z, k: 0 }, { type: 'plant', x: x + 0.1, z: z + 0.3, k: 1 }, { type: 'plant', x: x + 0.7, z: z - 0.2, k: 0 }], pois: () => [] },
  { w: 2.8, d: 2.2, items: (x, z, c) => [{ type: 'rug', x, z, w: 2.8, d: 2.0, color: c, round: true }, { type: 'beanbag', x: x - 0.6, z, c: '#F93498' }, { type: 'beanbag', x: x + 0.6, z: z + 0.2, c: '#1E86FC' }], pois: () => [] },
]

const GAME_SIZE = { pool: [3.0, 2.0], pingpong: [3.1, 2.0], foosball: [1.4, 1.9], arcade: [1.2, 1.2] }

/**
 * Put the floor's table game in the open strip in front of the desks (not jammed next to the aquarium).
 * Uses a light collision check (desks / existing decor / lounge / aquarium) so it still finds a spot.
 */
function placeGame({ W, D, decor, pois, rows, seats, lounge, game, deskFront, preferX, v }) {
  if (!game || decor.some((d) => GAME_SIZE[d.type])) return
  const C = 0.5
  const nx = Math.ceil(W / C), nz = Math.ceil(D / C)
  const taken = new Uint8Array(nx * nz)
  const mark = (x1, z1, x2, z2) => {
    for (let i = Math.max(0, Math.floor((x1 + W / 2) / C)); i <= Math.min(nx - 1, Math.floor((x2 + W / 2) / C)); i++)
      for (let j = Math.max(0, Math.floor((z1 + D / 2) / C)); j <= Math.min(nz - 1, Math.floor((z2 + D / 2) / C)); j++) taken[j * nx + i] = 1
  }
  const free = (x1, z1, x2, z2) => {
    if (x1 < -W / 2 + 0.5 || x2 > W / 2 - 0.5 || z1 < -D / 2 + 0.7 || z2 > D / 2 - 0.5) return false
    for (let i = Math.floor((x1 + W / 2) / C); i <= Math.floor((x2 + W / 2) / C); i++)
      for (let j = Math.floor((z1 + D / 2) / C); j <= Math.floor((z2 + D / 2) / C); j++) if (taken[j * nx + i]) return false
    return true
  }
  // solid stuff only (not walkways): desks, furniture, lounge sofa, aquarium
  for (const r of rows) mark(r.x1 - 0.7, r.z - 1.2, r.x2 + 0.7, r.z + 1.2)
  for (const st of seats) if (st.lead) mark(st.x - 1.0, st.z - 1.5, st.x + 2.0, st.z + 1.5)
  const FOOT = { meeting: [1.3, 1.0], vending: [0.5, 0.55], printer: [0.5, 0.4], pool: [1.5, 0.95], pingpong: [1.55, 0.95], foosball: [0.6, 0.9], arcade: [0.55, 0.55], bench: [0.9, 0.45], armchair: [0.55, 0.55], beanbag: [0.55, 0.55], plant: [0.35, 0.35], lamp: [0.25, 0.25], bookcase: [0.9, 0.3] }
  for (const d of decor) {
    if (d.type === 'rug') continue
    const f = FOOT[d.type] || [0.5, 0.5]
    mark(d.x - f[0], d.z - f[1], d.x + f[0], d.z + f[1])
  }
  mark(lounge.x - 1.7, lounge.z - 1.4, lounge.x + 1.7, lounge.z + 1.2)
  // aquarium: keep a clear gap so the foosball is never glued to it
  {
    const ax = W / 2 - 0.7, az = -D / 2 + 4.6
    mark(ax - 1.3, az - 1.0, ax + 0.8, az + 1.0)
  }
  let seed = (v || 1) ^ 0x9e3779b9
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296)
  const tries = [...new Set([game, 'foosball'])].filter((g) => g !== 'arcade')
  const px = preferX ?? 0
  const pz = (deskFront ?? 0) + 1.8
  for (const g of tries) {
    const [gw, gd] = GAME_SIZE[g]
    const pad = g === 'foosball' ? 0.55 : 0.7
    const cand = []
    for (let x = -W / 2 + 2.2; x < W / 2 - 1.2; x += 0.4)
      for (let z = -D / 2 + 2.8; z < D / 2 - 2.0; z += 0.4) {
        if (!free(x - gw / 2 - pad, z - gd / 2 - pad, x + gw / 2 + pad, z + gd / 2 + pad)) continue
        const dist = Math.hypot(x - px, z - pz)
        // strong preference for the empty strip in front of the office desks
        const frontBonus = z > (deskFront ?? -D) + 0.2 && z < lounge.z - 1.2 ? -6 : 0
        cand.push([x, z, dist + frontBonus + rnd() * 0.2])
      }
    cand.sort((a, b) => a[2] - b[2])
    if (!cand.length) continue
    const [x, z] = cand[0]
    decor.push({ type: g, x, z })
    pois.push({ kind: g, x: x - gw / 2 - 0.45, z: z + (g === 'pool' ? 0.2 : 0), az: z, yaw: Math.PI / 2 })
    pois.push({ kind: g, x: x + gw / 2 + 0.45, z: z - (g === 'pool' ? 0.2 : 0), az: z, yaw: -Math.PI / 2 })
    return
  }
  if (game === 'arcade') {
    for (let z = -D / 2 + 2.5; z < D / 2 - 2; z += 0.5) {
      const x = W / 2 - 0.9
      if (!free(x - 0.6, z - 0.9, x + 0.5, z + 0.9) || !free(x - 1.8, z - 0.5, x - 0.6, z + 0.5)) continue
      decor.push({ type: 'arcade', x, z })
      pois.push({ kind: 'arcade', x: x - 1.0, z, az: z, yaw: Math.PI / 2 })
      return
    }
  }
}

function fillEmpty({ W, D, v, decor, pois, rows, seats, xL, furniture, lounge }) {
  if (!furniture) return
  const C = 0.5 // cell size
  const nx = Math.ceil(W / C), nz = Math.ceil(D / C)
  const taken = new Uint8Array(nx * nz)
  const mark = (x1, z1, x2, z2) => {
    for (let i = Math.max(0, Math.floor((x1 + W / 2) / C)); i <= Math.min(nx - 1, Math.floor((x2 + W / 2) / C)); i++)
      for (let j = Math.max(0, Math.floor((z1 + D / 2) / C)); j <= Math.min(nz - 1, Math.floor((z2 + D / 2) / C)); j++) taken[j * nx + i] = 1
  }
  const free = (x1, z1, x2, z2) => {
    if (x1 < -W / 2 + 0.4 || x2 > W / 2 - 0.4 || z1 < -D / 2 + 0.6 || z2 > D / 2 - 0.4) return false
    for (let i = Math.floor((x1 + W / 2) / C); i <= Math.floor((x2 + W / 2) / C); i++)
      for (let j = Math.floor((z1 + D / 2) / C); j <= Math.floor((z2 + D / 2) / C); j++) if (taken[j * nx + i]) return false
    return true
  }
  // walls, elevator corner, coffee lane, the corridor and the window walk stay clear
  mark(-W / 2, -D / 2, W / 2, -D / 2 + 1.9)
  mark(-W / 2, -D / 2, -W / 2 + 1.9, D / 2)
  mark(xL - 0.8, -D / 2, xL + 0.8, D / 2)
  mark(-W / 2, D / 2 - 1.7, W / 2, D / 2)
  for (const r of rows) mark(r.x1 - 0.9, r.z - 1.6, r.x2 + 0.9, r.z + 1.6)
  for (const st of seats) if (st.lead) mark(st.x - 1.2, st.z - 2.0, st.x + 2.4, st.z + 2.0)
  const FOOT = { meeting: [1.3, 1.0], vending: [0.5, 0.6], printer: [0.5, 0.45], pool: [1.5, 0.95], pingpong: [1.55, 0.95], foosball: [0.6, 0.9], arcade: [0.6, 0.6], bench: [1.0, 0.5], armchair: [0.6, 0.6], beanbag: [0.6, 0.6], plant: [0.4, 0.4], lamp: [0.3, 0.3], aquarium: [0.85, 0.55] }
  for (const d of decor) {
    if (d.type === 'rug' && !d.kit) continue // the big rug under the desks is covered by the desk marks
    const f = FOOT[d.type] || [0.6, 0.6]
    const h = d.w ? d.w / 2 + 0.3 : f[0] + 0.35
    const hz = d.d ? d.d / 2 + 0.3 : f[1] + 0.35
    mark(d.x - h, d.z - hz, d.x + h, d.z + hz)
  }
  for (const p of pois) mark(p.x - 0.5, Math.min(p.z, p.az ?? p.z) - 0.5, p.x + 0.5, Math.max(p.z, p.az ?? p.z) + 0.5)
  mark(lounge.x - 2.0, lounge.z - 1.8, lounge.x + 2.0, D / 2) // lounge
  // aquarium footprint (same spot Floor uses for fish)
  {
    const ax = W / 2 - 0.7, az = -D / 2 + 4.6
    mark(ax - 1.1, az - 0.85, ax + 0.7, az + 0.85)
  }
  let seed = v || 1
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296)
  const order = KITS.map((k, i) => [k, rnd(), i]).sort((a, b) => a[1] - b[1])
  let placed = 0
  for (let pass = 0; pass < 2; pass++)
    for (const [kit, , ki] of order) {
      if (placed >= 4) return
      const cand = []
      for (let x = -W / 2 + 1; x < W / 2 - 1; x += 0.5) for (let z = -D / 2 + 1; z < D / 2 - 1; z += 0.5) cand.push([x, z, rnd()])
      cand.sort((a, b) => a[2] - b[2])
      for (const [x, z] of cand) {
        if (!free(x - kit.w / 2 - 0.3, z - kit.d / 2 - 0.3, x + kit.w / 2 + 0.3, z + kit.d / 2 + 0.3)) continue
        const color = RUGS[((v >>> 2) + ki * 3 + placed) % RUGS.length]
        decor.push(...kit.items(x, z, color))
        pois.push(...kit.pois(x, z).map((p) => ({ ...p, az: p.az ?? p.z })))
        mark(x - kit.w / 2 - 0.4, z - kit.d / 2 - 0.4, x + kit.w / 2 + 0.4, z + kit.d / 2 + 0.4)
        placed++
        break
      }
    }
}

export function floorLayout(nAll, W, D, { lead = false, furniture = true, seed = '' } = {}) {
  const n = lead ? nAll - 1 : nAll
  // every floor gets its own personality (same on every screen): corner type, rug colours, games...
  const v = strHash(seed)
  const GAMES = nAll >= 2 ? ['pingpong', 'pool', 'foosball', 'arcade'] : ['arcade', null]
  const theGame = GAMES[(v >>> 8) % GAMES.length]
  let gamePlaced = false
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
    // the lead sits with the wall (and the highlights board) behind, facing the team
    const x = -W / 2 + 1.25, z = lw0.boardZ
    seats.unshift({ x, z, az: z - 1.05, row: -1, lead: true, yaw: Math.PI / 2, talk: { x: -W / 2 + 3.05, z: z - 0.3 } })
    leadRow = null
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
  const hasMeeting = rx2 - rx1 >= 3.4
  if (hasMeeting) {
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
      decor.push({ type: 'rug', kit: true, x: x0 + 1.2, z: cz, w: 3.4, d: 2.6, color: RUGS[(v >>> 5) % RUGS.length], round: true })
      decor.push({ type: 'beanbag', x: x0 + 0.4, z: cz - 0.3, c: '#8F59F9' })
      decor.push({ type: 'beanbag', x: x0 + 2.0, z: cz + 0.3, c: '#F5B70A' })
      decor.push({ type: 'plant', x: x0 + 3.3, z: cz - 0.8, k: 1 })
    } else if (false) {
      // the floor's table game
      decor.push({ type: theGame, x: x0 + 1.4, z: cz })
      extraPois.push({ kind: 'arcade', x: x0 + 1.4 - 1.75, z: cz, yaw: Math.PI / 2 })
      decor.push({ type: 'plant', x: x0 + 3.6, z: cz + 0.9, k: 0 })
    } else if (kind === 2) {
      // reading nook: two armchairs, a bookshelf and a lamp
      decor.push({ type: 'rug', kit: true, x: x0 + 1.4, z: cz, w: 3.2, d: 2.2, color: RUGS[(v >>> 6) % RUGS.length], round: false })
      decor.push({ type: 'armchair', x: x0 + 0.6, z: cz + 0.2, c: '#d9c7b0' })
      decor.push({ type: 'armchair', x: x0 + 2.1, z: cz + 0.2, c: '#b9cbe0' })
      decor.push({ type: 'lamp', x: x0 + 2.9, z: cz - 0.2 })
      extraPois.push({ kind: 'armchair', x: x0 + 0.6, z: cz + 0.2, az: cz - 0.8, yaw: 0, sit: true })
    } else {
      // little indoor garden with a bench
      decor.push({ type: 'bench', x: x0 + 1.4, z: cz + 0.2 })
      for (let i = 0; i < 4; i++) decor.push({ type: 'plant', x: x0 - 0.2 + i * 1.1, z: cz - 0.9 + (i % 2) * 0.25, k: (i + v) % 2 })
      extraPois.push({ kind: 'armchair', x: x0 + 1.4, z: cz + 0.2, az: cz + 1.0, yaw: Math.PI, sit: true })
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
  // back wall: TV, art (or plant shelves) and the meeting whiteboard get their own slots, in a
  // per-floor order and evenly spaced, so nothing ever hangs inside something else
  const artKind = (v >>> 20) % 3 === 2 ? 'plants' : 'art'
  const wallItems = [['tv', 2.4], ['art', 2.3]]
  if (hasMeeting) wallItems.push(['wb', 1.9])
  const PERMS = [[0, 1, 2], [1, 0, 2], [0, 2, 1], [2, 0, 1], [1, 2, 0], [2, 1, 0]]
  const order = PERMS[(v >>> 22) % PERMS.length].filter((i) => i < wallItems.length).map((i) => wallItems[i])
  const wa = -W / 2 + 7.6, wb = W / 2 - 0.9
  const tot = order.reduce((a, [, w]) => a + w, 0)
  const slots = {}
  if (tot > wb - wa) {
    // not enough wall: drop the art
    const kept = order.filter(([k]) => k !== 'art')
    const g = Math.max(0.2, (wb - wa - kept.reduce((a, [, w]) => a + w, 0)) / (kept.length + 1))
    let c = wa + g
    for (const [k, w] of kept) (slots[k] = c + w / 2), (c += w + g)
  } else {
    const g = (wb - wa - tot) / (order.length + 1)
    let c = wa + g
    for (const [k, w] of order) (slots[k] = c + w / 2), (c += w + g)
  }
  const tvX = slots.tv ?? W / 2 - 2.5
  const artX = slots.art ?? null
  if (hasMeeting) {
    const wbDecor = decor.find((d) => d.type === 'whiteboard')
    if (wbDecor) wbDecor.x = slots.wb
    // the table sits in front of its whiteboard when that spot is on the free right side
    const mx = Math.min(rx2 - 1.5, Math.max(rx1 + 1.5, slots.wb))
    const mt = decor.find((d) => d.type === 'meeting')
    if (mt) (mt.x = mx), (meet.x = mx)
  }
  // printer under the TV
  decor.push({ type: 'printer', x: tvX - 1.2, z: -D / 2 + 0.6 })
  extraPois.push({ kind: 'printer', x: tvX - 1.2, z: -D / 2 + 1.5, yaw: Math.PI })
  // arcade cabinet on the right, between the meeting corner and the lounge (keep clear of the aquarium)
  const az1 = z0 + (rx2 - rx1 >= 3.4 ? 2.8 : 0.4), az2 = D / 2 - 4.9
  const aquaZ = -D / 2 + 4.6
  if (furniture && W / 2 - blockEnd > 2.6 && az2 - az1 > 1.2) {
    const z = (az1 + az2) / 2
    const game = gamePlaced || theGame !== 'arcade' ? null : theGame
    // don't glue the cabinet to the aquarium: if too close, let placeGame find a better spot later
    if (game && Math.abs(z - aquaZ) > 1.8) {
      decor.push({ type: game, x: W / 2 - 0.9, z })
      gamePlaced = true
      extraPois.push({ kind: 'arcade', x: W / 2 - 1.9, z, yaw: Math.PI / 2 })
    }
    decor.push({ type: 'lamp', x: W / 2 - 0.8, z: z + 1.3 })
  }
  // armchairs by the windows, between the phone spot and the lounge
  const ax = x0 + 4.6
  if (furniture && W / 2 - 4.7 - ax > 1.8) {
    decor.push({ type: 'rug', kit: true, x: ax + 0.6, z: D / 2 - 1.9, w: 2.6, d: 1.6, color: RUGS[(v >>> 7) % RUGS.length], round: true })
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
  // after mirroring, two big pieces may meet: keep the first, drop the other (and its spot)
  {
    const BIG = { meeting: [1.3, 1.0], vending: [0.5, 0.6], printer: [0.5, 0.45], pool: [1.5, 0.95], pingpong: [1.55, 0.95], foosball: [0.6, 0.9], arcade: [0.6, 0.6], bench: [1.0, 0.5], armchair: [0.6, 0.6], beanbag: [0.6, 0.6], plant: [0.4, 0.4], lamp: [0.3, 0.3], bookcase: [1.0, 0.35] }
    // important pieces claim their spot first; small things (plants, lamps) give way
    const PRI = { meeting: 6, vending: 6, printer: 6, pool: 5, pingpong: 5, foosball: 5, arcade: 5, bench: 3, armchair: 3, bookcase: 3, beanbag: 2, lamp: 1, plant: 1 }
    // desks (and the lead's corner) are fixed: nothing may sit on them
    const kept = rows.map((r) => ({ x: (r.x1 + r.x2) / 2, z: r.z + 0.4, b: [(r.x2 - r.x1) / 2 + 0.6, 1.5] }))
    for (const st of seats) if (st.lead) kept.push({ x: st.x + 0.6, z: st.z, b: [1.6, 1.8] })
    const drop = new Set()
    const byPri = decor.map((d, i) => [d, i]).filter(([d]) => BIG[d.type]).sort((a, b) => (PRI[b[0].type] || 0) - (PRI[a[0].type] || 0) || a[1] - b[1])
    for (const [d, i] of byPri) {
      const b = BIG[d.type]
      if (kept.some((k) => Math.abs(k.x - d.x) < k.b[0] + b[0] + 0.3 && Math.abs(k.z - d.z) < k.b[1] + b[1] + 0.3)) {
        drop.add(i)
        const pi = pois.findIndex((p) => Math.hypot(p.x - d.x, p.z - d.z) < 2.2 && (p.kind === 'arcade' || p.kind === 'armchair'))
        if (pi >= 0 && PRI[d.type] >= 3) pois.splice(pi, 1)
      } else kept.push({ x: d.x, z: d.z, b })
    }
    for (let i = decor.length - 1; i >= 0; i--) if (drop.has(i)) decor.splice(i, 1)
    // a corner rug whose furniture was removed goes too (no empty rugs)
    for (let i = decor.length - 1; i >= 0; i--) {
      const r = decor[i]
      if (r.type !== 'rug' || !r.kit) continue
      const has = decor.some((d) => d !== r && d.type !== 'rug' && Math.abs(d.x - r.x) < r.w / 2 && Math.abs(d.z - r.z) < r.d / 2)
      if (!has) decor.splice(i, 1)
    }
  }
  // table game first (open strip in front of the desks), then fill the rest with kits
  if (furniture) placeGame({ W, D, decor, pois, rows, seats, lounge, game: theGame, deskFront, preferX: x0 + deskW / 2, v })
  fillEmpty({ W, D, v, decor, pois, rows, seats, xL, furniture, lounge })
  for (const p of pois) {
    p.x = Math.min(W / 2 - 0.7, Math.max(-W / 2 + 0.7, p.x))
    p.z = Math.min(D / 2 - 0.7, Math.max(-D / 2 + 0.7, p.z))
  }
  const blockCx = x0 + ((cols - 1) * sx) / 2
  const blockCz = z0 + ((rowsN - 1) * sz) / 2
  const layout = {
    own, variant: v, lounge, tvX, artX, artKind,
    W, D, seats, rows: leadRow ? [...rows, leadRow] : rows, xL, cols, x0, z0, decor, meet,
    pois: pois.map((p) => ({ ...p, az: p.az ?? p.z })),
    elevator: lw.elevator,
    wall: lw,
    // frame the bots (not the whole room), nudged back so the wall title shows
    focus: { x: blockCx + 0.3, z: blockCz - 0.9 },
    dist: viewDistance(deskW + 3, rowsN * sz + 3),
  }
  layout.walk = buildWalkGrid(layout)
  return layout
}

export function cortexLayout(W = 13, D = 12) {
  const lw = leftWall(W, D)
  const layout = {
    W, D, seats: [], rows: [], xL: -W / 2 + 3.05, cols: 0, decor: [], meet: { x: 0, z: 0 },
    pois: [], elevator: lw.elevator, wall: lw, variant: 0,
    focus: { x: 0, z: -0.8 },
    dist: 16,
  }
  layout.walk = buildWalkGrid(layout)
  return layout
}

// ---- walk grid: bots go around furniture; only cut through if no other route exists
const WALK_C = 0.4
const BLOCK_FOOT = {
  meeting: [1.15, 0.85], vending: [0.45, 0.5], printer: [0.45, 0.4],
  pool: [1.35, 0.85], pingpong: [1.4, 0.85], foosball: [0.55, 0.8], arcade: [0.5, 0.5],
  bench: [0.85, 0.4], armchair: [0.5, 0.5], beanbag: [0.5, 0.5], plant: [0.3, 0.3],
  lamp: [0.22, 0.22], bookcase: [0.9, 0.3], aquarium: [0.75, 0.45],
}

function markRect(grid, nx, nz, W, D, C, x1, z1, x2, z2, val = 1) {
  const i0 = Math.max(0, Math.floor((x1 + W / 2) / C))
  const i1 = Math.min(nx - 1, Math.floor((x2 + W / 2) / C))
  const j0 = Math.max(0, Math.floor((z1 + D / 2) / C))
  const j1 = Math.min(nz - 1, Math.floor((z2 + D / 2) / C))
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * nx + i] = val
}

/** Solid furniture + desks the bots must walk around. */
export function buildWalkGrid(L) {
  const { W, D } = L
  const C = WALK_C
  const nx = Math.ceil(W / C), nz = Math.ceil(D / C)
  const hard = new Uint8Array(nx * nz)
  // outer walls (keep a walkable rim inside)
  markRect(hard, nx, nz, W, D, C, -W / 2, -D / 2, W / 2, -D / 2 + 0.45)
  markRect(hard, nx, nz, W, D, C, -W / 2, D / 2 - 0.35, W / 2, D / 2)
  markRect(hard, nx, nz, W, D, C, -W / 2, -D / 2, -W / 2 + 0.45, D / 2)
  markRect(hard, nx, nz, W, D, C, W / 2 - 0.35, -D / 2, W / 2, D / 2)
  // desks: solid tops, leave the front aisle free
  for (const r of L.rows || []) markRect(hard, nx, nz, W, D, C, r.x1 - 0.15, r.z - 0.15, r.x2 + 0.15, r.z + 1.05)
  for (const st of L.seats || []) {
    if (st.lead) markRect(hard, nx, nz, W, D, C, st.x - 0.95, st.z - 0.6, st.x + 1.1, st.z + 1.1)
    else markRect(hard, nx, nz, W, D, C, st.x - 0.55, st.z + 0.15, st.x + 0.55, st.z + 0.95)
  }
  for (const d of L.decor || []) {
    if (d.type === 'rug') continue
    const f = BLOCK_FOOT[d.type] || [0.45, 0.45]
    markRect(hard, nx, nz, W, D, C, d.x - f[0], d.z - f[1], d.x + f[0], d.z + f[1])
  }
  // aquarium is rendered even when not in decor (fish pet): always block its default spot
  {
    const ax = W / 2 - 0.7, az = -D / 2 + 4.6
    markRect(hard, nx, nz, W, D, C, ax - 0.75, az - 0.45, ax + 0.45, az + 0.45)
  }
  return { hard, nx, nz, C, W, D }
}

function cellOf(grid, x, z) {
  const i = Math.max(0, Math.min(grid.nx - 1, Math.floor((x + grid.W / 2) / grid.C)))
  const j = Math.max(0, Math.min(grid.nz - 1, Math.floor((z + grid.D / 2) / grid.C)))
  return { i, j }
}
function worldOf(grid, i, j) {
  return [i * grid.C - grid.W / 2 + grid.C / 2, j * grid.C - grid.D / 2 + grid.C / 2]
}

/** A* on the walk grid. `allowBlocked`: false = go around only; true = cut through if needed. */
function astarOnce(grid, sx, sz, gx, gz, bias, allowBlocked) {
  const { hard, nx, nz } = grid
  const start = cellOf(grid, sx, sz)
  const goal = cellOf(grid, gx, gz)
  const N = nx * nz
  const came = new Int32Array(N).fill(-1)
  const gScore = new Float32Array(N).fill(Infinity)
  const fScore = new Float32Array(N).fill(Infinity)
  const open = new Uint8Array(N)
  const si = start.i + start.j * nx, gi = goal.i + goal.j * nx
  gScore[si] = 0
  fScore[si] = Math.hypot(goal.i - start.i, goal.j - start.j)
  open[si] = 1
  let openCount = 1
  // bias flips neighbour order so two bots prefer opposite sides of the same obstacle
  const dirs = bias >= 0
    ? [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
    : [[-1, 0], [0, 1], [1, 0], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]]
  while (openCount > 0) {
    let cur = -1, best = Infinity
    for (let k = 0; k < N; k++) if (open[k] && fScore[k] < best) (best = fScore[k], cur = k)
    if (cur < 0) break
    if (cur === gi) break
    open[cur] = 0
    openCount--
    const ci = cur % nx, cj = (cur / nx) | 0
    for (const [di, dj] of dirs) {
      const ni = ci + di, nj = cj + dj
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue
      const nk = ni + nj * nx
      const atEnd = nk === si || nk === gi
      if (hard[nk] && !atEnd && !allowBlocked) continue
      const step = (di && dj ? 1.414 : 1) + (hard[nk] && !atEnd ? 40 : 0)
      const tent = gScore[cur] + step
      if (tent >= gScore[nk]) continue
      came[nk] = cur
      gScore[nk] = tent
      fScore[nk] = tent + Math.hypot(goal.i - ni, goal.j - nj) + bias * 0.04 * (ni - ci)
      if (!open[nk]) (open[nk] = 1, openCount++)
    }
  }
  if (came[gi] < 0 && gi !== si) return null
  const cells = []
  for (let c = gi; c >= 0; c = came[c]) {
    cells.push(c)
    if (c === si) break
  }
  cells.reverse()
  const pts = cells.map((c) => worldOf(grid, c % nx, (c / nx) | 0))
  const slim = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = slim[slim.length - 1], b = pts[i], c = pts[i + 1]
    const abx = b[0] - a[0], abz = b[1] - a[1], bcx = c[0] - b[0], bcz = c[1] - b[1]
    if (Math.abs(abx * bcz - abz * bcx) > 0.08) slim.push(b)
  }
  if (pts.length) slim.push(pts[pts.length - 1])
  return slim
}

/** Prefer a free path around furniture; only cut through when that is impossible. */
function astar(grid, sx, sz, gx, gz, bias = 0) {
  return astarOnce(grid, sx, sz, gx, gz, bias, false) || astarOnce(grid, sx, sz, gx, gz, bias, true)
}

const pathCache = new Map()

/**
 * Walk around furniture to the target. `bias` (>0 prefer right, <0 prefer left) makes two bots
 * take different routes to the same place. Only cuts through an object if no free path exists.
 */
export function planPath(a, b, L, bias = 0) {
  const key = `${L.variant}|${a.x.toFixed(2)},${a.z.toFixed(2)}|${b.x.toFixed(2)},${b.z.toFixed(2)}|${bias.toFixed(2)}`
  if (pathCache.has(key)) return pathCache.get(key)
  if (pathCache.size > 800) pathCache.clear()

  const pts = []
  // stand up / leave the seat sideways before pathfinding across the room
  if (a.ex != null && Math.hypot((a.x || 0) - a.ex, (a.z || 0) - (a.az ?? a.z)) > 0.05) {
    pts.push([a.x, a.z], [a.ex, a.z], [a.ex, a.az ?? a.z])
  } else if (a.az != null && Math.abs((a.z || 0) - a.az) > 0.05) {
    pts.push([a.x, a.z], [a.x, a.az])
  } else {
    pts.push([a.x, a.z])
  }
  const start = pts[pts.length - 1]
  const endApproach = b.ex != null ? [b.ex, b.az ?? b.z] : b.az != null && Math.abs((b.z || 0) - b.az) > 0.05 ? [b.x, b.az] : [b.x, b.z]
  const grid = L.walk || (L.walk = buildWalkGrid(L))
  const mid = astar(grid, start[0], start[1], endApproach[0], endApproach[1], bias) || [[start[0], start[1]], endApproach]
  for (const p of mid) {
    const q = pts[pts.length - 1]
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) pts.push(p)
  }
  if (b.ex != null) {
    const q = pts[pts.length - 1]
    if (Math.hypot(b.ex - q[0], (b.az ?? b.z) - q[1]) > 0.05) pts.push([b.ex, b.az ?? b.z])
    if (Math.hypot(b.x - b.ex, b.z - (b.az ?? b.z)) > 0.05) pts.push([b.x, b.z])
  } else if (Math.hypot(b.x - pts[pts.length - 1][0], b.z - pts[pts.length - 1][1]) > 0.05) {
    pts.push([b.x, b.z])
  }
  pathCache.set(key, pts)
  return pts
}

export function talkSpots(seat, k = 0) {
  // seats in tight places (the lead's desk against the wall) talk out in the open walkway
  if (seat.talk) {
    const { x, z } = seat.talk
    return {
      host: { kind: 'spot', x, z: z - 0.45, az: z - 0.45, yaw: 0 },
      visitor: { kind: 'spot', x: x + k * 0.72, z: z + 0.45, az: z + 0.45, yaw: Math.PI },
    }
  }
  return {
    host: { kind: 'spot', x: seat.x - 0.42, z: seat.az, az: seat.az, yaw: Math.PI / 2 },
    visitor: { kind: 'spot', x: seat.x + 0.42 + k * 0.72, z: seat.az, az: seat.az, yaw: -Math.PI / 2 },
  }
}

/** vertical gap between storeys in the overview (exploded) mode */
export const OVERVIEW_GAP = 2.8
