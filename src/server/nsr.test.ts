import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { edpAddressId } from './edp'
import { SourceError } from './http'
import { NSR_URL, nsrDetails, nsrSchedule, nsrSearch, parseNsrIcs, type NsrHit } from './nsr'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const unknown = new SourceError('nsr.se svarade med ett okänt format')

/** Sökningen svarar med JSON och kalendern med ICS, som nsr.se. */
function fakeNsr({ search = fixture('nsr-adresser.json'), ics = fixture('nsr-kalender.ics') } = {}) {
  return vi.fn(async (input: string | URL | Request) =>
    String(input).includes('/calendar?')
      ? new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } })
      : new Response(search, { headers: { 'Content-Type': 'application/json; charset=utf-8' } }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const hit = (exec: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ fp: [{ id: 'abc123', Adress: 'Rosenvägen 3', Ort: 'Helsingborg', Exec: exec, ...extra }], q: 'x' })

async function rosenvagen3(): Promise<NsrHit> {
  return (await nsrSearch('rosenvägen 3', fakeNsr()))[0]
}

describe('nsrSearch', () => {
  it('ger träffarna med gata, ort, NSR:s id och de närmaste tömningarna', async () => {
    const fetchFn = fakeNsr()
    const hits = await nsrSearch('rosenvägen 3', fetchFn)
    expect(String(fetchFn.mock.calls[0][0])).toBe(`${NSR_URL}/search?query=rosenv%C3%A4gen+3`)
    expect(hits.map((h) => `${h.building.street}, ${h.building.locality}`).slice(0, 3)).toEqual([
      'Rosenvägen 3, Helsingborg',
      'Rosenvägen 3, Ekeby',
      'Rosenvägen 3, Ängelholm',
    ])
    expect(hits[0].building.buildingId).toBe('71d627516ce56271010a40fdb5d01eed')
    expect(hits[0].pickups[0]).toEqual({ date: '2026-11-03', type: 'KÄRL 1', changed: false })
  })

  it('söker utan bokstaven efter numret, som NSR inte klarar ("7A" ger inga träffar)', async () => {
    const fetchFn = fakeNsr()
    await nsrSearch('Södra Torggatan 7A', fetchFn)
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('query')).toBe('Södra Torggatan 7')
  })

  it('låser adress-id:t (regel 3)', async () => {
    expect(edpAddressId((await rosenvagen3()).building)).toBe('rosenvägen-3_helsingborg-71d627516ce56271010a40fdb5d01eed')
  })

  it('godtar en adress utan tömningar', async () => {
    const hits = await nsrSearch('x', fakeNsr({ search: hit({ Datum: [], AvfallsTyp: [], Andrad: [] }) }))
    expect(hits[0].pickups).toEqual([])
  })

  it.each([
    ['fp saknas', JSON.stringify({ q: 'x' })],
    ['id saknas', JSON.stringify({ fp: [{ Adress: 'Rosenvägen 3', Ort: 'Helsingborg', Exec: { Datum: [], AvfallsTyp: [] } }] })],
    ['Exec saknas', JSON.stringify({ fp: [{ id: 'abc', Adress: 'Rosenvägen 3', Ort: 'Helsingborg' }] })],
    ['listor med olika längd', hit({ Datum: ['2026-11-03'], AvfallsTyp: [] })],
    ['datum i fel format', hit({ Datum: ['3 nov'], AvfallsTyp: ['KÄRL 1'] })],
  ])('kastar för okänd form: %s', async (_, body) => {
    await expect(nsrSearch('x', fakeNsr({ search: body }))).rejects.toEqual(unknown)
  })
})

describe('parseNsrIcs', () => {
  it('ger varje händelse en gång, med flyttade tömningar markerade', () => {
    const pickups = parseNsrIcs(fixture('nsr-kalender.ics'))
    expect(pickups).toHaveLength(85)
    expect(pickups).toContainEqual({ date: '2026-12-21', type: 'KÄRL 1', changed: true, location: 'Rosenvägen 3, Helsingborg' })
  })

  it('läser radbrytningar och kodade tecken enligt RFC 5545', () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261103', 'SUMMARY:Mat ', ' + Rest', 'LOCATION:Storgatan 1\\, Höganäs', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    expect(parseNsrIcs(ics)).toEqual([{ date: '2026-11-03', type: 'Mat + Rest', changed: false, location: 'Storgatan 1, Höganäs' }])
  })

  it.each([
    ['inte en kalender', '<html></html>'],
    ['händelse utan datum', 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:KÄRL 1\nEND:VEVENT\nEND:VCALENDAR'],
    ['händelse utan typ', 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261103T070000\nEND:VEVENT\nEND:VCALENDAR'],
  ])('kastar för okänd form: %s', (_, ics) => {
    expect(() => parseNsrIcs(ics)).toThrow(unknown)
  })
})

describe('nsrSchedule', () => {
  it('ger källans datum från i dag, med fyrfackskärlen och en varning för flyttade tömningar', async () => {
    const fetchFn = fakeNsr()
    const schedule = await nsrSchedule(await rosenvagen3(), fetchFn, 5000, '2026-11-03')
    const url = new URL(String(fetchFn.mock.calls[0][0]))
    expect(url.pathname).toBe('/api/wastecalendar/calendar')
    expect(Object.fromEntries(url.searchParams)).toEqual({ query: 'Rosenvägen 3', id: '71d627516ce56271010a40fdb5d01eed', calendar_type: 'ical' })
    expect(schedule.events.map((e) => e.date)).toEqual([
      '2026-11-03', '2026-11-10', '2026-11-16', '2026-11-17', '2026-11-19', '2026-11-24',
      '2026-12-01', '2026-12-08', '2026-12-15', '2026-12-17', '2026-12-21', '2026-12-28',
    ])
    expect(schedule.events[0]).toEqual({ date: '2026-11-03', fractions: ['karl'], labels: { karl: 'Fyrfackskärl 1' }, estimated: false })
    expect(schedule.events[2].labels).toEqual({ karl: 'Trädgårdsavfall' })
    expect(schedule.events.at(-1)!.warning).toBe('Flyttad tömning enligt NSR.')
    expect(schedule.events.every((e) => !e.estimated)).toBe(true)
  })

  it('hämtar kalenderfilen utan bokstaven efter numret', async () => {
    const fetchFn = fakeNsr({ ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' })
    const h: NsrHit = { building: { raw: 'Södra Torggatan 7A', street: 'Södra Torggatan 7A', locality: 'Hasslarp', buildingId: 'x' }, pickups: [] }
    await nsrSchedule(h, fetchFn, 5000, '2026-11-03')
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('query')).toBe('Södra Torggatan 7')
  })

  it('tar med sökträffens datum efter kalenderfilens sista, till exempel över årsskiftet', async () => {
    const [h] = await nsrSearch('x', fakeNsr({ search: hit({ Datum: ['2027-01-05'], AvfallsTyp: ['KÄRL 1'], Andrad: [1] }) }))
    const schedule = await nsrSchedule({ ...h, building: { ...h.building, buildingId: '71d627516ce56271010a40fdb5d01eed' } }, fakeNsr(), 5000, '2026-12-20')
    expect(schedule.events.map((e) => e.date)).toEqual(['2026-12-21', '2026-12-28', '2027-01-05'])
    expect(schedule.events[2].warning).toBe('Flyttad tömning enligt NSR.')
  })

  it('använder inte en kalenderfil för en annan adress (NSR:s id är inte unikt)', async () => {
    const other: NsrHit = { building: { raw: 'Norra Torggatan 7', street: 'Norra Torggatan 7', locality: 'Hasslarp', buildingId: 'x' }, pickups: [] }
    await expect(nsrSchedule(other, fakeNsr(), 5000, '2026-11-03')).rejects.toEqual(unknown)
  })

  it('ger ett tomt schema när kalenderfilen svarar 500 för en adress utan tömningar, men ett fel annars', async () => {
    const fail = vi.fn(async () => new Response('{"statusCode":500}', { status: 500 })) as unknown as typeof fetch
    const empty: NsrHit = { building: { raw: 'Järnvägsgatan 3', street: 'Järnvägsgatan 3', locality: 'Ängelholm', buildingId: 'x' }, pickups: [] }
    expect((await nsrSchedule(empty, fail, 5000, '2026-11-03')).events).toEqual([])
    await expect(nsrSchedule(await rosenvagen3(), fail, 5000, '2026-11-03')).rejects.toThrow('nsr.se svarade 500')
  })

  it('ger ett tomt schema för en adress utan tömningar', async () => {
    const empty: NsrHit = { building: { raw: 'Rosenvägen 34', street: 'Rosenvägen 34', locality: 'Helsingborg', buildingId: 'x' }, pickups: [] }
    const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n'
    expect((await nsrSchedule(empty, fakeNsr({ ics }), 5000, '2026-11-03')).events).toEqual([])
  })
})

describe('nsrDetails', () => {
  it('skiljer träffar med samma gata och ort åt med kärlen, och med nästa tömning när kärlen är desamma', async () => {
    const hits = await nsrSearch('torggatan 7', fakeNsr({ search: fixture('nsr-adresser-dubbletter.json') }))
    const details = nsrDetails(hits).filter(([b]) => b.street === 'Torggatan 7' && b.locality === 'Höganäs')
    expect(details.map(([, d]) => d)).toEqual(['Matavfall, Restavfall', 'Trädgårdsavfall, Mat + Rest, Pappersförpackningar, Tidn./glas/metall, Plastförpackningar'])
    const same = [hits[4], { ...hits[4], building: { ...hits[4].building, buildingId: 'b' }, pickups: hits[4].pickups.slice(2) }]
    expect(nsrDetails(same).map(([, d]) => d)).toEqual(['Matavfall, Restavfall, nästa Mån 9 nov', 'Matavfall, Restavfall, nästa Mån 16 nov'])
    expect(nsrDetails(hits).find(([b]) => b.locality === 'Billesholm')![1]).toBeUndefined()
  })
})
