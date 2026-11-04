import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { idHash } from './edp.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { handleV1Address, handleV1Search, v1 } from './v1.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const uddevalla: Source = {
  id: 'uddevalla',
  name: 'Uddevalla Energi',
  url: 'https://www.uddevallaenergi.se',
  kommuner: [{ code: '1485', name: 'Uddevalla kommun' }],
  config: { system: 'uddevalla' },
}
const ID = `kungsgatan-10_uddevalla-${idHash('FAKE0004+/=')}`

/** Uddevalla Energi svarar med de sparade svaren; gatuindexet finns på preview.test. */
function fakeUddevalla({ tomningar = fixture('uddevalla-tomningar.json') } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.host === 'preview.test') {
      if (url.pathname === '/data/gator/ku.json') return json({ kungsgatan: ['uddevalla'] })
      return new Response('', { status: 404 })
    }
    return json(url.pathname.endsWith('/address-flat') ? fixture('uddevalla-adresser.json') : tomningar)
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const opts = (fetchFn: typeof fetch = fakeUddevalla()) => ({ fetchFn, sources: [uddevalla], timeoutMs: 50, now: new Date('2026-11-04T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const schema = (id: string) => url(`/api/schema?source=uddevalla&id=${encodeURIComponent(id)}`)

describe('Uddevalla i sajtens API', () => {
  it('söker utan orten och filtrerar på den efteråt, utan att visa plant_number', async () => {
    const fetchFn = fakeUddevalla()
    const res = await (await handleSearch(url('/api/sok?q=Kungsgatan 10, Uddevalla&sources=uddevalla'), opts(fetchFn))).json()
    expect(res.failed).toEqual([])
    expect(res.addresses.map((a: { id: string }) => a.id)).toContain(ID)
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('address')).toBe('Kungsgatan 10')
    expect(JSON.stringify(res)).not.toContain('FAKE')
  })

  it('hämtar schemat', async () => {
    const res = await handleSchedule(schema(ID), opts())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address).toMatchObject({ id: ID, street: 'Kungsgatan 10', locality: 'Uddevalla', kommun: 'Uddevalla kommun' })
    expect(body.schedule.events).toEqual([{ date: '2026-11-04', fractions: ['rest', 'mat'], estimated: false }])
  })

  it('ger kalenderprenumerationen 502, aldrig uppmaningskalendern, när adressen inte hittas', async () => {
    const res = await handleIcs(url(`/api/ics?source=uddevalla&file=${encodeURIComponent('finnsinte-1_uddevalla-abc')}.ics`), opts())
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('-saknas@')
  })

  it('ger 502 när tjänsten svarar med okänd form', async () => {
    expect((await handleSchedule(schema(ID), opts(fakeUddevalla({ tomningar: '{"x":1}' })))).status).toBe(502)
  })
})

describe('Uddevalla i API v1', () => {
  it('söker fram adressen', async () => {
    const res = await v1(handleV1Search)(new Request(`https://preview.test/api/v1/sok?q=${encodeURIComponent('Kungsgatan 10 Uddevalla')}`), opts())
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.addresses).toContainEqual(expect.objectContaining({ id: ID, kommun: 'Uddevalla kommun' }))
  })

  it('ger schemat för ett Uddevalla-id', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=uddevalla&id=${encodeURIComponent(ID)}`), opts())
    expect(res.status).toBe(200)
  })
})
