import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, relativeDayLabel, stockholmTime, todayInStockholm } from './dates.mjs'

describe('datum', () => {
  it('räknar dagar över månads- och årsskiften', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-10-31', '2026-11-04')).toBe(4)
  })

  it('påverkas inte av sommartidens slut', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })

  it('ger dagens datum i Stockholm, inte i UTC', () => {
    // 23:30 UTC den 31 oktober är 00:30 den 1 november i Stockholm (vintertid)
    expect(todayInStockholm(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01')
    expect(todayInStockholm(new Date('2026-10-31T22:30:00Z'))).toBe('2026-10-31')
  })

  it('skriver relativa dagar på svenska', () => {
    expect(relativeDayLabel(0)).toBe('i dag')
    expect(relativeDayLabel(1)).toBe('i morgon')
    expect(relativeDayLabel(4)).toBe('om 4 dagar')
  })

  it('ger klockslaget i Stockholm', () => {
    expect(stockholmTime(new Date('2026-10-31T17:05:00Z'))).toBe('18:05')
    expect(stockholmTime(new Date('2026-07-01T04:00:00Z'))).toBe('06:00')
  })
})
