// När triggern "Sopor hämtas i morgon" ska gå. Klockslag är "HH:MM" i Stockholm.

/** Så länge efter inställd tid som en missad påminnelse (Homey var avstängd) ändå går. */
const CATCH_UP_MIN = 3 * 60

export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

export function reminderDue({ now, time, today, lastFired }: { now: string; time: string; today: string; lastFired: string | null }): boolean {
  if (lastFired === today) return false
  const late = minutes(now) - minutes(time)
  return late >= 0 && late <= CATCH_UP_MIN
}
