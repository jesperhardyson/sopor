import { addDays, fromUtc } from './dates'

export interface Holiday {
  date: string
  name: string
  /** röd = allmän helgdag enligt lag (1989:253), afton = de facto ledig helgdagsafton */
  kind: 'röd' | 'afton'
}

/** Påskdagen enligt den anonyma gregorianska algoritmen. */
function easter(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return fromUtc(new Date(Date.UTC(year, month - 1, day)))
}

/** Första lördagen från och med ett datum. */
function saturdayFrom(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() // 6 = lördag
  return addDays(date, (6 - weekday + 7) % 7)
}

const cache = new Map<number, Holiday[]>()

export function swedishHolidays(year: number): Holiday[] {
  const cached = cache.get(year)
  if (cached) return cached
  const e = easter(year)
  const midsommar = saturdayFrom(`${year}-06-20`)
  const holidays: Holiday[] = [
    { date: `${year}-01-01`, name: 'nyårsdagen', kind: 'röd' },
    { date: `${year}-01-06`, name: 'trettondedag jul', kind: 'röd' },
    { date: addDays(e, -2), name: 'långfredagen', kind: 'röd' },
    { date: addDays(e, -1), name: 'påskafton', kind: 'afton' },
    { date: e, name: 'påskdagen', kind: 'röd' },
    { date: addDays(e, 1), name: 'annandag påsk', kind: 'röd' },
    { date: `${year}-05-01`, name: 'första maj', kind: 'röd' },
    { date: addDays(e, 39), name: 'Kristi himmelsfärdsdag', kind: 'röd' },
    { date: addDays(e, 49), name: 'pingstdagen', kind: 'röd' },
    { date: `${year}-06-06`, name: 'nationaldagen', kind: 'röd' },
    { date: addDays(midsommar, -1), name: 'midsommarafton', kind: 'afton' },
    { date: midsommar, name: 'midsommardagen', kind: 'röd' },
    { date: saturdayFrom(`${year}-10-31`), name: 'alla helgons dag', kind: 'röd' },
    { date: `${year}-12-24`, name: 'julafton', kind: 'afton' },
    { date: `${year}-12-25`, name: 'juldagen', kind: 'röd' },
    { date: `${year}-12-26`, name: 'annandag jul', kind: 'röd' },
    { date: `${year}-12-31`, name: 'nyårsafton', kind: 'afton' },
  ].sort((x, y) => x.date.localeCompare(y.date)) as Holiday[]
  cache.set(year, holidays)
  return holidays
}

export function holidayOn(date: string): Holiday | undefined {
  return swedishHolidays(Number(date.slice(0, 4))).find((h) => h.date === date)
}
