import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { plannerAddressId, plannerFind, plannerSchedule, plannerSearch, plannerState, plannerTrips, type PlannerTrip } from './fetchplanner.js'

const FEV = { page: 'https://fev.se/atervinning/sophamtning.html', app: '12.1daee82819540d202c7322ce' }
const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const respond = (body: string) => vi.fn(async () => new Response(body, { headers: { 'Content-Type': 'text/html' } })) as unknown as typeof fetch
const page = (state: unknown) => `<script>AppRegistry.registerInitialState('${FEV.app}',${JSON.stringify(state)});</script>`
const dates = (trips: PlannerTrip[], type: string, today = '2026-11-17') =>
  plannerSchedule(trips.filter((t) => t.types.includes(type)), [], today).events.map((e) => (e.estimated ? `ca ${e.date}` : e.date))

describe('FetchPlanner hos Falu Energi & Vatten', () => {
  it('läser tillståndet utan route', () => {
    expect(plannerState(FEV, fixture('fev-schema.html')).containers).toHaveLength(4)
  })

  it('söker med FEV:s app-id och grupperar träffarna per adress', async () => {
    const fetchFn = respond(fixture('fev-sok.html'))
    const found = await plannerSearch(FEV, 'Ekvägen 1, Falun', fetchFn)
    const url = new URL(String((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]))
    expect(url.origin + url.pathname).toBe(FEV.page)
    expect(url.searchParams.get(`sv.${FEV.app}.route`)).toBe('/')
    expect(found[0]).toEqual({ building: expect.objectContaining({ street: 'Ekvägen 1', locality: 'Falun' }), address: 'Ekvägen 1', city: 'FALUN', frequencies: [] })
    expect(found).toHaveLength(10)
  })

  it('känner igen en sökning som gick direkt till schemat', async () => {
    const found = await plannerSearch(FEV, 'Ekvägen 12', respond(fixture('fev-sok-en.html')))
    expect(found.map((a) => plannerAddressId(a.address, a.city))).toEqual([plannerAddressId('Ekvägen 12', 'FALUN')])
  })

  it('slår upp en adress med en enda sökning, eftersom träffarna aldrig har frekvens', async () => {
    const fetchFn = respond(fixture('fev-sok.html'))
    expect(await plannerFind(FEV, plannerAddressId('Ekvägen 1', 'FALUN'), fetchFn)).toMatchObject({ address: 'Ekvägen 1', city: 'FALUN', frequencies: [] })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('låser adress-id:ts format', () => {
    expect(plannerAddressId('Ekvägen 1', 'FALUN')).toMatch(/^ekvägen-1_falun-[0-9a-z]+$/)
  })

  it('läser kärlen som turer med egna datum i svensk tid', async () => {
    const trips = await plannerTrips(FEV, { address: 'Ekvägen 1', city: 'Falun' }, respond(fixture('fev-schema.html')))
    expect(trips).toEqual([
      { text: '', types: ['Matavfall'], first: '2026-11-27', next: '2026-12-11', ownNext: true },
      { text: '', types: ['Plastförpackningar'], first: '2026-11-27', next: '2027-01-08', ownNext: true },
      { text: '', types: ['Restavfall'], first: '2026-12-11', next: '2027-01-22', ownNext: true },
      { text: '', types: ['Pappersförpackningar'], first: '2026-12-25', next: '2027-02-05', ownNext: true },
    ])
  })

  it('räknar fram var 14:e dag och var 6:e vecka från kärlets två datum', async () => {
    const trips = await plannerTrips(FEV, { address: 'Ekvägen 1', city: 'Falun' }, respond(fixture('fev-schema.html')))
    expect(dates(trips, 'Matavfall').slice(0, 4)).toEqual(['2026-11-27', '2026-12-11', 'ca 2026-12-25', 'ca 2027-01-08'])
    expect(dates(trips, 'Restavfall').slice(0, 3)).toEqual(['2026-12-11', '2027-01-22', 'ca 2027-03-05'])
    expect(dates(trips, 'Restavfall').at(-1)! > '2027-10-01').toBe(true)
  })

  it('räknar fram veckovisa och fyraveckorskärl i flerbostadshus', async () => {
    const trips = await plannerTrips(FEV, { address: 'Trotzgatan 1', city: 'Falun' }, respond(fixture('fev-schema-flerfack.html')))
    expect(dates(trips, 'Restavfall').slice(0, 3)).toEqual(['2026-11-18', '2026-11-25', 'ca 2026-12-02'])
    expect(dates(trips, 'Metall').slice(0, 3)).toEqual(['2026-12-14', '2027-01-11', 'ca 2027-02-08'])
  })

  it('räknar inte fram trädgårdsavfall över vintern', async () => {
    const trips = await plannerTrips(FEV, { address: 'Ekvägen 12', city: 'Falun' }, respond(fixture('fev-sok-en.html')))
    expect(dates(trips, 'Trädgårdsavfall')).toEqual(['2027-04-05', '2027-04-19'])
  })

  it('visar bara källans datum när steget inte är hela veckor', () => {
    const moved: PlannerTrip = { text: '', types: ['Restavfall'], first: '2026-12-11', next: '2027-01-21', ownNext: true }
    expect(dates([moved], 'Restavfall')).toEqual(['2026-12-11', '2027-01-21'])
  })

  it('visar bara källans datum för steg över sex veckor och för ett ensamt datum', () => {
    const long: PlannerTrip = { text: '', types: ['Restavfall'], first: '2026-12-11', next: '2027-02-05', ownNext: true }
    const single: PlannerTrip = { text: '', types: ['Restavfall'], first: '2026-12-11', ownNext: true }
    expect(dates([long], 'Restavfall')).toEqual(['2026-12-11', '2027-02-05'])
    expect(dates([single], 'Restavfall')).toEqual(['2026-12-11'])
  })

  it('räknar fram sexveckorskärl också över jul, eftersom FEV tömmer på röda dagar', async () => {
    const trips = await plannerTrips(FEV, { address: 'Ekvägen 1', city: 'Falun' }, respond(fixture('fev-schema.html')))
    expect(dates(trips, 'Plastförpackningar').slice(0, 3)).toEqual(['2026-11-27', '2027-01-08', 'ca 2027-02-19'])
  })

  it('använder nästa datum ensamt när kärlet bara har det', async () => {
    const body = page({ trips: [], containers: [{ typeText: 'Matavfall', nextPickupDateIso: '2026-12-10T23:00:00.000Z' }] })
    expect(await plannerTrips(FEV, { address: 'Ekvägen 1', city: 'Falun' }, respond(body))).toEqual([{ text: '', types: ['Matavfall'], first: '2026-12-11', ownNext: true }])
  })

  it('söker inte om på gatan när träffarna aldrig har frekvens', async () => {
    const fetchFn = respond(fixture('fev-sok-en.html'))
    expect(await plannerFind({ ...FEV, hitsWithoutFrequency: true }, plannerAddressId('Ekvägen 12', 'FALUN'), fetchFn)).toMatchObject({ address: 'Ekvägen 12' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('hoppar över kärl vars datum är tomma texter, som FEV skriver dem (Ryckepungsvägen 1)', async () => {
    const body = page({
      address: 'Ryckepungsvägen 1',
      city: 'Falun',
      trips: [],
      containers: [
        { typeText: 'Pappersförpackningar', pickupDateIso: '', nextPickupDateIso: '', hasCalendars: false },
        { typeText: 'Matavfall', pickupDateIso: '2026-11-23T23:00:00.000Z', nextPickupDateIso: '2026-12-07T23:00:00.000Z', hasCalendars: true },
      ],
    })
    expect(await plannerTrips(FEV, { address: 'Ryckepungsvägen 1', city: 'Falun' }, respond(body))).toEqual([{ text: '', types: ['Matavfall'], first: '2026-11-24', next: '2026-12-08', ownNext: true }])
  })

  it('hoppar över kärl utan datum', async () => {
    const body = page({ address: 'Ekvägen 1', city: 'Falun', trips: [], containers: [{ typeText: 'Restavfall' }, { typeText: 'Matavfall', pickupDateIso: '2026-11-26T23:00:00.000Z' }] })
    expect(await plannerTrips(FEV, { address: 'Ekvägen 1', city: 'Falun' }, respond(body))).toEqual([{ text: '', types: ['Matavfall'], first: '2026-11-27', ownNext: true }])
  })

  it('ger ett tomt schema när adressen saknar kärl', async () => {
    expect(await plannerTrips(FEV, { address: 'Ekvägen 1', city: 'Falun' }, respond(page({ trips: [], containers: [] })))).toEqual([])
  })
})
