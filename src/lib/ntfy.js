// The only network access in the app: read-only subscription to one ntfy.sh topic.
import { clock } from '../scene/sim'

const BASE = 'https://ntfy.sh'

// Every screen runs the office simulation on the wall clock. Devices are normally NTP-synced;
// if this one is clearly off, live ntfy timestamps (whole seconds) correct it.
const skew = []
function sampleClock(serverSec) {
  skew.push(serverSec * 1000 + 500 - Date.now())
  if (skew.length > 15) skew.shift()
  const m = [...skew].sort((a, b) => a - b)[Math.floor(skew.length / 2)]
  clock.offset = skew.length >= 3 && Math.abs(m) > 2500 ? m : 0
}

export function validTopic(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(t)
}

/** Publish one JSON message to the topic (used for reactions, so every screen sees them). */
export async function publish(topic, payload) {
  try {
    await fetch(`${BASE}/${encodeURIComponent(topic)}`, { method: 'POST', body: JSON.stringify(payload) })
    return true
  } catch {
    return false
  }
}

export function connectNtfy(topic, { onMessages, onStatus }) {
  const base = `${BASE}/${encodeURIComponent(topic)}`
  let es = null
  let closed = false
  let lastSec = 0
  let lastId = null
  let retryTimer = null
  let hadError = false

  const toMsg = (o) => {
    if (!o || o.event !== 'message' || typeof o.message !== 'string') return null
    let payload
    try {
      payload = JSON.parse(o.message)
    } catch {
      return null
    }
    const sec = typeof o.time === 'number' ? o.time : Date.now() / 1000
    if (sec >= lastSec && typeof o.id === 'string' && /^[A-Za-z0-9]{1,32}$/.test(o.id)) lastId = o.id
    lastSec = Math.max(lastSec, sec)
    return { id: o.id, time: sec * 1000, payload }
  }

  async function poll(since) {
    try {
      const r = await fetch(`${base}/json?poll=1&since=${since}`, { cache: 'no-store' })
      if (!r.ok) return
      const text = await r.text()
      const msgs = []
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
          const m = toMsg(JSON.parse(line))
          if (m) msgs.push(m)
        } catch {
          /* skip */
        }
      }
      if (!closed && msgs.length) onMessages(msgs)
    } catch {
      /* offline: SSE retry will resync */
    }
  }

  function openSSE() {
    if (closed) return
    // `since` closes the gap between the history poll and the live stream (duplicates are dropped by id)
    const since = lastId || Math.floor(Date.now() / 1000 - 30)
    es = new EventSource(`${base}/sse?since=${since}`)
    es.onopen = () => {
      onStatus('live')
      if (hadError) {
        hadError = false
        poll(lastSec ? Math.floor(lastSec) : '12h')
      }
    }
    es.onmessage = (ev) => {
      try {
        const raw = JSON.parse(ev.data)
        if (typeof raw.time === 'number' && (raw.event === 'message' || raw.event === 'open' || raw.event === 'keepalive')) sampleClock(raw.time)
        const m = toMsg(raw)
        if (m) onMessages([m])
      } catch {
        /* ignore */
      }
    }
    for (const name of ['open', 'keepalive']) {
      es.addEventListener(name, (ev) => {
        try {
          const raw = JSON.parse(ev.data)
          if (typeof raw.time === 'number') sampleClock(raw.time)
        } catch {
          /* ignore */
        }
      })
    }
    es.onerror = () => {
      hadError = true
      onStatus('reconnecting')
      if (es.readyState === 2) {
        es.close()
        clearTimeout(retryTimer)
        retryTimer = setTimeout(openSSE, 5000)
      }
    }
  }

  onStatus('syncing')
  poll('12h').then(openSSE)

  return () => {
    closed = true
    clearTimeout(retryTimer)
    if (es) es.close()
  }
}
