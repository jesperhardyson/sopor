import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { idHash } from './edp.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { handleV1Address, handleV1Search, v1 } from './v1.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: string) => new Response(body, { headers: { 'Content-Type': 'application/json' } })

const vaxholm: Source = {
  id: 'vaxholm',
  name: 'Roslagsvatten',
  url: 'https://roslagsvatten.se',
  kommuner: [{ code: '0187', name: 'Vaxholms stad' }],
  config: { system: 'roslagsvatten', municipality: 'vaxholm' },
}
const ID = `hamngatan-1_vaxholm-${idHash('100000001')}`

const NO_HITS = () => new Response('The website encountered an unexpected error. Try again later.', { status: 500, headers: { 'Content-Type': 'text/html' } })

/** Roslagsvatten svarar med de sparade svaren; gatuindexet finns på preview.test. */
function fake({ sok = () => json(fixture('roslagsvatten-sok.json')) }: { sok?: () => Response } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.host === 'preview.test') {
      if (url.pathname === '/data/gator/ha.json') return json(JSON.stringify({ hamngatan: ['vaxholm'] }))
      return new Response('', { status: 404 })
    }
    return url.pathname.endsWith('/search') ? sok() : json(fixture('roslagsvatten-schema.json'))
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const opts = (fetchFn: typeof fetch = fake()) => ({ fetchFn, sources: [vaxholm], timeoutMs: 50, now: new Date('2026-11-04T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const schema = (id: string) => url(`/api/schema?source=vaxholm&id=${encodeURIComponent(id)}`)

describe('Roslagsvatten i sajtens API', () => {
  it('söker utan orten och filtrerar på den efteråt, utan att visa värdet', async () => {
    const res = await (await handleSearch(url('/api/sok?q=Hamngatan 1, Vaxholm&sources=vaxholm'), opts())).json()
    expect(res.failed).toEqual([])
    expect(res.addresses[0]).toEqual({ id: ID, street: 'Hamngatan 1', locality: 'Vaxholm', sourceId: 'vaxholm', kommun: 'Vaxholms stad' })
    expect(JSON.stringify(res)).not.toContain('100000001')
  })

  it('behåller en adress utan ort när man skriver kommunen', async () => {
    const res = await (await handleSearch(url('/api/sok?q=Hamngatan, Vaxholm&sources=vaxholm'), opts())).json()
    expect(res.addresses.map((a: { street: string }) => a.street)).toContain('Hamngatan 3 -7')
  })

  it('ger inga träffar, och inget fel, när sajten svarar 500 på en sökning utan träffar', async () => {
    const res = await (await handleSearch(url('/api/sok?q=xyzzy&sources=vaxholm'), opts(fake({ sok: NO_HITS })))).json()
    expect(res).toEqual({ addresses: [], failed: [] })
  })

  it('ger schemat, med framräknade datum märkta och utan Ekerös odaterade fyrfackskärl', async () => {
    const res = await (await handleSchedule(schema(ID), opts())).json()
    expect(res.address.street).toBe('Hamngatan 1')
    expect(res.schedule.events[0]).toEqual({ date: '2026-11-06', fractions: ['rest', 'mat'], estimated: false })
    expect(res.schedule.events[1]).toMatchObject({ date: '2026-11-20', estimated: true })
    expect(JSON.stringify(res.schedule)).not.toContain('Fyrfack')
  })

  it('ger 502, inte 404, för ett id utan träff, och när sökningen inte hittar något alls', async () => {
    expect((await handleSchedule(schema(`hamngatan-31_vaxholm-${idHash('999')}`), opts())).status).toBe(502)
    expect((await handleSchedule(schema(ID), opts(fake({ sok: NO_HITS })))).status).toBe(502)
  })

  it('ger en kalenderfil', async () => {
    const res = await handleIcs(url(`/api/ics?source=vaxholm&file=${encodeURIComponent(ID)}.ics`), opts())
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('DTSTART;VALUE=DATE:20261106')
  })
})

describe('Roslagsvatten i API v1', () => {
  it('söker fram adressen', async () => {
    const res = await v1(handleV1Search)(new Request(`https://preview.test/api/v1/sok?q=${encodeURIComponent('Hamngatan 1 Vaxholm')}`), opts())
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.addresses).toContainEqual(expect.objectContaining({ id: ID, kommun: 'Vaxholms stad' }))
  })

  it('ger schemat för ett Roslagsvatten-id', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=vaxholm&id=${encodeURIComponent(ID)}`), opts())
    expect(res.status).toBe(200)
  })
})
