import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { Shell } from './Floor'
import { Bookshelf, Plant, Railing, Elevator, Lounge, MATS } from './Props'
import { durationShort } from '../lib/constants'

function brainGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 40)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = v.clone().normalize()
    // gyri: folded ridges + central fissure
    const ridges = Math.sin(n.x * 14 + Math.sin(n.y * 9) * 2) * Math.sin(n.y * 12 + Math.cos(n.z * 8) * 2) * 0.045
    const fissure = -0.16 * Math.exp(-Math.pow(n.x * 9, 2)) * Math.max(0, n.y + 0.3)
    const r = 1 + ridges + fissure
    v.copy(n).multiplyScalar(r)
    v.x *= 0.92
    v.y *= 0.78
    v.z *= 1.12
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

function Brain({ notes }) {
  const geo = useMemo(() => brainGeometry(), [])
  const ref = useRef()
  const mat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: '#f7a8c9', roughness: 0.35, clearcoat: 0.8, emissive: '#f93498', emissiveIntensity: 0.15, sheen: 0.5 }),
    [],
  )
  const sparks = useRef()
  const sparkData = useMemo(() => Array.from({ length: 40 }, () => ({ r: 1.5 + Math.random() * 0.9, s: 0.3 + Math.random() * 0.8, a: Math.random() * 6.28, y: (Math.random() - 0.5) * 1.6 })), [])
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ref.current) {
      ref.current.rotation.y = t * 0.25
      ref.current.position.y = 2.15 + Math.sin(t * 1.3) * 0.06
      const sc = 1 + Math.sin(t * 2.2) * 0.015
      ref.current.scale.setScalar(sc)
    }
    mat.emissiveIntensity = 0.12 + 0.12 * (0.5 + 0.5 * Math.sin(t * 2.2))
    if (sparks.current) {
      sparkData.forEach((d, i) => {
        const a = d.a + t * d.s
        m4.makeTranslation(Math.cos(a) * d.r, 2.15 + d.y + Math.sin(t * d.s * 2 + i) * 0.1, Math.sin(a) * d.r)
        sparks.current.setMatrixAt(i, m4)
      })
      sparks.current.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <group>
      <mesh position={[0, 0.45, 0]} material={MATS.white} castShadow receiveShadow>
        <cylinderGeometry args={[0.9, 1.05, 0.9, 48]} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <torusGeometry args={[0.8, 0.03, 12, 64]} />
        <meshStandardMaterial color="#c4b5fd" emissive="#8F59F9" emissiveIntensity={1.2} />
      </mesh>
      <mesh ref={ref} geometry={geo} material={mat} position={[0, 2.15, 0]} castShadow />
      <instancedMesh ref={sparks} args={[undefined, undefined, sparkData.length]}>
        <sphereGeometry args={[0.035, 8, 6]} />
        <meshBasicMaterial color="#d8b4fe" toneMapped={false} />
      </instancedMesh>
      <pointLight position={[0, 2.2, 0]} intensity={4} distance={7} color="#f9a8d4" />
      <Html position={[0, 3.55, 0]} center distanceFactor={12} zIndexRange={[30, 0]}>
        <div className="cortex-count">
          <b>{(notes ?? 0).toLocaleString()}</b>
          <span>notes in Cortex</span>
        </div>
      </Html>
    </group>
  )
}

function NoteCards({ recent }) {
  const group = useRef()
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = -clock.elapsedTime * 0.08
  })
  const items = recent.slice(0, 8)
  return (
    <group ref={group} position={[0, 0, 0]}>
      {items.map((r, i) => {
        const a = (i / items.length) * Math.PI * 2
        const R = 3.1
        return (
          <group key={i} position={[Math.cos(a) * R, 1.6 + (i % 2) * 0.55, Math.sin(a) * R]}>
            <RoundedBox args={[0.5, 0.64, 0.03]} radius={0.02} rotation={[0, -a + Math.PI / 2, 0.05]} castShadow>
              <meshStandardMaterial color="#ffffff" emissive="#ede9fe" emissiveIntensity={0.25} />
            </RoundedBox>
            <Html position={[0, 0.55, 0]} center distanceFactor={10} zIndexRange={[25, 0]}>
              <div className="note-card">
                <b>{r.title || 'Untitled'}</b>
                {r.updated && <span>{relTime(r.updated)}</span>}
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}

function relTime(s) {
  const t = Date.parse(s)
  if (!isFinite(t)) return s
  return durationShort(t - Date.now())
}

export default function Cortex({ layout, cortex, floorNum, floorY, night }) {
  const { W, D } = layout
  return (
    <group>
      <Shell layout={layout} title="Cortex" subtitle={`Floor ${floorNum} · Library`} />
      {[-5.4, -3.6, 3.0, 4.8].map((x, i) => (
        <Bookshelf key={i} position={[x, 0, -D / 2 + 0.47]} width={1.7} shelves={6} seed={i + 11} />
      ))}
      {[-D / 2 + 3.2, -D / 2 + 5.0, -D / 2 + 6.8, -D / 2 + 8.6].map((z, i) => (
        <Bookshelf key={i} position={[-W / 2 + 0.47, 0, z]} rotation={[0, Math.PI / 2, 0]} width={1.7} shelves={6} seed={i + 21} />
      ))}
      <group position={[0.5, 0, -0.5]}>
        <Brain notes={cortex?.notes} />
        <NoteCards recent={cortex?.recent || []} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
          <circleGeometry args={[3.6, 64]} />
          <meshStandardMaterial color="#efe9fb" roughness={0.9} />
        </mesh>
      </group>
      {/* reading tables */}
      {[[-3.5, 3.4], [3.6, 2.6]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <RoundedBox args={[1.4, 0.06, 0.8]} radius={0.02} position={[0, 0.72, 0]} material={MATS.desk} castShadow receiveShadow />
          <mesh position={[0, 0.36, 0]} material={MATS.desk}>
            <cylinderGeometry args={[0.06, 0.18, 0.72, 16]} />
          </mesh>
          <mesh position={[0.3, 0.77, 0]} castShadow>
            <boxGeometry args={[0.32, 0.04, 0.24]} />
            <meshStandardMaterial color={i ? '#8F59F9' : '#1E86FC'} />
          </mesh>
          <mesh position={[-0.35, 0.95, -0.1]}>
            <sphereGeometry args={[0.12, 16, 12]} />
            <meshStandardMaterial color="#fff7e0" emissive="#ffd28a" emissiveIntensity={night ? 2 : 0.2} />
          </mesh>
        </group>
      ))}
      <Plant position={[W / 2 - 1.0, 0, -D / 2 + 0.9]} scale={1.3} kind={1} />
      <Plant position={[-W / 2 + 0.75, 0, D / 2 - 1.0]} />
      <Lounge position={[W / 2 - 2.7, 0, D / 2 - 2.5]} night={night} />
      <Railing W={W} D={D} />
      <Elevator layout={layout} floorY={floorY} night={night} />
      {!cortex && (
        <Html position={[0.5, 4.2, -0.5]} center distanceFactor={12}>
          <div className="note-card empty">Send a {'{"cortex":…}'} message to fill the library</div>
        </Html>
      )}
    </group>
  )
}
