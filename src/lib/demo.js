// Demo mode: simulates bots publishing to ntfy so the office looks alive
// before a topic is connected. Uses the exact same message protocol.
import { dataStore, ingest } from './state'

const STEPS = {
  Ops: ['Sorting 140 emails', 'Reviewing contract clauses', 'Syncing calendar', 'Updating the daily journal', 'Filing invoices', 'Checking app crash logs', 'Drafting a reply to the bank'],
  Sales: ['Qualifying 12 new leads', 'Writing follow-up sequence', 'Prospecting on LinkedIn', 'Prepping call notes', 'Scoring inbound demo requests', 'Investigating a lost deal', 'Rewriting the pitch hook'],
  Design: ['Designing a banner for the launch', 'Critiquing the landing page', 'Exploring logo directions', 'Building a moodboard', 'Refining the color system', 'Exporting brand assets', 'Kerning the wordmark'],
  Marketing: ['Drafting tonight’s post', 'Collecting testimonials', 'Planning the campaign calendar', 'Writing newsletter copy', 'A/B testing headlines'],
  default: ['Thinking it through', 'Reading the brief', 'Running checks'],
}
const DONE = ['Done: shipped it', 'Finished the draft', 'Done: killing the weak ones', 'All set', 'Published']
const WAIT = ['Needs your OK to publish', 'Approve the budget?', 'Pick a thumbnail', 'Confirm the send list']
const ERR = ['API rate limited', 'Login expired', 'Upload failed']
const TALKS = ['Can you review this draft?', 'Need numbers for the deck', 'Syncing on the launch plan', 'Quick question on the brief', 'Handing off the leads list', 'Want your take on the hook', 'Aligning on tone of voice']

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
  send({ bot: name, status: 'working', step: 'Approved, publishing now' })
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
    [{ name: 'Inbox zero', schedule: 'Every day 08:00', next_run: new Date(now + 5 * 3600e3).toISOString() }],
    [{ name: 'Lead sweep', schedule: 'Weekdays 09:30', next_run: new Date(now + 7 * 3600e3).toISOString() }],
    [{ name: 'Design review', schedule: 'Fridays 16:00', next_run: new Date(now + 50 * 3600e3).toISOString() }],
    [{ name: 'Post scheduler', schedule: 'Every day 19:00', next_run: new Date(now + 2 * 3600e3).toISOString() }],
    [{ name: 'Trend scan', schedule: 'Every 6h', next_run: new Date(now + 3600e3).toISOString() }],
    [{ name: 'Daily journal', schedule: 'Every day 22:00', next_run: new Date(now + 9 * 3600e3).toISOString() }],
  ]
  routineBots.forEach((b, i) => seed.push({ routines: { bot: b, items: R[i] } }))
  seed.push({
    cortex: {
      notes: 1287,
      recent: [
        { title: 'Pricing experiments Q4', updated: new Date(now - 6 * 60e3).toISOString() },
        { title: 'Brand voice guidelines', updated: new Date(now - 40 * 60e3).toISOString() },
        { title: 'Lead scoring rubric', updated: new Date(now - 2 * 3600e3).toISOString() },
        { title: 'Video ideas backlog', updated: new Date(now - 5 * 3600e3).toISOString() },
        { title: 'Contract templates', updated: new Date(now - 26 * 3600e3).toISOString() },
        { title: 'Onboarding checklist', updated: new Date(now - 50 * 3600e3).toISOString() },
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
            later(() => send({ bot: n, status: 'working', step: 'Retrying' }), 9000)
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
      later(() => send({ type: 'talk', from, to, step: 'Thanks, got it', status: 'end' }), dur)
    }
    later(talk, 7000 + Math.random() * 8000)
  }

  later(tick, 800)
  later(talk, 1500)
  return () => timers.forEach(clearTimeout)
}
