import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Floor, { wallMat } from './Floor'
import Cortex from './Cortex'
import { CORTEX_KEY, effStatus, resolveColor } from '../lib/constants'
import { frozenRooms, ridePositions } from './registry'
import { pathLen, pointAt, rideFor, sessions, syncNow, world } from './sim'
import { getBotAsset } from './shapes'
import { Label } from './Labels'
import { sceneFlags } from './Props'

// The campus: every team in its own room, side by side on one ground, with corridors between them.
// "Todas as salas" shows everything live; "Uma sala" flies to one room and dims the others.

const hallMat = new THREE.MeshStandardMaterial({ color: '#e9e6e1', roughness: 0.7 })
const slabMat = new THREE.MeshStandardMaterial({ color: '#dcdfe4', roughness: 0.85 })
const coverMat = new THREE.MeshBasicMaterial({ color: '#0d1220', transparent: true, opacity: 0, depthWrite: false })
const coverGeo = new THREE.BoxGeometry(1, 1, 1)

// soft round shadow under the office (a radial gradient), so it sits on the background like a model
let shadowTex = null
function shadowTexture() {
  if (shadowTex) return shadowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const r = g.createRadialGradient(64, 64, 10, 64, 64, 64)
  r.addColorStop(0, 'rgba(20,28,45,0.28)')
  r.addColorStop(0.6, 'rgba(20,28,45,0.12)')
  r.addColorStop(1, 'rgba(20,28,45,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  shadowTex = new THREE.CanvasTexture(c)
  return shadowTex
}

/** The office itself: one slab, the aisles' floor, a low rim all around and a soft shadow under it. */
function Ground({ campus }) {
  const { W, D } = campus
  const rim = useMemo(() => {
    const t = 0.2, h = 0.34, e = 0.1
    return [
      [0, -D / 2 - e, W + 2 * e + t, t],
      [0, D / 2 + e, W + 2 * e + t, t],
      [-W / 2 - e, 0, t, D + 2 * e],
      [W / 2 + e, 0, t, D + 2 * e],
    ].map(([x, z, w, d]) => ({ x, z, w, d, h }))
  }, [W, D])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.37, 0]} renderOrder={-1}>
        <planeGeometry args={[W * 1.5 + 8, D * 1.5 + 8]} />
        <meshBasicMaterial map={shadowTexture()} transparent depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.2, 0]} material={slabMat} receiveShadow>
        <boxGeometry args={[W + 0.6, 0.34, D + 0.6]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} material={hallMat} receiveShadow>
        <planeGeometry args={[W, D]} />
      </mesh>
      {rim.map((r, i) => (
        <mesh key={i} position={[r.x, r.h / 2 - 0.03, r.z]} material={wallMat} castShadow receiveShadow>
          <boxGeometry args={[r.w, r.h, r.d]} />
        </mesh>
      ))}
    </group>
  )
}

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
      <Ground campus={campus} />
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
