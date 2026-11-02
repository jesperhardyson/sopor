import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { handleV1Address, handleV1Search, v1 } from './v1.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })

const stockholm: Source = {
  id: 'stockholm',
  name: 'Stockholm Vatten och Avfall',
  url: 'https://www.stockholmvattenochavfall.se',
  kommuner: [{ code: '0180', name: 'Stockholms kommun' }],
  config: { system: 'svoa' },
}
const ID = 'hjortronvägen-3_bromma-16859'

/** SVOA svarar med de sparade svaren; `addresses` och `schedule` kan bytas per test. */
function fakeSvoa({ addresses = fixture('svoa-adresser.json'), schedule = fixture('svoa-schema.json') } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.host === 'preview.test') {
      if (url.pathname === '/data/gator/hj.json') return json({ hjortronvägen: ['stockholm'] })
      if (url.pathname === '/data/orter.json') return json({})
      return new Response('', { status: 404 })
    }
    return json(url.pathname.endsWith('/AutoCompleteMe') ? addresses : schedule)
  }) as unknown as typeof fetch
}
const opts = (fetchFn = fakeSvoa()) => ({ fetchFn, sources: [stockholm], timeoutMs: 50, now: new Date('2026-11-02T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)

describe('Stockholm i sajtens API', () => {
  it('söker fram Stockholms adresser', async () => {
    const body = await (await handleSearch(url('/api/sok?q=Hjortronvägen&sources=stockholm'), opts())).json()
    expect(body.failed).toEqual([])
    expect(body.addresses).toContainEqual({
      id: ID,
      street: 'Hjortronvägen 3',
      locality: 'Bromma',
      sourceId: 'stockholm',
      kommun: 'Stockholms kommun',
    })
  })

  it('hittar adressen via id:t och ger schemat', async () => {
    const res = await handleSchedule(url(`/api/schema?source=stockholm&id=${encodeURIComponent(ID)}`), opts())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address.street).toBe('Hjortronvägen 3')
    expect(body.schedule.events[0]).toMatchObject({ date: '2026-11-04', fractions: ['rest', 'mat'] })
  })

  it('ger 502, inte 404, när adressökningen inte längre har id:t', async () => {
    const fetchFn = fakeSvoa({ addresses: '[{"value":"Hjortronvägen 30, Bromma, 168 59","data":"168 59"}]' })
    expect((await handleSchedule(url(`/api/schema?source=stockholm&id=${encodeURIComponent(ID)}`), opts(fetchFn))).status).toBe(502)
  })

  it('ger kalenderprenumerationen 502, aldrig uppmaningskalendern, när id:t inte hittas', async () => {
    const fetchFn = fakeSvoa({ addresses: '[]' })
    const res = await handleIcs(url(`/api/ics?source=stockholm&file=${encodeURIComponent(ID)}.ics`), opts(fetchFn))
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('-saknas@')
  })

  it('ger 502 när tjänsten svarar med okänd form', async () => {
    for (const fetchFn of [fakeSvoa({ addresses: '{"x":1}' }), fakeSvoa({ schedule: '{"x":1}' })]) {
      expect((await handleSchedule(url(`/api/schema?source=stockholm&id=${encodeURIComponent(ID)}`), opts(fetchFn))).status).toBe(502)
    }
  })
})

describe('Stockholm i API v1', () => {
  it('söker fram adressen med ort efter gatan', async () => {
    const res = await v1(handleV1Search)(new Request(`https://preview.test/api/v1/sok?q=${encodeURIComponent('Hjortronvägen 3 Bromma')}`), opts())
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.addresses).toContainEqual(expect.objectContaining({ id: ID, source: 'stockholm', kommun: 'Stockholms kommun', locality: 'Bromma' }))
  })

  it('ger schemat för Stockholms id', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=stockholm&id=${encodeURIComponent(ID)}`), opts())
    expect(res.status).toBe(200)
    expect((await res.json()).address.street).toBe('Hjortronvägen 3')
  })
})
