import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
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

/** SRV svarar med de sparade svaren; ortindexet och gatuindexet finns på preview.test. */
function fakeSrv({ forslag = fixture('srv-forslag.json'), kund = fixture('srv-kund.json') } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.host === 'preview.test') {
      if (url.pathname === '/data/gator/ny.json') return json({ nynäsvägen: ['srv'] })
      if (url.pathname === '/data/gator/tu.json') return json({ 'tumba torg': ['srv'] })
      if (url.pathname === '/data/orter.json')
        return json({ srv: { huddinge: 'Huddinge kommun', tumba: 'Botkyrka kommun', haninge: 'Haninge kommun', handen: 'Haninge kommun', grödinge: 'Botkyrka kommun' } })
      return new Response('', { status: 404 })
    }
    if (url.pathname.endsWith('/getSuggestions')) return json(forslag)
    if (url.pathname.endsWith('/searchByCustomerAndAddress')) return json(fixture('srv-kund-adress.json'))
    if (url.searchParams.get('query') === '146603') return json(fixture('srv-kund-flera.json'))
    return json(kund)
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const opts = (fetchFn: typeof fetch = fakeSrv()) => ({ fetchFn, sources: [srv], timeoutMs: 50, now: new Date('2026-11-04T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const schema = (id: string) => url(`/api/schema?source=srv&id=${encodeURIComponent(id)}`)

describe('SRV i sajtens API', () => {
  it('söker fram adressen i alla orter, med kundnumret när flera kunder delar adress', async () => {
    const all = await (await handleSearch(url('/api/sok?q=Nynäsvägen 3&sources=srv'), opts())).json()
    expect(all.failed).toEqual([])
    expect(all.addresses.map((a: { locality: string; detail?: string }) => [a.locality, a.detail ?? null])).toEqual([
      ['Haninge', 'Kundnummer 24075'],
      ['Haninge', 'Kundnummer 164315'],
      ['Grödinge', null],
      ['Handen', null],
    ])
  })

  it('filtrerar på orten efter ett komma, som SRV inte klarar', async () => {
    const fetchFn = fakeSrv()
    const one = await (await handleSearch(url('/api/sok?q=Nynäsvägen 3, Grödinge&sources=srv'), opts(fetchFn))).json()
    expect(one.addresses.map((a: { id: string }) => a.id)).toEqual(['nynäsvägen-3_grödinge-357289'])
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('query')).toBe('Nynäsvägen 3')
  })

  it('hämtar schemat med kundnumret och ger orten rätt kommun', async () => {
    const res = await handleSchedule(schema('tumba-torg-101_tumba-146603'), opts())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address).toMatchObject({ id: 'tumba-torg-101_tumba-146603', street: 'Tumba torg 101', locality: 'Tumba', kommun: 'Botkyrka kommun' })
    expect(body.schedule.events[0]).toMatchObject({ fractions: ['rest'], estimated: false })
  })

  it('ger kalenderprenumerationen 502, aldrig uppmaningskalendern, när adressen inte hittas', async () => {
    const res = await handleIcs(url(`/api/ics?source=srv&file=${encodeURIComponent('nynäsvägen-3_haninge-999')}.ics`), opts())
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('-saknas@')
  })

  it('ger 502 när tjänsten svarar med okänd form', async () => {
    expect((await handleSchedule(schema('ringvägen-10_huddinge-343265'), opts(fakeSrv({ kund: '{"x":1}' })))).status).toBe(502)
  })
})

describe('SRV i API v1', () => {
  it('ger Tumba kommunen Botkyrka', async () => {
    const forslag = JSON.stringify({ results: [{ name: 'Tumba torg 101, 14730 TUMBA', customerId: '146603', address: 'Tumba torg 101', city: 'TUMBA' }] })
    const res = await v1(handleV1Search)(new Request(`https://preview.test/api/v1/sok?q=${encodeURIComponent('Tumba torg 101 Tumba')}`), opts(fakeSrv({ forslag })))
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.addresses).toContainEqual(expect.objectContaining({ street: 'Tumba torg 101', locality: 'Tumba', kommun: 'Botkyrka kommun' }))
  })

  it('ger schemat för ett SRV-id', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=srv&id=${encodeURIComponent('ringvägen-10_huddinge-343265')}`), opts())
    expect(res.status).toBe(200)
  })
})
