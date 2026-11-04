import { describe, expect, it } from 'vitest'
import { areaForDate } from './areas'
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
