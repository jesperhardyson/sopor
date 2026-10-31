import { describe, expect, it } from 'vitest'
import { expandPickups } from './recurrence'

describe('expandPickups', () => {
  it('räknar varannan vecka och märker kommande datum som beräknade', () => {
    const r = expandPickups({ next: '2026-11-11', perYear: 26, months: 1 })
    expect(r).toEqual([
      { date: '2026-11-11', estimated: false },
      { date: '2026-11-25', estimated: true },
      { date: '2026-12-09', estimated: true },
    ])
  })

  it('varnar när ett beräknat datum hamnar på en helgdag, men flyttar det inte', () => {
    const r = expandPickups({ next: '2026-12-17', perYear: 52, months: 1 })
    expect(r.find((p) => p.date === '2026-12-24')).toEqual({
      date: '2026-12-24',
      estimated: true,
      warning: 'Infaller på julafton – kan flyttas.',
    })
  })

  it('varnar inte för det bekräftade datumet', () => {
    expect(expandPickups({ next: '2026-12-25', perYear: 13, months: 0 })).toEqual([{ date: '2026-12-25', estimated: false }])
  })

  it('räknar var fjärde vecka', () => {
    expect(expandPickups({ next: '2026-11-04', perYear: 13, months: 2 }).map((p) => p.date)).toEqual([
      '2026-11-04',
      '2026-12-02',
      '2026-12-30',
    ])
  })

  it('räknar två gånger i veckan på angivna veckodagar', () => {
    const r = expandPickups({ next: '2026-11-02', perYear: 104, weekdays: [1, 4], months: 0.3 })
    expect(r.map((p) => p.date)).toEqual(['2026-11-02', '2026-11-05', '2026-11-09'])
  })

  it('ger bara nästa datum när frekvensen är okänd', () => {
    expect(expandPickups({ next: '2026-11-02', perYear: 0 })).toEqual([{ date: '2026-11-02', estimated: false }])
    expect(expandPickups({ next: '2026-11-02', perYear: 104 })).toEqual([{ date: '2026-11-02', estimated: false }])
  })

  it('räknar 12 månader framåt som standard', () => {
    const r = expandPickups({ next: '2026-11-11', perYear: 26 })
    expect(r.at(-1)!.date <= '2027-11-11').toBe(true)
    expect(r.length).toBe(27)
  })
})
