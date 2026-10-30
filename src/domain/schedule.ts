import { daysBetween, weekdayIndex, WEEKDAYS } from './dates'
import { sortFractions } from './fractions'
import type { Bin, FractionId, PickupEvent, Schedule, SchedulePart } from './types'

/**
 * Slår ihop flera års scheman. Ett nyare år gäller från sitt validFrom; det
 * äldre årets händelser från och med det datumet kastas.
 */
export function mergeParts(parts: SchedulePart[]): Schedule {
  const sorted = [...parts].sort((a, b) => a.validFrom.localeCompare(b.validFrom))
  const byDate = new Map<string, PickupEvent>()

  sorted.forEach((part, i) => {
    const cutoff = sorted[i + 1]?.validFrom
    for (const event of part.events) {
      if (cutoff && event.date >= cutoff) continue
      const existing = byDate.get(event.date)
      byDate.set(
        event.date,
        existing
          ? {
              ...existing,
              ...event,
              fractions: sortFractions([...new Set([...existing.fractions, ...event.fractions])]),
            }
          : { ...event, fractions: sortFractions(event.fractions) },
      )
    }
  })

  const latest = sorted.at(-1)
  return {
    bins: latest?.bins ?? [],
    note: latest?.note,
    events: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    updatedAt: sorted.map((p) => p.updatedAt).sort().at(-1) ?? '',
  }
}

export function upcoming(schedule: Schedule, today: string): PickupEvent[] {
  return schedule.events.filter((e) => e.date >= today)
}

export function nextPickup(schedule: Schedule, today: string): PickupEvent | null {
  return upcoming(schedule, today)[0] ?? null
}

/** month är 1–12 */
export function eventsInMonth(schedule: Schedule, year: number, month: number): Map<string, FractionId[]> {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  return new Map(schedule.events.filter((e) => e.date.startsWith(prefix)).map((e) => [e.date, e.fractions]))
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function frequencyText(dates: string[]): string | undefined {
  if (dates.length < 2) return undefined
  const intervals = dates.slice(1).map((d, i) => daysBetween(dates[i], d))
  const weeks = Math.max(1, Math.round(median(intervals) / 7))
  const every = weeks === 1 ? 'Varje vecka' : weeks === 2 ? 'Varannan vecka' : `Var ${weeks}:e vecka`

  const counts = new Map<number, number>()
  for (const d of dates) counts.set(weekdayIndex(d), (counts.get(weekdayIndex(d)) ?? 0) + 1)
  const weekday = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  return `${every} · ${WEEKDAYS[weekday]}ar`
}

/** Kärlen i datan om de finns, annars en rad per fraktion härledd ur händelserna. */
export function displayBins(schedule: Schedule): Bin[] {
  if (schedule.bins.length > 0) return schedule.bins
  const datesByFraction = new Map<FractionId, string[]>()
  for (const e of schedule.events) {
    for (const f of e.fractions) datesByFraction.set(f, [...(datesByFraction.get(f) ?? []), e.date])
  }
  return sortFractions([...datesByFraction.keys()]).map((fraction) => {
    const text = frequencyText(datesByFraction.get(fraction)!)
    return text ? { fraction, frequencyText: text } : { fraction }
  })
}
