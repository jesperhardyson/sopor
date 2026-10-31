// Räknar ur ett sparat adressvar. "I dag" skickas in, så att svaret kan vara några timmar gammalt.

import type { SoporSchedule } from './api.mjs'
import { addDays, daysBetween, relativeDayLabel, shortDate } from './dates.mjs'

const NONE = 'Inga kommande hämtningar'

function upcoming(schedule: SoporSchedule, today: string) {
  return schedule.events.filter((event) => event.date >= today)
}

/** Fraktionerna i registrets ordning, och sist de som bara finns i events. */
export function fractionIds(schedule: SoporSchedule): string[] {
  const ids = new Set(Object.keys(schedule.fractions))
  for (const event of schedule.events) for (const id of event.fractions) ids.add(id)
  return [...ids]
}

export function fractionName(schedule: SoporSchedule, id: string): string {
  return schedule.fractions[id]?.name ?? id
}

/** Id för "någon fraktion" i flödeskortens autocomplete. */
export const ANY = '*'

/** Valen i flödeskortets fraktionsfält: "någon fraktion" först, sedan adressens fraktioner. */
export function fractionChoices(schedule: SoporSchedule, query: string, anyLabel: string): { id: string; name: string }[] {
  const choices = [{ id: ANY, name: anyLabel }, ...fractionIds(schedule).map((id) => ({ id, name: fractionName(schedule, id) }))]
  const q = query.trim().toLocaleLowerCase('sv')
  return choices.filter((choice) => choice.name.toLocaleLowerCase('sv').includes(q))
}

/** Fraktionerna som hämtas `daysAhead` dagar efter `today`. */
export function fractionsOn(schedule: SoporSchedule, today: string, daysAhead: number): string[] {
  const date = addDays(today, daysAhead)
  return schedule.events.filter((event) => event.date === date).flatMap((event) => event.fractions)
}

/** `fraction` null betyder "någon fraktion". */
export function collectedOn(schedule: SoporSchedule, today: string, daysAhead: number, fraction: string | null): boolean {
  const fractions = fractionsOn(schedule, today, daysAhead)
  return fraction === null ? fractions.length > 0 : fractions.includes(fraction)
}

export function nextDate(schedule: SoporSchedule, today: string, fraction: string): string | null {
  return upcoming(schedule, today).find((event) => event.fractions.includes(fraction))?.date ?? null
}

/** "Plast & metall": korta namn, versal bara först. */
function joinShort(schedule: SoporSchedule, ids: string[]): string {
  const names = ids.map((id, i) => {
    const short = schedule.fractions[id]?.short ?? id
    return i === 0 ? short : short.toLowerCase()
  })
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0]
}

/** "Plast & metall – i morgon", som API:ts `summary`. */
export function summary(schedule: SoporSchedule, today: string): string {
  const first = upcoming(schedule, today)[0]
  if (!first) return NONE
  return `${joinShort(schedule, first.fractions)} – ${relativeDayLabel(daysBetween(today, first.date))}`
}

/** Raden "I morgon" på enhetskortet: "Plast & metall" eller "Inget". */
export function tomorrowText(schedule: SoporSchedule, today: string): string {
  const ids = fractionsOn(schedule, today, 1)
  return ids.length ? joinShort(schedule, ids) : 'Inget'
}

/** Texten i enhetens rad för en fraktion. */
export function nextText(schedule: SoporSchedule, today: string, fraction: string): string {
  const date = nextDate(schedule, today, fraction)
  if (!date) return NONE
  const event = upcoming(schedule, today).find((e) => e.date === date)!
  return formatNext(daysBetween(today, date), date, event.estimated)
}

/**
 * Hur en kommande hämtning visas på enhetskortet, till exempel "i morgon" eller "om 4 dagar, ons 4 nov".
 * `estimated` är sant när källan inte har bekräftat datumet.
 */
export function formatNext(days: number, date: string, estimated: boolean): string {
  // TODO(Jesper): välj formatet. Raden nedan fungerar men visar varken veckodag eller "beräknat".
  void date, estimated, shortDate
  return relativeDayLabel(days)
}

/** Dagar till nästa hämtning av någon fraktion, eller null när inget väntar. */
export function daysToNext(schedule: SoporSchedule, today: string): number | null {
  const first = upcoming(schedule, today)[0]
  return first ? daysBetween(today, first.date) : null
}

export interface ScheduleChange {
  fraction: string
  /** Nästa datum före ändringen, null om fraktionen inte hade något */
  from: string | null
  to: string | null
  /** Källans förklaring till avvikelsen, om den finns */
  reason: string | null
}

/** Fraktioner vars nästa hämtning (från i dag) har flyttats, försvunnit eller tillkommit. */
export function scheduleChanges(before: SoporSchedule, after: SoporSchedule, today: string): ScheduleChange[] {
  const ids = [...new Set([...fractionIds(before), ...fractionIds(after)])]
  return ids.flatMap((fraction) => {
    const from = nextDate(before, today, fraction)
    const to = nextDate(after, today, fraction)
    if (from === to) return []
    const reason = (to && after.events.find((e) => e.date === to && e.fractions.includes(fraction))?.deviation?.reason) || null
    return [{ fraction, from, to, reason }]
  })
}

/** "Plastförpackningar flyttas från ons 4 nov till tors 5 nov" */
export function changeText(schedule: SoporSchedule, change: ScheduleChange): string {
  const name = fractionName(schedule, change.fraction)
  if (change.from && change.to) return `${name} flyttas från ${shortDate(change.from)} till ${shortDate(change.to)}`
  if (change.from) return `${name} hämtas inte ${shortDate(change.from)}`
  return `${name} hämtas ${shortDate(change.to!)}`
}
