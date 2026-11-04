// När kalenderfilens påminnelser kommer. Id:n med egen länk får aldrig ändras när de är publicerade,
// eftersom prenumerationer hänger på dem. Triggern räknas från händelsens början, midnatt.

export type ReminderId = 'kvall-18' | 'kvall-20' | 'morgon' | 'kvall-och-morgon'

export interface Reminder {
  label: string
  /** Inledningen i kalenderrutans notistext */
  sentence: string
  alarms: { trigger: string; prefix: string }[]
}

export const DEFAULT_REMINDER: ReminderId = 'kvall-18'

const EVENING_18 = { trigger: '-PT6H', prefix: 'I morgon' }
const MORNING_06 = { trigger: 'PT6H', prefix: 'I dag' }

export const REMINDERS: Record<ReminderId, Reminder> = {
  'kvall-18': {
    label: 'Kvällen innan, kl. 18',
    sentence: 'Påminnelsen kommer kvällen innan kl. 18.',
    alarms: [EVENING_18],
  },
  'kvall-20': {
    label: 'Kvällen innan, kl. 20',
    sentence: 'Påminnelsen kommer kvällen innan kl. 20.',
    alarms: [{ trigger: '-PT4H', prefix: 'I morgon' }],
  },
  morgon: {
    label: 'Samma morgon, kl. 06',
    sentence: 'Påminnelsen kommer samma morgon kl. 06.',
    alarms: [MORNING_06],
  },
  'kvall-och-morgon': {
    label: 'Kväll och morgon',
    sentence: 'Påminnelser kommer kvällen innan kl. 18 och samma morgon kl. 06.',
    alarms: [EVENING_18, MORNING_06],
  },
}

export const REMINDER_IDS: ReminderId[] = ['kvall-18', 'kvall-20', 'morgon', 'kvall-och-morgon']

/** Förvalet har ingen egen länk, så att varje val har precis en adress. */
export function reminderFromLink(value: string): ReminderId | undefined {
  return REMINDER_IDS.find((id) => id === value && id !== DEFAULT_REMINDER)
}
