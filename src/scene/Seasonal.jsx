import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { hash } from './sim'
import { MATS } from './Props'

// Seasonal decoration chosen by the date (same on every screen). `?festa=junina|halloween|natal`
// in the URL previews one.
export function seasonOf(d = new Date()) {
  const q = new URLSearchParams(window.location.search).get('festa')
  if (q) return q
  const m = d.getMonth() + 1, day = d.getDate()
  if (m === 6 || (m === 7 && day <= 10)) return 'junina'
  if (m === 10 && day >= 20) return 'halloween'
  if (m === 12 || (m === 1 && day <= 6)) return 'natal'
  return null
}

const FLAG_COLORS = ['#E5484D', '#F5B70A', '#1E86FC', '#2FB36B', '#F93498', '#FD690F', '#8F59F9']

function Bunting({ W, D }) {
  // strings of little flags across the room (festa junina)
  const flags = useMemo(() => {
    const out = []
    for (let r = 0; r < 3; r++) {
      const z = -D / 2 + 3 + r * ((D - 5) / 2)
      const n = Math.floor(W / 0.32)
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + 0.3 + i * 0.32
        const sag = Math.sin((i / (n - 1)) * Math.PI) * 0.25
        out.push({ x, y: 2.95 - sag, z, c: FLAG_COLORS[(i + r * 2) % FLAG_COLORS.length] })
      }
    }
    return out
  }, [W, D])
  const ref = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.children.forEach((m, i) => (m.rotation.x = Math.sin(clock.elapsedTime * 2 + i) * 0.15))
  })
  return (
    <group ref={ref}>
      {flags.map((f, i) => (
        <mesh key={i} position={[f.x, f.y, f.z]}>
          <coneGeometry args={[0.08, 0.17, 3]} />
          <meshStandardMaterial color={f.c} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

function Pumpkin({ x, z, s = 1 }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.17, 0]} scale={[1, 0.8, 1]} castShadow>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshStandardMaterial color="#FD690F" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.36, 0]} material={MATS.dark}>
        <cylinderGeometry args={[0.02, 0.03, 0.08, 6]} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.07, 0.21, 0.19]}>
          <coneGeometry args={[0.035, 0.05, 3]} />
          <meshBasicMaterial color="#ffd36a" />
        </mesh>
      ))}
    </group>
  )
}

function Ghost({ x, z }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = 2.1 + Math.sin(clock.elapsedTime * 1.3 + x) * 0.15
  })
  return (
    <group ref={ref} position={[x, 2.1, z]}>
      <mesh>
        <sphereGeometry args={[0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.06, 0.04, 0.18]}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <meshBasicMaterial color="#1b1b1b" />
        </mesh>
      ))}
    </group>
  )
}

function ChristmasTree({ x, z }) {
  const lights = useRef([])
  useFrame(({ clock }) => {
    lights.current.forEach((m, i) => m && (m.material.color.setHSL(((i * 0.13 + clock.elapsedTime * 0.1) % 1), 0.8, 0.6)))
  })
  const balls = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const a = i * 2.4, h = 0.5 + (i / 14) * 1.3, r = 0.55 * (1 - (h - 0.4) / 1.7)
    return [Math.cos(a) * r, h, Math.sin(a) * r]
  }), [])
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.15, 0]} material={MATS.dark}><cylinderGeometry args={[0.08, 0.1, 0.3, 10]} /></mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.65 + i * 0.45, 0]} castShadow>
          <coneGeometry args={[0.65 - i * 0.17, 0.75, 16]} />
          <meshStandardMaterial color="#2f8f4e" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 2.08, 0]}>
        <octahedronGeometry args={[0.1]} />
        <meshStandardMaterial color="#f5b70a" emissive="#f5b70a" emissiveIntensity={0.8} />
      </mesh>
      {balls.map((p, i) => (
        <mesh key={i} ref={(m) => (lights.current[i] = m)} position={p}>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshBasicMaterial color="#ff5" toneMapped={false} />
        </mesh>
      ))}
      {[[-0.5, 0.35], [0.45, 0.4], [0.05, 0.6]].map(([px, pz], i) => (
        <mesh key={i} position={[px, 0.12, pz]} castShadow>
          <boxGeometry args={[0.24, 0.24, 0.24]} />
          <meshStandardMaterial color={FLAG_COLORS[i * 2]} />
        </mesh>
      ))}
    </group>
  )
}

function Garland({ W, D }) {
  const bulbs = useRef([])
  useFrame(({ clock }) => {
    bulbs.current.forEach((m, i) => m && (m.visible = Math.sin(clock.elapsedTime * 3 + i * 1.7) > -0.4))
  })
  const n = Math.floor(W / 0.5)
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const x = -W / 2 + 0.4 + i * 0.5
        const y = 3.0 - Math.abs(Math.sin((i / 6) * Math.PI)) * 0.18
        return (
          <mesh key={i} ref={(m) => (bulbs.current[i] = m)} position={[x, y, -D / 2 + 0.3]}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshBasicMaterial color={FLAG_COLORS[i % FLAG_COLORS.length]} toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}

export default function Seasonal({ layout, seed = '' }) {
  const season = seasonOf()
  if (!season) return null
  const { W, D } = layout
  if (season === 'junina') return <Bunting W={W} D={D} />
  if (season === 'halloween') {
    const spots = layout.pois.slice(0, 6).map((p, i) => ({ x: p.x + ((hash(seed + i) % 100) / 100 - 0.5) * 0.8 + 0.6, z: p.z + 0.5 }))
    return (
      <group>
        {spots.map((p, i) => <Pumpkin key={i} x={p.x} z={p.z} s={0.8 + (i % 3) * 0.2} />)}
        <Ghost x={layout.x0 + 1} z={layout.z0 + 1.5} />
        <Ghost x={W / 2 - 3} z={0} />
      </group>
    )
  }
  if (season === 'natal')
    return (
      <group>
        <ChristmasTree x={W / 2 - 1.0} z={-D / 2 + 3.2} />
        <Garland W={W} D={D} />
      </group>
    )
  return null
}
