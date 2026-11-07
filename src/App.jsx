import { useCallback, useEffect, useMemo, useState } from 'react'
import Scene from './scene/Scene'
import { buildingSize, floorLayout } from './scene/layout'
import { sceneSignals } from './scene/registry'
import { dataStore, deriveFloors, loadTopic, ingest } from './lib/state'
import { useNow, useStore } from './lib/createStore'
import { chatLink, CORTEX_KEY, effStatus, talkActive } from './lib/constants'
import { connectNtfy, validTopic } from './lib/ntfy'
import { demoApprove, startDemo } from './lib/demo'
import { Activity, Brand, ConnectBanner, Hints, LeftPanel, ModeToggles, Pills, RightPanel, Toast, Weekly } from './ui/Panels'

function readTopic() {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, '')).trim()
  return validTopic(h) ? h : null
}

function openLink(link) {
  if (!link) return
  if (/^https:\/\//i.test(link)) window.open(link, '_blank', 'noopener,noreferrer')
  else window.location.href = link
}

export default function App() {
  const [topic, setTopic] = useState(readTopic)
  const [conn, setConn] = useState(topic ? 'syncing' : 'demo')
  const [night, setNight] = useState(() => {
    const h = new Date().getHours()
    return h >= 19 || h < 6
  })
  const [tour, setTour] = useState(false)
  const [floorKey, setFloorKey] = useState(null)
  const [selectedBot, setSelectedBot] = useState(null)
  const [spotlight, setSpotlight] = useState(null)
  const [dismissed, setDismissed] = useState({})

  const data = useStore(dataStore)
  const now = useNow(2000)

  // ---- data source: ntfy topic from the URL hash, or demo mode
  useEffect(() => {
    const onHash = () => setTopic(readTopic())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    loadTopic(topic)
    if (topic) {
      setConn('syncing')
      return connectNtfy(topic, { onMessages: ingest, onStatus: setConn })
    }
    setConn('demo')
    return startDemo()
  }, [topic])

  // ---- floors
  const sig = data.order.map((n) => n + '\u0001' + data.bots[n]?.team).join('\u0002')
  const floors = useMemo(() => {
    const f = deriveFloors(dataStore.get())
    return [...f, { key: CORTEX_KEY, name: 'Cortex', num: f.length + 1, bots: [] }]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  const size = useMemo(() => buildingSize(Math.max(1, ...floors.map((f) => f.bots.length))), [floors])
  const layouts = useMemo(() => Object.fromEntries(floors.map((f) => [f.key, floorLayout(f.bots.length, size.W, size.D)])), [floors, size])
  const selKey = floors.some((f) => f.key === floorKey) ? floorKey : floors[0]?.key
  const floorIdx = Math.max(0, floors.findIndex((f) => f.key === selKey))
  const floor = floors[floorIdx]

  const goFloor = useCallback((k) => {
    setFloorKey(k)
    setSelectedBot(null)
  }, [])

  // ---- derived counts
  const counts = { working: 0, waiting_user: 0, error: 0, resting: 0, done: 0, talks: 0 }
  for (const n of data.order) counts[effStatus(data.bots[n], now)]++
  const talks = Object.entries(data.talks).filter(([f, t]) => talkActive(t, now) && data.bots[f] && data.bots[t.to])
  counts.talks = talks.length
  const waiting = data.order.map((n) => data.bots[n]).filter((b) => effStatus(b, now) === 'waiting_user').sort((a, b) => b.ts - a.ts)
  const toastBot = waiting.find((b) => dismissed[b.name] !== b.ts) || null

  const pickBot = useCallback(
    (n) => {
      if (!n || !dataStore.get().bots[n]) return
      const s = dataStore.get()
      // visiting another floor? follow them there
      const t = s.talks[n]
      let team = s.bots[n].team
      if (t && talkActive(t, Date.now()) && s.bots[t.to]) team = s.bots[t.to].team
      setFloorKey(team)
      setSelectedBot(n)
      setTour(false)
      sceneSignals.focusRequest = n
    },
    [],
  )

  const approve = useCallback(
    (n) => {
      const b = dataStore.get().bots[n]
      if (!b) return
      setDismissed((d) => ({ ...d, [n]: b.ts }))
      if (!topic) demoApprove(n)
      else openLink(chatLink(dataStore.get(), n))
    },
    [topic],
  )
  const view = useCallback(
    (n) => {
      pickBot(n)
      if (topic) openLink(chatLink(dataStore.get(), n))
    },
    [pickBot, topic],
  )

  // ---- keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const i = Math.max(0, Math.min(floors.length - 1, floorIdx + (e.key === 'ArrowUp' ? 1 : -1)))
        goFloor(floors[i].key)
      } else if (e.key === 'Escape') setSelectedBot(null)
      else if (e.key === 't' || e.key === 'T') setTour((x) => !x)
      else if (e.key === 'n' || e.key === 'N') setNight((x) => !x)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [floors, floorIdx, goFloor])

  // ---- tour: glide through floors, spotlighting a busy bot
  useEffect(() => {
    if (!tour) {
      setSpotlight(null)
      return
    }
    setSelectedBot(null)
    let i = floorIdx
    const spot = () => {
      const s = dataStore.get()
      const f = floors[i]
      const cands = (f?.bots || []).filter((n) => s.bots[n]?.step && effStatus(s.bots[n], Date.now()) !== 'resting')
      setSpotlight(cands.length ? cands[Math.floor(Math.random() * cands.length)] : null)
    }
    spot()
    const a = setInterval(spot, 3500)
    const b = setInterval(() => {
      i = (i + 1) % floors.length
      setFloorKey(floors[i].key)
      spot()
    }, 11000)
    return () => {
      clearInterval(a)
      clearInterval(b)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, floors])

  const onUserMove = useCallback((wasd) => {
    setTour(false)
    if (wasd === true) setSelectedBot(null)
  }, [])

  return (
    <div className={`app ${night ? 'night' : ''}`}>
      <Scene
        floors={floors}
        selectedIdx={floorIdx}
        floorIdx={floorIdx}
        size={size}
        layouts={layouts}
        data={data}
        now={now}
        night={night}
        tour={tour}
        selectedBot={selectedBot}
        spotlight={spotlight}
        onSelect={pickBot}
        onPointerMissed={() => setSelectedBot(null)}
        onUserMove={onUserMove}
      />
      <div className="hud">
        <div className="top-left">
          <Brand conn={conn} now={now} />
          <ModeToggles night={night} setNight={setNight} tour={tour} setTour={setTour} />
        </div>
        <div className="top-center">
          <Pills counts={counts} />
          <Toast bot={toastBot} onView={() => view(toastBot.name)} onApprove={() => approve(toastBot.name)} />
        </div>
        <LeftPanel
          floors={floors}
          data={data}
          now={now}
          selectedKey={selKey}
          onFloor={goFloor}
          waiting={waiting}
          onApprove={approve}
          onPickBot={pickBot}
          talks={talks}
        />
        <RightPanel
          floor={floor}
          data={data}
          now={now}
          onPickBot={pickBot}
          selectedBot={selectedBot}
          onClose={() => setSelectedBot(null)}
          chatOf={(n) => chatLink(data, n)}
          onApprove={approve}
        />
        <Activity data={data} onPick={pickBot} />
        <Weekly usage={data.usage} data={data} />
        <div className="bottom-center">
          {!topic && <ConnectBanner />}
          <Hints />
        </div>
      </div>
    </div>
  )
}
