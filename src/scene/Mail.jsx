import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { syncNow, world } from './sim'

// Mail between bots: an envelope lifts off the sender's desk, flies to the receiver's desk, or
// to the elevator and out on the receiver's floor. Timing comes from the message time, so every
// screen shows the same flight.
const paper = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 })
const seal = new THREE.MeshStandardMaterial({ color: '#E5484D', roughness: 0.5 })
const env = new THREE.BoxGeometry(0.26, 0.02, 0.18)
const flap = new THREE.BoxGeometry(0.26, 0.012, 0.1)
const dot = new THREE.CylinderGeometry(0.025, 0.025, 0.012, 14)
// sparkle trail behind a flying envelope (where the work is going)
const trailGeo = new THREE.SphereGeometry(0.035, 8, 6)
const trailMat = new THREE.MeshBasicMaterial({ color: '#8F59F9', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false })
const TRAIL = 7

const FLY = 3000 // ms desk -> desk or desk -> elevator
const KEEP = 25000 // envelope stays on the desk this long

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)
const deskPos = (seat) => ({ x: seat.x + 0.25, y: 0.79, z: seat.z + 0.62 })

/** Position of one envelope on this floor at time T, or null when it isn't here. */
function envelopeAt(m, floorIdx, layout, T) {
  const a = world.seatOf(m.from), b = world.seatOf(m.to)
  if (!a || !b) return null
  const elev = { x: layout.elevator.x, y: 1.4, z: layout.elevator.z }
  let from, to, t0
  if (a.floorIdx === b.floorIdx) {
    if (a.floorIdx !== floorIdx) return null
    from = deskPos(a.seat)
    to = deskPos(b.seat)
    t0 = m.t
  } else {
    // another floor: the sender carries it there in person (see sim sessions)
    return null
  }
  void elev
  const k = (T - t0) / FLY
  if (k < 0) return null
  if (k >= 1) {
    if (T - t0 - FLY > KEEP) return null
    return { x: to.x, y: to.y, z: to.z, flying: false, rot: 0 }
  }
  const e = ease(k)
  return {
    x: from.x + (to.x - from.x) * e,
    z: from.z + (to.z - from.z) * e,
    y: from.y + (to.y - from.y) * e + Math.sin(k * Math.PI) * 1.4,
    flying: true,
    rot: Math.atan2(to.x - from.x, to.z - from.z),
  }
}

function Envelope({ m, floorIdx, layout }) {
  const ref = useRef(), fl = useRef(), trail = useRef([])
  useFrame(() => {
    const T = syncNow()
    const p = envelopeAt(m, floorIdx, layout, T)
    const g = ref.current
    if (!g) return
    g.visible = !!p
    // trail: the same flight a little earlier in time
    trail.current.forEach((d, i) => {
      if (!d) return
      const q = p && p.flying ? envelopeAt(m, floorIdx, layout, T - (i + 1) * 70) : null
      d.visible = !!(q && q.flying)
      if (d.visible) (d.position.set(q.x, q.y, q.z), d.scale.setScalar(1 - i / TRAIL))
    })
    if (!p) return
    g.position.set(p.x, p.y, p.z)
    g.rotation.set(p.flying ? Math.sin(T / 120) * 0.15 : 0, p.rot, p.flying ? Math.sin(T / 160) * 0.2 : 0)
    if (fl.current) fl.current.rotation.x = p.flying ? -0.4 - Math.abs(Math.sin(T / 90)) * 0.6 : 0
  })
  return (
    <>
    {Array.from({ length: TRAIL }, (_, i) => (
      <mesh key={i} ref={(d) => (trail.current[i] = d)} geometry={trailGeo} material={trailMat} visible={false} />
    ))}
    <group ref={ref} visible={false}>
      <mesh geometry={env} material={paper} castShadow />
      <group position={[0, 0.012, -0.09]}>
        <mesh ref={fl} geometry={flap} material={paper} position={[0, 0, 0.05]} />
      </group>
      <mesh geometry={dot} material={seal} position={[0, 0.016, 0]} />
    </group>
    </>
  )
}

export default function MailFlights({ mail, floorIdx, layout }) {
  const recent = useMemo(() => (mail || []).slice(-15), [mail])
  return (
    <group>
      {recent.map((m) => (
        <Envelope key={`${m.t}|${m.from}|${m.to}`} m={m} floorIdx={floorIdx} layout={layout} />
      ))}
    </group>
  )
}
