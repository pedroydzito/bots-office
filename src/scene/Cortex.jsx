import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { Shell } from './Floor'
import { Bookshelf, Plant, Railing, Elevator, MATS } from './Props'
import { makeCardTexture } from './textures'
import { durationShort } from '../lib/constants'

// Cheap brain: modest vertex count, displaced folds, no extra lights.
function brainGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 18)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize()
    const ridges = Math.sin(v.x * 14 + Math.sin(v.y * 9) * 2) * Math.sin(v.y * 12 + Math.cos(v.z * 8) * 2) * 0.045
    const fissure = -0.16 * Math.exp(-Math.pow(v.x * 9, 2)) * Math.max(0, v.y + 0.3)
    v.multiplyScalar(1 + ridges + fissure)
    p.setXYZ(i, v.x * 0.92, v.y * 0.78, v.z * 1.12)
  }
  g.computeVertexNormals()
  return g
}

function CardSprite({ title, sub, big, accent, scale, position }) {
  const tex = useMemo(() => makeCardTexture(title, sub, { big, accent }), [title, sub, big, accent])
  useEffect(() => () => tex.dispose(), [tex])
  const aspect = big ? 512 / 220 : 512 / 128
  return (
    <sprite position={position} scale={[scale * aspect, scale, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

function Brain({ notes }) {
  const geo = useMemo(() => brainGeometry(), [])
  useEffect(() => () => geo.dispose(), [geo])
  const ref = useRef()
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f7a8c9', roughness: 0.35, emissive: '#f93498', emissiveIntensity: 0.15 }), [])
  const sparks = useRef()
  const sparkData = useMemo(() => Array.from({ length: 28 }, () => ({ r: 1.5 + Math.random() * 0.8, s: 0.3 + Math.random() * 0.7, a: Math.random() * 6.28, y: (Math.random() - 0.5) * 1.5 })), [])
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ref.current) {
      ref.current.rotation.y = t * 0.25
      ref.current.position.y = 2.0 + Math.sin(t * 1.3) * 0.06
      ref.current.scale.setScalar(1 + Math.sin(t * 2.2) * 0.015)
    }
    mat.emissiveIntensity = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(t * 2.2))
    if (sparks.current) {
      sparkData.forEach((d, i) => {
        const a = d.a + t * d.s
        m4.makeTranslation(Math.cos(a) * d.r, 2.0 + d.y + Math.sin(t * d.s * 2 + i) * 0.1, Math.sin(a) * d.r)
        sparks.current.setMatrixAt(i, m4)
      })
      sparks.current.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <group>
      <mesh position={[0, 0.4, 0]} material={MATS.white} castShadow receiveShadow>
        <cylinderGeometry args={[0.85, 1.0, 0.8, 32]} />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <torusGeometry args={[0.76, 0.03, 8, 48]} />
        <meshBasicMaterial color="#b18cff" toneMapped={false} />
      </mesh>
      <mesh ref={ref} geometry={geo} material={mat} position={[0, 2.0, 0]} castShadow />
      <instancedMesh ref={sparks} args={[undefined, undefined, sparkData.length]} frustumCulled={false}>
        <sphereGeometry args={[0.035, 6, 4]} />
        <meshBasicMaterial color="#d8b4fe" toneMapped={false} />
      </instancedMesh>
      <CardSprite title={(notes ?? 0).toLocaleString('pt-BR')} sub="notas no Cortex" big accent="#8F59F9" scale={0.62} position={[0, 3.35, 0]} />
    </group>
  )
}

function NoteCards({ recent }) {
  const group = useRef()
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = -clock.elapsedTime * 0.08
  })
  const items = recent.slice(0, 6)
  return (
    <group ref={group}>
      {items.map((r, i) => {
        const a = (i / items.length) * Math.PI * 2
        const R = 2.6
        return (
          <group key={i} position={[Math.cos(a) * R, 1.5 + (i % 2) * 0.5, Math.sin(a) * R]}>
            <RoundedBox args={[0.42, 0.54, 0.03]} radius={0.02} smoothness={2} rotation={[0, -a + Math.PI / 2, 0.05]}>
              <meshStandardMaterial color="#ffffff" emissive="#ede9fe" emissiveIntensity={0.25} />
            </RoundedBox>
            <CardSprite title={r.title || 'Sem título'} sub={relTime(r.updated)} scale={0.3} position={[0, 0.5, 0]} />
          </group>
        )
      })}
    </group>
  )
}

function relTime(s) {
  const t = Date.parse(s)
  if (!isFinite(t)) return s || ''
  return durationShort(t - Date.now())
}

export default function Cortex({ layout, cortex, floorNum, floorY, night }) {
  const { W, D } = layout
  // shelves stay below the wall title (title occupies the left part of the back wall)
  const backShelves = []
  for (let x = -W / 2 + 7.6; x < W / 2 - 1.2; x += 1.8) backShelves.push(x)
  const leftShelves = []
  for (let z = -D / 2 + 3.0; z < layout.elevator.z - 1.6; z += 1.8) leftShelves.push(z)
  return (
    <group>
      <Shell layout={layout} title="Cortex" subtitle={`Andar ${floorNum} · Biblioteca`} />
      {backShelves.map((x, i) => (
        <Bookshelf key={i} position={[x, 0, -D / 2 + 0.47]} width={1.7} shelves={4} seed={i + 11} />
      ))}
      {leftShelves.map((z, i) => (
        <Bookshelf key={i} position={[-W / 2 + 0.47, 0, z]} rotation={[0, Math.PI / 2, 0]} width={1.7} shelves={4} seed={i + 21} />
      ))}
      <group>
        <Brain notes={cortex?.notes} />
        <NoteCards recent={cortex?.recent || []} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
          <circleGeometry args={[3.2, 48]} />
          <meshStandardMaterial color="#efe9fb" roughness={0.9} />
        </mesh>
      </group>
      {[[-3.6, 3.4], [3.6, 3.0]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <RoundedBox args={[1.4, 0.06, 0.8]} radius={0.02} smoothness={2} position={[0, 0.72, 0]} material={MATS.desk} castShadow receiveShadow />
          <mesh position={[0, 0.36, 0]} material={MATS.desk}>
            <cylinderGeometry args={[0.06, 0.18, 0.72, 12]} />
          </mesh>
          <mesh position={[0.3, 0.77, 0]}>
            <boxGeometry args={[0.32, 0.04, 0.24]} />
            <meshStandardMaterial color={i ? '#8F59F9' : '#1E86FC'} />
          </mesh>
        </group>
      ))}
      <Plant position={[W / 2 - 0.9, 0, -D / 2 + 0.9]} scale={1.2} kind={1} />
      <Plant position={[-W / 2 + 0.7, 0, D / 2 - 0.7]} scale={0.9} />
      <Railing W={W} D={D} />
      <Elevator layout={layout} floorY={floorY} night={night} />
      {!cortex && <CardSprite title="Sem dados do Cortex" sub='envie {"cortex":…}' scale={0.32} position={[0, 4.1, 0]} />}
    </group>
  )
}
