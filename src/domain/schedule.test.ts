import { describe, expect, it } from 'vitest'
import { displayBins, eventsInMonth, mergeParts, nextPickup, upcoming } from './schedule'
import type { PickupEvent, Schedule, SchedulePart } from './types'
import { sortFractions } from './fractions'

const part = (over: Partial<SchedulePart>): SchedulePart => ({
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  bins: [],
  events: [],
  updatedAt: '2026-01-01',
  ...over,
})

const villa: Schedule = {
  bins: [],
  updatedAt: '2026-10-29',
  events: [
    { date: '2026-11-11', fractions: ['rest', 'mat'] },
    { date: '2026-11-25', fractions: ['papper', 'mat'] },
    { date: '2026-12-09', fractions: ['plast', 'mat'] },
    { date: '2026-12-23', fractions: ['rest', 'mat'] },
  ],
}

describe('sortFractions', () => {
  it('följer registrets ordning', () => {
    expect(sortFractions(['metall', 'mat', 'rest'])).toEqual(['rest', 'metall', 'mat'])
  })
})

describe('mergeParts', () => {
  it('låter det nyare året gälla från sitt validFrom', () => {
    const y2026 = part({
      validTo: '2027-01-10',
      note: 'gammal',
      bins: [{ fraction: 'rest' }],
      updatedAt: '2026-10-29',
      events: [
        { date: '2026-12-23', fractions: ['rest'] },
        { date: '2027-01-07', fractions: ['papper'] },
      ],
    })
    const y2027 = part({
      validFrom: '2027-01-01',
      validTo: '2027-12-31',
      note: 'ny',
      bins: [{ fraction: 'mat' }],
      updatedAt: '2026-12-15',
      events: [{ date: '2027-01-05', fractions: ['mat'] }],
    })
    const merged = mergeParts([y2027, y2026])
    expect(merged.events.map((e) => e.date)).toEqual(['2026-12-23', '2027-01-05'])
    expect(merged.note).toBe('ny')
    expect(merged.bins).toEqual([{ fraction: 'mat' }])
    expect(merged.updatedAt).toBe('2026-12-15')
  })

  it('slår ihop händelser samma datum till en', () => {
    const merged = mergeParts([
      part({
        events: [
          { date: '2026-11-11', fractions: ['mat'] },
          { date: '2026-11-11', fractions: ['rest', 'mat'] },
        ],
      }),
    ])
    expect(merged.events).toEqual([{ date: '2026-11-11', fractions: ['rest', 'mat'] }])
  })
})

describe('upcoming / nextPickup', () => {
  it('räknar dagens tömning som kommande', () => {
    expect(nextPickup(villa, '2026-11-11')?.date).toBe('2026-11-11')
    expect(upcoming(villa, '2026-11-12').map((e) => e.date)).toEqual(['2026-11-25', '2026-12-09', '2026-12-23'])
  })

  it('ger null när alla datum har passerat', () => {
    expect(upcoming(villa, '2027-02-01')).toEqual([])
    expect(nextPickup(villa, '2027-02-01')).toBeNull()
  })
})

describe('eventsInMonth', () => {
  it('ger fraktioner per datum i månaden', () => {
    const nov = eventsInMonth(villa, 2026, 11)
    expect([...nov.keys()]).toEqual(['2026-11-11', '2026-11-25'])
    expect(nov.get('2026-11-25')).toEqual(['papper', 'mat'])
  })
})

describe('displayBins', () => {
  it('använder kärlen i datan när de finns', () => {
    const bins = [{ fraction: 'rest' as const, sizeLiters: 190 }]
    expect(displayBins({ ...villa, bins })).toEqual(bins)
  })

  it('härleder kärl och frekvens ur händelserna', () => {
    const events: PickupEvent[] = []
    for (let i = 0; i < 8; i++) {
      const d = new Date(Date.UTC(2026, 9, 7 + i * 14)).toISOString().slice(0, 10)
      events.push({ date: d, fractions: i % 2 === 0 ? ['rest', 'mat'] : ['mat'] })
    }
    expect(displayBins({ bins: [], events, updatedAt: '2026-10-01' })).toEqual([
      { fraction: 'rest', frequencyText: 'Var 4:e vecka · onsdagar' },
      { fraction: 'mat', frequencyText: 'Varannan vecka · onsdagar' },
    ])
  })

  it('utelämnar frekvens när det bara finns ett datum', () => {
    const s: Schedule = { bins: [], updatedAt: '', events: [{ date: '2026-11-11', fractions: ['glas'] }] }
    expect(displayBins(s)).toEqual([{ fraction: 'glas' }])
  })
})
