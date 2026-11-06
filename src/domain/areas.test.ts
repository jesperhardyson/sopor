import { describe, expect, it } from 'vitest'
import { areaDetail, areaForDate, areasForDate } from './areas'
import type { Area } from './types'

const area = (id: string, dates: string[]): Area => ({
  id,
  name: id,
  day: 'Tisdag',
  label: id,
  places: [],
  otherDays: [],
  searchTerms: [],
  dates,
})

const A = area('A', ['2026-10-13', '2026-10-27', '2026-11-10'])
const B = area('B', ['2026-10-14', '2026-10-28'])

describe('areaForDate', () => {
  it('hittar området och dess två senaste samt nästa hämtning', () => {
    expect(areaForDate('2026-10-27', [A, B])).toEqual({
      kind: 'found',
      area: A,
      previous: ['2026-10-13', '2026-10-27'],
      next: '2026-11-10',
    })
  })

  it('ger bara det valda datumet när det är områdets första', () => {
    expect(areaForDate('2026-10-13', [A, B])).toMatchObject({ kind: 'found', previous: ['2026-10-13'] })
  })

  it('ger inget nästa datum efter det sista', () => {
    expect(areaForDate('2026-11-10', [A, B])).toMatchObject({ kind: 'found', next: null })
  })

  it('ger none för ett datum inom perioden utan hämtning', () => {
    expect(areaForDate('2026-10-24', [A, B])).toEqual({ kind: 'none' })
  })

  it('ger outside före och efter alla datum', () => {
    expect(areaForDate('2026-10-12', [A, B])).toEqual({ kind: 'outside' })
    expect(areaForDate('2026-11-11', [A, B])).toEqual({ kind: 'outside' })
  })
})

describe('areasForDate', () => {
  it('ger alla områden med hämtning datumet, med vars och ens datum', () => {
    const C = area('C', ['2026-10-20', '2026-10-27'])
    expect(areasForDate('2026-10-27', [A, B, C])).toEqual({
      kind: 'found',
      matches: [
        { area: A, previous: ['2026-10-13', '2026-10-27'], next: '2026-11-10' },
        { area: C, previous: ['2026-10-20', '2026-10-27'], next: null },
      ],
    })
  })

  it('ger none och outside som areaForDate', () => {
    expect(areasForDate('2026-10-24', [A, B])).toEqual({ kind: 'none' })
    expect(areasForDate('2026-11-11', [A, B])).toEqual({ kind: 'outside' })
    expect(areasForDate('2026-10-27', [])).toEqual({ kind: 'outside' })
  })
})

describe('areaDetail', () => {
  it('visar etiketten efter hämtdagen när den finns', () => {
    expect(areaDetail({ day: 'Tisdag, jämn vecka', label: 'Trakt 7' })).toBe('Tisdag, jämn vecka · Trakt 7')
    expect(areaDetail({ day: 'Måndag, ojämn vecka' })).toBe('Måndag, ojämn vecka')
  })
})
