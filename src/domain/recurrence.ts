import { addDays, isoWeek, weekdayIndex } from './dates.js'
import { holidayOn } from './holidays.js'

export interface ExpandedPickup {
  date: string
  /** false för datumet källan själv angett, true för framräknade */
  estimated: boolean
  warning?: string
}

const monthsEnd = (next: string, months: number) => addDays(next, Math.round(months * 30.44))

/** Tömningar på vissa ISO-veckodagar (1 = måndag … 7 = söndag), t.ex. två gånger i veckan (EDP). */
export function expandWeekdays(input: { next: string; weekdays: number[]; months?: number }): ExpandedPickup[] {
  const { next, weekdays, months = 12 } = input
  const end = monthsEnd(next, months)
  const dates: string[] = []
  for (let d = next; d <= end; d = addDays(d, 1)) {
    if (d === next || weekdays.includes(((weekdayIndex(d) + 6) % 7) + 1)) dates.push(d)
  }
  return withWarnings(dates, next)
}

/** En tömning var `every`:e vecka, som källan beskriver den (EDP, VA Syd och Stockholm). */
export interface WeekRule {
  /** 0 = söndag, som `weekdayIndex`. Saknas den kontrolleras inte källans veckodag. */
  weekday?: number
  every: 1 | 2 | 3 | 4
  /** ISO-veckans paritet */
  parity?: 'jämn' | 'udda'
  /** Första veckan på året, för var 4:e vecka */
  startWeek?: number
  /** Fast steg i 12 månader, oberoende av veckonumren ("Var 14:e dag") */
  fixedDays?: boolean
}

/**
 * Kommande tömningar enligt regeln (docs/specs/2026-11-03-vecka-53.md). Jämna och udda veckor följer
 * ISO-veckan, även över vecka 53. Utan paritet räknas bara till slutet av ISO-året, eftersom vi inte
 * vet hur kommunen räknar efter nyår, och var 4:e vecka bara till och med vecka 52. Stämmer källans
 * datum inte med veckodagen, pariteten eller startveckan (flyttat vid en helgdag) visas bara det.
 */
export function weekRuleDates(next: string, rule: WeekRule, opts: { inMonths?: number[] } = {}): ExpandedPickup[] {
  const only: ExpandedPickup[] = [{ date: next, estimated: false }]
  const { year, week } = isoWeek(next)
  const parity = rule.parity && (rule.parity === 'jämn' ? 0 : 1)
  if (rule.weekday !== undefined && weekdayIndex(next) !== rule.weekday) return only
  if (parity !== undefined && week % 2 !== parity) return only
  if (rule.startWeek !== undefined && (week - rule.startWeek) % rule.every !== 0) return only

  if (rule.every === 1 || rule.fixedDays) return expandEvery({ next, stepDays: 7 * rule.every, ...opts })
  if (rule.every === 2 && parity !== undefined) {
    return expandEvery({ next, stepDays: 7, ...opts }).filter((p) => isoWeek(p.date).week % 2 === parity)
  }
  const lastWeek = rule.every === 4 ? 52 : 53
  return expandEvery({ next, stepDays: 7 * rule.every, ...opts }).filter((p) => {
    const w = isoWeek(p.date)
    return p.date === next || (w.year === year && w.week <= lastWeek)
  })
}

/**
 * Källans eget datum är bekräftat. Framräknade datum på en röd dag eller helgdagsafton får en
 * varning men flyttas inte, eftersom vi inte vet hur kommunen hanterar just den dagen.
 */
function withWarnings(dates: string[], next: string): ExpandedPickup[] {
  return dates.map((date) => {
    if (date === next) return { date, estimated: false }
    const holiday = holidayOn(date)
    return holiday
      ? { date, estimated: true, warning: `Infaller på ${holiday.name} – kan flyttas.` }
      : { date, estimated: true }
  })
}

/**
 * Var `stepDays`:e dag från `next` i `months` månader (Stockholm m.fl.). Med `inMonths` (1–12)
 * räknas bara datum i de månaderna, för tömningar med säsong som "april-nov".
 */
export function expandEvery(input: { next: string; stepDays: number; months?: number; inMonths?: number[] }): ExpandedPickup[] {
  const { next, stepDays, months = 12, inMonths } = input
  const end = monthsEnd(next, months)
  const dates: string[] = []
  for (let d = next; d <= end; d = addDays(d, stepDays)) {
    if (d === next || !inMonths || inMonths.includes(Number(d.slice(5, 7)))) dates.push(d)
  }
  return withWarnings(dates, next)
}
