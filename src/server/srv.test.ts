import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { edpAddressId } from './edp'
import { SourceError } from './http'
import { SRV_URL, srvDetails, srvFind, srvKey, srvSchedule, srvSearch, srvWasteType, type SrvContainer } from './srv'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const unknown = new SourceError('srvatervinning.se svarade med ett okänt format')
const json = (body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json;charset=UTF-8' } })

const suggestion = (customerId: string, address: string, city: string) => ({ name: `${address}, ${city}`, customerId, address, city })
const container = (contentType: string, calendars: Partial<SrvContainer['calendars'][number]>[] = [{}], containerType = 'Kärl 190 liter grönt') => ({
  contentType,
  containerType,
  calendars: calendars.map((c) => ({ startDate: '2026-11-04', jobTemplate: 'Tömning', isActive: true, ...c })),
})
const customer = (address: string, city: string, containers: unknown[]) => ({ multipleAddresses: false, customerAddresses: [], results: [{ address, city, containers }] })

/** Förslagen per gata och kunderna per kundnummer (påhittade), som srvatervinning.se svarar. */
function fakeSrv({ forslag = {}, kunder = {} }: { forslag?: Record<string, unknown>; kunder?: Record<string, unknown> } = {}) {
  const allForslag: Record<string, unknown> = {
    'nynäsvägen 3': fixture('srv-forslag.json'),
    'ringvägen 10': { results: [suggestion('200001', 'Ringvägen 10', 'HUDDINGE')] },
    'tumba torg 112': { results: [suggestion('300001', 'Tumba torg 112', 'Tumba')] },
    'tumba torg 101': { results: [suggestion('300001', 'Tumba torg 101', 'TUMBA')] },
    ...forslag,
  }
  const allKunder: Record<string, unknown> = { '200001': fixture('srv-kund.json'), '300001': fixture('srv-kund-flera.json'), ...kunder }
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    const query = url.searchParams.get('query')?.toLowerCase() ?? ''
    if (url.pathname.endsWith('/getSuggestions')) return json(allForslag[query] ?? { results: [] })
    if (url.pathname.endsWith('/searchByCustomerAndAddress')) return json(fixture('srv-kund-adress.json'))
    return json(allKunder[query] ?? { multipleAddresses: false, customerAddresses: [], results: [] })
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('srvKey', () => {
  it('är FNV-1a i base 36 och får aldrig ändras (regel 3)', () => {
    expect(srvKey('a')).toBe((0xe40c292c).toString(36))
    expect(srvKey('100001')).toBe('s9pbrr')
  })
})

describe('srvSearch', () => {
  it('ger förslagen med gata och ort, och kundnumret bara som hash i id:t', async () => {
    const fetchFn = fakeSrv()
    const found = await srvSearch('Nynäsvägen 3', fetchFn)
    expect(String(fetchFn.mock.calls[0][0])).toBe(`${SRV_URL}/getSuggestions?query=Nyn%C3%A4sv%C3%A4gen+3`)
    expect(found.map((a) => [a.building.street, a.building.locality, a.customerId])).toEqual([
      ['Nynäsvägen 3', 'Haninge', '100001'],
      ['Nynäsvägen 3', 'Haninge', '100002'],
      ['Nynäsvägen 3', 'Grödinge', '100003'],
      ['Nynäsvägen 3', 'Handen', '100004'],
    ])
    expect(JSON.stringify(found.map((a) => a.building))).not.toContain('10000')
  })

  it('låser adress-id:t (regel 3)', async () => {
    const [first] = await srvSearch('Nynäsvägen 3', fakeSrv())
    expect(edpAddressId(first.building)).toBe('nynäsvägen-3_haninge-s9pbrr')
  })

  it.each([
    ['results saknas', '{}'],
    ['kundnummer saknas', '{"results":[{"name":"x","address":"Nynäsvägen 3","city":"HANINGE"}]}'],
    ['tom gata', '{"results":[{"name":"x","customerId":"1","address":" ","city":"HANINGE"}]}'],
  ])('kastar vid okänd form: %s', async (_, body) => {
    await expect(srvSearch('x', fakeSrv({ forslag: { x: body } }))).rejects.toEqual(unknown)
  })
})

describe('srvDetails', () => {
  const haninge = (bins: string[], date = '2026-11-05') => customer('Nynäsvägen 3', 'HANINGE', bins.map((b) => container(b, [{ startDate: date }])))

  it('ger flera kunder på samma adress kärlen som särskiljare, aldrig kundnumret', async () => {
    const fetchFn = fakeSrv({ kunder: { '100001': haninge(['Restavfall', 'Matavfall']), '100002': haninge(['Papper och Plast']) } })
    const details = (await srvDetails(await srvSearch('Nynäsvägen 3', fetchFn), '2026-11-04', fetchFn)).map(([, d]) => d)
    expect(details).toEqual(['Matavfall, Restavfall', 'Papper och Plast', undefined, undefined])
  })

  it('ger ingen särskiljare, i stället för ett fel, när kärlen inte går att hämta', async () => {
    const fetchFn = fakeSrv({ kunder: { '100001': '<html>', '100002': haninge(['Restavfall']) } })
    const details = (await srvDetails(await srvSearch('Nynäsvägen 3', fetchFn), '2026-11-04', fetchFn)).map(([, d]) => d)
    expect(details.slice(0, 2)).toEqual([undefined, 'Restavfall'])
  })

  it('jämför kärlen oavsett ordning', async () => {
    const fetchFn = fakeSrv({ kunder: { '100001': haninge(['Restavfall', 'Matavfall']), '100002': haninge(['Matavfall', 'Restavfall'], '2026-11-09') } })
    const details = (await srvDetails(await srvSearch('Nynäsvägen 3', fetchFn), '2026-11-04', fetchFn)).map(([, d]) => d)
    expect(details.slice(0, 2)).toEqual(['Matavfall, Restavfall, nästa Tor 5 nov', 'Matavfall, Restavfall, nästa Mån 9 nov'])
  })

  it('lägger till nästa tömning när kärlen är desamma, och säger till när en kund saknar tömningar', async () => {
    const fetchFn = fakeSrv({ kunder: { '100001': haninge(['Restavfall'], '2026-11-05'), '100002': haninge(['Restavfall'], '2026-11-09') } })
    const details = (await srvDetails(await srvSearch('Nynäsvägen 3', fetchFn), '2026-11-04', fetchFn)).map(([, d]) => d)
    expect(details.slice(0, 2)).toEqual(['Restavfall, nästa Tor 5 nov', 'Restavfall, nästa Mån 9 nov'])

    const empty = fakeSrv({ kunder: { '100001': haninge([]) } })
    expect((await srvDetails(await srvSearch('Nynäsvägen 3', empty), '2026-11-04', empty))[0][1]).toBe('Inga tömningar just nu')
  })
})

describe('srvFind', () => {
  it('hittar kundnumret i förslagen och slår upp adressen med det', async () => {
    const fetchFn = fakeSrv()
    const found = await srvFind(`ringvägen-10_huddinge-${srvKey('200001')}`, fetchFn)
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('query')).toBe('ringvägen 10')
    expect(new URL(String(fetchFn.mock.calls[1][0])).searchParams.get('query')).toBe('200001')
    expect(found?.building).toMatchObject({ street: 'Ringvägen 10', locality: 'Huddinge', buildingId: srvKey('200001') })
    expect(found?.containers.map((c) => c.contentType)).toEqual(['Kärl 2', 'Kärl 1', 'Papper och Plast'])
  })

  it('tar kärlen ur svaret när adressen är kundens första', async () => {
    const fetchFn = fakeSrv()
    const found = await srvFind(`tumba-torg-112_tumba-${srvKey('300001')}`, fetchFn)
    expect(found?.containers[0].contentType).toBe('Matavfall')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('hämtar en annan av kundens adresser med adress, postnummer och ort', async () => {
    const fetchFn = fakeSrv()
    const found = await srvFind(`tumba-torg-101_tumba-${srvKey('300001')}`, fetchFn)
    const url = new URL(String(fetchFn.mock.calls[2][0]))
    expect(url.pathname).toBe('/rest-api/core/sewagePickup/searchByCustomerAndAddress')
    expect(Object.fromEntries(url.searchParams)).toEqual({ address: 'Tumba torg 101', zipCode: '14730', city: 'TUMBA', customerId: '300001' })
    expect(found?.containers.every((c) => c.contentType === 'Restavfall')).toBe(true)
  })

  it('hittar adressen med ett nytt kundnummer när det är den enda kunden där, och behåller id:t', async () => {
    const found = await srvFind('ringvägen-10_huddinge-gammal', fakeSrv())
    expect(found?.building.buildingId).toBe('gammal')
    expect(found?.containers).toHaveLength(3)
  })

  it('gissar inte när flera kunder finns på adressen', async () => {
    expect(await srvFind('nynäsvägen-3_haninge-gammal', fakeSrv())).toBeNull()
  })

  it('ger null för ett id som inte går att läsa', async () => {
    expect(await srvFind('x', fakeSrv())).toBeNull()
  })

  it.each([
    ['results saknas', '{"multipleAddresses":false,"customerAddresses":[]}'],
    ['kärl utan calendars', JSON.stringify(customer('Ringvägen 10', 'HUDDINGE', [{ contentType: 'Restavfall', containerType: 'x' }]))],
    ['datum i fel format', JSON.stringify(customer('Ringvägen 10', 'HUDDINGE', [container('Restavfall', [{ startDate: '4 nov' }])]))],
  ])('kastar vid okänd form: %s', async (_, body) => {
    await expect(srvFind(`ringvägen-10_huddinge-${srvKey('200001')}`, fakeSrv({ kunder: { '200001': body } }))).rejects.toEqual(unknown)
  })
})

describe('srvWasteType', () => {
  it('läser villornas Kärl 1 och Kärl 2 ur kärltypen', () => {
    expect(srvWasteType(container('Kärl 1', [], 'Kärl 370 liter kärl 1 restavfall'))).toEqual({ fractions: ['rest'] })
    expect(srvWasteType(container('Kärl 2', [], 'Kärl 370 liter kärl 2 matavfall'))).toEqual({ fractions: ['mat'] })
    expect(srvWasteType(container('Kärl 2', [], 'Kärl 370 liter två fack'))).toEqual({ fractions: ['karl'], label: 'Kärl 2' })
  })

  it('läser de andra avfallstyperna som källans text', () => {
    expect(srvWasteType(container('Papper och Plast'))).toEqual({ fractions: ['papper', 'plast'] })
    expect(srvWasteType(container('Trädgårdstunna'))).toEqual({ fractions: ['karl'], label: 'Trädgårdstunna' })
    expect(srvWasteType(container('Slamtömning'))).toBeNull()
  })
})

describe('srvSchedule', () => {
  it('ger kärlens tömningar från i dag med riktiga datum', async () => {
    const found = await srvFind(`ringvägen-10_huddinge-${srvKey('200001')}`, fakeSrv())
    const schedule = srvSchedule(found!.containers, '2026-11-04')
    expect(schedule.events.slice(0, 2)).toEqual([
      { date: '2026-11-04', fractions: ['rest', 'mat'], estimated: false },
      { date: '2026-11-18', fractions: ['rest', 'mat'], estimated: false },
    ])
    expect(schedule.events.find((e) => e.date === '2026-11-25')?.fractions).toEqual(['papper', 'plast'])
  })

  it('tar bara med aktiva tömningar, inte hemtagning eller leverans av kärl', () => {
    const schedule = srvSchedule(
      [
        container('Restavfall', [
          { startDate: '2026-11-03' },
          { startDate: '2026-11-04' },
          { startDate: '2026-11-05', jobTemplate: 'Hemtagning FNI' },
          { startDate: '2026-11-06', jobTemplate: 'Utleverans FNI' },
          { startDate: '2026-11-09', isActive: false },
          { startDate: '2026-11-10', jobTemplate: 'Tömning FNI Enbo' },
        ]),
        container('Restavfall', [{ startDate: '2026-11-04' }]),
      ],
      '2026-11-04',
    )
    expect(schedule.events.map((e) => e.date)).toEqual(['2026-11-04', '2026-11-10'])
  })
})
