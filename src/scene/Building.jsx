import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Floor from './Floor'
import Cortex from './Cortex'
import { FLOOR_H } from './layout'
import { getFacadeTexture } from './textures'
import { CORTEX_KEY } from '../lib/constants'
import { MATS } from './Props'

function Facade({ W, D, y, night }) {
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
    <mesh position={[0, y + FLOOR_H / 2 - 0.35, 0]} material={mats} castShadow receiveShadow>
      <boxGeometry args={[W, FLOOR_H, D]} />
    </mesh>
  )
}

function Plaza({ W, D, night }) {
  const trees = useMemo(
    () => [[W / 2 + 2.5, D / 2 - 2], [W / 2 + 3.2, -D / 2 + 3], [-W / 2 + 1, D / 2 + 3], [W / 2 - 3, D / 2 + 3.4], [-W / 2 - 2.6, 1], [2, D / 2 + 3.8]],
    [W, D],
  )
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
      {trees.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.5, 0]} material={MATS.dark}>
            <cylinderGeometry args={[0.07, 0.1, 1, 8]} />
          </mesh>
          <mesh position={[0, 1.4, 0]} material={i % 2 ? MATS.leaf : MATS.leaf2} castShadow>
            <sphereGeometry args={[0.75, 20, 16]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Floors below the selected one render as glass facade; the selected one is open. */
export default function Building({ floors, selectedIdx, size, layouts, data, now, night, selectedBot, spotlight, onSelect }) {
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
  return (
    <group>
      <Plaza W={W} D={D} night={night} />
      {floors.slice(0, selectedIdx).map((f, i) => (
        <Facade key={f.key} W={layouts[f.key].W} D={layouts[f.key].D} y={i * FLOOR_H} night={night} />
      ))}
      <group ref={drop} position={[0, y, 0]}>
        {sel &&
          (sel.key === CORTEX_KEY ? (
            <Cortex key={sel.key} layout={layouts[sel.key]} cortex={data.cortex} floorNum={sel.num} floorY={y} night={night} />
          ) : (
            <Floor
              key={sel.key}
              floor={sel}
              layout={layouts[sel.key]}
              data={data}
              now={now}
              floorY={y}
              night={night}
              selectedBot={selectedBot}
              spotlight={spotlight}
              onSelect={onSelect}
            />
          ))}
      </group>
    </group>
  )
}
