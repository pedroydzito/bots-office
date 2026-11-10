import { memo, useEffect, useState } from 'react'
import Avatar from './Avatar'
import { Clap, Heart, Laugh, Mail, Party, ThumbUp, Trophy } from './Icons'
import { Arrow, Auto, Building2, Search as SearchIco, Brain, Chat, Check, Close, Doc, Down, Minus, Moon, Pause, Play, Plus, Sun, Up } from './Icons'
import { CORTEX_KEY, durationShort, effStatus, hhmm, isApproval, resolveColor, STATUS, talkActive } from '../lib/constants'
import { sceneSignals } from '../scene/registry'
import { botMetrics, fmtDuration, taskStats } from '../lib/metrics'
import { DecisionBox, isStuck } from './Ops'
import { useSwipeDown } from './Interact'
import { pipSupported, togglePiP } from '../lib/pip'

const STATUS_WORD = { working: 'Trabalhando', waiting_user: 'Esperando você', error: 'Erro', done: 'Concluído', resting: 'Descansando' }

export function Brand({ conn, now, name, onClick }) {
  const label = { live: 'Ao vivo', syncing: 'Sincronizando', reconnecting: 'Reconectando', demo: 'Demo' }[conn] || conn
  return (
    <button className="card brand" onClick={onClick} title="Trocar de escritório" aria-label="Trocar de escritório">
      <span className="logo">
        <svg viewBox="0 0 64 64" width="24" height="24" aria-hidden="true"><rect x="18.5" y="18.5" width="27" height="27" rx="7.5" fill="#fff" /><ellipse cx="31.4" cy="29.6" rx="1.9" ry="3.6" fill="#111" transform="rotate(24 31.4 29.6)" /><ellipse cx="37.3" cy="29.6" rx="1.9" ry="3.6" fill="#111" transform="rotate(24 37.3 29.6)" /></svg>
      </span>
      <b>{name || 'Escritório de Bots'}</b>
      <span className={`conn conn-${conn}`}>
        <i title={label} /> {conn === 'live' ? '' : `${label} · `}{hhmm(now)}
      </span>
    </button>
  )
}

export function ModeToggles({ mode, setMode, tour, setTour, overview, setOverview, onSearch }) {
  return (
    <div className="card toggles">
      <button className={`light-btn ${mode === 'day' ? 'on' : ''}`} aria-pressed={mode === 'day'} onClick={(e) => setMode('day', e)} title="Dia"><Sun /> <span className="lbl">Dia</span></button>
      <button className={`light-btn ${mode === 'night' ? 'on' : ''}`} aria-pressed={mode === 'night'} onClick={(e) => setMode('night', e)} title="Noite"><Moon /> <span className="lbl">Noite</span></button>
      <button className={`light-btn ${mode === 'auto' ? 'on' : ''}`} aria-pressed={mode === 'auto'} onClick={(e) => setMode('auto', e)} title="Automático (hora real)"><Auto /> <span className="lbl">Auto</span></button>
      <button className={overview ? 'on' : ''} aria-pressed={overview} onClick={() => setOverview(!overview)} title={overview ? "Ver só uma sala (B)" : "Ver todas as salas (B)"}><Building2 /> <span className="lbl">{overview ? "Uma sala" : "Todas as salas"}</span></button>
      {pipSupported() && (
        <button className="pip-btn" onClick={() => togglePiP().catch(() => {})} title="Janela flutuante (P): o escritório num cantinho da tela" aria-label="Abrir janela flutuante">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><rect x="12" y="12" width="7" height="5" rx="1.2" fill="currentColor" stroke="none" /></svg>
        </button>
      )}
      <button className="search-ico" onClick={onSearch} title="Buscar bot (Ctrl+K)"><SearchIco /></button>
    </div>
  )
}

function Pill({ color, n, label }) {
  // on phones only the number shows; tapping reveals the label
  return (
    <span tabIndex={0} title={label}>
      <i style={{ background: color }} /> <b key={n} className="bump">{n}</b> <span className="lbl">{label}</span>
    </span>
  )
}

export const Pills = memo(function Pills({ counts }) {
  return (
    <div className="card pills">
      <Pill color={STATUS.working.color} n={counts.working} label="trabalhando" />
      <Pill color={STATUS.waiting_user.color} n={counts.waiting_user} label="esperando" />
      <Pill color={STATUS.error.color} n={counts.error} label="erros" />
      <Pill color={STATUS.resting.color} n={counts.resting} label="descansando" />
      {counts.talks > 0 && <Pill color="#8F59F9" n={counts.talks} label="conversando" />}
    </div>
  )
})

export function Toast({ bot, onView, onApprove, onReply }) {
  if (!bot) return null
  const appr = isApproval(bot)
  return (
    <div className="card toast" key={bot.name + bot.ts}>
      <Avatar bot={bot} size={30} />
      <div className="tx">
        <b>{bot.name} precisa de você</b>
        <span>{bot.step || (appr ? 'Precisa do seu OK' : 'Quer uma resposta sua')}</span>
      </div>
      <button className="ghost" onClick={onView}>Ver</button>
      {appr ? <button className="dark" onClick={onApprove}>Aprovar</button> : <button className="dark" onClick={onReply}>Responder</button>}
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

export function LeftPanel({ floors, data, now, selectedKey, onFloor, waiting, onApprove, onPickBot, talks, onQueue, loading, onCollapse }) {
  const [open, setOpen] = useState({ waiting: true, talks: true, finished: false, routines: false })
  const tog = (k) => (v) => setOpen((o) => ({ ...o, [k]: v }))
  const finished = data.order.filter((n) => effStatus(data.bots[n], now) === 'done')
  const routines = Object.entries(data.routines).flatMap(([b, items]) => items.map((it) => ({ bot: b, ...it })))
  if (loading)
    return (
      <div className="left">
        <div className="card floors">
          <div className="esqueleto" style={{ height: 12, width: 70, borderRadius: 6, margin: '4px 6px 10px' }} />
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="sk-row">
              <span className="esqueleto" style={{ width: 24, height: 24, borderRadius: 8 }} />
              <span className="esqueleto" style={{ height: 11, width: `${60 - k * 8}%`, borderRadius: 5 }} />
            </div>
          ))}
        </div>
      </div>
    )
  return (
    <div className="left">
      <div className="card floors">
        <div className="hd">
          <span>Salas</span>
          <em>{floors.length}</em>
          {onCollapse && (
            <button className="panel-ico" onClick={onCollapse} title="Esconder painel ( [ )" aria-label="Esconder painel lateral">
              <PanelIcon />
            </button>
          )}
        </div>
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
        {waiting.length === 0 && <Empty icon={<Check size={14} />} title="Tudo em dia" sub={(() => { const w = data.order.filter((n) => effStatus(data.bots[n], now) === 'working').length; return w ? `${w} trabalhando agora · nada depende de você` : 'Nenhum bot precisa de aprovação' })()} />}
        {waiting.length > 1 && onQueue && <button className="ghost sm qbtn" onClick={onQueue}>Ver fila completa (A)</button>}
        {waiting.map((b) => (
          <div key={b.name} className="li">
            <Avatar bot={b} size={24} />
            <div className="lt" onClick={() => onPickBot(b.name)}>
              <b>{b.name}</b>
              <span>{b.step || (isApproval(b) ? 'Precisa do seu OK' : 'Quer uma resposta sua')}</span>
            </div>
            {isApproval(b) ? <button className="dark sm" onClick={() => onApprove(b.name)}>Aprovar</button> : <button className="ghost sm" onClick={() => onPickBot(b.name)}>Ver</button>}
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
        {finished.length === 0 && <Empty title="Nada concluído recentemente" sub={(() => { const last = [...(data.history || [])].reverse().find((h) => h.status === 'done'); return last ? `Última entrega: ${last.bot} · ${durationShort(last.t - now)}` : 'As entregas aparecem aqui' })()} />}
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
        {routines.length === 0 && <Empty title="Nenhuma rotina informada" sub='Os bots podem enviar {"routines":…} com o que rodam e quando' />}
        {routines.slice(0, 20).map((r, i) => (
          <div key={i} className="li" onClick={() => onPickBot(r.bot)}>
            <Avatar bot={data.bots[r.bot]} size={22} />
            <div className="lt">
              <b>{r.name || 'Rotina'}</b>
              <span>{r.bot} · {r.schedule}{r.next_run ? <> · <RoutineWhen next={r.next_run} now={now} /></> : ''}</span>
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

export function RightPanel({ floor, data, now, onPickBot, selectedBot, onClose, chatOf, onApprove, onReact, onDecide }) {
  const [full, setFull] = useState(false)
  const swipe = useSwipeDown(() => (full ? setFull(false) : onClose()), () => setFull(true))
  const [tab, setTab] = useState('now')
  useEffect(() => (setTab('now'), setFull(false)), [selectedBot])
  if (selectedBot && data.bots[selectedBot]) {
    const b = data.bots[selectedBot]
    const st = effStatus(b, now)
    const talk = data.talks[selectedBot]
    const incoming = Object.entries(data.talks).filter(([f, t]) => t.to === selectedBot && talkActive(t, now))
    const link = chatOf(selectedBot)
    const usage = data.usage?.bots?.[selectedBot]
    return (
      <div className={`right card botcard ${full ? 'full' : ''}`} style={swipe.dy ? { transform: `translateY(${swipe.dy}px)`, transition: 'none' } : undefined}>
        <div className="bh" style={{ background: resolveColor(b.color) }} {...swipe.handlers}>
          <span className="grab" aria-hidden="true" />
          <button className="x" onClick={onClose} aria-label="Fechar"><Close size={16} /></button>
          <Avatar bot={b} size={46} />
          <div>
            <b>{b.name}</b>
            <span>{b.team}</span>
          </div>
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[['now', 'Agora'], ['hist', 'Histórico'], ['metrics', 'Métricas'], ...((data.routines[selectedBot] || []).length ? [['routines', `Rotinas · ${data.routines[selectedBot].length}`]] : [])]}
        />
        {tab === 'now' && (
        <>
        <div className="bb">
          <div className="row"><span className="badge" data-st={st} style={{ '--c': STATUS[st].color }}>{STATUS_WORD[st]}</span><span className="muted">{b.ts ? `${durationShort(b.ts - now)}` : 'sem atualizações'}</span></div>
          <p className="step">{st === 'resting' && b.step ? `Última: ${b.step}` : b.step || '—'}</p>
          {st === 'working' && b.progress != null && (
            <div className="progress" role="progressbar" aria-valuenow={Math.round(b.progress)} aria-valuemin={0} aria-valuemax={100}>
              <i style={{ width: `${b.progress}%` }} />
              <span>{Math.round(b.progress)}%</span>
            </div>
          )}
          {(() => {
            // work handed over between bots (mail / handoff) in the last 30 min
            const ms = (data.mail || []).filter((m) => (m.to === selectedBot || m.from === selectedBot) && now - m.t < 30 * 60e3).slice(-2)
            return ms.map((m) => (
              <p key={m.t + m.from} className="handoff">
                {m.to === selectedBot ? <>Recebeu de <b>{m.from}</b></> : <>Passou para <b>{m.to}</b></>}: {m.subject} · {durationShort(m.t - now)}
              </p>
            ))
          })()}
          {isStuck(b, now) && <em className="stuck">parado no mesmo passo há {durationShort(now - b.ts)}</em>}
          {(() => {
            const ts = taskStats(data, selectedBot, now)
            return ts.slow ? (
              <em className="stuck slow">Demorando mais que o normal: {fmtDuration(ts.elapsed)} (média {fmtDuration(ts.avg)})</em>
            ) : null
          })()}
          {st === 'waiting_user' && onDecide && isApproval(b) && <DecisionBox bot={selectedBot} onDecide={onDecide} />}
          {st === 'waiting_user' && !isApproval(b) && <p className="ask-note">Está esperando uma resposta sua{link ? ' — responda no chat.' : '.'}</p>}
          {talk && talkActive(talk, now) && <p className="talkline"><Chat size={13} /> Conversando com <b>{talk.to}</b>: {talk.step}</p>}
          {incoming.map(([f, t]) => (
            <p key={f} className="talkline"><Chat size={13} /> <b>{f}</b> está visitando: {t.step}</p>
          ))}
          <div className="actions">
            {link && <a className={`btn ${st === 'waiting_user' && !isApproval(b) ? 'dark' : 'ghost'}`} href={link} target={link.startsWith('https') ? '_blank' : undefined} rel="noopener noreferrer">Abrir chat</a>}
          </div>
          {onReact && (
            <div className="reactbar" aria-label="Reagir">
              {[['like', ThumbUp, 'Curtir'], ['heart', Heart, 'Amei'], ['party', Party, 'Comemorar'], ['clap', Clap, 'Aplaudir'], ['laugh', Laugh, 'Rir']].map(([k, I, l]) => (
                <button key={k} className={`rb rb-${k}`} title={l} aria-label={l} onClick={() => onReact(selectedBot, k)}>
                  <I size={17} />
                </button>
              ))}
            </div>
          )}
        </div>
        </>
        )}
        {tab === 'hist' && <BotHistory data={data} name={selectedBot} now={now} />}
        {tab === 'metrics' && (
          <div className="bb">
            {usage != null && <div className="mini"><b>Uso semanal</b><span>{usage}% do limite</span></div>}
            <Metrics data={data} name={selectedBot} now={now} />
            {(() => {
              const ts = taskStats(data, selectedBot, now)
              return ts.avg != null ? <div className="mini"><b>Tempo médio por tarefa</b><span>{fmtDuration(ts.avg)} · {ts.samples} tarefas em 48 h</span></div> : null
            })()}
          </div>
        )}
        {tab === 'routines' && (
          <div className="bb">
            {(data.routines[selectedBot] || []).map((r, i) => (
              <div key={i} className="mini"><b>{r.name}</b><span>{r.schedule}{r.next_run ? <> · <RoutineWhen next={r.next_run} now={now} /></> : ''}</span></div>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (!floor) return null
  if (floor.key === CORTEX_KEY) {
    const c = data.cortex
    return (
      <div className="right card">
        <div className="fh" style={{ background: 'var(--accent)' }}>
          <div className="r1"><b>Cortex</b><span>Biblioteca</span></div>
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
        <div className="r1"><b>{floor.name}</b><span>Sala · {floor.bots.length} bots</span></div>
        <div className="big"><b>{working}</b> trabalhando</div>
      </div>
      <div className="list">
        {floor.bots.map((n, i) => {
          const b = data.bots[n]
          const st = sts[i]
          const talk = data.talks[n]
          const talking = talkActive(talk, now)
          return (
            <button key={n} className={`li bot ${selectedBot === n ? 'sel' : ''} ${b.hidden ? 'is-hidden' : ''}`} onClick={() => onPickBot(n)}>
              <Avatar bot={b} size={30} ring={STATUS[st].color} />
              <div className="lt">
                <b>{n}{b.hidden && <em className="tag-hidden">oculto</em>}</b>
                <span>{talking ? `Conversando com ${talk.to} · ${talk.step}` : `${STATUS_WORD[st]}${b.step && st !== 'resting' ? ' · ' + b.step : ''}`}</span>
                {isStuck(b, now) && <em className="stuck" title="Trabalhando no mesmo passo há muito tempo">parado há {durationShort(now - b.ts).replace('há ', '')}</em>}
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

const FILTERS = [
  ['all', 'Tudo'],
  ['errors', 'Erros'],
  ['talks', 'Conversas'],
  ['floor', 'Esta sala'],
]
export const Activity = memo(function Activity({ data, onPick, floorBots = [] }) {
  const [f, setF] = useState('all')
  const keep = (a) =>
    f === 'all' ||
    (f === 'errors' && a.kind === 'status' && a.status === 'error') ||
    (f === 'talks' && (a.kind === 'talk' || a.kind === 'mail')) ||
    (f === 'floor' && (floorBots.includes(a.bot) || floorBots.includes(a.from) || floorBots.includes(a.to)))
  const seen = new Set()
  const items = data.activity
    .filter(keep)
    .filter((a) => {
      if (a.kind !== 'unlock') return true
      const k = `${a.bot}|${a.step}`
      return seen.has(k) ? false : (seen.add(k), true)
    })
    .slice(0, 7)
  return (
    <div className="card activity">
      <div className="hd">
        <span>Atividade</span>
        <div className="chips">
          {FILTERS.map(([k, l]) => (
            <button key={k} className={`chip ${f === k ? 'on' : ''}`} aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>
          ))}
        </div>
      </div>
      {items.length === 0 && data.activity.length > 0 && <Empty title="Nada nesse filtro" sub="Troque o filtro para ver o resto" />}
      {items.length === 0 && data.activity.length === 0 && <Empty title="Aguardando a primeira mensagem" sub="Quando um bot mandar status, ele aparece aqui" />}
      {items.map((a, i) => (
        <div key={`${a.t}|${a.kind}|${a.bot || a.from}|${a.to || ''}|${a.step || ''}|${i}`} className="act" onClick={() => onPick(a.kind === 'talk' || a.kind === 'mail' ? a.from : a.bot)}>
          <time>{hhmm(a.t)}</time>
          {a.kind === 'decision' ? (
            <span>
              <b>Você {a.action === 'reject' ? 'recusou' : 'aprovou'} {a.bot}</b>{a.step ? `: ${a.step}` : ''}
            </span>
          ) : a.kind === 'mail' ? (
            <span>
              <b>{a.from} <Mail size={11} /> {a.to}</b>: {a.step}
            </span>
          ) : a.kind === 'unlock' ? (
            <span>
              <b>{a.bot}</b> · <i className="st st-unlock"><Trophy size={11} /> {a.step}</i>
            </span>
          ) : a.kind === 'talk' ? (
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
})

/** Usage grouped by team, and a "you'll hit 100% on…" forecast from this week's samples. */
function usageInsights(usage, data) {
  const teams = {}
  for (const [n, v] of Object.entries(usage?.bots || {})) {
    const t = data.bots[n]?.team || 'Outros'
    teams[t] = (teams[t] || 0) + v
  }
  const reset = usage?.resets_at ? Date.parse(usage.resets_at) : NaN
  const weekStart = isFinite(reset) ? reset - 7 * 24 * 3600e3 : Date.now() - 7 * 24 * 3600e3
  const hist = (data.usageHist || []).filter((h) => h.t >= weekStart)
  let forecast = null
  if (hist.length >= 2 && usage) {
    const a = hist[0], b = hist[hist.length - 1]
    const rate = (b.total - a.total) / Math.max(1, b.t - a.t) // % per ms
    if (rate > 0) {
      const eta = b.t + (100 - b.total) / rate
      forecast = isFinite(reset) && eta > reset ? { ok: true } : { ok: false, eta }
    } else forecast = { ok: true }
  }
  return { teams: Object.entries(teams).sort((x, y) => y[1] - x[1]), forecast, reset }
}
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export const Weekly = memo(function Weekly({ usage, data, onPickBot, onPickTeam }) {
  const [byTeam, setByTeam] = useState(false)
  const ins = usageInsights(usage, data)
  const top = usage ? (byTeam ? ins.teams.slice(0, 5) : Object.entries(usage.bots).sort((a, b) => b[1] - a[1]).slice(0, 4)) : []
  const reset = ins.reset
  return (
    <div className="weekly-wrap">
      <div className="zoom card">
        <button onClick={() => (sceneSignals.zoom = 1)} aria-label="Aproximar"><Plus size={16} /></button>
        <button onClick={() => (sceneSignals.zoom = -1)} aria-label="Afastar"><Minus size={16} /></button>
      </div>
      <div className="card weekly">
        <div className="hd">
          <span>Limite semanal</span>
          <span className="muted" title={isFinite(reset) ? `Renova ${new Date(reset).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : undefined}>
            {isFinite(reset) ? `Renova em ${durationShort(reset - Date.now())}` : ''}
          </span>
        </div>
        {usage ? (
          <>
            <div className="pct"><b>{Math.round(usage.total)}%</b><span className="muted">usado</span></div>
            <div className="bar"><i style={{ width: `${Math.min(100, usage.total)}%`, background: usage.total > 85 ? '#E5484D' : usage.total > 65 ? '#F5A524' : '#16181d' }} /></div>
            {usage.total >= 80 && <p className="warnline">Acima de 80% do limite semanal</p>}
            {ins.forecast && (
              <p className={`forecast ${ins.forecast.ok ? '' : 'bad'}`}>
                {ins.forecast.ok
                  ? 'Nesse ritmo, não estoura antes de renovar'
                  : `Nesse ritmo, chega a 100% ${WEEKDAYS[new Date(ins.forecast.eta).getDay()]} ~${String(new Date(ins.forecast.eta).getHours()).padStart(2, '0')}h`}
              </p>
            )}
            <div className="seg2">
              <button className={!byTeam ? 'on' : ''} aria-pressed={!byTeam} onClick={() => setByTeam(false)}>Bots</button>
              <button className={byTeam ? 'on' : ''} aria-pressed={byTeam} onClick={() => setByTeam(true)}>Times</button>
            </div>
            {top.map(([n, v]) => (
              <button key={n} className="ub" onClick={() => (byTeam ? onPickTeam?.(n) : onPickBot?.(n))} title={byTeam ? `Ir para o andar ${n}` : `Ver ${n}`}>
                <i style={{ background: byTeam ? 'var(--accent)' : resolveColor(data.bots[n]?.color) }} />
                <span>{n}</span>
                <em>{Math.round(v * 10) / 10}%</em>
              </button>
            ))}
          </>
        ) : (
          <Empty title="Nenhum uso informado ainda" sub='Os bots podem mandar {"usage":…} com o consumo da semana' />
        )}
      </div>
    </div>
  )
})

export function Hints() {
  return (
    <div className="card hints">
      <span><b>Arrastar</b> girar</span>
      <span><b>Botão direito</b> mover</span>
      <span><b>WASD</b> andar</span>
      <span><b>Rolar</b> zoom</span>
      <span><b><Up size={11} /><Down size={11} /></b> salas</span>
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

function Metrics({ data, name, now }) {
  if (!data.history) return null
  const m = botMetrics(data, name, now)
  const max = Math.max(1, ...m.hours)
  const hNow = new Date(now).getHours()
  return (
    <div className="metrics">
      <h4>Hoje</h4>
      <div className="mgrid">
        <div><b>{m.done}</b><span>concluídas</span></div>
        <div><b>{fmtDuration(m.workMs)}</b><span>trabalhando</span></div>
        <div><b className={m.errors ? 'err' : ''}>{m.errors}</b><span>erros</span></div>
      </div>
      <div className="hours" title="Atividade por hora">
        {m.hours.map((v, i) => (
          <i key={i} className={i === hNow ? 'now' : ''} style={{ height: `${Math.max(6, (v / max) * 100)}%`, opacity: v ? 1 : 0.35 }} />
        ))}
      </div>
    </div>
  )
}

/** "em 12 min", or a red "atrasada há 8 min" when a routine's next run has passed without news. */
function RoutineWhen({ next, now }) {
  const t = Date.parse(next)
  if (!isFinite(t)) return <>{next}</>
  const d = t - now
  if (d >= 0) return <>próxima em {durationShort(d)}</>
  if (-d > 5 * 60e3) return <b className="late">atrasada {durationShort(d)}</b>
  return <>rodando agora</>
}


/** Segmented tabs with a sliding indicator (the "trilho" of the design system). */
export function Tabs({ value, onChange, items }) {
  const idx = Math.max(0, items.findIndex(([k]) => k === value))
  return (
    <div className="tabs" role="tablist" style={{ '--n': items.length, '--i': idx }}>
      <i className="tabs-pill" aria-hidden="true" />
      {items.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={k === value} className={k === value ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  )
}

/** The bot's recent tasks (last 48 h): start, what, how long, how it ended. */
function BotHistory({ data, name, now }) {
  const ev = (data.history || []).filter((h) => h.bot === name)
  const tasks = []
  let cur = null
  for (const h of ev) {
    if (h.status === 'working') {
      if (!cur) cur = { t: h.t, step: h.step, steps: 1 }
      else (cur.steps++, h.step && (cur.step = h.step))
    } else {
      if (cur) tasks.push({ ...cur, end: h.t, status: h.status, result: h.step })
      else if (h.status === 'done' || h.status === 'error') tasks.push({ t: h.t, end: h.t, step: h.step, status: h.status })
      else if (h.status === 'waiting_user') tasks.push({ t: h.t, end: h.t, step: h.step, status: h.status })
      cur = null
    }
  }
  if (cur) tasks.push({ ...cur, end: null, status: 'working' })
  const list = tasks.reverse().slice(0, 30)
  if (!list.length) return <p className="muted pad">Nenhuma tarefa nas últimas 48 h</p>
  return (
    <div className="bb hist">
      {list.map((k, i) => (
        <div key={k.t + ':' + i} className="hrow2" style={{ '--i': Math.min(i, 10) }}>
          <i className="dot" style={{ background: STATUS[k.status === 'idle' ? 'resting' : k.status]?.color || '#9aa0aa' }} />
          <div className="ht">
            <b>{k.result && k.status === 'done' ? k.result : k.step || STATUS_WORD[k.status] || '—'}</b>
            <span>
              {hhmm(k.t)}
              {k.end && k.end > k.t ? ` · ${fmtDuration(k.end - k.t)}` : k.status === 'working' ? ` · em andamento há ${fmtDuration(now - k.t)}` : ''}
              {' · '}
              {STATUS_WORD[k.status === 'idle' ? 'resting' : k.status] || k.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}


/** Empty state: a short title and a line that tells you what will show up here or why. */
function Empty({ icon, title, sub }) {
  return (
    <div className="empty">
      {icon && <span className="ei">{icon}</span>}
      <div>
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  )
}


/** Sidebar icon (panel on the left). */
export function PanelIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </svg>
  )
}
