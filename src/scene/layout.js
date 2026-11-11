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
  // the area's entrance: an opening in the front partition, at the front-left, onto the aisle
  const elevator = { kind: 'elevator', x: -W / 2 + 1.5, z: D / 2 - 0.75, az: D / 2 - 0.75, yaw: 0 }
  // Everything else on this wall is spread evenly along its free length (entrance corner kept clear),
  // so the wall is never crowded at one end and empty at the other.
  const a = -D / 2 + 1.6, b = D / 2 - 2.3
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

function fillEmpty({ W, D, v, decor, pois, rows, seats, xL, furniture, lounge, game }) {
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
  mark(W / 2 - 1.9, -D / 2 + 1.2, W / 2, -D / 2 + 3.3) // second door (right wall, near the back)
  mark(-W / 2, -D / 2, -W / 2 + 1.9, D / 2)
  mark(xL - 0.8, -D / 2, xL + 0.8, D / 2)
  mark(-W / 2, D / 2 - 1.7, W / 2, D / 2)
  for (const r of rows) mark(r.x1 - 0.9, r.z - 1.6, r.x2 + 0.9, r.z + 1.6)
  for (const st of seats) if (st.lead) mark(st.x - 1.2, st.z - 2.0, st.x + 2.4, st.z + 2.0)
  const FOOT = { meeting: [1.3, 1.0], vending: [0.5, 0.6], printer: [0.5, 0.45], pool: [1.5, 0.95], pingpong: [1.55, 0.95], foosball: [0.6, 0.9], arcade: [0.6, 0.6], bench: [1.0, 0.5], armchair: [0.6, 0.6], beanbag: [0.6, 0.6], plant: [0.4, 0.4], lamp: [0.3, 0.3] }
  for (const d of decor) {
    if (d.type === 'rug' && !d.kit) continue // the big rug under the desks is covered by the desk marks
    const f = FOOT[d.type] || [0.6, 0.6]
    const h = d.w ? d.w / 2 + 0.3 : f[0] + 0.35
    const hz = d.d ? d.d / 2 + 0.3 : f[1] + 0.35
    mark(d.x - h, d.z - hz, d.x + h, d.z + hz)
  }
  for (const p of pois) mark(p.x - 0.5, Math.min(p.z, p.az ?? p.z) - 0.5, p.x + 0.5, Math.max(p.z, p.az ?? p.z) + 0.5)
  mark(lounge.x - 2.0, lounge.z - 1.8, lounge.x + 2.0, D / 2) // lounge
  mark(W / 2 - 1.9, -D / 2 + 3.6, W / 2, -D / 2 + 5.6) // aquarium corner (fish floors)
  // try kits in a per-floor order, at candidate points scanned in a per-floor order
  let seed = v || 1
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296)
  const order = KITS.map((k, i) => [k, rnd(), i]).sort((a, b) => a[1] - b[1])
  // the floor's one game, if it didn't fit in its usual spot: wherever it fits, else a compact arcade
  const GAME_SIZE = { pool: [3.0, 2.0], pingpong: [3.1, 2.0], foosball: [1.4, 1.9], arcade: [1.2, 1.2] }
  if (game && !decor.some((d) => GAME_SIZE[d.type])) {
    // free-standing tables only; an arcade cabinet belongs against a wall
    const tries = [...new Set([game, 'foosball'])].filter((g) => g !== 'arcade')
    // prefer the open floor in front of the desks (people can stand all around), nearest first
    const rx = rows.length ? rows.reduce((s2, r) => s2 + (r.x1 + r.x2) / 2, 0) / rows.length : 0
    const rz = rows.length ? Math.max(...rows.map((r) => r.z)) + 3.2 : 0
    const spots = []
    for (let x = -W / 2 + 2; x < W / 2 - 1; x += 0.5) for (let z = -D / 2 + 2.5; z < D / 2 - 1.8; z += 0.5) spots.push([x, z, Math.hypot(x - rx, z - rz)])
    spots.sort((p1, p2) => p1[2] - p2[2])
    for (const g of tries) {
      const [gw, gd] = GAME_SIZE[g]
      let done = false
      for (const [x, z] of spots) {
        if (done) break
        {
          // a clear meter all around: bots stand on every side to play
          if (!free(x - gw / 2 - 0.7, z - gd / 2 - 0.55, x + gw / 2 + 0.7, z + gd / 2 + 0.55)) continue
          decor.push({ type: g, x, z })
          // players on both ends, facing the table
          if (g === 'arcade') pois.push({ kind: 'arcade', x: x - gw / 2 - 0.5, z, az: z, yaw: Math.PI / 2 })
          else {
            pois.push({ kind: g, x: x - gw / 2 - 0.45, z: z + (g === 'pool' ? 0.2 : 0), az: z, yaw: Math.PI / 2 })
            pois.push({ kind: g, x: x + gw / 2 + 0.45, z: z - (g === 'pool' ? 0.2 : 0), az: z, yaw: -Math.PI / 2 })
          }
          mark(x - gw / 2 - 1.2, z - gd / 2 - 1.1, x + gw / 2 + 1.2, z + gd / 2 + 1.1)
          done = true
        }
      }
      if (done) break
    }
    if (!decor.some((d) => GAME_SIZE[d.type]) && game === 'arcade') {
      // cabinet against the right wall, wherever there is a free stretch
      for (let z = -D / 2 + 2.5; z < D / 2 - 2; z += 0.5) {
        const x = W / 2 - 0.9
        if (!free(x - 0.6, z - 0.9, x + 0.5, z + 0.9) || !free(x - 1.8, z - 0.5, x - 0.6, z + 0.5)) continue
        decor.push({ type: 'arcade', x, z })
        pois.push({ kind: 'arcade', x: x - 1.0, z, az: z, yaw: Math.PI / 2 })
        mark(x - 1.9, z - 1.0, x + 0.6, z + 1.0)
        break
      }
    }
  }
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
  // arcade cabinet on the right, between the meeting corner and the lounge
  const az1 = z0 + (rx2 - rx1 >= 3.4 ? 2.8 : 0.4), az2 = D / 2 - 4.9
  if (furniture && W / 2 - blockEnd > 2.6 && az2 - az1 > 1.2) {
    const z = (az1 + az2) / 2
    const game = gamePlaced || theGame !== 'arcade' ? null : theGame
    if (game) decor.push({ type: game, x: game === 'pool' || game === 'pingpong' ? W / 2 - 2.0 : W / 2 - 0.9, z })
    gamePlaced = gamePlaced || !!game
    decor.push({ type: 'lamp', x: W / 2 - 0.8, z: z + 1.3 })
    if (game) extraPois.push({ kind: game === 'foosball' ? 'foosball' : 'arcade', x: W / 2 - 1.9, z, yaw: Math.PI / 2 })
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
    { kind: 'sofa', x: W / 2 - 2.9, z: D / 2 - 2.95, az: D / 2 - 2.45, yaw: 0, sit: true },
    { kind: 'sofa', x: W / 2 - 1.7, z: D / 2 - 2.95, az: D / 2 - 2.45, yaw: 0, sit: true },
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
  // fill what is still empty (after mirroring, so nothing lands on a moved corner)
  fillEmpty({ W, D, v, decor, pois, rows, seats, xL, furniture, lounge, game: theGame })
  for (const p of pois) {
    p.x = Math.min(W / 2 - 0.7, Math.max(-W / 2 + 0.7, p.x))
    p.z = Math.min(D / 2 - 0.7, Math.max(-D / 2 + 0.7, p.z))
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


// ---- walking: a grid of what is taken on the floor, and A* around it ------------------------------
// Bots never walk through furniture: every desk, game table, sofa, plant and machine is an obstacle;
// paths go around them. Only when a spot can't be reached (it sits inside something) does the last
// stretch cut through.
const NAV_CELL = 0.25
const NAV_FOOT = { meeting: [1.25, 0.95], vending: [0.45, 0.55], printer: [0.45, 0.4], pool: [1.3, 0.8], pingpong: [1.35, 0.8], foosball: [0.45, 0.7], arcade: [0.45, 0.45], bench: [0.85, 0.3], armchair: [0.45, 0.45], beanbag: [0.5, 0.5], plant: [0.28, 0.28], lamp: [0.2, 0.2], bookcase: [0.9, 0.25] }

function buildNav(L) {
  const { W, D } = L
  const nx = Math.ceil(W / NAV_CELL), nz = Math.ceil(D / NAV_CELL)
  const blocked = new Uint8Array(nx * nz)
  const R = 0.22 // bot radius
  const box = (x1, z1, x2, z2) => {
    const i1 = Math.max(0, Math.floor((x1 - R + W / 2) / NAV_CELL)), i2 = Math.min(nx - 1, Math.floor((x2 + R + W / 2) / NAV_CELL))
    const j1 = Math.max(0, Math.floor((z1 - R + D / 2) / NAV_CELL)), j2 = Math.min(nz - 1, Math.floor((z2 + R + D / 2) / NAV_CELL))
    for (let j = j1; j <= j2; j++) for (let i = i1; i <= i2; i++) blocked[j * nx + i] = 1
  }
  const at = (x, z, hx, hz) => box(x - hx, z - hz, x + hx, z + hz)
  // room edges, back wall counter / printer band, left wall furniture band (the elevator stays open)
  box(-W / 2 - 1, -D / 2 - 1, W / 2 + 1, -D / 2 + 0.25)
  box(-W / 2 - 1, D / 2 - 0.25, W / 2 + 1, D / 2 + 1)
  box(-W / 2 - 1, -D / 2 - 1, -W / 2 + 0.25, D / 2 + 1)
  box(W / 2 - 0.25, -D / 2 - 1, W / 2 + 1, D / 2 + 1)
  box(-W / 2 + 2.0, -D / 2, -W / 2 + 4.0, -D / 2 + 0.75) // coffee counter
  box(-W / 2, -D / 2 + 1.5, -W / 2 + 0.7, D / 2 - 2.1) // cooler, shelf, vending along the left wall
  for (const r of L.rows) if (!r.lead) box(r.x1, r.z + 0.38, r.x2, r.z + 1.26)
  for (const st of L.seats) {
    if (st.lead) {
      box(st.x + 0.3, st.z - 1.15, st.x + 1.4, st.z + 1.15) // executive desk (turned to face the team)
      at(st.x + 0.3, st.z + 1.55, 0.3, 0.3) // its plant
    }
  }
  for (const d of L.decor) {
    if (d.type === 'rug' || d.type === 'whiteboard') continue
    const f = NAV_FOOT[d.type]
    if (f) at(d.x, d.z, f[0], f[1])
  }
  if (L.lounge) {
    const { x, z } = L.lounge
    box(x - 1.0, z - 1.35, x + 1.4, z - 0.45) // sofa
    box(x - 0.35, z - 0.05, x + 0.75, z + 0.55) // coffee table
  }
  // fixed plants and the aquarium corner drawn by the floor itself
  at(W / 2 - 1.0, -D / 2 + 0.9, 0.3, 0.3)
  at(-W / 2 + 0.75, -D / 2 + 0.75, 0.3, 0.3)
  at(-W / 2 + 0.7, D / 2 - 0.7, 0.3, 0.3)
  if (D > 12) at(W / 2 - 0.9, -D / 2 + 5.5, 0.28, 0.28)
  at(W / 2 - 0.7, -D / 2 + 4.6, 0.85, 0.45)
  return { nx, nz, blocked, cache: new Map() }
}

function navPath(a, b, L) {
  const N = (L._nav ||= buildNav(L))
  const key = `${a.x.toFixed(2)},${a.z.toFixed(2)}>${b.x.toFixed(2)},${b.z.toFixed(2)}`
  const hit = N.cache.get(key)
  if (hit) return hit
  const { nx, nz, blocked } = N
  const W = L.W, D = L.D
  const ci = (x) => Math.min(nx - 1, Math.max(0, Math.floor((x + W / 2) / NAV_CELL)))
  const cj = (z) => Math.min(nz - 1, Math.max(0, Math.floor((z + D / 2) / NAV_CELL)))
  const cx = (i) => -W / 2 + (i + 0.5) * NAV_CELL
  const cz = (j) => -D / 2 + (j + 0.5) * NAV_CELL
  // start / goal may sit inside furniture (a chair, a sofa seat): use the nearest free cell
  const nearestFree = (i0, j0) => {
    if (!blocked[j0 * nx + i0]) return [i0, j0]
    for (let r = 1; r < 14; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
          const i = i0 + di, j = j0 + dj
          if (i >= 0 && j >= 0 && i < nx && j < nz && !blocked[j * nx + i]) return [i, j]
        }
    return [i0, j0]
  }
  const [si, sj] = nearestFree(ci(a.x), cj(a.z))
  const [gi, gj] = nearestFree(ci(b.x), cj(b.z))
  const S = sj * nx + si, G = gj * nx + gi
  const g = new Float32Array(nx * nz).fill(Infinity)
  const from = new Int32Array(nx * nz).fill(-1)
  const open = [S]
  const f = new Float32Array(nx * nz).fill(Infinity)
  const h = (k) => {
    const dx = Math.abs((k % nx) - gi), dz = Math.abs(((k / nx) | 0) - gj)
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz)
  }
  g[S] = 0
  f[S] = h(S)
  const closed = new Uint8Array(nx * nz)
  let found = S === G
  while (open.length && !found) {
    let bi = 0
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k
    const cur = open[bi]
    open[bi] = open[open.length - 1]
    open.pop()
    if (cur === G) {
      found = true
      break
    }
    closed[cur] = 1
    const i = cur % nx, j = (cur / nx) | 0
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const ni = i + di, nj = j + dj
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue
        const k = nj * nx + ni
        if (blocked[k] || closed[k]) continue
        if (di && dj && (blocked[j * nx + ni] || blocked[nj * nx + i])) continue // no corner cutting
        const ng = g[cur] + (di && dj ? 1.414 : 1)
        if (ng < g[k]) {
          if (g[k] === Infinity) open.push(k)
          g[k] = ng
          f[k] = ng + h(k)
          from[k] = cur
        }
      }
  }
  let cells = []
  if (found) {
    for (let k = G; k !== -1; k = from[k]) cells.push(k)
    cells.reverse()
  }
  // string-pulling: keep a corner only when the straight line to the next one would cross something
  const clear = (x1, z1, x2, z2) => {
    const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / (NAV_CELL * 0.5))
    for (let t = 1; t < n; t++) if (blocked[cj(z1 + ((z2 - z1) * t) / n) * nx + ci(x1 + ((x2 - x1) * t) / n)]) return false
    return true
  }
  const pts = [[a.x, a.z]]
  const mid = cells.map((k) => [cx(k % nx), cz((k / nx) | 0)])
  if (mid.length) {
    pts.push(mid[0])
    let anchor = mid[0]
    for (let k = 1; k < mid.length; k++) {
      if (!clear(anchor[0], anchor[1], mid[k][0], mid[k][1])) {
        anchor = mid[k - 1]
        pts.push(anchor)
      }
    }
    pts.push(mid[mid.length - 1])
  }
  pts.push([b.x, b.z])
  const out = [pts[0]]
  for (const p of pts.slice(1)) {
    const q = out[out.length - 1]
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02) out.push(p)
  }
  if (N.cache.size > 3000) N.cache.clear()
  N.cache.set(key, out)
  return out
}

/** Path from a to b: around every obstacle (A*), or the old lane walk on floors without a grid. */
export function planPath(a, b, L) {
  if (L.seats && L.decor && L.W) return navPath(a, b, L)
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

// ---- campus: every team's room side by side on one ground, corridors between them ------------------
export const CAMPUS_GAP = 3.2 // corridor width between rooms (and around the campus)

/**
 * Places rooms (already sized by their own team) in rows, left-aligned so a "spine" corridor runs down
 * the left edge; the whole campus is centred on the origin. Mutates each layout with ox/oz (its offset)
 * and returns the campus bounds and the corridor geometry used to walk between rooms.
 */
/** Room-local point -> office world (areas are never turned: every name reads the same way). */
export function toWorld(l, x, z) {
  return { x: (l.ox || 0) + x, z: (l.oz || 0) + z }
}

export const AISLE = 3.4 // corridor width (between rooms, between rows and around the office)

/**
 * One office: rooms in rows with corridors between them (like a real floor plan). Rows are balanced
 * by width and every row is stretched a little to the same width, so the outline is a clean
 * rectangle. The top team (entries[0]) sits in the middle of the middle row.
 * `entries`: [{ key, W, D }] natural sizes. Returns sizes and centres per key.
 */
export function planOffice(entries) {
  const A = AISLE
  const n = entries.length
  if (!n) return { rooms: {}, W: 10, D: 10, rows: 0 }
  const R = n <= 2 ? 1 : n <= 4 ? 2 : Math.max(3, Math.ceil(n / 4))
  const mid = Math.floor((R - 1) / 2)
  const cap = Math.ceil(n / R)
  const rows = Array.from({ length: R }, () => [])
  const width = (row) => row.reduce((a, e) => a + e.W, 0) + A * Math.max(0, row.length - 1)
  rows[mid].push(entries[0])
  // widest first into the row that is narrowest so far (keeps the rows about the same width)
  for (const e of entries.slice(1).sort((a, b) => b.W - a.W)) {
    let best = -1
    for (let r = 0; r < R; r++) if (rows[r].length < cap && (best < 0 || width(rows[r]) < width(rows[best]))) best = r
    rows[best].push(e)
  }
  // inside a row: the first one placed sits in the centre, the others alternate left / right
  for (let r = 0; r < R; r++) {
    const row = []
    rows[r].forEach((e, i) => (i % 2 ? row.push(e) : row.unshift(e)))
    rows[r] = row
  }
  const TW = Math.max(...rows.map(width))
  const out = {}
  let z = A
  rows.forEach((row, ri) => {
    const sum = row.reduce((a, e) => a + e.W, 0) || 1
    // a shorter row gets bigger rooms: the office is always a full rectangle, no empty corners
    const free = TW - width(row)
    const d = Math.max(...row.map((e) => e.D))
    let x = A
    row.forEach((e, k) => {
      const w = Math.round((e.W + (free * e.W) / sum) * 10) / 10
      out[e.key] = { W: w, D: d, x: x + w / 2, z: z + d / 2, row: ri, first: k === 0, last: k === row.length - 1 }
      x += w + A
    })
    z += d + A
  })
  const W = TW + 2 * A, D = z
  for (const k in out) (out[k].x -= W / 2), (out[k].z -= D / 2)
  return { rooms: out, W, D, rows: R }
}

/** Office bounds + corridor navigation, once the layouts carry their offsets. */
export function officeFrom(plan, layouts) {
  const list = Object.keys(plan.rooms).map((k) => layouts[k]).filter(Boolean)
  for (const l of list) (l.rot = 0), (l.fw = l.W), (l.fd = l.D)
  const campus = { minX: -plan.W / 2, maxX: plan.W / 2, minZ: -plan.D / 2, maxZ: plan.D / 2, W: plan.W, D: plan.D, rooms: list }
  campus.nav = campusNav(campus)
  return campus
}

// ---- corridors: a coarse grid over the campus with every room blocked, A* door to door
function campusNav(campus) {
  const C = 0.5
  const W = campus.W, D = campus.D
  const nx = Math.ceil(W / C), nz = Math.ceil(D / C)
  const hard = new Uint8Array(nx * nz)
  for (const l of campus.rooms) {
    const i0 = Math.max(0, Math.floor((l.ox - l.fw / 2 + 0.05 + W / 2) / C)), i1 = Math.min(nx - 1, Math.floor((l.ox + l.fw / 2 - 0.05 + W / 2) / C))
    const j0 = Math.max(0, Math.floor((l.oz - l.fd / 2 + 0.05 + D / 2) / C)), j1 = Math.min(nz - 1, Math.floor((l.oz + l.fd / 2 - 0.05 + D / 2) / C))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) hard[j * nx + i] = 1
  }
  return { hard, nx, nz, C, W, D, cache: new Map() }
}

function heapPush(h, f, k) {
  h.push([f, k])
  let i = h.length - 1
  while (i > 0) {
    const p = (i - 1) >> 1
    if (h[p][0] <= h[i][0]) break
    ;[h[p], h[i]] = [h[i], h[p]]
    i = p
  }
}
function heapPop(h) {
  const top = h[0], last = h.pop()
  if (h.length) {
    h[0] = last
    let i = 0
    for (;;) {
      const a = 2 * i + 1, b = a + 1
      let m = i
      if (a < h.length && h[a][0] < h[m][0]) m = a
      if (b < h.length && h[b][0] < h[m][0]) m = b
      if (m === i) break
      ;[h[m], h[i]] = [h[i], h[m]]
      i = m
    }
  }
  return top
}

function navGridPath(nav, a, b) {
  const { hard, nx, nz, C, W, D } = nav
  const cell = (p) => [Math.max(0, Math.min(nx - 1, Math.floor((p.x + W / 2) / C))), Math.max(0, Math.min(nz - 1, Math.floor((p.z + D / 2) / C)))]
  const [si, sj] = cell(a), [gi, gj] = cell(b)
  const S = sj * nx + si, T = gj * nx + gi
  const g = new Float32Array(nx * nz).fill(Infinity)
  const came = new Int32Array(nx * nz).fill(-1)
  const h = []
  g[S] = 0
  heapPush(h, 0, S)
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]
  while (h.length) {
    const [, k] = heapPop(h)
    if (k === T) break
    const i = k % nx, j = (k / nx) | 0
    for (const [di, dj, c] of DIRS) {
      const ni = i + di, nj = j + dj
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue
      const n = nj * nx + ni
      if (hard[n] && n !== T) continue
      if (di && dj && (hard[j * nx + ni] || hard[nj * nx + i])) continue
      const t = g[k] + c
      if (t >= g[n]) continue
      g[n] = t
      came[n] = k
      heapPush(h, t + Math.hypot(gi - ni, gj - nj), n)
    }
  }
  if (came[T] < 0) return [[a.x, a.z], [b.x, b.z]]
  const cells = []
  for (let k = T; k >= 0 && k !== S; k = came[k]) cells.push(k)
  cells.push(S)
  cells.reverse()
  const pts = cells.map((k) => [(k % nx) * C - W / 2 + C / 2, ((k / nx) | 0) * C - D / 2 + C / 2])
  // string-pull: keep only turns whose shortcut would cross a room
  const clear = (p, q) => {
    const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (C / 2))
    for (let s = 1; s < n; s++) {
      const x = p[0] + ((q[0] - p[0]) * s) / n, z = p[1] + ((q[1] - p[1]) * s) / n
      const i = Math.floor((x + W / 2) / C), j = Math.floor((z + D / 2) / C)
      if (hard[j * nx + i]) return false
    }
    return true
  }
  const out = [[a.x, a.z]]
  let anchor = [a.x, a.z]
  for (let i = 1; i < pts.length; i++) {
    if (!clear(anchor, pts[i])) {
      anchor = pts[i - 1]
      out.push(anchor)
    }
  }
  out.push([b.x, b.z])
  return out
}

/** World path from room A's door to room B's door, along the corridors (never through a room). */
export function campusPath(a, b, campus) {
  const door = (l) => toWorld(l, l.elevator.x, l.elevator.z)
  const out = (l) => toWorld(l, l.elevator.x, l.D / 2 + AISLE / 2)
  const A = door(a), B = door(b), oa = out(a), ob = out(b)
  const key = `${a.ox},${a.oz}|${b.ox},${b.oz}`
  const nav = campus.nav
  let mid = nav?.cache.get(key)
  if (!mid) {
    mid = nav ? navGridPath(nav, oa, ob) : [[oa.x, oa.z], [ob.x, ob.z]]
    nav?.cache.set(key, mid)
  }
  const pts = [[A.x, A.z], ...mid, [B.x, B.z]]
  const outp = [pts[0]]
  for (const p of pts.slice(1)) {
    const q = outp[outp.length - 1]
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02) outp.push(p)
  }
  return outp
}
