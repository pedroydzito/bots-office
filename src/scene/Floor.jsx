import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import Bot from './Bot'
import MailFlights from './Mail'
import Seasonal from './Seasonal'
import { hash } from './sim'
import Pet from './Pet'
import Confetti from './Confetti'
import StaticMerge from './StaticMerge'

let mergeGen = 0
import {
  Aquarium, Arcade, Bench, MeetingTopic, PoolTable, DESK_FINISH, ExecDesk, isVip, Foosball, PingPong, SoloSetup, Armchair, BeanBag, Poster, WallShelf, Bookshelf, FloorLamp, Printer, Vending, Cake, Chair, Clock, CoffeeCorner, DeskDecor, DeskRow, GlassElevator, InfoBoard, Lounge, MATS, MeetingTable, Plant, Rug, StatusLamp, Whiteboard, Railing,
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

export function Shell({ layout, title, subtitle, accent }) {
  const { W, D } = layout
  return (
    <group>
      {/* a hair smaller than the storey slab: equal faces flickered (z-fighting) on the building side */}
      <mesh position={[0, -0.18, 0]} material={slabMat}>
        <boxGeometry args={[W - 0.04, 0.34, D - 0.04]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} material={floorMat} receiveShadow>
        <planeGeometry args={[W, D]} />
      </mesh>
      <mesh position={[0, 1.6, -D / 2 + 0.125]} material={wallMat} receiveShadow castShadow>
        <boxGeometry args={[W, 3.2, 0.25]} />
      </mesh>
      <mesh position={[-W / 2 + 0.125, 1.6, 0]} material={wallMat} receiveShadow castShadow>
        <boxGeometry args={[0.25, 3.2, D]} />
      </mesh>
      {/* baseboards */}
      <mesh position={[0, 0.06, -D / 2 + 0.265]} material={wallMat}>
        <boxGeometry args={[W, 0.12, 0.03]} />
      </mesh>
      <mesh position={[-W / 2 + 0.265, 0.06, 0]} material={wallMat}>
        <boxGeometry args={[0.03, 0.12, D]} />
      </mesh>
      {/* a single vertical line in the team colour, as tall as the floor name */}
      {accent && (
        <mesh position={[-W / 2 + 3.1, 2.355, -D / 2 + 0.262]} material={bandMat(accent)}>
          <boxGeometry args={[0.05, 0.34, 0.01]} />
        </mesh>
      )}
      <WallTitle title={title} subtitle={subtitle} position={[-W / 2 + 5.0, 2.28, -D / 2 + 0.26]} />
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
  const petKind = look.pet && !compact ? petKind0 : 'none'
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
    return out
  }, [data.talkLog, data.bots, homeSet, Math.floor(now / 5000)])
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
      <Shell layout={layout} title={floor.name} subtitle={`Andar ${floor.num}`} accent={look.accent ? floor.color : null} />
      <Clock position={[-W / 2 + 1.55, 2.45, -D / 2 + 0.28]} />
      <CoffeeCorner position={[-W / 2 + 3.0, 0, -D / 2 + 0.52]} />
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
      <Plant position={[-W / 2 + 0.75, 0, -D / 2 + 0.75]} scale={1.15} />
      {look.plants && <Plant position={[W / 2 - 1.0, 0, -D / 2 + 0.9]} scale={1.3} kind={1} />}
      {look.plants && D > 12 && <Plant position={[W / 2 - 0.9, 0, -D / 2 + 5.5]} scale={0.9} />}
      {look.plants && <Plant position={[-W / 2 + 0.7, 0, D / 2 - 0.7]} scale={0.9} kind={1} />}
      <WaterCooler position={[-W / 2 + 0.6, 0, layout.wall.coolerZ]} rotation={[0, Math.PI / 2, 0]} />
      {layout.wall.shelfZ != null && <Bookshelf position={[-W / 2 + 0.47, 0, layout.wall.shelfZ]} rotation={[0, Math.PI / 2, 0]} seed={floor.num} />}
      <Lounge position={[layout.lounge?.x ?? W / 2 - 2.4, 0, layout.lounge?.z ?? D / 2 - 2.3]} night={night} seats={layout.pois.filter((q) => q.kind === 'sofa' && Math.abs(q.x - (layout.lounge?.x ?? W / 2 - 2.4)) < 2 && Math.abs(q.z - (layout.lounge?.z ?? D / 2 - 2.3)) < 1.6)} />
      <GlassElevator layout={layout} night={night} floorY={floorY} />
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
      <group userData={{ dynamic: true }}>{look.seasonal && !compact && <Seasonal layout={layout} seed={floor.key} />}</group>
      {/* wall art keeps both walls lively: posters high above the left-wall furniture, art + shelf on the back wall */}
      {/* pictures sit in the gaps between the left-wall furniture, at one shared height */}
      {look.art && layout.wall.artZ.map((z, i) => (
        <Poster key={i} position={[-W / 2 + 0.27, 1.75, z]} rotation={[0, Math.PI / 2, 0]} seed={(hash(floor.key) % 97) + i * 3} w={0.85} h={1.05} />
      ))}
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
      </StaticMerge>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, night, floor.key, floor.name, floor.num, floor.color, floorY, petKind, home, look],
  )

  return (
    <group>
      {staticRoom}
      {layout.wall.stickyZ != null && (
        <InfoBoard
          position={[-W / 2 + 0.29, 1.75, layout.wall.boardZ]}
          rotation={[0, Math.PI / 2, 0]}
          title="Destaques de hoje"
          accent="#8F59F9"
          empty="Sem atividade ainda"
          lines={highlights}
        />
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
              <DeskDecor seat={{ x: 0, z: 0 }} items={data.bots[n]?.desk} name={n} trophies={data.stats?.[n]?.got?.length || 0} color={resolveColor(data.bots[n]?.color)} />
            </group>
          )
        return (
          <group key={n}>
            <Chair x={seat.x} z={seat.z} owner={n} hiddenOwner={data.bots[n]?.hidden ? n : null} />
            <Workstation seat={seat} idx={i} status={data.bots[n]?.hidden ? 'resting' : effStatus(data.bots[n], now)} night={night} step={data.bots[n]?.step} color={resolveColor(data.bots[n]?.color)} />
            <DeskDecor seat={seat} items={data.bots[n]?.desk} name={n} trophies={data.stats?.[n]?.got?.length || 0} color={resolveColor(data.bots[n]?.color)} />
            {data.bots[n]?.birthday === today && <Cake seat={seat} />}
          </group>
        )
      })}
      {/* lights stay mounted (intensity 0 by day): adding/removing lights recompiles every shader */}
      {!compact &&
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
