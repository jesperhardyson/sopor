import { sortFractions } from './fractions.js'
import type { FractionId, PickupEvent, Schedule, SchedulePart } from './types.js'

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
