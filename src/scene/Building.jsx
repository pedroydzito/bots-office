import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Floor from './Floor'
import Cortex from './Cortex'
import { FLOOR_H } from './layout'
import { getFacadeTexture } from './textures'
import { CORTEX_KEY } from '../lib/constants'
import { MATS, Railing } from './Props'
import { RoundedBox } from '@react-three/drei'
import { floorOffset, ridePositions } from './registry'
import { hash, rideFor, sessions, syncNow } from './sim'
import { getBotAsset } from './shapes'
import { effStatus, resolveColor, STATUS } from '../lib/constants'

function Facade({ W, D, y, night, color }) {
  const mats = useMemo(() => {
    const mk = (len) => {
      const map = getFacadeTexture(len, false)
      const em = getFacadeTexture(len, true)
      return new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.35, metalness: 0.1 })
    }
    const x = mk(D), z = mk(W)
    const top = new THREE.MeshStandardMaterial({ color: '#e2e4e8' })
    return [x, x, top, top, z, z]
  }, [W, D])
  useEffect(() => {
    mats[0].emissiveIntensity = night ? 1.4 : 0
    mats[4].emissiveIntensity = night ? 1.4 : 0
  }, [night, mats])
  return (
    <group>
      <mesh position={[0, y + FLOOR_H / 2 - 0.35, 0]} material={mats} castShadow receiveShadow>
        <boxGeometry args={[W, FLOOR_H, D]} />
      </mesh>
      {/* status strip: each floor's state glows on the facade (green / amber / red / grey) */}
      {color && (
        <mesh position={[0, y + FLOOR_H - 0.5, 0]}>
          <boxGeometry args={[W + 0.04, 0.08, D + 0.04]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/** Rounded planter with a clipped hedge: tidy street furniture instead of lollipop trees. */
function Planter({ position, length = 2.4, rot = 0 }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <RoundedBox args={[length, 0.5, 0.8]} radius={0.08} smoothness={2} position={[0, 0.25, 0]} material={MATS.white} receiveShadow />
      <RoundedBox args={[length - 0.16, 0.42, 0.64]} radius={0.2} smoothness={3} position={[0, 0.62, 0]} material={MATS.leaf2} castShadow />
    </group>
  )
}

function Plaza({ W, D, night }) {
  return (
    <group position={[0, -0.36, 0]}>
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[W + 12, 0.5, D + 12]} />
        <meshStandardMaterial color={night ? '#1b2232' : '#e6e8ec'} roughness={0.9} />
      </mesh>
      <mesh position={[W / 2 + 3.5, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3, D + 12]} />
        <meshStandardMaterial color={night ? '#262e40' : '#d6d9df'} />
      </mesh>
      <Planter position={[W / 2 + 1.2, 0, -D / 2 + 2]} length={3} rot={Math.PI / 2} />
      <Planter position={[W / 2 + 1.2, 0, D / 2 - 2]} length={3} rot={Math.PI / 2} />
      <Planter position={[-W / 2 + 3, 0, D / 2 + 1.3]} length={3.2} />
      <Planter position={[W / 2 - 3, 0, D / 2 + 1.3]} length={3.2} />
    </group>
  )
}

/** Glass elevator shaft on the outside of the left wall; cars carry riding bots between floors. */
/** The elevator car inside the glass shaft of the open floor: it arrives from above/below during rides. */
function ElevatorShaft({ W, D, floorIdx, night, data, followed }) {
  const x = -W / 2 + 0.95, z = -D / 2 + 2.3
  const fy = floorIdx * FLOOR_H
  const cars = useRef([])
  const riders = useRef([])
  const MAXC = 3
  useFrame(() => {
    const now = syncNow()
    // rides come straight from the shared conversation log, so every screen sees the same car
    const live = []
    for (const sess of sessions(data, now)) {
      const r = rideFor(sess)
      if (!r) continue
      const b = data.bots?.[sess.from]
      if (now >= r.goStart && now < r.goEnd) live.push({ name: sess.from, from: r.from, to: r.to, start: r.goStart, end: r.goEnd, shape: b?.shape, color: b?.color })
      if (now >= r.backStart && now < r.backEnd) live.push({ name: sess.from, from: r.to, to: r.from, start: r.backStart, end: r.backEnd, shape: b?.shape, color: b?.color })
    }
    ridePositions.clear()
    for (let i = 0; i < MAXC; i++) {
      const car = cars.current[i]
      if (!car) continue
      const r = live[i]
      if (!r) {
        // parked car on the ground floor
        car.visible = false // the glass cabin on each floor already shows the elevator at rest
        if (riders.current[i]) riders.current[i].visible = false
        continue
      }
      const k = (now - r.start) / (r.end - r.start)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      const y = (r.from + (r.to - r.from) * e) * FLOOR_H
      // only visible while it is inside this floor's glass box
      // (or anywhere, when the camera is riding along with this bot)
      car.visible = r.name === followed || (y > fy - 2.4 && y < fy + 2.4)
      car.position.set(x, y, z)
      const rider = riders.current[i]
      if (rider) {
        if (rider.userData.key !== r.name) {
          rider.userData.key = r.name
          const a = getBotAsset(r.shape)
          rider.geometry = a.geometry
          rider.material.color.set(resolveColor(r.color))
        }
        rider.visible = true
        rider.position.y = 0.1 + Math.abs(Math.sin(now / 160)) * 0.02
        ridePositions.set(r.name, new THREE.Vector3(x, y + 0.8, z))
      }
    }
  })
  return (
    <group>
      {Array.from({ length: MAXC }, (_, i) => (
        <group key={i} ref={(g) => (cars.current[i] = g)} visible={i === 0}>
          <RoundedBox args={[1.0, 0.08, 1.3]} radius={0.03} smoothness={2} material={MATS.white} />
          <mesh position={[0, 2.5, 0]} material={MATS.white}>
            <boxGeometry args={[1.0, 0.06, 1.3]} />
          </mesh>
          <mesh position={[0, 2.46, 0]}>
            <boxGeometry args={[0.3, 0.04, 0.3]} />
            <meshStandardMaterial color="#fff6dc" emissive="#ffd28a" emissiveIntensity={night ? 2 : 0.6} />
          </mesh>
          <mesh ref={(m) => (riders.current[i] = m)} visible={false}>
            <meshStandardMaterial roughness={0.38} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function floorColor(f, data, now) {
  if (!f.bots.length) return '#c9a7ff'
  const sts = f.bots.map((n) => effStatus(data.bots[n], now))
  return sts.includes('error') ? STATUS.error.color : sts.includes('waiting_user') ? STATUS.waiting_user.color : sts.includes('working') ? STATUS.working.color : '#b8bcc4'
}

/** Floors below the selected one render as glass facade; the selected one is open. */
export const OVERVIEW_GAP = 2.8

/** Whole-building view: every floor open and live, stacked with gaps ("cutaway"). */
function Overview({ floors, layouts, data, now, night, selectedBot, spotlight, onSelect, W, D }) {
  return (
    <group>
      <Plaza W={W} D={D} night={night} />
      {floors.map((f, i) => {
        const y = i * (FLOOR_H + OVERVIEW_GAP)
        return (
          <group key={f.key} position={[0, y, 0]}>
            <Terrace W={W} D={D} night={night} />
            {f.key === CORTEX_KEY ? (
              <Cortex layout={layouts[f.key]} cortex={data.cortex} floorNum={f.num} floorY={y} night={night} />
            ) : (
              <Floor floor={f} layout={layouts[f.key]} data={data} now={now} floorY={y} night={night} selectedBot={selectedBot} spotlight={spotlight} onSelect={onSelect} floorCount={floors.length} />
            )}
          </group>
        )
      })}
    </group>
  )
}

export default function Building({ floors, selectedIdx, size, layouts, data, now, night, selectedBot, spotlight, onSelect, onLongPress, celebrate, overview }) {
  const { W, D } = size // largest footprint, for the plaza
  const sel = floors[selectedIdx]
  const drop = useRef()
  const dropY = useRef(1.2)
  useEffect(() => {
    dropY.current = 1.2
  }, [selectedIdx])
  useFrame((_, dt) => {
    dropY.current += (0 - dropY.current) * Math.min(1, dt * 5)
    if (drop.current) drop.current.position.y = selectedIdx * FLOOR_H + dropY.current
  })
  const y = selectedIdx * FLOOR_H
  const lay = sel ? layouts[sel.key] : null
  if (overview) {
    floorOffset.x = 0
    floorOffset.z = 0
    return <Overview floors={floors} layouts={layouts} data={data} now={now} night={night} selectedBot={selectedBot} spotlight={spotlight} onSelect={onSelect} W={W} D={D} />
  }
  // rooms hug the building's back-left corner; the rest of the storey is an open terrace
  const ox = lay ? -(W - lay.W) / 2 : 0
  const oz = lay ? -(D - lay.D) / 2 : 0
  floorOffset.x = ox
  floorOffset.z = oz
  return (
    <group>
      <Plaza W={W} D={D} night={night} />
      {floors.slice(0, selectedIdx).map((f, i) => (
        <Facade key={f.key} W={W} D={D} y={i * FLOOR_H} night={night} color={floorColor(f, data, now)} />
      ))}
      <ElevatorShaft W={W} D={D} floorIdx={selectedIdx} night={night} data={data} followed={selectedBot} />
      <group ref={drop} position={[0, y, 0]}>
        <Terrace W={W} D={D} night={night} weather={data.weather} />
        <group position={[ox, 0, oz]}>
          {sel &&
            (sel.key === CORTEX_KEY ? (
              <Cortex key={sel.key} layout={lay} cortex={data.cortex} floorNum={sel.num} floorY={y} night={night} />
            ) : (
              <Floor
                key={sel.key}
                floor={sel}
                layout={lay}
                data={data}
                now={now}
                floorY={y}
                night={night}
                selectedBot={selectedBot}
                spotlight={spotlight}
                onSelect={onSelect}
                onLongPress={onLongPress}
                floorCount={floors.length}
                celebrate={celebrate && celebrate.key === sel.key ? celebrate.t : null}
              />
            ))}
        </group>
      </group>
    </group>
  )
}

/** Snow piles up and puddles form on the open floor while the weather lasts (same clock on every screen). */
function WeatherGround({ W, D, weather }) {
  const snow = useRef(), puddles = useRef()
  const spots = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ x: ((hash(`p${i}x`) % 1000) / 1000 - 0.5) * (W - 3), z: ((hash(`p${i}z`) % 1000) / 1000 - 0.5) * (D - 3), r: 0.5 + ((hash(`p${i}r`) % 100) / 100) * 0.9 })), [W, D])
  useFrame(() => {
    const age = weather ? (syncNow() - weather.t) / 1000 : 0
    const k = weather?.kind
    if (snow.current) {
      snow.current.material.opacity = k === 'snow' ? Math.min(0.8, age / 150) : 0
      snow.current.visible = snow.current.material.opacity > 0.01
    }
    if (puddles.current) {
      const o = k === 'rain' || k === 'storm' ? Math.min(0.55, age / 90) : 0
      puddles.current.children.forEach((m) => (m.material.opacity = o))
      puddles.current.visible = o > 0.01
    }
  })
  return (
    <group>
      <mesh ref={snow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} visible={false}>
        <planeGeometry args={[W - 0.2, D - 0.2]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0} roughness={0.9} depthWrite={false} />
      </mesh>
      <group ref={puddles} visible={false}>
        {spots.map((p, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[p.x, 0.008, p.z]} scale={[p.r, p.r * 0.6, 1]}>
            <circleGeometry args={[1, 28]} />
            <meshStandardMaterial color="#7f9cc0" transparent opacity={0} roughness={0.05} metalness={0.3} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Full-size storey slab around a smaller room, with the building's railing on the open edges. */
function Terrace({ W, D, night, weather }) {
  return (
    <group>
      <WeatherGround W={W} D={D} weather={weather} />
      <mesh position={[0, -0.18, 0]} receiveShadow>
        <boxGeometry args={[W, 0.34, D]} />
        <meshStandardMaterial color={night ? '#2a3142' : '#e4e6ea'} roughness={0.85} />
      </mesh>
      <Railing W={W} D={D} />
    </group>
  )
}
