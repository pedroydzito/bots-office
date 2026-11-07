// Offline-first shell for the Bot Office PWA.
// - Hashed build assets (/assets/*) never change: cache-first, kept forever.
// - The page itself: served from cache instantly, refreshed in the background.
// - ntfy.sh (live data) is never cached or intercepted.
const VERSION = 'bot-office-v3'
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // ntfy & anything external: straight to the network

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
    return
  }

  // navigations and other same-origin files: stale-while-revalidate
  e.respondWith(
    caches.open(VERSION).then(async (c) => {
      const key = req.mode === 'navigate' ? '/' : req
      const hit = await c.match(key)
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) c.put(key, res.clone())
          return res
        })
        .catch(() => hit)
      return hit || fresh
    }),
  )
})
