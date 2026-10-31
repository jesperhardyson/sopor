import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { lookupAddress } from './lookup.js'
import { siteJson } from './site.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const uppsala: Source = {
  id: 'uppsala',
  name: 'uppsala AB',
  url: 'https://uppsala.test',
  kommuner: [{ code: '0000', name: 'Uppsala kommun' }],
  config: { system: 'edp', baseUrl: 'https://uppsala.test/FutureWeb' },
}
const avesta: Source = { ...uppsala, id: 'avesta', name: 'avesta AB', kommuner: [{ code: '1', name: 'Avesta kommun' }], config: { system: 'static' } }

const part = (id: string, validFrom: string, validTo: string, dates: string[]) => ({
  id,
  validFrom,
  validTo,
  updatedAt: '2026-01-01',
  bins: [],
  events: dates.map((date) => ({ date, fractions: ['mat'], estimated: false })),
})

const files: Record<string, unknown> = {
  '/data/avesta/addresses.json': {
    sourceId: 'avesta',
    updatedAt: '2026-01-01',
    addresses: [['storgatan-1', 'Storgatan 1', 'Avesta', ['2026-a', '2026-b']]],
  },
  // Utan ordning i filen och mellan delarna
  '/data/avesta/schedules/2026-a.json': part('2026-a', '2026-01-01', '2026-06-30', ['2026-03-10', '2026-01-10']),
  '/data/avesta/schedules/2026-b.json': part('2026-b', '2026-07-01', '2026-12-31', ['2026-09-10', '2026-07-10']),
}

const staticFetch = ((input: string | URL | Request) => {
  const url = new URL(String(input))
  const body = url.host === 'x' ? files[url.pathname] : undefined
  return Promise.resolve(body ? json(body) : new Response('', { status: 404 }))
}) as unknown as typeof fetch

const edpFetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input))
  return url.pathname.endsWith('SearchAdress') ? json(fixture('uppsala-search.json')) : json(fixture('uppsala-schedule.json'))
}) as unknown as typeof fetch

const opts = { sources: [uppsala, avesta], timeoutMs: 50, now: new Date('2026-10-30T10:00:00Z') }

describe('lookupAddress', () => {
  it('ger 404 utan källa', async () => {
    expect(await lookupAddress(undefined, 'x', 'https://x', { ...opts, fetchFn: staticFetch })).toEqual({ status: 404 })
  })

  it('slår upp en EDP-adress med datumsorterat schema', async () => {
    const r = await lookupAddress(uppsala, 'storgatan-2_uppsala-4004688', 'https://x', { ...opts, fetchFn: edpFetch })
    if (r.status !== 200) throw new Error(`status ${r.status}`)
    expect(r.address).toEqual({
      id: 'storgatan-2_uppsala-4004688',
      street: 'Storgatan 2',
      locality: 'Uppsala',
      sourceId: 'uppsala',
      kommun: 'Uppsala kommun',
    })
    const dates = r.schedule.events.map((e) => e.date)
    expect(dates.length).toBeGreaterThan(1)
    expect(dates).toEqual([...dates].sort())
  })

  it('ger 404 för okänt EDP-id och 502 när källan inte svarar', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const o = { ...opts, fetchFn: edpFetch }
    expect(await lookupAddress(uppsala, 'storgatan-2_uppsala-1', 'https://x', o)).toEqual({ status: 404 })
    const down = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
    expect(await lookupAddress(uppsala, 'storgatan-2_uppsala-4004688', 'https://x', { ...opts, fetchFn: down })).toEqual({ status: 502 })
    expect(err).toHaveBeenCalledTimes(1)
  })

  it('slår upp en statisk adress och slår ihop delarna i datumordning', async () => {
    const r = await lookupAddress(avesta, 'storgatan-1', 'https://x', { ...opts, fetchFn: staticFetch })
    if (r.status !== 200) throw new Error(`status ${r.status}`)
    expect(r.address).toEqual({ id: 'storgatan-1', street: 'Storgatan 1', locality: 'Avesta', sourceId: 'avesta', kommun: 'Avesta kommun' })
    expect(r.schedule.events.map((e) => e.date)).toEqual(['2026-01-10', '2026-03-10', '2026-07-10', '2026-09-10'])
  })

  it('ger 404 för okänt statiskt id', async () => {
    expect(await lookupAddress(avesta, 'finns-inte', 'https://x', { ...opts, fetchFn: staticFetch })).toEqual({ status: 404 })
  })

  it('ger 502 när addresses.json svarar 500, saknas eller nätet felar', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f500 = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
    const f404 = (async () => new Response('', { status: 404 })) as unknown as typeof fetch
    const fNet = vi.fn(async () => {
      throw new Error('nät')
    }) as unknown as typeof fetch
    for (const fetchFn of [f500, f404, fNet]) {
      expect(await lookupAddress(avesta, 'storgatan-1', 'https://x', { ...opts, fetchFn })).toEqual({ status: 502 })
    }
    expect(err).toHaveBeenCalled()
  })

  it('ger 502 när en schemafil saknas', async () => {
    const missing = ((input: string | URL | Request) => {
      const p = new URL(String(input)).pathname
      return Promise.resolve(p.endsWith('2026-b.json') ? new Response('', { status: 404 }) : staticFetch(input))
    }) as unknown as typeof fetch
    expect(await lookupAddress(avesta, 'storgatan-1', 'https://x', { ...opts, fetchFn: missing })).toEqual({ status: 502 })
  })
})

describe('siteJson', () => {
  it('ger null på 404 och SourceError på ogiltig JSON', async () => {
    expect(await siteJson('https://x', '/finns-inte.json', staticFetch)).toBeNull()
    const bad = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    await expect(siteJson('https://x', '/a.json', bad)).rejects.toThrow('ogiltig JSON')
  })
})
