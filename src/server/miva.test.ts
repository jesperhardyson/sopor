import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { idHash } from './edp.js'
import { fetchHtml, SourceError } from './http.js'
import { MIVA_APP, mivaAddressId, mivaFind, mivaSchedule, mivaSearch, mivaState, mivaTrips, type MivaTrip } from './miva.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const html = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
const respond = (...bodies: string[]) => {
  const fn = vi.fn()
  for (const body of bodies) fn.mockResolvedValueOnce(html(body))
  return fn as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const called = (fetchFn: ReturnType<typeof vi.fn>, i = 0) => new URL(String(fetchFn.mock.calls[i][0]))
const page = (state: unknown) => `<script>AppRegistry.registerInitialState('${MIVA_APP}',${JSON.stringify(state)});</script>`

describe('mivaState', () => {
  it('läser appens tillstånd ur sidan', () => {
    const state = mivaState(fixture('miva-sok.html'))
    expect(state.route).toBe('/')
    expect(state.hits).toHaveLength(6)
  })

  it('kastar SourceError när tillståndet saknas', () => {
    expect(() => mivaState('<html></html>')).toThrow(SourceError)
  })

  it('kastar SourceError när tillståndet varken har träffar eller turer', () => {
    expect(() => mivaState(page({ route: '/' }))).toThrow(SourceError)
  })
})

describe('mivaAddressId', () => {
  it('låser formatet: adress och ort, och en hash av adressen och orten med versaler', () => {
    expect(mivaAddressId('Nygatan 2', 'ÖRNSKÖLDSVIK')).toBe(`nygatan-2_örnsköldsvik-${idHash('Nygatan 2, ÖRNSKÖLDSVIK')}`)
  })

  it('ger samma id oavsett versaler i orten', () => {
    expect(mivaAddressId('Nygatan 2', 'Örnsköldsvik')).toBe(mivaAddressId('Nygatan 2', 'ÖRNSKÖLDSVIK'))
  })
})

describe('mivaSearch', () => {
  it('frågar utan orten och ger en adress per adress och ort', async () => {
    const fetchFn = respond(fixture('miva-sok.html'))
    const found = await mivaSearch('Nygatan, Örnsköldsvik', fetchFn)
    expect(called(fetchFn).searchParams.get('q')).toBe('Nygatan')
    expect(called(fetchFn).searchParams.get(`sv.${MIVA_APP}.route`)).toBe('/')
    expect(found.map((a) => [a.address, a.city])).toEqual([
      ['Nygatan 1', 'BREDBYN'],
      ['Nygatan 2', 'ÖRNSKÖLDSVIK'],
      ['Nygatan 3', 'BREDBYN'],
      ['Nygatan 3', 'ÖRNSKÖLDSVIK'],
      ['Nygatan 10', 'BREDBYN'],
    ])
    expect(found[1].building).toMatchObject({ street: 'Nygatan 2', locality: 'Örnsköldsvik' })
    expect(found[3].frequencies).toEqual(['1 gång per vecka'])
  })

  it('tar inte med adresser vars schema inte går att hämta', async () => {
    const found = await mivaSearch('Nygatan', respond(fixture('miva-sok.html')))
    expect(found.some((a) => a.address.includes('/'))).toBe(false)
  })

  it('lämnar inga andra fält från källan efter sig', async () => {
    const found = await mivaSearch('Nygatan', respond(fixture('miva-sok.html')))
    for (const a of found) expect(Object.keys(a).sort()).toEqual(['address', 'building', 'city', 'frequencies'])
    expect(JSON.stringify(found)).not.toMatch(/CustomerId|PickupName|PickupEmail/)
  })

  it('ger adressen när sökningen går direkt till schemat', async () => {
    const found = await mivaSearch('Nygatan 10', respond(fixture('miva-sok-en.html')))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ address: 'Nygatan 10', city: 'Bredbyn', frequencies: [] })
  })

  it('kastar SourceError för en träff utan adress', async () => {
    await expect(mivaSearch('Nygatan', respond(page({ route: '/', hits: [{ PickupCity: 'BREDBYN' }] })))).rejects.toThrow(SourceError)
  })
})

describe('fetchHtml', () => {
  it('kastar SourceError när svaret inte är HTML', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
    await expect(fetchHtml('https://miva.se/x', { fetchFn })).rejects.toThrow(SourceError)
  })
})

const NYGATAN_2 = mivaAddressId('Nygatan 2', 'ÖRNSKÖLDSVIK')
const NYGATAN_10 = mivaAddressId('Nygatan 10', 'BREDBYN')

describe('mivaFind', () => {
  it('hittar adressen från dess id', async () => {
    const found = await mivaFind(NYGATAN_2, respond(fixture('miva-sok.html')))
    expect(found).toMatchObject({ address: 'Nygatan 2', city: 'ÖRNSKÖLDSVIK', frequencies: ['Var 14:e dag'] })
  })

  it('ger null för ett id med fel hash', async () => {
    expect(await mivaFind('nygatan-2_örnsköldsvik-fel', respond(fixture('miva-sok.html')))).toBeNull()
  })

  it('söker gatan utan nummer när sökningen gick direkt till schemat', async () => {
    const fetchFn = respond(fixture('miva-sok-en.html'), fixture('miva-sok.html'))
    const found = await mivaFind(NYGATAN_10, fetchFn)
    expect(called(fetchFn, 1).searchParams.get('q')).toBe('nygatan')
    expect(found).toMatchObject({ address: 'Nygatan 10', frequencies: ['Var 14:e dag'] })
  })
})

describe('mivaTrips', () => {
  it('läser turerna med datum i svensk tid', async () => {
    const fetchFn = respond(fixture('miva-schema.html'))
    const trips = await mivaTrips({ address: 'Nygatan 2', city: 'ÖRNSKÖLDSVIK' }, fetchFn)
    expect(called(fetchFn).searchParams.get(`sv.${MIVA_APP}.route`)).toBe('/details/Nygatan 2')
    expect(called(fetchFn).searchParams.get('city')).toBe('ÖRNSKÖLDSVIK')
    expect(trips[0]).toEqual({ text: 'måndag jämna veckor', types: ['Restavfall', 'Matavfall'], first: '2026-11-23', next: '2026-12-07' })
    expect(trips[1].first).toBe('2026-11-16')
  })

  it('ger en tom lista för en adress utan tömningar', async () => {
    expect(await mivaTrips({ address: 'Nygatan 2', city: 'Bredbyn' }, respond(fixture('miva-schema-tomt.html')))).toEqual([])
  })

  it('kastar SourceError för en tur utan datum', async () => {
    const body = page({ route: '/schedule', trips: [{ text: 'måndag udda veckor', containers: [] }] })
    await expect(mivaTrips({ address: 'Nygatan 2', city: 'ÖRNSKÖLDSVIK' }, respond(body))).rejects.toThrow(SourceError)
  })
})

describe('mivaSchedule', () => {
  const TODAY = '2026-11-16'
  const trip = (first: string, next?: string, types = ['Restavfall', 'Matavfall'], text = 'måndag udda veckor'): MivaTrip => ({ text, types, first, next })
  const dates = (trips: MivaTrip[], frequencies: string[]) => mivaSchedule(trips, frequencies, TODAY).events.map((e) => e.date)

  it('räknar var 14:e dag från källans datum, med tömningen i dag först', () => {
    const { events } = mivaSchedule([trip('2026-11-16', '2026-11-30')], ['Var 14:e dag'], TODAY)
    expect(events[0]).toMatchObject({ date: '2026-11-16', estimated: false, fractions: ['rest', 'mat'] })
    expect(events[1]).toMatchObject({ date: '2026-11-30', estimated: false })
    expect(events[2]).toMatchObject({ date: '2026-12-14', estimated: true })
  })

  it('räknar en gång i veckan', () => {
    expect(dates([trip('2026-11-19', '2026-11-26', undefined, 'torsdag udda veckor')], ['1 gång per vecka']).slice(0, 3)).toEqual(['2026-11-19', '2026-11-26', '2026-12-03'])
  })

  it('räknar två gånger i veckan på de två datumens veckodagar', () => {
    expect(dates([trip('2026-11-16', '2026-11-19')], ['2 gånger per vecka']).slice(0, 4)).toEqual(['2026-11-16', '2026-11-19', '2026-11-23', '2026-11-26'])
  })

  it('räknar sommarturer bara i veckorna 22–39, med pariteten från källans datum', () => {
    const summer = dates([trip('2027-06-01', '2027-06-15', undefined, 'tisdag udda veckor')], ['Var 14:e dag (v 22-39)'])
    expect(summer.length).toBeGreaterThan(2)
    expect(summer.filter((d) => d > '2027-09-30' && d < '2028-05-29')).toEqual([])
  })

  it('visar bara källans datum för en okänd frekvens', () => {
    const { events } = mivaSchedule([trip('2026-11-16', '2026-11-30')], ['Var 4:e vecka'], TODAY)
    expect(events.map((e) => [e.date, e.estimated])).toEqual([['2026-11-16', false], ['2026-11-30', false]])
  })

  it('visar bara källans datum utan frekvens', () => {
    expect(dates([trip('2026-11-16', '2026-11-30')], [])).toEqual(['2026-11-16', '2026-11-30'])
  })

  it('tar inte med next från en annan tur', () => {
    const trips = [trip('2026-11-23', '2026-12-07', ['Restavfall'], 'måndag jämna veckor'), trip('2026-11-16', '2026-11-23', ['Matavfall'])]
    const { events } = mivaSchedule(trips, ['Var 14:e dag'], TODAY)
    expect(events.slice(0, 3).map((e) => [e.date, e.fractions])).toEqual([['2026-11-16', ['mat']], ['2026-11-23', ['rest']], ['2026-11-30', ['mat']]])
  })

  it('tolkar Hushållsavfall som restavfall', () => {
    expect(mivaSchedule([trip('2026-11-16', undefined, ['Hushållsavfall'])], [], TODAY).events[0].fractions).toEqual(['rest'])
  })
})
