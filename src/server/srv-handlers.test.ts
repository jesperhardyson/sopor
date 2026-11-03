import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { srvKey } from './srv.js'
import { handleV1Address, handleV1Search, v1 } from './v1.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json;charset=UTF-8' } })

const srv: Source = {
  id: 'srv',
  name: 'SRV återvinning',
  url: 'https://www.srvatervinning.se',
  kommuner: [
    { code: '0126', name: 'Huddinge kommun' },
    { code: '0127', name: 'Botkyrka kommun' },
    { code: '0136', name: 'Haninge kommun' },
  ],
  config: { system: 'srv' },
}

const suggestion = (customerId: string, address: string, city: string) => ({ name: `${address}, ${city}`, customerId, address, city })
const FORSLAG: Record<string, unknown> = {
  'nynäsvägen 3': fixture('srv-forslag.json'),
  'ringvägen 10': { results: [suggestion('200001', 'Ringvägen 10', 'HUDDINGE')] },
  'tumba torg 101': { results: [suggestion('300001', 'Tumba torg 101', 'TUMBA')] },
}
const haninge = { multipleAddresses: false, customerAddresses: [], results: [{ address: 'Nynäsvägen 3', city: 'HANINGE', containers: [{ contentType: 'Restavfall', containerType: 'Kärl 190 liter grönt', calendars: [{ startDate: '2026-11-05', jobTemplate: 'Tömning', isActive: true }] }] }] }

/** SRV svarar med de sparade svaren (påhittade kundnummer); ortindexet och gatuindexet finns på preview.test. */
function fakeSrv({ kund = fixture('srv-kund.json') } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    const query = url.searchParams.get('query')?.toLowerCase() ?? ''
    if (url.host === 'preview.test') {
      if (url.pathname === '/data/gator/ny.json') return json({ nynäsvägen: ['srv'] })
      if (url.pathname === '/data/gator/tu.json') return json({ 'tumba torg': ['srv'] })
      if (url.pathname === '/data/orter.json')
        return json({ srv: { huddinge: 'Huddinge kommun', tumba: 'Botkyrka kommun', haninge: 'Haninge kommun', handen: 'Haninge kommun', grödinge: 'Botkyrka kommun' } })
      return new Response('', { status: 404 })
    }
    if (url.pathname.endsWith('/getSuggestions')) return json(FORSLAG[query] ?? { results: [] })
    if (url.pathname.endsWith('/searchByCustomerAndAddress')) return json(fixture('srv-kund-adress.json'))
    if (query === '300001') return json(fixture('srv-kund-flera.json'))
    if (query === '100001' || query === '100002') return json(haninge)
    return json(kund)
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const opts = (fetchFn: typeof fetch = fakeSrv()) => ({ fetchFn, sources: [srv], timeoutMs: 50, now: new Date('2026-11-04T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const schema = (id: string) => url(`/api/schema?source=srv&id=${encodeURIComponent(id)}`)

describe('SRV i sajtens API', () => {
  it('söker fram adressen i alla orter, med kärlen när flera kunder delar adress, aldrig kundnumret', async () => {
    const res = await handleSearch(url('/api/sok?q=Nynäsvägen 3&sources=srv'), opts())
    const all = await res.json()
    expect(all.failed).toEqual([])
    expect(all.addresses.map((a: { locality: string; detail?: string }) => [a.locality, a.detail ?? null])).toEqual([
      ['Haninge', 'Restavfall, nästa Tor 5 nov'],
      ['Haninge', 'Restavfall, nästa Tor 5 nov'],
      ['Grödinge', null],
      ['Handen', null],
    ])
    expect(JSON.stringify(all)).not.toContain('10000')
  })

  it('filtrerar på orten efter ett komma, som SRV inte klarar, innan kärlen hämtas', async () => {
    const fetchFn = fakeSrv()
    const one = await (await handleSearch(url('/api/sok?q=Nynäsvägen 3, Grödinge&sources=srv'), opts(fetchFn))).json()
    expect(one.addresses.map((a: { id: string }) => a.id)).toEqual([`nynäsvägen-3_grödinge-${srvKey('100003')}`])
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('query')).toBe('Nynäsvägen 3')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('hämtar schemat och ger orten rätt kommun', async () => {
    const id = `tumba-torg-101_tumba-${srvKey('300001')}`
    const res = await handleSchedule(schema(id), opts())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address).toMatchObject({ id, street: 'Tumba torg 101', locality: 'Tumba', kommun: 'Botkyrka kommun' })
    expect(body.schedule.events[0]).toMatchObject({ fractions: ['rest'], estimated: false })
  })

  it('ger kalenderprenumerationen 502, aldrig uppmaningskalendern, när adressen inte hittas', async () => {
    const res = await handleIcs(url(`/api/ics?source=srv&file=${encodeURIComponent('nynäsvägen-3_haninge-okand')}.ics`), opts())
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('-saknas@')
  })

  it('ger 502 när tjänsten svarar med okänd form', async () => {
    expect((await handleSchedule(schema(`ringvägen-10_huddinge-${srvKey('200001')}`), opts(fakeSrv({ kund: '{"x":1}' })))).status).toBe(502)
  })
})

describe('SRV i API v1', () => {
  it('ger Tumba kommunen Botkyrka', async () => {
    const res = await v1(handleV1Search)(new Request(`https://preview.test/api/v1/sok?q=${encodeURIComponent('Tumba torg 101 Tumba')}`), opts())
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.addresses).toContainEqual(expect.objectContaining({ street: 'Tumba torg 101', locality: 'Tumba', kommun: 'Botkyrka kommun' }))
  })

  it('ger schemat för ett SRV-id', async () => {
    const id = `ringvägen-10_huddinge-${srvKey('200001')}`
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=srv&id=${encodeURIComponent(id)}`), opts())
    expect(res.status).toBe(200)
  })
})
