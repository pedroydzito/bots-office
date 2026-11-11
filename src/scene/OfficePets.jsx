import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AISLE, navGridPath, planPath, toWorld } from './layout'
import { hash, pathLen, pointAt, syncNow } from './sim'
import { botWorld } from './registry'
import { Label } from './Labels'

// The office pets. They live in the whole office and mostly sleep: each one picks a cosy spot in
// some room (by the sofa, on a rug, next to a bot's desk), naps there for a couple of minutes,
// wakes up, stretches, walks the corridors to another room and settles down again. Cats groom
// themselves and now and then the two cats meet, one swats the other and they dash off; dogs sit
// up, wag and tilt their heads. Everything is a function of time, so all screens agree, and a walk
// always fits in its episode (no jumping from one spot to another).

const m = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r })
const KINDS = [
  { kind: 'dog', name: 'golden', fur: m('#d9a25f'), dark: m('#b07b3e'), size: 1.0, speed: 1.2 },
  { kind: 'cat', name: 'ginger', fur: m('#f0a35a'), dark: m('#d07f34'), size: 0.82, speed: 1.0 },
  { kind: 'dog', name: 'dalmatian', fur: m('#f4f1ec'), dark: m('#2b2b2e'), size: 0.9, speed: 1.25 },
  { kind: 'cat', name: 'grey', fur: m('#9aa1ab'), dark: m('#6b727c'), size: 0.78, speed: 0.95 },
  { kind: 'dog', name: 'corgi', fur: m('#e09a52'), dark: m('#fff4e6'), size: 0.78, speed: 1.1 },
]
const eyeM = new THREE.MeshBasicMaterial({ color: '#1b1b1b' })
const noseM = new THREE.MeshBasicMaterial({ color: '#2a2020' })
const sph = new THREE.SphereGeometry(1, 14, 10)
const cone = new THREE.ConeGeometry(1, 1, 8)
const cyl = new THREE.CylinderGeometry(1, 1, 1, 8)

const EP = 150000 // one episode: stretch, walk, then rest for the rest of it (ms)
const STRETCH = 2600

function roomAt(rooms, x, z) {
  for (const l of rooms) if (Math.abs(x - l.ox) < l.W / 2 - 0.2 && Math.abs(z - l.oz) < l.D / 2 - 0.2) return l
  return null
}

/** Walk inside one room around the furniture (room-local planner, world points out). */
function inRoom(l, a, b) {
  const loc = (p) => ({ x: p.x - l.ox, z: p.z - l.oz })
  return planPath(loc(a), loc(b), l).map(([x, z]) => [x + l.ox, z + l.oz])
}

/** Walkable route: around furniture, through the doors and along the corridors. */
function route(campus, rooms, a, b) {
  const ra = roomAt(rooms, a.x, a.z), rb = roomAt(rooms, b.x, b.z)
  if (ra && ra === rb) return inRoom(ra, a, b)
  const out = (l) => toWorld(l, l.elevator.x, l.D / 2 + AISLE / 2)
  const inn = (l) => toWorld(l, l.elevator.x, l.elevator.z)
  let pts = [[a.x, a.z]]
  let from = a
  if (ra) {
    pts = inRoom(ra, a, inn(ra))
    const o = out(ra)
    pts.push([o.x, o.z])
    from = o
  }
  const to = rb ? out(rb) : b
  if (campus.nav) for (const p of navGridPath(campus.nav, from, to).slice(1)) pts.push(p)
  else pts.push([to.x, to.z])
  if (rb) for (const p of inRoom(rb, inn(rb), b)) pts.push(p)
  return pts
}

const FOOT = { meeting: 1.4, vending: 0.8, printer: 0.7, pool: 2.0, pingpong: 2.0, foosball: 1.2, arcade: 0.9, bench: 1.0, armchair: 0.8, beanbag: 0.7, plant: 0.6, bookcase: 1.1, lamp: 0.5, rug: 0 }
/** Cosy spots in every room: on the sofa, next to a desk, and one clear patch of floor. */
function napSpots(rooms) {
  const s = []
  for (const l of rooms) {
    // on the sofa cushions (they hop up and curl there)
    for (const p of l.pois) if (p.kind === 'sofa') s.push({ ...toWorld(l, p.x, p.z + 0.1), y: 0.44, room: l, sofa: true })
    const st = l.seats[hash(l.variant + 'p') % Math.max(1, l.seats.length)]
    if (st) s.push({ ...toWorld(l, st.x + 0.85, (st.az ?? st.z) + 0.25), room: l, desk: true })
    // a clear patch of floor: away from furniture, desks and walls
    const free = (x, z) =>
      Math.abs(x) < l.W / 2 - 1.2 && Math.abs(z) < l.D / 2 - 1.2 &&
      (l.decor || []).every((d) => Math.hypot(d.x - x, d.z - z) > (FOOT[d.type] ?? 0.8) + 0.5) &&
      (l.rows || []).every((r) => !(x > r.x1 - 0.8 && x < r.x2 + 0.8 && z > r.z - 1.2 && z < r.z + 1.8)) &&
      (!l.lounge || Math.hypot(l.lounge.x - x, l.lounge.z - z) > 2.4)
    let found = null
    for (let k = 0; k < 60 && !found; k++) {
      const x = ((hash(`${l.variant}|fx|${k}`) % 1000) / 1000 - 0.5) * (l.W - 2.4)
      const z = ((hash(`${l.variant}|fz|${k}`) % 1000) / 1000 - 0.5) * (l.D - 2.4)
      if (free(x, z)) found = { ...toWorld(l, x, z), room: l }
    }
    if (found) s.push(found)
  }
  return s
}

/** What a pet does at time T: where, and in which pose. Pure function of time. */
function petAt(spec, idx, cats, spots, campus, rooms, cache, T) {
  const ep = Math.floor((T + idx * 37000) / EP)
  const tIn = (T + idx * 37000) - ep * EP
  // the two cats meet for a play date every few episodes (same spot, facing each other)
  const play = spec.kind === 'cat' && cats.length > 1 && hash(`play|${ep}`) % 4 === 0
  const spotFor = (e) => {
    if (spec.kind === 'cat' && cats.length > 1 && hash(`play|${e}`) % 4 === 0) {
      const base = spots[hash(`playspot|${e}`) % spots.length]
      const k = cats.indexOf(spec.name)
      return { ...base, x: base.x + (k ? 0.35 : -0.35) }
    }
    // every pet in its own spot: one shared shuffle per episode, each pet a different slot
    const step = Math.max(1, Math.floor(spots.length / 5))
    return spots[(hash(`pets|${e}`) + idx * step) % spots.length]
  }
  let pl = cache.get(ep)
  if (!pl) {
    const a = spotFor(ep - 1), b = spotFor(ep)
    const pts = route(campus, rooms, a, b)
    const len = pathLen(pts)
    // the walk must fit: never more than 40 % of the episode (hurry if the trip is long)
    const prevPlay = spec.kind === 'cat' && hash(`play|${ep - 1}`) % 4 === 0
    const speed = Math.max(spec.speed * (prevPlay ? 2.4 : 1), len / ((EP * 0.4) / 1000))
    pl = { pts, len, speed, a, b, play, run: prevPlay }
    cache.clear()
    cache.set(ep, pl)
  }
  if (tIn < STRETCH) {
    const p = pointAt(pl.pts, 0)
    return { x: p.x, z: p.z, y: pl.a.y || 0, yaw: null, pose: 'stretch', k: tIn / STRETCH, b: pl.b }
  }
  const d = ((tIn - STRETCH) / 1000) * pl.speed
  if (d < pl.len) {
    const p = pointAt(pl.pts, d)
    return { x: p.x, z: p.z, yaw: p.yaw, pose: pl.run ? 'run' : 'walk', b: pl.b }
  }
  const p = pointAt(pl.pts, pl.len)
  // resting: mostly asleep, with a little life in between (20 s blocks)
  const settled = tIn - STRETCH - (pl.len / pl.speed) * 1000
  const y = pl.b.y || 0
  if (pl.play && settled < 22000) return { x: p.x, z: p.z, y, yaw: null, pose: 'swat', b: pl.b, k: settled / 1000 }
  const blk = hash(`${spec.name}|${ep}|${Math.floor(settled / 20000)}`) % 10
  let pose = 'sleep'
  if (settled < 6000) pose = 'sit' // looks around before lying down
  else if (spec.kind === 'cat' && blk < 2) pose = 'groom'
  else if (spec.kind === 'dog' && blk < 3) pose = 'sit'
  return { x: p.x, z: p.z, y, yaw: null, pose: pl.b.sofa && pose === 'sit' ? 'sleep' : pose, b: pl.b }
}

function Pet({ spec, idx, cats, campus, rooms, spots, overview, focusLayout }) {
  const root = useRef(), body = useRef(), head = useRef(), tail = useRef(), legs = useRef([]), zz = useRef()
  const cache = useRef(new Map())
  const yaw = useRef(hash(spec.name) % 6)
  const zState = useRef(false)
  useFrame(() => {
    const g = root.current
    if (!g || !spots.length) return
    const T = syncNow()
    const s = petAt(spec, idx, cats, spots, campus, rooms, cache.current, T)
    const room = roomAt(rooms, s.x, s.z)
    const vis = overview || (room && room === focusLayout)
    g.visible = !!vis
    if (!vis) return
    g.position.set(s.x, s.y || 0, s.z)
    // turn smoothly: walking = along the path; sitting by a desk = toward the nearest bot
    let want = s.yaw
    if (want == null && s.pose === 'sit' && s.b?.desk) {
      let best = null, bd = 1.8
      for (const q of botWorld.values()) {
        const dd = Math.hypot(q.x - s.x, q.z - s.z)
        if (dd < bd) (bd = dd), (best = q)
      }
      if (best) want = Math.atan2(best.x - s.x, best.z - s.z)
    }
    if (s.pose === 'swat') want = cats.indexOf(spec.name) ? -Math.PI / 2 : Math.PI / 2
    if (want != null) yaw.current += Math.atan2(Math.sin(want - yaw.current), Math.cos(want - yaw.current)) * 0.15
    g.rotation.y = yaw.current
    const t = T / 1000 + idx * 1.7
    const P = s.pose
    const moving = P === 'walk' || P === 'run'
    const f = P === 'run' ? 20 : 12
    const lay = P === 'sleep'
    // legs: trot / gallop; stretch = front legs reaching forward; swat = one front paw batting
    legs.current.forEach((l, i) => {
      if (!l) return
      let rx = 0
      if (moving) rx = Math.sin(t * f + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * (P === 'run' ? 0.9 : 0.6)
      if (P === 'stretch' && i < 2) rx = -0.9 * Math.sin(Math.min(1, s.k * 1.4) * Math.PI)
      if (P === 'swat' && i === 0) rx = -1.2 - Math.max(0, Math.sin(t * 7)) * 0.9
      if (P === 'groom' && i === 0) rx = -1.4
      l.rotation.x = rx
      l.visible = !lay
    })
    if (body.current) {
      const b = body.current
      b.position.y = lay ? 0.11 : moving ? 0.3 + Math.abs(Math.sin(t * f)) * (P === 'run' ? 0.06 : 0.03) : 0.3
      // stretch: chest down, rear up; sit: rear down
      b.rotation.x = P === 'stretch' ? 0.35 * Math.sin(Math.min(1, s.k * 1.4) * Math.PI) : P === 'sit' || P === 'groom' || P === 'swat' ? -0.45 : 0
      b.scale.set(lay ? 1.15 : 1, lay ? 0.72 + Math.sin(t * 1.4) * 0.035 : 1, lay ? 0.85 : 1) // breathing while asleep
      b.rotation.z = lay ? 0.25 : 0
    }
    if (head.current) {
      const h = head.current
      h.position.y = lay ? 0.14 : P === 'stretch' ? 0.38 : P === 'sit' || P === 'groom' || P === 'swat' ? 0.62 : 0.48
      h.position.z = lay ? 0.22 : 0.26
      h.rotation.z = P === 'sit' && spec.kind === 'dog' ? Math.sin(t * 1.3) * 0.18 : 0 // head tilt
      h.rotation.x = P === 'groom' ? 0.5 + Math.sin(t * 9) * 0.15 : lay ? 0.3 : P === 'stretch' ? -0.3 : 0 // licking / yawning
      h.rotation.y = P === 'groom' ? -0.6 : 0
    }
    if (tail.current) {
      const wag = spec.kind === 'dog' ? (P === 'sit' ? 14 : moving ? 9 : 2) : moving ? 3 : 1.4
      tail.current.rotation.y = Math.sin(t * wag) * (spec.kind === 'dog' && P === 'sit' ? 0.8 : 0.3)
    }
    if (zz.current) {
      if (lay !== zState.current) {
        zState.current = lay
        zz.current.visible = lay
      }
    }
  })
  const sz = spec.size
  const cat = spec.kind === 'cat'
  return (
    <group ref={root} scale={sz}>
      <group ref={body} position={[0, 0.3, 0]}>
        <mesh geometry={sph} material={spec.fur} scale={[0.17, 0.15, 0.3]} castShadow />
        {spec.name === 'dalmatian' && [[0.08, 0.06, 0.05], [-0.1, 0.04, -0.12], [0.02, 0.11, -0.2]].map((q, i) => (
          <mesh key={i} geometry={sph} material={spec.dark} position={q} scale={0.045} />
        ))}
        <group ref={tail} position={[0, 0.06, -0.28]}>
          <mesh geometry={cyl} material={cat ? spec.fur : spec.dark} position={[0, cat ? 0.14 : 0.06, -0.08]} rotation={[cat ? -0.3 : -0.9, 0, 0]} scale={[0.03, cat ? 0.32 : 0.2, 0.03]} />
        </group>
      </group>
      <group ref={head} position={[0, 0.48, 0.26]}>
        <mesh geometry={sph} material={spec.fur} scale={cat ? [0.13, 0.12, 0.12] : [0.13, 0.13, 0.14]} castShadow />
        {!cat && <mesh geometry={sph} material={spec.fur} position={[0, -0.03, 0.12]} scale={[0.07, 0.06, 0.08]} />}
        <mesh geometry={sph} material={noseM} position={[0, -0.01, cat ? 0.12 : 0.2]} scale={0.022} />
        {[-1, 1].map((k) => (
          <mesh key={'e' + k} geometry={sph} material={eyeM} position={[k * 0.05, 0.03, 0.11]} scale={0.018} />
        ))}
        {[-1, 1].map((k) =>
          cat ? (
            <mesh key={'r' + k} geometry={cone} material={spec.dark} position={[k * 0.07, 0.12, 0]} scale={[0.04, 0.08, 0.03]} />
          ) : (
            <mesh key={'r' + k} geometry={sph} material={spec.dark} position={[k * 0.12, 0.02, -0.01]} rotation={[0, 0, k * 0.3]} scale={[0.035, 0.08, 0.05]} />
          ),
        )}
      </group>
      {[[-0.08, 0.17], [0.08, 0.17], [-0.08, -0.17], [0.08, -0.17]].map(([x, z], i) => (
        <group key={i} ref={(l) => (legs.current[i] = l)} position={[x, 0.2, z]}>
          <mesh geometry={cyl} material={spec.name === 'corgi' ? spec.dark : spec.fur} position={[0, -0.1, 0]} scale={[0.035, 0.2, 0.035]} />
        </group>
      ))}
      <group ref={zz} position={[0, 0.5, 0]} visible={false}>
        <Label anchor={zz} y={0} factor={7}>
          <div className="pet-z" aria-hidden="true"><i>z</i><i>z</i><i>z</i></div>
        </Label>
      </group>
    </group>
  )
}

export default function OfficePets({ campus, layouts, floors, overview, focusLayout }) {
  const rooms = useMemo(() => floors.map((f) => layouts[f.key]).filter(Boolean), [floors, layouts])
  const spots = useMemo(() => napSpots(rooms), [rooms])
  // one pet for every two rooms (2 to 5): always dogs and cats
  const n = Math.max(2, Math.min(KINDS.length, Math.round(rooms.length / 2) + 1))
  const list = KINDS.slice(0, n)
  const cats = list.filter((k) => k.kind === 'cat').map((k) => k.name)
  return (
    <group>
      {list.map((k, i) => (
        <Pet key={k.name} spec={k} idx={i} cats={cats} campus={campus} rooms={rooms} spots={spots} overview={overview} focusLayout={focusLayout} />
      ))}
    </group>
  )
}
