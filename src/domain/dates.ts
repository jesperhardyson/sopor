// Datum hanteras som YYYY-MM-DD. All aritmetik görs på UTC-midnatt så att
// sommartid och webbläsarens tidszon aldrig påverkar resultatet.

const DAY_MS = 86_400_000

export const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
export const MONTHS = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
]

export function toUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  return fromUtc(new Date(toUtc(date).getTime() + days * DAY_MS))
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && fromUtc(toUtc(date)) === date
}

export function todayInStockholm(now: Date = new Date()): string {
  // sv-SE formaterar som YYYY-MM-DD
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Stockholms UTC-offset i ms vid ögonblicket, ur "GMT+01:00". */
function stockholmOffsetMs(at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Stockholm', timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const [, sign, h, m] = name.match(/GMT([+-])(\d{2}):(\d{2})/) ?? []
  if (!sign) return 0
  return (sign === '-' ? -1 : 1) * (Number(h) * 60 + Number(m)) * 60_000
}

/** Sekunder till nästa midnatt i Stockholm (1–90000, längst när klockan ställs tillbaka). */
export function secondsToStockholmMidnight(now: Date = new Date()): number {
  const midnightUtc = toUtc(addDays(todayInStockholm(now), 1))
  // Offseten två timmar före midnatt ligger på samma sida om omställningen som midnatten.
  const offset = stockholmOffsetMs(new Date(midnightUtc.getTime() - 2 * 3_600_000))
  return Math.round((midnightUtc.getTime() - offset - now.getTime()) / 1000)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS)
}

export function relativeDayLabel(days: number): string {
  if (days === 0) return 'i dag'
  if (days === 1) return 'i morgon'
  return `om ${days} dagar`
}

export function weekdayIndex(date: string): number {
  return toUtc(date).getUTCDay()
}

export function formatLong(date: string): { weekday: string; day: number; month: string } {
  const d = toUtc(date)
  return { weekday: WEEKDAYS[d.getUTCDay()], day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()] }
}

export function weekdayShort(date: string): string {
  return WEEKDAYS[weekdayIndex(date)].slice(0, 3).toUpperCase()
}

export function monthShort(date: string): string {
  return MONTHS[toUtc(date).getUTCMonth()].slice(0, 3)
}

/** "Ons 11 nov" */
export function formatShort(date: string): string {
  const { weekday, day, month } = formatLong(date)
  return `${weekday[0].toUpperCase()}${weekday.slice(1, 3)} ${day} ${month.slice(0, 3)}`
}
