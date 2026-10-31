import { daysBetween, formatLong, relativeDayLabel } from './dates.js'
import { FRACTIONS, sortFractions } from './fractions.js'
import { upcoming } from './schedule.js'
import type { FractionId, Schedule } from './types.js'

export interface NextPickup {
  fraction: FractionId
  date: string
  daysUntil: number
  estimated: boolean
  warning: string | null
  /** "Matavfall – i morgon, torsdag 5 november" */
  text: string
}

function pickupText(fraction: FractionId, date: string, daysUntil: number): string {
  const { weekday, day, month } = formatLong(date)
  return `${FRACTIONS[fraction].name} – ${relativeDayLabel(daysUntil)}, ${weekday} ${day} ${month}`
}

export function nextPerFraction(schedule: Schedule, today: string): NextPickup[] {
  const seen = new Set<FractionId>()
  const result: NextPickup[] = []
  for (const event of upcoming(schedule, today)) {
    const daysUntil = daysBetween(today, event.date)
    for (const fraction of sortFractions(event.fractions)) {
      if (seen.has(fraction)) continue
      seen.add(fraction)
      result.push({
        fraction,
        date: event.date,
        daysUntil,
        estimated: event.estimated ?? false,
        warning: event.warning ?? null,
        text: pickupText(fraction, event.date, daysUntil),
      })
    }
  }
  return result
}

/** "Rest & mat – i morgon", eller "Inga kommande hämtningar" */
export function pickupSummary(schedule: Schedule, today: string): string {
  const first = upcoming(schedule, today)[0]
  if (!first) return 'Inga kommande hämtningar'
  const names = sortFractions(first.fractions).map((f, i) => (i === 0 ? FRACTIONS[f].short : FRACTIONS[f].short.toLowerCase()))
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0]
  return `${joined} – ${relativeDayLabel(daysBetween(today, first.date))}`
}
