import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { edpAddressId } from './edp'
import { SourceError } from './http'
import { SRV_URL, srvDetails, srvFind, srvSchedule, srvSearch, srvWasteType, type SrvContainer } from './srv'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const unknown = new SourceError('srvatervinning.se svarade med ett okänt format')
const json = (body: string) => new Response(body, { headers: { 'Content-Type': 'application/json;charset=UTF-8' } })

/** Förslagen, kundnumret och kunden med flera adresser svarar som srvatervinning.se. */
function fakeSrv({ forslag = fixture('srv-forslag.json'), kund = fixture('srv-kund.json') } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    const query = url.searchParams.get('query')
    if (url.pathname.endsWith('/getSuggestions')) return json(forslag)
    if (url.pathname.endsWith('/searchByCustomerAndAddress')) return json(fixture('srv-kund-adress.json'))
    if (query === '146603') return json(fixture('srv-kund-flera.json'))
    return json(kund)
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

const container = (contentType: string, calendars: Partial<SrvContainer['calendars'][number]>[], containerType = 'Kärl 190 liter grönt') => ({
  contentType,
  containerType,
  calendars: calendars.map((c) => ({ startDate: '2026-11-04', jobTemplate: 'Tömning', isActive: true, ...c })),
})

describe('srvSearch', () => {
  it('ger förslagen med gata, ort och kundnummer', async () => {
    const fetchFn = fakeSrv()
    const found = await srvSearch('Nynäsvägen 3', fetchFn)
    expect(String(fetchFn.mock.calls[0][0])).toBe(`${SRV_URL}/getSuggestions?query=Nyn%C3%A4sv%C3%A4gen+3`)
    expect(found.map((b) => [b.street, b.locality, b.buildingId])).toEqual([
      ['Nynäsvägen 3', 'Haninge', '24075'],
      ['Nynäsvägen 3', 'Haninge', '164315'],
      ['Nynäsvägen 3', 'Grödinge', '357289'],
      ['Nynäsvägen 3', 'Handen', '314299'],
    ])
  })

  it('låser adress-id:t (regel 3)', async () => {
    const [first] = await srvSearch('Nynäsvägen 3', fakeSrv())
    expect(edpAddressId(first)).toBe('nynäsvägen-3_haninge-24075')
  })

  it.each([
    ['results saknas', '{}'],
    ['kundnummer saknas', '{"results":[{"name":"x","address":"Nynäsvägen 3","city":"HANINGE"}]}'],
    ['tom gata', '{"results":[{"name":"x","customerId":"1","address":" ","city":"HANINGE"}]}'],
  ])('kastar vid okänd form: %s', async (_, forslag) => {
    await expect(srvSearch('x', fakeSrv({ forslag }))).rejects.toEqual(unknown)
  })
})

describe('srvDetails', () => {
  it('ger flera kunder på samma adress kundnumret som särskiljare', async () => {
    const details = srvDetails(await srvSearch('Nynäsvägen 3', fakeSrv())).map(([, d]) => d)
    expect(details).toEqual(['Kundnummer 24075', 'Kundnummer 164315', undefined, undefined])
  })
})

describe('srvFind', () => {
  it('slår upp adressen med kundnumret', async () => {
    const fetchFn = fakeSrv()
    const found = await srvFind('ringvägen-10_huddinge-343265', fetchFn)
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('query')).toBe('343265')
    expect(found?.building).toMatchObject({ street: 'Ringvägen 10', locality: 'Huddinge', buildingId: '343265' })
    expect(found?.containers.map((c) => c.contentType)).toEqual(['Kärl 2', 'Kärl 1', 'Papper och Plast'])
  })

  it('tar kärlen ur svaret när adressen är kundens första', async () => {
    const fetchFn = fakeSrv()
    const found = await srvFind('tumba-torg-112_tumba-146603', fetchFn)
    expect(found?.containers[0].contentType).toBe('Matavfall')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('hämtar en annan av kundens adresser med adress, postnummer och ort', async () => {
    const fetchFn = fakeSrv()
    const found = await srvFind('tumba-torg-101_tumba-146603', fetchFn)
    const url = new URL(String(fetchFn.mock.calls[1][0]))
    expect(url.pathname).toBe('/rest-api/core/sewagePickup/searchByCustomerAndAddress')
    expect(Object.fromEntries(url.searchParams)).toEqual({ address: 'Tumba torg 101', zipCode: '14730', city: 'TUMBA', customerId: '146603' })
    expect(found?.containers.every((c) => c.contentType === 'Restavfall')).toBe(true)
  })

  it('hittar adressen med ett nytt kundnummer när det är den enda kunden där', async () => {
    const forslag = JSON.stringify({ results: [{ name: 'Ringvägen 10, 14131 HUDDINGE', customerId: '343265', address: 'Ringvägen 10', city: 'HUDDINGE' }] })
    const fetchFn = fakeSrv({ forslag })
    const found = await srvFind('ringvägen-10_huddinge-111', fetchFn)
    expect(found?.building.buildingId).toBe('111')
    expect(found?.containers).toHaveLength(3)
  })

  it('gissar inte när flera kunder finns på adressen', async () => {
    expect(await srvFind('nynäsvägen-3_haninge-999', fakeSrv())).toBeNull()
  })

  it('ger null för ett id som inte går att läsa', async () => {
    expect(await srvFind('x', fakeSrv())).toBeNull()
  })

  it.each([
    ['results saknas', '{"multipleAddresses":false,"customerAddresses":[]}'],
    ['kärl utan calendars', '{"multipleAddresses":false,"customerAddresses":[],"results":[{"address":"Ringvägen 10","city":"HUDDINGE","containers":[{"contentType":"Restavfall","containerType":"x"}]}]}'],
    [
      'datum i fel format',
      '{"multipleAddresses":false,"customerAddresses":[],"results":[{"address":"Ringvägen 10","city":"HUDDINGE","containers":[{"contentType":"Restavfall","containerType":"x","calendars":[{"startDate":"4 nov","jobTemplate":"Tömning","isActive":true}]}]}]}',
    ],
  ])('kastar vid okänd form: %s', async (_, kund) => {
    await expect(srvFind('ringvägen-10_huddinge-343265', fakeSrv({ kund }))).rejects.toEqual(unknown)
  })
})

describe('srvWasteType', () => {
  it('läser villornas Kärl 1 och Kärl 2 ur kärltypen', () => {
    expect(srvWasteType(container('Kärl 1', [], 'Kärl 370 liter kärl 1 restavfall'))).toEqual({ fractions: ['rest'] })
    expect(srvWasteType(container('Kärl 2', [], 'Kärl 370 liter kärl 2 matavfall'))).toEqual({ fractions: ['mat'] })
    expect(srvWasteType(container('Kärl 2', [], 'Kärl 370 liter två fack'))).toEqual({ fractions: ['karl'], label: 'Kärl 2' })
  })

  it('läser de andra avfallstyperna som källans text', () => {
    expect(srvWasteType(container('Papper och Plast', []))).toEqual({ fractions: ['papper', 'plast'] })
    expect(srvWasteType(container('Trädgårdstunna', []))).toEqual({ fractions: ['karl'], label: 'Trädgårdstunna' })
    expect(srvWasteType(container('Slamtömning', []))).toBeNull()
  })
})

describe('srvSchedule', () => {
  it('ger kärlens tömningar från i dag med riktiga datum', async () => {
    const found = await srvFind('ringvägen-10_huddinge-343265', fakeSrv())
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
