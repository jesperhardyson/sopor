import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import { expandEvery, expandWeekdays, weekRuleDates, type WeekRule } from './recurrence'

describe('expandWeekdays', () => {
  it('räknar två gånger i veckan på angivna veckodagar', () => {
    const r = expandWeekdays({ next: '2026-11-02', weekdays: [1, 4], months: 0.3 })
    expect(r.map((p) => p.date)).toEqual(['2026-11-02', '2026-11-05', '2026-11-09'])
    expect(r[1]).toEqual({ date: '2026-11-05', estimated: true })
  })

  it('varnar när ett beräknat datum hamnar på en helgdag, men flyttar det inte', () => {
    const r = expandWeekdays({ next: '2026-12-21', weekdays: [4], months: 1 })
    expect(r.find((p) => p.date === '2026-12-24')).toEqual({
      date: '2026-12-24',
      estimated: true,
      warning: 'Infaller på julafton – kan flyttas.',
    })
  })
})

describe('weekRuleDates', () => {
  const dates = (next: string, rule: WeekRule) => weekRuleDates(next, rule).map((p) => p.date)
  const MON = 1
  const TUE = 2
  const THU = 4

  it('räknar varje vecka i 12 månader och märker kommande datum som beräknade', () => {
    const r = weekRuleDates('2026-11-05', { weekday: THU, every: 1 })
    expect(r.slice(0, 2)).toEqual([
      { date: '2026-11-05', estimated: false },
      { date: '2026-11-12', estimated: true },
    ])
    expect(r.at(-1)!.date <= addDays('2026-11-05', 366)).toBe(true)
    expect(r.length).toBe(53)
  })

  it('följer udda veckor över vecka 53 och nyår', () => {
    const d = dates('2026-11-16', { weekday: MON, every: 2, parity: 'udda' })
    expect(d.slice(0, 6)).toEqual(['2026-11-16', '2026-11-30', '2026-12-14', '2026-12-28', '2027-01-04', '2027-01-18'])
    expect(d).not.toContain('2027-01-11')
    expect(d.at(-1)! > '2027-10-01').toBe(true)
  })

  it('följer jämna veckor över nyår', () => {
    const d = dates('2026-11-09', { weekday: MON, every: 2, parity: 'jämn' })
    expect(d).toContain('2026-12-21')
    expect(d).not.toContain('2026-12-28')
    expect(d).not.toContain('2027-01-04')
    expect(d).toContain('2027-01-11')
  })

  it('ger bara källans datum när veckans paritet inte stämmer', () => {
    expect(dates('2026-11-09', { weekday: MON, every: 2, parity: 'udda' })).toEqual(['2026-11-09'])
  })

  it('ger bara källans datum när veckodagen inte stämmer (flyttad vid helgdag)', () => {
    expect(dates('2026-12-23', { weekday: THU, every: 1 })).toEqual(['2026-12-23'])
    expect(dates('2026-12-23', { weekday: THU, every: 2, parity: 'udda' })).toEqual(['2026-12-23'])
  })

  it('kontrollerar inte veckodagen när regeln saknar den', () => {
    expect(dates('2026-11-04', { every: 2, parity: 'udda' })).toContain('2027-01-06')
  })

  it('räknar var 14:e dag i 12 månader när texten talar om dagar', () => {
    const d = dates('2026-11-03', { every: 2, fixedDays: true })
    expect(d).toContain('2026-12-29')
    expect(d).toContain('2027-01-12')
    expect(d.length).toBe(27)
  })

  it('räknar varannan vecka utan paritet bara till slutet av ISO-året', () => {
    expect(dates('2026-11-16', { weekday: MON, every: 2 })).toEqual(['2026-11-16', '2026-11-30', '2026-12-14', '2026-12-28'])
  })

  it('räknar var 4:e vecka bara till och med vecka 52', () => {
    expect(dates('2026-11-02', { weekday: MON, every: 4, startWeek: 1 })).toEqual(['2026-11-02', '2026-11-30'])
    expect(dates('2026-11-25', { every: 4, startWeek: 4 })).toEqual(['2026-11-25', '2026-12-23'])
    expect(dates('2026-11-05', { weekday: THU, every: 4 })).toEqual(['2026-11-05', '2026-12-03'])
  })

  it('visar källans datum i vecka 53 men räknar inte vidare in i nästa år', () => {
    expect(dates('2026-12-28', { weekday: MON, every: 4, startWeek: 1 })).toEqual(['2026-12-28'])
  })

  it('ger bara källans datum när veckan inte passar startveckan eller pariteten', () => {
    expect(dates('2026-11-03', { weekday: TUE, every: 4, startWeek: 2 })).toEqual(['2026-11-03'])
    expect(dates('2026-11-10', { weekday: TUE, every: 4, parity: 'udda' })).toEqual(['2026-11-10'])
  })

  it('räknar var 3:e vecka till slutet av ISO-året', () => {
    expect(dates('2026-11-05', { weekday: THU, every: 3 })).toEqual(['2026-11-05', '2026-11-26', '2026-12-17'])
  })

  it('räknar bara fram datum i säsongens månader', () => {
    const d = weekRuleDates('2026-11-04', { every: 1 }, { inMonths: [4, 5, 6, 7, 8, 9, 10, 11] }).map((p) => p.date)
    expect(d.filter((x) => ['12', '01', '02', '03'].includes(x.slice(5, 7)))).toEqual([])
    expect(d.find((x) => x > '2026-11-25')?.slice(0, 7)).toBe('2027-04')
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
