// Kontraktstest: de riktiga svaren från handlerna ska följa OpenAPI-beskrivningen,
// så att dokumentationen och koden inte kan glida isär.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { handleV1Address, handleV1NotFound, handleV1Search, handleV1Sources, v1 } from './v1.js'

const spec = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../public/api/v1/openapi.json'), 'utf8'))
const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const SOURCES: Source[] = [
  {
    id: 'uppsala',
    name: 'Uppsala Vatten',
    url: 'https://uppsala.test',
    kommuner: [{ code: '0000', name: 'Uppsala kommun' }],
    config: { system: 'edp', baseUrl: 'https://uppsala.test/FutureWeb' },
  },
  {
    id: 'trog',
    name: 'Trög AB',
    url: 'https://trog.test',
    kommuner: [{ code: '0001', name: 'Trög kommun' }],
    config: { system: 'edp', baseUrl: 'https://trog.test/FutureWeb' },
  },
  { id: 'statisk', name: 'Statisk AB', url: 'https://statisk.test', kommuner: [{ code: '0002', name: 'Statiska kommun' }], config: { system: 'static' }, testData: true },
]

const files: Record<string, unknown> = {
  '/data/gator/st.json': { storgatan: ['uppsala', 'trog'] },
  '/data/orter.json': {},
  '/data/statisk/addresses.json': {
    sourceId: 'statisk',
    updatedAt: '2026-01-01',
    addresses: [
      ['rik-1', 'Storgatan 1', 'Örebro', ['rik']],
      ['tom-1', 'Storgatan 2', 'Örebro', ['tom']],
    ],
  },
  // Alla valfria fält ifyllda
  '/data/statisk/schedules/rik.json': {
    id: 'rik', validFrom: '2026-01-01', validTo: '2026-12-31', updatedAt: '2026-01-01',
    bins: [{ fraction: 'rest', sizeLiters: 190, pickupsPerYear: 26, frequencyText: 'Varannan vecka' }],
    events: [
      { date: '2026-11-02', fractions: ['karl'], labels: { karl: 'Fyrfack 1' }, estimated: true },
      { date: '2026-12-24', fractions: ['rest'], warning: 'Infaller på julafton', deviation: { originalDate: '2026-12-23', reason: 'Julhelgen' } },
      { date: '2026-12-30', fractions: ['rest'], deviation: { reason: 'Helgdag' } },
    ],
  },
  // Inga valfria fält alls
  '/data/statisk/schedules/tom.json': {
    id: 'tom', validFrom: '2026-01-01', validTo: '2026-12-31', updatedAt: '2026-01-01',
    bins: [{ fraction: 'rest' }],
    events: [{ date: '2026-11-02', fractions: ['mat'] }],
  },
}

const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input))
  if (url.host === 'uppsala.test') {
    return url.pathname.endsWith('SearchAdress') ? json(fixture('uppsala-search.json')) : json(fixture('uppsala-schedule.json'))
  }
  if (url.host === 'preview.test') return files[url.pathname] ? json(files[url.pathname]) : new Response('', { status: 404 })
  return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timeout'))))
}) as unknown as typeof fetch

const opts = { fetchFn, sources: SOURCES, timeoutMs: 50, now: new Date('2026-10-30T10:00:00Z') }
const call = (handler: Parameters<typeof v1>[0], p: string) => v1(handler)(new Request(`https://preview.test${p}`), opts)

let validate: (name: string, body: unknown) => void

beforeAll(() => {
  const ajv = new Ajv2020({ strict: false, allErrors: true })
  ajv.addSchema({ $id: 'openapi', ...spec })
  validate = (name, body) => {
    const check = ajv.getSchema(`openapi#/components/schemas/${name}`)
    if (!check) throw new Error(`Schemat ${name} saknas`)
    expect(check(body), JSON.stringify(check.errors, null, 2)).toBe(true)
  }
})

describe('openapi.json', () => {
  it('är version 1 och beskriver exakt de tre endpointsen', () => {
    expect(spec.openapi).toMatch(/^3\.1/)
    expect(spec.info.version).toBe('1')
    expect(Object.keys(spec.paths).sort()).toEqual(['/api/v1/adress/{source}/{id}', '/api/v1/kallor', '/api/v1/sok'])
  })

  it('har strikta objektscheman där alla fält är obligatoriska', () => {
    const objects = Object.entries<any>(spec.components.schemas).filter(([, s]) => s.type === 'object' && s.properties)
    expect(objects.length).toBeGreaterThan(5)
    for (const [name, s] of objects) {
      expect(s.additionalProperties, name).toBe(false)
      expect([...s.required].sort(), name).toEqual(Object.keys(s.properties).sort())
    }
    expect(Object.keys(spec.components.schemas)).toEqual(
      expect.arrayContaining(['AddressResponse', 'SearchResponse', 'SourcesResponse', 'ErrorResponse', 'Address', 'NextPickup', 'Event', 'Bin', 'Fraction', 'Source']),
    )
  })

  it('anger fraktionsid som sträng utan enum', () => {
    expect(spec.components.schemas.NextPickup.properties.fraction.enum).toBeUndefined()
    expect(spec.components.schemas.Bin.properties.fraction.enum).toBeUndefined()
  })

  it('har exempel och svar för 400, 404 och 502 på varje endpoint', () => {
    for (const [p, item] of Object.entries<any>(spec.paths)) {
      expect(item.get.responses['200'].content['application/json'].example, p).toBeDefined()
      for (const code of ['400', '404', '502']) expect(item.get.responses[code], `${p} ${code}`).toBeDefined()
    }
  })
})

describe('kontrakt: riktiga svar följer schemana', () => {
  it('adress med live-källa', async () => {
    const res = await call(handleV1Address, '/api/v1/adress?source=uppsala&id=storgatan-2_uppsala-4004688')
    expect(res.status).toBe(200)
    validate('AddressResponse', await res.json())
  })

  it('adress med alla valfria fält ifyllda', async () => {
    const res = await call(handleV1Address, '/api/v1/adress?source=statisk&id=rik-1')
    const body = await res.json()
    expect(body.events.map((e: { deviation: unknown }) => e.deviation)).toEqual([
      null,
      { originalDate: '2026-12-23', reason: 'Julhelgen' },
      { originalDate: null, reason: 'Helgdag' },
    ])
    expect(body.events[0]).toMatchObject({ estimated: true, labels: { karl: 'Fyrfack 1' } })
    validate('AddressResponse', body)
  })

  it('adress utan några valfria fält', async () => {
    validate('AddressResponse', await (await call(handleV1Address, '/api/v1/adress?source=statisk&id=tom-1')).json())
  })

  it('sök, med och utan misslyckad källa, och med kalla', async () => {
    const ok = await (await call(handleV1Search, '/api/v1/sok?q=storgatan%202&kalla=uppsala')).json()
    expect(ok.addresses.length).toBeGreaterThan(0)
    validate('SearchResponse', ok)
    const partial = await (await call(handleV1Search, '/api/v1/sok?q=storgatan')).json()
    expect(partial.failed).toEqual(['trog'])
    validate('SearchResponse', partial)
    const statisk = await (await call(handleV1Search, '/api/v1/sok?q=storgatan&kalla=statisk')).json()
    expect(statisk.addresses.length).toBe(2)
    validate('SearchResponse', statisk)
    validate('SearchResponse', await (await call(handleV1Search, '/api/v1/sok?q=zzzzzz&kalla=uppsala')).json())
  })

  it('källor', async () => {
    validate('SourcesResponse', await (await call(handleV1Sources, '/api/v1/kallor')).json())
  })

  it('ett fel av varje kod', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = await call(handleV1Search, '/api/v1/sok?q=a')
    const missing = await call(handleV1Address, '/api/v1/adress?source=finns-inte&id=x')
    const gone = await call(handleV1NotFound, '/api/v1/okand')
    const down = await call(handleV1Address, '/api/v1/adress?source=trog&id=a_b-1')
    expect([bad.status, missing.status, gone.status, down.status]).toEqual([400, 404, 404, 502])
    for (const res of [bad, missing, gone, down]) validate('ErrorResponse', await res.json())
  })
})

describe('exemplen i beskrivningen följer schemana', () => {
  const schemaName = (ref: string) => ref.split('/').pop()!
  it('200- och felsvaren', () => {
    for (const item of Object.values<any>(spec.paths)) {
      for (const res of Object.values<any>(item.get.responses)) {
        const media = res.content?.['application/json']
        if (media?.example) validate(schemaName(media.schema.$ref), media.example)
      }
    }
  })
})
