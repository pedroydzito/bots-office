import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Floor from './Floor'
import Cortex from './Cortex'
import { CAMPUS_GAP } from './layout'
import { CORTEX_KEY, effStatus, resolveColor } from '../lib/constants'
import { ridePositions } from './registry'
import { pathLen, pointAt, rideFor, sessions, syncNow, world } from './sim'
import { getBotAsset } from './shapes'
import { Label } from './Labels'
import { sceneFlags } from './Props'

// The campus: every team in its own room, side by side on one ground, with corridors between them.
// "Todas as salas" shows everything live; "Uma sala" flies to one room and dims the others.

const groundMat = new THREE.MeshStandardMaterial({ color: '#dfe3d6', roughness: 0.95 })
const pathMat = new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.9 })
const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a5a40', roughness: 0.9 })
const crownMats = ['#7cc06a', '#5fae5a', '#8fcf74'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }))
const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.1, 8)
const crownGeo = new THREE.IcosahedronGeometry(1, 1)
const coverMat = new THREE.MeshBasicMaterial({ color: '#0d1220', transparent: true, opacity: 0, depthWrite: false })
const coverGeo = new THREE.BoxGeometry(1, 1, 1)

function Ground({ campus, layouts, order, night }) {
  const G = CAMPUS_GAP
  // corridors: a light path around every room (the gaps between rooms)
  const paths = useMemo(() => {
    const out = []
    for (const k of order) {
      const l = layouts[k]
      if (!l) continue
      out.push({ x: l.ox, z: l.oz, w: l.W + G * 0.9, d: l.D + G * 0.9 })
    }
    return out
  }, [layouts, order, G])
  // a ring of trees around the campus (instanced: two draw calls)
  const trees = useMemo(() => {
    const t = []
    const { minX, maxX, minZ, maxZ } = campus
    const step = 3.4
    let k = 0
    const add = (x, z) => t.push({ x, z, s: 0.8 + ((k * 37) % 7) / 14, m: k++ % 3 })
    for (let x = minX - 1.5; x <= maxX + 1.5; x += step) (add(x, minZ - 2.2), add(x, maxZ + 2.2))
    for (let z = minZ + 1; z <= maxZ - 1; z += step) (add(minX - 2.2, z), add(maxX + 2.2, z))
    return t
  }, [campus])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.36, 0]} receiveShadow material={groundMat}>
        <planeGeometry args={[campus.W + 60, campus.D + 60]} />
      </mesh>
      {paths.map((p, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[p.x, -0.35, p.z]} material={pathMat} receiveShadow>
          <planeGeometry args={[p.w, p.d]} />
        </mesh>
      ))}
      {trees.map((t, i) => (
        <group key={i} position={[t.x, -0.36, t.z]} scale={t.s}>
          <mesh geometry={trunkGeo} material={trunkMat} position={[0, 0.55, 0]} castShadow={!night} />
          <mesh geometry={crownGeo} material={crownMats[t.m]} position={[0, 1.65, 0]} scale={[0.95, 1.1, 0.95]} castShadow={!night} />
        </group>
      ))}
    </group>
  )
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
    <group ref={anchor} position={[l.ox, 0, l.oz - l.D / 2]}>
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
  return <mesh ref={ref} geometry={coverGeo} material={mat} position={[l.ox, 1.7, l.oz]} scale={[l.W + 0.2, 3.5, l.D + 0.2]} renderOrder={5} visible={false} />
}

export default function Campus({ floors, selectedIdx, layouts, campus, data, now, night, selectedBot, spotlight, onSelect, onLongPress, celebrate, overview, onPickRoom }) {
  const sel = floors[selectedIdx]
  const order = useMemo(() => floors.map((f) => f.key), [floors])
  sceneFlags.compact = true // no point lights per lamp: many rooms on screen
  return (
    <group>
      <Ground campus={campus} layouts={layouts} order={order} night={night} />
      <Walkers data={data} followed={selectedBot} />
      {floors.map((f) => {
        const l = layouts[f.key]
        if (!l) return null
        const focus = !overview && sel?.key === f.key
        return (
          <group key={f.key}>
            <group position={[l.ox, 0, l.oz]}>
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
            <Cover l={l} on={!overview && !focus} />
            <RoomChip f={f} l={l} data={data} now={now} dim={!overview && !focus} onPick={onPickRoom} />
          </group>
        )
      })}
    </group>
  )
}
