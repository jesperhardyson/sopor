import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { handleV1Address, handleV1Search, v1 } from './v1.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const hassleholm: Source = {
  id: 'hassleholm',
  name: 'Hässleholm Miljö',
  url: 'https://hassleholmmiljo.se',
  kommuner: [{ code: '1293', name: 'Hässleholms kommun' }],
  config: { system: 'appbolaget', unit: 'e34d7050-1b2a-4917-a921-0ea7742d0a6e' },
}
const LOKET = 'storgatan-1_vinslöv-4fcea8031a2649a1b66fb41a631ed823'

/** Appbolaget svarar med de sparade svaren; gatuindexet finns på preview.test. */
function fakeAppbolaget({ fastighet = fixture('appbolaget-hassleholm-fastighet.json'), adress = fixture('appbolaget-hassleholm-adress.json') as unknown } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.host === 'preview.test') {
      if (url.pathname === '/data/gator/st.json') return json({ storgatan: ['hassleholm'] })
      return new Response('', { status: 404 })
    }
    if (url.pathname.endsWith('/search')) return json(fixture('appbolaget-hassleholm-sok.json'))
    if (url.pathname.startsWith('/@universal/waste/properties/')) return json(fastighet)
    if (adress === 404) return json({ message: 'Not found', status: 404, data: [] }, 404)
    return json(adress)
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const opts = (fetchFn: typeof fetch = fakeAppbolaget()) => ({ fetchFn, sources: [hassleholm], timeoutMs: 50, now: new Date('2026-11-04T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const schema = (id: string) => url(`/api/schema?source=hassleholm&id=${encodeURIComponent(id)}`)

describe('Appbolaget i sajtens API', () => {
  it('söker fram adressen och filtrerar på orten efter ett komma, som Appbolaget inte klarar', async () => {
    const fetchFn = fakeAppbolaget()
    const res = await (await handleSearch(url('/api/sok?q=Storgatan 1, Vinslöv&sources=hassleholm'), opts(fetchFn))).json()
    expect(res.failed).toEqual([])
    expect(res.addresses[0]).toMatchObject({ id: LOKET, kommun: 'Hässleholms kommun' })
    expect(res.addresses.every((a: { locality: string }) => a.locality === 'Vinslöv')).toBe(true)
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('query')).toBe('Storgatan 1')
  })

  it('hämtar schemat med uuid:t i id:t', async () => {
    const res = await handleSchedule(schema(LOKET), opts())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address).toMatchObject({ id: LOKET, street: 'Storgatan 1', locality: 'Vinslöv', kommun: 'Hässleholms kommun' })
    expect(body.schedule.events[0]).toMatchObject({ date: '2026-11-13', estimated: false })
  })

  it('ger kalenderprenumerationen 502, aldrig uppmaningskalendern, när adressen inte finns', async () => {
    const res = await handleIcs(url(`/api/ics?source=hassleholm&file=${encodeURIComponent(LOKET)}.ics`), opts(fakeAppbolaget({ adress: 404 })))
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('-saknas@')
  })

  it('ger 502 när tjänsten svarar med okänd form', async () => {
    expect((await handleSchedule(schema(LOKET), opts(fakeAppbolaget({ fastighet: '{"x":1}' })))).status).toBe(502)
  })
})

describe('Appbolaget i API v1', () => {
  it('söker fram adressen med orten', async () => {
    const res = await v1(handleV1Search)(new Request(`https://preview.test/api/v1/sok?q=${encodeURIComponent('Storgatan 1 Vinslöv')}`), opts())
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.addresses).toContainEqual(expect.objectContaining({ id: LOKET, kommun: 'Hässleholms kommun' }))
  })

  it('ger schemat för ett Appbolaget-id', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=hassleholm&id=${encodeURIComponent(LOKET)}`), opts())
    expect(res.status).toBe(200)
  })
})
