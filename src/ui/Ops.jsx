import { useEffect, useState } from 'react'
import Avatar from './Avatar'
import { Check, Close } from './Icons'
import { durationShort, effStatus, hhmm } from '../lib/constants'
import { health } from '../lib/health'
import { taskStats } from '../lib/metrics'
import { weeklyReport } from '../lib/report'
import { forgetOffice, listOffices, renameOffice, viewOnlyLink } from '../lib/auth'
import { ACCENTS, FLOORS, STYLES, WALLS } from '../lib/look'
import { useStore } from '../lib/createStore'
import { prefStore, setPref } from '../lib/notify'

export const STUCK_MS = 20 * 60e3
/** A bot that has said "working" on the same step for 20+ minutes may be stuck. */
export function isStuck(bot, now) {
  return !!bot && effStatus(bot, now) === 'working' && now - (bot.ts || 0) > STUCK_MS
}

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="search-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-h">
          <b>{title}</b>
          <button className="x2" aria-label="Fechar" onClick={onClose}><Close size={15} /></button>
        </div>
        <div className="modal-b">{children}</div>
      </div>
    </div>
  )
}

/** Approve / reject with an optional note. Publishes {"decision":...} to the topic. */
export function DecisionBox({ bot, onDecide, compact }) {
  const [note, setNote] = useState('')
  return (
    <div className={`decision ${compact ? 'compact' : ''}`}>
      <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 120))} placeholder="Motivo ou instrução (opcional)" aria-label="Motivo" />
      <div className="row2">
        <button className="ghost danger" onClick={() => (onDecide(bot, 'reject', note), setNote(''))}>
          <Close size={13} /> Recusar
        </button>
        <button className="dark" onClick={() => (onDecide(bot, 'approve', note), setNote(''))}>
          <Check size={13} /> Aprovar
        </button>
      </div>
    </div>
  )
}

/** Everything waiting on you, oldest first. */
export function QueueModal({ waiting, now, onDecide, onPick, onClose, readonly }) {
  const list = [...waiting].sort((a, b) => a.ts - b.ts)
  return (
    <Modal title={`Fila de aprovações · ${list.length}`} onClose={onClose}>
      {list.length === 0 && <p className="muted pad">Nada esperando por você.</p>}
      {list.map((b) => (
        <div key={b.name} className="qitem">
          <div className="qhead" onClick={() => (onPick(b.name), onClose())}>
            <Avatar bot={b} size={30} ring="#F5A524" />
            <div className="lt">
              <b>{b.name}</b>
              <span>{b.step || 'Precisa do seu OK'}</span>
            </div>
            <em className={now - b.ts > 30 * 60e3 ? 'late' : ''}>há {durationShort(now - b.ts).replace('há ', '')}</em>
          </div>
          {!readonly && <DecisionBox bot={b.name} onDecide={onDecide} compact />}
        </div>
      ))}
    </Modal>
  )
}

/** Is the live connection healthy? Delays, last message, silent bots, storage. */
export function HealthModal({ conn, data, now, onClose, topic, onPickBot }) {
  const [, tick] = useState(0)
  const [open, setOpen] = useState(null) // which list is expanded: 'hidden' | 'silent' | 'error' | 'waiting'
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const avg = health.delays.length ? Math.round(health.delays.reduce((a, b) => a + b, 0) / health.delays.length) : null
  let storage = 0
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('bot-office')) storage += (localStorage.getItem(k) || '').length
  } catch {
    /* ignore */
  }
  const ok = conn === 'live' || conn === 'demo'
  const bots = data.order.map((n) => data.bots[n]).filter(Boolean)
  const visible = bots.filter((b) => !b.hidden)
  const by = (st) => visible.filter((b) => effStatus(b, now) === st)
  const groups = {
    working: by('working'),
    waiting: by('waiting_user'),
    error: by('error'),
    resting: [...by('resting'), ...by('done')],
    hidden: bots.filter((b) => b.hidden),
    silent: visible.filter((b) => now - (b.ts || 0) > 2 * 3600e3),
    slow: visible.filter((b) => taskStats(data, b.name, now).slow),
  }
  // messages per 5 minutes over the last hour
  const buckets = Array(12).fill(0)
  for (const t of health.received) {
    const k = 11 - Math.floor((Date.now() - t) / 300000)
    if (k >= 0 && k < 12) buckets[k]++
  }
  const maxB = Math.max(1, ...buckets)
  const segs = [['working', 'Trabalhando', '#2FB36B'], ['waiting', 'Esperando você', '#F5A524'], ['error', 'Com erro', '#E5484D'], ['resting', 'Parados', '#9aa0aa']]
  const tiles = [
    ['Conexão', conn === 'live' ? 'Ao vivo' : conn === 'demo' ? 'Demo' : conn === 'syncing' ? 'Sincronizando' : 'Reconectando', ok ? 'good' : 'warn', health.connectedAt ? `há ${durationShort(now - health.connectedAt)}` : ''],
    ['Atraso médio', avg == null ? '—' : `${(avg / 1000).toFixed(1)} s`, avg != null && avg > 5000 ? 'warn' : 'good', 'entre o bot e esta tela'],
    ['Mensagens', String(health.received.length), '', 'na última hora'],
    ['Última mensagem', health.lastAt ? durationShort(Date.now() - health.lastAt).replace('há ', '') : '—', '', health.lastAt ? 'atrás' : 'desde que abriu'],
  ]
  const List = ({ k, label, tone }) => {
    const list = groups[k]
    return (
      <div className={`dash-list ${tone || ''}`}>
        <button className="dl-h" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k} disabled={!list.length}>
          <span>{label}</span>
          <b>{list.length}</b>
          {list.length > 0 && <span className={`chev ${open === k ? 'up' : ''}`} />}
        </button>
        {open === k && (
          <div className="dl-b">
            {list.map((b) => (
              <button key={b.name} className="li" onClick={() => (onPickBot && !b.hidden ? (onPickBot(b.name), onClose()) : null)}>
                <Avatar bot={b} size={22} />
                <span className="dl-n">{b.name}</span>
                <span className="muted small">{b.team} · {b.ts ? durationShort(b.ts - now) : 'sem status'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <Modal title="Painel do sistema" onClose={onClose}>
      <div className="dash">
        <div className="dash-tiles">
          {tiles.map(([k, v, c, sub]) => (
            <div key={k} className={`tile ${c}`}>
              <span>{k}</span>
              <b>{v}</b>
              {sub && <small>{sub}</small>}
            </div>
          ))}
        </div>
        <div className="dash-card">
          <div className="dc-h"><span>Mensagens por 5 min</span><small className="muted">última hora</small></div>
          <div className="spark">
            {buckets.map((v, i) => <i key={i} style={{ height: `${Math.max(4, (v / maxB) * 100)}%`, opacity: v ? 1 : 0.3 }} title={`${v} mensagens`} />)}
          </div>
        </div>
        <div className="dash-card">
          <div className="dc-h"><span>{visible.length} bots no escritório</span><small className="muted">{groups.hidden.length} ocultos</small></div>
          <div className="stack">
            {segs.map(([k, l, c]) => groups[k].length > 0 && <i key={k} style={{ flex: groups[k].length, background: c }} title={`${l}: ${groups[k].length}`} />)}
          </div>
          <div className="legend">
            {segs.map(([k, l, c]) => (
              <span key={k}><i style={{ background: c }} />{l} <b>{groups[k].length}</b></span>
            ))}
          </div>
        </div>
        <List k="waiting" label="Esperando você" tone="warn" />
        <List k="error" label="Com erro" tone="bad" />
        <List k="slow" label="Demorando mais que o normal" tone="warn" />
        <List k="silent" label="Sem sinal há 2 h ou mais" />
        <List k="hidden" label="Ocultos no Grok" />
        <button className="dark report-btn" onClick={() => weeklyReport(data, data.office?.name)}>Gerar relatório da semana (imagem)</button>
        <div className="dash-foot muted small">
          <span>Último roster: {data.rosterT ? durationShort(data.rosterT - Date.now()) : 'nenhum'}</span>
          <span>Dados no navegador: {(storage / 1024).toFixed(0)} KB</span>
        </div>
        {!topic && <p className="muted small">Na demonstração os dados são simulados neste navegador.</p>}
      </div>
    </Modal>
  )
}

const KEYS = [
  ['↑ / ↓', 'Trocar de andar'],
  ['W A S D', 'Andar com a câmera'],
  ['Arrastar', 'Girar · botão direito ou 2 dedos: mover'],
  ['Rolar / pinça', 'Zoom'],
  ['Ctrl+K ou /', 'Buscar bot'],
  ['A', 'Fila de aprovações'],
  ['B', 'Prédio inteiro'],
  ['T', 'Tour'],
  ['N', 'Dia / noite'],
  ['F', 'Modo TV'],
  ['H', 'Saúde do sistema'],
  ['?', 'Esta ajuda'],
  ['Esc', 'Fechar / desmarcar'],
]
export function ShortcutsModal({ onClose }) {
  return (
    <Modal title="Atalhos" onClose={onClose}>
      <div className="keys">
        {KEYS.map(([k, d]) => (
          <div key={k} className="krow">
            <kbd>{k}</kbd>
            <span>{d}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

/** Switch between saved offices, name them, copy a view-only link. */
export function OfficesModal({ current, onSwitch, onAdd, onClose }) {
  const [list, setList] = useState(listOffices)
  const [copied, setCopied] = useState(null)
  return (
    <Modal title="Escritórios" onClose={onClose}>
      {list.length === 0 && <p className="muted pad">Nenhum escritório salvo ainda.</p>}
      {list.map((o, i) => (
        <div key={o.code} className={`office ${o.code === current ? 'cur' : ''}`}>
          <input
            value={o.label}
            placeholder={`Escritório ${i + 1}`}
            onChange={(e) => {
              renameOffice(o.code, e.target.value)
              setList(listOffices())
            }}
            aria-label="Nome do escritório"
          />
          {o.readonly && <em className="tag-hidden">só leitura</em>}
          <div className="ob">
            {o.code !== current ? (
              <button className="dark sm" onClick={() => (onSwitch(o.code), onClose())}>Abrir</button>
            ) : (
              <span className="muted small">atual</span>
            )}
            {!o.readonly && (
              <button
                className="ghost sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(viewOnlyLink(o.code))
                    setCopied(o.code)
                    setTimeout(() => setCopied(null), 2000)
                  } catch {
                    /* clipboard blocked */
                  }
                }}
                title="Link que só permite ver (sem aprovar, reagir ou responder)"
              >
                {copied === o.code ? 'Copiado!' : 'Link só leitura'}
              </button>
            )}
            {o.code !== current && (
              <button
                className="ghost sm"
                aria-label="Remover"
                onClick={() => {
                  forgetOffice(o.code)
                  setList(listOffices())
                }}
              >
                <Close size={12} />
              </button>
            )}
          </div>
        </div>
      ))}
      <button className="ghost add" onClick={() => (onAdd(), onClose())}>+ Adicionar escritório</button>
      <p className="muted pad small">
        O link só leitura esconde aprovar, reagir e responder naquele aparelho. Quem tem o código do ntfy ainda consegue
        publicar no tópico, então compartilhe só com quem você confia.
      </p>
    </Modal>
  )
}

export { hhmm }

/** Personalise the office: a style preset, floor & wall finish and which decor is shown. */
export function LookModal({ look, onPreview, onSave, onClose, shared }) {
  const [l, setL] = useState(look)
  const names = useStore(prefStore, (p) => p.names)
  const set = (patch) => {
    const n = { ...l, ...patch }
    setL(n)
    onPreview(n)
  }
  const pickStyle = (k) => {
    const { label, sub, ...rest } = STYLES[k]
    set({ style: k, ...rest })
  }
  const toggles = [
    ['plants', 'Plantas'],
    ['rugs', 'Tapetes'],
    ['art', 'Quadros e prateleiras'],
    ['furniture', 'Cantinhos (pufes, fliperama, poltronas)'],
    ['accent', 'Faixa com a cor do time'],
    ['pet', 'Pet do andar'],
    ['seasonal', 'Decoração de datas especiais'],
  ]
  return (
    <Modal title="Personalizar escritório" onClose={() => (onPreview(null), onClose())}>
      <div className="look">
        <div className="look-styles">
          {Object.entries(STYLES).map(([k, st]) => (
            <button key={k} className={`look-style ${l.style === k ? 'on' : ''}`} aria-pressed={l.style === k} onClick={() => pickStyle(k)}>
              <span className="ls-prev" style={{ '--f': FLOORS[st.floor][1], '--w': WALLS[st.wall][1] }}>
                <i className="ls-wall" />
                <i className="ls-floor" />
                {st.plants && <i className="ls-plant" />}
                {st.rugs && <i className="ls-rug" />}
                <i className="ls-desk" />
              </span>
              <b>{st.label}</b>
              <small>{st.sub}</small>
            </button>
          ))}
        </div>
        <div className="look-row">
          <span>Piso</span>
          <div className="swatches">
            {Object.entries(FLOORS).map(([k, [lab, c]]) => (
              <button key={k} className={`sw ${l.floor === k ? 'on' : ''}`} style={{ '--c': c }} onClick={() => set({ floor: k })} title={lab} aria-label={`Piso ${lab}`} aria-pressed={l.floor === k} />
            ))}
          </div>
        </div>
        <div className="look-row">
          <span>Paredes</span>
          <div className="swatches">
            {Object.entries(WALLS).map(([k, [lab, c]]) => (
              <button key={k} className={`sw ${l.wall === k ? 'on' : ''}`} style={{ '--c': c }} onClick={() => set({ wall: k })} title={lab} aria-label={`Paredes ${lab}`} aria-pressed={l.wall === k} />
            ))}
          </div>
        </div>
        <div className="look-row">
          <span>Cor da interface</span>
          <div className="swatches">
            {Object.entries(ACCENTS).map(([k, [lab, c]]) => (
              <button key={k} className={`sw ${(l.accentColor || 'roxo') === k ? 'on' : ''}`} style={{ '--c': c }} onClick={() => set({ accentColor: k })} title={lab} aria-label={`Cor ${lab}`} aria-pressed={l.accentColor === k} />
            ))}
          </div>
        </div>
        <div className="look-toggles">
          {toggles.map(([k, lab]) => (
            <button key={k} className="toggle" onClick={() => set({ [k]: !l[k] })} aria-pressed={!!l[k]}>
              {lab} <i className={l[k] ? 'on' : ''} />
            </button>
          ))}
          <button className="toggle" onClick={() => setPref('names', !names)} aria-pressed={names}>
            Nomes dos bots sempre visíveis <i className={names ? 'on' : ''} />
          </button>
        </div>
        <p className="muted small">{shared ? 'Vale para todas as telas que usam este escritório.' : 'Vale só para este aparelho.'}</p>
        <div className="wrow">
          <button className="ghost" onClick={() => (onPreview(null), onClose())}>Cancelar</button>
          <button className="dark" onClick={() => (onSave(l), onClose())}>Salvar</button>
        </div>
      </div>
    </Modal>
  )
}

/** "Your office is empty": what to send, with a copyable example. */
export function EmptyOffice() {
  const [copied, setCopied] = useState(false)
  const example = `curl -d '{"roster":[{"name":"Meu Bot","shape":"blob","color":"green","team":"Ops"}]}' https://ntfy.sh/SEU_CODIGO`
  return (
    <div className="card emptyoffice">
      <b>Seu escritório ainda está vazio</b>
      <p>Envie a lista de bots (roster) para o seu código no ntfy. Cada time vira um andar. Depois, cada bot só precisa mandar o status.</p>
      <pre>{example}</pre>
      <button
        className="dark sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(example)
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? 'Copiado!' : 'Copiar exemplo'}
      </button>
    </div>
  )
}

/** Small "Enviando… / Enviado ✓ / Falhou · tentar de novo" pill for things published to the topic. */
export function SendStatus({ s, onRetry }) {
  if (!s) return null
  return (
    <div className={`card sendstatus ${s.state}`} role="status" aria-live="polite">
      {s.state === 'sending' && 'Enviando…'}
      {s.state === 'ok' && (
        <>
          <Check size={13} /> Enviado
        </>
      )}
      {s.state === 'fail' && (
        <>
          Falhou ao enviar · <button className="link" onClick={onRetry}>tentar de novo</button>
        </>
      )}
    </div>
  )
}
