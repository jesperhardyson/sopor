// Service worker för app-skalet: sidan och byggets filer finns kvar när nätet är dåligt eller borta.
// Data, kalenderfiler och API:t går alltid direkt till nätet (sparade adresser har egen reserv i localStorage).

const SHELL = 'sopor-skal-v1'
const ASSETS = 'sopor-assets-v1'
/** Ungefär fem byggen av JS, CSS och typsnitt */
const MAX_ASSETS = 100
/** Så länge sidan väntar på nätet innan den sparade versionen visas */
const NETWORK_TIMEOUT_MS = 1500

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate' && !/^\/(api|ics|data)\//.test(url.pathname)) event.respondWith(page(event))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(asset(request))
})

/** Nätet först, så att en ny version syns direkt. Den sparade sidan när nätet inte svarar i tid. */
async function page(event) {
  const { request } = event
  const cache = await caches.open(SHELL)
  const network = fetch(request).then(async (res) => {
    // Kommunsidorna och integritetspolicyn har eget innehåll i HTML:en och duger inte som appens skal
    const shell = !/^\/(kommuner|integritet)/.test(new URL(request.url).pathname)
    if (shell && res.ok && res.headers.get('Content-Type')?.startsWith('text/html')) await cache.put('/', res.clone())
    return res
  })
  // Ett svar som kommer efter den sparade sidan ska ändå sparas till nästa besök
  event.waitUntil(network.catch(() => {}))
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS))
  const first = await Promise.race([network.catch(() => undefined), timeout])
  if (first) return first
  // Appen har en enda sida (index.html) för alla adresser
  return (await cache.match('/')) ?? network
}

/** Byggets filer byter namn när innehållet ändras, så en sparad fil är alltid rätt. */
async function asset(request) {
  const cache = await caches.open(ASSETS)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) {
    await cache.put(request, res.clone())
    const keys = await cache.keys()
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k)))
  }
  return res
}
