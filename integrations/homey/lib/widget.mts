// Raderna i widgeten "Nästa hämtning": nästa hämtning per fraktion, tidigast först.

import type { SoporSchedule } from './api.mjs'
import { daysBetween, relativeDayLabel, shortDate } from './dates.mjs'
import { fractionIds, fractionName, nextDate } from './schedule.mjs'

export interface WidgetRow {
  fraction: string
  name: string
  /** Lucide-ikonens namn, null för fraktioner som saknas i registret */
  icon: string | null
  color: string | null
  /** "ons 4 nov" */
  date: string
  /** "i morgon", "om 4 dagar" */
  when: string
  /** I dag eller i morgon: raden markeras */
  soon: boolean
  estimated: boolean
}

export function widgetRows(schedule: SoporSchedule, today: string): WidgetRow[] {
  return fractionIds(schedule)
    .map((fraction) => ({ fraction, date: nextDate(schedule, today, fraction) }))
    .filter((row): row is { fraction: string; date: string } => row.date !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ fraction, date }) => {
      const days = daysBetween(today, date)
      const event = schedule.events.find((e) => e.date === date && e.fractions.includes(fraction))
      return {
        fraction,
        name: fractionName(schedule, fraction),
        icon: schedule.fractions[fraction]?.icon ?? null,
        color: schedule.fractions[fraction]?.color ?? null,
        date: shortDate(date),
        when: relativeDayLabel(days),
        soon: days <= 1,
        estimated: event?.estimated ?? false,
      }
    })
}
