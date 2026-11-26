const CACHE_NAME = 'fantaski-pwa-v1'
const PRECACHE_ASSETS = [
  '/manifest.webmanifest',
  '/logo.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Nigdy nie przechwytuj strumieni SSE ani wywołań API (zawsze świeże dane z serwera)
  const accept = req.headers.get('accept') || ''
  if (accept.includes('text/event-stream')) return

  if (PRECACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req)),
    )
    return
  }

  // Dla nawigacji HTML: zawsze network-first, z bezpiecznym fallbackiem gdy brak sieci
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html')),
    )
  }
})
