import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Floor from './Floor'
import Cortex from './Cortex'
import { CORTEX_KEY, effStatus, resolveColor } from '../lib/constants'
import { frozenRooms, ridePositions } from './registry'
import { pathLen, pointAt, rideFor, sessions, syncNow, world } from './sim'
import { getBotAsset } from './shapes'
import { Label } from './Labels'
import { sceneFlags } from './Props'

// The campus: every team in its own room, side by side on one ground, with corridors between them.
// "Todas as salas" shows everything live; "Uma sala" flies to one room and dims the others.

const groundMat = new THREE.MeshStandardMaterial({ color: '#cfe3b6', roughness: 1 })
const hallMat = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.75 })
const hallEdgeMat = new THREE.MeshStandardMaterial({ color: '#d9dde3', roughness: 0.8 })
const glassMat = new THREE.MeshStandardMaterial({ color: '#cfe6f5', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false })
const roadMat = new THREE.MeshStandardMaterial({ color: '#a7adb6', roughness: 0.95 })
const lineMat = new THREE.MeshBasicMaterial({ color: '#f5f6f8' })
const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a5a40', roughness: 0.9 })
const crownMats = ['#7cc06a', '#5fae5a', '#8fcf74'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }))
const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.1, 8)
const crownGeo = new THREE.IcosahedronGeometry(1, 1)
const coverMat = new THREE.MeshBasicMaterial({ color: '#0d1220', transparent: true, opacity: 0, depthWrite: false })
const coverGeo = new THREE.BoxGeometry(1, 1, 1)
const boxGeo = new THREE.BoxGeometry(1, 1, 1)
const poleMat = new THREE.MeshStandardMaterial({ color: '#59606b', roughness: 0.6 })
const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd58a', emissiveIntensity: 0 })
const roofMat = new THREE.MeshStandardMaterial({ color: '#e6e8ec', roughness: 0.7 })
const CAR_COLORS = ['#e45858', '#3d7be0', '#f2f2f2', '#2b2f36', '#f0b429', '#7a8794', '#3fa66b', '#c9ccd1']
const carMats = CAR_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.2 }))
const cabinMat = new THREE.MeshStandardMaterial({ color: '#2a3442', roughness: 0.2, metalness: 0.3 })

/** One instanced mesh from a list of {x,y,z,w,h,d,ry} boxes. */
function Boxes({ items, material, cast = false }) {
  const ref = useRef()
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    items.forEach((b, i) => {
      o.position.set(b.x, b.y, b.z)
      o.rotation.set(0, b.ry || 0, 0)
      o.scale.set(b.w, b.h, b.d)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [items])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[boxGeo, material, items.length]} castShadow={cast} receiveShadow />
}

/** The office building around the rooms, and the street, parking garage and city outside. */
function Ground({ campus, layouts, order, night, nightness = 0 }) {
  const { W, D } = campus
  const M = 6 // street ring distance from the building
  const RW = 3.4 // road width
  // inner hall: one floor slab for the whole office, a thin glass façade around it
  const glass = useMemo(() => {
    const t = 0.08, h = 1.1
    return [
      { x: 0, y: h / 2, z: -D / 2, w: W, h, d: t },
      { x: 0, y: h / 2, z: D / 2, w: W, h, d: t },
      { x: -W / 2, y: h / 2, z: 0, w: t, h, d: D },
      { x: W / 2, y: h / 2, z: 0, w: t, h, d: D },
    ]
  }, [W, D])
  const posts = useMemo(() => {
    const out = []
    for (let x = -W / 2; x <= W / 2 + 0.01; x += 3) out.push({ x, y: 0.6, z: -D / 2, w: 0.1, h: 1.2, d: 0.1 }, { x, y: 0.6, z: D / 2, w: 0.1, h: 1.2, d: 0.1 })
    for (let z = -D / 2 + 3; z < D / 2; z += 3) out.push({ x: -W / 2, y: 0.6, z, w: 0.1, h: 1.2, d: 0.1 }, { x: W / 2, y: 0.6, z, w: 0.1, h: 1.2, d: 0.1 })
    return out
  }, [W, D])
  // street ring with dashed centre line
  const R = useMemo(() => ({ x1: -W / 2 - M, x2: W / 2 + M, z1: -D / 2 - M, z2: D / 2 + M }), [W, D])
  const dashes = useMemo(() => {
    const out = []
    for (let x = R.x1 + 1; x < R.x2 - 1; x += 2.2) out.push({ x, y: -0.33, z: R.z1, w: 1, h: 0.01, d: 0.12 }, { x, y: -0.33, z: R.z2, w: 1, h: 0.01, d: 0.12 })
    for (let z = R.z1 + 1; z < R.z2 - 1; z += 2.2) out.push({ x: R.x1, y: -0.33, z, w: 0.12, h: 0.01, d: 1 }, { x: R.x2, y: -0.33, z, w: 0.12, h: 0.01, d: 1 })
    return out
  }, [R])
  // parking garage on the far-left side: covered bays, stall lines and parked cars
  const park = useMemo(() => {
    const x0 = R.x1 - RW / 2 - 1.2, depth = 6.5
    const cx = x0 - depth / 2
    const len = Math.min(D + 6, 30)
    const stalls = [], cars = [], cabins = [], pillars = []
    let k = 0
    for (let z = -len / 2 + 1.3; z < len / 2 - 1; z += 2.6) {
      stalls.push({ x: cx, y: -0.33, z: z - 1.3, w: depth - 0.6, h: 0.01, d: 0.08 })
      if ((k * 7) % 5 !== 2) {
        const ry = Math.PI / 2
        cars.push({ x: cx + 0.2, y: -0.05, z, w: 1.9, h: 0.55, d: 3.6, ry: 0, m: k % CAR_COLORS.length })
        cabins.push({ x: cx + 0.35, y: 0.38, z, w: 1.6, h: 0.45, d: 1.9 })
        void ry
      }
      k++
    }
    for (let z = -len / 2; z <= len / 2 + 0.01; z += 5.2) pillars.push({ x: cx - depth / 2 + 0.3, y: 1.0, z, w: 0.25, h: 2.7, d: 0.25 }, { x: cx + depth / 2 - 0.3, y: 1.0, z, w: 0.25, h: 2.7, d: 0.25 })
    return { cx, len, depth, stalls, cars, cabins, pillars }
  }, [R, D])
  // trees on the lawn outside the street, and lamp posts along it
  const trees = useMemo(() => {
    const t = []
    let k = 0
    const add = (x, z) => t.push({ x, z, s: 0.8 + ((k * 37) % 7) / 14, m: k++ % 3 })
    const o = RW / 2 + 2.2
    for (let x = R.x1; x <= R.x2; x += 3.6) (add(x, R.z1 - o), add(x, R.z2 + o))
    for (let z = R.z1 + 2; z <= R.z2 - 2; z += 3.6) add(R.x2 + o, z)
    // a few in the inner verge
    for (let x = R.x1 + 4; x < R.x2 - 3; x += 7.5) (add(x, R.z1 + RW / 2 + 1.3), add(x, R.z2 - RW / 2 - 1.3))
    return t
  }, [R])
  const lamps = useMemo(() => {
    const out = []
    for (let x = R.x1 + 3; x < R.x2 - 2; x += 8) out.push([x, R.z1 + RW / 2 + 0.4], [x, R.z2 - RW / 2 - 0.4])
    for (let z = R.z1 + 6; z < R.z2 - 4; z += 8) out.push([R.x2 - RW / 2 - 0.4, z])
    return out
  }, [R])
  const poles = useMemo(() => lamps.map(([x, z]) => ({ x, y: 1.1, z, w: 0.08, h: 2.9, d: 0.08 })), [lamps])
  const bulbs = useMemo(() => lamps.map(([x, z]) => ({ x, y: 2.6, z, w: 0.38, h: 0.12, d: 0.38 })), [lamps])
  useFrame(() => {
    bulbMat.emissiveIntensity = nightness * 2.2
  })
  const carsBy = useMemo(() => CAR_COLORS.map((_, i) => park.cars.filter((c) => c.m === i)), [park])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.37, 0]} receiveShadow material={groundMat}>
        <planeGeometry args={[W + 160, D + 160]} />
      </mesh>
      {/* street ring */}
      {[
        [0, R.z1, R.x2 - R.x1 + RW, RW],
        [0, R.z2, R.x2 - R.x1 + RW, RW],
        [R.x1, 0, RW, R.z2 - R.z1],
        [R.x2, 0, RW, R.z2 - R.z1],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.345, z]} material={roadMat} receiveShadow>
          <planeGeometry args={[w, d]} />
        </mesh>
      ))}
      <Boxes items={dashes} material={lineMat} />
      {/* the office building: hall floor, edge and glass façade */}
      <mesh position={[0, -0.2, 0]} material={hallEdgeMat} receiveShadow>
        <boxGeometry args={[W + 0.6, 0.3, D + 0.6]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} material={hallMat} receiveShadow>
        <planeGeometry args={[W, D]} />
      </mesh>
      <Boxes items={glass} material={glassMat} />
      <Boxes items={posts} material={poleMat} />
      {/* parking garage */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[park.cx, -0.34, 0]} material={roadMat} receiveShadow>
        <planeGeometry args={[park.depth, park.len]} />
      </mesh>
      <mesh position={[park.cx, 2.4, 0]} material={roofMat} castShadow={!night} receiveShadow>
        <boxGeometry args={[park.depth, 0.18, park.len]} />
      </mesh>
      <Boxes items={park.stalls} material={lineMat} />
      <Boxes items={park.pillars} material={poleMat} cast={!night} />
      {carsBy.map((list, i) => <Boxes key={i} items={list} material={carMats[i]} cast={!night} />)}
      <Boxes items={park.cabins} material={cabinMat} />
      {/* street lamps */}
      <Boxes items={poles} material={poleMat} />
      <Boxes items={bulbs} material={bulbMat} />
      {trees.map((t, i) => (
        <group key={i} position={[t.x, -0.36, t.z]} scale={t.s}>
          <mesh geometry={trunkGeo} material={trunkMat} position={[0, 0.55, 0]} castShadow={!night} />
          <mesh geometry={crownGeo} material={crownMats[t.m]} position={[0, 1.65, 0]} scale={[0.95, 1.1, 0.95]} castShadow={!night} />
        </group>
      ))}
      <City campus={campus} nightness={nightness} />
    </group>
  )
}

// other office towers in the distance: pale, see-through silhouettes (windows light up at night)
const cityMat = new THREE.MeshBasicMaterial({ color: '#b9c4d3', transparent: true, opacity: 0.35, depthWrite: false, fog: false })
const cityWinMat = new THREE.MeshBasicMaterial({ color: '#ffd79a', transparent: true, opacity: 0, depthWrite: false, fog: false })
function City({ campus, nightness }) {
  const { towers, wins } = useMemo(() => {
    const out = [], w = []
    let seed = 11
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    const R0 = Math.max(campus.W, campus.D) / 2 + 48
    for (let i = 0; i < 34; i++) {
      // only behind the campus (north and west): never between the camera and the office
      const a = Math.PI * (0.95 + (i / 34) * 0.85) + (rnd() - 0.5) * 0.08
      const r = R0 + rnd() * 26
      const bw = 5 + rnd() * 7, bh = 7 + rnd() * 20, bd = 5 + rnd() * 7
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      out.push({ x, y: bh / 2 - 0.4, z, w: bw, h: bh, d: bd, ry: rnd() })
      for (let f = 2; f < bh - 1; f += 2.2) if (rnd() < 0.55) w.push({ x, y: f, z, w: bw * 1.01, h: 0.5, d: bd * 1.01, ry: out[out.length - 1].ry })
    }
    return { towers: out, wins: w }
  }, [campus.W, campus.D])
  useFrame(() => {
    cityMat.opacity = 0.26 + nightness * 0.2
    cityMat.color.set('#b9c4d3').lerp(_night, nightness)
    cityWinMat.opacity = nightness * 0.55
  })
  return (
    <group>
      <Boxes items={towers} material={cityMat} />
      <Boxes items={wins} material={cityWinMat} />
    </group>
  )
}
const _night = new THREE.Color('#1c2438')

/** One warm ceiling light per room at night (fixed count: no shader recompiles). */
function RoomLight({ l, nightness, on }) {
  const ref = useRef()
  useFrame(() => {
    if (ref.current) ref.current.intensity = on ? nightness * 9 : 0
  })
  return <pointLight ref={ref} position={[l.ox, 2.9, l.oz]} distance={Math.max(l.W, l.D) * 0.95} decay={1.2} color="#ffdcae" intensity={0} />
}

/** Bots on their way between rooms, walking the corridors (same clock on every screen). */
function Walkers({ data, followed }) {
  const MAX = 6
  const refs = useRef([])
  const mats = useMemo(() => Array.from({ length: MAX }, () => new THREE.MeshStandardMaterial({ roughness: 0.38 })), [])
  useFrame(() => {
    const now = syncNow()
    const live = []
    for (const s of sessions(data, now)) {
      const r = rideFor(s)
      if (!r || !world.hallPath) continue
      const b = data.bots?.[s.from]
      if (now >= r.goStart && now < r.goEnd) live.push({ name: s.from, pts: world.hallPath(r.la, r.lb), k: (now - r.goStart) / (r.goEnd - r.goStart), b })
      else if (now >= r.backStart && now < r.backEnd) live.push({ name: s.from, pts: world.hallPath(r.lb, r.la), k: (now - r.backStart) / (r.backEnd - r.backStart), b })
    }
    ridePositions.clear()
    for (let i = 0; i < MAX; i++) {
      const m = refs.current[i]
      if (!m) continue
      const w = live[i]
      if (!w) {
        m.visible = false
        continue
      }
      const len = pathLen(w.pts)
      const p = pointAt(w.pts, Math.min(len, len * w.k))
      if (m.userData.key !== w.name) {
        m.userData.key = w.name
        m.geometry = getBotAsset(w.b?.shape).geometry
        mats[i].color.set(resolveColor(w.b?.color))
      }
      m.visible = true
      m.position.set(p.x, Math.abs(Math.sin(now / 90 + i)) * 0.06, p.z)
      if (p.yaw != null) m.rotation.y = p.yaw
      ridePositions.set(w.name, new THREE.Vector3(p.x, 0.8, p.z))
    }
    void followed
  })
  return (
    <group>
      {Array.from({ length: MAX }, (_, i) => (
        <mesh key={i} ref={(m) => (refs.current[i] = m)} material={mats[i]} visible={false} castShadow />
      ))}
    </group>
  )
}

/** Room name chip floating over the back wall: name, how many are working, click to open the room. */
function RoomChip({ f, l, data, now, dim, onPick }) {
  const anchor = useRef()
  const working = f.key === CORTEX_KEY ? null : f.bots.filter((n) => effStatus(data.bots[n], now) === 'working').length
  const waiting = f.key === CORTEX_KEY ? 0 : f.bots.filter((n) => effStatus(data.bots[n], now) === 'waiting_user').length
  return (
    <group ref={anchor} position={[l.ox, 0, l.oz - l.fd / 2]}>
      <Label anchor={anchor} y={3.7} fixed>
        <button className={`room-chip ${dim ? 'dim' : ''}`} style={{ '--team': f.color }} onClick={() => onPick(f.key)}>
          <i />
          <b>{f.name}</b>
          {working != null && <em>{working}/{f.bots.length}</em>}
          {waiting > 0 && <span className="rc-wait">{waiting}</span>}
        </button>
      </Label>
    </group>
  )
}

/** Dims a room that is not the one in focus (a translucent box over it, cheap). */
function Cover({ l, on }) {
  const ref = useRef()
  const mat = useMemo(() => coverMat.clone(), [])
  useFrame((_, dt) => {
    const want = on ? 0.55 : 0
    mat.opacity += (want - mat.opacity) * Math.min(1, dt * 6)
    if (ref.current) ref.current.visible = mat.opacity > 0.01
  })
  return <mesh ref={ref} geometry={coverGeo} material={mat} position={[l.ox, 1.7, l.oz]} scale={[l.fw + 0.2, 3.5, l.fd + 0.2]} renderOrder={5} visible={false} />
}

export default function Campus({ floors, selectedIdx, layouts, campus, data, now, night, nightness = 0, low, selectedBot, spotlight, onSelect, onLongPress, celebrate, overview, onPickRoom }) {
  const sel = floors[selectedIdx]
  const order = useMemo(() => floors.map((f) => f.key), [floors])
  sceneFlags.compact = true // no point lights per lamp: many rooms on screen
  // one room open: every other room freezes (bots and pets stop) to save the GPU/CPU
  useEffect(() => {
    frozenRooms.clear()
    if (!overview) for (const f of floors) if (f.key !== sel?.key && layouts[f.key]) frozenRooms.add(layouts[f.key])
    return () => frozenRooms.clear()
  }, [overview, sel?.key, floors, layouts])
  const lightsOn = !low
  return (
    <group>
      <Ground campus={campus} layouts={layouts} order={order} night={night} nightness={nightness} />
      <Walkers data={data} followed={selectedBot} />
      {floors.map((f) => {
        const l = layouts[f.key]
        if (!l) return null
        const focus = !overview && sel?.key === f.key
        return (
          <group key={f.key}>
            <group
              position={[l.ox, 0, l.oz]}
              rotation={[0, l.rot || 0, 0]}
              onClick={(e) => {
                // a click on a room (not a drag) opens it
                if (focus || e.delta > 6) return
                e.stopPropagation()
                onPickRoom(f.key)
              }}
            >
              {f.key === CORTEX_KEY ? (
                <Cortex layout={l} cortex={data.cortex} floorNum={f.num} floorY={0} night={night} />
              ) : (
                <Floor
                  floor={f}
                  layout={l}
                  data={data}
                  now={now}
                  floorY={0}
                  night={night}
                  selectedBot={selectedBot}
                  spotlight={spotlight}
                  onSelect={onSelect}
                  onLongPress={onLongPress}
                  floorCount={floors.length}
                  compact={!focus}
                  celebrate={celebrate && celebrate.key === f.key ? celebrate.t : null}
                />
              )}
            </group>
            {lightsOn && <RoomLight l={l} nightness={nightness} on={overview || focus} />}
            <Cover l={l} on={!overview && !focus} />
            <RoomChip f={f} l={l} data={data} now={now} dim={!overview && !focus} onPick={onPickRoom} />
          </group>
        )
      })}
    </group>
  )
}
