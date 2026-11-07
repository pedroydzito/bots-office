// The only network access in the app: read-only subscription to one ntfy.sh topic.
const BASE = 'https://ntfy.sh'

export function validTopic(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(t)
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
        const m = toMsg(JSON.parse(ev.data))
        if (m) onMessages([m])
      } catch {
        /* ignore */
      }
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
