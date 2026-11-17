// `?bloqueio`: a lock-screen style display. Black screen with a pair of Grok-style eyes that idle
// and animate like the Grok Bot avatar (clips, expressions and states in lib/face.js). When bots are
// working the background takes the working bot's colour, the face switches to its working clips, and
// the bot's name + step sit quietly in a corner. Several working bots take turns. Everything is
// time-based, so a ~10 fps screen just shows fewer frames of the same motion.
import { useEffect, useRef, useState } from 'react'
import { dataStore, loadTopic, ingest } from '../lib/state'
import { useStore } from '../lib/createStore'
import { effStatus, resolveColor } from '../lib/constants'
import { connectNtfy } from '../lib/ntfy'
import { startDemo } from '../lib/demo'
import { createFace, project, STATES } from '../lib/face'

const TURN_MS = 9000

function light(hex) {
  const c = hex.replace('#', '')
  const f = c.length === 3 ? c.split('').map((x) => x + x).join('') : c
  const n = parseInt(f, 16)
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 170
}

const rand = (a, b) => a + Math.random() * (b - a)

export function LockScreen({ topic, embedded, onExit }) {
  const live = useStore(dataStore)
  const [now, setNow] = useState(Date.now())
  const [turn, setTurn] = useState(0)

  useEffect(() => {
    if (embedded) return // inside the office, data is already flowing
    loadTopic(topic)
    return topic ? connectNtfy(topic, { onMessages: ingest, onStatus: () => {} }) : startDemo()
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

  const working = live.order.filter((n) => live.bots[n] && !live.bots[n].hidden && effStatus(live.bots[n], now) === 'working')
  const name = working.length ? working[turn % working.length] : null
  const bot = name ? live.bots[name] : null
  const bg = bot ? resolveColor(bot.color) : '#000'
  const eye = bot && light(bg) ? '#111' : '#fff'
  const busy = !!bot

  // take turns between working bots
  useEffect(() => {
    if (working.length < 2) return
    const id = setInterval(() => setTurn((t) => t + 1), TURN_MS)
    return () => clearInterval(id)
  }, [working.length])

  // the face: Grok-style clips driven by what the office is doing
  const faceRef = useRef(null)
  if (!faceRef.current) faceRef.current = createFace()
  const [eyes, setEyes] = useState(() => project(faceRef.current.tick(0)))
  useEffect(() => {
    let raf, last = performance.now(), drawn = 0
    const loop = (t) => {
      raf = requestAnimationFrame(loop)
      const pose = faceRef.current.tick((t - last) / 1000)
      last = t
      if (t - drawn < 33) return // ~30 fps is plenty; slower screens just get fewer frames
      drawn = t
      setEyes(project(pose))
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // working <-> idle: an excited start, a happy finish
  const wasBusy = useRef(false)
  useEffect(() => {
    const f = faceRef.current
    const was = wasBusy.current
    wasBusy.current = busy
    if (busy) {
      f.set('working')
      if (!was) f.play('Done_C')
    } else if (was) {
      f.set('finished')
      const id = setTimeout(() => f.set('idle'), 5500)
      return () => clearTimeout(id)
    }
  }, [busy])

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
    const pick = (a) => a[Math.floor(Math.random() * a.length)]
    const back = (ms) => timers.push(setTimeout(() => faceRef.current.state !== 'working' && faceRef.current.set('idle'), ms))
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
    <div className={`lock ${busy ? 'busy' : ''}`} style={{ background: bg, color: eye }} onDoubleClick={onExit}>
      <svg className="lock-face" viewBox="-1.6 -1 3.2 2" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {eyes.map((e, i) => (
          <path key={i} d={e.d} fill="none" stroke={eye} strokeWidth={e.w * 2} strokeLinecap="round" strokeLinejoin="round" opacity={e.visible} />
        ))}
      </svg>
      {bot && (
        <div className="lock-info" key={name}>
          <b>{name}</b>
          {bot.step && <span>{bot.step}</span>}
          {working.length > 1 && <i>{(turn % working.length) + 1}/{working.length}</i>}
        </div>
      )}
    </div>
  )
}
