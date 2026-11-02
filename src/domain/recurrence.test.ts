import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import { expandEvery, expandPickups } from './recurrence'

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

describe('expandEvery', () => {
  it('räknar fram var 14:e dag i ett år, med källans datum först', () => {
    const dates = expandEvery({ next: '2026-11-04', stepDays: 14 })
    expect(dates[0]).toEqual({ date: '2026-11-04', estimated: false })
    expect(dates[1]).toEqual({ date: '2026-11-18', estimated: true })
    expect(dates.at(-1)!.date <= addDays('2026-11-04', 365)).toBe(true)
    expect(dates.length).toBeGreaterThan(25)
  })

  it('räknar bara fram datum i säsongens månader', () => {
    const dates = expandEvery({ next: '2026-11-11', stepDays: 14, inMonths: [4, 5, 6, 7, 8, 9, 10, 11] }).map((d) => d.date)
    expect(dates.filter((d) => ['12', '01', '02', '03'].includes(d.slice(5, 7)))).toEqual([])
    const after = dates.find((d) => d > '2026-11-25')
    expect(after?.slice(0, 7)).toBe('2027-04')
  })

  it('varnar för beräknade datum på helgdagar', () => {
    const christmas = expandEvery({ next: '2026-12-11', stepDays: 14 }).find((d) => d.date === '2026-12-25')
    expect(christmas).toEqual({ date: '2026-12-25', estimated: true, warning: 'Infaller på juldagen – kan flyttas.' })
  })
})
