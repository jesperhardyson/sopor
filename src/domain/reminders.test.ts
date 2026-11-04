import { describe, expect, it } from 'vitest'
import { DEFAULT_REMINDER, REMINDER_IDS, REMINDERS, reminderFromLink } from './reminders'

describe('reminderFromLink', () => {
  it('godtar valen som har en egen länk', () => {
    for (const id of ['kvall-20', 'morgon', 'kvall-och-morgon']) expect(reminderFromLink(id)).toBe(id)
  })

  it('godtar varken förvalet, okända värden eller ärvda namn', () => {
    for (const value of ['kvall-18', '', 'MORGON', 'constructor', '__proto__', 'toString']) {
      expect(reminderFromLink(value)).toBeUndefined()
    }
  })
})

describe('REMINDERS', () => {
  it('börjar med förvalet och har fyra val', () => {
    expect(REMINDER_IDS).toEqual(['kvall-18', 'kvall-20', 'morgon', 'kvall-och-morgon'])
    expect(DEFAULT_REMINDER).toBe('kvall-18')
    expect(REMINDERS[DEFAULT_REMINDER].label).toBe('Kvällen innan, kl. 18')
  })
})
