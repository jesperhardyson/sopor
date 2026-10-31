import { describe, expect, it } from 'vitest'
import { isValidTime, reminderDue } from './reminder.mjs'

describe('påminnelsen', () => {
  const today = '2026-10-31'

  it('går när klockan passerat inställd tid', () => {
    expect(reminderDue({ now: '18:00', time: '18:00', today, lastFired: null })).toBe(true)
    expect(reminderDue({ now: '17:59', time: '18:00', today, lastFired: null })).toBe(false)
  })

  it('går bara en gång per dag', () => {
    expect(reminderDue({ now: '18:15', time: '18:00', today, lastFired: today })).toBe(false)
    expect(reminderDue({ now: '18:15', time: '18:00', today, lastFired: '2026-10-30' })).toBe(true)
  })

  it('tar igen en missad påminnelse i högst tre timmar', () => {
    expect(reminderDue({ now: '20:59', time: '18:00', today, lastFired: null })).toBe(true)
    expect(reminderDue({ now: '21:01', time: '18:00', today, lastFired: null })).toBe(false)
  })

  it('godtar bara klockslag som HH:MM', () => {
    expect(isValidTime('18:00')).toBe(true)
    expect(isValidTime('7:30')).toBe(false)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('18.00')).toBe(false)
  })
})
