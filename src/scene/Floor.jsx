import { useCallback, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import Bot from './Bot'
import Pet from './Pet'
import Confetti from './Confetti'
import {
  BeanBag, Bookshelf, Cake, Chair, Clock, CoffeeCorner, DeskDecor, DeskRow, GlassElevator, InfoBoard, Lounge, MATS, MeetingTable, Plant, Rug, StatusLamp, Whiteboard, Railing,
  StickyWall, TVScreen, WallTitle, WaterCooler, Workstation,
} from './Props'
import { FLOOR_H, talkSpots } from './layout'
import { lastRide } from './registry'
import { effStatus, STATUS, talkActive } from '../lib/constants'
import { botMetrics } from '../lib/metrics'
import { dataStore } from '../lib/state'

const wallMat = new THREE.MeshStandardMaterial({ color: '#f3f3f5', roughness: 0.9 })
const floorMat = new THREE.MeshStandardMaterial({ color: '#eceef1', roughness: 0.75 })
const slabMat = new THREE.MeshStandardMaterial({ color: '#e2e4e8', roughness: 0.8 })

export function Shell({ layout, title, subtitle }) {
  const { W, D } = layout
  return (
    <group>
      <mesh position={[0, -0.175, 0]} material={slabMat} receiveShadow>
        <boxGeometry args={[W, 0.35, D]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} material={floorMat} receiveShadow>
        <planeGeometry args={[W, D]} />
      </mesh>
      <mesh position={[0, 1.6, -D / 2 + 0.125]} material={wallMat} receiveShadow castShadow>
        <boxGeometry args={[W, 3.2, 0.25]} />
      </mesh>
      <mesh position={[-W / 2 + 0.125, 1.6, 0]} material={wallMat} receiveShadow castShadow>
        <boxGeometry args={[0.25, 3.2, D]} />
      </mesh>
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

export default function Floor({ floor, layout, data, now, floorY, night, selectedBot, spotlight, onSelect, floorCount = 1, celebrate = null }) {
  const { W, D } = layout
  const home = floor.bots
  const floorIdx = floor.num - 1
  const homeSet = useMemo(() => new Set(home), [home])
  const seatOf = useMemo(() => {
    const m = {}
    home.forEach((n, i) => (m[n] = layout.seats[i]))
    return m
  }, [home, layout])

  // ---- conversations
  const active = Object.entries(data.talks).filter(([f, t]) => talkActive(t, now) && data.bots[f] && data.bots[t.to])
  const byTarget = {}
  for (const [f, t] of active) (byTarget[t.to] ||= []).push(f)
  Object.values(byTarget).forEach((l) => l.sort())
  const seedOf = (s) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0)

  // Meetings: when 3+ bots talk to the same bot, everyone gathers in a circle by the windows
  const meetCenter = layout.meet
  const meetingOf = (host) => {
    const people = [host, ...(byTarget[host] || [])]
    return people.length >= 3 ? people : null
  }
  const meetSpot = (people, who) => {
    const i = people.indexOf(who), k = people.length
    const a = (i / k) * Math.PI * 2 + Math.PI / 2
    const r = 0.55 + k * 0.12
    const x = meetCenter.x + Math.cos(a) * r, z = meetCenter.z + Math.sin(a) * r
    return { kind: 'spot', x, z, az: z, yaw: Math.atan2(meetCenter.x - x, meetCenter.z - z) }
  }

  const plan = {}
  for (const n of home) {
    const out = data.talks[n]
    if (out && talkActive(out, now) && data.bots[out.to]) {
      const mt = homeSet.has(out.to) && meetingOf(out.to)
      if (mt) {
        plan[n] = { goal: meetSpot(mt, n), talkView: { role: 'visitor', partner: out.to, step: out.step, seed: seedOf(n), meeting: true }, since: out.t }
      } else if (homeSet.has(out.to)) {
        const k = byTarget[out.to].indexOf(n)
        plan[n] = { goal: talkSpots(seatOf[out.to], k).visitor, talkView: { role: 'visitor', partner: out.to, step: out.step, seed: seedOf(n) }, since: out.t }
      } else {
        plan[n] = { goal: { ...layout.elevator, hideOnArrive: true }, talkView: null, since: out.t }
      }
    } else if (byTarget[n] && meetingOf(n)) {
      const f = byTarget[n][0]
      plan[n] = { goal: meetSpot(meetingOf(n), n), talkView: { role: 'host', partner: f, step: data.talks[f].step, seed: seedOf(f), meeting: true }, since: data.talks[f].t }
    } else if (byTarget[n]) {
      const f = byTarget[n][0]
      plan[n] = { goal: talkSpots(seatOf[n]).host, talkView: { role: 'host', partner: f, step: data.talks[f].step, seed: seedOf(f) }, since: data.talks[f].t }
    }
  }

  const activeVisitors = active.filter(([f, t]) => homeSet.has(t.to) && !homeSet.has(f)).map(([f]) => f)
  const visitorsKey = activeVisitors.sort().join('|')
  const [visitors, setVisitors] = useState(() => Object.fromEntries(activeVisitors.map((n) => [n, { leaving: false }])))
  useEffect(() => {
    setVisitors((prev) => {
      const next = {}
      for (const n of activeVisitors) next[n] = { leaving: false }
      for (const n of Object.keys(prev)) if (!next[n]) next[n] = { leaving: true }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitorsKey])
  const gone = useCallback((n) => setVisitors((p) => {
    if (!p[n] || !p[n].leaving) return p
    const c = { ...p }
    delete c[n]
    return c
  }), [])

  // ---- room status (door sign), wall boards, achievements, sleep-lights
  const sts = home.map((n) => effStatus(data.bots[n], now))
  const floorColor = sts.includes('error') ? STATUS.error.color : sts.includes('waiting_user') ? STATUS.waiting_user.color : sts.includes('working') ? STATUS.working.color : '#9aa0aa'
  const waitingLines = Object.values(data.bots)
    .filter((b) => effStatus(b, now) === 'waiting_user')
    .slice(0, 6)
    .map((b) => ({ a: b.name, b: b.step || 'Precisa do seu OK' }))
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
  const allResting = sts.length > 0 && sts.every((s) => s === 'resting')
  const today = (() => {
    const d = new Date(now)
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  return (
    <group>
      <Shell layout={layout} title={floor.name} subtitle={`Andar ${floor.num}`} />
      <Clock position={[-W / 2 + 1.55, 2.45, -D / 2 + 0.28]} />
      <CoffeeCorner position={[-W / 2 + 3.0, 0, -D / 2 + 0.52]} />
      <TVScreen
        position={[W / 2 - 2.5, 1.4, -D / 2 + 0.3]}
        label="EVENTOS / 24 MIN"
        getValue={() => eventsSeries().reduce((a, b) => a + b, 0)}
        getSeries={eventsSeries}
        night={night}
      />
      <Plant position={[-W / 2 + 0.75, 0, -D / 2 + 0.75]} scale={1.15} />
      <Plant position={[W / 2 - 1.0, 0, -D / 2 + 0.9]} scale={1.3} kind={1} />
      {D > 12 && <Plant position={[W / 2 - 0.9, 0, -D / 2 + 5.5]} scale={0.9} />}
      <Plant position={[-W / 2 + 0.7, 0, D / 2 - 0.7]} scale={0.9} kind={1} />
      <WaterCooler position={[-W / 2 + 0.6, 0, layout.wall.coolerZ]} rotation={[0, Math.PI / 2, 0]} />
      {layout.wall.shelfZ != null && <Bookshelf position={[-W / 2 + 0.47, 0, layout.wall.shelfZ]} rotation={[0, Math.PI / 2, 0]} seed={floor.num} />}
      <Lounge position={[W / 2 - 2.4, 0, D / 2 - 2.3]} night={night} seats={layout.pois.filter((q) => q.kind === 'sofa')} />
      <GlassElevator layout={layout} night={night} floorY={floorY} />
      {layout.decor.map((d, i) =>
        d.type === 'rug' ? <Rug key={i} {...d} /> :
        d.type === 'meeting' ? <MeetingTable key={i} x={d.x} z={d.z} /> :
        d.type === 'whiteboard' ? <Whiteboard key={i} x={d.x} z={meetCenter.z - 1.75} /> :
        d.type === 'beanbag' ? <BeanBag key={i} x={d.x} z={d.z} c={d.c} /> :
        d.type === 'plant' ? <Plant key={i} position={[d.x, 0, d.z]} kind={d.k} scale={1.1} /> : null,
      )}
      <StatusLamp position={[-W / 2 + 2.95, 2.3, -D / 2 + 0.3]} color={floorColor} />
      <InfoBoard
        position={[(-W / 2 + 6.9 + W / 2 - 3.7) / 2, 1.75, -D / 2 + 0.29]}
        title="Esperando por mim"
        cork
        accent="#F5A524"
        empty="Nada pendente"
        lines={waitingLines}
      />
      {layout.wall.stickyZ != null && (
        <InfoBoard
          position={[-W / 2 + 0.29, 1.6, layout.wall.stickyZ - 0.4]}
          rotation={[0, Math.PI / 2, 0]}
          title="Destaques de hoje"
          accent="#8F59F9"
          empty="Sem atividade ainda"
          lines={highlights}
        />
      )}

      {layout.rows.map((r, i) => (
        <DeskRow key={i} row={r} />
      ))}
      <Pet layout={layout} floorIdx={floorIdx} floorCount={floorCount} />
      {celebrate &&
        layout.seats.slice(0, home.length).map((st, i) => (
          <group key={`${celebrate}-${i}`} position={[st.x, 1.2, st.z]}>
            <Confetti y={0.4 + (i % 3) * 0.2} />
          </group>
        ))}
      {home.map((n, i) => {
        const seat = layout.seats[i]
        if (!seat) return null
        return (
          <group key={n}>
            <Chair x={seat.x} z={seat.z} owner={n} />
            <Workstation seat={seat} idx={i} status={effStatus(data.bots[n], now)} night={night} />
            <DeskDecor seat={seat} items={data.bots[n]?.desk} name={n} />
            {data.bots[n]?.birthday === today && <Cake seat={seat} />}
          </group>
        )
      })}
      {night && !allResting &&
        layout.rows.slice(0, 2).map((r, i) => (
          <pointLight key={i} position={[(r.x1 + r.x2) / 2, 2.6, r.z + 0.6]} intensity={5} distance={7} decay={1.5} color="#ffe2b8" />
        ))}

      {home.map((n) => {
        const pl = plan[n]
        const rd = lastRide(n)
        return (
          <Bot
            key={n}
            bot={data.bots[n]}
            status={effStatus(data.bots[n], now)}
            layout={layout}
            seat={seatOf[n]}
            goal={pl?.goal || null}
            talkView={pl?.talkView || null}
            spawnAtGoal={!!pl && now - pl.since > 12000}
            appearAt={rd && rd.to === floorIdx ? rd.end : 0}
            floorY={floorY}
            floorKey={floor.key}
            night={night}
            selected={selectedBot === n}
            spotlight={spotlight === n}
            onSelect={onSelect}
          />
        )
      })}
      {Object.entries(visitors).map(([n, v]) => {
        const b = data.bots[n]
        const t = data.talks[n]
        if (!b) return null
        const rd = lastRide(n)
        let goal, talkView = null
        if (!v.leaving && t && seatOf[t.to]) {
          const k = (byTarget[t.to] || []).indexOf(n)
          const mt = meetingOf(t.to)
          goal = mt ? meetSpot(mt, n) : talkSpots(seatOf[t.to], Math.max(0, k)).visitor
          talkView = { role: 'visitor', partner: t.to, step: t.step, seed: seedOf(n), meeting: !!mt }
        } else goal = { ...layout.elevator, goneOnArrive: true }
        return (
          <Bot
            key={`v:${n}`}
            bot={b}
            status={effStatus(b, now)}
            layout={layout}
            seat={null}
            goal={goal}
            talkView={talkView}
            spawnAtGoal={!v.leaving && t && now - t.t > 25000}
            appearAt={rd && rd.to === floorIdx ? rd.end : 0}
            floorY={floorY}
            floorKey={floor.key}
            night={night}
            selected={selectedBot === n}
            spotlight={spotlight === n}
            onSelect={onSelect}
            onGone={() => gone(n)}
          />
        )
      })}
    </group>
  )
}

export { MATS }
