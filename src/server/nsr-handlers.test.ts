import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { handleV1Address, handleV1Search, v1 } from './v1.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })

const nsr: Source = {
  id: 'nsr',
  name: 'NSR',
  url: 'https://nsr.se',
  kommuner: [
    { code: '1283', name: 'Helsingborgs kommun' },
    { code: '1260', name: 'Bjuvs kommun' },
    { code: '1292', name: 'Ängelholms kommun' },
  ],
  config: { system: 'nsr' },
}

/** NSR svarar med de sparade svaren; ortindexet och gatuindexet finns på preview.test. */
function fakeNsr({ search = fixture('nsr-adresser.json'), ics = fixture('nsr-kalender.ics') } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.host === 'preview.test') {
      if (url.pathname === '/data/gator/ro.json') return json({ rosenvägen: ['nsr'] })
      if (url.pathname === '/data/orter.json')
        return json({ nsr: { helsingborg: 'Helsingborgs kommun', ekeby: 'Bjuvs kommun', ängelholm: 'Ängelholms kommun' } })
      return new Response('', { status: 404 })
    }
    if (url.pathname.endsWith('/calendar')) return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } })
    return json(search)
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const opts = (fetchFn: typeof fetch = fakeNsr()) => ({ fetchFn, sources: [nsr], timeoutMs: 50, now: new Date('2026-11-03T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const schema = (id: string) => url(`/api/schema?source=nsr&id=${encodeURIComponent(id)}`)
const ID = 'rosenvägen-3_helsingborg-71d627516ce56271010a40fdb5d01eed'

describe('NSR i sajtens API', () => {
  it('söker fram adressen i alla orter, och filtrerar på orten efter ett komma', async () => {
    const all = await (await handleSearch(url('/api/sok?q=Rosenvägen 3&sources=nsr'), opts())).json()
    expect(all.failed).toEqual([])
    expect(all.addresses.slice(0, 3).map((a: { locality: string }) => a.locality)).toEqual(['Helsingborg', 'Ekeby', 'Ängelholm'])

    const fetchFn = fakeNsr()
    const one = await (await handleSearch(url('/api/sok?q=Rosenvägen 3, Ekeby&sources=nsr'), opts(fetchFn))).json()
    expect(one.addresses.map((a: { locality: string }) => a.locality)).toEqual(['Ekeby'])
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('query')).toBe('Rosenvägen 3')
  })

  it('hämtar schemat från kalenderfilen och ger orten rätt kommun', async () => {
    const res = await handleSchedule(schema(ID), opts())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address).toMatchObject({ street: 'Rosenvägen 3', locality: 'Helsingborg', kommun: 'Helsingborgs kommun' })
    expect(body.schedule.events.at(-1).date).toBe('2026-12-28')
  })

  it('blandar inte ihop två adresser med samma NSR-id', async () => {
    // Rosenvägen 34 och Norra Torggatan 7 har båda id:t c3edf067…; här svarar kalendern för en annan adress.
    const fetchFn = fakeNsr({ search: fixture('nsr-adresser-dubbletter.json') })
    const res = await handleSchedule(schema('norra-torggatan-7_hasslarp-c3edf067451d422fe1ae2e7c9379f1f3'), opts(fetchFn))
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('/calendar?'))).toBe(true)
    expect(res.status).toBe(502)
  })

  it('ger kalenderprenumerationen 502, aldrig uppmaningskalendern, när adressen inte hittas', async () => {
    const res = await handleIcs(url(`/api/ics?source=nsr&file=${encodeURIComponent('rosenvägen-3_helsingborg-ffff')}.ics`), opts())
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('-saknas@')
  })

  it('ger 502 när tjänsten svarar med okänd form', async () => {
    for (const fetchFn of [fakeNsr({ search: '{"x":1}' }), fakeNsr({ ics: '<html></html>' })]) {
      expect((await handleSchedule(schema(ID), opts(fetchFn))).status).toBe(502)
    }
  })
})

describe('NSR i API v1', () => {
  it('ger Ekeby kommunen Bjuv', async () => {
    const res = await v1(handleV1Search)(new Request(`https://preview.test/api/v1/sok?q=${encodeURIComponent('Rosenvägen 3 Ekeby')}`), opts())
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.addresses).toContainEqual(expect.objectContaining({ street: 'Rosenvägen 3', locality: 'Ekeby', kommun: 'Bjuvs kommun' }))
  })

  it('ger schemat för ett NSR-id', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=nsr&id=${encodeURIComponent(ID)}`), opts())
    expect(res.status).toBe(200)
  })
})
