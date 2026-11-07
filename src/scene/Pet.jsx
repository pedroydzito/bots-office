import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { simPet, syncNow } from './sim'

// The office cat. It lives on one floor at a time (pet.floor), strolls between spots, naps,
// rubs past bots, and every few minutes takes the elevator to another floor.
const fur = new THREE.MeshStandardMaterial({ color: '#f2a35e', roughness: 0.8 })
const furDark = new THREE.MeshStandardMaterial({ color: '#d9843f', roughness: 0.8 })
const white = new THREE.MeshStandardMaterial({ color: '#fff4e8', roughness: 0.8 })
const black = new THREE.MeshBasicMaterial({ color: '#1b1b1b' })
const pink = new THREE.MeshBasicMaterial({ color: '#ff9fb5' })


export default function Pet({ layout, floorIdx }) {
  const root = useRef(), body = useRef(), head = useRef(), tail = useRef(), legs = useRef([])
  const [here, setHere] = useState(false)
  const yaw = useRef(0)
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const T = syncNow()
    const t = (T % 1e7) / 1000
    const c = simPet(T, floorIdx, layout)
    if (!!c !== here) setHere(!!c)
    if (!c || !root.current) return
    const moving = c.mode === 'walk'
    if (c.yaw != null && moving) yaw.current += ((((c.yaw - yaw.current + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 8)
    root.current.position.set(c.x, 0, c.z)
    root.current.rotation.y = yaw.current
    const b = body.current
    const nap = c.mode === 'nap', sit = c.mode === 'sit' || c.mode === 'groom'
    b.position.y = nap ? 0.1 : sit ? 0.17 : 0.2 + (moving ? Math.abs(Math.sin(t * 12)) * 0.015 : 0)
    b.rotation.x = sit ? -0.45 : 0
    b.scale.set(1, nap ? 0.75 + Math.sin(t * 1.6) * 0.03 : 1, 1)
    if (head.current) {
      head.current.position.set(0, nap ? 0.12 : sit ? 0.42 : 0.3, nap ? 0.16 : sit ? 0.12 : 0.22)
      head.current.rotation.set(c.mode === 'groom' ? 0.5 + Math.sin(t * 6) * 0.15 : nap ? 0.3 : Math.sin(t * 0.7) * 0.1, sit ? Math.sin(t * 0.5) * 0.5 : 0, nap ? 0.5 : 0)
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
