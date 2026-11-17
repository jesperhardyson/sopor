import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { idHash } from './edp.js'
import { fetchHtml, SourceError } from './http.js'
import { plannerAddressId, plannerFind, plannerSchedule, plannerSearch, plannerState, plannerTrips, type PlannerTrip } from './fetchplanner.js'

const MIVA = { page: 'https://miva.se/kundservice/sjalvservice/sophamtning/nar-kommer-sopbilen', app: '12.5e486747177feaef88f29850' }
const MIVA_APP = MIVA.app

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const html = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
const respond = (...bodies: string[]) => {
  const fn = vi.fn()
  for (const body of bodies) fn.mockResolvedValueOnce(html(body))
  return fn as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const called = (fetchFn: ReturnType<typeof vi.fn>, i = 0) => new URL(String(fetchFn.mock.calls[i][0]))
const page = (state: unknown) => `<script>AppRegistry.registerInitialState('${MIVA_APP}',${JSON.stringify(state)});</script>`

describe('plannerState', () => {
  it('läser appens tillstånd ur sidan', () => {
    const state = plannerState(MIVA, fixture('miva-sok.html'))
    expect(state.route).toBe('/')
    expect(state.hits).toHaveLength(6)
  })

  it('tål mellanrum före slutet av skriptet', () => {
    const state = { route: '/', hits: [] }
    expect(plannerState(MIVA, `<script>AppRegistry.registerInitialState('${MIVA_APP}',${JSON.stringify(state)});\n</script>`).route).toBe('/')
    expect(plannerState(MIVA, `<script>AppRegistry.registerInitialState('${MIVA_APP}', ${JSON.stringify(state)} )\n</script>`).route).toBe('/')
  })

  it('kastar SourceError när tillståndet saknas', () => {
    expect(() => plannerState(MIVA, '<html></html>')).toThrow(SourceError)
  })

  it('kastar SourceError när tillståndet varken har träffar eller turer', () => {
    expect(() => plannerState(MIVA, page({ route: '/' }))).toThrow(SourceError)
  })
})

describe('plannerAddressId', () => {
  it('låser formatet: adress och ort, och en hash av adressen och orten med versaler', () => {
    expect(plannerAddressId('Nygatan 2', 'ÖRNSKÖLDSVIK')).toBe(`nygatan-2_örnsköldsvik-${idHash('Nygatan 2, ÖRNSKÖLDSVIK')}`)
  })

  it('ger samma id oavsett versaler i orten', () => {
    expect(plannerAddressId('Nygatan 2', 'Örnsköldsvik')).toBe(plannerAddressId('Nygatan 2', 'ÖRNSKÖLDSVIK'))
  })
})

describe('plannerSearch', () => {
  it('frågar utan orten och ger en adress per adress och ort', async () => {
    const fetchFn = respond(fixture('miva-sok.html'))
    const found = await plannerSearch(MIVA, 'Nygatan, Örnsköldsvik', fetchFn)
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
    const found = await plannerSearch(MIVA, 'Nygatan', respond(fixture('miva-sok.html')))
    expect(found.some((a) => a.address.includes('/'))).toBe(false)
  })

  it('lämnar inga andra fält från källan efter sig', async () => {
    const found = await plannerSearch(MIVA, 'Nygatan', respond(fixture('miva-sok.html')))
    for (const a of found) expect(Object.keys(a).sort()).toEqual(['address', 'building', 'city', 'frequencies'])
    expect(JSON.stringify(found)).not.toMatch(/CustomerId|PickupName|PickupEmail/)
  })

  it('ger adressen när sökningen går direkt till schemat', async () => {
    const found = await plannerSearch(MIVA, 'Nygatan 10', respond(fixture('miva-sok-en.html')))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ address: 'Nygatan 10', city: 'Bredbyn', frequencies: [] })
  })

  it('kastar SourceError för en träff utan adress', async () => {
    await expect(plannerSearch(MIVA, 'Nygatan', respond(page({ route: '/', hits: [{ PickupCity: 'BREDBYN' }] })))).rejects.toThrow(SourceError)
  })
})

describe('fetchHtml', () => {
  it('kastar SourceError när svaret inte är HTML', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
    await expect(fetchHtml('https://miva.se/x', { fetchFn })).rejects.toThrow(SourceError)
  })
})

const NYGATAN_2 = plannerAddressId('Nygatan 2', 'ÖRNSKÖLDSVIK')
const NYGATAN_10 = plannerAddressId('Nygatan 10', 'BREDBYN')

describe('plannerFind', () => {
  it('hittar adressen från dess id', async () => {
    const found = await plannerFind(MIVA, NYGATAN_2, respond(fixture('miva-sok.html')))
    expect(found).toMatchObject({ address: 'Nygatan 2', city: 'ÖRNSKÖLDSVIK', frequencies: ['Var 14:e dag'] })
  })

  it('ger null för ett id med fel hash', async () => {
    expect(await plannerFind(MIVA, 'nygatan-2_örnsköldsvik-fel', respond(fixture('miva-sok.html')))).toBeNull()
  })

  it('söker gatan utan nummer när sökningen gick direkt till schemat', async () => {
    const fetchFn = respond(fixture('miva-sok-en.html'), fixture('miva-sok.html'))
    const found = await plannerFind(MIVA, NYGATAN_10, fetchFn)
    expect(called(fetchFn, 1).searchParams.get('q')).toBe('nygatan')
    expect(found).toMatchObject({ address: 'Nygatan 10', frequencies: ['Var 14:e dag'] })
  })
})

describe('plannerFind för gator med ensam adress', () => {
  const direkt = (address: string, city: string) => page({ route: '/schedule', address, city, hits: [], trips: [] })
  const lista = (address: string, city: string) => page({ route: '/', hits: [{ PickupAddress: address, PickupCity: city, ExternalId: 'Var 14:e dag' }] })

  it.each([
    ['Nygatan 2-4', 'nygatan'],
    ['Vägen 12 ab', 'vägen'],
    ['Storgatan 3 B', 'storgatan'],
  ])('söker %s utan nummer för frekvensen', async (address, street) => {
    const fetchFn = respond(direkt(address, 'Bredbyn'), lista(address, 'BREDBYN'))
    const found = await plannerFind(MIVA, plannerAddressId(address, 'BREDBYN'), fetchFn)
    expect(called(fetchFn, 1).searchParams.get('q')).toBe(street)
    expect(found?.frequencies).toEqual(['Var 14:e dag'])
  })
})

describe('plannerTrips', () => {
  it('läser turerna med datum i svensk tid', async () => {
    const fetchFn = respond(fixture('miva-schema.html'))
    const trips = await plannerTrips(MIVA, { address: 'Nygatan 2', city: 'ÖRNSKÖLDSVIK' }, fetchFn)
    expect(called(fetchFn).searchParams.get(`sv.${MIVA_APP}.route`)).toBe('/details/Nygatan 2')
    expect(called(fetchFn).searchParams.get('city')).toBe('ÖRNSKÖLDSVIK')
    expect(trips[0]).toEqual({ text: 'måndag jämna veckor', types: ['Restavfall', 'Matavfall'], first: '2026-11-23', next: '2026-12-07' })
    expect(trips[1].first).toBe('2026-11-16')
  })

  it('skickar orten med versaler, eftersom schemat annars är tomt', async () => {
    const fetchFn = respond(fixture('miva-schema.html'))
    await plannerTrips(MIVA, { address: 'Nygatan 10', city: 'Bredbyn' }, fetchFn)
    expect(called(fetchFn).searchParams.get('city')).toBe('BREDBYN')
  })

  it('ger en tom lista för en adress utan tömningar', async () => {
    expect(await plannerTrips(MIVA, { address: 'Nygatan 2', city: 'Bredbyn' }, respond(fixture('miva-schema-tomt.html')))).toEqual([])
  })

  it('kastar SourceError för en tur utan datum', async () => {
    const body = page({ route: '/schedule', trips: [{ text: 'måndag udda veckor', containers: [] }] })
    await expect(plannerTrips(MIVA, { address: 'Nygatan 2', city: 'ÖRNSKÖLDSVIK' }, respond(body))).rejects.toThrow(SourceError)
  })
})

describe('plannerSchedule', () => {
  const TODAY = '2026-11-16'
  const trip = (first: string, next?: string, types = ['Restavfall', 'Matavfall'], text = 'måndag udda veckor'): PlannerTrip => ({ text, types, first, next })
  const dates = (trips: PlannerTrip[], frequencies: string[]) => plannerSchedule(trips, frequencies, TODAY).events.map((e) => e.date)

  it('räknar var 14:e dag från källans datum, med tömningen i dag först', () => {
    const { events } = plannerSchedule([trip('2026-11-16', '2026-11-30')], ['Var 14:e dag'], TODAY)
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
    const { events } = plannerSchedule([trip('2026-11-16', '2026-11-30')], ['Var 4:e vecka'], TODAY)
    expect(events.map((e) => [e.date, e.estimated])).toEqual([['2026-11-16', false], ['2026-11-30', false]])
  })

  it('visar bara källans datum utan frekvens', () => {
    expect(dates([trip('2026-11-16', '2026-11-30')], [])).toEqual(['2026-11-16', '2026-11-30'])
  })

  it('tar inte med next från en annan tur', () => {
    const trips = [trip('2026-11-23', '2026-12-07', ['Restavfall'], 'måndag jämna veckor'), trip('2026-11-16', '2026-11-23', ['Matavfall'])]
    const { events } = plannerSchedule(trips, ['Var 14:e dag'], TODAY)
    expect(events.slice(0, 3).map((e) => [e.date, e.fractions])).toEqual([['2026-11-16', ['mat']], ['2026-11-23', ['rest']], ['2026-11-30', ['mat']]])
  })

  it('går var 14:e dag över vecka 53 och behåller källans nästa datum', () => {
    const { events } = plannerSchedule([trip('2026-12-24', '2027-01-07', undefined, 'torsdag jämna veckor')], ['Var 14:e dag'], TODAY)
    expect(events.slice(0, 3).map((e) => [e.date, e.estimated])).toEqual([
      ['2026-12-24', false],
      ['2027-01-07', false],
      ['2027-01-21', true],
    ])
  })

  it('visar bara källans datum när ett datum har flyttats för en helgdag', () => {
    const { events } = plannerSchedule([trip('2027-04-01', '2027-04-16', undefined, 'fredag udda veckor')], ['Var 14:e dag'], TODAY)
    expect(events.map((e) => [e.date, e.estimated])).toEqual([
      ['2027-04-01', false],
      ['2027-04-16', false],
    ])
  })

  it('visar bara källans datum när två tömningar i veckan hamnar på samma veckodag', () => {
    expect(dates([trip('2026-11-16', '2026-11-23')], ['2 gånger per vecka'])).toEqual(['2026-11-16', '2026-11-23'])
  })

  it('tolkar Hushållsavfall som restavfall', () => {
    expect(plannerSchedule([trip('2026-11-16', undefined, ['Hushållsavfall'])], [], TODAY).events[0].fractions).toEqual(['rest'])
  })
})
