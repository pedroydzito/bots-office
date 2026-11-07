// Bot Office PWA service worker.
// - The page (navigations): NETWORK FIRST, so a new deploy is picked up right away; the cached
//   copy is only used when offline or the network takes too long. (Serving a stale page first
//   could point at build files that no longer exist after a deploy -> stuck on the splash.)
// - Hashed build assets (/assets/*): cache-first (their name changes when they change).
// - ntfy.sh (live data) is never intercepted.
const VERSION = 'bot-office-v4'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(['/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        const c = await caches.open(VERSION)
        try {
          const res = await Promise.race([fetch(req), timeout(4000)])
          if (res.ok) c.put('/', res.clone())
          return res
        } catch {
          return (await c.match('/')) || fetch(req)
        }
      })(),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const hit = await c.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) c.put(req, res.clone())
        return res
      }),
    )
  }
})
