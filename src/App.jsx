import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
// the 3D bundle loads after the interface shell
const loadScene = () => import('./scene/Scene')
loadScene()
const Scene = lazy(loadScene)
import { cortexLayout, floorLayout, LEAD_RE, naturalSize } from './scene/layout'
import { botPositions, ridePositions, sceneSignals } from './scene/registry'
import { world } from './scene/sim'
import { dataStore, deriveFloors, forgetTopic, loadTopic, ingest } from './lib/state'
import { useNow, useStore } from './lib/createStore'
import { chatLink, CORTEX_KEY, effStatus, resolveColor, talkActive } from './lib/constants'
import { connectNtfy, publish } from './lib/ntfy'
import { captureHash, clearCode, getCode, isReadonly, rememberOffice, setCode } from './lib/auth'
import { demoApprove, startDemo } from './lib/demo'
import { Activity, Brand, ConnectBanner, Hints, LeftPanel, ModeToggles, Pills, RightPanel, Toast, Weekly } from './ui/Panels'
import { Login, Settings } from './ui/Login'
import { Celebration, MobileFloors, Search, Timeline, TvExit } from './ui/Extras'
import { EmptyOffice, HealthModal, LookModal, OfficesModal, QueueModal, SendStatus, ShortcutsModal } from './ui/Ops'
import { buzz, HoverTip, MiniMap, QuickMenu, SearchField, Welcome } from './ui/Interact'
import { FLOOR_H, OVERVIEW_GAP } from './scene/layout'
import { ACCENTS, DEFAULT_LOOK, lookStore } from './lib/look'
import { botsAt } from './lib/metrics'
import { notifyWaiting, prefs } from './lib/notify'
import { resumeAudio, startAmbience, startMusic, uiSound, updateAmbience } from './lib/ambience'

function openLink(link) {
  if (!link) return
  if (/^https:\/\//i.test(link)) window.open(link, '_blank', 'noopener,noreferrer')
  else window.location.href = link
}

export default function App() {
  // The access code is the ntfy topic. It lives only in localStorage.
  const [code, setCodeState] = useState(() => captureHash() || getCode())
  const [demo, setDemo] = useState(false)
  const [adding, setAdding] = useState(false)
  // offices used before the list existed: make sure the current one is in it
  useEffect(() => {
    if (code) rememberOffice(code)
  }, [code])

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
    setAdding(false)
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
  const toLogin = useCallback(() => (setDemo(false), setAdding(true)), [])

  const switchTo = useCallback((c) => {
    setCode(c)
    setCodeState(c)
    setDemo(false)
  }, [])
  if (adding || (!code && !demo)) return <Login onSubmit={signIn} onDemo={() => (setAdding(false), setDemo(true))} onCancel={adding && code ? () => setAdding(false) : null} />
  return <Office key={code || 'demo'} topic={code} onSignOut={signOut} onSignIn={toLogin} onSwitch={switchTo} />
}

function Office({ topic, onSignOut, onSignIn, onSwitch }) {
  // a view-only office can't approve, react or reply
  const readonly = !!topic && isReadonly(topic)
  const [conn, setConn] = useState(topic ? 'syncing' : 'demo')
  // light: 'auto' follows the real local time (dawn/dusk tones), or forced day/night
  const [lightMode, setLightMode] = useState(() => prefs.get('light', 'auto'))
  useEffect(() => prefs.set('light', lightMode), [lightMode])
  const [replayT, setReplayT] = useState(null) // timeline replay (ms) or null = live
  const [tv, setTv] = useState(() => new URLSearchParams(window.location.search).has('tv'))
  const [celebration, setCelebration] = useState(null)
  // one notice at a time: a request waiting on you always wins; the rest wait their turn
  const [notices, setNotices] = useState([])
  const pushNotice = useCallback((n) => setNotices((l) => [...l.filter((x) => x.t !== n.t || x.title !== n.title), n].slice(-6)), [])
  useEffect(() => {
    const on = () => pushNotice({ t: Date.now(), title: 'Atualizado agora', sub: 'Recuperamos o que aconteceu enquanto você estava fora' })
    window.addEventListener('botoffice:resynced', on)
    return () => window.removeEventListener('botoffice:resynced', on)
  }, [pushNotice])
  const [overview, setOverview] = useState(false) // whole building, every floor live
  const [searchOpen, setSearchOpen] = useState(false)
  const [tour, setTour] = useState(false)
  const [floorKey, setFloorKey] = useState(null)
  const [selectedBot, setSelectedBot] = useState(null)
  const [spotlight, setSpotlight] = useState(null)
  const [dismissed, setDismissed] = useState({})

  const live = useStore(dataStore)
  // office look: shared one from the topic (or this device's, for view-only links), live preview while editing
  const [lookPreview, setLookPreview] = useState(null)
  const look = useMemo(() => {
    const local = readonly ? prefs.get('look', null) : null
    return { ...DEFAULT_LOOK, ...(live.office?.look || {}), ...(local || {}), ...(lookPreview || {}) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.office?.look, lookPreview])
  useEffect(() => {
    lookStore.set(look)
    document.documentElement.style.setProperty('--accent', (ACCENTS[look.accentColor] || ACCENTS.roxo)[1])
  }, [look])
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
      let color = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || '#959595'
      // very dark / greyish team colours read as "disabled" on the floor list: lift them
      {
        const h = color.replace('#', '')
        const [r, g, bl] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl
        const sat = Math.max(r, g, bl) - Math.min(r, g, bl)
        if (lum < 0.18 || sat < 0.12) color = '#6E7BF2'
      }
      // a team lead (diretor, gestor, head...) gets the separate desk: put them first
      const lead = fl.bots.length >= 3 ? fl.bots.find((n) => LEAD_RE.test(n) && !st.bots[n]?.hidden) : null
      return { ...fl, color, lead: lead || null, bots: lead ? [lead, ...fl.bots.filter((n) => n !== lead)] : fl.bots }
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
      return Object.fromEntries(floors.map((f) => [f.key, f.key === CORTEX_KEY ? cortexLayout(W, D) : floorLayout(f.bots.length, W, D, { lead: !!f.lead, furniture: look.furniture })]))
    },
    [floors, look.furniture],
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
  useEffect(() => {
    if (toastBot || !notices.length) return
    const id = setTimeout(() => setNotices((l) => l.slice(1)), 5000)
    return () => clearTimeout(id)
  }, [toastBot, notices])

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

  // publish to the topic (live) or apply locally (demo)
  const [sendStatus, setSendStatus] = useState(null)
  const send = useCallback(
    (payload) => {
      if (topic) {
        setSendStatus({ state: 'sending', payload })
        publish(topic, payload).then((ok) => setSendStatus({ state: ok ? 'ok' : 'fail', payload }))
      } else ingest([{ id: `local-${Date.now()}-${Math.random()}`, time: Date.now(), payload }])
    },
    [topic],
  )
  // approve / reject (with an optional note): published as {"decision":...} for your automation
  const decide = useCallback(
    (n, action = 'approve', note = '') => {
      const b = dataStore.get().bots[n]
      if (!b || readonly) return
      setDismissed((d) => ({ ...d, [n]: b.ts }))
      send({ decision: { bot: n, action, note } })
      buzz(action === 'approve' ? 20 : [15, 40, 15])
      if (!topic) {
        if (action === 'approve') demoApprove(n)
        else send({ bot: n, status: 'idle', step: note ? `Recusado: ${note}` : 'Recusado' })
      }
    },
    [topic, readonly, send],
  )
  const approve = useCallback((n) => decide(n, 'approve', ''), [decide])
  const [queueOpen, setQueueOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [keysOpen, setKeysOpen] = useState(false)
  const [officesOpen, setOfficesOpen] = useState(false)
  const [officeCfg, setOfficeCfg] = useState(false)
  useEffect(() => {
    if (sendStatus?.state !== 'ok') return
    const id = setTimeout(() => setSendStatus(null), 1500)
    return () => clearTimeout(id)
  }, [sendStatus])
  const [quick, setQuick] = useState(null) // long-press menu on a bot
  // opening animation: the office fades in, then the interface arrives piece by piece
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setIntro(false), 2600)
    return () => clearTimeout(id)
  }, [])
  const [welcome, setWelcome] = useState(false)
  useEffect(() => {
    let seen = prefs.get('welcomed', false)
    try {
      seen ||= Object.keys(localStorage).some((k) => k.startsWith('bot-office:') && !k.includes('welcomed'))
    } catch {
      /* private mode */
    }
    if (seen) return prefs.set('welcomed', true)
    const id = setTimeout(() => setWelcome(true), 1200)
    return () => clearTimeout(id)
  }, [])
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
      else if (e.key === 'a' || e.key === 'A') setQueueOpen((x) => !x)
      else if (e.key === 'h' || e.key === 'H') setHealthOpen((x) => !x)
      else if (e.key === '?') setKeysOpen((x) => !x)
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
    if (!tour || tv) {
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
  }, [tour, floors, tv])

  // browser notification (+ optional sound) when a bot starts waiting on you
  const prevWaiting = useRef(null)
  const prevDone = useRef(null)
  useEffect(() => {
    const w = new Set(live.order.filter((n) => effStatus(live.bots[n], Date.now()) === 'waiting_user'))
    if (prevWaiting.current) for (const n of w) if (!prevWaiting.current.has(n)) {
      notifyWaiting(live.bots[n], () => pickBot(n))
      buzz([40, 60, 40])
    }
    // a soft chime when someone finishes (interface sounds on)
    const d = new Set(live.order.filter((n) => effStatus(live.bots[n], Date.now()) === 'done'))
    if (prevDone.current && prefs.get('uisound', true) && [...d].some((n) => !prevDone.current.has(n))) uiSound('done')
    prevDone.current = d
    prevWaiting.current = w
  }, [live, pickBot])

  // ambient sound follows the office (browsers only allow it after a click, so it resumes on first click)
  useEffect(() => {
    // only the floor on screen is heard (in the building view, everyone)
    const heard = overview ? counts.working : (floors[floorIdx]?.bots || []).filter((n) => !live.bots[n]?.hidden && effStatus(live.bots[n], now) === 'working').length
    updateAmbience({ workingCount: heard, weather: live.weather?.kind })
  }, [overview, counts.working, floorIdx, floors, live.bots, live.weather?.kind, Math.floor(now / 10000)])
  useEffect(() => {
    // browsers only allow audio after a gesture: resume saved choices on the first click
    // (any gesture works, and a context created too early is resumed on the next one)
    const start = () => {
      if (prefs.get('ambience', true)) startAmbience()
      if (prefs.get('music', false)) startMusic()
      resumeAudio()
    }
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) window.addEventListener(ev, start, { capture: true, passive: true })
    // quiet interface blips on every click (when enabled)
    const click = (e) => {
      if (!prefs.get('uisound', true)) return
      const el = e.target.closest?.('button, a[href], [role="button"]')
      if (!el) return
      uiSound(el.classList.contains('toggle') || el.getAttribute('aria-pressed') != null ? 'toggle' : el.getAttribute('aria-expanded') === 'false' ? 'open' : 'click')
    }
    window.addEventListener('click', click, true)
    return () => {
      for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) window.removeEventListener(ev, start, { capture: true })
      window.removeEventListener('click', click, true)
    }
  }, [])

  // celebrate when a whole floor has finished everything
  const prevAllDone = useRef(null)
  useEffect(() => {
    const done = new Set(floors.filter((f) => f.bots.length > 1 && f.bots.every((n) => effStatus(live.bots[n], Date.now()) === 'done')).map((f) => f.key))
    if (prevAllDone.current) for (const k of done) if (!prevAllDone.current.has(k)) {
      setCelebration({ key: k, name: k, t: Date.now() })
      pushNotice({ t: Date.now(), title: `${k} concluiu tudo!`, sub: 'Todos os bots do andar terminaram' })
    }
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

  // TV mode camera: cuts from bot to bot like a documentary, favouring whoever is doing something
  useEffect(() => {
    if (!tv) return
    let i = 0
    const cut = () => {
      const s = dataStore.get()
      const nowMs = Date.now()
      const score = (n) => {
        const st = effStatus(s.bots[n], nowMs)
        return (talkActive(s.talks[n], nowMs) ? 4 : 0) + (st === 'waiting_user' ? 3 : st === 'working' ? 2 : st === 'done' ? 1.5 : 0.5)
      }
      const ranked = [...s.order].filter((n) => s.bots[n]).sort((a, b) => score(b) - score(a))
      const pool = ranked.slice(0, Math.max(3, Math.ceil(ranked.length / 2)))
      if (!pool.length) return
      const n = pool[i++ % pool.length]
      const t = s.talks[n]
      setFloorKey(t && talkActive(t, nowMs) && s.bots[t.to] ? s.bots[t.to].team : s.bots[n].team)
      setSelectedBot(n)
      sceneSignals.focusRequest = n
    }
    cut()
    const id = setInterval(cut, 9000)
    return () => {
      clearInterval(id)
      setSelectedBot(null)
    }
  }, [tv])

  // achievement unlocked -> a short banner
  const prevUnlocks = useRef(null)
  const [unlock, setUnlock] = useState(null)
  useEffect(() => {
    const n = live.unlocks?.length || 0
    if (prevUnlocks.current != null && n > prevUnlocks.current) {
      const u = live.unlocks[n - 1]
      if (Date.now() - u.t < 60000) {
        pushNotice({ t: u.t, title: `${u.bot} desbloqueou: ${u.label}`, sub: 'Novo troféu na mesa' })
        if (prefs.get('uisound', true)) uiSound('done')
      }
    }
    prevUnlocks.current = n
  }, [live.unlocks])
  useEffect(() => {
    if (!unlock) return
    const id = setTimeout(() => setUnlock(null), 5000)
    return () => clearTimeout(id)
  }, [unlock])
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
    <div className={`app ${night ? 'night' : ''} ${tv ? 'tv' : ''} ${intro ? 'intro' : ''}`}>
      <Suspense fallback={null}>
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
        onLongPress={(n, x, y) => {
          buzz(12)
          setQuick({ name: n, x, y })
        }}
        onPointerMissed={() => setSelectedBot(null)}
        onUserMove={onUserMove}
      />
      </Suspense>
      <div className="hud">
        <div className="top-left">
          <Brand conn={conn} now={now} name={live.office?.name} onClick={() => setOfficesOpen(true)} />
          <SearchField onOpen={() => setSearchOpen(true)} />
          <ModeToggles mode={lightMode} setMode={setLightMode} tour={tour} setTour={setTour} overview={overview} setOverview={setOverview} onSearch={() => setSearchOpen(true)} />
          <Settings live={!!topic} onSignOut={onSignOut} onSignIn={onSignIn} onTv={() => setTv(true)} mode={lightMode} setMode={setLightMode} onOffices={() => setOfficesOpen(true)} onHealth={() => setHealthOpen(true)} onKeys={() => setKeysOpen(true)} onOfficeSettings={() => setOfficeCfg(true)} readonly={readonly} />
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
          onQueue={() => setQueueOpen(true)}
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
          onReact={readonly ? null : (n, kind) => send({ react: { bot: n, kind } })}
          onDecide={readonly ? null : decide}
        />
        <Activity data={data} onPick={pickBot} floorBots={floor?.bots || []} />
        <Weekly usage={data.usage} data={data} onPickBot={pickBot} onPickTeam={goFloor} />
        <div className="bottom-center">
          {!topic && !replayT && <ConnectBanner onSignIn={onSignIn} />}
          <Timeline history={live.history} talkLog={live.talkLog} value={replayT} onChange={setReplayT} />
          <Hints />
        </div>
        <MobileFloors floors={floors} data={data} now={now} selectedKey={selKey} onFloor={goFloor} />
        {queueOpen && <QueueModal waiting={waiting} now={now} onDecide={decide} onPick={pickBot} onClose={() => setQueueOpen(false)} readonly={readonly} />}
        {healthOpen && <HealthModal conn={conn} data={live} now={now} topic={topic} onPickBot={pickBot} onClose={() => setHealthOpen(false)} />}
        {keysOpen && <ShortcutsModal onClose={() => setKeysOpen(false)} />}
        {quick && (
          <QuickMenu
            q={quick}
            data={data}
            now={now}
            onClose={() => setQuick(null)}
            onApprove={readonly ? null : approve}
            onReact={readonly ? null : (n, kind) => send({ react: { bot: n, kind } })}
            onOpenChat={(n) => openLink(chatLink(dataStore.get(), n))}
            onFollow={pickBot}
          />
        )}
        <MiniMap layout={lay} floor={floor} data={data} now={now} onPick={pickBot} selected={selectedBot} />
        {welcome && <Welcome onDone={() => (prefs.set('welcomed', true), setWelcome(false))} />}
        {officesOpen && <OfficesModal current={topic} onSwitch={onSwitch} onAdd={onSignIn} onClose={() => setOfficesOpen(false)} />}
        {officeCfg && (
          <LookModal
            look={look}
            shared={!!topic && !readonly}
            onPreview={setLookPreview}
            onSave={(l) => {
              const { label, sub, ...clean } = l
              if (readonly) prefs.set('look', clean)
              else send({ office: { look: clean } })
              setLookPreview(null)
            }}
            onClose={() => setOfficeCfg(false)}
          />
        )}
        {topic && !welcome && live.order.length === 0 && <EmptyOffice />}
        <HoverTip />
        <SendStatus s={sendStatus} onRetry={() => sendStatus && send(sendStatus.payload)} />
        {!toastBot && notices[0] && <Celebration c={notices[0]} />}
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
