// Ett sopkärl är en del av en adress: de avfallstyper som användaren valt. Kärlet räknar ur adressens sparade schema.

import type { SoporSchedule } from './api.mjs'
import { daysBetween, type Lang } from './dates.mjs'
import { KNOWN_FRACTIONS, formatNext, fractionIds, joinShort, withoutFractions } from './schedule.mjs'
import { TEXTS } from './texts.mjs'

/** Ikonerna i drivers/karl/assets/icons. "standard" är drivrutinens egen ikon. */
const ICONS = ['rest', 'mat', 'papper', 'plast', 'glas', 'metall', 'tidningar']

/** Kärlets avfallstyper: de ikryssade kända typerna och de okända som valdes vid parningen. */
export function binFractions(settings: Record<string, unknown>, stored: string[]): string[] {
  const known = KNOWN_FRACTIONS.filter((id) => settings[`ingar_${id}`] === true)
  return [...known, ...stored.filter((id) => !KNOWN_FRACTIONS.includes(id))]
}

/** Schemat med bara kärlets avfallstyper. Ett flerfackskärl töms när någon av dem hämtas. */
export function binSchedule(schedule: SoporSchedule, fractions: string[]): SoporSchedule {
  return withoutFractions(schedule, fractionIds(schedule).filter((id) => !fractions.includes(id)))
}

function nextEvent(schedule: SoporSchedule, today: string) {
  return schedule.events.find((event) => event.date >= today) ?? null
}

/** Raden "Nästa tömning", i samma form som adressens rader. */
export function binNextText(schedule: SoporSchedule, today: string, lang: Lang = 'sv'): string {
  const event = nextEvent(schedule, today)
  return event ? formatNext(daysBetween(today, event.date), event.date, event.estimated, lang) : TEXTS[lang].none
}

export function binDaysToNext(schedule: SoporSchedule, today: string): number | null {
  const event = nextEvent(schedule, today)
  return event ? daysBetween(today, event.date) : null
}

/** Tömningen som "Utställt" gäller. Utan kommande tömning gäller det i dag. */
export function putOutDate(schedule: SoporSchedule, today: string): string {
  return nextEvent(schedule, today)?.date ?? today
}

/** "Utställt" slås av natten efter tömningsdagen. */
export function shouldReset(putOutFor: string | null, today: string): boolean {
  return putOutFor !== null && today > putOutFor
}

/** "Plast & metall": de valda avfallstyperna i schemats ordning. */
export function suggestedName(schedule: SoporSchedule, fractions: string[]): string {
  const ids = fractionIds(schedule).filter((id) => fractions.includes(id))
  return ids.length ? joinShort(schedule, ids) : ''
}

/** En avfallstyp ger dess ikon, flera (eller kärl med flera fack) ger flerfack. */
export function suggestedIcon(fractions: string[]): string {
  if (fractions.length > 1 || fractions.includes('karl')) return 'flerfack'
  return fractions.length && ICONS.includes(fractions[0]) ? fractions[0] : 'standard'
}

/** Ikonens sökväg för `Homey.createDevice`, relativ till drivers/karl/assets. Standard är drivrutinens ikon. */
export function iconPath(icon: string): string | undefined {
  return [...ICONS, 'flerfack'].includes(icon) ? `/icons/${icon}.svg` : undefined
}

/** `data.id` för ett kärl: adressens id och en slumpad del, så att samma adress kan ha flera kärl. */
export const binId = (addressId: string, random: string) => `${addressId}/${random}`
