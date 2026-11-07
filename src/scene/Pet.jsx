import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { botPositions, pet } from './registry'

// The office cat. It lives on one floor at a time (pet.floor), strolls between spots, naps,
// rubs past bots, and every few minutes takes the elevator to another floor.
const fur = new THREE.MeshStandardMaterial({ color: '#f2a35e', roughness: 0.8 })
const furDark = new THREE.MeshStandardMaterial({ color: '#d9843f', roughness: 0.8 })
const white = new THREE.MeshStandardMaterial({ color: '#fff4e8', roughness: 0.8 })
const black = new THREE.MeshBasicMaterial({ color: '#1b1b1b' })
const pink = new THREE.MeshBasicMaterial({ color: '#ff9fb5' })

const rand = (a, b) => a + Math.random() * (b - a)

export default function Pet({ layout, floorIdx, floorCount }) {
  const root = useRef(), body = useRef(), head = useRef(), tail = useRef(), legs = useRef([])
  if (pet.floor === -1) pet.floor = floorIdx
  const [here, setHere] = useState(pet.floor === floorIdx)
  const spots = useMemo(() => {
    const { W, D } = layout
    const s = [
      ...layout.pois.map((p) => ({ x: p.x + 0.5, z: p.z + (p.az > p.z ? 0.4 : -0.1) })),
      ...layout.seats.map((p) => ({ x: p.ex ?? p.x + 0.8, z: p.az })),
      { x: W / 2 - 2.6, z: D / 2 - 1.7, nap: true },
      { x: -W / 2 + 2.4, z: D / 2 - 1.3, nap: true },
    ]
    return s.filter((p) => Math.abs(p.x) < W / 2 - 0.5 && Math.abs(p.z) < D / 2 - 0.5)
  }, [layout])
  const S = useRef(null)
  if (!S.current) {
    const st = pet.state && pet.state.floor === floorIdx ? pet.state : null
    S.current = st || { floor: floorIdx, x: layout.elevator.x + 0.9, z: layout.elevator.z, yaw: 0, goal: null, mode: 'walk', until: 0, leaveAt: rand(120, 300) }
    pet.state = S.current
  }

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const s = S.current
    const isHere = pet.floor === floorIdx
    if (isHere !== here) setHere(isHere)
    if (!isHere || !root.current) return
    if (!s.goal) {
      s.goal = t > s.leaveAt ? { x: layout.elevator.x + 0.3, z: layout.elevator.z, leave: true } : spots[Math.floor(Math.random() * spots.length)]
      s.mode = 'walk'
    }
    let moving = false
    if (s.mode === 'walk') {
      const dx = s.goal.x - s.x, dz = s.goal.z - s.z
      const d = Math.hypot(dx, dz)
      // wait politely if a bot is right in front
      let blocked = false
      for (const q of botPositions.values()) {
        const rx = q.x - s.x, rz = q.z - s.z
        if (Math.hypot(rx, rz) < 0.6 && rx * dx + rz * dz > 0) blocked = true
      }
      if (d < 0.05) {
        if (s.goal.leave) {
          // off to another floor via the elevator
          pet.floor = (floorIdx + 1 + Math.floor(Math.random() * Math.max(1, floorCount - 1))) % Math.max(1, floorCount)
          pet.state = null
          S.current = { floor: pet.floor, x: 0, z: 0, yaw: 0, goal: null, mode: 'walk', until: 0, leaveAt: t + rand(150, 360) }
          return
        }
        s.mode = s.goal.nap ? 'nap' : Math.random() < 0.5 ? 'sit' : 'groom'
        s.until = t + (s.mode === 'nap' ? rand(25, 60) : rand(5, 12))
      } else if (!blocked) {
        const sp = 0.9 * dt
        s.x += (dx / d) * Math.min(sp, d)
        s.z += (dz / d) * Math.min(sp, d)
        s.yaw = Math.atan2(dx, dz)
        moving = true
      }
    } else if (t > s.until) s.goal = null

    root.current.position.set(s.x, 0, s.z)
    root.current.rotation.y = s.yaw
    const b = body.current
    // pose
    const nap = s.mode === 'nap', sit = s.mode === 'sit' || s.mode === 'groom'
    b.position.y = nap ? 0.1 : sit ? 0.17 : 0.2 + (moving ? Math.abs(Math.sin(t * 12)) * 0.015 : 0)
    b.rotation.x = sit ? -0.45 : 0
    b.scale.set(1, nap ? 0.75 + Math.sin(t * 1.6) * 0.03 : 1, 1)
    if (head.current) {
      head.current.position.set(0, nap ? 0.12 : sit ? 0.42 : 0.3, nap ? 0.16 : sit ? 0.12 : 0.22)
      head.current.rotation.set(s.mode === 'groom' ? 0.5 + Math.sin(t * 6) * 0.15 : nap ? 0.3 : Math.sin(t * 0.7) * 0.1, sit ? Math.sin(t * 0.5) * 0.5 : 0, nap ? 0.5 : 0)
    }
    if (tail.current) {
      tail.current.rotation.set(nap ? 1.4 : 0.6 + Math.sin(t * 2) * 0.1, Math.sin(t * (moving ? 5 : 1.5)) * (nap ? 0.15 : 0.5), 0)
      tail.current.position.y = nap ? 0.1 : sit ? 0.06 : 0.22
    }
    legs.current.forEach((l, i) => {
      if (!l) return
      l.visible = !nap
      l.rotation.x = moving ? Math.sin(t * 12 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5 : 0
    })
  })

  if (!here) return null
  return (
    <group ref={root}>
      <group ref={body}>
        <mesh material={fur} scale={[0.15, 0.13, 0.26]} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
        <mesh material={white} position={[0, -0.04, 0.05]} scale={[0.1, 0.08, 0.16]}>
          <sphereGeometry args={[1, 12, 8]} />
        </mesh>
      </group>
      <group ref={head}>
        <mesh material={fur} scale={[0.13, 0.11, 0.11]} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
        {[-1, 1].map((sx) => (
          <group key={sx}>
            <mesh material={furDark} position={[sx * 0.07, 0.1, -0.01]} rotation={[0, 0, -sx * 0.3]}>
              <coneGeometry args={[0.04, 0.08, 4]} />
            </mesh>
            <mesh material={black} position={[sx * 0.045, 0.02, 0.1]} scale={[1, 1.4, 0.5]}>
              <sphereGeometry args={[0.014, 8, 6]} />
            </mesh>
          </group>
        ))}
        <mesh material={pink} position={[0, -0.015, 0.11]}>
          <sphereGeometry args={[0.012, 8, 6]} />
        </mesh>
      </group>
      <group ref={tail} position={[0, 0.22, -0.24]}>
        <mesh material={furDark} position={[0, 0.14, 0]}>
          <capsuleGeometry args={[0.025, 0.26, 4, 8]} />
        </mesh>
      </group>
      {[[-0.07, 0.13], [0.07, 0.13], [-0.07, -0.13], [0.07, -0.13]].map(([x, z], i) => (
        <group key={i} ref={(g) => (legs.current[i] = g)} position={[x, 0.12, z]}>
          <mesh material={i < 2 ? white : fur} position={[0, -0.06, 0]}>
            <capsuleGeometry args={[0.025, 0.08, 4, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
