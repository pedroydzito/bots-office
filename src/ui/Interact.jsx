import { useEffect, useRef, useState } from 'react'
import { prefs } from '../lib/notify'
import { useStore } from '../lib/createStore'
import { mouse, tipStore } from '../lib/tip'
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
export function useSwipeDown(onClose, onUp) {
  const st = useRef(null)
  const [dy, setDy] = useState(0)
  return {
    dy: Math.max(0, dy),
    handlers: {
      onTouchStart: (e) => (st.current = e.touches[0].clientY),
      onTouchMove: (e) => st.current != null && setDy(e.touches[0].clientY - st.current),
      onTouchEnd: () => {
        if (dy > 80) {
          buzz(10)
          onClose()
        } else if (dy < -50 && onUp) {
          buzz(8)
          onUp()
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
    const id = setInterval(() => !document.hidden && tick((x) => x + 1), 500)
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

/** Floating tooltip for scene objects: follows the mouse, sharp HTML text (boards, empty seats). */
export function HoverTip() {
  const tip = useStore(tipStore, (s) => s.tip)
  const ref = useRef(null)
  useEffect(() => {
    if (!tip) return
    let raf = 0
    let w = 0, h = 0
    const loop = () => {
      const el = ref.current
      if (el) {
        if (!w) (w = el.offsetWidth), (h = el.offsetHeight)
        const x = Math.min(window.innerWidth - w - 8, mouse.x + 16)
        const y = Math.min(window.innerHeight - h - 8, mouse.y + 16)
        el.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [tip])
  if (!tip) return null
  return (
    <div ref={ref} className={`card hovertip ${tip.wide ? 'wide' : ''}`} role="tooltip">
      {tip.accent && <i className="ht-bar" style={{ background: tip.accent }} />}
      <b>{tip.title}</b>
      {tip.sub && <span className="ht-sub">{tip.sub}</span>}
      {tip.lines?.length > 0 && (
        <div className="ht-lines">
          {tip.lines.map((l, i) => (
            <div key={i}>
              <b style={l.color ? { color: l.color } : null}>{l.a}</b>
              {l.b && <span>{l.b}</span>}
            </div>
          ))}
        </div>
      )}
      {tip.empty && !tip.lines?.length && <span className="ht-sub">{tip.empty}</span>}
    </div>
  )
}


/** Drag sideways to dismiss (touch): waits 6px to decide, follows the finger, >80px throws it away. */
export function useSwipeAway(onGone) {
  const st = useRef(null)
  const [dx, setDx] = useState(0)
  const [gone, setGone] = useState(0)
  return {
    style: gone
      ? { transform: `translateX(${gone * window.innerWidth}px)`, opacity: 0, transition: 'transform 280ms var(--curva), opacity 280ms var(--curva)' }
      : dx
        ? { transform: `translateX(${dx}px)`, opacity: 1 - Math.abs(dx) / 240, transition: 'none' }
        : undefined,
    handlers: {
      onTouchStart: (e) => (st.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, on: false }),
      onTouchMove: (e) => {
        const s = st.current
        if (!s) return
        const mx = e.touches[0].clientX - s.x, my = e.touches[0].clientY - s.y
        if (!s.on) {
          if (Math.abs(mx) < 6 && Math.abs(my) < 6) return
          if (Math.abs(my) > Math.abs(mx)) return (st.current = null) // vertical = scrolling
          s.on = true
        }
        setDx(mx)
      },
      onTouchEnd: () => {
        if (Math.abs(dx) > 80) {
          setGone(Math.sign(dx))
          setTimeout(onGone, 280)
        }
        st.current = null
        setDx(0)
      },
    },
  }
}

const TIPS = [
  ['tip-hold', 'Segure em cima de um bot para aprovar, reagir ou abrir o chat sem abrir o card.'],
  ['tip-j', 'Aperte J para pular direto para o próximo bot que precisa de você.', 'desktop'],
  ['tip-swipe', 'Deslize a barra de baixo para o lado para trocar de andar.', 'touch'],
  ['tip-card', 'Arraste o card do bot para cima para ver tudo em tela cheia.', 'touch'],
  ['tip-look', 'Em Configurações → Personalizar escritório você muda o estilo, o piso e as cores.'],
]

/** First-time tip (design system 8.38): one at a time, 900 ms after opening, gone after 7 s or a swipe. */
export function FirstTip({ blocked }) {
  const [tip, setTip] = useState(null)
  useEffect(() => {
    if (blocked) return
    const touch = window.matchMedia?.('(pointer: coarse)').matches
    const next = TIPS.find(([k, , only]) => !prefs.get(k, false) && (!only || (only === 'touch') === touch))
    if (!next) return
    const a = setTimeout(() => (prefs.set(next[0], true), setTip(next)), 900)
    return () => clearTimeout(a)
  }, [blocked])
  useEffect(() => {
    if (!tip) return
    const b = setTimeout(() => setTip(null), 7000)
    return () => clearTimeout(b)
  }, [tip])
  const sw = useSwipeAway(() => setTip(null))
  if (!tip) return null
  return (
    <div className="firsttip-wrap">
      <div className="card firsttip" role="status" style={sw.style} {...sw.handlers}>
        <span className="ft-ico" aria-hidden="true">💡</span>
        <span className="ft-t">{tip[1]}</span>
        <button className="ft-x" aria-label="Fechar dica" onClick={() => setTip(null)}><Close size={14} /></button>
      </div>
    </div>
  )
}
