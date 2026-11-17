/** Ett tillfälligt besked från källan, t.ex. att rutterna läggs om. Skrivs för hand på källan. */
export interface SourceMessage {
  /** Unikt och oföränderligt inom källan. Klienter minns vilka id:n de har visat, så det återanvänds aldrig. */
  id: string
  title: string
  text: string
  /** Källans egen sida om saken, om den finns. */
  url?: string
  /** Första och sista dagen meddelandet gäller, YYYY-MM-DD, båda inklusive. */
  validFrom: string
  validTo: string
}

const byStart = (a: SourceMessage, b: SourceMessage) => a.validFrom.localeCompare(b.validFrom) || a.id.localeCompare(b.id)

/** Meddelandena som gäller på datumet. */
export function messagesOn(messages: SourceMessage[] | undefined, date: string): SourceMessage[] {
  return (messages ?? []).filter((m) => m.validFrom <= date && date <= m.validTo).sort(byStart)
}

/** Meddelandena som gäller i dag. */
export const activeMessages = messagesOn

/** Meddelandena som gäller i dag och de som börjar senare. */
export function currentAndUpcoming(messages: SourceMessage[] | undefined, today: string): SourceMessage[] {
  return (messages ?? []).filter((m) => today <= m.validTo).sort(byStart)
}
