import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FRACTIONS } from '../domain/fractions.js'
import type { Source } from '../sources/index.js'
import { addressCacheControl, handleV1Address, handleV1NotFound, handleV1Sources, v1, v1Error } from './v1.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const edp = (id: string, host: string, kommun: string): Source => ({
  id,
  name: `${id} AB`,
  url: `https://${host}`,
  kommuner: [{ code: '0000', name: kommun }],
  config: { system: 'edp', baseUrl: `https://${host}/FutureWeb` },
})

const SOURCES: Source[] = [
  edp('uppsala', 'uppsala.test', 'Uppsala kommun'),
  edp('trog', 'trog.test', 'Trög kommun'),
  { ...edp('statisk', 'statisk.test', 'Statiska kommun'), config: { system: 'static' } },
  { ...edp('dold', 'dold.test', 'Dolda kommun'), hidden: true },
]

const event = (date: string) => ({ date, fractions: ['mat'], estimated: false })
const files: Record<string, unknown> = {
  '/data/statisk/addresses.json': {
    sourceId: 'statisk',
    updatedAt: '2026-01-01',
    addresses: [
      ['storgatan-1_örebro', 'Storgatan 1', 'Örebro', ['del']],
      ['gammal-1', 'Gammelgatan 1', 'Örebro', ['gammal']],
      ['tom-1', 'Tomgatan 1', 'Örebro', ['tom']],
    ],
  },
  '/data/statisk/schedules/del.json': {
    id: 'del', validFrom: '2026-01-01', validTo: '2026-12-31', updatedAt: '2026-01-01', bins: [],
    events: [event('2026-10-29'), event('2026-11-02')],
  },
  // Inga valfria fält alls
  '/data/statisk/schedules/tom.json': {
    id: 'tom', validFrom: '2026-01-01', validTo: '2026-12-31', updatedAt: '2026-01-01',
    bins: [{ fraction: 'rest' }],
    events: [{ date: '2026-11-02', fractions: ['mat'] }],
  },
  '/data/statisk/schedules/gammal.json': {
    id: 'gammal', validFrom: '2026-01-01', validTo: '2026-12-31', updatedAt: '2026-01-01', bins: [],
    events: [event('2026-10-01')],
  },
}

/** Uppsala svarar, Trög svarar aldrig, statiska filer finns på preview.test. */
const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input))
  if (url.host === 'uppsala.test') {
    return url.pathname.endsWith('SearchAdress') ? json(fixture('uppsala-search.json')) : json(fixture('uppsala-schedule.json'))
  }
  if (url.host === 'preview.test') return files[url.pathname] ? json(files[url.pathname]) : new Response('', { status: 404 })
  return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timeout'))))
}) as unknown as typeof fetch

const opts = { fetchFn, sources: SOURCES, timeoutMs: 50, now: new Date('2026-10-30T10:00:00Z') }
const get = (p: string) => new Request(`https://preview.test${p}`)
const address = (query: string) => v1(handleV1Address)(get(`/api/v1/adress?${query}`), opts)

describe('handleV1Address', () => {
  it('ger adressen, dagens datum och apiVersion', async () => {
    const res = await address('source=uppsala&id=storgatan-2_uppsala-4004688')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.apiVersion).toBe('1')
    expect(body.today).toBe('2026-10-30')
    expect(body.address).toEqual({
      id: 'storgatan-2_uppsala-4004688',
      street: 'Storgatan 2',
      locality: 'Uppsala',
      kommun: 'Uppsala kommun',
      source: 'uppsala',
      detail: null,
    })
  })

  it('ger nästa hämtning per fraktion med bekvämlighetsfälten', async () => {
    const body = await (await address('source=uppsala&id=storgatan-2_uppsala-4004688')).json()
    expect(Object.keys(body.next[0])).toEqual([
      'fraction', 'name', 'color', 'date', 'daysUntil', 'isToday', 'isTomorrow', 'estimated', 'warning', 'text',
    ])
    for (const n of body.next) {
      expect(n.color).toBe(FRACTIONS[n.fraction as keyof typeof FRACTIONS].color)
      expect(n.name).toBe(FRACTIONS[n.fraction as keyof typeof FRACTIONS].name)
      expect(n.isToday).toBe(n.daysUntil === 0)
      expect(n.isTomorrow).toBe(n.daysUntil === 1)
    }
    expect(typeof body.summary).toBe('string')
  })

  it('ger bara kommande hämtningar, med alla fält utskrivna', async () => {
    const body = await (await address('source=uppsala&id=storgatan-2_uppsala-4004688')).json()
    expect(body.events.length).toBeGreaterThan(0)
    for (const e of body.events) {
      expect(e.date >= '2026-10-30').toBe(true)
      expect(Object.keys(e).sort()).toEqual(['date', 'deviation', 'estimated', 'fractions', 'labels', 'warning'])
      expect(e.labels).toBeTypeOf('object')
    }
    for (const b of body.bins) expect(Object.keys(b).sort()).toEqual(['fraction', 'frequencyText', 'pickupsPerYear', 'sizeLiters'])
    expect(body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('tar bara med fraktioner som förekommer i svaret', async () => {
    const body = await (await address('source=uppsala&id=storgatan-2_uppsala-4004688')).json()
    const used = new Set<string>([
      ...body.events.flatMap((e: { fractions: string[] }) => e.fractions),
      ...body.bins.map((b: { fraction: string }) => b.fraction),
    ])
    expect(new Set(Object.keys(body.fractions))).toEqual(used)
    expect(body.fractions.mat).toEqual({ name: 'Matavfall', short: 'Mat', color: '#7A4A1E', icon: 'apple' })
  })

  it('länkar till kalenderfilen och sajten på anropets egen adress', async () => {
    const body = await (await address('source=uppsala&id=storgatan-2_uppsala-4004688')).json()
    expect(body.links).toEqual({
      ics: 'https://preview.test/ics/uppsala/storgatan-2_uppsala-4004688.ics',
      web: 'https://preview.test/uppsala/storgatan-2_uppsala-4004688',
    })
  })

  it('avkodar ett procentkodat id', async () => {
    const res = await address('source=statisk&id=storgatan-1_%C3%B6rebro')
    expect(res.status).toBe(200)
    expect((await res.json()).address).toMatchObject({ id: 'storgatan-1_örebro', source: 'statisk', detail: null })
  })

  it('tål att rewriten kodar id:t en gång till', async () => {
    const res = await address('source=statisk&id=storgatan-1_%25C3%25B6rebro')
    expect(res.status).toBe(200)
    expect((await res.json()).address.id).toBe('storgatan-1_örebro')
  })

  it('ger 404 och inte ett krasch för en trasig procentkod', async () => {
    for (const q of ['source=statisk&id=%E0', 'source=statisk&id=storgatan-1_%25E0']) {
      const res = await address(q)
      expect(res.status).toBe(404)
      expect((await res.json()).error.code).toBe('not_found')
    }
  })

  it('skriver ut valfria fält som null och labels som {}', async () => {
    const body = await (await address('source=statisk&id=tom-1')).json()
    expect(body.events).toEqual([
      { date: '2026-11-02', fractions: ['mat'], estimated: false, deviation: null, warning: null, labels: {} },
    ])
    expect(body.bins).toEqual([{ fraction: 'rest', sizeLiters: null, pickupsPerYear: null, frequencyText: null }])
  })

  it('ger en tom lista när inga hämtningar är kvar', async () => {
    const res = await address('source=statisk&id=gammal-1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.next).toEqual([])
    expect(body.events).toEqual([])
    expect(body.summary).toBe('Inga kommande hämtningar')
  })

  it('cachar till midnatt i Stockholm', async () => {
    const res = await address('source=uppsala&id=storgatan-2_uppsala-4004688')
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=21600, stale-while-revalidate=3600')
  })

  it('ger 404 för okänd källa, dold källa och okänt id', async () => {
    for (const q of ['source=finns-inte&id=a-1', 'source=dold&id=a_b-1', 'source=uppsala&id=storgatan-2_uppsala-999']) {
      const res = await address(q)
      expect(res.status).toBe(404)
      expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60')
      expect(await res.json()).toEqual({ apiVersion: '1', error: { code: 'not_found', message: expect.any(String) } })
    }
  })

  it('ger 400 när id saknas', async () => {
    const res = await address('source=uppsala')
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect((await res.json()).error.code).toBe('bad_request')
  })

  it('ger 502 när källan inte svarar', async () => {
    const res = await address('source=trog&id=a_b-1')
    expect(res.status).toBe(502)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect((await res.json()).error.code).toBe('source_unavailable')
  })
})

describe('addressCacheControl', () => {
  // Midnatt i Stockholm efter 2026-10-30 är 23:00Z.
  it.each([
    ['2026-10-30T22:59:00Z', 'public, s-maxage=60'],
    ['2026-10-30T17:00:00Z', 'public, s-maxage=21600'],
    ['2026-10-30T16:30:00Z', 'public, s-maxage=21600, stale-while-revalidate=1800'],
    ['2026-10-30T10:00:00Z', 'public, s-maxage=21600, stale-while-revalidate=3600'],
  ])('%s ger %s', (now, expected) => {
    expect(addressCacheControl(new Date(now))).toBe(expected)
  })

  it('ger aldrig s-maxage=0 precis vid midnatt', () => {
    expect(addressCacheControl(new Date('2026-10-30T22:59:59.800Z'))).toBe('public, s-maxage=1')
  })
})

describe('handleV1Sources', () => {
  it('listar synliga källor utan config och hela fraktionsregistret', async () => {
    const res = await v1(handleV1Sources)(get('/api/v1/kallor'), opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=86400')
    const body = await res.json()
    expect(body.apiVersion).toBe('1')
    expect(body.sources.map((s: { id: string }) => s.id)).toEqual(['uppsala', 'trog', 'statisk'])
    expect(body.sources[0]).toEqual({
      id: 'uppsala',
      name: 'uppsala AB',
      url: 'https://uppsala.test',
      kommuner: [{ code: '0000', name: 'Uppsala kommun' }],
      testData: false,
    })
    expect(Object.keys(body.fractions).sort()).toEqual(Object.keys(FRACTIONS).sort())
    expect(body.fractions.karl).toEqual({ name: 'Kärl', short: 'Kärl', color: '#526158', icon: 'container' })
  })
})

describe('v1', () => {
  it('svarar 204 på OPTIONS', async () => {
    const res = await v1(handleV1Sources)(new Request('https://preview.test/api/v1/kallor', { method: 'OPTIONS' }), opts)
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('tillåter alla ursprung på alla svar, också fel', async () => {
    const responses = [
      await v1(handleV1Sources)(get('/api/v1/kallor'), opts),
      await address('source=uppsala&id=storgatan-2_uppsala-4004688'),
      await address('source=finns-inte&id=a-1'),
      await address('source=uppsala'),
      await address('source=trog&id=a_b-1'),
      await v1(handleV1NotFound)(get('/api/v1/finns-inte'), opts),
    ]
    for (const res of responses) expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('ger not_found för okända sökvägar', async () => {
    const res = await v1(handleV1NotFound)(get('/api/v1/finns-inte'), opts)
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
  })

  it('ger felformen med CORS när handlern kastar', async () => {
    const boom = v1(async () => {
      throw new Error('okänd fraktion')
    })
    const res = await boom(get('/api/v1/kallor'), opts)
    expect(res.status).toBe(502)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ apiVersion: '1', error: { code: 'source_unavailable', message: expect.any(String) } })
  })

  it('v1Error har den gemensamma felformen', async () => {
    const res = v1Error(400, 'bad_request', 'Fel')
    expect(await res.json()).toEqual({ apiVersion: '1', error: { code: 'bad_request', message: 'Fel' } })
  })
})
