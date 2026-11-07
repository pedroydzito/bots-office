import { useEffect, useState } from 'react'
import Avatar from './Avatar'
import { Check, Close } from './Icons'
import { durationShort, effStatus, hhmm } from '../lib/constants'
import { health } from '../lib/health'
import { forgetOffice, listOffices, renameOffice, viewOnlyLink } from '../lib/auth'

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
export function HealthModal({ conn, data, now, onClose, topic }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const avg = health.delays.length ? Math.round(health.delays.reduce((a, b) => a + b, 0) / health.delays.length) : null
  const silent = data.order.filter((n) => now - (data.bots[n]?.ts || 0) > 2 * 3600e3)
  let storage = 0
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('bot-office')) storage += (localStorage.getItem(k) || '').length
  } catch {
    /* ignore */
  }
  const ok = conn === 'live' || conn === 'demo'
  const rows = [
    ['Conexão', conn === 'live' ? 'Ao vivo' : conn === 'demo' ? 'Demonstração' : conn === 'syncing' ? 'Sincronizando' : 'Reconectando', ok ? 'good' : 'warn'],
    ['Conectado há', health.connectedAt ? durationShort(now - health.connectedAt) : '—'],
    ['Última mensagem', health.lastAt ? `${durationShort(Date.now() - health.lastAt).replace('há ', '')} atrás` : 'nenhuma desde que abriu'],
    ['Atraso médio', avg == null ? '—' : `${(avg / 1000).toFixed(1)} s`, avg != null && avg > 5000 ? 'warn' : 'good'],
    ['Mensagens na última hora', String(health.received.length)],
    ['Bots', `${data.order.length}`],
    ['Bots ocultos', (() => { const h = data.order.filter((n) => data.bots[n]?.hidden); return h.length ? `${h.length} · ${h.slice(0, 4).join(', ')}${h.length > 4 ? '…' : ''}` : '0' })()],
    ['Último roster', data.rosterT ? `${durationShort(Date.now() - data.rosterT).replace('há ', '')} atrás` : 'nenhum recebido'],
    ['Sem sinal há 2h+', `${silent.length}`, silent.length ? 'warn' : 'good'],
    ['Dados salvos no navegador', `${(storage / 1024).toFixed(0)} KB`],
  ]
  return (
    <Modal title="Saúde do sistema" onClose={onClose}>
      <div className="hgrid">
        {rows.map(([k, v, c]) => (
          <div key={k} className={`hrow ${c || ''}`}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      {silent.length > 0 && (
        <p className="muted pad small">Sem sinal: {silent.slice(0, 12).join(', ')}{silent.length > 12 ? '…' : ''}</p>
      )}
      {!topic && <p className="muted pad small">Na demonstração os dados são simulados neste navegador.</p>}
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

/** Shared office settings: name, weekly goal and pet per team. Saved to the topic, so every device sees them. */
export function OfficeSettingsModal({ data, floors, onSave, onClose }) {
  const teams = floors.filter((f) => f.bots.length).map((f) => f.key)
  const [name, setName] = useState(data.office?.name || '')
  const [goals, setGoals] = useState(() => Object.fromEntries(teams.map((t) => [t, { label: data.goals?.[t]?.label || '', target: data.goals?.[t]?.target || '' }])))
  const [pets, setPets] = useState(() => Object.fromEntries(teams.map((t) => [t, data.pets?.[t] || ''])))
  const save = () => {
    const g = {}
    for (const [t, v] of Object.entries(goals)) if (+v.target > 0) g[t] = { label: v.label || 'Meta da semana', target: +v.target }
    const p = {}
    for (const [t, v] of Object.entries(pets)) if (v) p[t] = v
    onSave({ office: { name }, goals: g, pets: p })
    onClose()
  }
  return (
    <Modal title="Configurar escritório" onClose={onClose} wide>
      <p className="muted pad small">Fica salvo no seu tópico: todos os aparelhos com este código veem igual.</p>
      <label className="fld">
        <span>Nome do escritório</span>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Escritório de Bots" />
      </label>
      <div className="teamcfg">
        <div className="tc-h"><span>Time</span><span>Meta da semana</span><span>Quantidade</span><span>Pet</span></div>
        {teams.map((t) => (
          <div key={t} className="tc-r">
            <b>{t}</b>
            <input value={goals[t].label} placeholder="Tarefas da semana" onChange={(e) => setGoals((g) => ({ ...g, [t]: { ...g[t], label: e.target.value.slice(0, 40) } }))} aria-label={`Meta de ${t}`} />
            <input type="number" min="0" value={goals[t].target} placeholder="0" onChange={(e) => setGoals((g) => ({ ...g, [t]: { ...g[t], target: e.target.value } }))} aria-label={`Quantidade da meta de ${t}`} />
            <select value={pets[t]} onChange={(e) => setPets((p) => ({ ...p, [t]: e.target.value }))} aria-label={`Pet de ${t}`}>
              <option value="">Automático</option>
              <option value="cat">Gato</option>
              <option value="dog">Cachorro</option>
              <option value="fish">Aquário</option>
              <option value="none">Nenhum</option>
            </select>
          </div>
        ))}
      </div>
      <div className="wrow" style={{ marginTop: 10 }}>
        <button className="ghost" onClick={onClose}>Cancelar</button>
        <button className="dark" onClick={save}>Salvar para todos</button>
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
