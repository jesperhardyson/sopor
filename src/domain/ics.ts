import { addDays, formatLong } from './dates.js'
import { FRACTIONS, sortFractions } from './fractions.js'
import type { Address, PickupEvent, Schedule } from './types.js'

export const DISCLAIMER = 'Inofficiell tjänst. Vid avvikelser gäller kommunens information.'
export const ESTIMATE_NOTE = 'Beräknat datum – helgdagar kan flytta tömningen. Kolla kommunens besked.'

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Viker en rad till högst 75 oktetter per rad utan att dela UTF-8-tecken. */
function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    const limit = parts.length === 0 ? 75 : 74 // fortsättningsrader börjar med ett mellanslag
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const compact = (date: string) => date.replaceAll('-', '')

export function deviationText(event: PickupEvent): string | undefined {
  const deviation = event.deviation
  if (!deviation) return undefined
  if (!deviation.originalDate) return `Avvikelse: ${deviation.reason}.`
  const { weekday, day, month } = formatLong(deviation.originalDate)
  return `Flyttad från ${weekday} ${day} ${month} (${deviation.reason}).`
}

export function buildIcs(input: {
  address: Address
  kommunName: string
  schedule: Schedule
  host?: string
}): string {
  const { address, kommunName, schedule, host = 'sopor.hardyson.se' } = input
  const stamp = `${compact(schedule.updatedAt)}T000000Z`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Sopor//${host}//SV`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`Sopor – ${address.street}, ${address.locality}`)}`,
    `X-WR-CALDESC:${escapeText(`Hämtschema för ${address.street}, ${address.locality} (${kommunName}). ${DISCLAIMER}`)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:P1D',
    'X-PUBLISHED-TTL:P1D',
  ]

  for (const event of schedule.events) {
    const names = sortFractions(event.fractions).map((f) => event.labels?.[f] ?? FRACTIONS[f].name)
    const summary = `Sopor: ${names.join(' + ')}${event.estimated ? ' (beräknat)' : ''}`
    const description = [event.warning, deviationText(event), event.estimated ? ESTIMATE_NOTE : undefined, DISCLAIMER]
      .filter(Boolean)
      .join('\n')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${address.id}-${event.date}@${host}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(event.date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(event.date, 1))}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(`I morgon: ${names.join(' + ')}`)}`,
      'TRIGGER:-PT6H',
      'END:VALARM',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/**
 * Kalender med en enda händelse som ber prenumeranten söka upp adressen igen. Används när en
 * live-källa inte längre hittar adressen, så att kalendern inte bara tyst slutar uppdateras.
 */
export function buildNoticeIcs(input: { addressId: string; today: string; host?: string }): string {
  const { addressId, today, host = 'sopor.hardyson.se' } = input
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Sopor//${host}//SV`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Sopor',
    'REFRESH-INTERVAL;VALUE=DURATION:P1D',
    'X-PUBLISHED-TTL:P1D',
    'BEGIN:VEVENT',
    `UID:${addressId}-saknas@${host}`,
    `DTSTAMP:${compact(today)}T000000Z`,
    `DTSTART;VALUE=DATE:${compact(today)}`,
    `DTEND;VALUE=DATE:${compact(addDays(today, 1))}`,
    `SUMMARY:${escapeText(`Sopor: adressen hittades inte – sök upp den igen på ${host}`)}`,
    `DESCRIPTION:${escapeText(`Avfallsbolaget hittar inte längre adressen som den här kalendern gäller. Sök upp den igen på https://${host} och lägg till kalendern på nytt.`)}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

