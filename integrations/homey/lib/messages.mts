import type { SoporMessage, SoporSchedule } from './api.mjs'

/** Källans meddelanden som gäller i dag. Svaret kan vara sex timmar gammalt, så datumen kontrolleras här. */
export function activeMessages(schedule: SoporSchedule, today: string): SoporMessage[] {
  return (schedule.messages ?? []).filter((m) => m.validFrom <= today && today <= m.validTo)
}

/**
 * Meddelanden som gäller i dag och som enheten inte sett förut. `seen` är nycklarna `<källa>/<id>` som
 * redan skickats till flödena. Den nya listan har de gamla och de nya, så att varje meddelande går en gång.
 */
export function newMessages(schedule: SoporSchedule, today: string, seen: string[]): { fresh: SoporMessage[]; seen: string[] } {
  const key = (m: SoporMessage) => `${schedule.address.source}/${m.id}`
  const fresh = activeMessages(schedule, today).filter((m) => !seen.includes(key(m)))
  return { fresh, seen: [...seen, ...fresh.map(key)] }
}

/** Texten för enhetens varning, eller null när inget meddelande gäller. */
export function warningText(messages: SoporMessage[]): string | null {
  return messages.length ? messages.map((m) => `${m.title}: ${m.text}`).join('\n') : null
}
