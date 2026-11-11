import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CutWall, windowsAlong } from './Floor'

// The office building and its lot, in the spirit of a life-sim build: a terracotta façade with tall
// windows (cut away like the rooms), a stone plinth, planters with bushes and flowers, palms and
// trees, a street with a crosswalk in front, and a promenade by the water with a hazy city across.
// Everything repeated is instanced, so the whole lot costs about twenty draw calls.

const C = (h) => new THREE.Color(h)
const std = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra })

const MAT = {
  foundation: std('#b9b2a8', 0.9),
  hall: std('#ece8e2', 0.7),
  inner: std('#efede9', 0.9),
  facade: std('#a6614a', 0.8),
  frame: std('#30333a', 0.6),
  land: std('#bfd2a2', 1),
  lawn: std('#9cc47a', 1),
  paving: std('#e2d7c8', 0.95),
  plaza: std('#e3c4b0', 0.95),
  walk: std('#d8cdbf', 0.95),
  road: std('#8e939b', 0.95),
  line: new THREE.MeshBasicMaterial({ color: '#f4f4f2' }),
  curb: std('#cfc7bb', 0.9),
  bed: std('#6b5242', 0.85),
  soil: std('#4b3a2e', 1),
  leaf: std('#ffffff', 0.85),
  flower: std('#ffffff', 0.7),
  trunk: std('#7d5c43', 0.9),
  palmTrunk: std('#a88a64', 0.9),
  frond: std('#5f9e48', 0.8, { side: THREE.DoubleSide }),
  pole: std('#3d4148', 0.6),
  bulb: std('#fff4d6', 0.5, { emissive: '#ffd58a', emissiveIntensity: 0 }),
  sea: std('#8db2c6', 0.25, { metalness: 0.15 }),
  wall: std('#d6cbbd', 0.9),
  city: new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }),
}
MAT.leaf.userData.live = true
MAT.flower.userData.live = true

const box = new THREE.BoxGeometry(1, 1, 1)
const blob = new THREE.IcosahedronGeometry(1, 1)
const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8)
const taper = new THREE.CylinderGeometry(0.35, 0.5, 1, 8)
const sphere = new THREE.SphereGeometry(1, 8, 6)

/** Instanced mesh from a list of { x, y, z, sx, sy, sz, ry, rz, c }. */
function Inst({ geo, mat, items, cast = false, recv = true }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    o.rotation.order = 'YXZ'
    const col = new THREE.Color()
    items.forEach((it, i) => {
      o.position.set(it.x, it.y, it.z)
      o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0)
      o.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      if (it.c) m.setColorAt(i, col.set(it.c))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [items])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow={cast} receiveShadow={recv} />
}

function plane(x, z, w, d, y, mat, key) {
  return (
    <mesh key={key} rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]} material={mat} receiveShadow>
      <planeGeometry args={[w, d]} />
    </mesh>
  )
}

/** Small deterministic random generator (same lot on every screen). */
function rng(seed) {
  let s = seed >>> 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

const GREENS = ['#5e9a4a', '#6daa52', '#4f8a43', '#7bb35c']
const FLOWERS = ['#9a7fd1', '#b49be0', '#f2c94c', '#ffffff', '#e98fb0', '#f08a5d']

/** The building shell: foundation, the corridors' floor and four exterior walls with windows. */
export function Building({ campus }) {
  const { W, D } = campus
  const H = 3.6, T = 0.3
  const win = (len, gap = null) => {
    const w = (a, b) => windowsAlong(a, b, 5.5, 7.5).map((o) => ({ ...o, sill: 0.6, head: 2.75 }))
    if (!gap) return w(-len / 2 + 1.4, len / 2 - 1.4)
    return [...w(-len / 2 + 1.4, gap[0] - 0.8), { a: gap[0], b: gap[1], kind: 'door', h: 2.7 }, ...w(gap[1] + 0.8, len / 2 - 1.4)]
  }
  return (
    <group>
      {/* stone foundation the building stands on, with two steps at the entrance */}
      <mesh position={[0, -0.28, 0]} material={MAT.foundation} receiveShadow castShadow>
        <boxGeometry args={[W + 0.8, 0.5, D + 0.8]} />
      </mesh>
      <mesh position={[0, -0.37, D / 2 + 0.75]} material={MAT.foundation} receiveShadow>
        <boxGeometry args={[4, 0.3, 0.7]} />
      </mesh>
      <mesh position={[0, -0.44, D / 2 + 1.3]} material={MAT.foundation} receiveShadow>
        <boxGeometry args={[4.6, 0.16, 0.5]} />
      </mesh>
      {plane(0, 0, W, D, -0.015, MAT.hall)}
      <CutWall side="back" W={W} D={D} T={T} H={H} mat={MAT.inner} skin={MAT.facade} fmat={MAT.frame} openings={win(W)} />
      <CutWall side="front" W={W} D={D} T={T} H={H} mat={MAT.inner} skin={MAT.facade} fmat={MAT.frame} openings={win(W, [-1.4, 1.4])} />
      <CutWall side="left" W={W} D={D} T={T} H={H} mat={MAT.inner} skin={MAT.facade} fmat={MAT.frame} openings={win(D)} />
      <CutWall side="right" W={W} D={D} T={T} H={H} mat={MAT.inner} skin={MAT.facade} fmat={MAT.frame} openings={win(D)} />
    </group>
  )
}

/** Everything outside the building. */
export default function Lot({ campus, nightness = 0, night }) {
  const { W, D } = campus
  const bx = W / 2, bz = D / 2
  const L = 11 // lot margin around the building
  const front = bz + L // where the sidewalk starts
  const shore = -(bz + L + 7) // seawall
  const v = useMemo(() => {
    const r = rng(Math.round(W * 31 + D * 17))
    const bushes = [], flowers = [], beds = [], soil = []
    // planters along the building (a wooden bed with soil, bushes and flowers)
    const bed = (x1, z1, x2, z2) => {
      const w = x2 - x1, d = z2 - z1
      beds.push({ x: (x1 + x2) / 2, y: -0.28, z: (z1 + z2) / 2, sx: w, sy: 0.42, sz: d })
      soil.push({ x: (x1 + x2) / 2, y: -0.06, z: (z1 + z2) / 2, sx: w - 0.16, sy: 0.02, sz: d - 0.16 })
      const along = w > d
      const len = Math.max(w, d)
      for (let t = 0.5; t < len - 0.3; t += 0.75 + r() * 0.3) {
        const px = along ? x1 + t : (x1 + x2) / 2 + (r() - 0.5) * (w - 0.5)
        const pz = along ? (z1 + z2) / 2 + (r() - 0.5) * (d - 0.5) : z1 + t
        const s = 0.32 + r() * 0.22
        bushes.push({ x: px, y: -0.05 + s * 0.55, z: pz, sx: s, sy: s * 0.85, sz: s, ry: r() * 6, c: GREENS[Math.floor(r() * GREENS.length)] })
        for (let k = 0; k < 2; k++) {
          const f = 0.06 + r() * 0.05
          flowers.push({ x: px + (r() - 0.5) * 0.8, y: -0.02 + f, z: pz + (r() - 0.5) * 0.6, sx: f, sy: f, sz: f, c: FLOWERS[Math.floor(r() * FLOWERS.length)] })
        }
      }
    }
    bed(-bx + 0.6, bz + 0.9, -3.2, bz + 2.1)
    bed(3.2, bz + 0.9, bx - 0.6, bz + 2.1)
    bed(-bx - 2.1, -bz + 1, -bx - 0.9, bz - 1)
    bed(bx + 0.9, -bz + 1, bx + 2.1, bz - 1)
    bed(-bx + 1, -bz - 2.1, bx - 1, -bz - 0.9)
    // two oval flower beds on the front lawn, either side of the path
    for (const sx of [-1, 1]) {
      const cx = sx * Math.min(bx * 0.45, 9), cz = bz + L * 0.58, rx = Math.min(4.2, bx * 0.3), rz = 1.7
      for (let a = 0; a < Math.PI * 2; a += 0.38) {
        const s = 0.38 + r() * 0.2
        bushes.push({ x: cx + Math.cos(a) * rx, y: -0.5 + s * 0.6, z: cz + Math.sin(a) * rz, sx: s, sy: s * 0.85, sz: s, ry: r() * 6, c: GREENS[Math.floor(r() * GREENS.length)] })
      }
      for (let k = 0; k < 46; k++) {
        const a = r() * Math.PI * 2, q = Math.sqrt(r()) * 0.75
        const f = 0.09 + r() * 0.06
        flowers.push({ x: cx + Math.cos(a) * rx * q, y: -0.5 + f, z: cz + Math.sin(a) * rz * q, sx: f, sy: f, sz: f, c: k % 5 === 0 ? '#ffffff' : sx < 0 ? '#9a7fd1' : '#f2c94c' })
      }
    }
    // trees: not a grid; a few groups at the corners and along the sides, all a little different
    const trunks = [], crowns = []
    const tree = (x, z, s) => {
      trunks.push({ x, y: -0.5 + 0.9 * s, z, sx: 0.32 * s, sy: 1.8 * s, sz: 0.32 * s })
      const n = 3 + Math.floor(r() * 2)
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r()
        const cs = (0.9 + r() * 0.5) * s
        crowns.push({ x: x + Math.cos(a) * 0.55 * s, y: -0.5 + (2.3 + r() * 0.8) * s, z: z + Math.sin(a) * 0.55 * s, sx: cs, sy: cs * 0.85, sz: cs, ry: r() * 6, c: GREENS[Math.floor(r() * GREENS.length)] })
      }
      crowns.push({ x, y: -0.5 + 3.2 * s, z, sx: 0.85 * s, sy: 0.75 * s, sz: 0.85 * s, c: GREENS[Math.floor(r() * GREENS.length)] })
    }
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
    for (const [sx, sz] of corners) {
      const cx = sx * (bx + L - 3), cz = sz * (bz + L - 3)
      tree(cx + (r() - 0.5) * 2, cz + (r() - 0.5) * 2, 1.0 + r() * 0.3)
      if (r() > 0.35) tree(cx - sx * (3 + r() * 2), cz + (r() - 0.5) * 2, 0.75 + r() * 0.25)
    }
    for (const sx of [-1, 1]) for (let z = -bz + 2; z < bz - 2; z += 7 + r() * 4) tree(sx * (bx + L - 2.5 + (r() - 0.5) * 2), z, 0.8 + r() * 0.35)
    // street trees on the far side of the road
    for (let x = -bx - L - 20; x < bx + L + 20; x += 9 + r() * 4) tree(x, front + 12.2 + r(), 0.85 + r() * 0.3)
    // palms by the entrance and the back corners
    const palmT = [], fronds = []
    const palm = (x, z, h) => {
      const lean = (r() - 0.5) * 0.18
      palmT.push({ x, y: -0.5 + h / 2, z, sx: 0.28, sy: h, sz: 0.28, rz: lean })
      const tx = x - Math.sin(lean) * h / 2, ty = -0.5 + h
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + r() * 0.3
        const tilt = 0.35 + r() * 0.35, len = 2.0 + r() * 0.6
        fronds.push({ x: tx + Math.cos(a) * Math.cos(tilt) * len / 2, y: ty - Math.sin(tilt) * len / 2, z: z + Math.sin(a) * Math.cos(tilt) * len / 2, sx: len, sy: 0.04, sz: 0.5, ry: -a, rz: -tilt })
      }
    }
    palm(-4.2, bz + 3.2, 5.2)
    palm(4.4, bz + 3.0, 5.8)
    palm(-bx - 3.8, -bz - 3.6, 6.0)
    palm(bx + 3.6, -bz - 4.0, 5.4)
    // street: dashes and a crosswalk in front of the path
    const lines = []
    const roadZ = front + 2.6 + 3.5
    for (let x = -bx - L - 60; x < bx + L + 60; x += 3) lines.push({ x, y: -0.485, z: roadZ, sx: 1.4, sy: 0.01, sz: 0.14 })
    for (let x = -2.6; x <= 2.6; x += 0.75) lines.push({ x, y: -0.483, z: roadZ, sx: 0.42, sy: 0.01, sz: 6.4 })
    // lamp posts along the sidewalk
    const poles = [], bulbs = []
    for (let x = -bx - L + 2; x < bx + L; x += 10) {
      poles.push({ x, y: -0.5 + 1.6, z: front + 0.5, sx: 0.09, sy: 3.2, sz: 0.09 })
      bulbs.push({ x, y: -0.5 + 3.25, z: front + 0.5, sx: 0.32, sy: 0.18, sz: 0.32 })
    }
    // the city across the water and hills behind it, in haze
    const towers = []
    const haze = C('#dde6ee')
    const tones = ['#d8d2ca', '#c9c1b8', '#bec6cd', '#e4ddd3', '#b8b2ad', '#cfd6dc']
    for (let i = 0; i < 70; i++) {
      const x = -190 + r() * 380, z = shore - 95 - r() * 70
      const h = 8 + Math.pow(r(), 2) * 46, w = 6 + r() * 10, d = 6 + r() * 10
      const far = (shore - 95 - z) / 70
      const c = C(tones[Math.floor(r() * tones.length)]).lerp(haze, 0.55 + far * 0.3)
      towers.push({ x, y: -0.9 + h / 2, z, sx: w, sy: h, sz: d, c: '#' + c.getHexString() })
    }
    const hills = [
      { x: -120, y: -6, z: shore - 190, sx: 90, sy: 26, sz: 30, c: '#cdd8de' },
      { x: 30, y: -8, z: shore - 205, sx: 120, sy: 34, sz: 30, c: '#c7d3da' },
      { x: 170, y: -6, z: shore - 185, sx: 80, sy: 22, sz: 30, c: '#d0dae0' },
    ]
    const posts = []
    for (let x = -bx - L - 40; x < bx + L + 40; x += 2.4) posts.push({ x, y: -0.15, z: shore + 0.3, sx: 0.06, sy: 0.7, sz: 0.06 })
    return { bushes, flowers, beds, soil, trunks, crowns, palmT, fronds, lines, poles, bulbs, towers, hills, posts }
  }, [W, D, bx, bz, front, shore])

  useFrame(() => {
    MAT.bulb.emissiveIntensity = nightness * 2.4
    MAT.city.color.setRGB(1, 1, 1).lerp(_nightCity, nightness * 0.85)
  })

  const span = 2 * (bx + L) + 160
  const roadZ = front + 2.6 + 3.5
  return (
    <group>
      {/* land, lot lawn, paving ring and the path to the street */}
      {plane(0, (shore + front + 120) / 2, span, front + 120 - shore, -0.54, MAT.land)}
      {plane(0, 0, 2 * (bx + L), 2 * (bz + L), -0.51, MAT.lawn)}
      {plane(0, 0, W + 5.2, D + 5.2, -0.49, MAT.paving)}
      {plane(0, (bz + 2.6 + front) / 2, 3.2, front - bz - 2.6, -0.49, MAT.paving)}
      {/* promenade by the water, seawall with posts, the sea */}
      {plane(0, (shore - bz - L) / 2, span, -bz - L - shore, -0.5, MAT.plaza)}
      <mesh position={[0, -0.75, shore]} material={MAT.wall} receiveShadow>
        <boxGeometry args={[span, 0.6, 0.6]} />
      </mesh>
      <Inst geo={box} mat={MAT.pole} items={v.posts} recv={false} />
      {plane(0, shore - 200, 900, 400, -0.95, MAT.sea)}
      {/* sidewalk, curb, road, far sidewalk */}
      {plane(0, front + 1.3, span, 2.6, -0.48, MAT.walk)}
      <mesh position={[0, -0.47, front + 2.6]} material={MAT.curb}>
        <boxGeometry args={[span, 0.1, 0.18]} />
      </mesh>
      {plane(0, roadZ, span, 7, -0.495, MAT.road)}
      {plane(0, roadZ + 4.8, span, 2.6, -0.48, MAT.walk)}
      <Inst geo={box} mat={MAT.line} items={v.lines} recv={false} />
      {/* planters, bushes, flowers */}
      <Inst geo={box} mat={MAT.bed} items={v.beds} />
      <Inst geo={box} mat={MAT.soil} items={v.soil} />
      <Inst geo={blob} mat={MAT.leaf} items={v.bushes} cast={!night} />
      <Inst geo={sphere} mat={MAT.flower} items={v.flowers} recv={false} />
      {/* trees and palms */}
      <Inst geo={taper} mat={MAT.trunk} items={v.trunks} cast={!night} />
      <Inst geo={blob} mat={MAT.leaf} items={v.crowns} cast={!night} />
      <Inst geo={cyl} mat={MAT.palmTrunk} items={v.palmT} cast={!night} />
      <Inst geo={box} mat={MAT.frond} items={v.fronds} cast={!night} />
      {/* street lamps */}
      <Inst geo={box} mat={MAT.pole} items={v.poles} />
      <Inst geo={box} mat={MAT.bulb} items={v.bulbs} recv={false} />
      {/* the city across the water */}
      <Inst geo={box} mat={MAT.city} items={v.towers} recv={false} />
      <Inst geo={sphere} mat={MAT.city} items={v.hills} recv={false} />
    </group>
  )
}
const _nightCity = C('#2b3247')
