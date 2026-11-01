// Datum är YYYY-MM-DD. Aritmetiken görs på UTC-midnatt, som i sajtens src/domain/dates.ts.

const DAY_MS = 86_400_000

import { TEXTS, type Lang } from './texts.mjs'

export { languageOf, type Lang } from './texts.mjs'

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

export function relativeDayLabel(days: number, lang: Lang = 'sv'): string {
  const t = TEXTS[lang]
  if (days === 0) return t.today
  if (days === 1) return t.tomorrow
  return t.inDays(days)
}

/** "ons 4 nov", "Wed 4 Nov" */
export function shortDate(date: string, lang: Lang = 'sv'): string {
  const d = toUtc(date)
  const t = TEXTS[lang]
  return `${t.weekdays[d.getUTCDay()]} ${d.getUTCDate()} ${t.months[d.getUTCMonth()]}`
}
