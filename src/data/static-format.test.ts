import { describe, expect, it } from 'vitest'
import type { Source } from '@/sources'
import {
  buildMunicipality,
  DataError,
  parseAddressesCsv,
  parseAreasFile,
  parseSchedulesFile,
  type AddressRow,
  type AreasFile,
  type SchedulesFile,
} from './static-format'

const avesta: Source = {
  id: 'avesta',
  name: 'AVA',
  url: 'https://x',
  kommuner: [{ code: '2084', name: 'Avesta kommun' }],
  config: { system: 'static' },
}

const schedulesJson = (over: Record<string, unknown> = {}) => ({
  year: 2026,
  source: 'test',
  validFrom: '2026-01-01',
  validTo: '2027-01-10',
  updatedAt: '2026-10-29',
  schedules: {
    'onsdag-jamn': { name: 'Trakt 4', events: [{ date: '2026-11-11', fractions: ['rest', 'mat'] }] },
  },
  ...over,
})

describe('parseAddressesCsv', () => {
  it('läser BOM, kommentarer och citerade fält', () => {
    const csv = '﻿# FAKE\nid,street,locality,schedule\r\n"krylbo-a-1","Storgatan 1, uppg. B",Krylbo,onsdag-jamn\n'
    expect(parseAddressesCsv(csv, 'a.csv')).toEqual([
      { id: 'krylbo-a-1', street: 'Storgatan 1, uppg. B', locality: 'Krylbo', schedule: 'onsdag-jamn' },
    ])
  })

  it('stoppar vid saknad kolumn och nämner filen', () => {
    expect(() => parseAddressesCsv('id,street,schedule\nx,y,z\n', 'data/a.csv')).toThrow(DataError)
    expect(() => parseAddressesCsv('id,street,schedule\nx,y,z\n', 'data/a.csv')).toThrow(/data\/a\.csv.*locality/)
  })
})

describe('parseSchedulesFile', () => {
  it('godkänner en giltig fil', () => {
    expect(parseSchedulesFile(schedulesJson(), 's.json').schedules['onsdag-jamn'].name).toBe('Trakt 4')
  })

  it('stoppar vid okänd fraktion och nämner schemat', () => {
    const bad = schedulesJson({ schedules: { trakt9: { name: 'x', events: [{ date: '2026-01-01', fractions: ['kompost'] }] } } })
    expect(() => parseSchedulesFile(bad, 's.json')).toThrow(/trakt9.*kompost/)
  })

  it('stoppar vid ogiltigt datum', () => {
    const bad = schedulesJson({ schedules: { t: { name: 'x', events: [{ date: '2026-02-30', fractions: ['rest'] }] } } })
    expect(() => parseSchedulesFile(bad, 's.json')).toThrow(DataError)
  })
  it('stoppar när validFrom ligger efter validTo', () => {
    expect(() => parseSchedulesFile(schedulesJson({ validFrom: '2027-02-01' }), 's.json')).toThrow(/validFrom.*validTo/)
  })

  it('stoppar när en tömning ligger utanför giltighetsperioden', () => {
    const bad = schedulesJson({ schedules: { t: { name: 'x', events: [{ date: '2027-03-01', fractions: ['rest'] }] } } })
    expect(() => parseSchedulesFile(bad, 's.json')).toThrow(/2027-03-01.*utanför/)
  })

  it('stoppar när ett schema saknar tömningar', () => {
    const bad = schedulesJson({ schedules: { t: { name: 'x', events: [] } } })
    expect(() => parseSchedulesFile(bad, 's.json')).toThrow(/"t".*inga tömningar/)
  })
})

describe('buildMunicipality', () => {
  const y2026: SchedulesFile = parseSchedulesFile(schedulesJson(), '2026.json')
  const y2027: SchedulesFile = parseSchedulesFile(
    schedulesJson({
      year: 2027,
      validFrom: '2027-01-01',
      validTo: '2028-01-10',
      updatedAt: '2026-12-15',
      schedules: { 'onsdag-udda': { name: 'Trakt 5', events: [{ date: '2027-01-13', fractions: ['mat'] }] } },
    }),
    '2027.json',
  )
  const row = (over: Partial<AddressRow>): AddressRow => ({
    id: 'krylbo-storgatan-12b',
    street: 'Storgatan 12 B',
    locality: 'Krylbo',
    schedule: 'onsdag-jamn',
    ...over,
  })

  it('stoppar när en adress pekar på ett schema som saknas', () => {
    expect(() =>
      buildMunicipality([{ year: 2026, schedules: y2026, addresses: [row({ schedule: 'finns-inte' })] }], avesta),
    ).toThrow(/finns-inte/)
  })

  it('stoppar vid dubblett av adress-id', () => {
    expect(() => buildMunicipality([{ year: 2026, schedules: y2026, addresses: [row({}), row({})] }], avesta)).toThrow(
      /dubblett/i,
    )
  })

  it('slår ihop år per adress och tar namn från det senaste året', () => {
    const out = buildMunicipality(
      [
        { year: 2026, schedules: y2026, addresses: [row({ street: 'Storgatn 12 B' }), row({ id: 'fors-gammal-1', street: 'Gammal 1', locality: 'Fors' })] },
        { year: 2027, schedules: y2027, addresses: [row({ schedule: 'onsdag-udda' })] },
      ],
      avesta,
    )
    expect(out.index.sourceId).toBe('avesta')
    expect(out.index.updatedAt).toBe('2026-12-15')
    expect(out.index.addresses).toContainEqual(['krylbo-storgatan-12b', 'Storgatan 12 B', 'Krylbo', ['2026-onsdag-jamn', '2027-onsdag-udda']])
    // finns bara i det äldre året: får ändå index-post och .ics
    expect(out.index.addresses).toContainEqual(['fors-gammal-1', 'Gammal 1', 'Fors', ['2026-onsdag-jamn']])
    expect(out.ics.map((i) => i.addressId).sort()).toEqual(['fors-gammal-1', 'krylbo-storgatan-12b'])
    expect(out.scheduleFiles.map((s) => s.id).sort()).toEqual(['2026-onsdag-jamn', '2027-onsdag-udda'])
    expect(out.scheduleFiles.find((s) => s.id === '2027-onsdag-udda')).toMatchObject({
      validFrom: '2027-01-01',
      validTo: '2028-01-10',
      updatedAt: '2026-12-15',
    })
  })

  it('bygger .ics med händelser från alla år', () => {
    const out = buildMunicipality(
      [
        { year: 2026, schedules: y2026, addresses: [row({})] },
        { year: 2027, schedules: y2027, addresses: [row({ schedule: 'onsdag-udda' })] },
      ],
      avesta,
    )
    const ics = out.ics.find((i) => i.addressId === 'krylbo-storgatan-12b')!.content
    expect(ics).toContain('DTSTART;VALUE=DATE:20261111')
    expect(ics).toContain('DTSTART;VALUE=DATE:20270113')
  })
})

const areaJson = (over: Record<string, unknown> = {}) => ({
  explanation: 'Förklaring',
  help: 'Hjälp',
  areas: [
    {
      id: 'trakt-7',
      name: 'Avesta tätort, Östanfors m.fl.',
      day: 'Tisdag, jämn vecka',
      label: 'Trakt 7',
      schedule: 'trakt-7',
      places: ['Avesta tätort', 'Östanfors'],
      streets: ['Garpenbergsvägen', 'Östanfors'],
      searchTerms: ['trakt 7'],
      otherDays: ['Till exempel Stallgatan (måndag, udda vecka).'],
      ...over,
    },
  ],
})

describe('parseAreasFile', () => {
  it('godkänner en giltig fil', () => {
    const file = parseAreasFile(areaJson(), 'o.json')
    expect(file.areas[0].id).toBe('trakt-7')
    expect(file.help).toBe('Hjälp')
  })

  it('stoppar vid tomt name', () => {
    expect(() => parseAreasFile(areaJson({ name: ' ' }), 'o.json')).toThrow(DataError)
    expect(() => parseAreasFile(areaJson({ name: '' }), 'o.json')).toThrow(/o\.json.*trakt-7.*name/)
  })

  it('stoppar när schedule saknas', () => {
    expect(() => parseAreasFile(areaJson({ schedule: undefined }), 'o.json')).toThrow(/schedule/)
  })

  it('stoppar vid dubbla id', () => {
    const json = areaJson()
    json.areas.push({ ...json.areas[0] })
    expect(() => parseAreasFile(json, 'o.json')).toThrow(/dubblett.*trakt-7/i)
  })

  it('stoppar när id är "omraden"', () => {
    expect(() => parseAreasFile(areaJson({ id: 'omraden' }), 'o.json')).toThrow(/omraden/)
  })

  it('stoppar när listorna saknas', () => {
    expect(() => parseAreasFile(areaJson({ places: 'Avesta' }), 'o.json')).toThrow(/places/)
  })
})

describe('buildMunicipality med områden', () => {
  const schedules = (year: number, over: Record<string, string[]> = {}): SchedulesFile =>
    parseSchedulesFile(
      schedulesJson({
        year,
        validFrom: `${year}-01-01`,
        validTo: `${year + 1}-01-10`,
        schedules: {
          'trakt-7': { name: 'Trakt 7', events: (over['trakt-7'] ?? [`${year}-11-10`, `${year}-11-24`]).map((date) => ({ date, fractions: ['mat'] })) },
          'trakt-8': { name: 'Trakt 8', events: (over['trakt-8'] ?? [`${year}-11-11`]).map((date) => ({ date, fractions: ['mat'] })) },
        },
      }),
      `${year}.json`,
    )
  const areas = (parseAreasFile(areaJson(), 'o.json') as AreasFile)

  it('gör ett område till en indexrad med detail och sökord utan dubbletter', () => {
    const out = buildMunicipality([{ year: 2026, schedules: schedules(2026), addresses: [], areas }], avesta)
    expect(out.index.addresses).toEqual([
      [
        'trakt-7',
        'Avesta tätort, Östanfors m.fl.',
        '',
        ['2026-trakt-7'],
        {
          detail: 'Tisdag, jämn vecka · Trakt 7',
          searchTerms: ['Avesta tätort', 'Östanfors', 'Garpenbergsvägen', 'trakt 7'],
        },
      ],
    ])
  })

  it('ger områdesfilen med sökord och sammanslagna, sorterade datum från båda åren', () => {
    const out = buildMunicipality(
      [
        { year: 2027, schedules: schedules(2027), addresses: [], areas },
        { year: 2026, schedules: schedules(2026), addresses: [], areas },
      ],
      avesta,
    )
    expect(out.areas).toEqual({
      explanation: 'Förklaring',
      help: 'Hjälp',
      areas: [
        {
          id: 'trakt-7',
          name: 'Avesta tätort, Östanfors m.fl.',
          day: 'Tisdag, jämn vecka',
          label: 'Trakt 7',
          places: ['Avesta tätort', 'Östanfors'],
          otherDays: ['Till exempel Stallgatan (måndag, udda vecka).'],
          searchTerms: ['Avesta tätort', 'Östanfors', 'Garpenbergsvägen', 'trakt 7'],
          dates: ['2026-11-10', '2026-11-24', '2027-11-10', '2027-11-24'],
        },
      ],
    })
    expect(out.index.addresses[0][3]).toEqual(['2026-trakt-7', '2027-trakt-7'])
  })

  it('stoppar när ett datum finns i två områdens scheman', () => {
    const two: AreasFile = parseAreasFile(
      { ...areaJson(), areas: [areaJson().areas[0], { ...areaJson().areas[0], id: 'trakt-8', schedule: 'trakt-8' }] },
      'o.json',
    )
    const s = schedules(2026, { 'trakt-8': ['2026-11-24'] })
    expect(() => buildMunicipality([{ year: 2026, schedules: s, addresses: [], areas: two }], avesta)).toThrow(
      /2026-11-24/,
    )
  })

  it('stoppar när ett område pekar på ett schema som saknas', () => {
    const bad = parseAreasFile(areaJson({ schedule: 'finns-inte' }), 'o.json')
    expect(() => buildMunicipality([{ year: 2026, schedules: schedules(2026), addresses: [], areas: bad }], avesta)).toThrow(
      /finns-inte/,
    )
  })

  it('bygger .ics med område-id i UID', () => {
    const out = buildMunicipality([{ year: 2026, schedules: schedules(2026), addresses: [], areas }], avesta)
    expect(out.ics.map((i) => i.addressId)).toEqual(['trakt-7'])
    expect(out.ics[0].content).toContain('UID:trakt-7-2026-11-10@sopor.hardyson.se')
  })

  it('ger ingen areas-fil utan områden', () => {
    const out = buildMunicipality([{ year: 2026, schedules: y(), addresses: [] }], avesta)
    expect(out.areas).toBeUndefined()
  })
})

function y(): SchedulesFile {
  return parseSchedulesFile(schedulesJson(), 'y.json')
}
