import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const code = readFileSync(path.resolve(import.meta.dirname, '../public/sw.js'), 'utf8')
const origin = 'https://sopor.hardyson.se'

type Handler = (event: { request: Request; respondWith: (r: Promise<Response>) => void; waitUntil: (p: Promise<unknown>) => void }) => void

/** Kör service workern med låtsade caches och nät. */
function boot(net: (req: Request) => Promise<Response>) {
  const handlers: Record<string, Handler> = {}
  const stores = new Map<string, Map<string, Response>>()
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>()
    stores.set(name, store)
    const key = (r: Request | string) => new URL(typeof r === 'string' ? r : r.url, origin).href
    return {
      match: async (r: Request | string) => store.get(key(r))?.clone(),
      put: async (r: Request | string, res: Response) => void store.set(key(r), res),
      keys: async () => [...store.keys()].map((k) => new Request(k)),
      delete: async (r: Request) => store.delete(key(r)),
    }
  }
  const caches = { open, keys: async () => [...stores.keys()], delete: async (n: string) => stores.delete(n) }
  const self = {
    location: { origin },
    clients: { claim: async () => {} },
    skipWaiting: () => {},
    addEventListener: (type: string, h: Handler) => (handlers[type] = h),
  }
  const fetchFn = vi.fn(net)
  new Function('self', 'caches', 'fetch', code)(self, caches, fetchFn)

  /** Det service workern har bett webbläsaren att vänta in */
  const kept: Promise<unknown>[] = []

  /** Svaret service workern ger, eller undefined när den låter webbläsaren sköta anropet. */
  const request = async (pathname: string, mode: RequestMode = 'cors') => {
    let response: Promise<Response> | undefined
    const req = new Request(origin + pathname)
    Object.defineProperty(req, 'mode', { value: mode })
    handlers.fetch({ request: req, respondWith: (r) => (response = r), waitUntil: (p) => void kept.push(p) })
    return response
  }
  return { request, fetchFn, stores, kept }
}

const html = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/html' } })

describe('service workern', () => {
  beforeEach(() => vi.useRealTimers())

  it('hämtar sidan från nätet och visar den sparade när nätet är borta', async () => {
    let online = true
    const sw = boot(async () => (online ? html('ny') : Promise.reject(new TypeError('offline'))))
    expect(await (await sw.request('/', 'navigate'))!.text()).toBe('ny')
    await Promise.resolve()

    online = false
    expect(await (await sw.request('/avesta/krylbo-storgatan-12b', 'navigate'))!.text()).toBe('ny')
  })

  it('visar den sparade sidan när nätet hänger', async () => {
    const sw = boot(async () => html('gammal'))
    await (await sw.request('/', 'navigate'))!.text()
    await Promise.resolve()

    vi.useFakeTimers()
    sw.fetchFn.mockImplementation(() => new Promise(() => {}))
    let shown = false
    const response = sw.request('/om', 'navigate').then((r) => {
      shown = true
      return r
    })
    await vi.advanceTimersByTimeAsync(1499)
    expect(shown).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await (await response)!.text()).toBe('gammal')
  })

  it('sparar ett sent svar till nästa besök, även sedan den sparade sidan har visats', async () => {
    const sw = boot(async () => html('gammal'))
    await (await sw.request('/', 'navigate'))!.text()
    await Promise.resolve()

    vi.useFakeTimers()
    let answer!: (res: Response) => void
    sw.fetchFn.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const response = sw.request('/om', 'navigate')
    await vi.advanceTimersByTimeAsync(1500)
    expect(await (await response)!.text()).toBe('gammal')

    let saved = false
    void Promise.all(sw.kept).then(() => (saved = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(saved).toBe(false) // Webbläsaren får inte stänga service workern innan svaret är sparat

    answer(html('ny'))
    await vi.advanceTimersByTimeAsync(0)
    expect(saved).toBe(true)
    sw.fetchFn.mockRejectedValue(new TypeError('offline'))
    expect(await (await sw.request('/om', 'navigate'))!.text()).toBe('ny')
  })

  it('sparar inte en kommunsida som appens skal, men väl en adressida', async () => {
    const pages: Record<string, string> = { '/kommuner/uppsala-kommun': 'kommun', '/uppsala/storgatan-2': 'adress' }
    const sw = boot(async (req) => html(pages[new URL(req.url).pathname]))
    await (await sw.request('/uppsala/storgatan-2', 'navigate'))!.text()
    await Promise.resolve()
    await (await sw.request('/kommuner/uppsala-kommun', 'navigate'))!.text()
    await Promise.resolve()

    sw.fetchFn.mockRejectedValue(new TypeError('offline'))
    expect(await (await sw.request('/om', 'navigate'))!.text()).toBe('adress')
  })

  it('sparar inte annat än HTML som sidan', async () => {
    const sw = boot(async () => Response.json({}))
    await sw.request('/', 'navigate')
    await Promise.resolve()
    expect(sw.stores.get('sopor-skal-v1')?.size ?? 0).toBe(0)
  })

  it('tar byggets filer från cachen efter första gången', async () => {
    const sw = boot(async () => new Response('js'))
    await (await sw.request('/assets/index-abc.js'))!.text()
    expect(await (await sw.request('/assets/index-abc.js'))!.text()).toBe('js')
    expect(sw.fetchFn).toHaveBeenCalledTimes(1)
  })

  it('låter data, kalenderfiler och API:t gå direkt till nätet', async () => {
    const sw = boot(async () => new Response(''))
    expect(await sw.request('/data/orter.json')).toBeUndefined()
    expect(await sw.request('/api/sok?q=a')).toBeUndefined()
    expect(await sw.request('/ics/avesta/x.ics', 'navigate')).toBeUndefined()
    expect(await sw.request('/api/v1/kallor', 'navigate')).toBeUndefined()
  })
})
