import { useEffect, useState } from 'react'
import { Clock, Close, Layers, Party, Pause, Play } from './Icons'
import { CORTEX_KEY, effStatus, hhmm, STATUS } from '../lib/constants'

/** "Go back in time": scrub through the last hours of status changes; the office replays them. */
export function Timeline({ history, value, onChange }) {
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
      <span className="tl-time">{value == null ? 'Ao vivo' : hhmm(value)}</span>
      {value != null ? (
        <button className="dark sm" onClick={() => (setPlaying(false), onChange(null))}>Ao vivo</button>
      ) : (
        <button className="tl-x" onClick={() => setOpen(false)} aria-label="Fechar"><Close size={13} /></button>
      )}
    </div>
  )
}

/** Banner when a whole floor finished everything (the floor itself throws confetti). */
export function Celebration({ c }) {
  if (!c) return null
  return (
    <div className="card celebration" key={c.t}>
      <Party size={18} />
      <div>
        <b>{c.name} concluiu tudo!</b>
        <span>Todos os bots do andar terminaram</span>
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
