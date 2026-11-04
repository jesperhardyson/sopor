import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { edpAddressId } from './edp'
import { SourceError } from './http'
import { APPBOLAGET_URL, appbolagetDetails, appbolagetFind, appbolagetSchedule, appbolagetSearch } from './appbolaget'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const unknown = new SourceError('api-universal.appbolaget.se svarade med ett okänt format')
const json = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const KRISTIANSTAD = 'dd905ce7-b16d-4422-be36-564169af4035'
const HASSLEHOLM = 'e34d7050-1b2a-4917-a921-0ea7742d0a6e'
const LOKET = 'storgatan-1_vinslöv-4fcea8031a2649a1b66fb41a631ed823'

/** Appbolaget svarar med de sparade svaren för respektive kund. */
function fakeAppbolaget({ sok, adress, fastighet }: { sok?: unknown; adress?: unknown; fastighet?: unknown } = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const unit = new Headers(init?.headers).get('Unit') ?? url.searchParams.get('unit')
    const kund = unit === HASSLEHOLM ? 'hassleholm' : 'kristianstad'
    if (url.pathname.endsWith('/search')) return json(sok ?? fixture(`appbolaget-${kund}-sok.json`))
    if (url.pathname.startsWith('/@universal/waste/properties/')) return json(fastighet ?? fixture(`appbolaget-${kund}-fastighet.json`))
    if (adress === 404) return json({ message: 'Not found', status: 404, data: [] }, 404)
    return json(adress ?? fixture(`appbolaget-${kund}-adress.json`))
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('appbolagetSearch', () => {
  it('söker med kundens Unit, utan orten och bokstaven, och ger gata, ort och uuid', async () => {
    const fetchFn = fakeAppbolaget()
    const found = await appbolagetSearch(HASSLEHOLM, 'Storgatan 1B, Vinslöv', fetchFn)
    const [url, init] = fetchFn.mock.calls[0]
    expect(String(url)).toBe(`${APPBOLAGET_URL}/waste/addresses/search?query=Storgatan+1&limit=100`)
    expect(Object.fromEntries(new Headers(init?.headers))).toMatchObject({ module: 'universal', unit: HASSLEHOLM })
    expect(found[0].building).toMatchObject({ street: 'Storgatan 1', locality: 'Vinslöv', buildingId: '4fcea8031a2649a1b66fb41a631ed823' })
    expect(found[0].designation).toBe('Loket 3')
  })

  it('låser adress-id:t (regel 3)', async () => {
    const [first] = await appbolagetSearch(HASSLEHOLM, 'Storgatan 1', fakeAppbolaget())
    expect(edpAddressId(first.building)).toBe(LOKET)
  })

  it('godtar en adress utan ort', async () => {
    const sok = { status: 200, data: [{ uuid: '1387abfd-bf4c-46be-99ac-e9c97b4c662f', address: 'Tivoligatan 1', city: null, designation: 'Artilleristen 9' }] }
    const [first] = await appbolagetSearch(KRISTIANSTAD, 'Tivoligatan 1', fakeAppbolaget({ sok }))
    expect(first.building).toMatchObject({ street: 'Tivoligatan 1', locality: '' })
  })

  it.each([
    ['data saknas', { status: 200 }],
    ['uuid saknas', { status: 200, data: [{ address: 'Storgatan 1', city: 'VINSLÖV' }] }],
    ['tom gata', { status: 200, data: [{ uuid: '4fcea803-1a26-49a1-b66f-b41a631ed823', address: ' ', city: 'VINSLÖV' }] }],
  ])('kastar vid okänd form: %s', async (_, sok) => {
    await expect(appbolagetSearch(HASSLEHOLM, 'x', fakeAppbolaget({ sok }))).rejects.toEqual(unknown)
  })
})

describe('appbolagetDetails', () => {
  it('ger flera träffar med samma gata och ort fastighetsbeteckningen som särskiljare', async () => {
    const twin = (uuid: string, designation: string) => ({ uuid, address: 'STORGATAN 11', city: 'SÖSDALA', designation })
    const sok = { status: 200, data: [twin('11111111-1111-1111-1111-111111111111', 'SÖSDALA 72:3'), twin('22222222-2222-2222-2222-222222222222', 'SÖSDALA 72:4')] }
    const found = await appbolagetSearch(HASSLEHOLM, 'Storgatan 11', fakeAppbolaget({ sok }))
    expect(appbolagetDetails(found).map(([, d]) => d)).toEqual(['Sösdala 72:3', 'Sösdala 72:4'])
  })
})

describe('appbolagetFind', () => {
  it('hämtar adressen direkt med uuid:t i id:t', async () => {
    const fetchFn = fakeAppbolaget()
    const found = await appbolagetFind(HASSLEHOLM, LOKET, fetchFn)
    expect(String(fetchFn.mock.calls[0][0])).toBe(`${APPBOLAGET_URL}/waste/addresses/4fcea803-1a26-49a1-b66f-b41a631ed823`)
    expect(found?.building).toMatchObject({ street: 'Storgatan 1', locality: 'Vinslöv' })
    expect(found?.propertyIds).toEqual(['0712403013'])
  })

  it('ger null när adressen inte finns, eller id:t inte går att läsa', async () => {
    expect(await appbolagetFind(HASSLEHOLM, LOKET, fakeAppbolaget({ adress: 404 }))).toBeNull()
    expect(await appbolagetFind(HASSLEHOLM, 'storgatan-1_vinslöv-abc', fakeAppbolaget())).toBeNull()
  })

  it('kastar vid okänd form', async () => {
    await expect(appbolagetFind(HASSLEHOLM, LOKET, fakeAppbolaget({ adress: { status: 200, data: { address: 'x' } } }))).rejects.toEqual(unknown)
  })
})

describe('appbolagetSchedule', () => {
  it('ger Hässleholms tömningar i svensk tid, utan avgifterna', async () => {
    const fetchFn = fakeAppbolaget()
    const schedule = await appbolagetSchedule(HASSLEHOLM, ['0712403013'], fetchFn, undefined, '2026-11-04')
    expect(String(fetchFn.mock.calls[0][0])).toBe(`${APPBOLAGET_URL}/@universal/waste/properties/0712403013/?unit=${HASSLEHOLM}`)
    // "2026-11-12 23:00:00" UTC är den 13 november i Sverige, som Hässleholm Miljös egen kalender visar.
    expect(schedule.events.slice(0, 2)).toEqual([
      { date: '2026-11-13', fractions: ['karl'], estimated: false, labels: { karl: 'Fyrfackskärl 1, Fyrfackskärl 2' } },
      { date: '2026-11-27', fractions: ['karl'], estimated: false, labels: { karl: 'Fyrfackskärl 1' } },
    ])
    expect(schedule.events.at(-1)?.date).toBe('2026-12-25')
  })

  it('räknar fram Kristianstads tömningar ur nästa tömning och frekvensen', async () => {
    const schedule = await appbolagetSchedule(KRISTIANSTAD, ['255527'], fakeAppbolaget(), undefined, '2026-11-04')
    const dates = (fraction: string) => schedule.events.filter((e) => e.fractions.includes(fraction as never)).map((e) => e.date)
    expect(dates('mat').slice(0, 3)).toEqual(['2026-11-04', '2026-11-11', '2026-11-18'])
    expect(dates('plast').slice(0, 3)).toEqual(['2026-11-16', '2026-11-30', '2026-12-14'])
    expect(dates('tidningar').slice(0, 2)).toEqual(['2026-11-09', '2026-12-07'])
    expect(dates('glas').slice(0, 2)).toEqual(['2026-11-19', '2027-01-14'])
    expect(schedule.events[0].estimated).toBe(false)
    expect(schedule.events.find((e) => e.date === '2026-11-11')?.estimated).toBe(true)
  })

  it('flyttar en framräknad tömning som turen har flyttat, och ger bara nästa tömning för okänd frekvens', async () => {
    const service = (verbose: string, exceptions: unknown[] = []) => ({
      collection_at: '2026-11-04',
      code: { description: 'Restavfall', description_verbose: verbose },
      collections: [],
      route: { exceptions },
    })
    const fastighet = {
      status: 200,
      data: { services: [service('370 l kärl restavfall 1 gång/vecka', [{ old_date: '2026-11-11', new_date: '2026-11-10', meta: 'aldrig läst' }]), service('660 l kärl restavfall 2 ggr/vecka')] },
    }
    const schedule = await appbolagetSchedule(KRISTIANSTAD, ['1'], fakeAppbolaget({ fastighet }), undefined, '2026-11-04')
    expect(schedule.events.slice(0, 3).map((e) => [e.date, e.warning ?? null])).toEqual([
      ['2026-11-04', null],
      ['2026-11-10', 'Flyttad tömning.'],
      ['2026-11-18', null],
    ])
  })

  it('ger ett tomt schema för en adress utan fastighet', async () => {
    const fetchFn = fakeAppbolaget()
    expect((await appbolagetSchedule(HASSLEHOLM, [], fetchFn, undefined, '2026-11-04')).events).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it.each([
    ['services saknas', { status: 200, data: {} }],
    ['datum i fel format', { status: 200, data: { services: [{ code: { description: 'Restavfall' }, collections: [{ collection_at: '12 nov' }] }] } }],
    ['varken collections eller collection_at', { status: 200, data: { services: [{ code: { description: 'Restavfall' } }] } }],
  ])('kastar vid okänd form: %s', async (_, fastighet) => {
    await expect(appbolagetSchedule(HASSLEHOLM, ['1'], fakeAppbolaget({ fastighet }), undefined, '2026-11-04')).rejects.toEqual(unknown)
  })
})
