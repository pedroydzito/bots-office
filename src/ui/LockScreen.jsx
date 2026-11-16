// `?bloqueio`: a lock-screen display. The face runs the same vocabulary as the Grok avatar
// (9 expressions, glance / squash / spin clips, a few morphs) and follows whoever needs the room:
// working, thinking, waiting, error, done, or asleep when the office is quiet.
import { useEffect, useRef, useState } from 'react'
import { dataStore, loadTopic, ingest } from '../lib/state'
import { useStore } from '../lib/createStore'
import { effStatus, resolveColor } from '../lib/constants'
import { connectOffice } from '../lib/transport'
import { startDemo } from '../lib/demo'
import { poseAt } from './lockAnim'

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

function EyePair({ name, children }) {
  return <g data-eye={name}>{children}</g>
}

export function LockScreen({ topic, embedded, onExit }) {
  const live = useStore(dataStore)
  const [now, setNow] = useState(Date.now())
  const [turn, setTurn] = useState(0)
  const stage = useRef(null)
  const lids = useRef(null)

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

  // paint the face every frame from the shared clock
  const modeRef = useRef(mode)
  modeRef.current = mode
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const paint = (ms) => {
      const el = stage.current
      const lid = lids.current
      if (el) {
        const p = reduce
          ? { x: 0, y: 0, tilt: 0, spin: 0, sx: 1, sy: 1, open: 1, expr: 'neutral', morph: '' }
          : poseAt(modeRef.current, ms)
        el.dataset.expr = p.expr
        el.dataset.morph = p.morph || ''
        el.style.transform = `translate(calc(-50% + ${p.x}vmin), calc(-50% + ${p.y}vmin)) rotate(${p.spin + p.tilt}deg) scale(${p.sx}, ${p.sy})`
        if (lid) lid.style.transform = `scaleY(${Math.max(0.12, p.open)})`
      }
      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className={`lock ${bot ? 'busy' : ''}`} style={{ background: bg, color: eye }} onDoubleClick={onExit}>
      <div className="lock-stage" ref={stage} data-expr="neutral">
        <svg className="lock-svg" viewBox="-70 -78 140 156" aria-hidden="true">
          <g ref={lids} className="lock-lids">
            <EyePair name="neutral">
              <ellipse cx="-26" cy="0" rx="12" ry="28" />
              <ellipse cx="26" cy="0" rx="12" ry="28" />
            </EyePair>
            <EyePair name="happy">
              <path d="M-42 12 Q-26 -22 -10 12" />
              <path d="M10 12 Q26 -22 42 12" />
            </EyePair>
            <EyePair name="surprised">
              <ellipse cx="-26" cy="-2" rx="18" ry="32" />
              <ellipse cx="26" cy="-2" rx="18" ry="32" />
            </EyePair>
            <EyePair name="sad">
              <ellipse cx="-26" cy="6" rx="11" ry="22" transform="rotate(-22 -26 6)" />
              <ellipse cx="26" cy="6" rx="11" ry="22" transform="rotate(22 26 6)" />
            </EyePair>
            <EyePair name="sleepy">
              <path d="M-40 4 Q-26 18 -12 4" />
              <path d="M12 4 Q26 18 40 4" />
            </EyePair>
            <EyePair name="squinted">
              <path d="M-42 6 Q-26 -6 -10 6" />
              <path d="M10 6 Q26 -6 42 6" />
            </EyePair>
            <EyePair name="calm">
              <ellipse cx="-26" cy="2" rx="20" ry="14" />
              <ellipse cx="26" cy="2" rx="20" ry="14" />
            </EyePair>
            <EyePair name="inspecting">
              <ellipse cx="-28" cy="-2" rx="18" ry="18" />
              <ellipse cx="24" cy="8" rx="9" ry="9" />
            </EyePair>
            <EyePair name="confused">
              <ellipse cx="-28" cy="-10" rx="10" ry="22" transform="rotate(14 -28 -10)" />
              <ellipse cx="24" cy="10" rx="10" ry="20" transform="rotate(-12 24 10)" />
            </EyePair>
          </g>
          <g className="lock-morph">
            <g data-m="thinking">
              {[-16, 0, 16].map((x) => <circle key={x} cx={x} cy="-52" r="4.5" />)}
            </g>
            <g data-m="orbit">
              <circle cx="0" cy="0" r="58" />
            </g>
          </g>
        </svg>
      </div>
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
