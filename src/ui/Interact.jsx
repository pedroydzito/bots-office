import { useEffect, useRef, useState } from 'react'
import { prefs } from '../lib/notify'
import { botPositions, floorOffset } from '../scene/registry'
import { effStatus, STATUS } from '../lib/constants'
import { Chat, Check, Clap, Close, Heart, Laugh, Party, Search as SearchIco, ThumbUp } from './Icons'

/** Short haptic feedback on phones (Settings → Vibração). */
export function buzz(pattern = 15) {
  try {
    if (prefs.get('vibrate', true) && navigator.vibrate) navigator.vibrate(pattern)
  } catch {
    /* ignore */
  }
}

/** Swipe a sheet down to close it (phones). Returns props for the drag handle element. */
export function useSwipeDown(onClose) {
  const st = useRef(null)
  const [dy, setDy] = useState(0)
  return {
    dy,
    handlers: {
      onTouchStart: (e) => (st.current = e.touches[0].clientY),
      onTouchMove: (e) => st.current != null && setDy(Math.max(0, e.touches[0].clientY - st.current)),
      onTouchEnd: () => {
        if (dy > 80) {
          buzz(10)
          onClose()
        }
        st.current = null
        setDy(0)
      },
    },
  }
}

/** Long-press menu on a bot: quick actions without opening the card. */
export function QuickMenu({ q, data, now, onClose, onApprove, onReact, onOpenChat, onFollow }) {
  useEffect(() => {
    const close = (e) => !e.target.closest?.('.quick') && onClose()
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [onClose])
  const b = data.bots[q.name]
  if (!b) return null
  const st = effStatus(b, now)
  const x = Math.min(window.innerWidth - 230, Math.max(10, q.x - 110))
  const y = Math.min(window.innerHeight - 200, Math.max(10, q.y - 150))
  return (
    <div className="card quick" style={{ left: x, top: y }}>
      <div className="quick-h">
        <i style={{ background: STATUS[st].color }} />
        <b>{b.name}</b>
      </div>
      {onReact && (
        <div className="quick-r">
          {[['like', ThumbUp], ['heart', Heart], ['party', Party], ['clap', Clap], ['laugh', Laugh]].map(([k, I]) => (
            <button key={k} className={`rb rb-${k}`} aria-label={k} onClick={() => (onReact(b.name, k), buzz(10), onClose())}><I size={17} /></button>
          ))}
        </div>
      )}
      {st === 'waiting_user' && onApprove && (
        <button className="quick-a dark" onClick={() => (onApprove(b.name), buzz(20), onClose())}><Check size={13} /> Aprovar</button>
      )}
      <button className="quick-a" onClick={() => (onFollow(b.name), onClose())}><SearchIco size={13} /> Seguir</button>
      <button className="quick-a" onClick={() => (onOpenChat(b.name), onClose())}><Chat size={13} /> Abrir chat</button>
    </div>
  )
}

/** Desktop: always-visible search field (opens the full search as you type). */
export function SearchField({ onOpen }) {
  return (
    <button className="card searchfield" onClick={() => onOpen('')} aria-label="Buscar bot">
      <SearchIco size={14} />
      <span>Buscar bot, time ou tarefa…</span>
      <kbd>Ctrl K</kbd>
    </button>
  )
}

/** Mini map of the open floor: walls, desks, elevator and live bot dots (click to follow). */
export function MiniMap({ layout, floor, data, now, onPick, selected }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 300)
    return () => clearInterval(id)
  }, [])
  if (!layout || !floor) return null
  const { W, D } = layout
  const S = 120 / Math.max(W, D)
  const px = (x) => (x + W / 2) * S
  const pz = (z) => (z + D / 2) * S
  const dots = []
  for (const [n, p] of botPositions) {
    const b = data.bots[n]
    if (!b) continue
    dots.push({ n, x: p.x - floorOffset.x, z: p.z - floorOffset.z, c: STATUS[effStatus(b, now)].color })
  }
  return (
    <div className="card minimap" aria-label="Mini mapa">
      <svg width={W * S} height={D * S} viewBox={`0 0 ${W * S} ${D * S}`}>
        <rect x="0" y="0" width={W * S} height={D * S} rx="4" className="mm-floor" />
        <line x1="0" y1="1" x2={W * S} y2="1" className="mm-wall" />
        <line x1="1" y1="0" x2="1" y2={D * S} className="mm-wall" />
        {layout.rows.map((r, i) => (
          <rect key={i} x={px(r.x1)} y={pz(r.z + 0.4)} width={(r.x2 - r.x1) * S} height={0.85 * S} rx="1.5" className="mm-desk" />
        ))}
        <rect x={px(layout.elevator.x - 0.6)} y={pz(layout.elevator.z - 0.75)} width={1.2 * S} height={1.5 * S} rx="2" className="mm-elev" />
        {dots.map((d) => (
          <circle key={d.n} cx={px(d.x)} cy={pz(d.z)} r={d.n === selected ? 5 : 3.6} fill={d.c} className={d.n === selected ? 'mm-sel' : ''} onClick={() => onPick(d.n)}>
            <title>{d.n}</title>
          </circle>
        ))}
      </svg>
      <span className="mm-label">{floor.name}</span>
    </div>
  )
}

const STEPS = [
  ['Bem-vindo ao seu escritório', 'Cada andar é um time. Os bots trabalham, conversam e circulam conforme as mensagens chegam — igual em todas as telas.'],
  ['Toque num bot', 'Abre o cartão com o que ele está fazendo, métricas e aprovações. Segure o dedo (ou clique e segure) para ações rápidas.'],
  ['Controles', 'Arraste para girar, use dois dedos (ou o botão direito) para mover e pinça/rolagem para zoom. Na engrenagem: sons, nomes, escritórios e mais.'],
]
/** First-visit welcome: three short steps. */
export function Welcome({ onDone }) {
  const [i, setI] = useState(0)
  const [title, text] = STEPS[i]
  return (
    <div className="search-bg welcome-bg">
      <div className="card welcome">
        <div className="wdots">{STEPS.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        <b>{title}</b>
        <p>{text}</p>
        <div className="wrow">
          <button className="ghost" onClick={onDone}>Pular</button>
          {i < STEPS.length - 1 ? (
            <button className="dark" onClick={() => setI(i + 1)}>Próximo</button>
          ) : (
            <button className="dark" onClick={onDone}>Começar</button>
          )}
        </div>
      </div>
    </div>
  )
}

export { Close }
