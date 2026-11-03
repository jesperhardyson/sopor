import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { handleV1Address, handleV1Search, v1 } from './v1.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })

const vasyd: Source = {
  id: 'vasyd',
  name: 'VA Syd',
  url: 'https://www.vasyd.se',
  kommuner: [{ code: '1280', name: 'Malmö kommun' }, { code: '1231', name: 'Burlövs kommun' }],
  config: { system: 'vasyd' },
}

/** VA Syd svarar med de sparade svaren; ortindexet och gatuindexet finns på preview.test. */
function fakeVasyd({ addresses = fixture('vasyd-adresser.json'), schedule = fixture('vasyd-schema.json') } = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.host === 'preview.test') {
      if (url.pathname === '/data/gator/st.json') return json({ storgatan: ['vasyd'] })
      if (url.pathname === '/data/orter.json') return json({ vasyd: { malmö: 'Malmö kommun', arlöv: 'Burlövs kommun' } })
      return new Response('', { status: 404 })
    }
    void init
    return json(url.pathname.endsWith('/buildingaddresssearch') ? addresses : schedule)
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const opts = (fetchFn = fakeVasyd()) => ({ fetchFn, sources: [vasyd], timeoutMs: 50, now: new Date('2026-11-03T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const schema = (id: string) => url(`/api/schema?source=vasyd&id=${encodeURIComponent(id)}`)

describe('VA Syd i sajtens API', () => {
  it('söker fram båda byggnaderna med samma adress, med särskiljare', async () => {
    const body = await (await handleSearch(url('/api/sok?q=Storgatan 1&sources=vasyd'), opts())).json()
    expect(body.failed).toEqual([])
    const storgatan1 = body.addresses.filter((a: { street: string }) => a.street === 'Storgatan 1')
    expect(storgatan1.map((a: { detail: string }) => a.detail)).toEqual(['Byggnad 125040', 'Byggnad 185904'])
  })

  it('hittar rätt byggnad via id:t och hämtar dess schema', async () => {
    const fetchFn = fakeVasyd()
    const res = await handleSchedule(schema('storgatan-1_malmö-185904'), opts(fetchFn))
    expect(res.status).toBe(200)
    expect((await res.json()).address.kommun).toBe('Malmö kommun')
    const scheduleCall = fetchFn.mock.calls.find(([u]) => String(u).endsWith('/wastepickupbyaddress'))!
    expect(new URLSearchParams(String((scheduleCall[1] as RequestInit).body)).get('query')).toBe('185904')
  })

  it('ger 502, inte 404, när byggnaden inte längre finns i sökningen', async () => {
    expect((await handleSchedule(schema('storgatan-1_malmö-999999'), opts())).status).toBe(502)
  })

  it('ger kalenderprenumerationen 502, aldrig uppmaningskalendern, när byggnaden inte hittas', async () => {
    const res = await handleIcs(url(`/api/ics?source=vasyd&file=${encodeURIComponent('storgatan-1_malmö-999999')}.ics`), opts())
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('-saknas@')
  })

  it('ger 502 när tjänsten svarar med okänd form', async () => {
    for (const fetchFn of [fakeVasyd({ addresses: '{"x":1}' }), fakeVasyd({ schedule: '{"items":[],"meta":{"success":false}}' })]) {
      expect((await handleSchedule(schema('storgatan-1_malmö-125040'), opts(fetchFn))).status).toBe(502)
    }
  })
})

describe('VA Syd i API v1', () => {
  it('ger Arlöv kommunen Burlöv', async () => {
    const res = await v1(handleV1Search)(new Request(`https://preview.test/api/v1/sok?q=${encodeURIComponent('Storgatan 10 Arlöv')}`), opts())
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.addresses).toContainEqual(expect.objectContaining({ street: 'Storgatan 10', locality: 'Arlöv', kommun: 'Burlövs kommun' }))
  })

  it('ger schemat för ett VA Syd-id', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=vasyd&id=${encodeURIComponent('storgatan-1_malmö-125040')}`), opts())
    expect(res.status).toBe(200)
  })
})
