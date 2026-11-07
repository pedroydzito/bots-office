import { useState } from 'react'
import Avatar from './Avatar'
import { Arrow, Brain, Chat, Check, Close, Doc, Down, Minus, Moon, Pause, Play, Plus, Sun, Up } from './Icons'
import { CORTEX_KEY, durationShort, effStatus, hhmm, resolveColor, STATUS, talkActive } from '../lib/constants'
import { sceneSignals } from '../scene/registry'

const STATUS_WORD = { working: 'Trabalhando', waiting_user: 'Esperando você', error: 'Erro', done: 'Concluído', resting: 'Descansando' }

export function Brand({ conn, now }) {
  const label = { live: 'Ao vivo', syncing: 'Sincronizando', reconnecting: 'Reconectando', demo: 'Demo' }[conn] || conn
  return (
    <div className="card brand">
      <span className="logo">
        <svg viewBox="0 0 24 24" width="14" height="14"><rect x="4" y="4" width="16" height="16" rx="5" fill="#fff" /></svg>
      </span>
      <b>Escritório de Bots</b>
      <span className={`conn conn-${conn}`}>
        <i /> {label} · {hhmm(now)}
      </span>
    </div>
  )
}

export function ModeToggles({ night, setNight, tour, setTour }) {
  return (
    <div className="card toggles">
      <button className={!night ? 'on' : ''} onClick={() => setNight(false)}><Sun /> Dia</button>
      <button className={night ? 'on' : ''} onClick={() => setNight(true)}><Moon /> Noite</button>
      <button className={tour ? 'on' : ''} onClick={() => setTour(!tour)}>{tour ? <Pause size={12} /> : <Play size={12} />} Tour</button>
    </div>
  )
}

export function Pills({ counts }) {
  return (
    <div className="card pills">
      <span><i style={{ background: STATUS.working.color }} /> <b>{counts.working}</b> trabalhando</span>
      <span><i style={{ background: STATUS.waiting_user.color }} /> <b>{counts.waiting_user}</b> esperando</span>
      <span><i style={{ background: STATUS.error.color }} /> <b>{counts.error}</b> erros</span>
      <span><i style={{ background: STATUS.resting.color }} /> <b>{counts.resting}</b> descansando</span>
      {counts.talks > 0 && <span><i style={{ background: '#8F59F9' }} /> <b>{counts.talks}</b> conversando</span>}
    </div>
  )
}

export function Toast({ bot, onView, onApprove }) {
  if (!bot) return null
  return (
    <div className="card toast" key={bot.name + bot.ts}>
      <Avatar bot={bot} size={30} />
      <div className="tx">
        <b>{bot.name} precisa de você</b>
        <span>{bot.step || 'Precisa do seu OK'}</span>
      </div>
      <button className="ghost" onClick={onView}>Ver</button>
      <button className="dark" onClick={onApprove}>Aprovar</button>
    </div>
  )
}

function Collapse({ title, count, open, setOpen, children, accent }) {
  return (
    <div className="card collapse">
      <button className="ch" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <em className={accent && count ? 'accent' : ''}>{count}</em>
        <svg className={open ? 'up' : ''} viewBox="0 0 24 24" width="14" height="14"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
      {open && <div className="cb">{children}</div>}
    </div>
  )
}

export function LeftPanel({ floors, data, now, selectedKey, onFloor, waiting, onApprove, onPickBot, talks }) {
  const [open, setOpen] = useState({ waiting: true, talks: true, finished: false, routines: false })
  const tog = (k) => (v) => setOpen((o) => ({ ...o, [k]: v }))
  const finished = data.order.filter((n) => effStatus(data.bots[n], now) === 'done')
  const routines = Object.entries(data.routines).flatMap(([b, items]) => items.map((it) => ({ bot: b, ...it })))
  return (
    <div className="left">
      <div className="card floors">
        <div className="hd"><span>Andares</span><em>{floors.length}</em></div>
        {[...floors].reverse().map((f) => {
          const isC = f.key === CORTEX_KEY
          const st = isC ? [] : f.bots.map((n) => effStatus(data.bots[n], now))
          const working = st.filter((s) => s === 'working').length
          return (
            <button key={f.key} className={`floor ${selectedKey === f.key ? 'sel' : ''}`} onClick={() => onFloor(f.key)}>
              <span className="num" style={{ '--team': f.color }}>{f.num}</span>
              <span className="fname">
                {f.name}
                {isC ? (
                  <small>{data.cortex ? `${data.cortex.notes.toLocaleString('pt-BR')} notas` : 'biblioteca'}</small>
                ) : (
                  <span className="dots">
                    {st.slice(0, 14).map((s, i) => (
                      <i key={i} style={{ background: STATUS[s].color }} />
                    ))}
                  </span>
                )}
              </span>
              {!isC && <span className="cnt">{working}/{f.bots.length}</span>}
              {isC && <span className="cnt"><Brain size={16} /></span>}
            </button>
          )
        })}
      </div>
      <Collapse title="Esperando por mim" count={waiting.length} open={open.waiting} setOpen={tog('waiting')} accent>
        {waiting.length === 0 && <p className="muted">Nada precisa de você</p>}
        {waiting.map((b) => (
          <div key={b.name} className="li">
            <Avatar bot={b} size={24} />
            <div className="lt" onClick={() => onPickBot(b.name)}>
              <b>{b.name}</b>
              <span>{b.step || 'Precisa do seu OK'}</span>
            </div>
            <button className="dark sm" onClick={() => onApprove(b.name)}>Aprovar</button>
          </div>
        ))}
      </Collapse>
      {talks.length > 0 && (
        <Collapse title="Conversando agora" count={talks.length} open={open.talks} setOpen={tog('talks')}>
          {talks.map(([f, t]) => (
            <div key={f} className="li talk" onClick={() => onPickBot(f)}>
              <Avatar bot={data.bots[f]} size={22} />
              <span className="arrow"><Arrow size={12} /></span>
              <Avatar bot={data.bots[t.to]} size={22} />
              <div className="lt">
                <b>{f} <Arrow size={11} /> {t.to}</b>
                <span>{t.step}</span>
              </div>
            </div>
          ))}
        </Collapse>
      )}
      <Collapse title="Concluídos" count={finished.length} open={open.finished} setOpen={tog('finished')}>
        {finished.length === 0 && <p className="muted">Nada concluído recentemente</p>}
        {finished.slice(0, 12).map((n) => (
          <div key={n} className="li" onClick={() => onPickBot(n)}>
            <Avatar bot={data.bots[n]} size={22} />
            <div className="lt">
              <b>{n}</b>
              <span>{data.bots[n].step || 'Pronto'} · {hhmm(data.bots[n].ts)}</span>
            </div>
          </div>
        ))}
      </Collapse>
      <Collapse title="Rotinas" count={routines.length} open={open.routines} setOpen={tog('routines')}>
        {routines.length === 0 && <p className="muted">Nenhuma rotina informada</p>}
        {routines.slice(0, 20).map((r, i) => (
          <div key={i} className="li" onClick={() => onPickBot(r.bot)}>
            <Avatar bot={data.bots[r.bot]} size={22} />
            <div className="lt">
              <b>{r.name || 'Rotina'}</b>
              <span>{r.bot} · {r.schedule}{r.next_run ? ` · próxima ${fmtNext(r.next_run)}` : ''}</span>
            </div>
          </div>
        ))}
      </Collapse>
    </div>
  )
}

export function fmtNext(s) {
  const t = Date.parse(s)
  if (!isFinite(t)) return s
  const d = t - Date.now()
  return d > 0 ? `em ${durationShort(d)}` : durationShort(d)
}

function headerColor(sts) {
  if (sts.includes('error')) return STATUS.error.color
  if (sts.includes('waiting_user')) return STATUS.waiting_user.color
  if (sts.includes('working')) return STATUS.working.color
  if (sts.includes('done')) return STATUS.done.color
  return '#8b9099'
}

export function RightPanel({ floor, data, now, onPickBot, selectedBot, onClose, chatOf, onApprove }) {
  if (selectedBot && data.bots[selectedBot]) {
    const b = data.bots[selectedBot]
    const st = effStatus(b, now)
    const talk = data.talks[selectedBot]
    const incoming = Object.entries(data.talks).filter(([f, t]) => t.to === selectedBot && talkActive(t, now))
    const link = chatOf(selectedBot)
    const usage = data.usage?.bots?.[selectedBot]
    return (
      <div className="right card botcard">
        <div className="bh" style={{ background: resolveColor(b.color) }}>
          <button className="x" onClick={onClose} aria-label="Fechar"><Close size={16} /></button>
          <Avatar bot={b} size={46} />
          <div>
            <b>{b.name}</b>
            <span>{b.team}</span>
          </div>
        </div>
        <div className="bb">
          <div className="row"><span className="badge" style={{ '--c': STATUS[st].color }}>{STATUS_WORD[st]}</span><span className="muted">{b.ts ? `${durationShort(b.ts - now)}` : 'sem atualizações'}</span></div>
          <p className="step">{b.step || '—'}</p>
          {talk && talkActive(talk, now) && <p className="talkline"><Chat size={13} /> Conversando com <b>{talk.to}</b>: {talk.step}</p>}
          {incoming.map(([f, t]) => (
            <p key={f} className="talkline"><Chat size={13} /> <b>{f}</b> está visitando: {t.step}</p>
          ))}
          {usage != null && <div className="row"><span className="muted">Uso semanal</span><b>{usage}%</b></div>}
          {(data.routines[selectedBot] || []).length > 0 && (
            <div className="sub">
              <h4>Rotinas</h4>
              {data.routines[selectedBot].map((r, i) => (
                <div key={i} className="mini"><b>{r.name}</b><span>{r.schedule}{r.next_run ? ` · próxima ${fmtNext(r.next_run)}` : ''}</span></div>
              ))}
            </div>
          )}
          <div className="actions">
            {link && <a className="btn ghost" href={link} target={link.startsWith('https') ? '_blank' : undefined} rel="noopener noreferrer">Abrir chat</a>}
            {st === 'waiting_user' && <button className="dark" onClick={() => onApprove(selectedBot)}>Aprovar</button>}
          </div>
        </div>
      </div>
    )
  }
  if (!floor) return null
  if (floor.key === CORTEX_KEY) {
    const c = data.cortex
    return (
      <div className="right card">
        <div className="fh" style={{ background: '#8F59F9' }}>
          <div className="r1"><b>Cortex</b><span>Andar {floor.num} · Biblioteca</span></div>
          <div className="big"><b>{c ? c.notes.toLocaleString('pt-BR') : 0}</b> notas</div>
        </div>
        <div className="list">
          {(c?.recent || []).map((r, i) => (
            <div key={i} className="li">
              <span className="doc"><Doc size={16} /></span>
              <div className="lt"><b>{r.title}</b><span>{r.updated ? `atualizado ${fmtNext(r.updated)}` : ''}</span></div>
            </div>
          ))}
          {!c && <p className="muted pad">Ainda sem dados do Cortex.</p>}
        </div>
      </div>
    )
  }
  const sts = floor.bots.map((n) => effStatus(data.bots[n], now))
  const working = sts.filter((s) => s === 'working').length
  const visitors = Object.entries(data.talks).filter(([f, t]) => talkActive(t, now) && floor.bots.includes(t.to) && !floor.bots.includes(f))
  return (
    <div className="right card">
      <div className="fh" style={{ background: headerColor(sts) }}>
        <div className="r1"><b>{floor.name}</b><span>Andar {floor.num} · {floor.bots.length} bots</span></div>
        <div className="big"><b>{working}</b> trabalhando</div>
      </div>
      <div className="list">
        {floor.bots.map((n, i) => {
          const b = data.bots[n]
          const st = sts[i]
          const talk = data.talks[n]
          const talking = talkActive(talk, now)
          return (
            <button key={n} className="li bot" onClick={() => onPickBot(n)}>
              <Avatar bot={b} size={30} ring={STATUS[st].color} />
              <div className="lt">
                <b>{n}</b>
                <span>{talking ? `Conversando com ${talk.to} · ${talk.step}` : `${STATUS_WORD[st]}${b.step && st !== 'resting' ? ' · ' + b.step : ''}`}</span>
              </div>
            </button>
          )
        })}
        {visitors.map(([f, t]) => (
          <button key={'v' + f} className="li bot visitor" onClick={() => onPickBot(f)}>
            <Avatar bot={data.bots[f]} size={30} ring="#8F59F9" />
            <div className="lt">
              <b>{f} <em>visitando</em></b>
              <span>com {t.to} · {t.step}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function Activity({ data, onPick }) {
  const items = data.activity.slice(0, 7)
  return (
    <div className="card activity">
      <div className="hd"><span>Atividade</span></div>
      {items.length === 0 && <p className="muted">Aguardando a primeira mensagem…</p>}
      {items.map((a, i) => (
        <div key={`${a.t}|${a.kind}|${a.bot || a.from}|${a.to || ''}`} className="act" onClick={() => onPick(a.kind === 'talk' ? a.from : a.bot)}>
          <time>{hhmm(a.t)}</time>
          {a.kind === 'talk' ? (
            <span>
              <b>{a.from} <Arrow size={11} /> {a.to}</b>: {a.end && <Check size={11} />} {a.step}
            </span>
          ) : (
            <span>
              <b>{a.bot}</b> · <i className={`st st-${a.status}`}>{a.step || STATUS_WORD[a.status === 'idle' ? 'resting' : a.status]}</i>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export function Weekly({ usage, data }) {
  const top = usage ? Object.entries(usage.bots).sort((a, b) => b[1] - a[1]).slice(0, 4) : []
  const reset = usage?.resets_at ? Date.parse(usage.resets_at) : NaN
  return (
    <div className="weekly-wrap">
      <div className="zoom card">
        <button onClick={() => (sceneSignals.zoom = 1)} aria-label="Aproximar"><Plus size={16} /></button>
        <button onClick={() => (sceneSignals.zoom = -1)} aria-label="Afastar"><Minus size={16} /></button>
      </div>
      <div className="card weekly">
        <div className="hd">
          <span>Limite semanal</span>
          <span className="muted">{isFinite(reset) ? `Renova em ${durationShort(reset - Date.now())}` : ''}</span>
        </div>
        {usage ? (
          <>
            <div className="pct"><b>{Math.round(usage.total)}%</b><span className="muted">usado</span></div>
            <div className="bar"><i style={{ width: `${Math.min(100, usage.total)}%`, background: usage.total > 85 ? '#E5484D' : usage.total > 65 ? '#F5A524' : '#16181d' }} /></div>
            {top.map(([n, v]) => (
              <div key={n} className="ub">
                <i style={{ background: resolveColor(data.bots[n]?.color) }} />
                <span>{n}</span>
                <em>{v}%</em>
              </div>
            ))}
          </>
        ) : (
          <p className="muted">Nenhum uso informado ainda</p>
        )}
      </div>
    </div>
  )
}

export function Hints() {
  return (
    <div className="card hints">
      <span><b>Arrastar</b> girar</span>
      <span><b>Botão direito</b> mover</span>
      <span><b>WASD</b> andar</span>
      <span><b>Rolar</b> zoom</span>
      <span><b><Up size={11} /><Down size={11} /></b> andares</span>
    </div>
  )
}

export function ConnectBanner({ onSignIn }) {
  return (
    <div className="card connect">
      <span className="demo-tag">Demo</span>
      <span className="muted">Bots simulados. Tem um código de acesso?</span>
      <button className="dark sm" onClick={onSignIn}>Inserir código de acesso</button>
    </div>
  )
}
