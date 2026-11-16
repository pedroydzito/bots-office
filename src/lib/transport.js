// The only network access in the app: one Supabase project.
// The access code is the secret. The publishable key is public by design.
// Reads and writes go through office_fetch / office_publish. Live updates are
// Realtime Broadcast on a channel named from the sha256 of the access code.
import { createClient } from '@supabase/supabase-js'
import { clock } from '../scene/sim'
import { health, noteMessage } from './health'

export const SUPABASE_URL = 'https://sqwcsncrlzznxwksrche.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_FftQEYa2xe4wQCndfscbrg_ydE47IQX'

const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/

export function validTopic(t) {
  return typeof t === 'string' && TOPIC_RE.test(t)
}

/** "office:" + sha256 hex. Must match office.key_of / realtime.send in the migration. */
export async function channelName(accessCode) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessCode))
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `office:${hex}`
}

let client
function db() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  }
  return client
}

// Devices are normally NTP-synced. If this clock is clearly off, server timestamps correct it.
const skew = []
function sampleClock(serverMs) {
  if (typeof serverMs !== 'number' || !isFinite(serverMs)) return
  skew.push(serverMs - Date.now())
  if (skew.length > 15) skew.shift()
  const m = [...skew].sort((a, b) => a - b)[Math.floor(skew.length / 2)]
  clock.offset = skew.length >= 3 && Math.abs(m) > 2500 ? m : 0
}

/** Publish one JSON message so every open screen sees it. */
export async function publish(topic, payload) {
  try {
    const { error } = await db().rpc('office_publish', { access_code: topic, payload })
    return !error
  } catch {
    return false
  }
}

/** Copy-paste curl for the empty-office guide. The access code is already on this device. */
export function exampleCurl(accessCode, payload) {
  const body = JSON.stringify({ access_code: accessCode, payload })
  return `curl -fsS -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" -H "Content-Type: application/json" --data '${body}' ${SUPABASE_URL}/rest/v1/rpc/office_publish`
}

function asMessage(m) {
  if (!m || typeof m !== 'object') return null
  const time = typeof m.time === 'number' ? m.time : Number(m.time)
  if (!isFinite(time) || m.payload == null || typeof m.payload !== 'object') return null
  return { id: m.id != null ? String(m.id) : undefined, time, payload: m.payload }
}

/**
 * Load the latest roster + usage (any age) and events after sinceMs, then follow the broadcast channel.
 * sinceMs is this browser's last applied message time; 0 loads the 7-day window.
 */
export function connectOffice(topic, { onMessages, onStatus, sinceMs = 0 }) {
  let closed = false
  let lastMs = sinceMs > 0 ? sinceMs : 0
  let channel = null
  let retryTimer = null
  let pollTimer = null
  let generation = 0
  let seenIds = new Set()

  function remember(id) {
    if (!id) return false
    if (seenIds.has(id)) return true
    seenIds.add(id)
    if (seenIds.size > 4000) seenIds = new Set([...seenIds].slice(-2000))
    return false
  }

  function deliver(raw, live) {
    if (closed || !Array.isArray(raw) || !raw.length) return
    const fresh = []
    for (const item of raw) {
      const m = asMessage(item)
      if (!m) continue
      if (remember(m.id)) continue
      if (m.time > lastMs) lastMs = m.time
      if (live) {
        sampleClock(m.time)
        noteMessage(m.time, true)
      }
      fresh.push(m)
    }
    if (!fresh.length) return
    if (!live) {
      let newest = 0
      for (const m of fresh) newest = Math.max(newest, m.time)
      if (newest) noteMessage(newest, false)
    }
    onMessages(fresh)
  }

  async function pull(since, withSnapshots) {
    const args = { access_code: topic, with_snapshots: !!withSnapshots }
    if (since > 0) args.since_ms = Math.floor(since)
    const { data, error } = await db().rpc('office_fetch', args)
    if (closed) return false
    if (error) return false
    if (data && typeof data.server_ms === 'number') sampleClock(data.server_ms)
    const msgs = Array.isArray(data?.messages) ? data.messages : []
    deliver(msgs, false)
    // An empty office still moves the cursor forward so the backup poll stays small.
    if (!msgs.length && data && typeof data.server_ms === 'number' && lastMs === 0) lastMs = data.server_ms - 1000
    return true
  }

  async function subscribe() {
    const name = await channelName(topic)
    if (closed) return
    if (channel) {
      db().removeChannel(channel)
      channel = null
    }
    const ch = db().channel(name, { config: { private: false } })
    channel = ch
    ch.on('broadcast', { event: 'office' }, ({ payload }) => deliver([payload], true))
    ch.subscribe((status) => {
      if (closed || channel !== ch) return
      if (status === 'SUBSCRIBED') {
        health.connectedAt = Date.now()
        onStatus('live')
        // Anything published between the snapshot and the socket.
        pull(lastMs, false)
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        onStatus('reconnecting')
      }
    })
  }

  async function start() {
    const gen = ++generation
    onStatus('syncing')
    let ok = false
    try {
      ok = await pull(lastMs, true)
    } catch {
      ok = false
    }
    if (closed || gen !== generation) return
    if (!ok) {
      onStatus('reconnecting')
      retryTimer = setTimeout(start, 5000)
      return
    }
    try {
      await subscribe()
    } catch {
      if (!closed) onStatus('reconnecting')
    }
  }

  // Broadcast can miss a message when today's realtime partition does not exist yet.
  pollTimer = setInterval(() => {
    if (!closed && document.visibilityState !== 'hidden') pull(lastMs, false).catch(() => {})
  }, 30000)

  let hiddenAt = 0
  const onVis = () => {
    if (document.hidden) hiddenAt = Date.now()
    else if (!hiddenAt || Date.now() - hiddenAt > 5000) {
      hiddenAt = 0
      pull(lastMs, false).catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', onVis)

  start()

  return () => {
    closed = true
    clearTimeout(retryTimer)
    clearInterval(pollTimer)
    document.removeEventListener('visibilitychange', onVis)
    if (channel) db().removeChannel(channel)
  }
}
