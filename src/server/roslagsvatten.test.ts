import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { edpAddressId, idHash } from './edp.js'
import { SourceError } from './http.js'
import {
  roslagsvattenDetails,
  roslagsvattenFind,
  roslagsvattenPickups,
  roslagsvattenSchedule,
  roslagsvattenSearch,
  type RoslagsvattenPickup,
} from './roslagsvatten.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: string) => new Response(body, { headers: { 'Content-Type': 'application/json' } })
const noHits = () => new Response('The website encountered an unexpected error. Try again later.', { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

/** Hela svaret för en lista kärl: [namn, frekvens, nästa hämtning]. */
const scheduleResponse = (rows: string[][]) =>
  JSON.stringify([
    {
      data: `<div class="waste-schedule-results">${rows
        .map(([n, f, d]) => `<div class="waste-schedule-inner"><h3>${n}</h3>\n<p>Frekvens: ${f}</p>\n<p>Nästa hämtning: ${d}</p></div>`)
        .join('')}</div>`,
    },
  ])

function fake({ sok = fixture('roslagsvatten-sok.json'), schema = () => fixture('roslagsvatten-schema.json') }: { sok?: string | (() => Response); schema?: (buildingId: string) => string } = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/schedule/search')) return typeof sok === 'string' ? json(sok) : sok()
    return json(schema(JSON.parse(String(init?.body)).buildingId))
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const body = (fetchFn: ReturnType<typeof vi.fn>, call = 0) => JSON.parse(String(fetchFn.mock.calls[call][1].body))

const pickup = (type: string, frequency: string, date?: string): RoslagsvattenPickup => ({ type, frequency, ...(date && { date }) })

describe('roslagsvattenSearch', () => {
  it('läser adresserna med ort, utan ort och med entiteter, med en hash i stället för värdet', async () => {
    const found = await roslagsvattenSearch('vaxholm', 'Hamngatan', fake())
    expect(found.map((a) => a.building.street)).toEqual(['Hamngatan 1', 'Hamngatan 3 -7', 'Hamngatan 31', 'Hamngatan 31', "Sankt Ol's gata 4"])
    expect(found.map((a) => a.building.locality)).toEqual(['Vaxholm', '', 'Vaxholm', 'Vaxholm', 'Vaxholm'])
    expect(found[0].buildingId).toBe('100000001')
    expect(found[0].building.buildingId).toBe(idHash('100000001'))
    expect(edpAddressId(found[1].building)).toBe(`hamngatan-3-~7-${idHash('100000002')}`)
  })

  it('skickar kommunen och tar bort orten och allt efter första numret', async () => {
    const fetchFn = fake()
    await roslagsvattenSearch('osteraker', 'Hamnvägen 2A, Åkersberga', fetchFn)
    expect(body(fetchFn)).toEqual({ searchText: 'Hamnvägen 2', municipality: 'osteraker' })
    expect(String(fetchFn.mock.calls[0][0])).toBe('https://roslagsvatten.se/schedule/search')
    expect(fetchFn.mock.calls[0][1].method).toBe('POST')
  })

  it('ger inga träffar när sajten svarar 500 med sin feltext, men fel för andra felkoder', async () => {
    expect(await roslagsvattenSearch('vaxholm', 'xyzzy', fake({ sok: noHits }))).toEqual([])
    await expect(roslagsvattenSearch('vaxholm', 'xyzzy', fake({ sok: () => new Response('Bad gateway', { status: 502 }) }))).rejects.toThrow(SourceError)
    await expect(roslagsvattenSearch('vaxholm', 'xyzzy', fake({ sok: () => new Response('Något annat', { status: 500 }) }))).rejects.toThrow(SourceError)
  })

  it('kastar vid okänd form', async () => {
    for (const sok of ['{}', '[]', '[{"data":"<p>annat</p>"}]', '[{"data":"<ul id=\\"waste-schedule-building-list\\"><li>Utan id</li></ul>"}]']) {
      await expect(roslagsvattenSearch('vaxholm', 'Hamngatan', fake({ sok }))).rejects.toThrow(SourceError)
    }
  })
})

describe('roslagsvattenFind', () => {
  const ID = `hamngatan-31_vaxholm-${idHash('100000032')}`

  it('väljer träffen vars hash står i id:t, bland flera på samma adress', async () => {
    const found = await roslagsvattenFind('vaxholm', ID, fake())
    expect(found?.buildingId).toBe('100000032')
  })

  it('hittar en adress utan ort, och skickar bara gatan och numret', async () => {
    const fetchFn = fake()
    const found = await roslagsvattenFind('vaxholm', `hamngatan-3-~7-${idHash('100000002')}`, fetchFn)
    expect(found?.buildingId).toBe('100000002')
    expect(body(fetchFn).searchText).toBe('hamngatan 3')
  })

  it('söker brett när id:t saknar tecken ur adressen', async () => {
    const li = '<li data-bid="7">Gustav III:s väg 2, Drottningholm</li><li data-bid="8">Gustav Adolfs väg 2, Drottningholm</li>'
    const sok = vi.fn((q: string) => JSON.stringify([{ data: `<ul id="waste-schedule-building-list">${q === 'gus' ? li : ''}</ul>` }]))
    const fetchFn = vi.fn(async (_: unknown, init?: RequestInit) => json(sok(JSON.parse(String(init?.body)).searchText))) as unknown as typeof fetch
    const found = await roslagsvattenFind('ekero', `gustav-iiis-väg-2_drottningholm-${idHash('7')}`, fetchFn)
    expect(found?.buildingId).toBe('7')
    expect(sok.mock.calls.map(([q]) => q)).toEqual(['gustav iiis väg 2', 'gus'])
  })

  it('använder den enda träffen om hashen är borta, med id:t oförändrat', async () => {
    const old = `hamngatan-1_vaxholm-${idHash('999')}`
    const found = await roslagsvattenFind('vaxholm', old, fake())
    expect(found?.buildingId).toBe('100000001')
    expect(edpAddressId(found!.building)).toBe(old)
  })

  it('gissar inte bland flera träffar, och ger null för ett oläsbart id', async () => {
    expect(await roslagsvattenFind('vaxholm', `hamngatan-31_vaxholm-${idHash('999')}`, fake())).toBeNull()
    expect(await roslagsvattenFind('vaxholm', 'x', fake())).toBeNull()
  })
})

describe('roslagsvattenPickups', () => {
  it('läser kärlen med datum, tomt datum och vecka', async () => {
    const pickups = await roslagsvattenPickups('ekero', '100000001', fake())
    expect(pickups).toEqual([
      { type: 'Slam', frequency: 'Vecka 25. Slam' },
      { type: 'Rest- matavfall', frequency: 'Fredag udda vecka. Avfall', date: '2026-11-06' },
      { type: 'Fyrfack 1', frequency: 'Fredag jämn vecka. Avfall' },
      { type: 'Fyrfack 2', frequency: 'Fredag var 4:e vecka startvecka 3. Avfall' },
    ])
  })

  it('skickar kommunen och värdet', async () => {
    const fetchFn = fake()
    await roslagsvattenPickups('ekero', '100000001', fetchFn)
    expect(body(fetchFn)).toEqual({ buildingId: '100000001', municipality: 'ekero' })
    expect(String(fetchFn.mock.calls[0][0])).toBe('https://roslagsvatten.se/schedule/fetch')
  })

  it('ger en tom lista för "No waste schedule found", och raden utan namn hoppas över', async () => {
    const none = JSON.stringify([{ data: '<div class="waste-schedule-results"><p>No waste schedule found.</p></div>' }])
    expect(await roslagsvattenPickups('ekero', '1', fake({ schema: () => none }))).toEqual([])
    const unnamed = scheduleResponse([['', '* Budning', '']])
    expect(await roslagsvattenPickups('ekero', '1', fake({ schema: () => unnamed }))).toEqual([])
  })

  it('godtar månad utan vecka och veckointervall', async () => {
    const rows = scheduleResponse([['Slam', 'x', 'Nov 2026'], ['Slam', 'x', 'v21-22 Maj 2027']])
    expect(await roslagsvattenPickups('ekero', '1', fake({ schema: () => rows }))).toHaveLength(2)
  })

  it('kastar vid okänd form', async () => {
    const bad = [
      '{}',
      '[{"data":"<p>annat</p>"}]',
      scheduleResponse([['Restavfall', 'x', 'snart']]),
      scheduleResponse([['Restavfall', 'x', '2026-13-45']]),
      scheduleResponse([['', 'x', '2026-11-06']]),
      JSON.stringify([{ data: '<div class="waste-schedule-results"><div class="waste-schedule-inner"><h3>Restavfall</h3></div></div>' }]),
    ]
    for (const schema of bad) await expect(roslagsvattenPickups('ekero', '1', fake({ schema: () => schema }))).rejects.toThrow(SourceError)
  })
})

describe('roslagsvattenSchedule', () => {
  const today = '2026-11-04'
  const dates = (p: RoslagsvattenPickup) => roslagsvattenSchedule([p], today).events

  it('räknar fram udda och jämna veckor från källans datum, och märker dem beräknade', () => {
    const events = dates(pickup('Restavfall', 'Fredag udda vecka. Avfall', '2026-11-06'))
    expect(events[0]).toMatchObject({ date: '2026-11-06', fractions: ['rest'], estimated: false })
    expect(events[1]).toMatchObject({ date: '2026-11-20', estimated: true })
    expect(events.length).toBeGreaterThan(20)
  })

  it('räknar fram varje vecka, och var fjärde vecka', () => {
    expect(dates(pickup('Restavfall', '* 52 ggr/år. Varje vecka helår. Avfall', '2026-11-09'))[1].date).toBe('2026-11-16')
    expect(dates(pickup('Restavfall', 'Måndag varje vecka ', '2026-11-09'))[1].date).toBe('2026-11-16')
    expect(dates(pickup('Restavfall', 'Fredag var 4:e vecka startvecka 3. Avfall', '2026-11-20'))[1].date).toBe('2026-12-18')
  })

  it('räknar fram flera veckodagar i veckan', () => {
    const events = dates(pickup('Matavfall', 'Tisdag och fredag varje vecka', '2026-11-06'))
    expect(events.slice(0, 3).map((e) => e.date)).toEqual(['2026-11-06', '2026-11-10', '2026-11-13'])
  })

  it('ger bara källans datum när frekvensen inte går att lita på', () => {
    for (const frequency of [
      'Onsdag jämn vecka säsong. Avfall',
      'Onsdag jämn vecka, 16 ggr per år säsong v16-46',
      '* 19 ggr/år. Varje vecka. Helår. Special',
      '* 104 ggr/år. 2 ggr per vecka. Helår',
      'Onsdag var 8:e vecka startvecka 3. Avfall',
      '8 ggr per år. Trädgård april-november',
      'Måndag 22 ggr per år. KT',
    ]) {
      expect(dates(pickup('Restavfall', frequency, '2026-11-09')), frequency).toEqual([{ date: '2026-11-09', fractions: ['rest'], estimated: false }])
    }
  })

  it('räknar aldrig fram ett kärl utan datum', () => {
    expect(dates(pickup('Fyrfack 1', 'Fredag jämn vecka. Avfall'))).toEqual([])
  })

  it('visar delat kärl och hoppar över slam och passerade datum', () => {
    const { events } = roslagsvattenSchedule(
      [pickup('Rest- matavfall', 'x', '2026-11-06'), pickup('Slam', 'x', '2026-11-06'), pickup('Matavfall', 'x', '2026-11-01')],
      today,
    )
    expect(events).toEqual([{ date: '2026-11-06', fractions: ['rest', 'mat'], estimated: false }])
  })

  it('visar ett daterat fyrfackskärl med numret', () => {
    expect(dates(pickup('Fyrfack 2', 'x', '2026-11-06'))[0]).toMatchObject({ fractions: ['karl'], labels: { karl: 'Fyrfackskärl 2' } })
  })
})

describe('roslagsvattenDetails', () => {
  const today = '2026-11-04'
  const rest = ['Restavfall', 'Fredag udda vecka. Avfall', '2026-11-06']
  const both = ['Rest- matavfall', 'Fredag udda vecka. Avfall', '2026-11-06']
  const search = () => roslagsvattenSearch('vaxholm', 'Hamngatan', fake())
  const details = async (schema: (id: string) => string) => {
    const fetchFn = fake({ schema })
    const out = await roslagsvattenDetails('vaxholm', await search(), today, fetchFn)
    return { out: new Map(out.map(([b, d]) => [b.buildingId, d])), count: out.length, fetchFn }
  }
  const h31a = idHash('100000031')
  const h31b = idHash('100000032')

  it('hämtar bara kärlen för adresser med flera träffar, och visar vad som skiljer', async () => {
    const { out, fetchFn } = await details((id) => scheduleResponse([id === '100000031' ? rest : both]))
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(out.get(h31a)).toBe('Restavfall')
    expect(out.get(h31b)).toBe('Rest- matavfall')
    expect(out.get(idHash('100000001'))).toBeUndefined()
  })

  it('lägger till frekvens och nästa tömning när kärlen är lika', async () => {
    const other = ['Restavfall', 'Fredag jämn vecka. Avfall', '2026-11-13']
    const { out } = await details((id) => scheduleResponse([id === '100000031' ? rest : other]))
    expect(out.get(h31a)).toBe('Restavfall, fredag udda vecka, nästa Fre 6 nov')
    expect(out.get(h31b)).toBe('Restavfall, fredag jämn vecka, nästa Fre 13 nov')
  })

  it('visar samma schema en gång', async () => {
    const { out, count } = await details(() => scheduleResponse([rest]))
    expect(count).toBe(4)
    expect(out.has(h31a)).toBe(true)
    expect(out.has(h31b)).toBe(false)
    expect(out.get(h31a)).toBeUndefined()
  })

  it('säger till när en av träffarna inte har några tömningar', async () => {
    const { out } = await details((id) => (id === '100000031' ? scheduleResponse([rest]) : scheduleResponse([['Slam', 'x', 'v25 Jun 2027']])))
    expect(out.get(h31b)).toBe('Inga tömningar just nu')
  })

  it('ger ingen särskiljare, men heller inget fel, när kärlen inte går att hämta', async () => {
    const { out, count } = await details(() => 'trasigt')
    expect(count).toBe(5)
    expect(out.get(h31a)).toBeUndefined()
  })

  it('hämtar inga kärl när för många träffar har samma adress', async () => {
    const li = Array.from({ length: 21 }, (_, i) => `<li data-bid="${i + 1}">Hamngatan 1, Vaxholm</li>`).join('')
    const fetchFn = fake({ sok: JSON.stringify([{ data: `<ul id="waste-schedule-building-list">${li}</ul>` }]) })
    const out = await roslagsvattenDetails('vaxholm', await roslagsvattenSearch('vaxholm', 'Hamngatan', fetchFn), today, fetchFn)
    expect(out).toHaveLength(21)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
