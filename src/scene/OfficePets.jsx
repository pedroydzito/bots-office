import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AISLE, navGridPath, toWorld } from './layout'
import { hash, pathLen, pointAt, syncNow } from './sim'
import { botWorld } from './registry'

// The office pets: a few dogs and cats of different breeds that live in the whole office, not in
// one room. Each walks the corridors, goes into rooms through the doors, sits next to a bot
// waiting for a pat, or curls up somewhere for a nap. Their day is a function of time only, so
// every screen sees the same pets in the same places.

const m = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r })
const KINDS = [
  { kind: 'dog', name: 'golden', fur: m('#d9a25f'), dark: m('#b07b3e'), size: 1.0, speed: 1.35 },
  { kind: 'cat', name: 'ginger', fur: m('#f0a35a'), dark: m('#d07f34'), size: 0.82, speed: 1.0 },
  { kind: 'dog', name: 'dalmatian', fur: m('#f4f1ec'), dark: m('#2b2b2e'), size: 0.9, speed: 1.45 },
  { kind: 'cat', name: 'grey', fur: m('#9aa1ab'), dark: m('#6b727c'), size: 0.78, speed: 0.95 },
  { kind: 'dog', name: 'corgi', fur: m('#e09a52'), dark: m('#fff4e6'), size: 0.78, speed: 1.2 },
]
const eyeM = new THREE.MeshBasicMaterial({ color: '#1b1b1b' })
const noseM = new THREE.MeshBasicMaterial({ color: '#2a2020' })
const sph = new THREE.SphereGeometry(1, 14, 10)
const cone = new THREE.ConeGeometry(1, 1, 8)
const cyl = new THREE.CylinderGeometry(1, 1, 1, 8)

/** Which room a world point is in (or null in the corridors). */
function roomAt(rooms, x, z) {
  for (const l of rooms) if (Math.abs(x - l.ox) < l.W / 2 - 0.2 && Math.abs(z - l.oz) < l.D / 2 - 0.2) return l
  return null
}

/** Walkable route between two world points: through doors and along the corridors. */
function route(campus, rooms, a, b) {
  const ra = roomAt(rooms, a.x, a.z), rb = roomAt(rooms, b.x, b.z)
  if (ra && ra === rb) return [[a.x, a.z], [b.x, b.z]]
  const pts = [[a.x, a.z]]
  const out = (l) => toWorld(l, l.elevator.x, l.D / 2 + AISLE / 2)
  const inn = (l) => toWorld(l, l.elevator.x, l.elevator.z)
  let from = a
  if (ra) {
    const i = inn(ra), o = out(ra)
    pts.push([i.x, i.z], [o.x, o.z])
    from = o
  }
  const to = rb ? out(rb) : b
  if (campus.nav) for (const p of navGridPath(campus.nav, from, to).slice(1)) pts.push(p)
  else pts.push([to.x, to.z])
  if (rb) {
    const i = inn(rb)
    pts.push([i.x, i.z], [b.x, b.z])
  }
  return pts
}

function Pet({ spec, idx, campus, rooms, data, overview, focusLayout }) {
  const root = useRef(), body = useRef(), head = useRef(), tail = useRef(), legs = useRef([])
  const cache = useRef(new Map())
  const yaw = useRef(0)
  // spots: corridor points, nap corners, and the chair of every bot (sit and wait for a pat)
  const spots = useMemo(() => {
    const s = []
    const { W, D } = campus
    for (let i = 0; i < 10; i++) s.push({ x: ((hash(`c${i}`) % 1000) / 1000 - 0.5) * (W - 2), z: -D / 2 + 1.2 + (i % 3) * (D - 2.4) / 2, act: 'walk' })
    for (const l of rooms) {
      if (l.lounge) s.push({ ...toWorld(l, l.lounge.x - 1.2, l.lounge.z + 0.9), act: 'nap' })
      for (const st of l.seats.slice(0, 4)) s.push({ ...toWorld(l, st.x + 0.75, st.az ?? st.z), act: 'pat' })
    }
    return s
  }, [campus, rooms])
  useFrame(() => {
    const g = root.current
    if (!g || !spots.length) return
    const T = syncNow()
    const LEG = 26000 + idx * 3100
    const leg = Math.floor(T / LEG)
    const at = (k) => spots[hash(`pet|${spec.name}|${k}`) % spots.length]
    let pl = cache.current.get(leg)
    if (!pl) {
      const a = at(leg - 1), b = at(leg)
      const pts = route(campus, rooms, a, b)
      pl = { pts, len: pathLen(pts), b }
      cache.current.clear()
      cache.current.set(leg, pl)
    }
    const d = ((T - leg * LEG) / 1000) * spec.speed
    const moving = d < pl.len
    const p = pointAt(pl.pts, Math.min(d, pl.len))
    // hidden when a room is open and the pet is somewhere else
    const room = roomAt(rooms, p.x, p.z)
    const vis = overview || (room && room === focusLayout)
    g.visible = !!vis
    if (!vis) return
    g.position.set(p.x, 0, p.z)
    if (moving && p.yaw != null) yaw.current += Math.atan2(Math.sin(p.yaw - yaw.current), Math.cos(p.yaw - yaw.current)) * 0.2
    // sitting by a bot: face it
    if (!moving && pl.b.act === 'pat') {
      let best = null, bd = 1.6
      for (const q of botWorld.values()) {
        const dd = Math.hypot(q.x - p.x, q.z - p.z)
        if (dd < bd) (bd = dd), (best = q)
      }
      if (best) yaw.current += Math.atan2(Math.sin(Math.atan2(best.x - p.x, best.z - p.z) - yaw.current), Math.cos(Math.atan2(best.x - p.x, best.z - p.z) - yaw.current)) * 0.1
    }
    g.rotation.y = yaw.current
    const t = T / 1000 + idx
    const nap = !moving && pl.b.act === 'nap'
    const sit = !moving && !nap
    // legs trot while moving
    legs.current.forEach((l, i) => {
      if (!l) return
      l.rotation.x = moving ? Math.sin(t * 12 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0
      l.visible = !nap
    })
    if (body.current) {
      body.current.position.y = nap ? 0.12 : moving ? 0.3 + Math.abs(Math.sin(t * 12)) * 0.03 : 0.3
      body.current.rotation.x = sit ? -0.45 : 0
      body.current.scale.y = nap ? 0.75 + Math.sin(t * 1.6) * 0.03 : 1
    }
    if (head.current) {
      head.current.position.y = nap ? 0.16 : sit ? 0.62 : 0.48
      head.current.rotation.z = sit ? Math.sin(t * 1.3) * 0.15 : 0 // tilts its head waiting for a pat
    }
    if (tail.current) tail.current.rotation.y = Math.sin(t * (spec.kind === 'dog' ? (sit ? 14 : 8) : 2)) * (spec.kind === 'dog' ? 0.7 : 0.3)
  })
  const s = spec.size
  const cat = spec.kind === 'cat'
  return (
    <group ref={root} scale={s}>
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
        <mesh geometry={sph} material={noseM} position={[0, cat ? -0.01 : -0.01, cat ? 0.12 : 0.2]} scale={0.022} />
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
    </group>
  )
}

export default function OfficePets({ campus, layouts, floors, data, overview, focusLayout }) {
  const rooms = useMemo(() => floors.map((f) => layouts[f.key]).filter(Boolean), [floors, layouts])
  // one pet for every two rooms (2 to 5), always a mix of dogs and cats
  const n = Math.max(2, Math.min(KINDS.length, Math.round(rooms.length / 2) + 1))
  return (
    <group>
      {KINDS.slice(0, n).map((k, i) => (
        <Pet key={k.name} spec={k} idx={i} campus={campus} rooms={rooms} data={data} overview={overview} focusLayout={focusLayout} />
      ))}
    </group>
  )
}
