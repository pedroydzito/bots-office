import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../lib/createStore'
import { lookStore } from '../lib/look'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Floor, { focusRoom } from './Floor'
import { Building } from './Lot'
import OfficePets from './OfficePets'
import { effStatus, resolveColor } from '../lib/constants'
import { frozenRooms, ridePositions } from './registry'
import { pathLen, pointAt, rideFor, sessions, syncNow, world } from './sim'
import { getBotAsset } from './shapes'
import { Label } from './Labels'
import { sceneFlags } from './Props'

// The campus: every team in its own room, side by side on one ground, with corridors between them.
// "Todas as salas" shows everything live; "Uma sala" flies to one room and dims the others.

const coverGeo = new THREE.BoxGeometry(1, 1, 1)
const _pm = new THREE.Matrix4(), _fr = new THREE.Frustum()

/** One warm ceiling light per room at night (fixed count: no shader recompiles). */
/**
 * Ceiling lights at night: two real lights (fixed count: no shader recompiles), hung over the
 * desks of the room being looked at (or the middle of the office). The rest of the light comes
 * from the warm pools painted on the floor under each ceiling lamp.
 */
function CeilingLights({ target, nightness }) {
  const a = useRef(), b = useRef()
  useFrame(() => {
    const l = target
    // whole office: every room gets the same even night light (no lights over one room only);
    // one room open: a soft extra over its desks
    const k = 0 // the even night light (Scene) already matches the open-room look everywhere
    for (const [r, dx] of [[a, -0.25], [b, 0.25]]) {
      if (!r.current) continue
      r.current.intensity = k
      if (l) r.current.position.set(l.ox + dx * l.W, 2.9, l.oz - l.D * 0.08)
      r.current.distance = l ? Math.max(l.W, l.D) * 0.85 : 30
    }
  })
  return (
    <>
      <pointLight ref={a} decay={1.1} color="#ffe2bd" intensity={0} castShadow={false} />
      <pointLight ref={b} decay={1.1} color="#ffe2bd" intensity={0} castShadow={false} />
    </>
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
  const working = f.bots.filter((n) => effStatus(data.bots[n], now) === 'working').length
  const waiting = f.bots.filter((n) => effStatus(data.bots[n], now) === 'waiting_user').length
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
/**
 * Darkens everything inside a room that is not in focus: floor, furniture and bots get darker,
 * nothing outside the room does. A stencil "volume" pass: the box's front faces mark the pixels
 * whose surface lies behind them, then its back faces darken those whose surface lies in front of
 * them (= inside the box).
 */
function Cover({ l, on, order }) {
  const front = useRef(), back = useRef()
  const mats = useMemo(() => {
    const mark = new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: false, transparent: true, side: THREE.FrontSide, depthFunc: THREE.LessEqualDepth,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
    })
    const dark = new THREE.MeshBasicMaterial({
      color: '#0b1020', transparent: true, opacity: 0, depthWrite: false, side: THREE.BackSide, depthFunc: THREE.GreaterEqualDepth,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilZPass: THREE.ZeroStencilOp, stencilZFail: THREE.ZeroStencilOp,
    })
    return { mark, dark }
  }, [])
  useFrame((_, dt) => {
    const want = on ? 0.6 : 0
    const m = mats.dark
    m.opacity += (want - m.opacity) * Math.min(1, dt * 6)
    const v = m.opacity > 0.01
    if (front.current) front.current.visible = v
    if (back.current) back.current.visible = v
  })
  const pos = [l.ox, 1.7, l.oz], scale = [l.fw + 0.1, 3.6, l.fd + 0.1]
  return (
    <>
      <mesh ref={front} geometry={coverGeo} material={mats.mark} position={pos} scale={scale} renderOrder={20 + order * 2} visible={false} />
      <mesh ref={back} geometry={coverGeo} material={mats.dark} position={pos} scale={scale} renderOrder={21 + order * 2} visible={false} />
    </>
  )
}

export default function Campus({ floors, selectedIdx, layouts, campus, data, now, night, nightness = 0, low, selectedBot, spotlight, onSelect, onLongPress, celebrate, overview, onPickRoom }) {
  const sel = floors[selectedIdx]
  const look = useStore(lookStore, (l) => l)
  sceneFlags.compact = true // no point lights per lamp: many rooms on screen
  // freeze what doesn't need to move: rooms off screen, and (one room open) every other room.
  // Their bots and pets keep their pose and skip all per-frame work.
  const boxes = useMemo(() => {
    const m = new Map()
    for (const f of floors) {
      const l = layouts[f.key]
      if (l) m.set(l, new THREE.Box3(new THREE.Vector3(l.ox - l.W / 2, 0, l.oz - l.D / 2), new THREE.Vector3(l.ox + l.W / 2, 3.4, l.oz + l.D / 2)))
    }
    return m
  }, [floors, layouts])
  const lastCull = useRef(0)
  useFrame(({ camera, clock }) => {
    if ((performance.now() / 1000) - lastCull.current < 0.25) return
    lastCull.current = (performance.now() / 1000)
    camera.updateMatrixWorld()
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _fr.setFromProjectionMatrix(_pm)
    frozenRooms.clear()
    for (const f of floors) {
      const l = layouts[f.key]
      const b = boxes.get(l)
      if (!l || !b) continue
      if ((!overview && f.key !== sel?.key) || !_fr.intersectsBox(b)) frozenRooms.add(l)
    }
  })
  useEffect(() => () => frozenRooms.clear(), [])
  if (typeof window !== 'undefined' && window.location.search.includes('perf')) window.__frozen = { frozenRooms, layouts }
  // the room in focus keeps its side walls up
  useEffect(() => {
    focusRoom.layout = !overview && sel ? layouts[sel.key] || null : null
    return () => (focusRoom.layout = null)
  }, [overview, sel?.key, layouts])
  const lightsOn = !low
  // opening: the rooms build up from the floor one after another (back-out spring), then stop
  const roomGroups = useRef([])
  const born = useRef(0)
  const built = useRef(false)
  useFrame(() => {
    if (built.current) return
    const now = performance.now()
    if (!born.current) born.current = now
    let done = true
    roomGroups.current.forEach((g, i) => {
      if (!g) return
      const k = Math.min(1, Math.max(0, (now - born.current - 150 - i * 110) / 650))
      if (k < 1) done = false
      const e = k === 1 ? 1 : 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2) // ease-out with a little overshoot
      g.scale.set(1, Math.max(0.001, e), 1)
    })
    if (done && roomGroups.current.length) built.current = true
  })
  return (
    <group>
      {/* one room open: only that room is drawn. Everything else stays mounted but hidden (not
          drawn, not in the shadow pass, bots frozen), so going back to the whole office is instant */}
      {lightsOn && <CeilingLights target={!overview && sel ? layouts[sel.key] : null} nightness={nightness} />}
      <group visible={overview}>
        <Building campus={campus} />
        <Walkers data={data} followed={selectedBot} />
      </group>
      {look?.pet !== false && <OfficePets campus={campus} layouts={layouts} floors={floors} data={data} overview={overview} focusLayout={!overview && sel ? layouts[sel.key] : null} />}
      {floors.map((f) => {
        const l = layouts[f.key]
        if (!l) return null
        const focus = !overview && sel?.key === f.key
        return (
          <group key={f.key} visible={overview || focus} ref={(g) => { roomGroups.current[floors.indexOf(f)] = g; if (g && !built.current && !g.userData.seen) (g.userData.seen = true), g.scale.set(1, 0.001, 1) }}>
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
              {
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
                  muted={!overview && !focus}
                  celebrate={celebrate && celebrate.key === f.key ? celebrate.t : null}
                />
              }
            </group>
            {(overview || focus) && <RoomChip f={f} l={l} data={data} now={now} dim={false} onPick={onPickRoom} />}
          </group>
        )
      })}
    </group>
  )
}
