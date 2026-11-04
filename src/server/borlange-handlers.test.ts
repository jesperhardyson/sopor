import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { handleV1Address, handleV1Search, v1 } from './v1.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const borlange: Source = {
  id: 'borlange',
  name: 'Borlänge Energi',
  url: 'https://www.borlange-energi.se',
  kommuner: [{ code: '2081', name: 'Borlänge kommun' }],
  config: { system: 'borlange' },
}
const ID = 'borganäsvägen-31-4561222'

/** Borlänge Energi svarar med de sparade svaren; gatuindexet finns på preview.test. */
function fakeBorlange({ karl = fixture('borlange-karl.json') as unknown } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.host === 'preview.test') {
      if (url.pathname === '/data/gator/bo.json') return json({ borganäsvägen: ['borlange'] })
      return new Response('', { status: 404 })
    }
    if (!url.pathname.endsWith('/getAdresses')) return json(karl)
    const q = (url.searchParams.get('pickupAddress') ?? '').toLowerCase()
    return json((JSON.parse(fixture('borlange-adresser.json')) as { pickupAddress: string }[]).filter((a) => a.pickupAddress.toLowerCase().includes(q)))
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const opts = (fetchFn: typeof fetch = fakeBorlange()) => ({ fetchFn, sources: [borlange], timeoutMs: 50, now: new Date('2026-11-04T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const schema = (id: string) => url(`/api/schema?source=borlange&id=${encodeURIComponent(id)}`)

describe('Borlänge i sajtens API', () => {
  it('söker utan orten och matchar kommunen efteråt', async () => {
    const fetchFn = fakeBorlange()
    const res = await (await handleSearch(url('/api/sok?q=Borganäsvägen 31, Borlänge&sources=borlange'), opts(fetchFn))).json()
    expect(res.failed).toEqual([])
    expect(res.addresses).toEqual([{ id: ID, street: 'Borganäsvägen 31', locality: '', sourceId: 'borlange', kommun: 'Borlänge kommun' }])
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('pickupAddress')).toBe('Borganäsvägen 31')
  })

  it('hämtar schemat', async () => {
    const res = await handleSchedule(schema(ID), opts())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address).toMatchObject({ id: ID, street: 'Borganäsvägen 31', locality: '', kommun: 'Borlänge kommun' })
    expect(body.schedule.events[0]).toEqual({ date: '2026-11-05', fractions: ['plast'], estimated: false })
  })

  it('ger ett tomt schema för en adress utan kärl, inte ett fel', async () => {
    const res = await handleSchedule(schema(ID), opts(fakeBorlange({ karl: [] })))
    expect(res.status).toBe(200)
    expect((await res.json()).schedule.events).toEqual([])
  })

  it('ger kalenderprenumerationen 502, aldrig uppmaningskalendern, när adressen inte hittas', async () => {
    const res = await handleIcs(url(`/api/ics?source=borlange&file=${encodeURIComponent('finnsinte-1-123')}.ics`), opts())
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('-saknas@')
  })

  it('ger 502 när tjänsten svarar med okänd form', async () => {
    expect((await handleSchedule(schema(ID), opts(fakeBorlange({ karl: { x: 1 } })))).status).toBe(502)
  })
})

describe('Borlänge i API v1', () => {
  it('söker fram adressen', async () => {
    const res = await v1(handleV1Search)(new Request(`https://preview.test/api/v1/sok?q=${encodeURIComponent('Borganäsvägen 31 Borlänge')}`), opts())
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.addresses).toContainEqual(expect.objectContaining({ id: ID, kommun: 'Borlänge kommun' }))
  })

  it('ger schemat för ett Borlänge-id', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=borlange&id=${encodeURIComponent(ID)}`), opts())
    expect(res.status).toBe(200)
  })
})
