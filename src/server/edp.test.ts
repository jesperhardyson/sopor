import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { edpAddressId, edpRule, edpSchedule, edpSearch, parseBuilding, queryFromAddressId } from './edp'
import { SourceError } from './http'

const dir = path.resolve(import.meta.dirname, '__fixtures__')
const fixture = (name: string) => JSON.parse(readFileSync(path.join(dir, name), 'utf8'))

function fakeFetch(body: unknown, init: { status?: number; contentType?: string } = {}) {
  return vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'Content-Type': init.contentType ?? 'application/json; charset=utf-8' },
    }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

const NOW = new Date('2026-10-30T10:00:00Z')

describe('parseBuilding', () => {
  it('tolkar alla adresser i de sparade svaren', () => {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('-search.json'))) {
      for (const raw of fixture(file).Buildings as string[]) {
        const b = parseBuilding(raw)
        expect(b, raw).not.toBeNull()
        expect(b!.buildingId).toMatch(/^\w+$/)
      }
    }
  })

  it('delar upp gata, ort och byggnads-id', () => {
    expect(parseBuilding('Storgatan 1, Grillby (909273)')).toEqual({
      raw: 'Storgatan 1, Grillby (909273)',
      street: 'Storgatan 1',
      locality: 'Grillby',
      buildingId: '909273',
    })
    expect(parseBuilding('Storgatan, Byske (126649)')?.street).toBe('Storgatan')
    expect(parseBuilding('Storgatan 2 -4, Tormenåsgatan 1, Huskvarna (28970)')).toMatchObject({
      street: 'Storgatan 2 -4, Tormenåsgatan 1',
      locality: 'Huskvarna',
    })
  })

  it('skriver orter i versaler med stor begynnelsebokstav', () => {
    expect(parseBuilding('Storgatan 1, KÅGE (124165)')?.locality).toBe('Kåge')
  })

  it('klarar tom ort, gator i versaler och extra mellanslag', () => {
    expect(parseBuilding('KYRKOGATAN 2,  (590510011)')).toMatchObject({ street: 'Kyrkogatan 2', locality: '', buildingId: '590510011' })
    expect(parseBuilding('SKOLVÄGEN 1, HENÅN (50000493)')).toMatchObject({ street: 'Skolvägen 1', locality: 'Henån' })
    expect(parseBuilding('STORGATAN   efter nr 103, LYCKSELE (865101)')).toMatchObject({ street: 'Storgatan efter nr 103', locality: 'Lycksele' })
  })

  it('skriver bara om de inledande versalorden när resten har gemener', () => {
    expect(parseBuilding('STORGATAN   Fritid vid ÅVS (040209090)')?.street).toBe('Storgatan Fritid vid ÅVS')
    expect(parseBuilding('NORRA STORGATAN 4 efter bron, LYCKSELE (1)')?.street).toBe('Norra Storgatan 4 efter bron')
    expect(parseBuilding('Storgatan 1, Grillby (909273)')?.street).toBe('Storgatan 1')
    expect(edpAddressId(parseBuilding('STORGATAN   efter nr 103, LYCKSELE (865101)')!)).toBe('storgatan-efter-nr-103_lycksele-865101')
  })

  it('klarar adresser helt utan ort och kommatecken', () => {
    expect(parseBuilding('STORGATAN 11 (590406011)')).toMatchObject({ street: 'Storgatan 11', locality: '', buildingId: '590406011' })
    expect(edpAddressId(parseBuilding('STORGATAN 11 (590406011)')!)).toBe('storgatan-11-590406011')
  })

  it('ger null för text utan byggnads-id', () => {
    expect(parseBuilding('Storgatan 1')).toBeNull()
  })
})

describe('edpAddressId', () => {
  it('bygger ett läsbart id som går att översätta tillbaka till en sökning', () => {
    expect(edpAddressId(parseBuilding('Storgatan 1, Grillby (909273)')!)).toBe('storgatan-1_grillby-909273')
    expect(edpAddressId(parseBuilding('Storgatan 1, Slite (0200505709)')!)).toBe('storgatan-1_slite-0200505709')
    expect(edpAddressId(parseBuilding('Älvvägen 3 B, Örebro (1)')!)).toBe('älvvägen-3-b_örebro-1')
    expect(edpAddressId(parseBuilding('KYRKOGATAN 2,  (590510011)')!)).toBe('kyrkogatan-2-590510011')
    expect(edpAddressId(parseBuilding('Storgatan 2 -4, Tormenåsgatan 1, Huskvarna (28970)')!)).toBe(
      'storgatan-2-~4_tormenåsgatan-1_huskvarna-28970',
    )
  })

  it('översätter id:t till söksträng och byggnads-id', () => {
    expect(queryFromAddressId('storgatan-1_grillby-909273')).toEqual({ query: 'storgatan 1, grillby', buildingId: '909273' })
    expect(queryFromAddressId('storgatan-2-~4_tormenåsgatan-1_huskvarna-28970')).toEqual({
      query: 'storgatan 2 -4, tormenåsgatan 1, huskvarna',
      buildingId: '28970',
    })
    expect(queryFromAddressId('utan-byggnadsid')).toEqual({ query: 'utan', buildingId: 'byggnadsid' })
    expect(queryFromAddressId('')).toBeNull()
  })
})

describe('edpSearch', () => {
  it('skickar sökningen som JSON med vår User-Agent', async () => {
    const f = fakeFetch(fixture('uppsala-search.json'))
    const result = await edpSearch('https://futureweb.uppsalavatten.se/Uppsala/FutureWeb', 'Storgatan', f)
    expect(result).toHaveLength(10)
    expect(result[0]).toMatchObject({ street: 'Storgatan 2', locality: 'Uppsala', buildingId: '4004688' })
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://futureweb.uppsalavatten.se/Uppsala/FutureWeb/SimpleWastePickup/SearchAdress')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ searchText: 'Storgatan' })
    expect(new Headers(init.headers).get('User-Agent')).toBe('Sopor/1.0 (+https://sopor.hardyson.se)')
  })

  it('kastar SourceError när källan svarar med HTML', async () => {
    const f = fakeFetch('<html>Logga in</html>', { contentType: 'text/html' })
    await expect(edpSearch('https://x', 'Storgatan', f)).rejects.toBeInstanceOf(SourceError)
  })
})

describe('edpRule', () => {
  // Veckodagen är 0 = söndag, som weekdayIndex.
  it.each([
    ['Onsdag varje vecka', 52, { weekday: 3, every: 1 }],
    ['Varje vecka, måndag', 52, { weekday: 1, every: 1 }],
    ['T. 1 ggr i veckan, helår', 52, { every: 1 }],
    ['Se körlista', 52, { every: 1 }],
    ['Måndag udda vecka. Fyrfack', 26, { weekday: 1, every: 2, parity: 'udda' }],
    ['14-dag onsdag jämn vecka', 26, { weekday: 3, every: 2, parity: 'jämn' }],
    ['Onsdag varannan vecka udda', 26, { weekday: 3, every: 2, parity: 'udda' }],
    ['Tömning varannan vecka måndag udda vecka helår', 26, { weekday: 1, every: 2, parity: 'udda' }],
    ['ÅVS Tömning varannan vecka fredag ojämn vecka', 26, { weekday: 5, every: 2, parity: 'udda' }],
    ['Container tömning jämn vecka torsdag', 26, { weekday: 4, every: 2, parity: 'jämn' }],
    ['Var 14:e dag', 26, { every: 2, fixedDays: true }],
    ['Måndag varannan vecka', 26, { weekday: 1, every: 2 }],
    ['se körlista', 26, { every: 2 }],
    ['Onsdag var 4:e vecka startvecka 1', 13, { weekday: 3, every: 4, startWeek: 1 }],
    ['Måndagar var 4:e vecka start v 3', 13, { weekday: 1, every: 4, startWeek: 3 }],
    ['Onsdag var 4:e vecka med start v. 3', 13, { weekday: 3, every: 4, startWeek: 3 }],
    ['Tömning  var fjärde vecka onsdag helår v4,8,12 osv', 13, { weekday: 3, every: 4, startWeek: 4 }],
    ['Tömning  var fjärde vecka onsdag helår v 1,5, 9 os', 13, { weekday: 3, every: 4, startWeek: 1 }],
    ['Helår, var 4:e vecka, startvecka 1, tisdag', 13, { weekday: 2, every: 4, startWeek: 1 }],
    ['Onsdag udda var 4:e vecka startvecka 3', 13, { weekday: 3, every: 4, parity: 'udda', startWeek: 3 }],
    ['Måndag var fjärde vecka, jämn vecka', 13, { weekday: 1, every: 4, parity: 'jämn' }],
    ['Var 4:e vecka', 13, { every: 4 }],
  ])('%s (%i per år)', (text, perYear, rule) => {
    expect(edpRule(text, perYear)).toEqual(rule)
  })

  // Hellre bara källans datum än gissade tömningar.
  it.each([
    ['Onsdag udda vecka trädgård', 17],
    ['Onsdag udda var 8:e vecka startvecka 7, helår', 6],
    ['Torsdag jämn vecka', 0],
    ['Var 14:e dag, Varje vecka sommar', 39],
    ['Varannan v sommar, var 4:e v vinter', 26],
    ['Måndag jämn vecka', 52],
    ['Måndag och torsdag varannan vecka', 26],
    ['Två gånger i veckan', 104],
  ])('räknar inte fram %s (%i per år)', (text, perYear) => {
    expect(edpRule(text, perYear)).toBeNull()
  })
})

describe('edpSchedule', () => {
  it('följer udda och jämna veckor över vecka 53 och nyår', async () => {
    const body = {
      RhServices: [
        { WasteType: 'Restavfall', WastePickupFrequency: 'Måndag udda vecka', NextWastePickup: '2026-11-16T00:00:00', WastePickupsPerYear: 26 },
        { WasteType: 'Matavfall', WastePickupFrequency: 'Torsdag jämn vecka', NextWastePickup: '2026-11-12T00:00:00', WastePickupsPerYear: 26 },
      ],
    }
    const dates = (await edpSchedule('https://x', 'x (1)', fakeFetch(body), NOW)).events.map((e) => e.date)
    expect(dates).toContain('2026-12-28')
    expect(dates).toContain('2027-01-04')
    expect(dates).not.toContain('2027-01-11')
    expect(dates).toContain('2027-01-14')
    expect(dates).not.toContain('2026-12-31')
    expect(dates).not.toContain('2027-01-07')
  })

  it('ger bara källans datum för en tömning som flyttats från textens veckodag', async () => {
    const body = {
      RhServices: [{ WasteType: 'Restavfall', WastePickupFrequency: 'Torsdag udda vecka', NextWastePickup: '2026-12-23T00:00:00', WastePickupsPerYear: 26 }],
    }
    const s = await edpSchedule('https://x', 'x (1)', fakeFetch(body), NOW)
    expect(s.events.map((e) => e.date)).toEqual(['2026-12-23'])
  })

  it('räknar var 4:e vecka bara till och med vecka 52', async () => {
    const s = await edpSchedule('https://x', 'x (1)', fakeFetch(fixture('boras-schedule.json')), NOW)
    const fyrfack2 = s.events.filter((e) => e.labels?.karl?.includes('Fyrfackskärl 2')).map((e) => e.date)
    expect(fyrfack2).toEqual(['2026-11-25', '2026-12-23'])
  })

  it('slår ihop Uppsalas tjänster per datum och märker framräknade datum', async () => {
    const s = await edpSchedule('https://x', 'Storgatan 2, Uppsala (4004688)', fakeFetch(fixture('uppsala-schedule.json')), NOW)
    const byDate = Object.fromEntries(s.events.map((e) => [e.date, e]))
    expect(byDate['2026-11-04']).toMatchObject({ fractions: ['plast', 'metall'], estimated: false })
    expect(byDate['2026-11-05']).toMatchObject({ fractions: ['rest', 'papper', 'tidningar', 'mat'], estimated: false })
    expect(byDate['2026-11-11']).toMatchObject({ fractions: ['plast', 'glas'], estimated: true })
    expect(byDate['2026-11-12']).toMatchObject({ fractions: ['rest', 'papper', 'mat'], estimated: true })
    expect(s.updatedAt).toBe('2026-10-30')
  })

  it('räknar två tömningar i veckan på veckodagarna i Örebros text', async () => {
    const s = await edpSchedule('https://x', 'x (1)', fakeFetch(fixture('orebro-schedule.json')), NOW)
    expect(s.events.slice(0, 3).map((e) => [e.date, e.estimated])).toEqual([
      ['2026-11-02', false],
      ['2026-11-05', true],
      ['2026-11-09', true],
    ])
  })

  it('räknar inte fram datum när källan saknar frekvens (enligt körlista)', async () => {
    const s = await edpSchedule('https://x', 'x (1)', fakeFetch(fixture('ssam-schedule.json')), NOW)
    expect(s.events.filter((e) => e.fractions.includes('papper')).map((e) => e.date)).toEqual(['2026-11-02'])
  })

  it('hoppar över tjänster utan giltigt datum, som slam', async () => {
    const s = await edpSchedule('https://x', 'x (1)', fakeFetch(fixture('skelleftea-schedule.json')), NOW)
    expect(s.events.some((e) => e.date.startsWith('0001'))).toBe(false)
    expect(s.events[0]).toMatchObject({ date: '2026-11-09', estimated: false })
  })

  it('visar flerfackskärl som fyrfackskärl', async () => {
    const s = await edpSchedule('https://x', 'x (1)', fakeFetch(fixture('boras-schedule.json')), NOW)
    expect(s.events[0]).toMatchObject({ date: '2026-11-02', fractions: ['karl'], labels: { karl: 'Fyrfackskärl 1' } })
  })

  it('visar fraktionerna i Uppsalas fyrfackskärl', async () => {
    const s = await edpSchedule('https://x', 'x (1)', fakeFetch(fixture('uppsala-fyrfack-schedule.json')), NOW)
    expect(s.events[0]).toMatchObject({ date: '2026-11-11', fractions: ['rest', 'papper', 'plast', 'glas', 'metall', 'tidningar', 'mat'] })
    expect(s.events[0].labels).toBeUndefined()
    expect(s.events[1]).toMatchObject({ date: '2026-11-25', fractions: ['papper', 'metall', 'tidningar', 'mat'] })
  })
})
