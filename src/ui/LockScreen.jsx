// `?bloqueio`: a lock-screen style display. Black screen with a pair of Grok-style eyes that idle
// (blink, glance, spin now and then). When bots are working the background takes the working bot's
// colour, the eyes get busy, and the bot's name + step sit quietly in a corner. Several working bots
// take turns. Motion is a handful of discrete poses eased by CSS, so it still reads on a ~10 fps screen.
import { useEffect, useRef, useState } from 'react'
import { dataStore, loadTopic, ingest } from '../lib/state'
import { useStore } from '../lib/createStore'
import { effStatus, resolveColor } from '../lib/constants'
import { connectNtfy } from '../lib/ntfy'
import { startDemo } from '../lib/demo'

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
  // eye pose: x/y offset (vmin), open (scaleY), size (scale), spin (deg)
  const [pose, setPose] = useState({ x: 0, y: 0, open: 1, size: 1, spin: 0 })
  const spinRef = useRef(0)

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

  // a new bot on screen: blink and spin so the change shows even between same-colour bots
  useEffect(() => {
    if (!name) return
    spinRef.current += 360
    setPose((p) => ({ ...p, open: 0.1, spin: spinRef.current }))
    const id = setTimeout(() => setPose((p) => ({ ...p, open: 1.15, size: 1.2 })), 450)
    return () => clearTimeout(id)
  }, [name])

  // the eyes' little life: a new pose every so often
  useEffect(() => {
    let t
    const step = () => {
      const r = Math.random()
      setPose((p) => {
        if (r < 0.2) {
          // blink, then open again
          setTimeout(() => setPose((q) => ({ ...q, open: busy ? rand(0.55, 0.8) : 1 })), 180)
          return { ...p, open: 0.08 }
        }
        if (r < (busy ? 0.3 : 0.27)) return { ...p, spin: (spinRef.current += 360), x: 0, y: 0 }
        if (busy) {
          // focused: squinted, quick little darts, sometimes a wide "aha"
          const aha = Math.random() < 0.25
          return { ...p, x: rand(-4, 4), y: rand(-1.5, 2.5), open: aha ? 1.2 : rand(0.5, 0.75), size: aha ? 1.25 : 1.12 }
        }
        // idle: slow glances to the sides, often back to centre
        const centre = Math.random() < 0.35
        return { ...p, x: centre ? 0 : rand(-9, 9), y: centre ? 0 : rand(-3, 3), open: 1, size: 1 }
      })
      t = setTimeout(step, busy ? rand(700, 1500) : rand(1800, 3500))
    }
    t = setTimeout(step, 800)
    return () => clearTimeout(t)
  }, [busy])

  return (
    <div className={`lock ${busy ? 'busy' : ''}`} style={{ background: bg, color: eye }} onDoubleClick={onExit}>
      <div className="lock-eyes" style={{ transform: `translate(${pose.x}vmin, ${pose.y}vmin) rotate(${pose.spin}deg) scale(${pose.size})` }}>
        {[0, 1].map((i) => (
          <span key={i} style={{ background: eye, transform: `rotate(24deg) scaleY(${pose.open})` }} />
        ))}
      </div>
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
