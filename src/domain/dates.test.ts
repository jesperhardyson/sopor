import { describe, expect, it } from 'vitest'
import { daysBetween, formatLong, relativeDayLabel, secondsToStockholmMidnight, todayInStockholm, weekdayShort } from './dates'

describe('todayInStockholm', () => {
  it('räknar dagen i svensk tid, inte UTC', () => {
    expect(todayInStockholm(new Date('2026-10-30T23:30:00Z'))).toBe('2026-10-31')
    expect(todayInStockholm(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01')
    expect(todayInStockholm(new Date('2026-07-01T22:00:00Z'))).toBe('2026-07-02')
  })
})

describe('daysBetween', () => {
  it('räknar hela dagar, även över årsskifte och sommartid', () => {
    expect(daysBetween('2026-12-30', '2027-01-07')).toBe(8)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2026-11-11', '2026-10-30')).toBe(-12)
  })
})

describe('relativeDayLabel', () => {
  it('säger i dag, i morgon och om n dagar', () => {
    expect(relativeDayLabel(0)).toBe('i dag')
    expect(relativeDayLabel(1)).toBe('i morgon')
    expect(relativeDayLabel(12)).toBe('om 12 dagar')
  })
})

describe('formatLong / weekdayShort', () => {
  it('ger svenska namn', () => {
    expect(formatLong('2026-11-11')).toEqual({ weekday: 'onsdag', day: 11, month: 'november' })
    expect(weekdayShort('2027-01-07')).toBe('TOR')
  })
})

describe('formatShort', () => {
  it('ger kort datum som i designen', async () => {
    const { formatShort } = await import('./dates')
    expect(formatShort('2026-11-11')).toBe('Ons 11 nov')
    expect(formatShort('2026-11-03')).toBe('Tis 3 nov')
  })
})

describe('secondsToStockholmMidnight', () => {
  it('räknar till nästa midnatt i vintertid', () => {
    expect(secondsToStockholmMidnight(new Date('2026-10-30T22:59:00Z'))).toBe(60)
  })
  it('räknar till nästa midnatt i sommartid', () => {
    expect(secondsToStockholmMidnight(new Date('2026-07-01T21:00:00Z'))).toBe(3600)
  })
  it('klarar natten då klockan ställs fram', () => {
    // 01:30 CET, 2026-03-29. Nästa midnatt är 00:00 CEST = 22:00Z.
    expect(secondsToStockholmMidnight(new Date('2026-03-29T00:30:00Z'))).toBe(77_400)
  })
  it('klarar natten då klockan ställs tillbaka', () => {
    // 00:00 CEST, 2026-10-25. Nästa midnatt är 00:00 CET = 23:00Z, ett dygn på 25 timmar.
    expect(secondsToStockholmMidnight(new Date('2026-10-24T22:00:00Z'))).toBe(90_000)
  })
})
