import { useEffect, useMemo, useRef, useState } from 'react'
import Avatar from './Avatar'
import { Clock, Close, Layers, Party, Pause, Play, Search as SearchIco } from './Icons'
import { CORTEX_KEY, effStatus, hhmm, STATUS } from '../lib/constants'

/** "Go back in time": scrub through the last hours of status changes; the office replays them. */
export function Timeline({ history, talkLog = [], value, onChange }) {
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const now = Date.now()
  const min = Math.max(now - 12 * 3600e3, history.length ? history[0].t : now - 3600e3)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      onChange((v) => {
        const next = (v ?? min) + 90 * 1000
        if (next >= Date.now()) {
          setPlaying(false)
          return null
        }
        return next
      })
    }, 80)
    return () => clearInterval(id)
  }, [playing, min, onChange])
  if (!open && value == null)
    return (
      <button className="card timeline-btn" onClick={() => setOpen(true)} title="Linha do tempo">
        <Clock size={14} /> Linha do tempo
      </button>
    )
  const v = value ?? now
  return (
    <div className={`card timeline ${value != null ? 'replaying' : ''}`}>
      <button className="tl-play" onClick={() => (playing ? setPlaying(false) : (value == null && onChange(min), setPlaying(true)))} aria-label={playing ? 'Pausar' : 'Reproduzir'}>
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <div className="tl-track">
        <Markers history={history} talkLog={talkLog} min={min} max={now} onPick={onChange} />
        <input
        type="range"
        min={min}
        max={now}
        step={30000}
        value={v}
        onChange={(e) => {
          const t = +e.target.value
          onChange(t >= now - 30000 ? null : t)
        }}
        aria-label="Momento"
      />
      </div>
      <span className="tl-time">{value == null ? 'Ao vivo' : hhmm(value)}</span>
      {value != null ? (
        <button className="dark sm" onClick={() => (setPlaying(false), onChange(null))}>Ao vivo</button>
      ) : (
        <button className="tl-x" onClick={() => setOpen(false)} aria-label="Fechar"><Close size={13} /></button>
      )}
    </div>
  )
}

/** Dots on the timeline: errors, approvals, finished work and meetings — click to jump there. */
function Markers({ history, talkLog, min, max, onPick }) {
  const span = Math.max(1, max - min)
  // recomputed only when the logs grow or the window moves by a minute (not on every 2 s tick)
  const marks = useMemo(() => buildMarks(history, talkLog, min), [history.length, talkLog.length, Math.floor(min / 60000)]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tl-marks">
      {marks.slice(-80).map((m, i) => (
        <button key={i} className="tl-mark" style={{ left: `${((m.t - min) / span) * 100}%`, '--c': m.c }} title={`${hhmm(m.t)} · ${m.l}`} aria-label={m.l} onClick={() => onPick(m.t)} />
      ))}
    </div>
  )
}

function buildMarks(history, talkLog, min) {
  const marks = []
  for (const h of history) {
    if (h.t < min) continue
    if (h.status === 'error') marks.push({ t: h.t, c: '#E5484D', l: `${h.bot}: erro` })
    else if (h.status === 'waiting_user') marks.push({ t: h.t, c: '#F5A524', l: `${h.bot} pediu aprovação` })
  }
  const byHost = {}
  for (const s of talkLog) if (s.t0 >= min) (byHost[s.to] ||= []).push(s)
  for (const [host, list] of Object.entries(byHost)) {
    for (const s of list) {
      const overlap = list.filter((o) => o.t0 < (s.end ?? s.lastT + 90000) && (o.end ?? o.lastT + 90000) > s.t0)
      if (overlap.length >= 2 && overlap[0] === s) marks.push({ t: s.t0, c: '#8F59F9', l: `Reunião com ${host}` })
    }
  }
  return marks
}

/** Banner when a whole floor finished everything (the floor itself throws confetti). */
export function Celebration({ c }) {
  if (!c) return null
  return (
    <div className="card celebration" key={c.t}>
      <Party size={18} />
      <div>
        <b>{c.title || `${c.name} concluiu tudo!`}</b>
        <span>{c.sub || 'Todos os bots do andar terminaram'}</span>
      </div>
    </div>
  )
}

/** Phones: one button that opens the floor list. */
export function MobileFloors({ floors, data, now, selectedKey, onFloor }) {
  const [open, setOpen] = useState(false)
  const cur = floors.find((f) => f.key === selectedKey)
  return (
    <div className="mfloors">
      {open && (
        <div className="card mf-list">
          {[...floors].reverse().map((f) => {
            const isC = f.key === CORTEX_KEY
            const working = isC ? 0 : f.bots.filter((n) => effStatus(data.bots[n], now) === 'working').length
            return (
              <button key={f.key} className={`floor ${selectedKey === f.key ? 'sel' : ''}`} onClick={() => (onFloor(f.key), setOpen(false))}>
                <span className="num" style={{ '--team': f.color }}>{f.num}</span>
                <span className="fname">{f.name}</span>
                {!isC && <span className="cnt">{working}/{f.bots.length}</span>}
              </button>
            )
          })}
        </div>
      )}
      <button className="card mf-btn" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
        <Layers size={16} />
        {cur && <span className="num" style={{ '--team': cur.color }}>{cur.num}</span>}
        <b>{cur?.name || 'Andares'}</b>
      </button>
    </div>
  )
}

export function TvExit({ onExit }) {
  return (
    <button className="tv-exit" onClick={onExit} aria-label="Sair do modo TV">
      <Close size={16} />
    </button>
  )
}

export { STATUS }

/** Ctrl+K / "/" : find a bot by name, team or what it is doing; the camera flies to it. */
export function Search({ data, now, onPick, onClose }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef(null)
  useEffect(() => ref.current?.focus(), [])
  const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const nq = norm(q)
  // tolerant search: substring, then letters-in-order, then one typo away; those needing you first
  const near = (a, b) => {
    if (Math.abs(a.length - b.length) > 1) return false
    let i = 0, j = 0, e = 0
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) (i++, j++)
      else {
        if (++e > 1) return false
        if (a.length > b.length) i++
        else if (b.length > a.length) j++
        else (i++, j++)
      }
    }
    return e + (a.length - i) + (b.length - j) <= 1
  }
  const subseq = (h, q) => {
    let i = 0
    for (const c of h) if (c === q[i]) i++
    return i === q.length
  }
  const scoreOf = (b) => {
    const name = norm(b.name), team = norm(b.team), step = norm(b.step)
    let sc = 0
    if (!nq) sc = 1
    else if (name.startsWith(nq)) sc = 6
    else if (name.includes(nq)) sc = 5
    else if (team.includes(nq)) sc = 3
    else if (step.includes(nq)) sc = 2
    else if (nq.length >= 3 && name.split(/[\s|_.-]+/).some((w) => near(w, nq))) sc = 2.5
    else if (nq.length >= 2 && subseq(name, nq)) sc = 1.5
    if (!sc) return 0
    const st = effStatus(b, now)
    return sc + (st === 'waiting_user' ? 2 : st === 'error' ? 1.5 : st === 'working' ? 0.4 : 0)
  }
  const list = data.order
    .map((n) => data.bots[n])
    .filter(Boolean)
    .map((b) => [b, scoreOf(b)])
    .filter(([, sc]) => sc > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([b]) => b)
    .slice(0, 8)
  const go = (b) => {
    if (!b) return
    onPick(b.name)
    onClose()
  }
  return (
    <div className="search-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card search">
        <div className="search-in">
          <SearchIco size={16} />
          <input
            ref={ref}
            value={q}
            placeholder="Buscar bot, time ou tarefa…"
            onChange={(e) => (setQ(e.target.value), setI(0))}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') (e.preventDefault(), setI((x) => Math.min(list.length - 1, x + 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setI((x) => Math.max(0, x - 1)))
              else if (e.key === 'Enter') go(list[i])
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="search-list">
          {list.length === 0 && <p className="muted pad">Nenhum bot encontrado</p>}
          {list.map((b, k) => {
            const st = effStatus(b, now)
            return (
              <button key={b.name} className={`li ${k === i ? 'hl' : ''}`} onMouseEnter={() => setI(k)} onClick={() => go(b)}>
                <Avatar bot={b} size={28} ring={STATUS[st].color} />
                <div className="lt">
                  <b>{b.name}</b>
                  <span>{b.team} · {b.step || STATUS[st].label}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
