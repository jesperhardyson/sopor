import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { FRACTIONS } from '../domain/fractions.js'
import type { Source } from '../sources/index.js'
import type { HandlerOptions } from './handlers.js'
import { addressCacheControl, handleV1Address, handleV1Areas, handleV1NotFound, handleV1Search, handleV1Sources, v1, v1Error } from './v1.js'

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
  {
    ...edp('trog', 'trog.test', 'Trög kommun'),
    contact: {
      phone: { number: '+4611123456', display: '011-12 34 56' },
      email: 'kundtjanst@trog.test',
      page: 'https://trog.test/kontakt',
      checked: { url: 'https://trog.test/kontakt', date: '2026-11-07' },
    },
  },
  { ...edp('statisk', 'statisk.test', 'Statiska kommun'), config: { system: 'static' } },
  { ...edp('dold', 'dold.test', 'Dolda kommun'), hidden: true },
  { ...edp('avesta', 'avesta.test', 'Avesta kommun'), config: { system: 'static' }, selection: 'area', areaNotice: { title: 'Kontrollera området', text: 'Du har valt det själv.' }, publishing: 'Avesta AB publicerar schemat ett år i taget.' },
]

const event = (date: string) => ({ date, fractions: ['mat'], estimated: false })
const files: Record<string, unknown> = {
  '/data/gator/st.json': { storgatan: ['uppsala'] },
  '/data/orter.json': {},
  '/data/statisk/addresses.json': {
    sourceId: 'statisk',
    updatedAt: '2026-01-01',
    addresses: [
      ['storgatan-1_örebro', 'Storgatan 1', 'Örebro', ['del']],
      ['gammal-1', 'Gammelgatan 1', 'Örebro', ['gammal']],
      ['tom-1', 'Tomgatan 1', 'Örebro', ['tom']],
    ],
  },
  '/data/avesta/addresses.json': {
    sourceId: 'avesta',
    updatedAt: '2026-01-01',
    addresses: [
      ['trakt-7', 'Avesta tätort', '', ['2026-trakt-7'], { detail: 'Tisdag, jämn vecka · Trakt 7', searchTerms: ['Trakt 7', 'Stallgatan'] }],
      ['trakt-3', 'Fors, Nordanö m.fl.', '', ['2026-trakt-3'], { detail: 'Onsdag, udda vecka · Trakt 3', searchTerms: ['Fors', 'Norr', 'Norr och Sör Nävde'] }],
    ],
  },
  '/data/avesta/omraden.json': {
    explanation: 'Förklaring.',
    help: 'Hjälp.',
    areas: [
      { id: 'trakt-3', name: 'Fors, Nordanö m.fl.', day: 'Onsdag, udda vecka', label: 'Trakt 3', places: [], otherDays: [], searchTerms: [], dates: ['2026-10-13', '2026-10-20', '2026-10-27', '2026-11-10'] },
      { id: 'utan-etikett', name: 'Dalsbyn m.fl.', day: 'Måndag, ojämn vecka', places: [], otherDays: [], searchTerms: [], dates: ['2026-10-14', '2026-10-27'] },
    ],
  },
  '/data/gator/kr.json': { krylbo: ['avesta'], kristinehamn: ['uppsala'] },
  '/data/avesta/schedules/2026-trakt-7.json': {
    id: '2026-trakt-7', validFrom: '2026-01-01', validTo: '2026-12-31', updatedAt: '2026-01-01', bins: [],
    events: [event('2026-11-03')],
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
      selection: 'address',
      notice: null,
    })
  })

  it('säger hur långt ett publicerat schema gäller och varför', async () => {
    const area = await (await address('source=avesta&id=trakt-7')).json()
    expect(area.schedule).toEqual({ until: '2026-12-31', reason: 'Avesta AB publicerar schemat ett år i taget.' })
    const plain = await (await address('source=statisk&id=storgatan-1_%C3%B6rebro')).json()
    expect(plain.schedule).toEqual({ until: '2026-12-31', reason: null })
  })

  it('ger inget slut för ett schema som räknas fram', async () => {
    const body = await (await address('source=uppsala&id=storgatan-2_uppsala-4004688')).json()
    expect(body.schedule).toBeNull()
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
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await address('source=trog&id=a_b-1')
    expect(res.status).toBe(502)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect((await res.json()).error.code).toBe('source_unavailable')
    expect(err).toHaveBeenCalled()
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
    expect(body.sources.map((s: { id: string }) => s.id)).toEqual(['uppsala', 'trog', 'statisk', 'avesta'])
    expect(body.sources[0]).toEqual({
      id: 'uppsala',
      name: 'uppsala AB',
      url: 'https://uppsala.test',
      kommuner: [{ code: '0000', name: 'Uppsala kommun' }],
      testData: false,
      contact: null,
    })
    expect(body.sources[1].contact).toEqual({
      phone: { number: '+4611123456', display: '011-12 34 56' },
      email: 'kundtjanst@trog.test',
      page: 'https://trog.test/kontakt',
      checkedAt: '2026-11-07',
      checkedUrl: 'https://trog.test/kontakt',
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
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = v1(async () => {
      throw new Error('okänd fraktion')
    })
    const res = await boom(get('/api/v1/kallor'), opts)
    expect(res.status).toBe(502)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ apiVersion: '1', error: { code: 'source_unavailable', message: expect.any(String) } })
    expect(err).toHaveBeenCalledTimes(1)
  })

  it('v1Error har den gemensamma felformen', async () => {
    const res = v1Error(400, 'bad_request', 'Fel')
    expect(await res.json()).toEqual({ apiVersion: '1', error: { code: 'bad_request', message: 'Fel' } })
  })
})

describe('handleV1Areas', () => {
  const areas = (plats: string, o = opts) => v1(handleV1Areas)(get(`/api/v1/omraden?plats=${encodeURIComponent(plats)}`), o)
  const ids = async (plats: string) => (await (await areas(plats)).json()).addresses.map((a: { id: string }) => a.id)

  it('ger källans områden som träffar, i källans ordning', async () => {
    const res = await areas('Avesta')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.apiVersion).toBe('1')
    expect(body.failed).toEqual([])
    expect(body.addresses.map((a: { id: string }) => a.id)).toEqual(['trakt-3', 'utan-etikett'])
    expect(body.addresses[0]).toMatchObject({
      street: 'Fors, Nordanö m.fl.',
      locality: '',
      kommun: 'Avesta kommun',
      source: 'avesta',
      detail: 'Onsdag, udda vecka · Trakt 3',
      selection: 'area',
      areasUrl: 'https://preview.test/avesta/omraden',
      url: 'https://preview.test/api/v1/adress/avesta/trakt-3',
    })
    expect(body.addresses[0].notice).toBeTruthy()
    expect(body.addresses[1].detail).toBe('Måndag, ojämn vecka')
  })

  it('känner igen kommunen med ordet kommun och en ort i kommunen', async () => {
    expect(await ids('avesta kommun')).toHaveLength(2)
    expect(await ids('Krylbo')).toHaveLength(2)
  })

  it('ger en tom lista för en plats utan områdesval', async () => {
    expect(await ids('Uppsala')).toEqual([])
    expect(await ids('Kristinehamn')).toEqual([])
  })

  it('kräver minst två tecken', async () => {
    expect((await areas('a')).status).toBe(400)
  })

  it('säger vilken källa som inte svarade', async () => {
    const down = (async (input: string | URL | Request, init?: RequestInit) =>
      String(input).includes('omraden.json') ? new Response('', { status: 500 }) : fetchFn(input, init)) as typeof fetch
    const body = await (await areas('Avesta', { ...opts, fetchFn: down })).json()
    expect(body).toMatchObject({ addresses: [], failed: ['avesta'] })
  })

  describe('med tomning', () => {
    const found = (tomning: string, o = opts, plats = 'Avesta') =>
      v1(handleV1Areas)(get(`/api/v1/omraden?plats=${encodeURIComponent(plats)}&tomning=${tomning}`), o)

    it('ger området med hämtning datumet, dess datum och samma fält som annars', async () => {
      const res = await found('2026-10-20')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.dateCovered).toBe(true)
      expect(body.failed).toEqual([])
      expect(body.addresses).toHaveLength(1)
      expect(body.addresses[0]).toMatchObject({
        id: 'trakt-3',
        detail: 'Onsdag, udda vecka · Trakt 3',
        selection: 'area',
        url: 'https://preview.test/api/v1/adress/avesta/trakt-3',
        pickups: { previous: ['2026-10-13', '2026-10-20'], next: '2026-10-27' },
      })
      expect(body.addresses[0].notice).toBeTruthy()
    })

    it('ger bara det angivna datumet när det är områdets första', async () => {
      const body = await (await found('2026-10-13')).json()
      expect(body.addresses[0].pickups.previous).toEqual(['2026-10-13'])
    })

    it('ger alla områden med hämtning samma dag', async () => {
      const body = await (await found('2026-10-27')).json()
      expect(body.addresses.map((a: { id: string; pickups: unknown }) => [a.id, a.pickups])).toEqual([
        ['trakt-3', { previous: ['2026-10-20', '2026-10-27'], next: '2026-11-10' }],
        ['utan-etikett', { previous: ['2026-10-14', '2026-10-27'], next: null }],
      ])
    })

    it('skiljer ingen hämtning från datum utanför schemat', async () => {
      expect(await (await found('2026-10-24')).json()).toMatchObject({ addresses: [], dateCovered: true })
      expect(await (await found('2026-10-12')).json()).toMatchObject({ addresses: [], dateCovered: false })
      const later = { ...opts, now: new Date('2026-11-20T10:00:00Z') }
      expect(await (await found('2026-11-11', later)).json()).toMatchObject({ addresses: [], dateCovered: false })
    })

    it('tar i dag men inte framtiden, räknat i Stockholm', async () => {
      expect((await found('2026-10-30')).status).toBe(200)
      const res = await found('2026-10-31')
      expect(res.status).toBe(400)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect((await res.json()).error.code).toBe('bad_request')
      const lateEvening = { ...opts, now: new Date('2026-10-30T23:30:00Z') }
      expect((await found('2026-10-31', lateEvening)).status).toBe(200)
    })

    it.each(['', 'igår', '2026-13-01', '2026-02-30', '20261027'])('ger 400 för ogiltigt datum: "%s"', async (tomning) => {
      const res = await found(tomning)
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe('bad_request')
    })

    it('ger en tom lista och null för en plats utan områdesval', async () => {
      const body = await (await found('2026-10-20', opts, 'Uppsala')).json()
      expect(body).toMatchObject({ addresses: [], failed: [], dateCovered: null })
    })

    it('ger null och kort cache när källan inte svarar', async () => {
      const down = (async (input: string | URL | Request, init?: RequestInit) =>
        String(input).includes('omraden.json') ? new Response('', { status: 500 }) : fetchFn(input, init)) as typeof fetch
      const res = await found('2026-10-20', { ...opts, fetchFn: down })
      expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60')
      expect(await res.json()).toMatchObject({ addresses: [], failed: ['avesta'], dateCovered: null })
    })

    it('slutar cachas senast vid midnatt i Stockholm', async () => {
      const res = await found('2026-10-20')
      expect(res.headers.get('Cache-Control')).toBe(addressCacheControl(opts.now))
    })

    it('ändrar inget i svaret utan tomning', async () => {
      const res = await areas('Avesta')
      expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=86400, stale-while-revalidate=604800')
      const body = await res.json()
      expect(Object.keys(body).sort()).toEqual(['addresses', 'apiVersion', 'failed'])
      expect(Object.keys(body.addresses[0]).sort()).toEqual(['areasUrl', 'detail', 'id', 'kommun', 'locality', 'notice', 'selection', 'source', 'street', 'url'])
    })
  })
})

describe('handleV1Search', () => {
  const calls = fetchFn as unknown as Mock<(input: string | URL | Request) => Promise<Response>>
  const search = (query: string, o: HandlerOptions = opts) => v1(handleV1Search)(get(`/api/v1/sok?${query}`), o)
  const q = (text: string, extra = '') => `q=${encodeURIComponent(text)}${extra}`
  const hosts = () => calls.mock.calls.map(([input]) => new URL(String(input)).host)

  it('frågar bara källan som gatuindexet pekar ut och ger v1-adresser', async () => {
    calls.mockClear()
    const res = await search(q('Storgatan 2, Uppsala'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=86400, stale-while-revalidate=604800')
    const body = await res.json()
    expect(body.apiVersion).toBe('1')
    expect(body.failed).toEqual([])
    expect(body.addresses.length).toBeGreaterThan(0)
    for (const a of body.addresses) {
      expect(Object.keys(a).sort()).toEqual(['areasUrl', 'detail', 'id', 'kommun', 'locality', 'notice', 'selection', 'source', 'street', 'url'])
      expect(a.areasUrl).toBeNull()
      expect(a.url).toBe(`https://preview.test/api/v1/adress/uppsala/${encodeURIComponent(a.id)}`)
    }
    expect(hosts()).toContain('uppsala.test')
    expect(hosts()).not.toContain('trog.test')
  })

  it('söker på gatan och filtrerar på orten eller kommunen efter den', async () => {
    calls.mockClear()
    const body = await (await search(q('Storgatan 2 Uppsala'))).json()
    const edpBodies = vi
      .mocked(fetchFn)
      .mock.calls.filter(([i]) => String(i).includes('SearchAdress'))
      .map(([, init]) => JSON.parse(String(init?.body)))
    // Fixturen har tio träffar, alltså ett avkortat svar: då frågas källan också med orten.
    expect(edpBodies).toEqual([{ searchText: 'storgatan 2' }, { searchText: 'storgatan 2, uppsala' }])
    expect(body.addresses.length).toBeGreaterThan(0)
    expect((await (await search(q('Storgatan 2 Lund'))).json()).addresses).toEqual([])
  })

  it('kalla hoppar över gatuindexet', async () => {
    calls.mockClear()
    const res = await search(q('Storgatan 2', '&kalla=uppsala'))
    expect((await res.json()).addresses.length).toBeGreaterThan(0)
    expect(calls.mock.calls.some(([i]) => String(i).includes('/data/gator/'))).toBe(false)
    expect(hosts()).not.toContain('trog.test')
  })

  it('okänd eller dold kalla ger 404 not_found', async () => {
    for (const kalla of ['finns-inte', 'dold']) {
      const res = await search(q('Storgatan 2', `&kalla=${kalla}`))
      expect(res.status).toBe(404)
      expect((await res.json()).error.code).toBe('not_found')
    }
  })

  it('för kort fråga ger 400 bad_request', async () => {
    const res = await search(q('St'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.apiVersion).toBe('1')
    expect(body.error.code).toBe('bad_request')
  })

  it('en källa som inte svarar hamnar i failed med kort cache', async () => {
    const res = await search(q('Storgatan 2', '&kalla=trog'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60')
    expect(await res.json()).toMatchObject({ addresses: [], failed: ['trog'] })
  })

  it('gatuindexet som saknas stoppar inte sökningen', async () => {
    const down = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
      String(input).includes('/data/gator/') ? new Response('', { status: 500 }) : fetchFn(input, init),
    ) as unknown as typeof fetch
    const res = await search(q('Storgatan 2'), { ...opts, fetchFn: down })
    expect(res.status).toBe(200)
    // Siffran gör att alla live-källor frågas: Uppsala svarar, Trög hamnar i failed
    const body = await res.json()
    expect(body.addresses.length).toBeGreaterThan(0)
    expect(body.failed).toEqual(['trog'])
  })

  it('söker statiska källor lokalt och ger dem kommunens namn', async () => {
    const res = await search(q('Storgatan 1', '&kalla=statisk'))
    const body = await res.json()
    expect(body.failed).toEqual([])
    expect(body.addresses).toEqual([
      {
        id: 'storgatan-1_örebro',
        street: 'Storgatan 1',
        locality: 'Örebro',
        kommun: 'Statiska kommun',
        source: 'statisk',
        detail: null,
        selection: 'address',
        notice: null,
        areasUrl: null,
        url: `https://preview.test/api/v1/adress/statisk/${encodeURIComponent('storgatan-1_örebro')}`,
      },
    ])
  })

  it('en statisk källa som inte går att läsa hamnar i failed', async () => {
    const res = await search(q('Storgatan 1', '&kalla=statisk'), { ...opts, fetchFn: (async () => new Response('', { status: 404 })) as typeof fetch })
    expect(await res.json()).toMatchObject({ addresses: [], failed: ['statisk'] })
  })

  describe('källor efter ort och tidsgräns', () => {
    const at = (id: string, code: string, name: string): Source => ({ ...edp(id, `${id}.test`, name), kommuner: [{ code, name }] })
    const local = [at('uppsala', '0380', 'Uppsala kommun'), at('trog', '0381', 'Trög kommun'), at('tom', '0382', 'Tomma kommun')]
    const sverige = { kommuner: {}, orter: { uppsala: ['0380'], tomma: ['0382'] } }
    /** Tom svarar utan träffar, och gatuindexet pekar ut alla tre. */
    const placeFetch = (extra: (url: URL) => Response | undefined = () => undefined, lookup: object = sverige) =>
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input))
        if (url.pathname === '/data/sverige.json') return json(lookup)
        if (url.pathname === '/data/gator/st.json') return json({ storgatan: ['uppsala', 'trog', 'tom'] })
        if (url.host === 'tom.test') return json({ Succeeded: true, Buildings: [] })
        return extra(url) ?? fetchFn(input, init)
      }) as unknown as typeof fetch
    const hostsOf = (f: typeof fetch) => vi.mocked(f).mock.calls.map(([i]) => new URL(String(i)).host)

    it('frågar bara källan som täcker orten i frågan', async () => {
      const f = placeFetch()
      const body = await (await search(q('Storgatan 2, Uppsala'), { ...opts, sources: local, fetchFn: f })).json()
      expect(body.addresses.length).toBeGreaterThan(0)
      expect(body.failed).toEqual([])
      expect(hostsOf(f)).not.toContain('trog.test')
    })

    it('frågar övriga källor när ortens källa saknar adressen, utan att rapportera dem som fel', async () => {
      const f = placeFetch()
      const res = await search(q('Storgatan 2, Tomma'), { ...opts, sources: local, fetchFn: f, timeoutMs: 20, searchDeadlineMs: 40 })
      const body = await res.json()
      expect(hostsOf(f)).toEqual(expect.arrayContaining(['tom.test', 'uppsala.test', 'trog.test']))
      expect(body.failed).toEqual([])
      expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60')
    })

    it('frågar inte övriga källor när ortens källa inte svarade', async () => {
      const f = placeFetch(undefined, { ...sverige, orter: { trog: ['0381'] } })
      const body = await (await search(q('Storgatan 2, Trog'), { ...opts, sources: local, fetchFn: f, timeoutMs: 20 })).json()
      expect(body.failed).toEqual(['trog'])
      expect(hostsOf(f)).not.toContain('uppsala.test')
    })

    it('väntar inte på en långsam källa när frågan inte nämner någon plats', async () => {
      const f = placeFetch()
      const started = Date.now()
      const res = await search(q('Storgatan 2'), { ...opts, sources: local, fetchFn: f, timeoutMs: 5000, searchDeadlineMs: 30 })
      const body = await res.json()
      expect(Date.now() - started).toBeLessThan(1000)
      expect(body.addresses.length).toBeGreaterThan(0)
      expect(body.failed).toEqual(['trog'])
      expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60')
    })

    it('sätter exakt adress först oavsett källornas ordning', async () => {
      const f = placeFetch((url) =>
        url.host === 'uppsala.test' ? json({ Succeeded: true, Buildings: ['STORGATAN 20, UPPSALA (1)', 'STORGATAN 2, UPPSALA (2)'] }) : undefined)
      const body = await (await search(q('Storgatan 2, Uppsala'), { ...opts, sources: local, fetchFn: f })).json()
      expect(body.addresses.map((a: { street: string }) => a.street)).toEqual(['Storgatan 2', 'Storgatan 20'])
    })
  })

  it('begränsar till tio träffar per källa', async () => {
    const many = Array.from({ length: 15 }, (_, i) => [`s-${i}`, `Storgatan ${i + 1}`, 'Örebro', ['del']])
    const bigFetch = (async (input: string | URL | Request, init?: RequestInit) =>
      String(input).endsWith('/data/statisk/addresses.json')
        ? json({ sourceId: 'statisk', updatedAt: '2026-01-01', addresses: many })
        : fetchFn(input, init)) as typeof fetch
    const body = await (await search(q('Storgatan', '&kalla=statisk'), { ...opts, fetchFn: bigFetch })).json()
    expect(body.addresses).toHaveLength(10)
  })
})

describe('områden som träffar', () => {
  const search = (query: string) => v1(handleV1Search)(get(`/api/v1/sok?${query}`), opts)
  const hit = {
    id: 'trakt-7',
    street: 'Avesta tätort',
    locality: '',
    kommun: 'Avesta kommun',
    source: 'avesta',
    detail: 'Tisdag, jämn vecka · Trakt 7',
    selection: 'area',
    notice: 'Kontrollera området. Du har valt det själv.',
    areasUrl: 'https://preview.test/avesta/omraden',
    url: 'https://preview.test/api/v1/adress/avesta/trakt-7',
  }

  it('/sok ger området med namnet i street, tom ort och hämtdagen i detail', async () => {
    const body = await (await search('q=avesta%20t%C3%A4tort')).json()
    expect(body.addresses).toEqual([hit])
    expect(body.failed).toEqual([])
  })

  it('läcker inte searchTerms', async () => {
    const body = await (await search('q=trakt%207&kalla=avesta')).json()
    expect(body.addresses).toEqual([hit])
    expect(JSON.stringify(body)).not.toContain('searchTerms')
  })

  it('kräver hela ord utan kalla och tillåter början av ord med kalla', async () => {
    expect((await (await search('q=stallg')).json()).addresses).toEqual([])
    expect((await (await search('q=stallg&kalla=avesta')).json()).addresses).toEqual([hit])
  })

  it('småord i områdens termer ger inga träffar, men övriga ord gör det', async () => {
    for (const q of ['m%20fl', 'och']) {
      expect((await (await search(`q=${q}`)).json()).addresses).toEqual([])
      expect((await (await search(`q=${q}&kalla=avesta`)).json()).addresses).toEqual([])
    }
    const ids = async (q: string) => (await (await search(`q=${q}`)).json()).addresses.map((a: { id: string }) => a.id)
    expect(await ids('Norr')).toEqual(['trakt-3'])
    expect(await ids('Fors')).toEqual(['trakt-3'])
    expect(await ids('Norr%20och%20S%C3%B6r%20N%C3%A4vde')).toEqual(['trakt-3'])
    expect(await ids('Avesta%20t%C3%A4tort')).toEqual(['trakt-7'])
  })

  it('hittar gatan när frågan nämner Avesta, med och utan kalla', async () => {
    for (const q of ['Stallgatan%205%2C%20Avesta', 'Stallgatan%2C%20Avesta', 'Stallgatan%20Avesta']) {
      expect((await (await search(`q=${q}`)).json()).addresses).toEqual([hit])
      expect((await (await search(`q=${q}&kalla=avesta`)).json()).addresses).toEqual([hit])
    }
  })

  it('hittar inte gatan när frågan nämner en annan plats', async () => {
    const body = await (await search('q=Stallgatan%205%2C%20Stockholm')).json()
    expect(body.addresses).toEqual([])
  })

  it('en gatuadress ger inga träffar och inget fel', async () => {
    const body = await (await search('q=kungsgatan%2012&kalla=avesta')).json()
    expect(body.addresses).toEqual([])
    expect(body.failed).toEqual([])
  })

  it('/adress ger detail och schemat', async () => {
    const body = await (await address('source=avesta&id=trakt-7')).json()
    expect(body.address).toEqual({
      id: 'trakt-7', street: 'Avesta tätort', locality: '', kommun: 'Avesta kommun', source: 'avesta', detail: 'Tisdag, jämn vecka · Trakt 7',
      selection: 'area', notice: 'Kontrollera området. Du har valt det själv.',
    })
    expect(body.events.map((e: { date: string }) => e.date)).toEqual(['2026-11-03'])
    expect(JSON.stringify(body)).not.toContain('searchTerms')
  })
})
