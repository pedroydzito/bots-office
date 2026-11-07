import { useCallback, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import Bot from './Bot'
import {
  Bookshelf, Chair, Clock, CoffeeCorner, DeskRow, Elevator, Lounge, MATS, Plant, Railing,
  StickyWall, TVScreen, WallTitle, WaterCooler, Workstation,
} from './Props'
import { talkSpots } from './layout'
import { effStatus, talkActive } from '../lib/constants'
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
      <WallTitle title={title} subtitle={subtitle} position={[-W / 2 + 7.6, 2.45, -D / 2 + 0.26]} />
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

export default function Floor({ floor, layout, data, now, floorY, night, selectedBot, spotlight, onSelect }) {
  const { W, D } = layout
  const home = floor.bots
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

  const plan = {}
  for (const n of home) {
    const out = data.talks[n]
    if (out && talkActive(out, now) && data.bots[out.to]) {
      if (homeSet.has(out.to)) {
        const k = byTarget[out.to].indexOf(n)
        plan[n] = { goal: talkSpots(seatOf[out.to], k).visitor, talkView: { role: 'visitor', partner: out.to, step: out.step, seed: seedOf(n) }, since: out.t }
      } else {
        plan[n] = { goal: { ...layout.elevator, hideOnArrive: true }, talkView: null, since: out.t }
      }
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

  return (
    <group>
      <Shell layout={layout} title={floor.name} subtitle={`Floor ${floor.num}`} />
      <Clock position={[-W / 2 + 2.3, 2.45, -D / 2 + 0.28]} />
      <CoffeeCorner position={[-W / 2 + 3.2, 0, -D / 2 + 0.52]} />
      <TVScreen
        position={[W / 2 - 3.8, 1.95, -D / 2 + 0.3]}
        label="EVENTS / 24 MIN"
        getValue={() => eventsSeries().reduce((a, b) => a + b, 0)}
        getSeries={eventsSeries}
        night={night}
      />
      <Plant position={[-W / 2 + 0.75, 0, -D / 2 + 0.75]} scale={1.15} />
      <Plant position={[W / 2 - 1.0, 0, -D / 2 + 0.9]} scale={1.3} kind={1} />
      <Plant position={[W / 2 - 1.0, 0, -D / 2 + 6.5]} scale={0.9} />
      <Plant position={[-W / 2 + 0.75, 0, D / 2 - 1.0]} scale={1.0} kind={1} />
      <WaterCooler position={[-W / 2 + 0.6, 0, -D / 2 + 4.6]} rotation={[0, Math.PI / 2, 0]} />
      <StickyWall position={[-W / 2 + 0.27, 1.2, -D / 2 + 7.2]} rotation={[0, Math.PI / 2, 0]} />
      <Bookshelf position={[-W / 2 + 0.47, 0, D / 2 - 6.4]} rotation={[0, Math.PI / 2, 0]} seed={floor.num} />
      <Lounge position={[W / 2 - 2.7, 0, D / 2 - 2.5]} night={night} />
      <Railing W={W} D={D} />
      <Elevator layout={layout} floorY={floorY} night={night} />

      {layout.rows.map((r, i) => (
        <DeskRow key={i} row={r} />
      ))}
      {home.map((n, i) => {
        const seat = layout.seats[i]
        if (!seat) return null
        return (
          <group key={n}>
            <Chair x={seat.x} z={seat.z} />
            <Workstation seat={seat} idx={i} status={effStatus(data.bots[n], now)} night={night} />
          </group>
        )
      })}
      {night &&
        layout.rows.map((r, i) => (
          <pointLight key={i} position={[(r.x1 + r.x2) / 2, 2.6, r.z + 0.6]} intensity={5} distance={7} decay={1.5} color="#ffe2b8" />
        ))}

      {home.map((n) => {
        const pl = plan[n]
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
            floorY={floorY}
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
        let goal, talkView = null
        if (!v.leaving && t && seatOf[t.to]) {
          const k = (byTarget[t.to] || []).indexOf(n)
          goal = talkSpots(seatOf[t.to], Math.max(0, k)).visitor
          talkView = { role: 'visitor', partner: t.to, step: t.step, seed: seedOf(n) }
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
            spawnAtGoal={!v.leaving && t && now - t.t > 12000}
            floorY={floorY}
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
