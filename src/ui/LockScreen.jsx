// `?bloqueio`: a lock-screen display. The face plays Grok-avatar-style clips, expressions and states
// (engine in lib/face.js, projected so head turns lean and foreshorten the eyes) and follows whoever
// needs the room: working, thinking, waiting, error, done, or idle when the office is quiet.
// Everything is time-based, so a ~10 fps screen just shows fewer frames of the same motion.
import { useEffect, useRef, useState } from 'react'
import { dataStore, loadTopic, ingest } from '../lib/state'
import { useStore } from '../lib/createStore'
import { effStatus, resolveColor } from '../lib/constants'
import { connectOffice } from '../lib/transport'
import { startDemo } from '../lib/demo'
import { createFace, project, STATES } from '../lib/face'

const TURN_MS = 9000

function light(hex) {
  const c = hex.replace('#', '')
  const f = c.length === 3 ? c.split('').map((x) => x + x).join('') : c
  const n = parseInt(f, 16)
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 170
}

function faceMode(status, step) {
  if (status === 'working' && /pens|pesquis|analis|busca|think|search/i.test(step || '')) return 'thinking'
  if (status === 'working') return 'working'
  if (status === 'waiting_user') return 'waiting'
  if (status === 'error') return 'error'
  if (status === 'done') return 'done'
  return 'resting'
}

const FACE_STATE = { idle: 'idle', resting: 'idle', working: 'working', thinking: 'thinking', waiting: 'waiting', error: 'blocked', done: 'finished' }
const MORPH = { thinking: 'thinking', waiting: 'orbit' }
const rand = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]

export function LockScreen({ topic, embedded, onExit }) {
  const live = useStore(dataStore)
  const [now, setNow] = useState(Date.now())
  const [turn, setTurn] = useState(0)

  useEffect(() => {
    if (embedded) return // inside the office, data is already flowing
    loadTopic(topic)
    return topic ? connectOffice(topic, { onMessages: ingest, onStatus: () => {}, sinceMs: dataStore.get().lastTime || 0 }) : startDemo()
  }, [topic, embedded])

  useEffect(() => {
    if (!onExit) return
    const k = (e) => e.key === 'Escape' && onExit()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onExit])

  // keep the display awake and the cursor out of the way
  useEffect(() => {
    let lock = null
    const grab = () => navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    grab()
    const vis = () => document.visibilityState === 'visible' && grab()
    document.addEventListener('visibilitychange', vis)
    return () => (document.removeEventListener('visibilitychange', vis), lock?.release?.())
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 3000)
    return () => clearInterval(id)
  }, [])

  const visible = live.order.filter((n) => live.bots[n] && !live.bots[n].hidden)
  const of = (st) => visible.filter((n) => effStatus(live.bots[n], now) === st)
  const working = of('working')
  const waiting = of('waiting_user')
  const errored = of('error')
  const done = of('done')
  const pool = working.length ? working : waiting.length ? waiting : errored.length ? errored : done
  const name = pool.length ? pool[turn % pool.length] : null
  const bot = name ? live.bots[name] : null
  const mode = bot ? faceMode(effStatus(bot, now), bot.step) : visible.length ? 'resting' : 'idle'
  const bg = bot ? resolveColor(bot.color) : '#000'
  const eye = bot && light(bg) ? '#111' : '#fff'

  useEffect(() => {
    if (pool.length < 2) return
    const id = setInterval(() => setTurn((t) => t + 1), TURN_MS)
    return () => clearInterval(id)
  }, [pool.length])

  // the face: one engine, its state follows the mode on screen
  const faceRef = useRef(null)
  if (!faceRef.current) faceRef.current = createFace()
  const [eyes, setEyes] = useState(() => project(faceRef.current.tick(0)))
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf, last = performance.now(), drawn = 0
    const loop = (t) => {
      raf = requestAnimationFrame(loop)
      const pose = faceRef.current.tick(reduce ? 0 : (t - last) / 1000)
      last = t
      if (t - drawn < 33) return // ~30 fps is plenty; slower screens just get fewer frames
      drawn = t
      setEyes(project(pose))
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // mode changes: an excited start when work begins, then the mode's own playlist
  const modeRef = useRef(mode)
  modeRef.current = mode
  const lastMode = useRef(mode)
  useEffect(() => {
    const f = faceRef.current
    f.set(FACE_STATE[mode] || 'idle')
    if ((mode === 'working' || mode === 'thinking') && !['working', 'thinking'].includes(lastMode.current)) f.play('Done_C')
    lastMode.current = mode
  }, [mode])

  // a different bot takes the screen: a quick spin, so even same-colour bots read as a change
  const lastName = useRef(null)
  useEffect(() => {
    if (name && lastName.current && name !== lastName.current) faceRef.current.play('Rotation_C')
    lastName.current = name
  }, [name])

  // every so often, something livelier than the plain loop
  useEffect(() => {
    let id
    const timers = []
    const back = (ms) => timers.push(setTimeout(() => faceRef.current.state !== 'working' && faceRef.current.set(FACE_STATE[modeRef.current] || 'idle'), ms))
    const go = () => {
      const f = faceRef.current
      const r = Math.random()
      if (f.state === 'working') f.play(r < 0.5 ? pick(['Streaming_A', 'Streaming_B', 'Streaming_C']) : r < 0.75 ? 'Done_C' : 'Working_B')
      else if (f.state === 'idle') {
        if (r < 0.08) (f.set('bored'), back(7000)) // a short doze
        else if (r < 0.15) (f.set('suspicious'), back(6000))
        else if (r < 0.25) (f.set('listening'), back(6000))
        else f.play(pick(STATES.idleExtra.clips))
      }
      id = setTimeout(go, rand(16000, 32000))
    }
    id = setTimeout(go, rand(10000, 18000))
    return () => (clearTimeout(id), timers.forEach(clearTimeout))
  }, [])

  return (
    <div className={`lock ${bot ? 'busy' : ''}`} style={{ background: bg, color: eye }} onDoubleClick={onExit}>
      <svg className="lock-face" viewBox="-1.6 -1 3.2 2" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {eyes.map((e, i) => (
          <path key={i} d={e.d} fill="none" stroke={eye} strokeWidth={e.w * 2} strokeLinecap="round" strokeLinejoin="round" opacity={e.visible} />
        ))}
        <g className="lock-morph">
          {MORPH[mode] === 'thinking' && <g data-m="thinking">{[-0.16, 0, 0.16].map((x) => <circle key={x} cx={x} cy="-0.62" r="0.045" />)}</g>}
          {MORPH[mode] === 'orbit' && <g data-m="orbit"><circle cx="0" cy="-0.1" r="0.72" /></g>}
        </g>
      </svg>
      {bot && (
        <div className="lock-info" key={name}>
          <b>{name}</b>
          {bot.step && <span>{bot.step}</span>}
          {pool.length > 1 && <i>{(turn % pool.length) + 1}/{pool.length}</i>}
        </div>
      )}
    </div>
  )
}
