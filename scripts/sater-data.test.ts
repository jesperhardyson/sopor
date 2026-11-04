import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildMunicipality } from '../src/data/static-format'
import { areaForDate } from '../src/domain/areas'
import { searchAddresses } from '../src/domain/search'
import type { Address } from '../src/domain/types'
import { ALL_SOURCES } from '../src/sources'
import { readYears } from './build-data'

const source = ALL_SOURCES.find((s) => s.id === 'sater')!
const years = readYears(path.resolve(import.meta.dirname, '../data/sater'))
const built = buildMunicipality(years, source)
const areas = built.areas!.areas
const schedules = years[0].schedules

// Facit: sater.se/bygga-bo-miljo/avfall-och-atervinning/hamtningsdagar-sophamtning/, uppdaterad 2026-11-02
const WEEKS = {
  ojamn: { 45: 'papper', 47: 'rest', 49: 'plast', 51: 'papper', 53: 'rest' },
  jamn: { 46: 'papper', 48: 'rest', 50: 'plast', 52: 'papper' },
}
const DAYS = ['mandag', 'tisdag', 'onsdag', 'torsdag', 'fredag']
const NAMES_PER_AREA: Record<string, number> = {
  'ojamn-mandag': 12,
  'ojamn-tisdag': 12,
  'ojamn-onsdag': 8,
  'ojamn-torsdag': 12,
  'ojamn-fredag': 11,
  'jamn-mandag': 4,
  'jamn-tisdag': 15,
  'jamn-onsdag': 23,
  'jamn-torsdag': 13,
  'jamn-fredag': 11,
}
const MONDAY_WEEK_45 = Date.UTC(2026, 10, 2)

const dateIn = (week: number, day: number) =>
  new Date(MONDAY_WEEK_45 + ((week - 45) * 7 + day) * 86_400_000).toISOString().slice(0, 10)

const addresses: Address[] = built.index.addresses.map(([id, street, locality, , area]) => ({
  id,
  street,
  locality,
  sourceId: 'sater',
  kommun: 'Säters kommun',
  searchTerms: area?.searchTerms,
}))
const search = (q: string) => searchAddresses(q, addresses, 10).map((a) => a.id).sort()

describe('Säters schema', () => {
  it.each((['ojamn', 'jamn'] as const).flatMap((p) => DAYS.map((d, i) => [p, d, i] as const)))(
    '%s-%s följer kommunens veckotabell',
    (parity, day, index) => {
      expect(schedules.schedules[`${parity}-${day}`].events).toEqual(
        Object.entries(WEEKS[parity]).map(([week, fraction]) => ({ date: dateIn(Number(week), index), fractions: [fraction, 'mat'] })),
      )
    },
  )

  it('gäller bara de veckor kommunen har publicerat', () => {
    expect(schedules.validFrom).toBe('2026-11-02')
    expect(schedules.validTo).toBe('2027-01-03')
  })
})

describe('Säters områden', () => {
  const area = (id: string) => areas.find((a) => a.id === id)!

  it('har kommunens alla namn, i tio områden', () => {
    expect(Object.fromEntries(areas.map((a) => [a.id, a.places.length]))).toEqual(NAMES_PER_AREA)
  })

  it('visar hämtdagen utan påhittade nummer', () => {
    expect(area('ojamn-mandag')).toMatchObject({ name: 'Dalsbyn, Finnbo m.fl.', day: 'Måndag', label: 'Ojämn vecka' })
    expect(area('jamn-fredag')).toMatchObject({ name: 'Backa, Bondhyttan m.fl.', day: 'Fredag', label: 'Jämn vecka' })
    expect(area('ojamn-fredag').name).toBe('Dammhusviken, Fiskarbo m.fl.')
  })

  it('kan pekas ut av datumet för senaste tömningen', () => {
    expect(areaForDate('2026-11-24', areas)).toMatchObject({ kind: 'found', area: { id: 'jamn-tisdag' } })
    expect(areaForDate('2026-11-07', areas)).toEqual({ kind: 'none' })
    expect(areaForDate('2026-10-27', areas)).toEqual({ kind: 'outside' })
  })
})

describe('sökning på Säters områden', () => {
  it('hittar orter och gator som kommunen nämner', () => {
    expect(search('Bispberg')).toEqual(['ojamn-onsdag'])
    expect(search('Innerstaden')).toEqual(['ojamn-tisdag'])
    expect(search('Postvägen 5')).toEqual(['jamn-torsdag'])
  })

  it.each([
    ['Arkhyttan', ['ojamn-fredag', 'ojamn-tisdag']],
    ['Forsbo', ['ojamn-onsdag', 'ojamn-tisdag']],
    ['Hysta', ['jamn-tisdag', 'ojamn-tisdag']],
    ['Landa', ['jamn-tisdag', 'ojamn-onsdag']],
    ['Lövåsen', ['ojamn-fredag', 'ojamn-torsdag']],
  ])('visar alla områden för %s, så att ingen får fel hämtdag', (query, ids) => {
    expect(search(query)).toEqual(ids)
  })

  it.each(['Falkgränd', 'Dahlanders väg', 'Falkgränd 3'])('leder inte %s till Åsen, där den inte ingår', (query) => {
    expect(search(query)).toEqual([])
  })

  it('berättar om undantaget på områdets sida', () => {
    expect(areas.find((a) => a.id === 'jamn-torsdag')!.otherDays).toEqual(['Falkgränd och Dahlanders väg ingår inte i Åsen.'])
  })

  it.each(['del', 'av', 'om', 'by', 'del av'])('ger inga områden för småordet "%s"', (query) => {
    expect(search(query)).toEqual([])
  })
})

describe('Säter i registret', () => {
  it('är synlig, med områdesval och utan testdata', () => {
    expect(source.hidden).toBeUndefined()
    expect(source).toMatchObject({ selection: 'area', config: { system: 'static' }, kommuner: [{ code: '2082', name: 'Säters kommun' }] })
    expect(source.testData).toBeUndefined()
    expect(source.areaNotice?.text).toContain('Väljer du fel område')
  })
})
