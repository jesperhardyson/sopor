import { describe, expect, it } from 'vitest'
import { nextPerFraction, pickupSummary } from './next.js'
import type { Schedule } from './types.js'

const schedule: Schedule = {
  bins: [],
  updatedAt: '2026-10-01',
  events: [
    { date: '2026-11-05', fractions: ['mat', 'rest'] },
    { date: '2026-11-12', fractions: ['papper'], estimated: true, warning: 'Kan flyttas.' },
    { date: '2026-11-19', fractions: ['rest'] },
  ],
}

describe('nextPerFraction', () => {
  it('ger närmaste hämtning per fraktion, sorterat på datum och ordning', () => {
    const next = nextPerFraction(schedule, '2026-11-04')
    expect(next.map((n) => [n.fraction, n.date, n.daysUntil, n.estimated])).toEqual([
      ['rest', '2026-11-05', 1, false],
      ['mat', '2026-11-05', 1, false],
      ['papper', '2026-11-12', 8, true],
    ])
  })

  it('bygger texten med fraktion, relativ dag och datum', () => {
    const next = nextPerFraction(schedule, '2026-11-04')
    expect(next[1].text).toBe('Matavfall – i morgon, torsdag 5 november')
    expect(next[2].text).toBe('Pappersförpackningar – om 8 dagar, torsdag 12 november')
  })

  it('räknar hämtdagen som 0 dagar och ignorerar passerade händelser', () => {
    const next = nextPerFraction(schedule, '2026-11-05')
    expect(next[0].daysUntil).toBe(0)
    expect(next[0].text.startsWith('Restavfall – i dag')).toBe(true)
    expect(nextPerFraction(schedule, '2026-11-06').some((n) => n.date < '2026-11-06')).toBe(false)
  })

  it('för med warning (annars null)', () => {
    const next = nextPerFraction(schedule, '2026-11-04')
    expect(next[0].warning).toBeNull()
    expect(next[2].warning).toBe('Kan flyttas.')
  })

  it('ger tom lista utan kommande hämtningar', () => {
    expect(nextPerFraction({ ...schedule, events: [] }, '2026-11-04')).toEqual([])
    expect(nextPerFraction(schedule, '2027-01-01')).toEqual([])
  })
})

describe('pickupSummary', () => {
  it('sammanfattar första kommande hämtning', () => {
    expect(pickupSummary(schedule, '2026-11-04')).toBe('Rest & mat – i morgon')
  })

  it('skriver tre fraktioner med komma och &', () => {
    const s: Schedule = { ...schedule, events: [{ date: '2026-11-05', fractions: ['mat', 'papper', 'rest'] }] }
    expect(pickupSummary(s, '2026-11-04')).toBe('Rest, papper & mat – i morgon')
  })

  it('hanterar en enda fraktion', () => {
    expect(pickupSummary(schedule, '2026-11-06')).toBe('Papper – om 6 dagar')
  })

  it('ger fast text när inget kommer', () => {
    expect(pickupSummary({ ...schedule, events: [] }, '2026-11-04')).toBe('Inga kommande hämtningar')
    expect(pickupSummary(schedule, '2027-01-01')).toBe('Inga kommande hämtningar')
  })
})
