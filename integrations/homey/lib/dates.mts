// Datum är YYYY-MM-DD. Aritmetiken görs på UTC-midnatt, som i sajtens src/domain/dates.ts.

const DAY_MS = 86_400_000

const WEEKDAYS = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör']
const MONTHS = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec']

function toUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date).getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS)
}

export function todayInStockholm(now: Date = new Date()): string {
  // sv-SE formaterar som YYYY-MM-DD
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** "18:05", klockslaget i Stockholm */
export function stockholmTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
}

export function relativeDayLabel(days: number): string {
  if (days === 0) return 'i dag'
  if (days === 1) return 'i morgon'
  return `om ${days} dagar`
}

/** "ons 4 nov" */
export function shortDate(date: string): string {
  const d = toUtc(date)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
