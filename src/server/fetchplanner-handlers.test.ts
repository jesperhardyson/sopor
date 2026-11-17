import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ALL_SOURCES, type Source } from '../sources/index.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { plannerAddressId } from './fetchplanner.js'
import { handleV1Address, v1 } from './v1.js'

const MIVA = { page: 'https://miva.se/kundservice/sjalvservice/sophamtning/nar-kommer-sopbilen', app: '12.5e486747177feaef88f29850' }
const MIVA_APP = MIVA.app

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const html = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })

const miva: Source = {
  id: 'miva',
  name: 'Miva',
  url: 'https://miva.se',
  kommuner: [{ code: '2284', name: 'Örnsköldsviks kommun' }],
  config: { system: 'fetchplanner', page: 'https://miva.se/kundservice/sjalvservice/sophamtning/nar-kommer-sopbilen', app: '12.5e486747177feaef88f29850' },
}
const ID = plannerAddressId('Nygatan 2', 'ÖRNSKÖLDSVIK')

const route = (input: string | URL | Request) => new URL(String(input)).searchParams.get(`sv.${MIVA_APP}.route`) ?? ''
const fake = ({ sok = fixture('miva-sok.html'), schema = fixture('miva-schema.html') } = {}) =>
  vi.fn(async (input: string | URL | Request) => html(route(input).startsWith('/details/') ? schema : sok)) as unknown as typeof fetch & ReturnType<typeof vi.fn>
const opts = (fetchFn: typeof fetch = fake()) => ({ fetchFn, sources: [miva], timeoutMs: 50, now: new Date('2026-11-16T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const schema = (id: string) => url(`/api/schema?source=miva&id=${encodeURIComponent(id)}`)

describe('Miva i sajtens API', () => {
  it('söker utan orten och ger adressen med kommunen', async () => {
    const fetchFn = fake()
    const res = await (await handleSearch(url('/api/sok?q=Nygatan 2, Örnsköldsvik&sources=miva'), opts(fetchFn))).json()
    expect(res.failed).toEqual([])
    expect(res.addresses).toContainEqual({ id: ID, street: 'Nygatan 2', locality: 'Örnsköldsvik', sourceId: 'miva', kommun: 'Örnsköldsviks kommun' })
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('q')).toBe('Nygatan 2')
  })

  it('hämtar schemat med tömningen i dag först', async () => {
    const res = await handleSchedule(schema(ID), opts())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address).toMatchObject({ id: ID, street: 'Nygatan 2', locality: 'Örnsköldsvik', kommun: 'Örnsköldsviks kommun' })
    expect(body.schedule.events[0]).toEqual({ date: '2026-11-16', fractions: ['rest', 'mat'], estimated: false })
  })

  it('ger ett tomt schema för en adress utan tömningar, inte ett fel', async () => {
    const res = await handleSchedule(schema(ID), opts(fake({ schema: fixture('miva-schema-tomt.html') })))
    expect(res.status).toBe(200)
    expect((await res.json()).schedule.events).toEqual([])
  })

  it('ger 502 för ett id utan träff', async () => {
    expect((await handleSchedule(schema(plannerAddressId('Nygatan 99', 'ÖRNSKÖLDSVIK')), opts())).status).toBe(502)
  })

  it('ger 502 när Miva har ändrat appen', async () => {
    expect((await handleSchedule(schema(ID), opts(fake({ schema: '<html></html>' })))).status).toBe(502)
  })

  it('ger kalenderfilen med stabila UID', async () => {
    const res = await handleIcs(url(`/api/ics?source=miva&file=${encodeURIComponent(ID)}.ics`), opts())
    expect(res.status).toBe(200)
    expect(await res.text()).toContain(`UID:${ID}-2026-11-23@sopor.hardyson.se`)
  })

  it('ger kalenderprenumerationen 502 när adressen inte hittas', async () => {
    const res = await handleIcs(url(`/api/ics?source=miva&file=${encodeURIComponent(plannerAddressId('Nygatan 99', 'ÖRNSKÖLDSVIK'))}.ics`), opts())
    expect(res.status).toBe(502)
  })

  it('ger schemat i API v1', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=miva&id=${encodeURIComponent(ID)}`), opts())
    expect(res.status).toBe(200)
  })
})

describe('Miva i registret', () => {
  const source = ALL_SOURCES.find((s) => s.id === 'miva')

  it('täcker Örnsköldsvik', () => {
    expect(source).toMatchObject({ name: 'Miva', url: 'https://miva.se', kommuner: [{ code: '2284', name: 'Örnsköldsviks kommun' }], config: { system: 'fetchplanner', page: 'https://miva.se/kundservice/sjalvservice/sophamtning/nar-kommer-sopbilen', app: '12.5e486747177feaef88f29850' } })
  })

  it('förklarar ett tomt schema', () => {
    expect(source?.emptyScheduleNote?.text).toContain('flerbostadshus')
  })
})

describe('FEV i sajtens API', () => {
  const fev = ALL_SOURCES.find((s) => s.id === 'fev')!
  const FEV_ID = plannerAddressId('Ekvägen 1', 'FALUN')
  const fevFake = () => vi.fn(async (input: string | URL | Request) => {
    const r = new URL(String(input)).searchParams.get('sv.12.1daee82819540d202c7322ce.route') ?? ''
    return html(r.startsWith('/details/') ? fixture('fev-schema.html') : fixture('fev-sok.html'))
  }) as unknown as typeof fetch
  const fevOpts = () => ({ fetchFn: fevFake(), sources: [fev], timeoutMs: 50, now: new Date('2026-11-17T10:00:00Z') })

  it('täcker Falun med FEV:s sida och app', () => {
    expect(fev).toMatchObject({ name: 'Falu Energi & Vatten', kommuner: [{ code: '2080', name: 'Falu kommun' }], config: { system: 'fetchplanner', page: 'https://fev.se/atervinning/sophamtning.html', app: '12.1daee82819540d202c7322ce' } })
  })

  it('söker och ger adressen med kommunen', async () => {
    const res = await (await handleSearch(url('/api/sok?q=Ekvägen 1, Falun&sources=fev'), fevOpts())).json()
    expect(res.addresses).toContainEqual({ id: FEV_ID, street: 'Ekvägen 1', locality: 'Falun', sourceId: 'fev', kommun: 'Falu kommun' })
  })

  it('hämtar schemat med alla fyra fraktionerna', async () => {
    const body = await (await handleSchedule(url(`/api/schema?source=fev&id=${encodeURIComponent(FEV_ID)}`), fevOpts())).json()
    expect(body.schedule.events[0]).toEqual({ date: '2026-11-27', fractions: ['plast', 'mat'], estimated: false })
    expect(new Set(body.schedule.events.flatMap((e: { fractions: string[] }) => e.fractions))).toEqual(new Set(['mat', 'plast', 'rest', 'papper']))
  })

  it('ger kalenderfilen med stabila UID', async () => {
    const res = await handleIcs(url(`/api/ics?source=fev&file=${encodeURIComponent(FEV_ID)}.ics`), fevOpts())
    expect(await res.text()).toContain(`UID:${FEV_ID}-2026-12-11@sopor.hardyson.se`)
  })
})
