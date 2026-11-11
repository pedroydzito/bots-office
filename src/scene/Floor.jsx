import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Bot from './Bot'
import MailFlights from './Mail'
import Seasonal from './Seasonal'
import { hash } from './sim'
import Pet from './Pet'
import Confetti from './Confetti'
import StaticMerge from './StaticMerge'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

let mergeGen = 0
import {
  Aquarium, Arcade, Bench, MeetingTopic, PoolTable, DESK_FINISH, ExecDesk, isVip, Foosball, PingPong, SoloSetup, Armchair, BeanBag, Poster, WallShelf, Bookshelf, FloorLamp, Printer, Vending, Cake, Chair, Clock, CoffeeCorner, DeskDecor, DeskRow, InfoBoard, Lounge, MATS, MeetingTable, Plant, Rug, StatusLamp, Whiteboard, Railing,
  StickyWall, TVScreen, WallTitle, WaterCooler, Workstation,
} from './Props'
import { durationShort, effStatus, resolveColor, STATUS, talkActive } from '../lib/constants'
import { botMetrics } from '../lib/metrics'
import { dataStore } from '../lib/state'
import { useStore } from '../lib/createStore'
import { FLOORS, lookStore, WALLS } from '../lib/look'

export const wallMat = new THREE.MeshStandardMaterial({ color: '#f3f3f5', roughness: 0.9 })
export const floorMat = new THREE.MeshStandardMaterial({ color: '#eceef1', roughness: 0.5, envMapIntensity: 0.8 })
// floor & wall finish follow the office look (personalisation)
function applyFinish() {
  const l = lookStore.get()
  floorMat.color.set((FLOORS[l.floor] || FLOORS.light)[1])
  wallMat.color.set((WALLS[l.wall] || WALLS.white)[1])
}
applyFinish()
lookStore.subscribe(applyFinish)
const slabMat = new THREE.MeshStandardMaterial({ color: '#e2e4e8', roughness: 0.8 })

const bands = new Map()
function bandMat(color) {
  if (!bands.has(color)) bands.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0 }))
  return bands.get(color)
}
/** night: team bands glow (with the desktop bloom they read as LED strips) */
export function setBandGlow(n) {
  for (const m of bands.values()) m.emissiveIntensity = n * 1.6
}

// ---- cutaway walls (like a management game): the walls between the camera and the room sink to a
// low curb, the far ones stay up; whatever hangs on a sunk wall hides with it
const _cam = new THREE.Vector3(), _org = new THREE.Vector3()
const NORMALS = { back: [0, -1], left: [-1, 0], right: [1, 0], front: [0, 1] }
function nearSide(obj, camera, side) {
  const room = obj.parent
  if (!room) return false
  _cam.copy(camera.position)
  room.worldToLocal(_cam)
  const [nx, nz] = NORMALS[side]
  return nx * _cam.x + nz * _cam.z > 0
}

// rooms whose side walls stay up (the room in focus); the wall facing the camera still sinks
export const raisedRooms = new Set()

const glassMat = new THREE.MeshStandardMaterial({ color: '#cfe3f2', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false })
const frameMat = new THREE.MeshStandardMaterial({ color: '#fbfbfc', roughness: 0.5 })
const trimMat = new THREE.MeshStandardMaterial({ color: '#4b505b', roughness: 0.7 })

/** Box geometry placed at (x,y,z) in wall space (u = along the wall). */
function wallBox(horiz, u, y, w, h, t, off = 0) {
  const g = horiz ? new THREE.BoxGeometry(w, h, t) : new THREE.BoxGeometry(t, h, w)
  g.translate(horiz ? u : off, y, horiz ? off : u)
  return g
}

/**
 * A full-height wall with openings (doors, windows), merged into a few meshes. It sinks to a low
 * curb when it stands between the camera and the room (cutaway), unless the room is in focus
 * (then only the front one sinks). A dark trim runs along its top, like a building plan.
 */
function CutWall({ side, W, D, T = 0.25, H = 3.2, mat = wallMat, openings = [], layout }) {
  const ref = useRef()
  const LOW = 0.32
  useFrame(({ camera }, dt) => {
    const g = ref.current
    if (!g) return
    const up = side !== 'front' && layout && raisedRooms.has(layout)
    const want = !up && nearSide(g, camera, side) ? LOW / H : 1
    const s = g.scale.y + (want - g.scale.y) * Math.min(1, dt * 7)
    if (Math.abs(s - g.scale.y) > 0.0005) g.scale.y = s
  })
  const horiz = side === 'back' || side === 'front'
  const len = horiz ? W : D
  const geos = useMemo(() => {
    const solid = [], glass = [], frame = []
    const ops = [...openings].sort((p, q) => p.a - q.a)
    let u = -len / 2
    for (const o of ops) {
      if (o.a - u > 0.01) solid.push(wallBox(horiz, (u + o.a) / 2, H / 2, o.a - u, H, T))
      const w = o.b - o.a, c = (o.a + o.b) / 2
      if (o.kind === 'door') {
        solid.push(wallBox(horiz, c, (H + 2.2) / 2, w, H - 2.2, T))
      } else {
        const sill = 0.85, head = 2.25
        solid.push(wallBox(horiz, c, sill / 2, w, sill, T))
        solid.push(wallBox(horiz, c, (H + head) / 2, w, H - head, T))
        glass.push(wallBox(horiz, c, (sill + head) / 2, w, head - sill, 0.04))
        // white frame: sill, head, sides and one mullion
        frame.push(wallBox(horiz, c, sill + 0.03, w, 0.06, T + 0.04))
        frame.push(wallBox(horiz, c, head - 0.03, w, 0.06, T + 0.04))
        for (const e of [o.a + 0.03, o.b - 0.03, c]) frame.push(wallBox(horiz, e, (sill + head) / 2, 0.06, head - sill, T * 0.6))
      }
      u = o.b
    }
    if (len / 2 - u > 0.01) solid.push(wallBox(horiz, (u + len / 2) / 2, H / 2, len / 2 - u, H, T))
    const trim = [wallBox(horiz, 0, H + 0.02, len, 0.05, T + 0.02)]
    const m = (list) => (list.length ? mergeGeometries(list, false) : null)
    return { solid: m(solid), glass: m(glass), frame: m(frame), trim: m(trim) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horiz, len, H, T, JSON.stringify(openings)])
  const pos = side === 'back' ? [0, 0, -D / 2 + T / 2] : side === 'front' ? [0, 0, D / 2 - T / 2] : side === 'left' ? [-W / 2 + T / 2, 0, 0] : [W / 2 - T / 2, 0, 0]
  return (
    <group ref={ref} position={pos} userData={{ dynamic: true }}>
      {geos.solid && <mesh geometry={geos.solid} material={mat} receiveShadow castShadow />}
      {geos.frame && <mesh geometry={geos.frame} material={frameMat} />}
      {geos.glass && <mesh geometry={geos.glass} material={glassMat} />}
      <mesh geometry={geos.trim} material={trimMat} />
    </group>
  )
}

// every room has its own paint and floor (unless the office look picks one for all)
const ROOM_WALLS = ['#f3eee6', '#dde8df', '#e6e1f0', '#f2e3d7', '#dbe6ef', '#efe7cc', '#e8e2da', '#e1ece8', '#f0dfe3']
const ROOM_FLOORS = ['#d9b68f', '#b88b66', '#e3ddd4', '#c9ced6', '#aebdd1', '#dcc6ad', '#cf9f84', '#e7d4b4', '#b9c9b3']
const matCache = new Map()
function paint(color, rough = 0.85) {
  const k = color + rough
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough }))
  return matCache.get(k)
}
export function roomFinish(layout, look) {
  const v = layout.variant >>> 0
  const wall = look?.wall && look.wall !== 'white' ? (WALLS[look.wall] || WALLS.white)[1] : ROOM_WALLS[v % ROOM_WALLS.length]
  const floor = look?.floor && look.floor !== 'light' ? (FLOORS[look.floor] || FLOORS.light)[1] : ROOM_FLOORS[(v >>> 5) % ROOM_FLOORS.length]
  return { wall: paint(wall, 0.9), floor: paint(floor, 0.55) }
}

/** The room's door to the corridor: frame and a half-open leaf (hidden with its wall). */
function RoomDoor({ x, D, T = 0.25 }) {
  const frame = paint('#8a6446', 0.5)
  const leaf = paint('#c8996a', 0.55)
  return (
    <group position={[x, 0, D / 2 - T / 2]}>
      {[-0.68, 0.68].map((dx) => (
        <mesh key={dx} position={[dx, 1.1, 0]} material={frame}><boxGeometry args={[0.08, 2.2, T + 0.08]} /></mesh>
      ))}
      <mesh position={[0, 2.2, 0]} material={frame}><boxGeometry args={[1.44, 0.1, T + 0.08]} /></mesh>
      <group position={[-0.62, 0, -T / 2 - 0.02]} rotation={[0, 1.1, 0]}>
        <mesh position={[0.6, 1.06, 0]} material={leaf}><boxGeometry args={[1.18, 2.1, 0.05]} /></mesh>
        <mesh position={[1.05, 1.05, -0.05]} material={frameMat}><sphereGeometry args={[0.04, 8, 6]} /></mesh>
      </group>
    </group>
  )
}

/** Things hung on a wall: hidden while that wall is sunk (the camera looks from that side). */
export function WallMount({ side, children }) {
  const ref = useRef()
  useFrame(({ camera }) => {
    const g = ref.current
    if (!g) return
    const v = !nearSide(g, camera, side)
    if (g.visible !== v) g.visible = v
  })
  return (
    <group ref={ref} userData={{ dynamic: true }}>
      {children}
    </group>
  )
}

/** Window openings spread evenly over [a, b] along a wall. */
function windowsAlong(a, b, w, step) {
  const n = Math.max(0, Math.floor((b - a + 0.6) / step))
  const out = []
  if (!n) return out
  const gap = (b - a - n * w) / (n + 1)
  for (let i = 0; i < n; i++) {
    const s = a + gap + i * (w + gap)
    out.push({ a: s, b: s + w, kind: 'window' })
  }
  return out
}

export function Shell({ layout, title, subtitle, accent, look }) {
  const { W, D } = layout
  const fin = roomFinish(layout, look)
  const doorX = layout.elevator?.x ?? -W / 2 + 1.5
  const front = [{ a: doorX - 0.7, b: doorX + 0.7, kind: 'door' }, ...windowsAlong(doorX + 1.6, W / 2 - 1.0, 1.5, 2.6)]
  const right = windowsAlong(-D / 2 + 1.3, D / 2 - 1.3, 1.4, 2.5)
  const base = [
    [0, -D / 2 + 0.265, W, 0.03],
    [-W / 2 + 0.265, 0, 0.03, D],
    [W / 2 - 0.265, 0, 0.03, D],
    [(doorX + 0.7 + W / 2) / 2, D / 2 - 0.265, W / 2 - doorX - 0.7, 0.03],
    [(-W / 2 + doorX - 0.7) / 2, D / 2 - 0.265, doorX - 0.7 + W / 2, 0.03],
  ]
  return (
    <group>
      {/* a hair smaller than the storey slab: equal faces flickered (z-fighting) on the building side */}
      <mesh position={[0, -0.18, 0]} material={slabMat}>
        <boxGeometry args={[W - 0.04, 0.34, D - 0.04]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} material={fin.floor} receiveShadow>
        <planeGeometry args={[W, D]} />
      </mesh>
      {/* four real walls in the room's own paint; corridors run outside them */}
      <CutWall side="back" W={W} D={D} mat={fin.wall} layout={layout} />
      <CutWall side="left" W={W} D={D} mat={fin.wall} layout={layout} />
      <CutWall side="right" W={W} D={D} mat={fin.wall} layout={layout} openings={right} />
      <CutWall side="front" W={W} D={D} mat={fin.wall} layout={layout} openings={front} />
      <WallMount side="front"><RoomDoor x={doorX} D={D} /></WallMount>
      {/* white baseboards */}
      {base.filter((q) => q[2] > 0.05 && q[3] > 0.02).map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.06, z]} material={frameMat}>
          <boxGeometry args={[w, 0.12, d]} />
        </mesh>
      ))}
      <WallMount side="back">
        {/* a single vertical line in the team colour, as tall as the floor name */}
        {accent && (
          <mesh position={[-W / 2 + 3.1, 2.355, -D / 2 + 0.262]} material={bandMat(accent)}>
            <boxGeometry args={[0.05, 0.34, 0.01]} />
          </mesh>
        )}
        <WallTitle title={title} subtitle={subtitle} position={[-W / 2 + 5.0, 2.28, -D / 2 + 0.26]} />
      </WallMount>
    </group>
  )
}

function eventsSeries() {
  const act = dataStore.get().activity
  const now = Date.now()
  const buckets = new Array(24).fill(0)
  for (const a of act) {
    const m = Math.floor((now - a.t) / 60000)
    if (m >= 0 && m < 24) buckets[23 - m]++
  }
  return buckets
}

export default function Floor({ floor, layout, data, now, floorY, night, selectedBot, spotlight, onSelect, onLongPress, floorCount = 1, celebrate = null, compact = false }) {
  const { W, D } = layout
  const home = floor.bots
  const floorIdx = floor.num - 1
  const petKind0 = data.pets?.[floor.key] || ['cat', 'dog', 'fish'][hash(floor.key) % 3]
  const look = useStore(lookStore, (l) => l)
  const deskMat = DESK_FINISH[(layout.variant >>> 10) % DESK_FINISH.length]
  const petKind = look.pet ? petKind0 : 'none'
  const homeSet = useMemo(() => new Set(home), [home])
  const seatOf = useMemo(() => {
    const m = {}
    home.forEach((n, i) => (m[n] = layout.seats[i]))
    return m
  }, [home, layout])

  // ---- who is on this floor: its own bots plus visitors from other floors (from the shared talk log)
  const visitors = useMemo(() => {
    const out = []
    for (const t of data.talkLog || []) {
      if (homeSet.has(t.to) && !homeSet.has(t.from) && data.bots[t.from] && !out.includes(t.from)) {
        const end = t.end ?? t.lastT + 90000
        if (end > now - 120000) out.push(t.from)
      }
    }
    // hand-offs delivered in person also bring the sender to this floor
    for (const m of data.mail || []) {
      if (homeSet.has(m.to) && !homeSet.has(m.from) && data.bots[m.from] && !out.includes(m.from) && m.t > now - 3 * 60e3) out.push(m.from)
    }
    return out
  }, [data.talkLog, data.mail, data.bots, homeSet, Math.floor(now / 5000)])
  // the simulation reads statuses/conversations from `data`; give bots a stable object per change
  const simData = useMemo(() => ({ history: data.history, talkLog: data.talkLog, mail: data.mail, rev: data.rev, weather: data.weather?.kind || null }), [data.history, data.talkLog, data.mail, data.rev, data.weather])

  // ---- room status (door sign), wall boards, achievements, sleep-lights
  const sts = home.map((n) => effStatus(data.bots[n], now))
  const floorColor = sts.includes('error') ? STATUS.error.color : sts.includes('waiting_user') ? STATUS.waiting_user.color : sts.includes('working') ? STATUS.working.color : '#9aa0aa'
  // (unused waiting-board lines removed: they scanned every bot on every render)
  const histLen = data.history?.length || 0
  const highlights = useMemo(() => {
    if (!data.history) return []
    const ms = home.map((n) => ({ n, m: botMetrics(data, n) }))
    const out = []
    const top = [...ms].sort((a, b) => b.m.done - a.m.done)[0]
    if (top && top.m.done) out.push({ a: `Mais produtivo: ${top.n}`, b: `${top.m.done} tarefas concluídas`, color: '#2FB36B' })
    const busy = [...ms].sort((a, b) => b.m.workMs - a.m.workMs)[0]
    if (busy && busy.m.workMs > 60000) out.push({ a: `Mais focado: ${busy.n}`, b: `${Math.round(busy.m.workMs / 60000)} min trabalhando` })
    const clean = ms.filter((x) => x.m.events && !x.m.errors).length
    if (ms.some((x) => x.m.events)) out.push({ a: `${clean} sem nenhum erro hoje`, b: `de ${home.length} bots do andar` })
    const err = [...ms].sort((a, b) => b.m.errors - a.m.errors)[0]
    if (err && err.m.errors) out.push({ a: `Precisa de ajuda: ${err.n}`, b: `${err.m.errors} erro(s) hoje`, color: '#E5484D' })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histLen, home, Math.floor(now / 60000)])
  // 3+ bots talking with the same host on this floor = a meeting: its topic goes on the whiteboard
  const meeting = (() => {
    const hosts = {}
    for (const [from, t] of Object.entries(data.talks || {})) {
      if (!talkActive(t, now) || !homeSet.has(t.to)) continue
      ;(hosts[t.to] ||= []).push({ from, step: t.step })
    }
    const best = Object.entries(hosts).sort((a, b) => b[1].length - a[1].length)[0]
    if (!best || best[1].length < 2) return null
    return { topic: best[1].find((x) => x.step)?.step || 'Reunião', people: [best[0], ...best[1].map((x) => x.from)] }
  })()
  const allResting = sts.length > 0 && sts.every((s) => s === 'resting')
  const today = (() => {
    const d = new Date(now)
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  // Furniture, walls and decor don't change with every status update: build them once per
  // layout / light mode instead of on every re-render (big win on phones).
  // re-merge only when the furniture itself changes (not on day/night: that only recolours)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mergeKey = useMemo(() => ++mergeGen, [layout, floor.key, floorY, petKind, home, look])
  const staticRoom = useMemo(
    () => (
      <StaticMerge key={mergeKey}>
      <Shell layout={layout} look={look} title={floor.name} subtitle={`${floor.bots.length} bots`} accent={look.accent ? floor.color : null} />
      <WallMount side="back">
      <CoffeeCorner position={[-W / 2 + 3.0, 0, -D / 2 + 0.52]} />
      {/* the clock is not in the same spot in every room: each room has its own habits */}
      {(() => {
        const k = (layout.variant >>> 7) % 4
        if (k === 1 || k === 2) return null
        if (k === 3) return <Clock position={[-W / 2 + 3.0, 2.6, -D / 2 + 0.28]} />
        return <Clock position={[-W / 2 + 1.55, 2.45, -D / 2 + 0.28]} />
      })()}
      <TVScreen
        position={[layout.tvX ?? W / 2 - 2.5, 1.75, -D / 2 + 0.3]}
        getInfo={() => {
          const st = dataStore.get()
          const t = Date.now()
          const sts = home.map((n) => effStatus(st.bots[n], t))
          const mine = new Set(home)
          const last = []
          for (let i = (st.history?.length || 0) - 1; i >= 0 && last.length < 3; i--) {
            const h = st.history[i]
            if (h.status === 'done' && mine.has(h.bot)) last.push({ bot: h.bot, step: h.step, ago: durationShort(h.t - t) })
          }
          return { working: sts.filter((x) => x === 'working').length, waiting: sts.filter((x) => x === 'waiting_user').length, errors: sts.filter((x) => x === 'error').length, total: home.length, last }
        }}
      />
      </WallMount>
      <Plant position={[-W / 2 + 0.75, 0, -D / 2 + 0.75]} scale={1.15} />
      {look.plants && <Plant position={[W / 2 - 1.0, 0, -D / 2 + 0.9]} scale={1.3} kind={1} />}
      {look.plants && D > 12 && <Plant position={[W / 2 - 0.9, 0, -D / 2 + 5.5]} scale={0.9} />}
      <WaterCooler position={[-W / 2 + 0.6, 0, layout.wall.coolerZ]} rotation={[0, Math.PI / 2, 0]} />
      {layout.wall.shelfZ != null && <Bookshelf position={[-W / 2 + 0.47, 0, layout.wall.shelfZ]} rotation={[0, Math.PI / 2, 0]} seed={floor.num} />}
      <Lounge position={[layout.lounge?.x ?? W / 2 - 2.4, 0, layout.lounge?.z ?? D / 2 - 2.3]} night={night} seats={layout.pois.filter((q) => q.kind === 'sofa' && Math.abs(q.x - (layout.lounge?.x ?? W / 2 - 2.4)) < 2 && Math.abs(q.z - (layout.lounge?.z ?? D / 2 - 2.3)) < 1.6)} />
      {layout.decor.map((d, i) =>
        d.type === 'rug' ? (look.rugs ? <Rug key={i} {...d} /> : null) :
        d.type === 'meeting' ? <MeetingTable key={i} x={d.x} z={d.z} /> :
        d.type === 'whiteboard' ? <Whiteboard key={i} x={d.x} z={-D / 2 + 0.32} /> :
        d.type === 'beanbag' ? <BeanBag key={i} x={d.x} z={d.z} c={d.c} /> :
        d.type === 'plant' ? (!look.plants ? null : <Plant key={i} position={[d.x, 0, d.z]} kind={d.k} scale={1.1} />) :
        d.type === 'vending' ? <Vending key={i} x={d.x} z={d.z} /> :
        d.type === 'printer' ? <Printer key={i} x={d.x} z={d.z} /> :
        d.type === 'arcade' ? <Arcade key={i} x={d.x} z={d.z} /> :
        d.type === 'armchair' ? <Armchair key={i} x={d.x} z={d.z} c={d.c} /> :
        d.type === 'pingpong' ? <PingPong key={i} x={d.x} z={d.z} /> :
        d.type === 'pool' ? <PoolTable key={i} x={d.x} z={d.z} /> :
        d.type === 'bookcase' ? <Bookshelf key={i} position={[d.x, 0, d.z]} width={1.7} shelves={4} seed={i + 5} /> :
        d.type === 'foosball' ? <Foosball key={i} x={d.x} z={d.z} /> :
        d.type === 'bench' ? <Bench key={i} x={d.x} z={d.z} /> :
        d.type === 'lamp' ? <FloorLamp key={i} x={d.x} z={d.z} night={night} /> : null,
      )}
      {layout.rows.filter((r) => r.solo && !r.lead).map((r, i) => (
        <SoloSetup key={'solo' + i} row={r} seed={(layout.variant >>> 4) + i} rug={['#cbb8ec', '#b5d3dc', '#e3c7a2', '#c2d9b4', '#ebbcc8', '#b8c6e6'][((layout.variant >>> 4) + i) % 6]} />
      ))}
      {layout.rows.map((r, i) => (
        <DeskRow key={i} row={r} mat={deskMat} />
      ))}
      <group userData={{ dynamic: true }}>{petKind !== 'fish' && petKind !== 'none' && <Pet layout={layout} floorIdx={floorIdx} kind={petKind} />}</group>
      {petKind === 'fish' && <Aquarium x={W / 2 - 0.7} z={-D / 2 + 4.6} />}
      <group userData={{ dynamic: true }}>{look.seasonal && <Seasonal layout={layout} seed={floor.key} />}</group>
      {/* wall art keeps both walls lively: posters high above the left-wall furniture, art + shelf on the back wall */}
      {/* pictures sit in the gaps between the left-wall furniture, at one shared height */}
      {(layout.variant >>> 7) % 4 === 1 && (
        <WallMount side="left"><Clock position={[-W / 2 + 0.28, 2.5, -D / 2 + 0.95]} rotation={[0, Math.PI / 2, 0]} /></WallMount>
      )}
      {(layout.variant >>> 7) % 4 === 2 && (
        <WallMount side="right"><Clock position={[W / 2 - 0.28, 2.7, 0]} rotation={[0, -Math.PI / 2, 0]} /></WallMount>
      )}
      <WallMount side="left">
      {look.art && layout.wall.artZ.map((z, i) => (
        <Poster key={i} position={[-W / 2 + 0.27, 1.75, z]} rotation={[0, Math.PI / 2, 0]} seed={(hash(floor.key) % 97) + i * 3} w={0.85} h={1.05} />
      ))}
      </WallMount>
      <WallMount side="back">
      {look.art && layout.artX != null && (layout.artKind === 'plants' ? (
        <group>
          <WallShelf position={[(layout.artX ?? 0) - 0.2, 1.55, -D / 2 + 0.25]} w={1.6} />
          <WallShelf position={[(layout.artX ?? 0) + 0.3, 1.05, -D / 2 + 0.25]} w={1.2} />
        </group>
      ) : (
        <group>
          <Poster position={[(layout.artX ?? 0) - 0.55, 1.95, -D / 2 + 0.27]} seed={(hash(floor.key) % 97) + 7} w={0.85} h={1.15} />
          <WallShelf position={[(layout.artX ?? 0) + 0.75, 1.3, -D / 2 + 0.25]} w={1.0} />
        </group>
      ))}
      </WallMount>
      </StaticMerge>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, night, floor.key, floor.name, floor.num, floor.color, floorY, petKind, home, look],
  )

  return (
    <group>
      {staticRoom}
      {layout.wall.stickyZ != null && (
        <WallMount side="left"><InfoBoard
          position={[-W / 2 + 0.29, 1.75, layout.wall.boardZ]}
          rotation={[0, Math.PI / 2, 0]}
          title="Destaques de hoje"
          accent="#8F59F9"
          empty="Sem atividade ainda"
          lines={highlights}
        /></WallMount>
      )}

      <MailFlights mail={data.mail} floorIdx={floorIdx} layout={layout} />
      {meeting && layout.decor.find((d) => d.type === 'whiteboard') && (
        <MeetingTopic d={layout.decor.find((d) => d.type === 'whiteboard')} D={D} topic={meeting.topic} people={meeting.people} />
      )}
      {celebrate &&
        layout.seats.slice(0, home.length).map((st, i) => (
          <group key={`${celebrate}-${i}`} position={[st.x, 1.2, st.z]}>
            <Confetti y={0.4 + (i % 3) * 0.2} />
          </group>
        ))}
      {home.map((n, i) => {
        const seat = layout.seats[i]
        if (!seat) return null
        if (seat.lead)
          // the lead's executive desk, turned to face the team (wall + highlights board behind)
          return (
            <group key={n} position={[seat.x, 0, seat.z]} rotation={[0, seat.yaw || 0, 0]}>
              <ExecDesk mat={deskMat} vip={isVip(data.bots[n])} />
              <Chair x={0} z={0} owner={n} hiddenOwner={data.bots[n]?.hidden ? n : null} yawBase={seat.yaw || 0} />
              <Workstation seat={{ x: 0, z: 0 }} idx={i} status={data.bots[n]?.hidden ? 'resting' : effStatus(data.bots[n], now)} night={night} step={data.bots[n]?.step} color={resolveColor(data.bots[n]?.color)} />
              <DeskDecor seat={{ x: 0, z: 0 }} items={data.bots[n]?.desk} name={n} trophies={data.stats?.[n]?.got?.length || 0} color={resolveColor(data.bots[n]?.color)} vip={isVip(data.bots[n])} />
            </group>
          )
        return (
          <group key={n}>
            <Chair x={seat.x} z={seat.z} owner={n} hiddenOwner={data.bots[n]?.hidden ? n : null} />
            <Workstation seat={seat} idx={i} status={data.bots[n]?.hidden ? 'resting' : effStatus(data.bots[n], now)} night={night} step={data.bots[n]?.step} color={resolveColor(data.bots[n]?.color)} />
            {!compact && <DeskDecor seat={seat} items={data.bots[n]?.desk} name={n} trophies={data.stats?.[n]?.got?.length || 0} color={resolveColor(data.bots[n]?.color)} />}
            {data.bots[n]?.birthday === today && <Cake seat={seat} />}
          </group>
        )
      })}
      {/* lights stay mounted (intensity 0 by day): adding/removing lights recompiles every shader */}
      {false &&
        layout.rows.slice(0, 2).map((r, i) => (
          <pointLight key={i} position={[(r.x1 + r.x2) / 2, 2.6, r.z + 0.6]} intensity={night && !allResting ? 5 : 0} distance={7} decay={1.5} color="#ffe2b8" />
        ))}

      {/* bots hidden in the Grok app are not drawn: only their empty seat remains */}
      {home.filter((n) => !data.bots[n]?.hidden).map((n) => (
        <Bot
          key={n}
          bot={data.bots[n]}
          status={effStatus(data.bots[n], now)}
          layout={layout}
          seat={seatOf[n]}
          role="home"
          names={home}
          data={simData}
          floorY={floorY}
          floorKey={floor.key}
          night={night}
          selected={selectedBot === n}
          spotlight={spotlight === n}
          onSelect={onSelect}
          onLongPress={onLongPress}
          compact={compact}
        />
      ))}
      {visitors.map((n) => (
        <Bot
          key={`v:${n}`}
          bot={data.bots[n]}
          status={effStatus(data.bots[n], now)}
          layout={layout}
          seat={null}
          role="visit"
          names={home}
          data={simData}
          floorY={floorY}
          floorKey={floor.key}
          night={night}
          selected={selectedBot === n}
          spotlight={spotlight === n}
          onSelect={onSelect}
          onLongPress={onLongPress}
        />
      ))}
    </group>
  )
}

export { MATS }
