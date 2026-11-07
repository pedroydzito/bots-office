import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { createTVCanvas, drawTV, getCodeTextures, makeClockFace, makeTitleTexture, makeRugTexture } from './textures'
import { botPositions, seatYaw, tickCodeScroll } from './registry'

const M = {
  white: new THREE.MeshStandardMaterial({ color: '#f7f7f8', roughness: 0.6 }),
  desk: new THREE.MeshStandardMaterial({ color: '#fbfbfc', roughness: 0.45 }),
  black: new THREE.MeshStandardMaterial({ color: '#1c1c1f', roughness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2b2d33', roughness: 0.4, metalness: 0.2 }),
  grey: new THREE.MeshStandardMaterial({ color: '#d9dbe0', roughness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: '#c8ccd3', roughness: 0.25, metalness: 0.7 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#8fd16a', roughness: 0.7 }),
  leaf2: new THREE.MeshStandardMaterial({ color: '#6fbf5a', roughness: 0.7 }),
  pot: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#dbe9f5', transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false }),
  water: new THREE.MeshPhysicalMaterial({ color: '#8cc8ff', transparent: true, opacity: 0.6, roughness: 0.1 }),
}
export { M as MATS }

/** Swivel chair: turns with the bot sitting on it, eases back when empty. */
export function Chair({ x, z, owner }) {
  const top = useRef()
  useFrame((_, dt) => {
    if (!top.current) return
    const want = seatYaw.get(owner) ?? 0
    top.current.rotation.y += (want - top.current.rotation.y) * Math.min(1, dt * 8)
  })
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.03, 0]} material={M.black} castShadow>
        <cylinderGeometry args={[0.28, 0.3, 0.05, 20]} />
      </mesh>
      <mesh position={[0, 0.22, 0]} material={M.dark}>
        <cylinderGeometry args={[0.035, 0.035, 0.36, 10]} />
      </mesh>
      <group ref={top}>
        <RoundedBox args={[0.62, 0.1, 0.58]} radius={0.04} smoothness={2} position={[0, 0.45, -0.02]} material={M.black} castShadow receiveShadow />
        <RoundedBox args={[0.6, 0.5, 0.07]} radius={0.03} smoothness={2} position={[0, 0.76, -0.44]} rotation={[-0.1, 0, 0]} material={M.black} castShadow />
        <mesh position={[0, 0.55, -0.4]} material={M.dark}>
          <boxGeometry args={[0.05, 0.16, 0.05]} />
        </mesh>
      </group>
    </group>
  )
}

export function DeskRow({ row }) {
  const w = row.x2 - row.x1
  const cx = (row.x1 + row.x2) / 2
  const z = row.z + 0.82
  return (
    <group>
      <RoundedBox args={[w, 0.06, 0.88]} radius={0.025} position={[cx, 0.72, z]} material={M.desk} castShadow receiveShadow />
      {[row.x1 + 0.05, row.x2 - 0.05].map((x, i) => (
        <mesh key={i} position={[x, 0.35, z]} material={M.desk} castShadow receiveShadow>
          <boxGeometry args={[0.05, 0.7, 0.8]} />
        </mesh>
      ))}
      <mesh position={[cx, 0.45, z + 0.38]} material={M.grey} receiveShadow>
        <boxGeometry args={[w - 0.12, 0.4, 0.02]} />
      </mesh>
    </group>
  )
}

const MUG_COLORS = ['#1E86FC', '#FD690F', '#F5B70A', '#2FB36B', '#ffffff', '#E5484D']

export function Workstation({ seat, status, idx, night }) {
  const codes = getCodeTextures()
  const screenMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#000',
        emissive: '#ffffff',
        emissiveMap: codes[idx % codes.length],
        map: codes[idx % codes.length],
        emissiveIntensity: 0.9,
      }),
    [codes, idx],
  )
  const ref = useRef(screenMat)
  useEffect(() => () => screenMat.dispose(), [screenMat])
  useFrame(({ clock }, dt) => {
    const m = ref.current
    const on = status === 'working' || status === 'waiting_user' || status === 'error'
    const target = (on ? 1.1 : 0.25) * (night ? 1.6 : 1)
    if (Math.abs(target - m.emissiveIntensity) > 0.005) m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, dt * 3)
    tickCodeScroll(clock.elapsedTime, codes)
  })
  const mug = MUG_COLORS[idx % MUG_COLORS.length]
  return (
    <group position={[seat.x, 0.75, seat.z]}>
      {/* monitor faces the bot */}
      <group position={[0.1, 0, 1.0]} rotation={[0, Math.PI + (idx % 2 ? 0.12 : -0.12), 0]}>
        <mesh position={[0, 0.11, 0.06]} material={M.metal}>
          <boxGeometry args={[0.05, 0.22, 0.03]} />
        </mesh>
        <mesh position={[0, 0.01, 0.04]} material={M.metal}>
          <boxGeometry args={[0.22, 0.015, 0.14]} />
        </mesh>
        <RoundedBox args={[0.6, 0.37, 0.035]} radius={0.012} position={[0, 0.34, 0.04]} material={M.white} castShadow />
        <mesh position={[0, 0.34, 0.06]} material={screenMat}>
          <planeGeometry args={[0.55, 0.32]} />
        </mesh>
      </group>
      <RoundedBox args={[0.42, 0.02, 0.14]} radius={0.008} position={[-0.02, 0.01, 0.55]} material={M.white} castShadow />
      <mesh position={[0.62, 0.06, 0.62]} castShadow>
        <cylinderGeometry args={[0.045, 0.04, 0.11, 14]} />
        <meshStandardMaterial color={mug} roughness={0.4} />
      </mesh>
    </group>
  )
}

export function Plant({ position, scale = 1, kind = 0 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.22, 0]} material={M.pot} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.19, 0.44, 24]} />
      </mesh>
      {kind === 0 ? (
        <group position={[0, 0.44, 0]}>
          <mesh position={[0, 0.35, 0]} material={M.leaf} castShadow scale={[1, 1.15, 1]}>
            <sphereGeometry args={[0.38, 24, 18]} />
          </mesh>
          <mesh position={[0.05, 0.75, 0.02]} material={M.leaf} castShadow>
            <sphereGeometry args={[0.28, 24, 18]} />
          </mesh>
          <mesh position={[-0.02, 1.02, 0]} material={M.leaf2} castShadow>
            <sphereGeometry args={[0.18, 20, 14]} />
          </mesh>
        </group>
      ) : (
        <group position={[0, 0.44, 0]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[Math.cos(i * 1.3) * 0.12, 0.35 + i * 0.12, Math.sin(i * 1.3) * 0.12]} rotation={[Math.cos(i) * 0.5, i, Math.sin(i) * 0.5]} material={i % 2 ? M.leaf : M.leaf2} castShadow scale={[1, 0.25, 0.5]}>
              <sphereGeometry args={[0.3, 16, 12]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}

export function WallTitle({ title, subtitle, position, rotation }) {
  const tex = useMemo(() => makeTitleTexture(title, subtitle), [title, subtitle])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[3.6, 0.9]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  )
}

export function Clock({ position, rotation }) {
  const face = useMemo(() => makeClockFace(), [])
  const h = useRef(), m = useRef()
  useFrame(() => {
    const d = new Date()
    const mins = d.getMinutes() + d.getSeconds() / 60
    if (m.current) m.current.rotation.z = -(mins / 60) * Math.PI * 2
    if (h.current) h.current.rotation.z = -(((d.getHours() % 12) + mins / 60) / 12) * Math.PI * 2
  })
  return (
    <group position={position} rotation={rotation}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={M.dark}>
        <cylinderGeometry args={[0.42, 0.42, 0.05, 40]} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <circleGeometry args={[0.38, 40]} />
        <meshBasicMaterial map={face} toneMapped={false} />
      </mesh>
      <group ref={h} position={[0, 0, 0.04]}>
        <mesh position={[0, 0.1, 0]} material={M.black}>
          <boxGeometry args={[0.03, 0.2, 0.01]} />
        </mesh>
      </group>
      <group ref={m} position={[0, 0, 0.045]}>
        <mesh position={[0, 0.14, 0]} material={M.black}>
          <boxGeometry args={[0.02, 0.28, 0.01]} />
        </mesh>
      </group>
    </group>
  )
}

export function CoffeeCorner({ position }) {
  return (
    <group position={position}>
      <RoundedBox args={[2.2, 0.08, 0.5]} radius={0.02} position={[0, 1.05, 0]} material={M.white} castShadow receiveShadow />
      <RoundedBox args={[2.2, 0.9, 0.5]} radius={0.02} position={[0, 0.45, 0]} material={M.white} castShadow receiveShadow />
      <RoundedBox args={[0.45, 0.55, 0.38]} radius={0.04} position={[0.5, 1.37, 0]} material={M.black} castShadow />
      <mesh position={[0.5, 1.5, 0.2]}>
        <circleGeometry args={[0.03, 12]} />
        <meshBasicMaterial color="#5cff9b" />
      </mesh>
      {['#FD690F', '#1E86FC', '#ffffff'].map((c, i) => (
        <mesh key={i} position={[-0.6 + i * 0.18, 1.15, 0.05]} castShadow>
          <cylinderGeometry args={[0.05, 0.045, 0.12, 14]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
    </group>
  )
}

export function TVScreen({ position, rotation, label, getValue, getSeries, night }) {
  const tv = useMemo(() => createTVCanvas(), [])
  const acc = useRef(10)
  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current > 1) {
      acc.current = 0
      drawTV(tv, { label, value: getValue(), series: getSeries() })
    }
  })
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[2.3, 1.36, 0.08]} radius={0.03} material={M.black} castShadow />
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[2.18, 1.26]} />
        <meshBasicMaterial map={tv.texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function StickyWall({ position, rotation }) {
  const notes = useMemo(() => {
    const cols = ['#F5B70A', '#8F59F9', '#F93498', '#1E86FC', '#FD690F', '#2FB36B', '#fde68a']
    return Array.from({ length: 12 }, (_, i) => ({ x: (i % 4) * 0.36 + (Math.random() - 0.5) * 0.06, y: Math.floor(i / 4) * 0.36, c: cols[i % cols.length], r: (Math.random() - 0.5) * 0.25 }))
  }, [])
  return (
    <group position={position} rotation={rotation}>
      {notes.map((n, i) => (
        <mesh key={i} position={[n.x, n.y, 0]} rotation={[0, 0, n.r]}>
          <boxGeometry args={[0.28, 0.28, 0.01]} />
          <meshStandardMaterial color={n.c} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

const BOOK_COLORS = ['#E5484D', '#1E86FC', '#F5B70A', '#2FB36B', '#8F59F9', '#FD690F', '#1c1c1f', '#F93498', '#14B8A6', '#ffffff']

export function Bookshelf({ position, rotation, width = 1.6, shelves = 4, seed = 1 }) {
  const books = useMemo(() => {
    const out = []
    let r = seed * 9301
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280)
    for (let s = 0; s < shelves; s++) {
      let x = -width / 2 + 0.08
      while (x < width / 2 - 0.12) {
        const w = 0.05 + rnd() * 0.06
        const h = 0.26 + rnd() * 0.14
        if (rnd() < 0.08) {
          x += 0.12
          continue
        }
        out.push({ x: x + w / 2, y: 0.08 + s * 0.48 + h / 2, w, h, c: BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)], tilt: rnd() < 0.06 ? 0.2 : 0 })
        x += w + 0.008
      }
    }
    return out
  }, [width, shelves, seed])
  const ref = useRef()
  useEffect(() => {
    const inst = ref.current
    const m = new THREE.Matrix4()
    books.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.y, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, b.tilt)), new THREE.Vector3(b.w, b.h, 0.26))
      inst.setMatrixAt(i, m)
      inst.setColorAt(i, new THREE.Color(b.c))
    })
    inst.instanceMatrix.needsUpdate = true
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
  }, [books])
  const H = shelves * 0.48 + 0.08
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, H / 2, -0.17]} material={M.white} receiveShadow>
        <boxGeometry args={[width, H, 0.04]} />
      </mesh>
      {Array.from({ length: shelves + 1 }, (_, s) => (
        <mesh key={s} position={[0, 0.04 + s * 0.48, 0]} material={M.white} castShadow receiveShadow>
          <boxGeometry args={[width, 0.04, 0.36]} />
        </mesh>
      ))}
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[(sd * width) / 2, H / 2, 0]} material={M.white} castShadow>
          <boxGeometry args={[0.04, H, 0.36]} />
        </mesh>
      ))}
      <instancedMesh ref={ref} args={[undefined, undefined, books.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
    </group>
  )
}

export function WaterCooler({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[0.42, 1.0, 0.42]} radius={0.05} position={[0, 0.5, 0]} material={M.white} castShadow receiveShadow />
      <mesh position={[0, 1.25, 0]} material={M.water} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.5, 20]} />
      </mesh>
      <mesh position={[0.22, 0.72, 0]} material={M.dark}>
        <boxGeometry args={[0.04, 0.06, 0.08]} />
      </mesh>
    </group>
  )
}

export function Lounge({ position, night }) {
  const rug = useMemo(() => makeRugTexture('#e8e3dc'), [])
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <planeGeometry args={[3.6, 2.8]} />
        <meshStandardMaterial map={rug} roughness={0.95} />
      </mesh>
      {/* sofa */}
      <group position={[0.2, 0, -0.9]}>
        <RoundedBox args={[2.4, 0.38, 0.9]} radius={0.12} position={[0, 0.28, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#d6d8dd" roughness={0.9} />
        </RoundedBox>
        <RoundedBox args={[2.4, 0.6, 0.25]} radius={0.1} position={[0, 0.6, -0.36]} castShadow>
          <meshStandardMaterial color="#d6d8dd" roughness={0.9} />
        </RoundedBox>
        {[-1.1, 1.1].map((x) => (
          <RoundedBox key={x} args={[0.24, 0.5, 0.9]} radius={0.1} position={[x, 0.42, 0]} castShadow>
            <meshStandardMaterial color="#cfd1d6" roughness={0.9} />
          </RoundedBox>
        ))}
        <RoundedBox args={[0.42, 0.3, 0.14]} radius={0.06} position={[-0.6, 0.6, -0.15]} rotation={[0.2, 0.2, 0]} castShadow>
          <meshStandardMaterial color="#F5B70A" roughness={0.9} />
        </RoundedBox>
      </group>
      {/* coffee table */}
      <RoundedBox args={[1.1, 0.06, 0.6]} radius={0.02} position={[0.2, 0.36, 0.25]} material={M.white} castShadow receiveShadow />
      {[[-0.3, -0.18], [0.7, -0.18], [-0.3, 0.68], [0.7, 0.68]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.17, z - 0.02]} material={M.metal}>
          <cylinderGeometry args={[0.018, 0.018, 0.34, 8]} />
        </mesh>
      ))}
      <RoundedBox args={[0.3, 0.04, 0.22]} radius={0.01} position={[0.35, 0.41, 0.25]} material={M.dark} castShadow />
      {/* poufs */}
      {[[-0.9, 0.9], [-0.15, 1.15]].map(([x, z], i) => (
        <RoundedBox key={i} args={[0.6, 0.38, 0.6]} radius={0.14} position={[x, 0.19, z]} material={M.black} castShadow receiveShadow />
      ))}
      {/* floor lamp */}
      <group position={[1.55, 0, -1.1]}>
        <mesh position={[0, 0.02, 0]} material={M.dark}>
          <cylinderGeometry args={[0.18, 0.2, 0.04, 20]} />
        </mesh>
        <mesh position={[0, 0.85, 0]} material={M.dark}>
          <cylinderGeometry args={[0.015, 0.015, 1.7, 8]} />
        </mesh>
        <mesh position={[0, 1.72, 0]}>
          <coneGeometry args={[0.18, 0.2, 24, 1, true]} />
          <meshStandardMaterial color="#fff6e0" emissive="#ffd28a" emissiveIntensity={night ? 2.2 : 0.1} side={THREE.DoubleSide} />
        </mesh>
        {night && <pointLight position={[0, 1.5, 0]} intensity={7} distance={6} color="#ffcf8a" decay={1.6} />}
      </group>
    </group>
  )
}

export function Railing({ W, D }) {
  const posts = []
  for (let x = -W / 2 + 0.6; x <= W / 2; x += 1.6) posts.push([x, D / 2 - 0.08])
  for (let z = -D / 2 + 0.6; z <= D / 2; z += 1.6) posts.push([W / 2 - 0.08, z])
  return (
    <group>
      <mesh position={[0, 1.0, D / 2 - 0.08]} material={M.white} castShadow>
        <boxGeometry args={[W, 0.05, 0.06]} />
      </mesh>
      <mesh position={[W / 2 - 0.08, 1.0, 0]} material={M.white} castShadow>
        <boxGeometry args={[0.06, 0.05, D]} />
      </mesh>
      <mesh position={[0, 0.52, D / 2 - 0.08]} material={M.glass}>
        <boxGeometry args={[W, 0.92, 0.02]} />
      </mesh>
      <mesh position={[W / 2 - 0.08, 0.52, 0]} material={M.glass}>
        <boxGeometry args={[0.02, 0.92, D]} />
      </mesh>
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.5, z]} material={M.white}>
          <boxGeometry args={[0.04, 1.0, 0.04]} />
        </mesh>
      ))}
    </group>
  )
}

/** Elevator on the left wall; doors slide open when a bot is near. */
export function Elevator({ layout, floorY, label, night }) {
  const { W } = layout
  const z = layout.elevator.z
  const left = useRef(), right = useRef(), lamp = useRef()
  const open = useRef(0)
  useFrame((_, dt) => {
    let near = false
    for (const p of botPositions.values()) {
      if (Math.abs(p.y - floorY) > 2.5) continue
      if (Math.hypot(p.x - layout.elevator.x, p.z - z) < 1.5) near = true
    }
    open.current += ((near ? 1 : 0) - open.current) * Math.min(1, dt * 5)
    const o = open.current * 0.5
    if (left.current) left.current.position.z = -0.3 - o
    if (right.current) right.current.position.z = 0.3 + o
    if (lamp.current) lamp.current.emissiveIntensity = near ? 2 : 0.3
  })
  return (
    <group position={[-W / 2 + 0.26, 0, z]}>
      {/* frame */}
      <mesh position={[0.02, 1.15, 0]} material={M.metal} castShadow>
        <boxGeometry args={[0.08, 2.4, 1.5]} />
      </mesh>
      <mesh position={[0.05, 1.08, 0]}>
        <boxGeometry args={[0.02, 2.15, 1.22]} />
        <meshStandardMaterial color={night ? '#ffe6b0' : '#2a2d33'} emissive={night ? '#ffcf8a' : '#000'} emissiveIntensity={night ? 0.6 : 0} />
      </mesh>
      <group position={[0.09, 1.08, 0]}>
        <mesh ref={left} position={[0, 0, -0.3]} material={M.metal}>
          <boxGeometry args={[0.03, 2.15, 0.6]} />
        </mesh>
        <mesh ref={right} position={[0, 0, 0.3]} material={M.metal}>
          <boxGeometry args={[0.03, 2.15, 0.6]} />
        </mesh>
      </group>
      {/* clip doors that slide past the frame */}
      <mesh position={[0.1, 1.08, -1.05]} material={M.white}>
        <boxGeometry args={[0.06, 2.3, 0.6]} />
      </mesh>
      <mesh position={[0.1, 1.08, 1.05]} material={M.white}>
        <boxGeometry args={[0.06, 2.3, 0.6]} />
      </mesh>
      <mesh position={[0.08, 2.48, 0]}>
        <boxGeometry args={[0.02, 0.18, 0.44]} />
        <meshStandardMaterial ref={lamp} color="#111" emissive="#5cc8ff" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.1, 1.15, 0.92]}>
        <boxGeometry args={[0.02, 0.22, 0.1]} />
        <meshStandardMaterial color="#e5e7eb" emissive="#ffffff" emissiveIntensity={0.15} />
      </mesh>
    </group>
  )
}
