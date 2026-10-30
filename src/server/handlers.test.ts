import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '@/sources'
import { handleIcs, handleSchedule, handleSearch } from './handlers'

const dir = path.resolve(import.meta.dirname, '__fixtures__')
const fixture = (name: string) => readFileSync(path.join(dir, name), 'utf8')

const edp = (id: string, host: string, kommun: string): Source => ({
  id,
  name: `${id} AB`,
  url: `https://${host}`,
  kommuner: [{ code: '0000', name: kommun }],
  config: { system: 'edp', baseUrl: `https://${host}/FutureWeb` },
})

const SOURCES: Source[] = [
  edp('uppsala', 'uppsala.test', 'Uppsala kommun'),
  edp('vafab', 'vafab.test', 'Västerås kommun'),
  edp('trog', 'trog.test', 'Trög kommun'),
  { ...edp('avesta', 'avesta.test', 'Avesta kommun'), config: { system: 'static' } },
]

const json = (body: string) => new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })

/** Uppsala svarar, Vafab svarar med HTML, Trög svarar aldrig. */
const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input))
  if (url.host === 'uppsala.test') {
    return url.pathname.endsWith('SearchAdress') ? json(fixture('uppsala-search.json')) : json(fixture('uppsala-schedule.json'))
  }
  if (url.host === 'vafab.test') return new Response('<html/>', { headers: { 'Content-Type': 'text/html' } })
  return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timeout'))))
}) as unknown as typeof fetch

const opts = { fetchFn, sources: SOURCES, timeoutMs: 50, now: new Date('2026-10-30T10:00:00Z') }

describe('handleSearch', () => {
  it('frågar bara angivna EDP-källor och redovisar de som inte svarar', async () => {
    const res = await handleSearch(new URL('https://x/api/sok?q=Storgatan&sources=uppsala,vafab,trog,avesta'), opts)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.addresses).toHaveLength(10)
    expect(body.addresses[0]).toEqual({
      id: 'storgatan-2_uppsala-4004688',
      street: 'Storgatan 2',
      locality: 'Uppsala',
      sourceId: 'uppsala',
      kommun: 'Uppsala kommun',
    })
    expect(body.failed).toEqual(['vafab', 'trog'])
    // Delsvar cachas bara kort, så att en källa som kommer tillbaka syns snart
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60')
  })

  it('cachar fulla svar länge', async () => {
    const res = await handleSearch(new URL('https://x/api/sok?q=Storgatan&sources=uppsala'), opts)
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=86400')
  })

  it('kräver minst tre tecken', async () => {
    const res = await handleSearch(new URL('https://x/api/sok?q=St&sources=uppsala'), opts)
    expect(res.status).toBe(400)
  })
})

describe('handleSchedule', () => {
  it('hittar adressen via id:t och returnerar schemat', async () => {
    const res = await handleSchedule(new URL('https://x/api/schema?source=uppsala&id=storgatan-2_uppsala-4004688'), opts)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address).toMatchObject({ street: 'Storgatan 2', kommun: 'Uppsala kommun' })
    expect(body.schedule.events[0]).toMatchObject({ date: '2026-11-04', estimated: false })
  })

  it('ger 404 för okänd källa och för byggnads-id som inte finns', async () => {
    expect((await handleSchedule(new URL('https://x/api/schema?source=finns-inte&id=a-1'), opts)).status).toBe(404)
    expect((await handleSchedule(new URL('https://x/api/schema?source=uppsala&id=storgatan-2_uppsala-999'), opts)).status).toBe(404)
  })

  it('ger 502 när källan inte svarar', async () => {
    expect((await handleSchedule(new URL('https://x/api/schema?source=vafab&id=a_b-1'), opts)).status).toBe(502)
  })
})

describe('handleIcs', () => {
  it('ger en kalenderfil där beräknade datum är märkta', async () => {
    const res = await handleIcs(new URL('https://x/api/ics?source=uppsala&file=storgatan-2_uppsala-4004688.ics'), opts)
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
    const text = await res.text()
    expect(text).toContain('UID:storgatan-2_uppsala-4004688-2026-11-04@sopor.hardyson.se')
    expect(text).toContain('(beräknat)')
  })
})
