// Demo mode: simulates bots publishing to ntfy so the office looks alive
// before a topic is connected. Uses the exact same message protocol.
import { dataStore, ingest } from './state'

const STEPS = {
  Ops: ['Organizando 140 e-mails', 'Revisando cláusulas do contrato', 'Sincronizando a agenda', 'Atualizando o diário', 'Lançando notas fiscais', 'Checando logs do app', 'Respondendo o banco'],
  Sales: ['Qualificando 12 leads novos', 'Escrevendo a cadência de follow-up', 'Prospectando no LinkedIn', 'Preparando notas da call', 'Pontuando pedidos de demo', 'Investigando um negócio perdido', 'Reescrevendo o gancho do pitch'],
  Design: ['Criando banner do lançamento', 'Criticando a landing page', 'Explorando caminhos de logo', 'Montando um moodboard', 'Refinando a paleta de cores', 'Exportando assets da marca', 'Ajustando o kerning'],
  Marketing: ['Escrevendo o post de hoje', 'Coletando depoimentos', 'Planejando o calendário', 'Redigindo a newsletter', 'Testando headlines A/B'],
  YouTube: ['Roteirizando o próximo vídeo', 'Levantando temas de vídeo', 'Editando o ensaio longo', 'Criando títulos de thumbnail', 'Lendo comentários atrás de ideias', 'Pesquisando fontes'],
  default: ['Pensando no assunto', 'Lendo o briefing', 'Rodando verificações'],
}
const DONE = ['Pronto: publicado', 'Rascunho finalizado', 'Pronto: cortei os fracos', 'Tudo certo', 'Publicado']
const WAIT = ['Precisa do seu OK pra publicar', 'Aprova o orçamento?', 'Escolhe a thumbnail', 'Confirma a lista de envio']
const ERR = ['Limite da API atingido', 'Login expirou', 'Falha no upload']
const TALKS = ['Pode revisar esse rascunho?', 'Preciso dos números pro deck', 'Alinhando o plano de lançamento', 'Dúvida rápida sobre o briefing', 'Passando a lista de leads', 'Quero tua opinião no gancho', 'Alinhando o tom de voz']

const pick = (a) => a[Math.floor(Math.random() * a.length)]
let seq = 0

function send(payload, time = Date.now()) {
  ingest([{ id: `demo-${++seq}`, time, payload }])
}

function stepsFor(name) {
  const team = dataStore.get().bots[name]?.team
  return STEPS[team] || STEPS.default
}

export function demoApprove(name) {
  send({ bot: name, status: 'working', step: 'Aprovado, publicando agora' })
}

export function startDemo() {
  const s = dataStore.get()
  const names = s.order.slice()
  const now = Date.now()

  // Seed
  const seed = []
  names.forEach((n, i) => {
    const r = Math.random()
    const status = r < 0.58 ? 'working' : r < 0.74 ? 'done' : 'idle'
    seed.push({ bot: n, status, step: status === 'done' ? pick(DONE) : status === 'idle' ? '' : pick(stepsFor(n)) })
  })
  seed.push({ bot: pick(names), status: 'waiting_user', step: pick(WAIT) })
  const usageBots = {}
  names.forEach((n) => (usageBots[n] = +(Math.random() * 5 + 0.3).toFixed(1)))
  seed.push({ type: 'usage', total_used_pct: 31, resets_at: new Date(now + (3 * 24 + 14) * 3600e3).toISOString(), bots: usageBots })
  const routineBots = [names[0], names[2], names[5], names[6], names[7], names[1]].filter(Boolean)
  const R = [
    [{ name: 'Caixa zerada', schedule: 'Todo dia 08:00', next_run: new Date(now + 5 * 3600e3).toISOString() }],
    [{ name: 'Varredura de leads', schedule: 'Dias úteis 09:30', next_run: new Date(now + 7 * 3600e3).toISOString() }],
    [{ name: 'Revisão de design', schedule: 'Sextas 16:00', next_run: new Date(now + 50 * 3600e3).toISOString() }],
    [{ name: 'Agendar posts', schedule: 'Todo dia 19:00', next_run: new Date(now + 2 * 3600e3).toISOString() }],
    [{ name: 'Radar de tendências', schedule: 'A cada 6h', next_run: new Date(now + 3600e3).toISOString() }],
    [{ name: 'Diário', schedule: 'Todo dia 22:00', next_run: new Date(now + 9 * 3600e3).toISOString() }],
  ]
  routineBots.forEach((b, i) => seed.push({ routines: { bot: b, items: R[i] } }))
  seed.push({
    cortex: {
      notes: 1287,
      recent: [
        { title: 'Experimentos de preço Q4', updated: new Date(now - 6 * 60e3).toISOString() },
        { title: 'Guia de tom de voz', updated: new Date(now - 40 * 60e3).toISOString() },
        { title: 'Critérios de score de leads', updated: new Date(now - 2 * 3600e3).toISOString() },
        { title: 'Backlog de ideias de vídeo', updated: new Date(now - 5 * 3600e3).toISOString() },
        { title: 'Modelos de contrato', updated: new Date(now - 26 * 3600e3).toISOString() },
        { title: 'Checklist de onboarding', updated: new Date(now - 50 * 3600e3).toISOString() },
      ],
    },
  })
  ingest(seed.map((payload) => ({ id: `demo-${++seq}`, time: now - 60e3, payload })))

  const timers = []
  const later = (fn, ms) => timers.push(setTimeout(fn, ms))

  function tick() {
    const st = dataStore.get()
    const n = pick(st.order)
    const b = st.bots[n]
    if (b) {
      const r = Math.random()
      const steps = stepsFor(n)
      switch (b.status) {
        case 'working':
          if (r < 0.45) send({ bot: n, status: 'done', step: pick(DONE) })
          else if (r < 0.53 && !Object.values(st.bots).some((x) => x.status === 'waiting_user')) send({ bot: n, status: 'waiting_user', step: pick(WAIT) })
          else if (r < 0.56) {
            send({ bot: n, status: 'error', step: pick(ERR) })
            later(() => send({ bot: n, status: 'working', step: 'Tentando de novo' }), 9000)
          } else send({ bot: n, status: 'working', step: pick(steps) })
          break
        case 'done':
          send(r < 0.6 ? { bot: n, status: 'working', step: pick(steps) } : { bot: n, status: 'idle', step: '' })
          break
        case 'waiting_user':
          if (Date.now() - b.ts > 25000) demoApprove(n)
          break
        case 'error':
          break
        default:
          send({ bot: n, status: 'working', step: pick(steps) })
      }
    }
    later(tick, 1100 + Math.random() * 1500)
  }

  function talk() {
    const st = dataStore.get()
    const busy = new Set(Object.keys(st.talks).concat(Object.values(st.talks).map((t) => t.to)))
    const free = st.order.filter((n) => !busy.has(n))
    if (free.length > 2) {
      const from = pick(free)
      const sameTeam = Math.random() < 0.55
      const pool = free.filter((n) => n !== from && (st.bots[n].team === st.bots[from].team) === sameTeam)
      const to = pick(pool.length ? pool : free.filter((n) => n !== from))
      const topic = pick(TALKS)
      send({ type: 'talk', from, to, step: topic, status: 'start' })
      const dur = 22000 + Math.random() * 14000
      later(() => send({ type: 'talk', from, to, step: pick(TALKS) }), dur * 0.5)
      later(() => send({ type: 'talk', from, to, step: 'Valeu, entendi', status: 'end' }), dur)
    }
    later(talk, 7000 + Math.random() * 8000)
  }

  later(tick, 800)
  later(talk, 1500)
  return () => timers.forEach(clearTimeout)
}
