import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createTVCanvas, drawBoard, drawTVNow, getCodeTextures, getScreenTextures, screenKind, makeClockFace, makeTitleTexture, makeRugTexture } from './textures'
import { botPositions, poiKey, seatYaw, sitting, tickCodeScroll } from './registry'
import { hideTip, showTip } from '../lib/tip'

/** set by the building: overview mode draws no point lights */
export const sceneFlags = { compact: false }

const matCache = new Map()
/** One shared material per colour/finish (fewer materials = fewer state switches per frame). */
export function sharedMat(color, roughness = 0.6, metalness = 0) {
  const k = `${color}|${roughness}|${metalness}`
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness, metalness }))
  return matCache.get(k)
}

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
  soil: new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 1 }),
  glass: new THREE.MeshStandardMaterial({ color: '#dbe9f5', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, depthWrite: false }),
  water: new THREE.MeshPhysicalMaterial({ color: '#8cc8ff', transparent: true, opacity: 0.6, roughness: 0.1 }),
}
export { M as MATS }

// seat + backrest + post as one geometry (one draw call per chair instead of three)
let _chairTop = null
function chairTopGeo() {
  if (_chairTop) return _chairTop
  const seat = new RoundedBoxGeometry(0.62, 0.1, 0.58, 2, 0.04).translate(0, 0.45, -0.02)
  const back = new RoundedBoxGeometry(0.6, 0.5, 0.07, 2, 0.03).rotateX(-0.1).translate(0, 0.76, -0.44)
  const post = new THREE.BoxGeometry(0.05, 0.16, 0.05).translate(0, 0.55, -0.4)
  const clean = (g) => {
    const n = g.index ? g.toNonIndexed() : g
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k)
    return n
  }
  _chairTop = mergeGeometries([seat, back, post].map(clean), false)
  return _chairTop
}

/** Swivel chair: turns with the bot sitting on it, eases back when empty. */
export const Chair = memo(function Chair({ x, z, owner, hiddenOwner, yawBase = 0 }) {
  const top = useRef()
  useFrame((_, dt) => {
    if (!top.current) return
    const want = (seatYaw.get(owner) ?? yawBase) - yawBase
    top.current.rotation.y += (want - top.current.rotation.y) * Math.min(1, dt * 8)
  })
  const tipProps = hiddenOwner
    ? {
        onPointerOver: (e) => (e.stopPropagation(), showTip({ title: `Lugar de ${hiddenOwner}`, sub: 'Bot oculto no Grok' })),
        onPointerOut: hideTip,
      }
    : {}
  return (
    <group position={[x, 0, z]} {...tipProps}>
      {/* five-star base with casters */}
      {[0, 1, 2, 3, 4].map((k) => {
        const a = (k / 5) * Math.PI * 2
        return (
          <group key={k} rotation={[0, a, 0]}>
            <mesh position={[0.14, 0.07, 0]} material={M.black} castShadow><boxGeometry args={[0.28, 0.035, 0.05]} /></mesh>
            <mesh position={[0.27, 0.03, 0]} material={M.dark}><sphereGeometry args={[0.03, 8, 6]} /></mesh>
          </group>
        )
      })}
      <mesh position={[0, 0.22, 0]} material={M.dark}>
        <cylinderGeometry args={[0.035, 0.035, 0.36, 10]} />
      </mesh>
      <group userData={{ dynamic: true }} ref={top}>
        <mesh geometry={chairTopGeo()} material={M.black} castShadow receiveShadow />
      </group>
    </group>
  )
})

/** Desk finishes: every floor picks one (white, oak, walnut, black). */
export const DESK_FINISH = [sharedMat('#c8996a', 0.55), sharedMat('#8a6446', 0.5), sharedMat('#d8b48a', 0.55), sharedMat('#a87850', 0.5)]

export function DeskRow({ row, mat = M.desk }) {
  const w = row.x2 - row.x1
  const cx = (row.x1 + row.x2) / 2
  const z = row.z + 0.82
  return (
    <group>
      <RoundedBox args={[w, 0.06, 0.88]} radius={0.025} position={[cx, 0.72, z]} material={mat} castShadow receiveShadow />
      {[row.x1 + 0.05, row.x2 - 0.05].map((x, i) => (
        <mesh key={i} position={[x, 0.35, z]} material={mat} castShadow receiveShadow>
          <boxGeometry args={[0.05, 0.7, 0.8]} />
        </mesh>
      ))}
      <mesh position={[cx, 0.45, z + 0.38]} material={M.grey} receiveShadow>
        <boxGeometry args={[w - 0.12, 0.4, 0.02]} />
      </mesh>
      {/* drawer pedestal at one end, with handles */}
      <group position={[row.x2 - 0.32, 0, z + 0.05]}>
        <mesh position={[0, 0.34, 0]} material={M.white} castShadow receiveShadow><boxGeometry args={[0.42, 0.66, 0.6]} /></mesh>
        {[0.18, 0.38, 0.56].map((y) => (
          <mesh key={y} position={[0, y, -0.305]} material={M.metal}><boxGeometry args={[0.16, 0.018, 0.015]} /></mesh>
        ))}
      </group>
    </group>
  )
}

// soft pool of screen light on the desk (shows at night when the monitor is on)
let glowTex = null
function screenGlowTexture() {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(32, 20, 2, 32, 32, 32)
  gr.addColorStop(0, 'rgba(160,200,255,0.9)')
  gr.addColorStop(1, 'rgba(160,200,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  glowTex = new THREE.CanvasTexture(c)
  return glowTex
}
const glowGeo = new THREE.PlaneGeometry(0.9, 0.6)

const MUG_COLORS = ['#1E86FC', '#FD690F', '#F5B70A', '#2FB36B', '#ffffff', '#E5484D']

export const Workstation = memo(function Workstation({ seat, status, idx, night, step, color }) {
  const codes = getCodeTextures()
  const kind = screenKind(step)
  const map = kind ? getScreenTextures()[kind] : codes[idx % codes.length]
  const screenMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#000',
        emissive: '#ffffff',
        emissiveMap: map,
        map,
        emissiveIntensity: 0,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  // the screen shows roughly what the bot is doing (mail, chart, document, design, code...)
  useEffect(() => {
    screenMat.map = map
    screenMat.emissiveMap = map
  }, [map, screenMat])
  const ref = useRef(screenMat)
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ map: screenGlowTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  const glow = useRef()
  useEffect(() => () => (screenMat.dispose(), glowMat.dispose()), [screenMat, glowMat])
  useFrame(({ clock }, dt) => {
    const m = ref.current
    // resting bot = monitor off (black)
    const on = status === 'working' || status === 'waiting_user' || status === 'error'
    const target = on ? 0.9 * (night ? 1.5 : 1) : 0
    if (!on && m.emissiveIntensity < 0.005) return
    if (sceneFlags.compact && Math.abs(m.emissiveIntensity - target) < 0.01) return
    if (Math.abs(target - m.emissiveIntensity) > 0.005) m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, dt * 3)
    glowMat.opacity = night ? m.emissiveIntensity * 0.5 : 0
    if (glow.current) glow.current.visible = glowMat.opacity > 0.01
    if (on && !kind) tickCodeScroll(clock.elapsedTime, codes)
  })
  // each bot drinks from a mug in its own colour
  const mug = color || MUG_COLORS[idx % MUG_COLORS.length]
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
        <mesh ref={glow} geometry={glowGeo} material={glowMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0.38]} visible={false} />
        <mesh position={[0, 0.34, 0.06]} material={screenMat}>
          <planeGeometry args={[0.55, 0.32]} />
        </mesh>
      </group>
      <RoundedBox args={[0.42, 0.02, 0.14]} radius={0.008} position={[-0.02, 0.01, 0.55]} material={M.white} />
      <mesh position={[0.62, 0.06, 0.62]} material={sharedMat(mug, 0.4)}>
        <cylinderGeometry args={[0.045, 0.04, 0.11, 14]} />
      </mesh>
    </group>
  )
})

function nearestBot(x, z) {
  let best = Infinity
  for (const q of botPositions.values()) best = Math.min(best, Math.hypot(q.x - x, q.z - z))
  return best
}

/** Plants rustle when someone walks by. */
export function Plant({ position, scale = 1, kind = 0, still = false }) {
  const leaves = useRef()
  const amp = useRef(0)
  useFrame(({ clock }, dt) => {
    if (!leaves.current) return
    // checking every bot's distance is the costly part: do it ~6x per second, not every frame
    if ((leaves.k = (leaves.k || 0) + 1) % 10 === 0) leaves.near = nearestBot(position[0], position[2]) < 1.3 ? 1 : 0
    amp.current += ((leaves.near || 0) - amp.current) * Math.min(1, dt * 2)
    if (amp.current < 0.01 && leaves.k % 3) return
    const t = clock.elapsedTime
    leaves.current.rotation.z = Math.sin(t * 7) * 0.07 * amp.current + Math.sin(t * 0.8 + position[0]) * 0.012
    leaves.current.rotation.x = Math.cos(t * 6) * 0.05 * amp.current
  })
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.22, 0]} material={M.pot} receiveShadow>
        <cylinderGeometry args={[0.24, 0.19, 0.44, 24]} />
      </mesh>
      {kind === 0 ? (
        <group userData={{ dynamic: !still }} ref={still ? undefined : leaves} position={[0, 0.44, 0]}>
          <mesh position={[0, 0.35, 0]} material={M.leaf} scale={[1, 1.15, 1]}>
            <sphereGeometry args={[0.38, 18, 12]} />
          </mesh>
          <mesh position={[0.05, 0.75, 0.02]} material={M.leaf}>
            <sphereGeometry args={[0.28, 16, 12]} />
          </mesh>
          <mesh position={[-0.02, 1.02, 0]} material={M.leaf2}>
            <sphereGeometry args={[0.18, 12, 10]} />
          </mesh>
        </group>
      ) : (
        // upright sword-like leaves growing out of the soil (no floating blobs)
        <group userData={{ dynamic: !still }} ref={still ? undefined : leaves} position={[0, 0.43, 0]}>
          {LEAVES.map((l, i) => (
            <group key={i} rotation={[l.tx, l.ry, l.tz]}>
              <mesh position={[0, l.h / 2, 0]} material={i % 3 ? M.leaf : M.leaf2} scale={[l.w, l.h, 0.05]}>
                <sphereGeometry args={[0.5, 10, 8]} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      <mesh position={[0, 0.447, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.soil}>
        <circleGeometry args={[0.215, 24]} />
      </mesh>
    </group>
  )
}

const LEAVES = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2
  const out = i % 3 === 0 ? 0.08 : 0.26
  return { ry: a, tx: 0, tz: out, h: 0.75 + ((i * 37) % 5) * 0.09, w: 0.13 + (i % 2) * 0.03 }
})

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
  const last = useRef(0)
  useFrame(({ clock }) => {
    if ((performance.now() / 1000) - last.current < 1) return
    last.current = (performance.now() / 1000)
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
      <group userData={{ dynamic: true }} ref={h} position={[0, 0, 0.04]}>
        <mesh position={[0, 0.1, 0]} material={M.black}>
          <boxGeometry args={[0.03, 0.2, 0.01]} />
        </mesh>
      </group>
      <group userData={{ dynamic: true }} ref={m} position={[0, 0, 0.045]}>
        <mesh position={[0, 0.14, 0]} material={M.black}>
          <boxGeometry args={[0.02, 0.28, 0.01]} />
        </mesh>
      </group>
    </group>
  )
}

const steamGeo = new THREE.SphereGeometry(0.06, 10, 8)
/** Coffee machine puffs steam while someone is getting a coffee. */
export function CoffeeCorner({ position }) {
  const puffs = useRef([])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }), [])
  const on = useRef(0)
  useFrame(({ clock }, dt) => {
    const near = nearestBot(position[0], position[2] + 0.73) < 1.0 ? 1 : 0
    on.current += (near - on.current) * Math.min(1, dt * 2)
    const t = clock.elapsedTime
    mat.opacity = 0.55 * on.current
    puffs.current.forEach((m, i) => {
      if (!m) return
      const k = (t * 0.6 + i / 3) % 1
      m.position.set(0.5 + Math.sin(k * 6 + i) * 0.05, 1.7 + k * 0.6, 0.05)
      m.scale.setScalar(0.6 + k * 1.4)
      m.visible = on.current > 0.02
    })
  })
  return (
    <group position={position}>
      {[0, 1, 2].map((i) => (
        <mesh userData={{ dynamic: true }} key={'s' + i} ref={(m) => (puffs.current[i] = m)} geometry={steamGeo} material={mat} visible={false} />
      ))}
      <RoundedBox args={[2.2, 0.08, 0.5]} radius={0.02} position={[0, 1.05, 0]} material={M.white} receiveShadow />
      <RoundedBox args={[2.2, 0.9, 0.5]} radius={0.02} position={[0, 0.45, 0]} material={M.white} receiveShadow />
      <RoundedBox args={[0.45, 0.55, 0.38]} radius={0.04} position={[0.5, 1.37, 0]} material={M.black} />
      <mesh position={[0.5, 1.5, 0.2]}>
        <circleGeometry args={[0.03, 12]} />
        <meshBasicMaterial color="#5cff9b" />
      </mesh>
      {['#FD690F', '#1E86FC', '#ffffff'].map((c, i) => (
        <mesh key={i} position={[-0.6 + i * 0.18, 1.15, 0.05]}>
          <cylinderGeometry args={[0.05, 0.045, 0.12, 14]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
    </group>
  )
}

export function TVScreen({ position, rotation, getInfo }) {
  const tv = useMemo(() => createTVCanvas(), [])
  const acc = useRef(10)
  const info = useRef(null)
  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current > 2) {
      acc.current = 0
      const i = getInfo()
      const sig = JSON.stringify(i)
      info.current = i
      if (sig !== tv.sig) (tv.sig = sig, drawTVNow(tv, i))
    }
  })
  const tip = () => {
    const i = info.current || getInfo()
    showTip({
      title: 'Agora no andar',
      sub: `${i.working} trabalhando · ${i.waiting} esperando você · ${i.errors} com erro`,
      lines: i.last.map((l) => ({ a: l.bot, b: `${l.step || 'Concluído'} · ${l.ago}` })),
      empty: 'Nada concluído hoje ainda',
      accent: '#34d399',
      wide: true,
    })
  }
  return (
    <group position={position} rotation={rotation} onPointerOver={(e) => (e.stopPropagation(), tip())} onPointerOut={hideTip}>
      <RoundedBox args={[2.3, 1.36, 0.08]} radius={0.03} material={M.black} raycast={() => null} />
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
        <mesh key={s} position={[0, 0.04 + s * 0.48, 0]} material={M.white} receiveShadow>
          <boxGeometry args={[width, 0.04, 0.36]} />
        </mesh>
      ))}
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[(sd * width) / 2, H / 2, 0]} material={M.white}>
          <boxGeometry args={[0.04, H, 0.36]} />
        </mesh>
      ))}
      <instancedMesh userData={{ dynamic: true }} ref={ref} args={[undefined, undefined, books.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
    </group>
  )
}

export function WaterCooler({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[0.42, 1.0, 0.42]} radius={0.05} position={[0, 0.5, 0]} material={M.white} receiveShadow />
      <mesh position={[0, 1.25, 0]} material={M.water}>
        <cylinderGeometry args={[0.17, 0.17, 0.5, 20]} />
      </mesh>
      <mesh position={[0.22, 0.72, 0]} material={M.dark}>
        <boxGeometry args={[0.04, 0.06, 0.08]} />
      </mesh>
    </group>
  )
}

function Cushion({ x, k }) {
  const ref = useRef()
  useFrame((_, dt) => {
    if (!ref.current) return
    const want = sitting.has(k) ? 0.45 : 1
    ref.current.scale.y += (want - ref.current.scale.y) * Math.min(1, dt * 8)
    ref.current.position.y = 0.47 + 0.07 * ref.current.scale.y
  })
  return (
    <RoundedBox userData={{ dynamic: true }} ref={ref} args={[1.0, 0.14, 0.62]} radius={0.06} smoothness={2} position={[x, 0.54, 0.08]} receiveShadow>
      <meshStandardMaterial color="#dfe1e5" roughness={0.95} />
    </RoundedBox>
  )
}

export function Lounge({ position, night, seats = [] }) {
  const rug = useMemo(() => makeRugTexture('#e8e3dc'), [])
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <planeGeometry args={[3.6, 2.8]} />
        <meshStandardMaterial map={rug} roughness={0.95} />
      </mesh>
      {/* sofa */}
      <group position={[0.2, 0, -0.9]}>
        <RoundedBox args={[2.4, 0.34, 0.9]} radius={0.12} position={[0, 0.3, 0]} receiveShadow castShadow>
          <meshStandardMaterial color="#d6d8dd" roughness={0.9} />
        </RoundedBox>
        <RoundedBox args={[2.4, 0.6, 0.25]} radius={0.1} position={[0, 0.6, -0.36]}>
          <meshStandardMaterial color="#d6d8dd" roughness={0.9} />
        </RoundedBox>
        {/* plump back cushions and little wooden legs */}
        {[-0.5, 0.5].map((bx) => (
          <RoundedBox key={'bc' + bx} args={[0.92, 0.42, 0.16]} radius={0.08} smoothness={3} position={[bx, 0.68, -0.2]} rotation={[-0.15, 0, 0]}>
            <meshStandardMaterial color="#e2e4e8" roughness={0.95} />
          </RoundedBox>
        ))}
        {[[-1.1, -0.36], [1.1, -0.36], [-1.1, 0.36], [1.1, 0.36]].map(([lx, lz]) => (
          <mesh key={'lg' + lx + lz} position={[lx, 0.05, lz]} material={sharedMat('#8a6446', 0.5)}><cylinderGeometry args={[0.03, 0.02, 0.1, 8]} /></mesh>
        ))}
        {[-1.1, 1.1].map((x) => (
          <RoundedBox key={x} args={[0.24, 0.5, 0.9]} radius={0.1} position={[x, 0.42, 0]}>
            <meshStandardMaterial color="#cfd1d6" roughness={0.9} />
          </RoundedBox>
        ))}
        {seats.map((q) => (
          <Cushion key={poiKey(q)} x={q.x - position[0] - 0.2} k={poiKey(q)} />
        ))}
        <RoundedBox args={[0.32, 0.28, 0.13]} radius={0.06} position={[-0.86, 0.66, -0.14]} rotation={[0.2, 0.3, 0]}>
          <meshStandardMaterial color="#F5B70A" roughness={0.9} />
        </RoundedBox>
      </group>
      {/* coffee table */}
      <RoundedBox args={[1.1, 0.06, 0.6]} radius={0.02} position={[0.2, 0.36, 0.25]} material={M.white} receiveShadow />
      {[[-0.3, -0.18], [0.7, -0.18], [-0.3, 0.68], [0.7, 0.68]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.17, z - 0.02]} material={M.metal}>
          <cylinderGeometry args={[0.018, 0.018, 0.34, 8]} />
        </mesh>
      ))}
      <RoundedBox args={[0.3, 0.04, 0.22]} radius={0.01} position={[0.35, 0.41, 0.25]} material={M.dark} />
      {/* poufs */}
      {[[-0.9, 0.9], [-0.15, 1.15]].map(([x, z], i) => (
        <RoundedBox key={i} args={[0.6, 0.38, 0.6]} radius={0.14} position={[x, 0.19, z]} material={M.black} receiveShadow />
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
          <meshStandardMaterial color="#fff6e0" emissive="#ffe2b0" emissiveIntensity={night ? 1.6 : 0.1} side={THREE.DoubleSide} />
        </mesh>
        {night && <mesh geometry={beamGeo(1.6)} material={beamMat} renderOrder={4} />}
        {night && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={lampPoolMat} renderOrder={2}>
            <planeGeometry args={[3.6, 3.6]} />
          </mesh>
        )}
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
      <mesh position={[0, 1.0, D / 2 - 0.08]} material={M.white}>
        <boxGeometry args={[W, 0.05, 0.06]} />
      </mesh>
      <mesh position={[W / 2 - 0.08, 1.0, 0]} material={M.white}>
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
      <mesh position={[0.02, 1.15, 0]} material={M.metal}>
        <boxGeometry args={[0.08, 2.4, 1.5]} />
      </mesh>
      <mesh position={[0.05, 1.08, 0]}>
        <boxGeometry args={[0.02, 2.15, 1.22]} />
        <meshStandardMaterial color={night ? '#ffe6b0' : '#2a2d33'} emissive={night ? '#ffcf8a' : '#000'} emissiveIntensity={night ? 0.6 : 0} />
      </mesh>
      <group position={[0.09, 1.08, 0]}>
        <mesh userData={{ dynamic: true }} ref={left} position={[0, 0, -0.3]} material={M.metal}>
          <boxGeometry args={[0.03, 2.15, 0.6]} />
        </mesh>
        <mesh userData={{ dynamic: true }} ref={right} position={[0, 0, 0.3]} material={M.metal}>
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

// ---------------------------------------------------------------- decor for bigger rooms

export function Rug({ x, z, w, d, color = '#ece7f6', round = false }) {
  return (
    // a real height above the floor instead of a depth offset: the offset made rugs draw over
    // low things standing on them (chair bases, legs) at grazing camera angles
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, round ? 0.022 : 0.016, z]} receiveShadow scale={round ? [w / 2, d / 2, 1] : [1, 1, 1]}>
      {round ? <circleGeometry args={[1, 48]} /> : <planeGeometry args={[w, d]} />}
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  )
}

export function BeanBag({ x, z, c }) {
  return (
    <mesh position={[x, 0.24, z]} scale={[0.55, 0.3, 0.55]} receiveShadow>
      <sphereGeometry args={[1, 24, 16]} />
      <meshStandardMaterial color={c} roughness={0.85} />
    </mesh>
  )
}

export function MeetingTable({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.72, 0]} material={M.desk} castShadow receiveShadow>
        <cylinderGeometry args={[0.85, 0.85, 0.05, 40]} />
      </mesh>
      <mesh position={[0, 0.36, 0]} material={M.metal}>
        <cylinderGeometry args={[0.06, 0.25, 0.72, 16]} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 + 0.3
        return (
          <mesh key={i} position={[Math.cos(a) * 1.25, 0.24, Math.sin(a) * 1.25]} material={M.black} castShadow>
            <cylinderGeometry args={[0.2, 0.18, 0.46, 16]} />
          </mesh>
        )
      })}
      <mesh position={[0.2, 0.76, 0.1]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[0.32, 0.02, 0.22]} />
        <meshStandardMaterial color="#2b2d33" />
      </mesh>
    </group>
  )
}

/** Free-standing whiteboard with doodles. */
export function Whiteboard({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.35, 0]} material={M.white}>
        <boxGeometry args={[1.8, 1.05, 0.05]} />
      </mesh>
      {[[-0.5, 1.5, '#1E86FC', 0.5], [0.2, 1.62, '#E5484D', 0.6], [0.35, 1.2, '#2FB36B', 0.4], [-0.3, 1.15, '#8F59F9', 0.45]].map(([px, py, c, w], i) => (
        <mesh key={i} position={[px, py, 0.03]}>
          <planeGeometry args={[w, 0.04]} />
          <meshBasicMaterial color={c} />
        </mesh>
      ))}
      {[-0.8, 0.8].map((px) => (
        <mesh key={px} position={[px, 0.42, 0]} material={M.metal}>
          <cylinderGeometry args={[0.02, 0.02, 0.84, 8]} />
        </mesh>
      ))}
    </group>
  )
}

/** A canvas board on a wall (pending requests, achievements). `lines` drives redraws. */
export function InfoBoard({ position, rotation, title, lines, accent, cork, empty, w = 1.7, h = 1.25 }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 940
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return { c, g: c.getContext('2d'), t }
  }, [])
  const sig = JSON.stringify(lines) + title
  useEffect(() => {
    drawBoard(tex.g, tex.c, { title, lines, accent, cork, empty })
    tex.t.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, tex])
  useEffect(() => () => tex.t.dispose(), [tex])
  return (
    <group
      position={position}
      rotation={rotation}
      onPointerOver={(e) => (e.stopPropagation(), showTip({ title, lines, empty, accent, wide: true }))}
      onPointerOut={hideTip}
    >
      <mesh position={[0, 0, -0.02]} material={cork ? M.dark : M.white}>
        <boxGeometry args={[w + 0.08, h + 0.08, 0.04]} />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex.t} roughness={0.9} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </group>
  )
}

/** Small "door sign" light next to the room title: green / amber / red / grey. */
export function StatusLamp({ position, color }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (ref.current) ref.current.emissiveIntensity = 1.2 + Math.sin(clock.elapsedTime * 3) * 0.4
  })
  return (
    <group position={position}>
      <mesh material={M.dark}>
        <boxGeometry args={[0.34, 0.34, 0.06]} />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <circleGeometry args={[0.11, 24]} />
        <meshStandardMaterial ref={ref} color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
    </group>
  )
}

const DECOR_ITEMS = ['plant', 'lamp', 'cactus', 'books']
/** Personal desk items: from looks.desk, or a stable pick from the bot's name. */
const starGeo = (() => {
  const sh = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.018 : 0.04, a = (i / 10) * Math.PI * 2 + Math.PI / 2
    i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  return new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: false })
})()
const starMat = new THREE.MeshStandardMaterial({ color: '#f5b70a', metalness: 0.5, roughness: 0.3, emissive: '#f5b70a', emissiveIntensity: 0.15 })

const plates = new Map()
const PLATE_H = 0.055
/**
 * Engraved name plate texture + world width (cached per name).
 * Width follows the text (no clip). Plane aspect always matches the canvas so
 * short names like "Lima_" stay proportional — never horizontally stretched.
 */
function namePlate(name) {
  if (plates.has(name)) return plates.get(name)
  const label = String(name || '')
  const c = document.createElement('canvas')
  const g = c.getContext('2d')
  const font = '700 28px -apple-system, Segoe UI, Roboto, sans-serif'
  g.font = font
  const tw = Math.ceil(g.measureText(label).width)
  const pad = 28
  // canvas wide enough for the glyphs; plane width = height * (cw/ch) keeps 1:1 pixels
  c.width = Math.max(1, tw + pad * 2)
  c.height = 44
  g.font = font
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#e8eaee'
  g.fillText(label, c.width / 2, 23)
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  const w = Math.min(1.05, PLATE_H * (c.width / c.height))
  const out = { map, w }
  plates.set(name, out)
  return out
}

export const DeskDecor = memo(function DeskDecor({ seat, items, name, trophies = 0, color = '#8F59F9', vip = false }) {
  let list = items
  if (!list || !list.length) {
    let h = 0
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    list = [DECOR_ITEMS[h % DECOR_ITEMS.length]]
  }
  const plate = namePlate(name)
  const pw = plate.w
  return (
    <group position={[seat.x - 0.55, 0.75, seat.z + 0.95]}>
      {/* name plaque on the visitor edge of the desk (far from the chair), facing the room — not in front of the keyboard */}
      <group position={[0.55, 0, 0.3]}>
        <mesh position={[0, 0.035, 0]} rotation={[-0.4, 0, 0]} material={vip ? sharedMat('#d4a72c', 0.3, 0.7) : M.dark}>
          <boxGeometry args={[pw + 0.02, 0.07, 0.02]} />
        </mesh>
        <mesh position={[0, 0.036, 0.012]} rotation={[-0.4, 0, 0]}>
          <planeGeometry args={[pw, PLATE_H]} />
          <meshBasicMaterial map={plate.map} transparent toneMapped={false} />
        </mesh>
      </group>
      {list.slice(0, 2).map((it, i) => (
        <group key={i} position={[i * -0.0, 0, i * -0.32]}>
          {it === 'plant' && (
            <group>
              <mesh position={[0, 0.05, 0]} material={M.pot}><cylinderGeometry args={[0.06, 0.05, 0.1, 12]} /></mesh>
              <mesh position={[0, 0.16, 0]} material={M.leaf}><sphereGeometry args={[0.09, 12, 10]} /></mesh>
            </group>
          )}
          {it === 'cactus' && (
            <group>
              <mesh position={[0, 0.04, 0]} material={sharedMat('#e07a4f')}><cylinderGeometry args={[0.055, 0.05, 0.08, 12]} /></mesh>
              <mesh position={[0, 0.15, 0]} material={M.leaf2}><capsuleGeometry args={[0.035, 0.1, 4, 8]} /></mesh>
            </group>
          )}
          {it === 'photo' && (
            <group rotation={[0, Math.PI + 0.3, 0]}>
              <mesh position={[0, 0.08, 0]} material={M.dark}><boxGeometry args={[0.14, 0.17, 0.02]} /></mesh>
              <mesh position={[0, 0.08, -0.011]} rotation={[0, Math.PI, 0]}><planeGeometry args={[0.11, 0.13]} /><meshBasicMaterial color="#8ec5ff" /></mesh>
            </group>
          )}
          {it === 'trophy' && (
            <group>
              <mesh position={[0, 0.02, 0]} material={M.dark}><boxGeometry args={[0.08, 0.04, 0.08]} /></mesh>
              <mesh position={[0, 0.11, 0]} material={sharedMat('#f5b70a', 0.3, 0.6)}><cylinderGeometry args={[0.06, 0.02, 0.12, 14]} /></mesh>
            </group>
          )}
          {it === 'lamp' && (
            <group>
              <mesh position={[0, 0.12, 0]} material={M.dark}><cylinderGeometry args={[0.01, 0.01, 0.24, 6]} /></mesh>
              <mesh position={[0, 0.25, 0.03]} rotation={[0.6, 0, 0]}><coneGeometry args={[0.06, 0.08, 14, 1, true]} /><meshStandardMaterial color="#ffe9b0" emissive="#ffd28a" emissiveIntensity={0.6} side={THREE.DoubleSide} /></mesh>
            </group>
          )}
          {it === 'books' && (
            <group>
              {['#E5484D', '#1E86FC', '#2FB36B'].map((c, j) => (
                <mesh key={j} position={[0, 0.02 + j * 0.035, 0]} rotation={[0, j * 0.2, 0]}><boxGeometry args={[0.16, 0.03, 0.11]} /><meshStandardMaterial color={c} /></mesh>
              ))}
            </group>
          )}
        </group>
      ))}
    </group>
  )
})

/** Birthday: cake with a candle on the desk. */
export function Cake({ seat }) {
  const flame = useRef()
  useFrame(({ clock }) => {
    if (flame.current) flame.current.scale.y = 1 + Math.sin(clock.elapsedTime * 20) * 0.2
  })
  return (
    <group position={[seat.x + 0.35, 0.75, seat.z + 0.5]}>
      <mesh position={[0, 0.06, 0]}><cylinderGeometry args={[0.12, 0.12, 0.12, 24]} /><meshStandardMaterial color="#ffd6e7" /></mesh>
      <mesh position={[0, 0.125, 0]}><cylinderGeometry args={[0.122, 0.122, 0.02, 24]} /><meshStandardMaterial color="#ffffff" /></mesh>
      <mesh position={[0, 0.17, 0]}><cylinderGeometry args={[0.008, 0.008, 0.07, 6]} /><meshStandardMaterial color="#1E86FC" /></mesh>
      <mesh userData={{ dynamic: true }} ref={flame} position={[0, 0.215, 0]}><sphereGeometry args={[0.014, 8, 6]} /><meshBasicMaterial color="#ffb020" /></mesh>
    </group>
  )
}

/** Glass elevator inside the room's back-left corner; doors slide when a bot is near. */
export function GlassElevator({ layout, night, floorY = null }) {
  const { W } = layout
  const z = layout.elevator.z
  const left = useRef(), right = useRef()
  const open = useRef(0)
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#e3f0fb', transparent: true, opacity: 0.32, roughness: 0.08, depthWrite: false }), [])
  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fbfbfc', roughness: 0.35 }), [])
  useFrame((_, dt) => {
    let near = false
    for (const p of botPositions.values()) if ((floorY == null || Math.abs(p.y - floorY - 0.8) < 1.5) && Math.hypot(p.x - (layout.elevator.x + 0.6), p.z - z) < 1.3) near = true
    open.current += ((near ? 1 : 0) - open.current) * Math.min(1, dt * 5)
    const o = open.current * 0.4
    if (left.current) left.current.position.z = -0.27 - o
    if (right.current) right.current.position.z = 0.27 + o
  })
  // soft, rounded cabin standing clear of the wall (no surfaces touching the wall = no flicker)
  const x = -W / 2 + 0.95
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[1.2, 0.08, 1.5]} radius={0.04} smoothness={3} position={[0, 0.04, 0]} material={frame} receiveShadow />
      <RoundedBox args={[1.24, 0.16, 1.54]} radius={0.07} smoothness={3} position={[0, 2.82, 0]} material={frame} />
      {[[-0.55, -0.7], [0.55, -0.7], [-0.55, 0.7], [0.55, 0.7]].map(([px, pz], i) => (
        <mesh key={i} position={[px, 1.43, pz]} material={frame}>
          <cylinderGeometry args={[0.05, 0.05, 2.7, 16]} />
        </mesh>
      ))}
      <mesh position={[0, 1.43, -0.7]} material={glass}><boxGeometry args={[1.0, 2.7, 0.02]} /></mesh>
      <mesh position={[0, 1.43, 0.7]} material={glass}><boxGeometry args={[1.0, 2.7, 0.02]} /></mesh>
      <mesh position={[-0.55, 1.43, 0]} material={glass}><boxGeometry args={[0.02, 2.7, 1.3]} /></mesh>
      <group position={[0.56, 1.15, 0]}>
        <mesh userData={{ dynamic: true }} ref={left} position={[0, 0, -0.27]} material={glass}><boxGeometry args={[0.02, 2.2, 0.54]} /></mesh>
        <mesh userData={{ dynamic: true }} ref={right} position={[0, 0, 0.27]} material={glass}><boxGeometry args={[0.02, 2.2, 0.54]} /></mesh>
      </group>
      <mesh position={[0.63, 2.55, 0]}>
        <boxGeometry args={[0.03, 0.12, 0.36]} />
        <meshStandardMaterial color="#1c1f26" emissive="#5cc8ff" emissiveIntensity={night ? 1.4 : 0.8} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------- more furniture

/** Snack & soda machine: rounded red body, lit glass front with shelves of cans and snacks,
 *  a logo band, a keypad with coin slot and the pickup tray at the bottom. */
const VEND = ['#E5484D', '#F5B70A', '#1E86FC', '#2FB36B', '#F93498', '#FD690F', '#8F59F9', '#ffffff']
export function Vending({ x, z }) {
  const body = sharedMat('#d93c42', 0.42)
  const trim = sharedMat('#b02a31', 0.5)
  const dark = sharedMat('#1d2129', 0.6)
  const metal = sharedMat('#c9ced6', 0.3, 0.6)
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI / 2, 0]}>
      <RoundedBox args={[0.84, 1.8, 0.62]} radius={0.06} smoothness={3} position={[0, 0.9, 0]} material={body} castShadow receiveShadow />
      {/* logo band on top */}
      <RoundedBox args={[0.78, 0.2, 0.04]} radius={0.02} smoothness={2} position={[0, 1.66, 0.3]} material={trim} />
      <mesh position={[-0.12, 1.66, 0.325]}><boxGeometry args={[0.36, 0.08, 0.005]} /><meshStandardMaterial color="#fff6e8" emissive="#fff1d6" emissiveIntensity={0.6} /></mesh>
      {/* lit window with three shelves of goods */}
      <mesh position={[-0.08, 1.02, 0.306]}><boxGeometry args={[0.54, 1.12, 0.01]} /><meshStandardMaterial color="#20262f" emissive="#a9d8ff" emissiveIntensity={0.18} /></mesh>
      {[0.62, 0.92, 1.22, 1.5].map((y) => (
        <mesh key={'s' + y} position={[-0.08, y - 0.1, 0.29]} material={metal}><boxGeometry args={[0.52, 0.015, 0.06]} /></mesh>
      ))}
      {Array.from({ length: 12 }, (_, i) => {
        const col = i % 4, row = Math.floor(i / 4)
        const can = row !== 1
        return (
          <mesh key={i} position={[-0.27 + col * 0.125, 0.6 + row * 0.3, 0.27]} material={sharedMat(VEND[(i * 3 + row) % VEND.length], 0.35, can ? 0.4 : 0)}>
            {can ? <cylinderGeometry args={[0.035, 0.035, 0.12, 12]} /> : <boxGeometry args={[0.1, 0.13, 0.03]} />}
          </mesh>
        )
      })}
      {/* glass over the window */}
      <mesh position={[-0.08, 1.02, 0.315]}><boxGeometry args={[0.56, 1.14, 0.01]} /><meshStandardMaterial color="#dff1ff" transparent opacity={0.16} roughness={0.05} metalness={0.2} /></mesh>
      {/* keypad panel, coin slot, little display */}
      <RoundedBox args={[0.17, 0.62, 0.03]} radius={0.015} smoothness={2} position={[0.3, 1.18, 0.31]} material={dark} />
      <mesh position={[0.3, 1.42, 0.327]}><boxGeometry args={[0.12, 0.05, 0.004]} /><meshStandardMaterial color="#0f2a1c" emissive="#3dff9a" emissiveIntensity={0.7} /></mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={'k' + i} position={[0.265 + (i % 3) * 0.035, 1.32 - Math.floor(i / 3) * 0.04, 0.328]} material={metal}><boxGeometry args={[0.025, 0.025, 0.006]} /></mesh>
      ))}
      <mesh position={[0.3, 1.0, 0.328]} material={metal}><boxGeometry args={[0.06, 0.012, 0.006]} /></mesh>
      {/* pickup tray */}
      <RoundedBox args={[0.56, 0.16, 0.05]} radius={0.02} smoothness={2} position={[-0.08, 0.3, 0.3]} material={dark} />
      <mesh position={[-0.08, 0.32, 0.33]} material={trim}><boxGeometry args={[0.5, 0.03, 0.01]} /></mesh>
      {/* feet */}
      {[-0.34, 0.34].map((fx) => (
        <mesh key={fx} position={[fx, 0.02, 0]} material={dark}><boxGeometry args={[0.1, 0.04, 0.5]} /></mesh>
      ))}
    </group>
  )
}

/** Office printer on a small cabinet; paper slides out when someone is waiting at it. */
export function Printer({ x, z }) {
  const paper = useRef()
  useFrame(({ clock }) => {
    if (!paper.current) return
    let near = false
    for (const p of botPositions.values()) if (Math.hypot(p.x - x, p.z - (z + 0.9)) < 0.7) near = true
    const k = near ? (clock.elapsedTime * 0.5) % 1 : 0
    paper.current.position.z = 0.15 + k * 0.22
    paper.current.visible = near
  })
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[0.9, 0.62, 0.55]} radius={0.03} smoothness={2} position={[0, 0.31, 0]} material={M.white} receiveShadow />
      <RoundedBox args={[0.72, 0.32, 0.5]} radius={0.05} smoothness={2} position={[0, 0.78, 0]} material={M.grey} />
      <mesh position={[0, 0.95, -0.05]} material={M.dark}>
        <boxGeometry args={[0.6, 0.03, 0.32]} />
      </mesh>
      <mesh position={[0.26, 0.86, 0.26]}>
        <circleGeometry args={[0.025, 12]} />
        <meshBasicMaterial color="#5cff9b" />
      </mesh>
      {/* paper in the back tray, an output tray, control panel with a small screen and keys */}
      <mesh position={[0, 1.02, -0.2]} rotation={[0.4, 0, 0]} material={M.white}><boxGeometry args={[0.32, 0.22, 0.01]} /></mesh>
      <mesh position={[0, 0.66, 0.27]} rotation={[0.08, 0, 0]} material={M.dark}><boxGeometry args={[0.5, 0.015, 0.14]} /></mesh>
      <RoundedBox args={[0.24, 0.05, 0.12]} radius={0.01} smoothness={2} position={[0.2, 0.95, 0.17]} material={M.dark} />
      <mesh position={[0.17, 0.977, 0.17]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.1, 0.06]} /><meshStandardMaterial color="#12324a" emissive="#5cc8ff" emissiveIntensity={0.5} /></mesh>
      {[0.25, 0.29].map((kx) => (
        <mesh key={kx} position={[kx, 0.978, 0.17]} material={M.metal}><boxGeometry args={[0.025, 0.01, 0.025]} /></mesh>
      ))}
      {/* front drawer lines */}
      {[0.18, 0.4].map((dy) => (
        <mesh key={'dr' + dy} position={[0, dy, 0.278]} material={M.grey}><boxGeometry args={[0.8, 0.01, 0.005]} /></mesh>
      ))}
      <mesh userData={{ dynamic: true }} ref={paper} position={[0, 0.72, 0.15]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[0.3, 0.4]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  )
}

/** Arcade cabinet with an animated screen. */
export function Arcade({ x, z }) {
  const scr = useRef()
  useFrame(({ clock }) => {
    if (scr.current) scr.current.emissive.setHSL((clock.elapsedTime * 0.15) % 1, 0.7, 0.45)
  })
  return (
    <group position={[x, 0, z]} rotation={[0, -Math.PI / 2, 0]}>
      <RoundedBox args={[0.75, 1.7, 0.7]} radius={0.05} smoothness={2} position={[0, 0.85, 0]} receiveShadow>
        <meshStandardMaterial color="#8F59F9" roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 1.25, 0.355]} rotation={[-0.15, 0, 0]}>
        <planeGeometry args={[0.55, 0.42]} />
        <meshStandardMaterial ref={scr} color="#111" emissive="#5cc8ff" emissiveIntensity={0.9} />
      </mesh>
      <RoundedBox args={[0.7, 0.08, 0.3]} radius={0.02} smoothness={2} position={[0, 0.92, 0.45]} material={M.dark} />
      <mesh position={[-0.15, 0.99, 0.45]}><cylinderGeometry args={[0.02, 0.02, 0.1, 8]} /><meshStandardMaterial color="#E5484D" /></mesh>
      {[0.05, 0.17].map((bx) => (
        <mesh key={bx} position={[bx, 0.965, 0.47]}><cylinderGeometry args={[0.03, 0.03, 0.02, 12]} /><meshStandardMaterial color="#F5B70A" /></mesh>
      ))}
      <mesh position={[0, 1.62, 0.36]}>
        <planeGeometry args={[0.6, 0.14]} />
        <meshStandardMaterial color="#111" emissive="#F93498" emissiveIntensity={1.1} />
      </mesh>
      {/* screen bezel, joystick knob, more buttons, coin door, side stripes */}
      <mesh position={[0, 1.25, 0.352]} rotation={[-0.15, 0, 0]} material={M.dark}><boxGeometry args={[0.63, 0.5, 0.01]} /></mesh>
      <mesh position={[-0.15, 1.05, 0.45]}><sphereGeometry args={[0.035, 10, 8]} /><meshStandardMaterial color="#E5484D" roughness={0.3} /></mesh>
      {[[0.05, 0.42, '#1E86FC'], [0.17, 0.42, '#2FB36B']].map(([bx, bz, c]) => (
        <mesh key={'b2' + bx} position={[bx, 0.965, bz]}><cylinderGeometry args={[0.03, 0.03, 0.02, 12]} /><meshStandardMaterial color={c} /></mesh>
      ))}
      <RoundedBox args={[0.3, 0.32, 0.02]} radius={0.01} smoothness={2} position={[0, 0.45, 0.355]} material={M.dark} />
      {[-0.06, 0.06].map((cx) => (
        <mesh key={'cn' + cx} position={[cx, 0.5, 0.367]}><boxGeometry args={[0.05, 0.08, 0.005]} /><meshStandardMaterial color="#F5B70A" emissive="#F5B70A" emissiveIntensity={0.4} /></mesh>
      ))}
      {[-0.379, 0.379].map((sx) => (
        <mesh key={'st' + sx} position={[sx, 0.9, 0.05]}><boxGeometry args={[0.005, 1.2, 0.5]} /><meshStandardMaterial color="#F93498" /></mesh>
      ))}
    </group>
  )
}

/** Soft armchair facing the windows. */
export function Armchair({ x, z, c = '#c9d4e3' }) {
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[0.95, 0.4, 0.85]} radius={0.14} smoothness={3} position={[0, 0.3, 0]} receiveShadow>
        <meshStandardMaterial color={c} roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[0.95, 0.6, 0.22]} radius={0.1} smoothness={3} position={[0, 0.62, -0.34]}>
        <meshStandardMaterial color={c} roughness={0.9} />
      </RoundedBox>
      {[-0.42, 0.42].map((ax) => (
        <RoundedBox key={ax} args={[0.16, 0.42, 0.8]} radius={0.07} smoothness={2} position={[ax, 0.5, 0]}>
          <meshStandardMaterial color={c} roughness={0.9} />
        </RoundedBox>
      ))}
    </group>
  )
}

export function FloorLamp({ x, z, night }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]} material={M.dark}><cylinderGeometry args={[0.16, 0.18, 0.04, 18]} /></mesh>
      <mesh position={[0, 0.8, 0]} material={M.dark}><cylinderGeometry args={[0.014, 0.014, 1.6, 8]} /></mesh>
      <mesh position={[0, 1.62, 0]}>
        <cylinderGeometry args={[0.16, 0.22, 0.26, 20, 1, true]} />
        <meshStandardMaterial color="#fff6e0" emissive="#ffe2b0" emissiveIntensity={night ? 1.6 : 0.15} side={THREE.DoubleSide} />
      </mesh>
      {/* glow around the lit shade (a soft halo sprite: the bloom look, for the cost of one quad) */}
      {night && <mesh geometry={beamGeo(1.5)} material={beamMat} position={[0, 0, 0]} renderOrder={4} />}
      {/* at night the lamp lights its surroundings: a warm pool on the floor (no real light: free) */}
      {night && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={lampPoolMat} renderOrder={2}>
          <planeGeometry args={[4.2, 4.2]} />
        </mesh>
      )}
    </group>
  )
}
let _poolTex = null
function poolTexture() {
  if (_poolTex) return _poolTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,214,150,1)')
  r.addColorStop(0.35, 'rgba(255,200,130,0.55)')
  r.addColorStop(1, 'rgba(255,190,120,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  _poolTex = new THREE.CanvasTexture(c)
  return _poolTex
}
let _haloTex = null
function haloTexture() {
  if (_haloTex) return _haloTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,235,200,1)')
  r.addColorStop(0.25, 'rgba(255,215,160,0.55)')
  r.addColorStop(1, 'rgba(255,200,140,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  _haloTex = new THREE.CanvasTexture(c)
  return _haloTex
}
export const haloMat = new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
// the lamp's light as a soft cone from the shade down to the floor: brighter near the shade,
// fading toward the floor and at the edges (vertex colours, additive: one cheap mesh)
const beamGeos = new Map()
function beamGeo(top) {
  if (beamGeos.has(top)) return beamGeos.get(top)
  const g = new THREE.CylinderGeometry(0.16, 0.95, top, 28, 6, true)
  g.translate(0, top / 2, 0)
  const pos = g.attributes.position, n = pos.count
  const col = new Float32Array(n * 3)
  const warm = new THREE.Color('#ffd9a8')
  for (let i = 0; i < n; i++) {
    const k = Math.pow(pos.getY(i) / top, 1.3) // 1 at the shade, 0 at the floor
    col[i * 3] = warm.r * k
    col[i * 3 + 1] = warm.g * k
    col[i * 3 + 2] = warm.b * k
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  beamGeos.set(top, g)
  return g
}
const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })

export function setLampStrength(k) {
  beamMat.opacity = 0.22 * Math.min(1.4, k)
  lampPoolMat.opacity = 0.15 * k
  haloMat.opacity = 0.45 * Math.min(1.3, k)
}
const lampPoolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })

/** Aquarium on a low cabinet: fish swim around, bubbles rise. */
export function Aquarium({ x, z }) {
  const fish = useRef([])
  const bub = useRef([])
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    fish.current.forEach((f, i) => {
      if (!f) return
      const a = t * (0.4 + i * 0.13) + i * 2
      f.position.set(Math.sin(a) * 0.45, 0.95 + i * 0.09 + Math.sin(a * 2) * 0.03, Math.cos(a * 0.7) * 0.12)
      f.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI
    })
    bub.current.forEach((b, i) => {
      if (!b) return
      const k = (t * 0.35 + i / 4) % 1
      b.position.set(0.35 - i * 0.06, 0.8 + k * 0.5, 0.05)
      b.scale.setScalar(0.6 + k * 0.6)
    })
  })
  const colors = ['#FD690F', '#F5B70A', '#1E86FC', '#F93498']
  return (
    <group position={[x, 0, z]} rotation={[0, -Math.PI / 2, 0]}>
      <RoundedBox args={[1.3, 0.62, 0.5]} radius={0.03} smoothness={2} position={[0, 0.31, 0]} material={M.dark} receiveShadow />
      <mesh position={[0, 0.98, 0]} material={glass}>
        <boxGeometry args={[1.2, 0.68, 0.42]} />
      </mesh>
      <mesh position={[0, 0.96, 0]}>
        <boxGeometry args={[1.16, 0.6, 0.38]} />
        <meshStandardMaterial color="#5cc8ff" transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <boxGeometry args={[1.16, 0.04, 0.38]} />
        <meshStandardMaterial color="#e9d7b5" />
      </mesh>
      {[-0.4, -0.15, 0.3].map((px, i) => (
        <mesh key={i} position={[px, 0.78 + i * 0.03, -0.08]} material={M.leaf2} scale={[0.04, 0.14 + i * 0.03, 0.04]}>
          <sphereGeometry args={[1, 8, 8]} />
        </mesh>
      ))}
      {colors.map((c, i) => (
        <group userData={{ dynamic: true }} key={i} ref={(g) => (fish.current[i] = g)}>
          <mesh scale={[0.06, 0.035, 0.02]}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color={c} />
          </mesh>
          <mesh position={[-0.065, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.025, 0.04, 6]} />
            <meshStandardMaterial color={c} />
          </mesh>
        </group>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh userData={{ dynamic: true }} key={i} ref={(m) => (bub.current[i] = m)}>
          <sphereGeometry args={[0.012, 6, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  )
}

const ART_COLORS = ['#8F59F9', '#1E86FC', '#FD690F', '#E5484D', '#F93498', '#2FB36B', '#F5B70A', '#14B8A6']
const artCache = new Map()
/** Framed abstract poster (generated, deterministic by seed). */
// Framed prints with real content: a landscape (sky, sun, layered hills, trees), an abstract
// composition (layered shapes, lines and dots), or a typographic print. A white mat inside a frame.
const PRINT_WORDS = ['FOCO', 'SHIP IT', 'BORA', 'ITERE', 'CALMA', 'CRIE', 'DEPLOY', 'SIMPLES']
function drawPrint(g, W, H, seed) {
  let r = seed * 7919 + 13
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280)
  const kind = seed % 3
  if (kind === 0) {
    // landscape
    const sky = g.createLinearGradient(0, 0, 0, H)
    const pal = [['#ffd9b0', '#ffb38a', '#f08a6a'], ['#bfe0ff', '#e6f2ff', '#a8d5ff'], ['#ffe3ef', '#ffc6d9', '#d9a7ff']][seed % 3]
    sky.addColorStop(0, pal[0]); sky.addColorStop(0.6, pal[1]); sky.addColorStop(1, pal[2])
    g.fillStyle = sky; g.fillRect(0, 0, W, H)
    g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(W * (0.3 + rnd() * 0.4), H * 0.32, W * 0.11, 0, 7); g.fill()
    const hills = ['#8cc7a1', '#5fa883', '#3f8a6a', '#2f6e57']
    hills.forEach((c, i) => {
      g.fillStyle = c
      g.beginPath()
      g.moveTo(0, H)
      const base = H * (0.5 + i * 0.12)
      for (let x = 0; x <= W; x += 8) g.lineTo(x, base - Math.sin(x / W * Math.PI * (1.2 + i * 0.4) + seed + i) * H * 0.07)
      g.lineTo(W, H); g.fill()
    })
    for (let i = 0; i < 5; i++) {
      const x = rnd() * W, y = H * (0.72 + rnd() * 0.15), s = W * (0.03 + rnd() * 0.03)
      g.fillStyle = '#5b3d2b'; g.fillRect(x - s * 0.12, y, s * 0.24, s * 1.1)
      g.fillStyle = '#2f6e57'; g.beginPath(); g.moveTo(x, y - s * 1.6); g.lineTo(x + s, y + s * 0.2); g.lineTo(x - s, y + s * 0.2); g.fill()
    }
  } else if (kind === 1) {
    // abstract: big soft shapes, thin lines, dots
    g.fillStyle = ['#f6f1ea', '#eef2f7', '#f3eefa', '#fdf3e7'][seed % 4]; g.fillRect(0, 0, W, H)
    for (let i = 0; i < 4; i++) {
      g.globalAlpha = 0.9
      g.fillStyle = ART_COLORS[Math.floor(rnd() * ART_COLORS.length)]
      const x = rnd() * W, y = rnd() * H, s = W * (0.25 + rnd() * 0.35)
      g.beginPath()
      if (i % 2) g.arc(x, y, s / 2, 0, 7)
      else g.ellipse(x, y, s / 2, s / 3, rnd() * 3, 0, 7)
      g.fill()
    }
    g.globalAlpha = 1
    g.strokeStyle = '#1d1f24'; g.lineWidth = 3
    g.beginPath(); g.moveTo(W * 0.1, H * (0.2 + rnd() * 0.6)); g.bezierCurveTo(W * 0.4, H * rnd(), W * 0.6, H * rnd(), W * 0.9, H * (0.2 + rnd() * 0.6)); g.stroke()
    g.fillStyle = '#1d1f24'
    for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(W * (0.65 + (i % 3) * 0.08), H * (0.12 + Math.floor(i / 3) * 0.06), 3, 0, 7); g.fill() }
  } else {
    // typographic print
    const bg = ART_COLORS[seed % ART_COLORS.length]
    g.fillStyle = bg; g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(255,255,255,0.18)'
    for (let i = 0; i < 6; i++) g.fillRect(0, (H / 6) * i, W, H / 12)
    g.fillStyle = '#ffffff'
    g.font = `900 ${Math.round(W * 0.2)}px system-ui, sans-serif`
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(PRINT_WORDS[seed % PRINT_WORDS.length], W / 2, H / 2)
    g.font = `600 ${Math.round(W * 0.05)}px system-ui, sans-serif`
    g.fillText('— escritório de bots —', W / 2, H * 0.62)
  }
}
export function Poster({ position, rotation, seed = 1, w = 0.9, h = 1.2 }) {
  const tex = useMemo(() => {
    const key = `p2|${seed}|${w}|${h}`
    if (artCache.has(key)) return artCache.get(key)
    const c = document.createElement('canvas')
    c.width = 256
    c.height = Math.round((256 * h) / w)
    const g = c.getContext('2d')
    drawPrint(g, c.width, c.height, seed)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    artCache.set(key, t)
    return t
  }, [seed, w, h])
  const frame = sharedMat(['#3a2a20', '#c9a27c', '#22252b', '#f2efe9'][seed % 4], 0.5)
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, -0.02]} material={frame} castShadow>
        <boxGeometry args={[w + 0.1, h + 0.1, 0.04]} />
      </mesh>
      <mesh position={[0, 0, 0.002]} material={M.white}>
        <boxGeometry args={[w + 0.02, h + 0.02, 0.005]} />
      </mesh>
      <mesh position={[0, 0, 0.007]}>
        <planeGeometry args={[w * 0.84, h * 0.86]} />
        <meshStandardMaterial map={tex} roughness={0.8} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </group>
  )
}

/** Wall shelf with small plants and books. */
export function WallShelf({ position, rotation, w = 1.4 }) {
  return (
    <group position={position} rotation={rotation}>
      {[0, 0.45].map((y, k) => (
        <group key={k} position={[0, y, 0]}>
          <mesh position={[0, 0, 0.12]} material={M.white}>
            <boxGeometry args={[w, 0.04, 0.24]} />
          </mesh>
          {[-0.45, 0, 0.42].map((px, i) => (i + k) % 2 ? (
            <group key={i} position={[px * (w / 1.4), 0.1, 0.12]}>
              <mesh material={M.pot}><cylinderGeometry args={[0.07, 0.055, 0.14, 12]} /></mesh>
              <mesh position={[0, 0.13, 0]} material={i % 2 ? M.leaf : M.leaf2}><sphereGeometry args={[0.1, 12, 10]} /></mesh>
            </group>
          ) : (
            <group key={i} position={[px * (w / 1.4), 0.1, 0.12]}>
              {['#1E86FC', '#F5B70A', '#E5484D'].map((c, j) => (
                <mesh key={j} position={[j * 0.06 - 0.06, 0.02, 0]}><boxGeometry args={[0.05, 0.18 - j * 0.02, 0.15]} /><meshStandardMaterial color={c} /></mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}


/** A complete personal setup for a desk of its own: rug, drawer unit, second screen, desk lamp. */
const secondScreenMat = new THREE.MeshStandardMaterial({ color: '#151a24', roughness: 0.35, metalness: 0.2 })

export function SoloSetup({ row, rug = '#e9e4f5', seed = 0 }) {
  const cx = (row.x1 + row.x2) / 2
  const z = row.z + 0.82
  return (
    <group>
      <Rug x={cx} z={row.z + 0.2} w={2.3} d={2.5} color={rug} round={seed % 2 === 0} />
      {/* drawer unit under the right side */}
      <mesh position={[row.x2 - 0.3, 0.3, z - 0.05]} material={M.grey} castShadow>
        <boxGeometry args={[0.42, 0.58, 0.6]} />
      </mesh>
      {[0.12, 0.3, 0.48].map((y) => (
        <mesh key={y} position={[row.x2 - 0.3, y, z - 0.36]} material={M.metal}>
          <boxGeometry args={[0.16, 0.02, 0.02]} />
        </mesh>
      ))}
      {/* second monitor: same size as the main one, right next to it, angled towards the bot */}
      <group position={[cx - 0.5, 0.75, row.z + 0.95]} rotation={[0, Math.PI - 0.3, 0]}>
        <mesh position={[0, 0.11, 0.06]} material={M.metal}><boxGeometry args={[0.05, 0.22, 0.03]} /></mesh>
        <mesh position={[0, 0.01, 0.04]} material={M.metal}><boxGeometry args={[0.22, 0.015, 0.14]} /></mesh>
        <RoundedBox args={[0.6, 0.37, 0.035]} radius={0.012} position={[0, 0.34, 0.04]} material={M.white} castShadow />
        <mesh position={[0, 0.34, 0.06]} material={secondScreenMat}><planeGeometry args={[0.55, 0.32]} /></mesh>
      </group>
      {/* desk lamp */}
      <group position={[row.x2 - 0.2, 0.75, z + 0.25]}>
        <mesh position={[0, 0.01, 0]} material={M.dark}><cylinderGeometry args={[0.07, 0.07, 0.02, 16]} /></mesh>
        <mesh position={[0.04, 0.17, 0]} rotation={[0, 0, -0.25]} material={M.dark}><cylinderGeometry args={[0.008, 0.008, 0.34, 6]} /></mesh>
        <mesh position={[0.1, 0.33, -0.02]} rotation={[0.5, 0, 0]} material={sharedMat(['#F5B70A', '#1E86FC', '#E5484D', '#2FB36B'][seed % 4], 0.4)}>
          <coneGeometry args={[0.06, 0.09, 14, 1, true]} />
        </mesh>
      </group>
    </group>
  )
}


// ---- games that are really played: pieces move only while two bots stand at the table
// a player stands (and has stopped) at each end of the table, where the game spots are
function usePlayers(x, z, half) {
  const st = useRef({ k: 0, n: 0 })
  return () => {
    const s = st.current
    if (s.k++ % 12 === 0) {
      let a = false, b = false
      for (const q of botPositions.values()) {
        if (Math.abs(q.z - z) > 0.7) continue
        if (Math.abs(q.x - (x - half)) < 0.55) a = true
        if (Math.abs(q.x - (x + half)) < 0.55) b = true
      }
      s.n = (a ? 1 : 0) + (b ? 1 : 0)
    }
    return s.n
  }
}

/** Ping-pong ball rallying over the net, with a bounce on each half. */
function PingPongRally({ x, z }) {
  const ball = useRef()
  const players = usePlayers(x, z, 3.1 / 2 + 0.45)
  useFrame(({ clock }) => {
    const b = ball.current
    if (!b) return
    const on = players() >= 2
    b.visible = on
    if (!on) return
    const t = clock.elapsedTime * 0.9
    const k = t % 1, dir = Math.floor(t) % 2 ? -1 : 1
    // hit at one end, bounce on the far half, reach the other paddle
    const px = dir * (-1.25 + 2.5 * k)
    const h = k < 0.62 ? Math.sin((k / 0.62) * Math.PI) * 0.32 : Math.sin(((k - 0.62) / 0.38) * Math.PI) * 0.18
    b.position.set(px, 0.79 + h, Math.sin(t * 2.3) * 0.35)
  })
  return (
    <group userData={{ dynamic: true }}>
      <mesh ref={ball} material={M.white} visible={false} castShadow>
        <sphereGeometry args={[0.035, 10, 8]} />
      </mesh>
    </group>
  )
}

/** Pool: every few seconds the cue ball is struck, rolls, knocks a ball that rolls on and sinks. */
function PoolShots({ x, z }) {
  const cue = useRef(), target = useRef()
  const players = usePlayers(x, z, 3.0 / 2 + 0.45)
  useFrame(({ clock }) => {
    if (!cue.current || !target.current) return
    const on = players() >= 2
    const t = clock.elapsedTime
    const shot = Math.floor(t / 5), k = (t % 5) / 5
    const ang = ((shot * 2.39) % (Math.PI * 2)) - Math.PI
    const sx = -0.6, sz = 0.1
    const tx = 0.25 + Math.cos(ang) * 0.25, tz = Math.sin(ang) * 0.3
    if (!on || k < 0.2) {
      cue.current.position.set(sx, 0.84, sz)
      target.current.position.set(tx, 0.84, tz)
      return
    }
    const ease = (u) => 1 - Math.pow(1 - Math.min(1, u), 3)
    const a = ease((k - 0.2) / 0.25) // cue ball travels to the target
    cue.current.position.set(sx + (tx - sx) * a * 0.92, 0.84, sz + (tz - sz) * a * 0.92)
    cue.current.rotation.z -= 0.25 * (1 - a)
    if (k > 0.45) {
      const b = ease((k - 0.45) / 0.4) // target rolls toward the nearest pocket and drops
      const px = tx > 0 ? 1.1 : -1.1, pz = tz > 0 ? 0.58 : -0.58
      target.current.position.set(tx + (px - tx) * b, 0.84 - (b > 0.95 ? (b - 0.95) * 3 : 0), tz + (pz - tz) * b)
    }
  })
  return (
    <group userData={{ dynamic: true }}>
      <mesh ref={cue} material={sharedMat('#ffffff', 0.25)} castShadow><sphereGeometry args={[0.035, 12, 10]} /></mesh>
      <mesh ref={target} material={sharedMat('#E5484D', 0.25)} castShadow><sphereGeometry args={[0.035, 12, 10]} /></mesh>
    </group>
  )
}

/** Foosball: rods twist and slide, the little ball zips across. */
function FoosballPlay({ x, z }) {
  const rods = useRef([]), ball = useRef()
  const players = usePlayers(x, z, 1.4 / 2 + 0.45)
  useFrame(({ clock }) => {
    const on = players() >= 2
    const t = clock.elapsedTime
    rods.current.forEach((r, i) => {
      if (!r) return
      r.rotation.y = on ? Math.sin(t * (6 + i) + i) * 1.2 : 0
      r.position.z = on ? Math.sin(t * (2.2 + i * 0.4) + i * 2) * 0.12 : 0
    })
    if (ball.current) {
      ball.current.visible = on
      if (on) ball.current.position.set(Math.sin(t * 1.7) * 0.5, 0.92, Math.sin(t * 2.9) * 0.25)
    }
  })
  return (
    <group userData={{ dynamic: true }}>
      {[-0.42, -0.14, 0.14, 0.42].map((rx, i) => (
        <group key={i} ref={(g) => (rods.current[i] = g)} position={[rx, 0.95, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={M.metal}><cylinderGeometry args={[0.012, 0.012, 1.0, 6]} /></mesh>
          {[-0.2, 0, 0.2].map((pz) => (
            <mesh key={pz} position={[0, -0.04, pz]} material={sharedMat(i % 2 ? '#1E86FC' : '#E5484D', 0.5)}><boxGeometry args={[0.04, 0.09, 0.03]} /></mesh>
          ))}
        </group>
      ))}
      <mesh ref={ball} material={M.white} visible={false}><sphereGeometry args={[0.025, 8, 6]} /></mesh>
    </group>
  )
}

/** Ping-pong table (games corner). */
export function PingPong({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.74, 0]} material={sharedMat('#2a6fd6', 0.5)} castShadow receiveShadow><boxGeometry args={[2.6, 0.05, 1.45]} /></mesh>
      <mesh position={[0, 0.767, 0]} material={M.white}><boxGeometry args={[2.6, 0.002, 0.03]} /></mesh>
      <mesh position={[0, 0.83, 0]} material={sharedMat('#f4f4f6', 0.7)}><boxGeometry args={[0.02, 0.15, 1.55]} /></mesh>
      {[[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.36, lz]} material={M.dark}><boxGeometry args={[0.06, 0.72, 0.06]} /></mesh>
      ))}
      <PingPongRally x={x} z={z} />
    </group>
  )
}

/** Foosball table. */
export function Foosball({ x, z }) {
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0.78, 0]} material={sharedMat('#6b4a33', 0.6)} castShadow><boxGeometry args={[1.3, 0.22, 0.75]} /></mesh>
      <mesh position={[0, 0.895, 0]} material={sharedMat('#2FB36B', 0.8)}><boxGeometry args={[1.2, 0.01, 0.65]} /></mesh>
      <FoosballPlay x={x} z={z} />
      {[-0.5, 0.5].map((lx) => [-0.3, 0.3].map((lz) => (
        <mesh key={`${lx}${lz}`} position={[lx, 0.34, lz]} material={M.dark}><boxGeometry args={[0.07, 0.68, 0.07]} /></mesh>
      )))}
    </group>
  )
}

/** Wooden bench (indoor garden). */
export function Bench({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.42, 0]} material={sharedMat('#c49a6c', 0.6)} castShadow><boxGeometry args={[1.6, 0.06, 0.45]} /></mesh>
      {[-0.65, 0.65].map((lx) => (
        <mesh key={lx} position={[lx, 0.2, 0]} material={M.dark}><boxGeometry args={[0.06, 0.4, 0.4]} /></mesh>
      ))}
    </group>
  )
}


/** The main bot of the company (roster "role": "ceo" / "principal"). */
export const isVip = (b) => !!b && /^(ceo|principal|founder|fundador|dono|owner)$/i.test(b.role || '')

/** Executive desk for a team lead: wider desk, rug and plant (local coords: seat at 0,0, facing +z).
 *  Name plaque lives in DeskDecor (sized to the name) so VIP gold + label don't stack as two plates. */
export function ExecDesk({ mat, vip }) {
  const w = vip ? 2.2 : 1.9
  return (
    <group>
      <Rug x={0} z={0.4} w={w + 0.9} d={2.6} color={vip ? '#d9b26a' : '#b9a4d6'} round={false} />
      <RoundedBox args={[w, 0.07, 1.0]} radius={0.03} position={[0, 0.72, 0.85]} material={mat} castShadow receiveShadow />
      {/* front modesty panel + side pedestals */}
      <mesh position={[0, 0.38, 1.32]} material={mat}><boxGeometry args={[w - 0.06, 0.66, 0.04]} /></mesh>
      {[-w / 2 + 0.25, w / 2 - 0.25].map((x) => (
        <mesh key={x} position={[x, 0.35, 0.85]} material={mat} castShadow><boxGeometry args={[0.46, 0.7, 0.92]} /></mesh>
      ))}
      <Plant position={[-(w / 2 + 0.45), 0, 0.3]} scale={0.95} kind={vip ? 0 : 1} />
    </group>
  )
}


/** Pool table. */
export function PoolTable({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.72, 0]} material={sharedMat('#6b4a33', 0.5)} castShadow receiveShadow><boxGeometry args={[2.5, 0.16, 1.45]} /></mesh>
      <mesh position={[0, 0.805, 0]} material={sharedMat('#1f7a4d', 0.9)}><boxGeometry args={[2.25, 0.01, 1.2]} /></mesh>
      {[[-1.12, -0.6], [0, -0.62], [1.12, -0.6], [-1.12, 0.6], [0, 0.62], [1.12, 0.6]].map(([px, pz], i) => (
        <mesh key={i} position={[px, 0.812, pz]} material={M.black}><cylinderGeometry args={[0.055, 0.055, 0.01, 12]} /></mesh>
      ))}
      <PoolShots x={x} z={z} />
      {[['#F5B70A', 0.62, 0.16], ['#1E86FC', 0.6, -0.3], ['#111111', 0.75, -0.06]].map(([c, bx, bz], i) => (
        <mesh key={'b' + i} position={[bx, 0.84, bz]} material={sharedMat(c, 0.25)}><sphereGeometry args={[0.035, 10, 8]} /></mesh>
      ))}
      <mesh position={[-0.2, 0.83, 0.35]} rotation={[0, 0, Math.PI / 2 - 0.05]} material={sharedMat('#c49a6c', 0.5)}><cylinderGeometry args={[0.012, 0.018, 1.4, 6]} /></mesh>
      {[[-1.0, -0.55], [1.0, -0.55], [-1.0, 0.55], [1.0, 0.55]].map(([lx, lz], i) => (
        <mesh key={'l' + i} position={[lx, 0.32, lz]} material={sharedMat('#4a3324', 0.6)}><boxGeometry args={[0.14, 0.64, 0.14]} /></mesh>
      ))}
    </group>
  )
}


/** Meeting topic written on the whiteboard while a meeting is going on. */
export function MeetingTopic({ d, D, topic, people }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 300
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return { c, g: c.getContext('2d'), t }
  }, [])
  useEffect(() => {
    const { g, c } = tex
    g.clearRect(0, 0, c.width, c.height)
    g.fillStyle = '#1E86FC'
    g.font = '700 34px -apple-system, Segoe UI, Roboto, sans-serif'
    g.fillText('REUNIÃO', 24, 52)
    g.fillStyle = '#16181d'
    g.font = '600 38px -apple-system, Segoe UI, Roboto, sans-serif'
    // wrap the topic on up to 3 lines
    const words = String(topic).split(' ')
    let line = '', y = 110
    for (const w of words) {
      const test = line ? line + ' ' + w : w
      if (g.measureText(test).width > 460 && line) {
        g.fillText(line, 24, y)
        y += 46
        line = w
        if (y > 210) break
      } else line = test
    }
    if (y <= 210) g.fillText(line, 24, y)
    g.fillStyle = '#6b7280'
    g.font = '500 24px -apple-system, Segoe UI, Roboto, sans-serif'
    g.fillText(people.slice(0, 4).join(' · '), 24, 272)
    tex.t.needsUpdate = true
  }, [topic, people.join('|'), tex]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.t.dispose(), [tex])
  return (
    <mesh position={[d.x, 1.35, -D / 2 + 0.32 + 0.03]}>
      <planeGeometry args={[1.7, 0.98]} />
      <meshBasicMaterial map={tex.t} transparent polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  )
}


/** The room's door to the corridors (on the left wall, where the elevator used to be). */
export function Door({ layout }) {
  const { W } = layout
  const z = layout.elevator.z
  const frame = sharedMat('#8a6446', 0.5)
  const leaf = sharedMat('#c8996a', 0.55)
  return (
    <group position={[-W / 2, 0, z]} userData={{ dynamic: true }}>
      {/* doormat inside */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.75, 0.02, 0]} material={sharedMat('#6b7280', 0.95)}>
        <planeGeometry args={[0.8, 1.3]} />
      </mesh>
      {/* frame + open leaf, seen from inside and out (the wall box sits at x 0..0.25) */}
      {[-0.62, 0.62].map((dz) => (
        <mesh key={dz} position={[0.125, 1.1, dz]} material={frame}><boxGeometry args={[0.32, 2.2, 0.08]} /></mesh>
      ))}
      <mesh position={[0.125, 2.24, 0]} material={frame}><boxGeometry args={[0.32, 0.1, 1.32]} /></mesh>
      <mesh position={[0.27, 1.06, 0]} material={sharedMat('#2a2f3a', 0.7)}><boxGeometry args={[0.02, 2.1, 1.16]} /></mesh>
      <mesh position={[-0.02, 1.06, 0]} material={leaf}><boxGeometry args={[0.02, 2.1, 1.16]} /></mesh>
      <mesh position={[-0.05, 1.05, 0.42]} material={MATS_METAL}><sphereGeometry args={[0.04, 10, 8]} /></mesh>
    </group>
  )
}
const MATS_METAL = new THREE.MeshStandardMaterial({ color: '#c8ccd3', roughness: 0.25, metalness: 0.7 })
