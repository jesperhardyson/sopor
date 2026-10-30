import { describe, expect, it } from 'vitest'
import { holidayOn, swedishHolidays } from './holidays'

describe('swedishHolidays', () => {
  it('ger alla röda dagar och aftnar för 2026', () => {
    expect(swedishHolidays(2026)).toEqual([
      { date: '2026-01-01', name: 'nyårsdagen', kind: 'röd' },
      { date: '2026-01-06', name: 'trettondedag jul', kind: 'röd' },
      { date: '2026-04-03', name: 'långfredagen', kind: 'röd' },
      { date: '2026-04-04', name: 'påskafton', kind: 'afton' },
      { date: '2026-04-05', name: 'påskdagen', kind: 'röd' },
      { date: '2026-04-06', name: 'annandag påsk', kind: 'röd' },
      { date: '2026-05-01', name: 'första maj', kind: 'röd' },
      { date: '2026-05-14', name: 'Kristi himmelsfärdsdag', kind: 'röd' },
      { date: '2026-05-24', name: 'pingstdagen', kind: 'röd' },
      { date: '2026-06-06', name: 'nationaldagen', kind: 'röd' },
      { date: '2026-06-19', name: 'midsommarafton', kind: 'afton' },
      { date: '2026-06-20', name: 'midsommardagen', kind: 'röd' },
      { date: '2026-10-31', name: 'alla helgons dag', kind: 'röd' },
      { date: '2026-12-24', name: 'julafton', kind: 'afton' },
      { date: '2026-12-25', name: 'juldagen', kind: 'röd' },
      { date: '2026-12-26', name: 'annandag jul', kind: 'röd' },
      { date: '2026-12-31', name: 'nyårsafton', kind: 'afton' },
    ])
  })

  it('räknar ut påsk och rörliga helger för 2027', () => {
    const byName = Object.fromEntries(swedishHolidays(2027).map((h) => [h.name, h.date]))
    expect(byName['påskdagen']).toBe('2027-03-28')
    expect(byName['långfredagen']).toBe('2027-03-26')
    expect(byName['Kristi himmelsfärdsdag']).toBe('2027-05-06')
    expect(byName['pingstdagen']).toBe('2027-05-16')
    expect(byName['midsommardagen']).toBe('2027-06-26')
    expect(byName['alla helgons dag']).toBe('2027-11-06')
  })
})

describe('holidayOn', () => {
  it('hittar helgdagen för ett datum', () => {
    expect(holidayOn('2026-12-25')?.name).toBe('juldagen')
    expect(holidayOn('2026-12-24')?.kind).toBe('afton')
    expect(holidayOn('2026-11-11')).toBeUndefined()
  })
})
