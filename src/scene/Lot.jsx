import { useMemo } from 'react'
import * as THREE from 'three'
import { floorGeo, floorMatFor } from './Floor'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// The office as a clean model on its own: a stone foundation, entrance steps, the corridors' floor
// and a glass railing along the outer edge of the corridors. Nothing beyond the steps: the office
// floats on the background like an architect's model (with a soft shadow under it).

const std = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra })
const MAT = {
  foundation: std('#d9d4cc', 0.9),
  edge: std('#bcb5aa', 0.9),
  hall: std('#efece7', 0.7),
  glass: new THREE.MeshStandardMaterial({ color: '#cfe6f3', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false }),
  rail: std('#9aa3ae', 0.35, { metalness: 0.6 }),
}

const hallMat = floorMatFor('#ece9e3', 'tile')

let shadowTex = null
function shadowTexture() {
  if (shadowTex) return shadowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const r = g.createRadialGradient(64, 64, 8, 64, 64, 64)
  r.addColorStop(0, 'rgba(25,32,48,0.30)')
  r.addColorStop(0.55, 'rgba(25,32,48,0.14)')
  r.addColorStop(1, 'rgba(25,32,48,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  shadowTex = new THREE.CanvasTexture(c)
  return shadowTex
}

const H = 1.05 // railing height

/** The building: foundation, steps at the entrance, corridors' floor and the glass railing. */
export function Building({ campus }) {
  const { W, D } = campus
  // railing: glass panes between slim posts all around the edge, open at the entrance (front centre)
  const { panes, posts, rails } = useMemo(() => {
    const panes = [], posts = [], rails = []
    const e = 0.15 // inset from the floor edge
    const side = (x1, z1, x2, z2, gap) => {
      const len = Math.hypot(x2 - x1, z2 - z1)
      const dx = (x2 - x1) / len, dz = (z2 - z1) / len
      const segs = gap ? [[0, gap[0]], [gap[1], len]] : [[0, len]]
      for (const [a, b] of segs) {
        const n = Math.max(1, Math.round((b - a) / 2.2))
        const step = (b - a) / n
        for (let i = 0; i <= n; i++) posts.push([x1 + dx * (a + i * step), z1 + dz * (a + i * step)])
        for (let i = 0; i < n; i++) {
          const m = a + (i + 0.5) * step
          panes.push({ x: x1 + dx * m, z: z1 + dz * m, len: step - 0.06, horiz: Math.abs(dx) > 0.5 })
        }
        const m = (a + b) / 2
        rails.push({ x: x1 + dx * m, z: z1 + dz * m, len: b - a, horiz: Math.abs(dx) > 0.5 })
      }
    }
    const x1 = -W / 2 + e, x2 = W / 2 - e, z1 = -D / 2 + e, z2 = D / 2 - e
    side(x1, z1, x2, z1)
    side(x2, z1, x2, z2)
    side(x1, z1, x1, z2)
    const mid = W / 2 - e // the entrance: front centre, in line with the steps
    side(x1, z2, x2, z2, [mid - 1.7, mid + 1.7])
    return { panes, posts, rails }
  }, [W, D])
  // all posts + rails in one mesh, all panes in another (two draw calls for the whole railing)
  const geo = useMemo(() => {
    const metal = [], glass = []
    for (const [x, z] of posts) metal.push(new THREE.BoxGeometry(0.06, H, 0.06).translate(x, H / 2, z))
    for (const r of rails) metal.push((r.horiz ? new THREE.BoxGeometry(r.len, 0.05, 0.08) : new THREE.BoxGeometry(0.08, 0.05, r.len)).translate(r.x, H, r.z))
    for (const q of panes) glass.push((q.horiz ? new THREE.BoxGeometry(q.len, H - 0.1, 0.03) : new THREE.BoxGeometry(0.03, H - 0.1, q.len)).translate(q.x, H / 2, q.z))
    return { metal: mergeGeometries(metal, false), glass: mergeGeometries(glass, false) }
  }, [posts, rails, panes])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]} renderOrder={-1}>
        <planeGeometry args={[W * 1.6 + 10, D * 1.6 + 10]} />
        <meshBasicMaterial map={shadowTexture()} transparent depthWrite={false} />
      </mesh>
      {/* foundation: a light stone block with a darker band at the bottom */}
      <mesh position={[0, -0.28, 0]} material={MAT.foundation} receiveShadow castShadow>
        <boxGeometry args={[W + 0.6, 0.5, D + 0.6]} />
      </mesh>
      <mesh position={[0, -0.56, 0]} material={MAT.edge} receiveShadow>
        <boxGeometry args={[W + 0.4, 0.1, D + 0.4]} />
      </mesh>
      {/* entrance steps */}
      <mesh position={[0, -0.37, D / 2 + 0.6]} material={MAT.foundation} receiveShadow castShadow>
        <boxGeometry args={[3.6, 0.3, 0.6]} />
      </mesh>
      <mesh position={[0, -0.5, D / 2 + 1.1]} material={MAT.foundation} receiveShadow castShadow>
        <boxGeometry args={[4.2, 0.2, 0.5]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]} material={hallMat} geometry={floorGeo(W, D)} receiveShadow />
      {/* glass railing */}
      <mesh geometry={geo.metal} material={MAT.rail} castShadow />
      <mesh geometry={geo.glass} material={MAT.glass} />
    </group>
  )
}
