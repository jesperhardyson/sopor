import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { edpAddressId } from './edp'
import { mapWasteType } from './fractions-map'
import { SourceError } from './http'
import { BORLANGE_URL, borlangeDate, borlangeFind, borlangePickups, borlangeSchedule, borlangeSearch } from './borlange'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const unknown = new SourceError('www.borlange-energi.se svarade med ett okänt format')
const json = (body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
const karl = (contentType: string, disposalDay = 'Tömning torsdag 5 november') => ({ PickupCity: 'Borlänge', PickupAddress: 'Borganäsvägen 31', disposalDay, containerId: '1', contentType, hasMultipleCustomers: false })

/** Sökningen matchar var som helst i texten utan hänsyn till versaler, schemat bara på exakt text, som borlange-energi.se. */
function fakeBorlange({ adresser = JSON.parse(fixture('borlange-adresser.json')) as unknown, karl: svar = fixture('borlange-karl.json') as unknown } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    const q = url.searchParams.get('pickupAddress') ?? ''
    if (url.pathname.endsWith('/getAdresses')) return json(Array.isArray(adresser) ? adresser.filter((a) => String(a?.pickupAddress).toLowerCase().includes(q.toLowerCase())) : adresser)
    return json(svar)
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const fakeAny = (adresser: unknown, svar?: unknown) =>
  vi.fn(async (input: string | URL | Request) => json(String(input).includes('/getAdresses') ? adresser : (svar ?? []))) as unknown as typeof fetch & ReturnType<typeof vi.fn>

describe('borlangeDate', () => {
  it.each([
    ['Tömning torsdag 5 november', '2026-11-04', '2026-11-05'],
    ['Tömning idag', '2026-11-04', '2026-11-04'],
    // Över årsskiftet framåt: i januari nästa år, inte i januari i år.
    ['Tömning måndag 4 januari', '2026-12-30', '2027-01-04'],
    // Över årsskiftet bakåt: ett kvarglömt datum hamnar i förra året, inte i slutet av det nya.
    ['Tömning måndag 28 december', '2027-01-02', '2026-12-28'],
    ['Tömning torsdag 31 december', '2026-11-04', '2026-12-31'],
    // Skottdagen finns bara i skottår.
    ['Tömning tisdag 29 februari', '2027-12-20', '2028-02-29'],
  ])('%s från %s', (text, today, expected) => {
    expect(borlangeDate(text, today)).toBe(expected)
  })

  it('läser inte ett datum som passar veckodagen men ligger för långt bort', () => {
    expect(borlangeDate('Tömning torsdag 5 november', '2027-06-01')).toBeNull()
  })

  it.each(['Tömning fredag 5 november', 'Tömning imorgon', 'Tömning torsdag 5 nov', 'Tömning måndag 30 februari', ''])('läser inte "%s"', (text) => {
    expect(borlangeDate(text, '2026-11-04')).toBeNull()
  })
})

describe('borlangeSearch', () => {
  it('söker utan orten och det som följer numret', async () => {
    const fetchFn = fakeBorlange()
    await borlangeSearch('Borganäsvägen 39C, Borlänge', fetchFn)
    expect(String(fetchFn.mock.calls[0][0])).toBe(`${BORLANGE_URL}/getAdresses?pickupAddress=Borgan%C3%A4sv%C3%A4gen+39`)
  })

  it('skiljer numret från det som följer, men behåller originaltexten', async () => {
    const found = await borlangeSearch('borganäsvägen 39', fakeBorlange())
    expect(found).toEqual([{ raw: 'Borganäsvägen 39Cantina del Re', street: 'Borganäsvägen 39 Cantina del Re', locality: '', buildingId: '4631245' }])
  })

  it('tål adresser utan nummer, med intervall, parenteser och dubbla mellanslag', async () => {
    const streets = async (q: string) => (await borlangeSearch(q, fakeBorlange())).map((b) => b.street)
    expect(await streets('kvarnsveden')).toEqual(['Kvarnsveden'])
    expect(await streets('borganäsvägen 42')).toEqual(['Borganäsvägen 42-44'])
    expect(await streets('tunagatan 13')).toEqual(['Tunagatan 13A+B'])
    expect(await streets('röda vägen')).toEqual(['Röda Vägen Trafikv Hus 22 1'])
  })

  it('låser adress-id:t (regel 3)', async () => {
    const found = await borlangeSearch('borganäsvägen 31', fakeBorlange())
    expect(edpAddressId(found[0])).toBe('borganäsvägen-31-4561222')
  })

  it.each([
    ['ingen lista', { x: 1 }],
    ['id saknas', [{ pickupAddress: 'Borganäsvägen 31' }]],
    ['id är inget tal', [{ pickupAddress: 'Borganäsvägen 31', id: 'a b' }]],
    ['tom adress', [{ pickupAddress: ' ', id: '1' }]],
  ])('kastar vid okänd form: %s', async (_, adresser) => {
    await expect(borlangeSearch('x', fakeAny(adresser))).rejects.toEqual(unknown)
  })

  it('kastar när Sitevision-adressen inte längre finns', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
    await expect(borlangeSearch('x', fetchFn)).rejects.toBeInstanceOf(SourceError)
  })
})

describe('borlangeFind', () => {
  it.each([
    ['borganäsvägen-31-4561222', 'Borganäsvägen 31'],
    ['borganäsvägen-39-cantina-del-re-4631245', 'Borganäsvägen 39Cantina del Re'],
    ['borganäsvägen-42~44-4654956', 'Borganäsvägen 42-44'],
    ['tunagatan-13ab-4600001', 'Tunagatan 13A+B'],
    ['kvarnsveden-4600002', 'Kvarnsveden'],
    ['flokanvägen-sången-71-4600003', 'Flokanvägen (Sången) 71'],
    ['röda-vägen-trafikv-hus-22-1-4600004', 'Röda Vägen  Trafikv Hus 22 1'],
  ])('hittar %s, med originaltexten', async (id, text) => {
    const found = await borlangeFind(id, fakeBorlange())
    expect(found?.raw).toBe(text)
    expect(edpAddressId(found!)).toBe(id)
  })

  it('går på id:t när flera träffar har samma text', async () => {
    const adresser = [{ pickupAddress: 'Borganäsvägen 31', id: '2' }, { pickupAddress: 'Borganäsvägen 31', id: '1' }]
    expect((await borlangeFind('borganäsvägen-31-1', fakeAny(adresser)))?.buildingId).toBe('1')
  })

  it('tål ett nytt id när det är den enda träffen med texten, och behåller id:t', async () => {
    const found = await borlangeFind('borganäsvägen-31-4561222', fakeAny([{ pickupAddress: 'Borganäsvägen 31', id: '9' }]))
    expect(found?.raw).toBe('Borganäsvägen 31')
    expect(edpAddressId(found!)).toBe('borganäsvägen-31-4561222')
  })

  it('gissar inte när flera träffar har nya id, och ger null för ett oläsbart id eller ingen träff', async () => {
    const adresser = [{ pickupAddress: 'Borganäsvägen 31', id: '8' }, { pickupAddress: 'Borganäsvägen 31', id: '9' }]
    expect(await borlangeFind('borganäsvägen-31-1', fakeAny(adresser))).toBeNull()
    expect(await borlangeFind('x', fakeBorlange())).toBeNull()
    expect(await borlangeFind('finnsinte-1-1', fakeBorlange())).toBeNull()
  })
})

describe('borlangeSchedule', () => {
  it('frågar med originaltexten och ger nästa tömning per kärl, sammanslagen per dag', async () => {
    const fetchFn = fakeBorlange()
    const schedule = borlangeSchedule(await borlangePickups('Röda Vägen  Trafikv Hus 22 1', '2026-11-04', fetchFn), '2026-11-04')
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('pickupAddress')).toBe('Röda Vägen  Trafikv Hus 22 1')
    expect(schedule.events).toEqual([
      { date: '2026-11-05', fractions: ['plast'], estimated: false },
      { date: '2026-11-06', fractions: ['rest', 'mat'], estimated: false },
      { date: '2026-11-09', fractions: ['papper', 'metall'], estimated: false },
      { date: '2026-11-27', fractions: ['glas'], estimated: false },
    ])
  })

  it('ger tömningar över årsskiftet och tar bort passerade datum', async () => {
    const svar = [karl('Restavfall', 'Tömning måndag 4 januari'), karl('Matavfall', 'Tömning måndag 28 december'), karl('Plastförpackningar', 'Tömning idag')]
    const schedule = borlangeSchedule(await borlangePickups('Borganäsvägen 31', '2027-01-02', fakeBorlange({ karl: svar })), '2027-01-02')
    expect(schedule.events).toEqual([
      { date: '2027-01-02', fractions: ['plast'], estimated: false },
      { date: '2027-01-04', fractions: ['rest'], estimated: false },
    ])
  })

  it('tar bort slam, och en adress utan kärl ger ett tomt schema', async () => {
    const svar = [karl('Slam'), karl('Wellpapp')]
    expect(borlangeSchedule(await borlangePickups('Borganäsvägen 31', '2026-11-04', fakeBorlange({ karl: svar })), '2026-11-04').events).toEqual([{ date: '2026-11-05', fractions: ['papper'], estimated: false }])
    expect(borlangeSchedule(await borlangePickups('Borganäsvägen 31', '2026-11-04', fakeBorlange({ karl: [] })), '2026-11-04').events).toEqual([])
  })

  it.each([
    ['ingen lista', { x: 1 }],
    ['contentType saknas', [{ disposalDay: 'Tömning idag' }]],
    ['disposalDay saknas', [{ contentType: 'Restavfall' }]],
    ['datum vi inte kan läsa', [karl('Restavfall', 'Tömning snart')]],
    ['veckodag som inte stämmer', [karl('Restavfall', 'Tömning fredag 5 november')]],
  ])('kastar vid okänd form: %s', async (_, svar) => {
    await expect(borlangePickups('Borganäsvägen 31', '2026-11-04', fakeBorlange({ karl: svar }))).rejects.toEqual(unknown)
  })
})

describe('fraktionerna', () => {
  it.each([
    ['Restavfall', ['rest']],
    ['Matavfall', ['mat']],
    ['Pappersförpackningar', ['papper']],
    ['Wellpapp', ['papper']],
    ['Plastförpackningar', ['plast']],
    ['Metallförpackningar', ['metall']],
    ['Tidningar', ['tidningar']],
    ['Ofärgat glas', ['glas']],
    ['Färgat glas', ['glas']],
  ])('%s', (text, fractions) => {
    expect(mapWasteType(text)).toEqual({ fractions })
  })

  it('hoppar över slam', () => {
    expect(mapWasteType('Slam')).toBeNull()
  })
})
