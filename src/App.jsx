import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Scene from './scene/Scene'
import { cortexLayout, floorLayout, naturalSize } from './scene/layout'
import { botPositions, ridePositions, sceneSignals } from './scene/registry'
import { world } from './scene/sim'
import { dataStore, deriveFloors, forgetTopic, loadTopic, ingest } from './lib/state'
import { useNow, useStore } from './lib/createStore'
import { chatLink, CORTEX_KEY, effStatus, resolveColor, talkActive } from './lib/constants'
import { connectNtfy } from './lib/ntfy'
import { captureHash, clearCode, getCode, setCode } from './lib/auth'
import { demoApprove, startDemo } from './lib/demo'
import { Activity, Brand, ConnectBanner, Hints, LeftPanel, ModeToggles, Pills, RightPanel, Toast, Weekly } from './ui/Panels'
import { Login, Settings } from './ui/Login'
import { Celebration, MobileFloors, Search, Timeline, TvExit } from './ui/Extras'
import { OVERVIEW_GAP } from './scene/Building'
import { FLOOR_H } from './scene/layout'
import { botsAt } from './lib/metrics'
import { notifyWaiting, prefs } from './lib/notify'
import { startAmbience, updateAmbience } from './lib/ambience'

function openLink(link) {
  if (!link) return
  if (/^https:\/\//i.test(link)) window.open(link, '_blank', 'noopener,noreferrer')
  else window.location.href = link
}

export default function App() {
  // The access code is the ntfy topic. It lives only in localStorage.
  const [code, setCodeState] = useState(() => captureHash() || getCode())
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    const onHash = () => {
      const c = captureHash()
      if (c) {
        setCodeState(c)
        setDemo(false)
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const signIn = useCallback((c) => {
    setCode(c)
    setCodeState(c)
    setDemo(false)
  }, [])
  const signOut = useCallback(() => {
    if (code) forgetTopic(code)
    clearCode()
    setCodeState(null)
    setDemo(false)
  }, [code])
  const toLogin = useCallback(() => setDemo(false), [])

  if (!code && !demo) return <Login onSubmit={signIn} onDemo={() => setDemo(true)} />
  return <Office key={code || 'demo'} topic={code} onSignOut={signOut} onSignIn={toLogin} />
}

function Office({ topic, onSignOut, onSignIn }) {
  const [conn, setConn] = useState(topic ? 'syncing' : 'demo')
  // light: 'auto' follows the real local time (dawn/dusk tones), or forced day/night
  const [lightMode, setLightMode] = useState(() => prefs.get('light', 'auto'))
  useEffect(() => prefs.set('light', lightMode), [lightMode])
  const [replayT, setReplayT] = useState(null) // timeline replay (ms) or null = live
  const [tv, setTv] = useState(false)
  const [celebration, setCelebration] = useState(null)
  const [overview, setOverview] = useState(false) // whole building, every floor live
  const [searchOpen, setSearchOpen] = useState(false)
  const [tour, setTour] = useState(false)
  const [floorKey, setFloorKey] = useState(null)
  const [selectedBot, setSelectedBot] = useState(null)
  const [spotlight, setSpotlight] = useState(null)
  const [dismissed, setDismissed] = useState({})

  const live = useStore(dataStore)
  const now = useNow(2000)
  // replaying the timeline shows the office as it was at that moment
  const data = useMemo(() => (replayT ? { ...live, bots: botsAt(live, replayT), talks: {} } : live), [live, replayT])
  const nightness = lightMode === 'night' ? 1 : lightMode === 'day' ? 0 : autoNightness(new Date(now))
  const night = nightness > 0.5
  const setNight = (v) => setLightMode(v === 'auto' ? 'auto' : v ? 'night' : 'day')

  // ---- data source: ntfy topic (signed in) or demo mode
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
  const sig = data.order.map((n) => n + '\u0001' + data.bots[n]?.team + '\u0001' + data.bots[n]?.color).join('\u0002')
  const floors = useMemo(() => {
    const st = dataStore.get()
    const f = deriveFloors(st).map((fl) => {
      // team color = most common bot color on the floor
      const count = {}
      for (const n of fl.bots) {
        const c = resolveColor(st.bots[n]?.color)
        count[c] = (count[c] || 0) + 1
      }
      const color = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || '#959595'
      return { ...fl, color }
    })
    return [...f, { key: CORTEX_KEY, name: 'Cortex', num: f.length + 1, bots: [], color: '#F93498' }]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  const layouts = useMemo(
    () => {
      // every storey has the size of the largest room
      let W = 13, D = 12
      for (const f of floors) if (f.key !== CORTEX_KEY) {
        const n = naturalSize(f.bots.length)
        W = Math.max(W, n.W)
        D = Math.max(D, n.D)
      }
      return Object.fromEntries(floors.map((f) => [f.key, f.key === CORTEX_KEY ? cortexLayout(W, D) : floorLayout(f.bots.length, W, D)]))
    },
    [floors],
  )
  const size = useMemo(() => {
    const ls = Object.values(layouts)
    return { W: Math.max(...ls.map((l) => l.W)), D: Math.max(...ls.map((l) => l.D)) }
  }, [layouts])
  // default: the top team floor (first team of the roster), right under the Cortex
  const selKey = floors.some((f) => f.key === floorKey) ? floorKey : (floors[floors.length - 2] || floors[0])?.key
  const floorIdx = Math.max(0, floors.findIndex((f) => f.key === selKey))
  const floor = floors[floorIdx]
  const lay = layouts[floor?.key]

  // Following a bot: when it disappears into the elevator, ride along to the floor it comes out on.
  const selKeyRef = useRef(selKey)
  selKeyRef.current = selKey
  useEffect(() => {
    if (!selectedBot) return
    const id = setInterval(() => {
      const s = dataStore.get()
      const b = s.bots[selectedBot]
      if (!b) return
      const t = s.talks[selectedBot]
      const away = t && talkActive(t, Date.now()) && s.bots[t.to] && s.bots[t.to].team !== b.team
      const want = away ? s.bots[t.to].team : b.team
      if (want !== selKeyRef.current && !botPositions.has(selectedBot) && !ridePositions.has(selectedBot)) {
        setFloorKey(want)
        sceneSignals.focusRequest = selectedBot
      }
    }, 400)
    return () => clearInterval(id)
  }, [selectedBot])
  const focus = useMemo(() => {
    if (overview) {
      const h = floors.length * (FLOOR_H + OVERVIEW_GAP)
      return { x: 0, z: 0, y: h / 2 - 1, dist: Math.max(30, h * 1.35) }
    }
    if (!lay) return { x: 0, z: 0, dist: 12 }
    // the room hugs the building's back-left corner (see Building)
    return { x: lay.focus.x - (size.W - lay.W) / 2, z: lay.focus.z - (size.D - lay.D) / 2, dist: lay.dist }
  }, [lay, size, overview, floors.length])

  // The shared simulation needs to know who sits where on which floor (identical on every screen).
  useMemo(() => {
    const map = {}
    floors.forEach((f, idx) => {
      const lay = layouts[f.key]
      f.bots.forEach((n, k) => (map[n] = { floorIdx: idx, seat: lay.seats[k], layout: lay }))
    })
    world.seatOf = (n) => map[n] || null
    world.floorsCount = floors.length
  }, [floors, layouts])

  const goFloor = useCallback((k) => {
    setOverview(false)
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
      setOverview(false)
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
      else if (e.key === 'n' || e.key === 'N') setLightMode((m) => (m === 'night' ? 'day' : 'night'))
      else if (e.key === 'f' || e.key === 'F') setTv((x) => !x)
      else if (e.key === 'b' || e.key === 'B') setOverview((x) => !x)
      else if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
        e.preventDefault()
        setSearchOpen(true)
      }
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

  // browser notification (+ optional sound) when a bot starts waiting on you
  const prevWaiting = useRef(null)
  useEffect(() => {
    const w = new Set(live.order.filter((n) => effStatus(live.bots[n], Date.now()) === 'waiting_user'))
    if (prevWaiting.current) for (const n of w) if (!prevWaiting.current.has(n)) notifyWaiting(live.bots[n], () => pickBot(n))
    prevWaiting.current = w
  }, [live, pickBot])

  // ambient sound follows the office (browsers only allow it after a click, so it resumes on first click)
  useEffect(() => {
    updateAmbience({ workingCount: counts.working, weather: live.weather?.kind })
  })
  useEffect(() => {
    if (!prefs.get('ambience', false)) return
    const start = () => startAmbience()
    window.addEventListener('pointerdown', start, { once: true })
    return () => window.removeEventListener('pointerdown', start)
  }, [])

  // celebrate when a whole floor has finished everything
  const prevAllDone = useRef(null)
  useEffect(() => {
    const done = new Set(floors.filter((f) => f.bots.length > 1 && f.bots.every((n) => effStatus(live.bots[n], Date.now()) === 'done')).map((f) => f.key))
    if (prevAllDone.current) for (const k of done) if (!prevAllDone.current.has(k)) setCelebration({ key: k, name: k, t: Date.now() })
    prevAllDone.current = done
  }, [live, floors])
  useEffect(() => {
    if (!celebration) return
    const id = setTimeout(() => setCelebration(null), 6000)
    return () => clearTimeout(id)
  }, [celebration])

  // TV mode: full screen, no panels, guided tour
  useEffect(() => {
    if (tv) {
      setTour(true)
      document.documentElement.requestFullscreen?.().catch(() => {})
    } else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [tv])
  useEffect(() => {
    const onFs = () => !document.fullscreenElement && setTv(false)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const onUserMove = useCallback((wasd) => {
    setTour(false)
    if (wasd === true) setSelectedBot(null)
  }, [])

  return (
    <div className={`app ${night ? 'night' : ''} ${tv ? 'tv' : ''}`}>
      <Scene
        floors={floors}
        selectedIdx={floorIdx}
        floorIdx={floorIdx}
        focus={focus}
        size={size}
        layouts={layouts}
        data={data}
        now={now}
        night={night}
        nightness={nightness}
        weather={live.weather?.kind || null}
        celebrate={celebration}
        overview={overview}
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
          <ModeToggles mode={lightMode} setMode={setLightMode} tour={tour} setTour={setTour} overview={overview} setOverview={setOverview} onSearch={() => setSearchOpen(true)} />
          <Settings live={!!topic} onSignOut={onSignOut} onSignIn={onSignIn} onTv={() => setTv(true)} />
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
          {!topic && !replayT && <ConnectBanner onSignIn={onSignIn} />}
          <Timeline history={live.history} value={replayT} onChange={setReplayT} />
          <Hints />
        </div>
        <MobileFloors floors={floors} data={data} now={now} selectedKey={selKey} onFloor={goFloor} />
        <Celebration c={celebration} />
        {searchOpen && <Search data={data} now={now} onPick={(n) => { setOverview(false); pickBot(n) }} onClose={() => setSearchOpen(false)} />}
      </div>
      {tv && <TvExit onExit={() => setTv(false)} />}
    </div>
  )
}

/** 0 = full day, 1 = full night, with dawn (5:30–7:00) and dusk (17:30–19:30) in between. */
function autoNightness(d) {
  const h = d.getHours() + d.getMinutes() / 60
  if (h >= 7 && h <= 17.5) return 0
  if (h > 17.5 && h < 19.5) return (h - 17.5) / 2
  if (h > 5.5 && h < 7) return 1 - (h - 5.5) / 1.5
  return 1
}
